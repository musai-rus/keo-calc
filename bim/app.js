/* КЕО по модели — запуск в окне Autodesk Viewer: анализ, подсветка помещений на плане, метки, таблица и разбор. */
const KeoBim = (function () {
  const G = BimGeom, Cc = BimCalc, LIB = { DATA, Engine, Report, Schemes, KEO };
  const f2 = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' : Number(x).toFixed(n).replace('.', ',');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const COL = { ok: '#2e9d5b', bad: '#d9443a', none: '#8a94a0', err: '#c99a06' };

  const S = {
    cell: 0.05, cut: 1.0, bGroup: '', rho: 0.55, t1: 3, t2: 0, t4: 0, rhoF: 0.4, region: 'г. Москва', group: 1,
    exclude: 'лестни|\\bЛК\\b|коридор|холл|вестибюл', glassExclude: 'stemalit|эмал', code: '', object: ''
  };
  let st = { levels: [], res: [], sel: null, filter: 'all', level: null, plan: false };
  let C, cat, ui, overlay = 'keo-bim', labelsEl;

  /* ---------- анализ ---------- */
  async function analyze(progress) {
    const v = window.NOP_VIEWER; if (!v || !v.model || v.model.is2d()) throw new Error('Откройте 3D-вид модели');
    C = G.ctx(v); progress('Каталог элементов…');
    cat = await G.catalog(C);
    const rooms = await G.rooms(C);
    const aec = await Autodesk.Viewing.Document.getAecModelData(C.m.getDocumentNode()).catch(() => null);
    const T = aec && aec.refPointTransformation;
    const lv = (aec && aec.levels || []).map(l => ({ name: l.name, floor: (l.elevation - C.GZ) * C.S })).sort((a, b) => a.floor - b.floor);
    lv.forEach((l, i) => { l.top = i < lv.length - 1 ? lv[i + 1].floor : l.floor + 6; l.rooms = rooms.filter(r => r.level === l.name); });
    const levels = lv.filter(l => l.rooms.length);
    progress('Проёмы…');
    const ops = G.openings(C, cat, S.glassExclude ? new RegExp(S.glassExclude, 'i') : null);
    progress('Карта высот для затенения…');
    const bb = C.m.getBoundingBox(), box = [bb.min.x * C.S - 5, bb.min.y * C.S - 5, bb.max.x * C.S + 5, bb.max.y * C.S + 5];
    const skip = /Planting|Furniture|Mechanical Equipment|Plumbing|Specialty|Lines|Grids|Level|Room Separation|Sun Path|Area|Rooms/;
    const HM = G.heightMap(C, cat, Object.keys(cat.byCat).filter(c => !skip.test(c)), 0.5, box);
    const group = S.bGroup || Cc.guessGroup(rooms.map(r => r.name), LIB.DATA.rooms);
    const exRe = S.exclude ? new RegExp(S.exclude, 'i') : null;
    const res = [];
    for (const L of levels) {
      progress(`Уровень ${L.name}: срез и контуры помещений…`); await tick();
      const bcats = ['Revit Walls', 'Revit Curtain Panels', 'Revit Curtain Wall Mullions', 'Revit Doors', 'Revit Windows', 'Revit Structural Columns', 'Revit Columns'];
      const segs = G.slice(C, cat, bcats, L.floor + S.cut).concat(G.slice(C, cat, ['Revit <Room Separation>'], L.floor + S.cut, [L.floor, 0.6]));
      const R = G.raster(segs, S.cell); L.R = R;
      G.matchRooms(R, L.rooms);
      G.markExterior(C, R, L.floor + S.cut);
      L.assign = G.assign(R, ops, L.floor, L.top);
      const lops = ops.filter(o => o.room && o.floor === L.floor);
      const byRoom = new Map(); lops.forEach(o => { if (!byRoom.has(o.room.id)) byRoom.set(o.room.id, []); byRoom.get(o.room.id).push(o); });
      const target = L.rooms.filter(r => r.reg && !(exRe && exRe.test(r.name || '')));
      const cells = G.regionCells(R, target.map(r => r.reg), 4);
      L.cells = cells;
      progress(`Уровень ${L.name}: расчёт ${target.length} помещений…`); await tick();
      for (const rm of target) {
        const o = byRoom.get(rm.id);
        const base = { rm, level: L.name, floor: L.floor, runs: cells.runs.get(rm.reg) };
        if (!o) { res.push({ ...base, kind: 'dark' }); continue; }
        const normRow = Cc.mapNorm(rm.name, LIB.DATA.rooms, group);
        const env = { KEO: LIB.KEO, settings: { ...S, bGroup: group }, floor: L.floor, pts: cells.pts.get(rm.reg), normRow, T,
          shade: (f, A, w) => shade(f, A, HM, L.floor) };
        let r; try { r = Cc.room(rm, o, env); } catch (e) { r = { rm, err: 'ошибка: ' + e.message }; }
        res.push({ ...base, ...r, env, kind: r.err ? 'err' : 'calc', ops: o });
      }
      // помещения уровня, для которых контур не найден
      L.rooms.filter(r => !r.reg && !(exRe && exRe.test(r.name || ''))).forEach(rm => res.push({ rm, level: L.name, floor: L.floor, kind: 'nogeo' }));
    }
    st.levels = levels; st.res = res; st.group = group; st.T = T; st.ops = ops;
    return res;
  }
  const tick = () => new Promise(r => setTimeout(r, 0));
  function shade(f, A, HM, floor) {
    const cl = f.cls.reduce((m, c) => c.bo * (c.z1 - c.z0) > m.bo * (m.z1 - m.z0) ? c : m);
    const kDepth = G.overhang(C, { c: cl.c, nin: f.nin, dOut: cl.dOut }, cl.z1);
    const nout = [-f.nin[0], -f.nin[1]];
    const P0 = [f.O[0] - f.nin[0] * f.dst, f.O[1] - f.nin[1] * f.dst];
    const z0 = Math.min(...f.cls.map(c => c.z0)), z1 = Math.max(...f.cls.map(c => c.z1)), zc = (z0 + z1) / 2;
    const d0 = kDepth + 0.4;
    const samples = G.skyline(HM, P0, nout, f.t, zc, d0, 5);
    const vP0 = (P0[0] - A[0]) * f.t[0] + (P0[1] - A[1]) * f.t[1];
    const blds = Cc.buildings(samples, floor, vP0, S.rhoF, d0);
    return { kDepth, blds, samples, P0, zc };
  }

  /* ---------- статус помещения ---------- */
  function status(r) {
    if (r.kind === 'dark') return { k: 'none', t: 'нет наружных проёмов' };
    if (r.kind === 'nogeo') return { k: 'none', t: 'контур не найден' };
    if (r.kind === 'err') return { k: 'err', t: r.err };
    if (!r.C || !r.C.ok) return { k: 'err', t: (r.C && r.C.err || []).join('; ') || 'ошибка данных' };
    if (r.C.normOk === null) return { k: 'none', t: 'не нормируется' };
    return r.C.pass ? { k: 'ok', t: 'соответствует' } : { k: 'bad', t: 'не соответствует' };
  }
  const eOf = r => r.C && r.C.ok ? r.C.res.eFinal : null;

  /* ---------- оверлей в 3D: заливка помещений, точки, метки ---------- */
  function draw() {
    const v = C.v, Sx = C.S;
    if (v.overlays.hasScene(overlay)) v.overlays.removeScene(overlay);
    v.overlays.addScene(overlay);
    st.res.forEach(r => {
      if (!r.runs || !r.runs.length) return;
      const s = status(r), col = new THREE.Color(COL[s.k]);
      const pos = [], z = (r.floor + 0.04) / Sx;
      r.runs.forEach(q => { const x0 = q[0] / Sx, x1 = q[1] / Sx, y0 = q[2] / Sx, y1 = q[3] / Sx; pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z); });
      const g = new THREE.BufferGeometry(); g.setAttribute ? g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)) : g.addAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      const sel = st.sel === r;
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: sel ? 0.75 : (r.kind === 'calc' ? 0.5 : 0.22), side: THREE.DoubleSide, depthWrite: false }));
      mesh.renderOrder = 10; v.overlays.addMesh(mesh, overlay);
      if (r.A) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12 / Sx, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1b2329 }));
        dot.position.set(r.A[0] / Sx, r.A[1] / Sx, (r.floor + 0.1) / Sx); v.overlays.addMesh(dot, overlay);
      }
    });
    labels();
    v.impl.invalidate(true, true, true);
  }
  function labels() {
    const v = C.v;
    if (!labelsEl) { labelsEl = document.createElement('div'); labelsEl.id = 'keo-labels'; v.container.appendChild(labelsEl); v.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, place); }
    labelsEl.innerHTML = st.res.filter(r => r.kind === 'calc' && (st.level === null || r.level === st.level) && pass(r)).map((r, i) => {
      const s = status(r), e = eOf(r);
      return `<button class="kl kl-${s.k}${st.sel === r ? ' on' : ''}" data-i="${st.res.indexOf(r)}" title="${esc(r.rm.num + ' ' + r.rm.name)}"><b>${esc(r.rm.num)}</b> ${e === null ? '—' : f2(e)}%</button>`;
    }).join('');
    labelsEl.querySelectorAll('.kl').forEach(b => b.onclick = ev => { ev.stopPropagation(); select(st.res[+b.dataset.i], false); });
    place();
  }
  function place() {
    if (!labelsEl) return; const v = C.v;
    labelsEl.querySelectorAll('.kl').forEach(b => {
      const r = st.res[+b.dataset.i]; const p = r.A || centroid(r); if (!p) return;
      const sc = v.worldToClient(new THREE.Vector3(p[0] / C.S, p[1] / C.S, (r.floor + 0.1) / C.S));
      b.style.transform = `translate(${Math.round(sc.x)}px, ${Math.round(sc.y)}px) translate(-50%, -130%)`;
    });
  }
  const centroid = r => { if (!r.runs || !r.runs.length) return null; let a = 0, x = 0, y = 0; r.runs.forEach(q => { const s = (q[1] - q[0]) * (q[3] - q[2]); a += s; x += s * (q[0] + q[1]) / 2; y += s * (q[2] + q[3]) / 2; }); return [x / a, y / a]; };

  /* ---------- вид «план уровня» ---------- */
  function planView(levelName) {
    const v = C.v, L = st.levels.find(l => l.name === levelName) || st.levels[0]; if (!L) return;
    st.level = L.name; st.plan = true;
    v.setCutPlanes([new THREE.Vector4(0, 0, 1, -(L.floor + 1.3) / C.S)]);
    const runs = st.res.filter(r => r.level === L.name && r.runs).flatMap(r => r.runs);
    const bx = new THREE.Box3(); runs.forEach(q => { bx.expandByPoint(new THREE.Vector3(q[0] / C.S, q[2] / C.S, L.floor / C.S)); bx.expandByPoint(new THREE.Vector3(q[1] / C.S, q[3] / C.S, (L.floor + 1.3) / C.S)); });
    topView(bx);
    renderList(); labels();
  }
  function topView(bx) {
    const v = C.v, c = bx.getCenter(new THREE.Vector3()), sz = bx.getSize(new THREE.Vector3());
    const h = Math.max(sz.x, sz.y) * 1.3;
    v.navigation.setView(new THREE.Vector3(c.x, c.y, c.z + h), c); v.navigation.setCameraUpVector(new THREE.Vector3(0, 1, 0));
    v.navigation.fitBounds(false, bx);
  }
  function view3d() { const v = C.v; st.plan = false; v.setCutPlanes([]); v.fitToView(); }

  /* ---------- выбор помещения ---------- */
  function select(r, fly = true) {
    st.sel = r; draw(); renderList(); renderDetail();
    const v = C.v;
    const ids = r.ops ? r.ops.map(o => o.id) : [];
    v.clearThemingColors(C.m); ids.forEach(id => v.setThemingColor(id, new THREE.Vector4(0.12, 0.44, 0.7, 1), C.m));
    if (fly && r.runs && r.runs.length) {
      const bx = new THREE.Box3(); r.runs.forEach(q => { bx.expandByPoint(new THREE.Vector3(q[0] / C.S, q[2] / C.S, r.floor / C.S)); bx.expandByPoint(new THREE.Vector3(q[1] / C.S, q[3] / C.S, (r.floor + 1.3) / C.S)); });
      bx.expandByScalar(3 / C.S);
      if (st.plan) topView(bx); else v.navigation.fitBounds(false, bx);
    }
  }

  /* ---------- панель ---------- */
  const CSS = `
#keo-bim{--ink:#1b2329;--muted:#5d6b77;--line:#d5dbe0;--line-2:#9aa5ad;--surface:#fff;--surface-2:#f3f5f7;--accent:#1f6fb2;--accent-soft:#e3eef8;--sky:#c48a00;--sky-soft:#fbefc9;--bad:#b3261e;--f-body:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--f-disp:var(--f-body);
 position:fixed;top:56px;right:8px;bottom:8px;width:min(420px,48vw);z-index:1000;background:var(--surface);color:var(--ink);font:13px/1.4 var(--f-body);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden}
#keo-bim.min{bottom:auto;height:auto}#keo-bim.min .kb-body{display:none}
#keo-bim header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
#keo-bim header h2{font-size:14px;margin:0;flex:1}#keo-bim button{font:inherit;cursor:pointer}
#keo-bim .kb-x{border:0;background:none;font-size:18px;line-height:1;color:var(--muted);padding:2px 6px}
#keo-bim .kb-body{overflow:auto;flex:1;padding:10px 12px}
#keo-bim .kb-row{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}
#keo-bim .kb-btn{border:1px solid var(--line);background:var(--surface-2);border-radius:6px;padding:5px 9px}
#keo-bim .kb-btn.on{background:var(--ink);color:#fff;border-color:var(--ink)}#keo-bim .kb-btn.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
#keo-bim .kb-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}
#keo-bim .kb-sum div{border:1px solid var(--line);border-radius:8px;padding:6px;text-align:center}#keo-bim .kb-sum b{display:block;font-size:17px}
#keo-bim table.kb-t{width:100%;border-collapse:collapse;font-size:12px}#keo-bim .kb-t td,#keo-bim .kb-t th{padding:4px 5px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
#keo-bim .kb-t tr.r{cursor:pointer}#keo-bim .kb-t tr.r:hover{background:var(--surface-2)}#keo-bim .kb-t tr.sel{background:var(--accent-soft)}
#keo-bim .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
#keo-bim .chip{display:inline-block;border-radius:10px;padding:0 7px;color:#fff;font-size:11px;white-space:nowrap}
#keo-bim .c-ok{background:${COL.ok}}#keo-bim .c-bad{background:${COL.bad}}#keo-bim .c-none{background:${COL.none}}#keo-bim .c-err{background:${COL.err}}
#keo-bim .kb-card{border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0}
#keo-bim .kb-big{font-size:26px;font-weight:700}#keo-bim .muted{color:var(--muted)}#keo-bim h3{font-size:13px;margin:10px 0 4px}
#keo-bim details{border-top:1px solid var(--line);padding-top:6px;margin-top:6px}#keo-bim summary{cursor:pointer;font-weight:600}
#keo-bim .rep h1{font-size:15px;margin:8px 0}#keo-bim .rep h2{font-size:14px;margin:12px 0 4px}#keo-bim .rep h4{font-size:13px;margin:8px 0 4px}
#keo-bim .rep .fm{font-family:Georgia,serif;background:var(--surface-2);border-radius:6px;padding:6px 8px;margin:4px 0}#keo-bim .rep .src{font-size:11px;color:var(--muted)}
#keo-bim .rep table{width:100%;border-collapse:collapse;font-size:11.5px;margin:4px 0}#keo-bim .rep td,#keo-bim .rep th{border:1px solid var(--line);padding:3px 4px;vertical-align:top}
#keo-bim .rep .vd{border:2px solid;border-radius:8px;padding:8px;margin:8px 0}
#keo-bim .kb-set label{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:4px 0}#keo-bim .kb-set input,#keo-bim .kb-set select{width:150px;font:inherit}
#keo-bim svg.scheme{width:100%;height:auto;max-height:260px;display:block}
#keo-bim .s-wall,#keo-bim .s-wallw{fill:var(--line-2);stroke:var(--ink);stroke-width:1}#keo-bim svg.scheme *{vector-effect:non-scaling-stroke}
#keo-bim .s-glass{stroke:var(--accent);stroke-width:3;fill:none}#keo-bim .s-room{stroke:var(--ink);stroke-width:1.5;fill:none}#keo-bim .s-roomf{fill:var(--surface-2);stroke:var(--ink);stroke-width:1.5}
#keo-bim .s-ray{stroke:var(--sky);stroke-width:1.5;stroke-dasharray:6 4;fill:none}#keo-bim .s-rayb{stroke:var(--sky);stroke-width:1;fill:none}#keo-bim .s-skyf{fill:var(--sky-soft);stroke:var(--sky);stroke-width:.8}
#keo-bim .s-bld{fill:var(--line);stroke:var(--ink);stroke-width:1}#keo-bim .s-pt{fill:var(--bad)}#keo-bim .s-axis{stroke:var(--muted);stroke-width:1;stroke-dasharray:10 3 2 3;fill:none}
#keo-bim .s-dim,#keo-bim .s-dimm{stroke:var(--muted);stroke-width:.8;fill:none}#keo-bim .s-txt,#keo-bim .s-dimt{fill:var(--ink);font-size:var(--fs,32px)}#keo-bim .s-txtb{fill:var(--ink);font-weight:600;font-size:calc(var(--fs,32px)*1.08)}#keo-bim .s-cap{fill:var(--muted);font-weight:600;font-size:var(--fs,32px)}
#keo-labels{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden}
#keo-labels .kl{position:absolute;left:0;top:0;pointer-events:auto;border:0;border-radius:5px;padding:1px 5px;font:11px/1.3 system-ui,sans-serif;color:#fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer}
#keo-labels .kl b{font-weight:600;opacity:.85}#keo-labels .kl.on{outline:2px solid #1b2329}
#keo-labels .kl-ok{background:${COL.ok}}#keo-labels .kl-bad{background:${COL.bad}}#keo-labels .kl-none{background:${COL.none}}#keo-labels .kl-err{background:${COL.err}}`;

  function pass(r) {
    if (st.level !== null && r.level !== st.level) return false;
    const k = status(r).k;
    return st.filter === 'all' ? r.kind === 'calc' : st.filter === 'bad' ? k === 'bad' : st.filter === 'other' ? r.kind !== 'calc' || k === 'none' || k === 'err' : true;
  }
  function mount() {
    document.getElementById('keo-bim')?.remove(); document.getElementById('keo-bim-css')?.remove();
    const css = document.createElement('style'); css.id = 'keo-bim-css'; css.textContent = CSS; document.head.appendChild(css);
    ui = document.createElement('section'); ui.id = 'keo-bim';
    ui.innerHTML = `<header><h2>КЕО по модели</h2><button class="kb-x" data-a="min" title="Свернуть">–</button><button class="kb-x" data-a="close" title="Закрыть">×</button></header><div class="kb-body"><div id="kb-status" class="muted">Анализ…</div><div id="kb-main"></div></div>`;
    document.body.appendChild(ui);
    ui.querySelector('[data-a=min]').onclick = () => ui.classList.toggle('min');
    ui.querySelector('[data-a=close]').onclick = destroy;
  }
  function destroy() { ui?.remove(); labelsEl?.remove(); labelsEl = null; try { C.v.overlays.removeScene(overlay); C.v.setCutPlanes([]); C.v.clearThemingColors(C.m); C.v.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, place); } catch (e) { } }
  const statusLine = t => { const el = document.getElementById('kb-status'); if (el) el.textContent = t; };

  function renderList() {
    const main = document.getElementById('kb-main'); if (!main) return;
    const calc = st.res.filter(r => r.kind === 'calc' && (st.level === null || r.level === st.level));
    const n = k => calc.filter(r => status(r).k === k).length;
    const other = st.res.filter(r => (st.level === null || r.level === st.level) && r.kind !== 'calc');
    const lvBtns = st.levels.map(l => `<button class="kb-btn${st.level === l.name ? ' on' : ''}" data-lv="${esc(l.name)}">План ${esc(l.name)}</button>`).join('');
    const rows = st.res.filter(pass).sort((a, b) => (a.level + a.rm.num).localeCompare(b.level + b.rm.num, 'ru', { numeric: true }));
    main.innerHTML = `
      <div class="kb-row">${lvBtns}<button class="kb-btn${!st.plan ? ' on' : ''}" data-a="3d">3D</button></div>
      <div class="kb-sum"><div><b>${calc.length}</b>рассчитано</div><div style="color:${COL.ok}"><b>${n('ok')}</b>норма</div><div style="color:${COL.bad}"><b>${n('bad')}</b>ниже нормы</div><div class="muted"><b>${n('none') + n('err') + other.length}</b>прочие</div></div>
      <div class="kb-row"><button class="kb-btn${st.filter === 'all' ? ' on' : ''}" data-f="all">Все рассчитанные</button><button class="kb-btn${st.filter === 'bad' ? ' on' : ''}" data-f="bad">Ниже нормы</button><button class="kb-btn${st.filter === 'other' ? ' on' : ''}" data-f="other">Без расчёта и без нормы</button></div>
      <div id="kb-detail"></div>
      <table class="kb-t"><thead><tr><th>№</th><th>Помещение</th><th class="num">e<sub>р</sub>, %</th><th class="num">e<sub>н</sub>, %</th><th>Итог</th></tr></thead><tbody>
      ${rows.map(r => { const s = status(r), e = eOf(r), en = r.C && r.C.ok ? r.C.norm.v : null; return `<tr class="r${st.sel === r ? ' sel' : ''}" data-i="${st.res.indexOf(r)}"><td>${esc(r.rm.num)}</td><td>${esc(r.rm.name)}<div class="muted" style="font-size:11px">${esc(r.level)}</div></td><td class="num">${e === null ? '—' : f2(e)}</td><td class="num">${en === null || en === undefined ? '—' : f2(en, 1)}</td><td><span class="chip c-${s.k}">${esc(s.t)}</span></td></tr>`; }).join('')}
      </tbody></table>
      <details class="kb-set"><summary>Исходные допущения и настройки</summary>${settingsHTML()}</details>
      <div class="kb-row" style="margin-top:10px"><button class="kb-btn" data-a="csv">Таблица (CSV)</button><button class="kb-btn" data-a="json">Все исходные (JSON)</button></div>
      <p class="muted" style="font-size:11px">Контуры помещений восстановлены по срезу модели на высоте ${f2(S.cut, 1)} м над полом и сопоставлены с помещениями Revit по площади (эксперимент). Расчёт — ядром калькулятора КЕО (СП 367.1325800.2025, прил. Б, формула Б.1), значения в таблице — как при ручном вводе.</p>`;
    main.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => planView(b.dataset.lv));
    main.querySelector('[data-a="3d"]').onclick = () => { st.level = null; view3d(); renderList(); labels(); };
    main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; renderList(); labels(); });
    main.querySelectorAll('tr.r').forEach(tr => tr.onclick = () => select(st.res[+tr.dataset.i]));
    main.querySelector('[data-a=csv]').onclick = exportCSV; main.querySelector('[data-a=json]').onclick = exportJSON;
    bindSettings(main);
    renderDetail();
  }
  function settingsHTML() {
    const opt = (list, cur) => list.map((x, i) => `<option value="${i}"${+cur === i ? ' selected' : ''}>${esc(x.t)} — ${f2(x.v)}</option>`).join('');
    const groups = [...new Set(LIB.DATA.rooms.map(r => r.g))];
    return `<label>Тип здания (табл. А.1) <select data-s="bGroup"><option value="">определить по названиям</option>${groups.map(g => `<option${S.bGroup === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label>Группа района по ресурсам светового климата <input type="number" min="1" max="5" step="1" data-s="group" value="${S.group}"></label>
      <label>ρср — средневзвешенный коэффициент отражения <input type="number" step="0.01" data-s="rho" value="${S.rho}"></label>
      <label>τ1 — светопропускание <select data-s="t1">${opt(LIB.DATA.tau1, S.t1)}</select></label>
      <label>τ2 — переплёты <select data-s="t2">${opt(LIB.DATA.tau2, S.t2)}</select></label>
      <label>ρф — отражение фасадов противостоящих зданий <input type="number" step="0.05" data-s="rhoF" value="${S.rhoF}"></label>
      <label>Не рассчитывать (имя содержит) <input type="text" data-s="exclude" value="${esc(S.exclude)}"></label>
      <label>Высота среза для контуров, м <input type="number" step="0.1" data-s="cut" value="${S.cut}"></label>
      <p class="muted" style="font-size:11px">Тип здания для норм: ${esc(st.group || 'не определён')}. Ориентация — по истинному северу из модели. Затенение: козырьки и балконы — лучами по модели (K, табл. Б.19), противостоящие здания — по карте высот модели (схема № 1, εзд, bф, Kзд). Двери и витражи учитываются по прозрачным (стеклянным) элементам.</p>
      <div class="kb-row"><button class="kb-btn pri" data-a="rerun">Пересчитать</button></div>`;
  }
  function bindSettings(root) {
    root.querySelectorAll('[data-s]').forEach(el => el.onchange = () => { const k = el.dataset.s; S[k] = (el.type === 'text' || k === 'bGroup') ? el.value : +el.value; });
    root.querySelector('[data-a=rerun]').onclick = () => run();
  }

  function renderDetail() {
    const box = document.getElementById('kb-detail'); if (!box) return; const r = st.sel;
    if (!r) { box.innerHTML = '<p class="muted">Нажмите на помещение в таблице или на метку в модели — откроется разбор.</p>'; return; }
    const s = status(r), e = eOf(r);
    let h = `<div class="kb-card"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${esc(r.rm.num)} · ${esc(r.rm.name)}</b><div class="muted">${esc(r.level)} · площадь ${f2(r.rm.area, 1)} м²${r.rm.dA !== undefined ? ` (по контуру ${f2(r.rm.areaModel, 1)} м²)` : ''}</div></div><span class="chip c-${s.k}" style="align-self:start">${esc(s.t)}</span></div>`;
    if (r.kind === 'calc' && r.C && r.C.ok) {
      const C1 = r.C, n = C1.norm;
      h += `<div style="display:flex;gap:16px;align-items:baseline;margin:8px 0"><div><span class="kb-big">${f2(e)}</span> %<div class="muted">расчётный e<sub>р</sub></div></div><div><span class="kb-big" style="font-weight:500">${n.v === null ? '—' : f2(n.v)}</span> %<div class="muted">нормируемый e<sub>н</sub></div></div></div>`;
      h += `<div class="muted" style="font-size:12px">${n.room ? `Норма: табл. А.1 СП 367, п. ${n.room.n} «${esc(n.room.name)}»` : 'Назначение не найдено в табл. А.1 — норма не задана'}. Точка: ${r.multi ? 'центр помещения (проёмы в нескольких стенах)' : esc(LIB.KEO.RT_TEXT[r.row ? r.row.rt : 'center'])}, ${r.row && r.row.h === 0 ? 'на полу' : 'на УРП 0,8 м'}.</div>`;
      h += '<h3>Проёмы и затенение</h3><table class="kb-t"><tr><th>Стена</th><th>Окна (bо×hо, hпд), м</th><th>Затенение</th><th class="num">e, %</th></tr>' + r.C.res.walls.map((w, i) => {
        const W = r.st.side.walls[i];
        const sh = [W.kType !== 'none' ? `козырёк/балкон ${f2(W.kDepth, 1)} м (K = ${f2(w.wins[0].K)})` : '', ...W.buildings.map(b => `здание l = ${f2(b.l, 1)} м, Hр = ${f2(b.Hp, 1)} м`)].filter(Boolean).join('; ') || 'нет';
        return `<tr><td>${esc(W.orient)}<div class="muted">lт ${f2(W.lt)} · dп ${f2(W.dp)} · Δст ${f2(W.dst)}</div></td><td>${W.windows.map(x => `${f2(x.bo)}×${f2(x.ho)}, ${f2(x.hpd)}`).join('<br>')}</td><td>${esc(sh)}</td><td class="num">${f2(w.e, 3)}</td></tr>`;
      }).join('') + '</table>';
      if (C1.warn.length || r.notes.length) h += `<p class="muted" style="font-size:11.5px">${[...r.notes, ...C1.warn].map(esc).join('<br>')}</p>`;
      h += `<details><summary>Полный разбор: формулы, коэффициенты, схема</summary><div class="rep">${reportHTML(LIB.KEO.buildModel(r.st, C1))}</div></details>`;
      h += `<div class="kb-row" style="margin-top:8px"><button class="kb-btn" data-a="one">Исходные для калькулятора (.json)</button></div>`;
      const rowsA1 = LIB.DATA.rooms.slice().sort((a, b) => (b.g === st.group) - (a.g === st.group));
      h += `<label class="muted" style="display:block;font-size:12px">Назначение по табл. А.1: <select data-norm style="max-width:100%">${['<option value="-">— без нормы КЕО —</option>', ...rowsA1.map(x => `<option value="${x.id}"${r.row && r.row.id === x.id ? ' selected' : ''}>${esc(x.n + '. ' + x.name + ' (' + x.g.slice(0, 40) + ')')}</option>`)].join('')}</select></label>`;
    } else h += `<p class="muted">${esc(s.t)}${r.kind === 'nogeo' ? ' — помещение есть в модели, но его контур не удалось однозначно выделить по срезу (например, оно не отделено стеной или линией разделения от соседнего). Посчитайте его в калькуляторе вручную.' : ''}</p>`;
    box.innerHTML = h + '</div>';
    const sn = box.querySelector('[data-norm]'); if (sn) sn.onchange = () => {
      r.env.normRow = sn.value === '-' ? null : LIB.DATA.rooms.find(x => x.id === sn.value);
      const n2 = Cc.room(r.rm, r.ops, r.env); Object.assign(r, n2, { kind: n2.err ? 'err' : 'calc' }); draw(); renderList();
    };
    const b1 = box.querySelector('[data-a=one]'); if (b1) b1.onclick = () => download(`КЕО_${r.rm.num}.json`, JSON.stringify(r.st, null, 2), 'application/json');
  }
  function reportHTML(M) {
    const R = LIB.Report, rh = R.richHTML;
    return M.map(b => {
      if (b.type === 'h1') return `<h1>${esc(b.text)}</h1>${b.sub ? `<p class="muted">${esc(b.sub)}</p>` : ''}`;
      if (b.type === 'h2') return `<h2>${esc(b.text)}</h2>`;
      if (b.type === 'h3') return `<h4>${esc(b.text)}</h4>`;
      if (b.type === 'p') return `<p${b.small ? ' class="src"' : ''}>${esc(b.text)}</p>`;
      if (b.type === 'formula') return `<div class="fm">${b.lines.map(rh).join('<br>')}</div>${b.src ? `<div class="src">${esc(b.src)}</div>` : ''}`;
      if (b.type === 'kv') return `${b.title ? `<p><i>${esc(b.title)}</i></p>` : ''}<table>${b.rows.map(x => `<tr><td>${esc(x[0])}</td><td>${rh(x[1] || '')}</td><td class="num">${rh(String(x[2] ?? ''))}</td><td class="src">${esc(x[3])}</td></tr>`).join('')}</table>`;
      if (b.type === 'table') return `${b.title ? `<p><i>${esc(b.title)}</i></p>` : ''}<table><tr>${b.cols.map(c => `<th>${rh(c.h)}</th>`).join('')}</tr>${b.rows.map(x => { const cells = Array.isArray(x) ? x : x.cells; return `<tr>${cells.map(c => `<td>${rh(String(c ?? ''))}</td>`).join('')}</tr>`; }).join('')}</table>${b.note ? `<p class="src">${esc(b.note)}</p>` : ''}`;
      if (b.type === 'scheme') return b.schemes.map(sc => LIB.Schemes.toSVG(sc)).join('') + (b.caption ? `<p class="src">${esc(b.caption)}</p>` : '');
      if (b.type === 'verdict') return `<div class="vd" style="border-color:${b.ok ? COL.ok : COL.bad}"><b>${rh(b.left)}</b><br>${rh(b.left2 || '')}<br><b style="color:${b.ok ? COL.ok : COL.bad}">${b.ok ? 'СООТВЕТСТВУЕТ' : 'НЕ СООТВЕТСТВУЕТ'}</b></div>`;
      return '';
    }).join('');
  }

  /* ---------- экспорт ---------- */
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function exportCSV() {
    const rows = [['Уровень', 'Номер', 'Помещение', 'Площадь, м2', 'eр, %', 'eн, %', 'Итог', 'Стен с проёмами', 'Пункт табл. А.1']];
    st.res.forEach(r => { const s = status(r); rows.push([r.level, r.rm.num, r.rm.name, f2(r.rm.area, 2), eOf(r) === null ? '' : f2(eOf(r)), r.C && r.C.ok && r.C.norm.v !== null ? f2(r.C.norm.v) : '', s.t, r.st ? r.st.side.walls.length : '', r.row ? r.row.n : '']); });
    download('КЕО_по_модели.csv', '﻿' + rows.map(x => x.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  }
  function exportJSON() { download('КЕО_по_модели.json', JSON.stringify({ settings: S, rooms: st.res.filter(r => r.st).map(r => ({ level: r.level, num: r.rm.num, name: r.rm.name, e: eOf(r), state: r.st })) }, null, 1), 'application/json'); }

  /* ---------- запуск ---------- */
  async function run(opts) {
    Object.assign(S, opts || {});
    if (!ui || !document.body.contains(ui)) mount();
    const t0 = performance.now();
    try {
      st.sel = null; await analyze(statusLine);
      const calc = st.res.filter(r => r.kind === 'calc');
      statusLine(`Готово за ${f2((performance.now() - t0) / 1000, 1)} с: рассчитано помещений — ${calc.length}.`);
      st.level = st.levels.length ? st.levels[st.levels.length - 1].name : null;
      draw(); renderList(); if (st.level) planView(st.level);
    } catch (e) { statusLine('Ошибка: ' + e.message); console.error(e); }
    return st;
  }
  return { run, st: () => st, S, select, planView, destroy };
})();
window.KeoBim = KeoBim;
