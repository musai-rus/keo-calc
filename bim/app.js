/* КЕО по модели — запуск в окне Autodesk Viewer: анализ, подсветка помещений на плане, метки, таблица и разбор. */
const KeoBim = (function () {
  const G = BimGeom, Cc = BimCalc, SP = BimSpaces, LIB = { DATA, Engine, Report, Schemes, KEO };
  const f2 = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' : Number(x).toFixed(n).replace('.', ',');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const COL = { ok: '#2e9d5b', bad: '#d9443a', none: '#8a94a0', err: '#c99a06' };

  const S = {
    cell: 0.05, cut: 1.0, bGroup: '', rho: 0.55, t1: 3, t2: 0, t4: 0, rhoF: 0.4, region: 'г. Москва', group: 1,
    lt1: 3, lt2: 0, lrho: 0.7, northDeg: '',
    exclude: 'лестни|\\bЛК\\b|коридор|холл|вестибюл', glassExclude: 'stemalit|эмал', code: '', object: ''
  };
  let st = { levels: [], res: [], sel: null, filter: 'all', level: null, plan: false, dec: { merge: [], split: [], assign: [], lanterns: {} }, normOv: {} };
  let C, cat, ui, overlay = 'keo-bim', labelsEl, HM, VOPS = [], LANS = [];
  const exRe = () => S.exclude ? new RegExp(S.exclude, 'i') : null;
  const isExcluded = rm => { const re = exRe(); return !!(re && re.test(rm.name || '')); };

  /* ---------- ручные решения по составу пространств: хранятся в браузере по URN модели ---------- */
  function modelKey() { try { return C.m.getData().urn || C.m.getDocumentNode().getRootNode().urn(); } catch (e) { return location.pathname; } }
  const decKey = () => 'keo-bim:decisions:' + modelKey();
  function loadDec() { try { const j = JSON.parse(localStorage.getItem(decKey()) || 'null'); if (j && Array.isArray(j.merge)) return j; } catch (e) { } return null; }
  function saveDec() { try { localStorage.setItem(decKey(), JSON.stringify({ merge: st.dec.merge, split: st.dec.split, assign: st.dec.assign, lanterns: st.dec.lanterns, normOv: st.normOv, saved: new Date().toISOString() })); } catch (e) { } }

  /* ---------- анализ ---------- */
  async function analyze(progress) {
    const v = window.NOP_VIEWER; if (!v || !v.model || v.model.is2d()) throw new Error('Откройте 3D-вид модели');
    C = G.ctx(v);
    // лучи Viewer (наружная область, затенение, фонари) не видят геометрию за секущей плоскостью: анализ — без сечения
    // (повторный запуск из «План L01» давал 43 рассчитанных пространства вместо 63)
    if ((v.getCutPlanes() || []).length) { v.setCutPlanes([]); st.plan = false; }
    progress('Каталог элементов…');
    cat = await G.catalog(C);
    const rooms = await G.rooms(C);
    const d = loadDec(); if (d) { st.dec = { merge: d.merge || [], split: d.split || [], assign: d.assign || [], lanterns: d.lanterns || {} }; st.normOv = d.normOv || {}; }
    const aec = await Autodesk.Viewing.Document.getAecModelData(C.m.getDocumentNode()).catch(() => null);
    const T = aec && aec.refPointTransformation;
    st.north = northOf(T); st.aecLoc = aec && aec.locationParameters;
    const lv = (aec && aec.levels || []).map(l => ({ name: l.name, floor: (l.elevation - C.GZ) * C.S })).sort((a, b) => a.floor - b.floor);
    lv.forEach((l, i) => { l.top = i < lv.length - 1 ? lv[i + 1].floor : l.floor + 6; l.rooms = rooms.filter(r => r.level === l.name); });
    const levels = lv.filter(l => l.rooms.length);
    st.rooms = rooms; st.noLevel = rooms.filter(r => !levels.some(l => l.name === r.level));
    progress('Проёмы и фонари…');
    const ops = G.openings(C, cat, S.glassExclude ? new RegExp(S.glassExclude, 'i') : null);
    VOPS = ops.filter(o => !o.roof); LANS = ops.filter(o => o.roof); st.lanDiag = ops.diag || [];
    progress('Карта высот для затенения…');
    const bb = C.m.getBoundingBox(), box = [bb.min.x * C.S - 5, bb.min.y * C.S - 5, bb.max.x * C.S + 5, bb.max.y * C.S + 5];
    const skip = /Planting|Furniture|Mechanical Equipment|Plumbing|Specialty|Lines|Grids|Level|Room Separation|Sun Path|Area|Rooms/;
    HM = G.heightMap(C, cat, Object.keys(cat.byCat).filter(c => !skip.test(c)), 0.5, box);
    st.group = S.bGroup || Cc.guessGroup(rooms.map(r => r.name), LIB.DATA.rooms); st.T = T;
    // физические преграды (свет, состав пространства) и линии разделения помещений (только опознание помещений Revit)
    const bcats = ['Revit Walls', 'Revit Curtain Panels', 'Revit Curtain Wall Mullions', 'Revit Doors', 'Revit Windows', 'Revit Structural Columns', 'Revit Columns'];
    for (const L of levels) {
      progress(`Уровень ${L.name}: срез и контуры…`); await tick();
      const z = L.floor + S.cut;
      const segsP = G.slice(C, cat, bcats, z), segsL = G.slice(C, cat, ['Revit <Room Separation>'], z, [L.floor, 0.6]), segsD = G.doorBoxes(C, cat, z);
      const bx = G.bounds(segsP.concat(segsL));
      // Rp — физические преграды + закрытые двери (габарит непрозрачной двери: открытая створка не соединяет помещения)
      L.Rp = G.raster(segsP.concat(segsD), S.cell, bx); L.R = G.raster(segsP.concat(segsL), S.cell, bx); L.doors = segsD.length / 4;
      SP.matchRooms(L.R, L.rooms);
      G.markExterior(C, L.Rp, z);
      compose(L);
    }
    progress('Фонари: привязка к помещениям, шахты, затенение…'); await tick();
    const LP = await G.lanternParams(C, LANS.map(l => l.id));
    LANS.forEach(l => { const q = LP[l.id]; if (q) { l.dTop = q.dIn || null; l.dBot = q.dBot || null; } });
    lanterns(levels);
    st.levels = levels; st.res = [];
    for (const L of levels) { progress(`Уровень ${L.name}: расчёт…`); await tick(); st.res.push(...calcLevel(L)); }
    return st.res;
  }
  const tick = () => new Promise(r => setTimeout(r, 0));

  // состав пространств уровня (по текущим решениям) → разметка клеток → привязка вертикальных проёмов
  function compose(L) {
    const { spaces, unplaced, unknown } = SP.compose(L.R, L.Rp, L.rooms, isExcluded, st.dec, { aux: rm => !normRow(rm) });
    L.spaces = spaces; L.unplaced = unplaced; L.unknown = unknown;
    L.lab = SP.spaceLabel(L.R, L.Rp, spaces);
    VOPS.forEach(o => { if (o.lvl === L.name) { delete o.space; delete o.lvl; delete o.floor; } });
    L.assign = G.assign(L.Rp, L.lab, VOPS, L.floor, L.top);
    VOPS.forEach(o => { if (o.lvl === undefined && o.space !== undefined && o.floor === L.floor) o.lvl = L.name; });
    L.cells = G.spaceCells(L.R, L.lab, spaces.length, 4);
    // физические объёмы (области Rp) каждого пространства: проём в объёме доступен всем его пространствам — свет проходит
    // через открытые проходы (полоса «Кладовка игрушек» вдоль витража 94 не отнимает окна у групповой 70); видимость — по Rp
    L.spRegs = spaces.map(() => new Set()); for (let p = 0; p < L.lab.length; p++) if (L.lab[p] >= 0 && L.Rp.lab[p] > 0) L.spRegs[L.lab[p]].add(L.Rp.lab[p]);
    L.cnt = new Float64Array(spaces.length); for (let p = 0; p < L.lab.length; p++) if (L.lab[p] >= 0) L.cnt[L.lab[p]]++;
    LANS.forEach(l => { if (l.lvl === L.name) { l.space = spaceAt(L, l.c); l.why = l.space < 0 ? lanWhy(L, l) : null; } });
  }
  function spaceAt(L, c) {
    const R = L.R;
    for (let rad = 0; rad <= 0.6; rad += 0.1) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = Math.floor((c[0] + dx * rad - R.minx) / R.cell), j = Math.floor((c[1] + dy * rad - R.miny) / R.cell);
      if (i >= 0 && j >= 0 && i < R.W && j < R.H && L.lab[j * R.W + i] >= 0) return L.lab[j * R.W + i];
    }
    return -1;
  }
  // фонарь → уровень (верхний уровень, над полом которого нет непрозрачной конструкции до стекла), высота помещения и шахты, затенение
  function lanterns(levels) {
    const down = levels.slice().sort((a, b) => b.floor - a.floor);
    // лучи Viewer не видят геометрию за секущей плоскостью — на время привязки фонарей сечение снимается
    const cp = C.v.getCutPlanes(); if (cp.length) C.v.setCutPlanes([]);
    try { lanterns0(down); } finally { if (cp.length) C.v.setCutPlanes(cp); }
  }
  function lanterns0(down) {
    LANS.forEach(l => {
      // уровень — не ближайший по высоте, а тот, на чей пол фонарь светит: верхний уровень ниже стекла, между полом которого
      // и стеклом нет непрозрачного перекрытия (луч вверх из точки под фонарём на высоте среза)
      delete l.lvl; delete l.space; delete l.hostSlab; delete l.shaded; delete l.H; delete l.hsf; l.why = null;
      if (l.note0 === undefined) l.note0 = l.note || ''; l.note = l.note0 || undefined; // пометки пересчитываются заново
      // размеры отверстий шахты: D1 = Diameter_Inside — верхнее (под стеклом), D2 = Diameter_Bottom — нижнее (в потолке),
      // из параметров семейства; нет параметров — по стеклу, шахта вертикальная (допущение)
      if (l.dTop) l.note = (l.note ? l.note + '; ' : '') + `шахта${l.round ? ' круглая' : ''}: верх D1 = ${f2(l.dTop)} м, низ D2 = ${f2(l.dBot || l.dTop)} м (параметры семейства Diameter_Inside / Diameter_Bottom); стекло ${f2(l.round ? l.d : l.av)} м`;
      else l.note = (l.note ? l.note + '; ' : '') + `размеры шахты в модели не заданы — отверстие по стеклу ${l.round ? '⌀' + f2(l.d) : f2(l.av) + '×' + f2(l.bv)} м, шахта вертикальная (допущение)`;
      for (const L of down) {
        if (l.z0 < L.floor + 2) continue;
        const hh = G.hitUpEl(C, l.c[0], l.c[1], L.floor + S.cut, l.z0 - L.floor);
        // перекрытие/покрытие на отметке низа фонаря — основа фонаря, проём в которой в модели не вырезан
        // (семейство размещено на уровне, а не в перекрытии): считается открытым по габариту фонаря, с пометкой
        if (hh && hh.z < l.z0 - 0.3 && l.zb !== undefined && hh.z >= l.zb - 0.2 && /Floors|Roofs/.test((cat.info[hh.id] || {}).c || '')) {
          l.hostSlab = hh.id; l.note = (l.note ? l.note + '; ' : '') + `проём в перекрытии под фонарём в модели не вырезан (элемент ${hh.id}) — принят открытым по габариту фонаря`;
        } else if (hh && hh.z < l.z0 - 0.3) continue; // между полом и фонарём — перекрытие
        l.lvl = L.name; l.floor = L.floor; l.space = spaceAt(L, l.c); l.why = l.space < 0 ? lanWhy(L, l) : null; break;
      }
      if (!l.lvl) { l.why = 'нет уровня, на пол которого фонарь светит без перекрытия (луч вверх упирается в конструкцию ниже стекла)'; return; }
      const v = [-l.t[1], l.t[0]], cz = [];
      [[l.t, l.av], [[-l.t[0], -l.t[1]], l.av], [v, l.bv], [[-v[0], -v[1]], l.bv]].forEach(([d, s]) => {
        const x = l.c[0] + d[0] * (s / 2 + 0.4), y = l.c[1] + d[1] * (s / 2 + 0.4), h = G.hitUp(C, x, y, l.floor + S.cut, l.z0 + 0.5 - l.floor);
        if (h !== null && h > l.floor + 2) cz.push(h);
      });
      if (cz.length) { cz.sort((a, b) => a - b); const ceil = cz[Math.floor(cz.length / 2)]; l.H = ceil - l.floor; l.hsf = Math.max(0, l.z0 - ceil); }
      const top = [l.c[0], l.c[1], l.z1 + 0.05];
      const up = G.hitDir(C, top, [0, 0, 1], 60);
      if (up !== null) l.shaded = `над фонарём непрозрачная конструкция (${f2(up, 1)} м выше стекла)`;
      const n45 = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => G.hitDir(C, top, [a, b, 1], 40) !== null).length;
      if (!l.shaded && n45 >= 2) l.note = (l.note ? l.note + '; ' : '') + `фонарь ${f2(l.av)}×${f2(l.bv)} м: окружающие конструкции выше 45° с ${n45} сторон из 4 — в методе Б.3 затенение фонаря не учитывается, результат может быть завышен`;
      const az = Cc.azimuth(l.t, st.north.rot); l.ori = `${Math.round(az)}°/${Math.round((az + 90) % 360)}°`;
    });
  }
  // тип фонаря: «b3» — зенитный/шахтный по Б.3 (подтверждён автоматически: горизонтальное стекло в семействе с именем фонаря,
  // или пользователем для всего типа), «skip» — не фонарь, null — требует подтверждения
  const lanKey = l => l.cat + '|' + (l.label || l.type || '');
  const lanConf = l => { const d = (st.dec.lanterns || {})[lanKey(l)]; return d || (l.auto ? 'b3' : null); };
  // где под фонарём нет рассчитываемого пространства — почему
  function lanWhy(L, l) {
    const R = L.R, i = Math.floor((l.c[0] - R.minx) / R.cell), j = Math.floor((l.c[1] - R.miny) / R.cell), id = (i >= 0 && j >= 0 && i < R.W && j < R.H) ? R.lab[j * R.W + i] : 0, rg = R.regs[id];
    const rm = rg && (rg.room || (rg.rooms && rg.rooms[0]));
    if (rm) return isExcluded(rm) ? `под фонарём помещение ${rm.num} «${rm.name}» — исключено из расчёта (настройка)` : `под фонарём помещение ${rm.num} «${rm.name}» не входит в рассчитываемое пространство`;
    return id > 0 ? 'под фонарём часть без помещения Revit (контур не опознан)' : 'точка под фонарём попадает в стену или перегородку на высоте среза';
  }
  // север: ручная поправка (настройка) или поворот из refPointTransformation (внутренние координаты Revit → общие, истинный север)
  function northOf(T) {
    if (S.northDeg !== '' && S.northDeg !== null && !isNaN(+S.northDeg)) return { rot: +S.northDeg, src: `задан вручную: поправка ${f2(+S.northDeg, 1)}°` };
    if (T && T.length >= 5 && (T[0] || T[1])) { const rot = -Math.atan2(T[1], T[0]) * 180 / Math.PI; return { rot, src: `истинный север Revit (refPointTransformation модели): поворот осей модели ${f2(rot, 1)}°` }; }
    return { rot: 0, src: 'сведения о севере в модели не переданы — принят север по оси +Y Viewer (проверьте и задайте поправку в настройках)', unknown: true };
  }
  // нормы: назначение помещения по табл. А.1 (или выбор пользователя для пространства)
  const normRow = rm => { const ov = st.normOv[rm.key]; if (ov !== undefined) return ov === '-' ? null : LIB.DATA.rooms.find(x => x.id === ov) || null; return Cc.mapNorm(rm.name, LIB.DATA.rooms, st.group); };
  function rowsOf(sp) {
    const ov = st.normOv[sp.key];
    if (ov !== undefined) return [ov === '-' ? null : LIB.DATA.rooms.find(x => x.id === ov) || null];
    return sp.rooms.map(rm => Cc.mapNorm(rm.name, LIB.DATA.rooms, st.group));
  }
  function calcLevel(L) {
    const out = [], cell2 = L.R.cell * L.R.cell, regPts = roomPts(L);
    L.spaces.forEach((sp, i) => {
      const areaRevit = sp.rooms.reduce((s, r) => s + (r.area || 0), 0);
      const areaC = L.cnt[i] * cell2, areaV = sp.regIds.reduce((s, id) => s + (L.R.regs[id].areaV || 0), 0);
      const dA = areaRevit > 0 ? Math.min(Math.abs(areaRevit - areaC), Math.abs(areaRevit - areaV)) / areaRevit : null;
      const base = { sp, key: sp.key, level: L.name, floor: L.floor, rooms: sp.rooms, title: Cc.title(sp), nums: sp.rooms.map(r => r.num).join('+'), runs: L.cells.runs[i],
        area: { revit: areaRevit, model: areaC, modelV: areaV, dA, warn: dA !== null && dA > 0.05 } };
      const o = VOPS.filter(x => x.lvl === L.name && (x.space === i || (x.reg && L.spRegs[i] && L.spRegs[i].has(x.reg)))), ls = LANS.filter(x => x.lvl === L.name && x.space === i);
      ls.forEach(l => { l.conf = lanConf(l); });
      const lsCalc = ls.filter(l => l.conf === 'b3'), lanPending = ls.filter(l => !l.conf).length;
      if (!o.length && !lsCalc.length) { out.push({ ...base, kind: 'dark', lans: ls, lanPending }); return; }
      const env = { KEO: LIB.KEO, Engine: LIB.Engine, DATA: LIB.DATA, settings: { ...S, bGroup: st.group }, floor: L.floor, pts: L.cells.pts[i], Rp: L.Rp, T: st.T, north: st.north.rot,
        rows: rowsOf(sp), roomPts: rm => regPts.get(rm.reg !== undefined ? rm.reg : rm.sub) || [], shade: (f, A) => shade(f, A, L.floor) };
      let r; try { r = Cc.space(sp, o, lsCalc, env); } catch (e) { r = { err: 'ошибка: ' + e.message }; console.error(e); }
      if (lanPending) (r.notes = r.notes || []).unshift(`фонарей с неподтверждённым типом: ${lanPending} — в расчёте не учтены, подтвердите тип в разделе «Фонари»`);
      out.push({ ...base, ...r, env, kind: r.err ? 'err' : 'calc', ops: o, lans: ls, lanPending });
    });
    // части здания ≥ 8 м² без помещения Revit вне рассчитанных пространств — выбор помещений за пользователем
    L.unknown.filter(u => u.space === undefined).forEach(u => out.push({ key: 'unk:' + u.at.join(','), level: L.name, floor: L.floor, rooms: [], title: `Контур без помещения Revit, ${f2(u.area, 1)} м²`, nums: '?', kind: 'unknown', unk: u, A: u.at }));
    // помещения без расчётного контура: не опознаны по срезу и не закрыты балансом площадей
    const placed = new Set(L.spaces.flatMap(s => s.rooms.map(r => r.key)));
    L.rooms.filter(rm => !isExcluded(rm) && !placed.has(rm.key)).forEach(rm => out.push({ key: rm.key, level: L.name, floor: L.floor, rooms: [rm], title: `${rm.num} ${rm.name}`, nums: rm.num, kind: 'nogeo',
      why: !(rm.area > 0) ? (rm.warn.join('; ') || 'нет площади') : rm.reg ? 'контур в наружной области или вне здания' : 'контур не выделен по срезу' }));
    return out;
  }
  // клетки собственных контуров помещений (для расчётной точки в помещении, определяющем норму)
  function roomPts(L) {
    const R = L.R, want = new Set(), out = new Map();
    L.spaces.forEach(sp => sp.rooms.forEach(rm => { const id = rm.reg !== undefined ? rm.reg : rm.sub; if (id !== undefined) { want.add(id); out.set(id, []); } }));
    for (let j = 0; j < R.H; j += 4) for (let i = 0; i < R.W; i += 4) { const id = R.lab[j * R.W + i]; if (want.has(id)) out.get(id).push([R.minx + (i + 0.5) * R.cell, R.miny + (j + 0.5) * R.cell]); }
    return out;
  }
  function shade(f, A, floor) {
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
  // пересборка уровня после ручного решения (без повторного среза)
  function rebuild(levelName) {
    const L = st.levels.find(l => l.name === levelName); if (!L) return;
    const selKey = st.sel && st.sel.key;
    compose(L);
    st.res = st.res.filter(r => r.level !== L.name).concat(calcLevel(L));
    st.sel = st.res.find(r => r.key === selKey) || null;
    draw(); renderList();
  }
  // kind: 'merge' | 'split' | 'assign' (помещения в неопознанный контур at) | null — вернуть автоматический состав
  function decide(kind, keys, levelName, at) {
    const D = st.dec, hit = g => g.some(k => keys.includes(k));
    D.merge = D.merge.filter(g => !hit(g)); D.split = D.split.filter(g => !hit(g));
    D.assign = (D.assign || []).filter(a => !hit(a.keys) && !(at && a.at[0] === at[0] && a.at[1] === at[1]));
    if (kind === 'assign') D.assign.push({ at, keys }); else if (kind) D[kind].push(keys);
    saveDec(); rebuild(levelName);
  }

  /* ---------- статус пространства ---------- */
  function status(r) {
    if (r.kind === 'dark') return { k: 'none', t: 'нет световых проёмов' };
    if (r.kind === 'nogeo') return { k: 'none', t: 'контур не найден' };
    if (r.kind === 'unknown') return { k: 'err', t: 'уточните состав' };
    if (r.kind === 'err') return { k: 'err', t: r.err };
    if (r.sp && r.sp.unknown.length) return { k: 'err', t: 'уточните состав' };
    if (r.lanPending) return { k: 'err', t: 'уточните тип фонаря' };
    if (r.mode === 'comb') { if (!r.comb) return { k: 'err', t: 'ошибка данных' }; if (r.comb.normOk === null) return { k: 'none', t: 'не нормируется' }; return r.comb.pass ? { k: 'ok', t: 'соответствует*' } : { k: 'bad', t: 'не соответствует*' }; }
    if (!r.C || !r.C.ok) return { k: 'err', t: (r.C && r.C.err || []).join('; ') || 'ошибка данных' };
    if (r.C.normOk === null) return { k: 'none', t: 'не нормируется' };
    return r.C.pass ? { k: 'ok', t: 'соответствует*' } : { k: 'bad', t: 'не соответствует*' };
  }
  // * — результат предварительный: расчёт по модели не сверен с независимым расчётом (см. инструкцию проекта, разд. 12)
  const PRELIM = '* Предварительно: результаты КЕО по модели не сверены с независимым расчётом и не являются заключением о соответствии.';
  const eOf = r => r.comb ? r.comb.eAvgR : r.C && r.C.ok ? r.C.res.eFinal : null;
  const enOf = r => r.comb ? r.comb.norm.v : r.C && r.C.ok ? r.C.norm.v : null;
  const MODE = { side: 'боковое', top: 'верхнее', comb: 'комбинированное' };
  const UNIT = { squareMeters: 'м²', squareMillimeters: 'мм²', squareCentimeters: 'см²', squareFeet: 'фут²', squareInches: 'дюйм²' };
  // требует внимания: автоматическое объединение, привязка по балансу площадей, открытый проход в исключённое помещение, расхождение площадей
  // помещения одного физического объёма из разных серий номеров (например, «77» и «1.054») — сопоставление по площади сомнительно:
  // в типовых групповых ячейках площади повторяются, и контур мог получить чужое помещение той же площади (Горячий цех в ячейке групповой 77)
  const series = n => { const m = /^(\d+)\./.exec(String(n || '')); return m ? m[1] + '.' : '—'; };
  const seriesMix = sp => { const all = [...sp.rooms, ...(sp.neighbours || [])]; return new Set(all.map(r => series(r.num))).size > 1 ? all : null; };
  const ambiguous = r => !!(r.sp && ((r.sp.merged && !r.sp.manual) || r.sp.balance.length || r.sp.neighbours.length || r.sp.dup || r.sp.unknown.length || (r.sp.auxNb || []).length || (!r.sp.manual && seriesMix(r.sp)) || r.sp.rooms.some(x => x.loose))) || !!(r.area && r.area.warn) || !!r.lanPending;

  /* ---------- оверлей в 3D: заливка пространств, расчётные точки, метки ---------- */
  // видимый уровень: «План …» в панели или горизонтальное сечение Viewer (в т.ч. выбор этажа во Viewer); без сечения — все уровни.
  // Наложения Viewer сечением не обрезаются, поэтому уровни выше сечения скрываются явно.
  function cutZ() {
    const v = C.v, planes = (v.impl.getAllCutPlanes && v.impl.getAllCutPlanes()) || v.getCutPlanes() || [];
    let z = null;
    planes.forEach(p => { if (Math.abs(p.z) > 0.99 && Math.abs(p.x) < 0.01 && Math.abs(p.y) < 0.01 && p.z > 0) { const zc = -p.w / p.z * C.S; z = z === null ? zc : Math.min(z, zc); } });
    return z;
  }
  function visLevel() {
    const z = cutZ(); if (z === null) return null;
    const below = st.levels.filter(l => l.floor < z - 0.01); return below.length ? below[below.length - 1].name : null;
  }
  const shown = r => { const lv = visLevel(); return lv === null || r.level === lv; };
  function draw() {
    const v = C.v, Sx = C.S;
    if (v.overlays.hasScene(overlay)) v.overlays.removeScene(overlay);
    v.overlays.addScene(overlay);
    st.drawn = visLevel();
    st.res.forEach(r => {
      if (!r.runs || !r.runs.length || !shown(r)) return;
      const s = status(r), col = new THREE.Color(COL[s.k]);
      const pos = [], z = (r.floor + 0.04) / Sx;
      r.runs.forEach(q => { const x0 = q[0] / Sx, x1 = q[1] / Sx, y0 = q[2] / Sx, y1 = q[3] / Sx; pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z); });
      const g = new THREE.BufferGeometry(); g.setAttribute ? g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)) : g.addAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      const sel = st.sel === r;
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: sel ? 0.75 : (r.kind === 'calc' ? 0.5 : 0.22), side: THREE.DoubleSide, depthWrite: false }));
      mesh.renderOrder = 10; v.overlays.addMesh(mesh, overlay);
      (r.pts && r.pts.length ? r.pts : r.A ? [r.A] : []).forEach(p => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry((sel ? 0.14 : 0.1) / Sx, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1b2329 }));
        dot.position.set(p[0] / Sx, p[1] / Sx, (r.floor + 0.1) / Sx); v.overlays.addMesh(dot, overlay);
      });
    });
    labels();
    v.impl.invalidate(true, true, true);
  }
  function labels() {
    const v = C.v;
    if (!labelsEl) {
      document.querySelectorAll('#keo-labels').forEach(e => e.remove()); // метки предыдущего запуска
      labelsEl = document.createElement('div'); labelsEl.id = 'keo-labels'; v.container.appendChild(labelsEl);
      v.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, place); if (EV_CUT) v.addEventListener(EV_CUT, onCut);
      // setCutPlanes (в т.ч. из других инструментов) событие CUTPLANES_CHANGE не вызывает — сечение дополнительно проверяется по таймеру
      clearInterval(cutPoll); cutPoll = setInterval(onCut, 500);
    }
    labelsEl.innerHTML = st.res.filter(r => r.kind === 'calc' && shown(r) && pass(r)).map(r => {
      const s = status(r), e = eOf(r);
      return `<button class="kl kl-${s.k}${st.sel === r ? ' on' : ''}" data-i="${st.res.indexOf(r)}" title="${esc(r.title)}"><b>${esc(r.nums)}</b> ${e === null ? '—' : f2(e)}%</button>`;
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
  // сечение изменено (в т.ч. инструментом этажей Viewer) — перерисовать наложения нужного уровня
  let cutTimer = null, cutPoll = null;
  // имя события в LMV — CUTPLANES_CHANGE_EVENT («cutplanesChanged»); CUT_PLANES_CHANGE_EVENT не существует (addEventListener с undefined падает)
  const EV_CUT = Autodesk.Viewing.CUTPLANES_CHANGE_EVENT || Autodesk.Viewing.CUT_PLANES_CHANGE_EVENT || null;
  function onCut() { clearTimeout(cutTimer); cutTimer = setTimeout(() => { if (visLevel() !== st.drawn) draw(); }, 50); }
  const centroid = r => { if (!r.runs || !r.runs.length) return null; let a = 0, x = 0, y = 0; r.runs.forEach(q => { const s = (q[1] - q[0]) * (q[3] - q[2]); a += s; x += s * (q[0] + q[1]) / 2; y += s * (q[2] + q[3]) / 2; }); return [x / a, y / a]; };

  /* ---------- вид «план уровня» ---------- */
  function planView(levelName) {
    const v = C.v, L = st.levels.find(l => l.name === levelName) || st.levels[0]; if (!L) return;
    st.level = L.name; st.plan = true;
    v.setCutPlanes([new THREE.Vector4(0, 0, 1, -(L.floor + 1.3) / C.S)]);
    const runs = st.res.filter(r => r.level === L.name && r.runs).flatMap(r => r.runs);
    const bx = new THREE.Box3(); runs.forEach(q => { bx.expandByPoint(new THREE.Vector3(q[0] / C.S, q[2] / C.S, L.floor / C.S)); bx.expandByPoint(new THREE.Vector3(q[1] / C.S, q[3] / C.S, (L.floor + 1.3) / C.S)); });
    topView(bx);
    draw(); renderList();
  }
  function topView(bx) {
    const v = C.v, c = bx.getCenter(new THREE.Vector3()), sz = bx.getSize(new THREE.Vector3());
    const h = Math.max(sz.x, sz.y) * 1.3;
    v.navigation.setView(new THREE.Vector3(c.x, c.y, c.z + h), c); v.navigation.setCameraUpVector(new THREE.Vector3(0, 1, 0));
    v.navigation.fitBounds(false, bx);
  }
  function view3d() { const v = C.v; st.plan = false; v.setCutPlanes([]); v.fitToView(); draw(); }

  /* ---------- выбор пространства: подсветка его окон и фонарей ---------- */
  function select(r, fly = true) {
    st.sel = r; draw(); renderList();
    const v = C.v;
    const ids = [...(r.ops || []), ...(r.lans || [])].map(o => o.id);
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
#keo-bim .bdg{display:inline-block;border:1px solid var(--line-2);border-radius:9px;padding:0 6px;font-size:10.5px;color:var(--muted);margin-left:4px;white-space:nowrap}#keo-bim .bdg.w{border-color:#c99a06;color:#8a6a00}
#keo-bim .kb-warn{background:#fff6dc;border:1px solid #e8cf86;border-radius:6px;padding:6px 8px;margin:6px 0;font-size:12px}
#keo-labels{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden}
#keo-labels .kl{position:absolute;left:0;top:0;pointer-events:auto;border:0;border-radius:5px;padding:1px 5px;font:11px/1.3 system-ui,sans-serif;color:#fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer}
#keo-labels .kl b{font-weight:600;opacity:.85}#keo-labels .kl.on{outline:2px solid #1b2329}
#keo-labels .kl-ok{background:${COL.ok}}#keo-labels .kl-bad{background:${COL.bad}}#keo-labels .kl-none{background:${COL.none}}#keo-labels .kl-err{background:${COL.err}}`;

  function pass(r) {
    if (st.level !== null && r.level !== st.level) return false;
    const k = status(r).k;
    return st.filter === 'all' ? r.kind === 'calc' : st.filter === 'bad' ? k === 'bad' : st.filter === 'check' ? ambiguous(r) || r.kind === 'nogeo' || r.kind === 'unknown' : st.filter === 'other' ? r.kind !== 'calc' || k === 'none' || k === 'err' : true;
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
  function destroy() { clearInterval(cutPoll); ui?.remove(); labelsEl?.remove(); labelsEl = null; try { C.v.overlays.removeScene(overlay); C.v.setCutPlanes([]); C.v.clearThemingColors(C.m); C.v.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, place); if (EV_CUT) C.v.removeEventListener(EV_CUT, onCut); } catch (e) { } }
  const statusLine = t => { const el = document.getElementById('kb-status'); if (el) el.textContent = t; };

  // сводка по помещениям Revit: каждое помещение — ровно в одном пространстве, в списке «без контура» или исключено
  function census() {
    const all = (st.rooms || []), cnt = new Map();
    st.res.forEach(r => r.kind !== 'nogeo' && r.rooms.forEach(rm => cnt.set(rm.key, (cnt.get(rm.key) || 0) + 1)));
    const ex = all.filter(isExcluded).length, inSp = [...cnt.values()].filter(n => n === 1).length, dup = [...cnt.values()].filter(n => n > 1).length;
    const nogeo = st.res.filter(r => r.kind === 'nogeo').length, units = all.filter(r => r.warn && r.warn.length).length;
    return { all: all.length, ex, inSp, dup, nogeo, units, noLevel: (st.noLevel || []).length, lans: LANS.length, lansIn: LANS.filter(l => l.lvl).length };
  }
  function renderList() {
    const main = document.getElementById('kb-main'); if (!main) return;
    const calc = st.res.filter(r => r.kind === 'calc' && (st.level === null || r.level === st.level));
    const n = k => calc.filter(r => status(r).k === k).length;
    const other = st.res.filter(r => (st.level === null || r.level === st.level) && r.kind !== 'calc');
    const nChk = st.res.filter(r => (st.level === null || r.level === st.level) && (ambiguous(r) || r.kind === 'nogeo' || r.kind === 'unknown')).length;
    const lvBtns = st.levels.map(l => `<button class="kb-btn${st.level === l.name ? ' on' : ''}" data-lv="${esc(l.name)}">План ${esc(l.name)}</button>`).join('');
    const rows = st.res.filter(pass).sort((a, b) => (a.level + a.nums).localeCompare(b.level + b.nums, 'ru', { numeric: true }));
    const cs = census();
    const badges = r => [r.mode && r.mode !== 'side' ? `<span class="bdg">${MODE[r.mode]}</span>` : '', r.sp && r.sp.merged ? `<span class="bdg${r.sp.manual ? '' : ' w'}">${r.sp.manual ? 'объединено вручную' : 'объединено авто'}</span>` : '',
      r.sp && (r.sp.balance.length || r.sp.neighbours.length || r.sp.dup || r.sp.unknown.length) ? '<span class="bdg w">уточните состав</span>' : '', r.area && r.area.warn ? '<span class="bdg w">площадь ≠ контур</span>' : ''].join('');
    main.innerHTML = `
      <div class="kb-row">${lvBtns}<button class="kb-btn${!st.plan ? ' on' : ''}" data-a="3d">3D</button></div>
      <div class="kb-sum"><div><b>${calc.length}</b>рассчитано</div><div style="color:${COL.ok}"><b>${n('ok')}</b>норма</div><div style="color:${COL.bad}"><b>${n('bad')}</b>ниже нормы</div><div class="muted"><b>${n('none') + n('err') + other.length}</b>прочие</div></div>
      <div class="kb-row"><button class="kb-btn${st.filter === 'all' ? ' on' : ''}" data-f="all">Все рассчитанные</button><button class="kb-btn${st.filter === 'bad' ? ' on' : ''}" data-f="bad">Ниже нормы</button><button class="kb-btn${st.filter === 'check' ? ' on' : ''}" data-f="check">Проверить состав (${nChk})</button><button class="kb-btn${st.filter === 'other' ? ' on' : ''}" data-f="other">Без расчёта</button></div>
      <div id="kb-detail"></div>
      <table class="kb-t"><thead><tr><th>№</th><th>Пространство</th><th class="num">e, %</th><th class="num">e<sub>н</sub>, %</th><th>Итог</th></tr></thead><tbody>
      ${rows.map(r => { const s = status(r), e = eOf(r), en = enOf(r); return `<tr class="r${st.sel === r ? ' sel' : ''}" data-i="${st.res.indexOf(r)}"><td>${esc(r.nums)}</td><td>${esc(r.rooms.length ? r.rooms.map(x => x.name).join(' + ') : r.title)}${badges(r)}<div class="muted" style="font-size:11px">${esc(r.level)}</div></td><td class="num">${e === null ? '—' : f2(e)}</td><td class="num">${en === null || en === undefined ? '—' : f2(en, 1)}</td><td><span class="chip c-${s.k}">${esc(s.t)}</span></td></tr>`; }).join('')}
      </tbody></table>
      <p class="muted" style="font-size:11px">Помещений Revit: ${cs.all}; в расчётных пространствах — ${cs.inSp}${cs.dup ? `, <b style="color:${COL.bad}">в двух пространствах сразу — ${cs.dup}</b>` : ''}; без контура — ${cs.nogeo}; исключено (ЛК, коридоры, холлы, вестибюли) — ${cs.ex}${cs.units ? `; <b>не распознаны единицы площади — ${cs.units}</b>` : ''}${cs.noLevel ? `; без уровня — ${cs.noLevel}` : ''}. Фонарей найдено: ${cs.lans}, привязано к помещениям: ${cs.lansIn}.</p>
      ${lanOverview()}
      <p class="muted" style="font-size:11px">${esc(PRELIM)} Север: ${esc(st.north ? st.north.src : '—')}.</p>
      <details class="kb-set"><summary>Исходные допущения и настройки</summary>${settingsHTML()}</details>
      <div class="kb-row" style="margin-top:10px"><button class="kb-btn" data-a="csv">Таблица (CSV)</button><button class="kb-btn" data-a="json">Все исходные (JSON)</button><button class="kb-btn" data-a="dexp">Решения по составу (JSON)</button><button class="kb-btn" data-a="dimp">Загрузить решения</button>${st.dec.merge.length || st.dec.split.length || (st.dec.assign || []).length || Object.keys(st.dec.lanterns || {}).length || Object.keys(st.normOv).length ? '<button class="kb-btn" data-a="dclr">Сбросить решения</button>' : ''}</div>
      <p class="muted" style="font-size:11px">Контуры восстановлены по срезу модели на высоте ${f2(S.cut, 1)} м над полом: помещения Revit опознаются по контуру с линиями разделения, состав расчётного пространства и затенение — по физическим стенам, перегородкам и витражам (линии разделения не считаются стенами). Расчёт — ядром калькулятора КЕО (СП 367.1325800.2025, прил. Б: Б.1 — боковое, Б.3 — верхнее, Б.4 — комбинированное). Экспериментальная версия: нормативная точность на модели не подтверждена.</p>`;
    main.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => planView(b.dataset.lv));
    main.querySelector('[data-a="3d"]').onclick = () => { st.level = null; view3d(); renderList(); labels(); };
    main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; renderList(); labels(); });
    main.querySelectorAll('tr.r').forEach(tr => tr.onclick = () => select(st.res[+tr.dataset.i]));
    main.querySelector('[data-a=csv]').onclick = exportCSV; main.querySelector('[data-a=json]').onclick = exportJSON;
    main.querySelector('[data-a=dexp]').onclick = () => download('КЕО_решения_по_составу.json', JSON.stringify({ model: modelKey(), merge: st.dec.merge, split: st.dec.split, assign: st.dec.assign, lanterns: st.dec.lanterns, normOv: st.normOv, names: Object.fromEntries((st.rooms || []).map(r => [r.key, `${r.level} · ${r.num} ${r.name}`])) }, null, 1), 'application/json');
    main.querySelector('[data-a=dimp]').onclick = importDec;
    main.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { const [k, v] = [b.dataset.lt, b.dataset.v]; st.dec.lanterns = st.dec.lanterns || {}; if (v) st.dec.lanterns[k] = v; else delete st.dec.lanterns[k]; saveDec(); st.levels.forEach(l => rebuild(l.name)); });
    main.querySelectorAll('[data-lid]').forEach(b => b.onclick = () => { const id = +b.dataset.lid; C.v.clearThemingColors(C.m); C.v.setThemingColor(id, new THREE.Vector4(0.85, 0.27, 0.23, 1), C.m); C.v.fitToView([id], C.m); });
    const dc = main.querySelector('[data-a=dclr]'); if (dc) dc.onclick = () => { st.dec = { merge: [], split: [], assign: [], lanterns: {} }; st.normOv = {}; saveDec(); st.levels.forEach(l => rebuild(l.name)); };
    bindSettings(main);
    renderDetail();
  }
  // все кандидаты в фонари и элементы с именем фонаря: что найдено, к чему привязано, что учтено и почему
  function lanOverview() {
    const D = st.lanDiag || []; if (!D.length) return '<p class="muted" style="font-size:11px">Фонарей в модели не найдено: нет окон, панелей, кровель или обобщённых моделей со стеклом, обращённым вверх, и элементов с именем фонаря.</p>';
    const types = new Map(); LANS.forEach(l => { const k = lanKey(l); if (!types.has(k)) types.set(k, { k, l, n: 0 }); types.get(k).n++; });
    const used = LANS.filter(l => l.lvl && l.space >= 0 && lanConf(l) === 'b3' && !l.shaded).length, pend = LANS.filter(l => !lanConf(l)).length;
    const row = l => `<tr><td><button class="kb-btn" data-lid="${l.id}" title="Показать в модели">${l.id}</button></td><td>${esc(l.label || l.cat)}</td><td>${l.roof ? `${lanDim(l)}, ${l.tilt === null || l.tilt === undefined ? '?' : f2(l.tilt, 0) + '°'}` : '—'}</td><td>${esc(l.roof ? (l.lvl ? `${l.lvl}${l.space >= 0 ? '' : ''}` : '—') : '—')}</td><td>${esc(l.roof ? (l.why || LAN_ST({ ...l, conf: lanConf(l) })) : l.reason)}</td></tr>`;
    return `<details class="kb-set"${pend ? ' open' : ''}><summary>Фонари в модели: кандидатов ${LANS.length}, учтено ${used}${pend ? `, <b>требуют подтверждения типа: ${pend}</b>` : ''}</summary>
      ${[...types.values()].map(T => `<p style="font-size:12px;margin:6px 0"><b>${esc(T.l.label || T.l.cat)}</b> — ${T.n} шт., стекло ${T.l.glass ? `наклон ${f2(T.l.tilt, 0)}°` : 'не выделено материалом'}${T.l.auto ? ', тип определён автоматически (горизонтальное стекло, имя фонаря)' : ''}. Тип: <button class="kb-btn${lanConf(T.l) === 'b3' ? ' on' : ''}" data-lt="${esc(T.k)}" data-v="b3">Зенитный / шахтный (Б.3)</button> <button class="kb-btn${lanConf(T.l) === 'skip' ? ' on' : ''}" data-lt="${esc(T.k)}" data-v="skip">Не фонарь</button>${(st.dec.lanterns || {})[T.k] ? ` <button class="kb-btn" data-lt="${esc(T.k)}" data-v="">Авто</button>` : ''}</p>`).join('')}
      <p class="muted" style="font-size:11px">Фонари-надстройки и проёмы в покрытии с вертикальным/наклонным остеклением (Б.2) по модели не считаются — для них «Не фонарь» и расчёт в калькуляторе вручную.</p>
      <table class="kb-t"><tr><th>ID</th><th>Семейство : тип</th><th>отверстие, наклон</th><th>Уровень</th><th>Статус / причина</th></tr>${D.map(row).join('')}</table></details>`;
  }
  function importDec() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { const j = JSON.parse(t); st.dec = { merge: j.merge || [], split: j.split || [], assign: j.assign || [], lanterns: j.lanterns || {} }; st.normOv = j.normOv || {}; saveDec(); st.levels.forEach(l => rebuild(l.name)); }).catch(e => statusLine('Не удалось прочитать решения: ' + e.message)); };
    inp.click();
  }
  function settingsHTML() {
    const opt = (list, cur) => list.map((x, i) => `<option value="${i}"${+cur === i ? ' selected' : ''}>${esc(x.t)} — ${f2(x.v)}</option>`).join('');
    const groups = [...new Set(LIB.DATA.rooms.map(r => r.g))];
    return `<label>Тип здания (табл. А.1) <select data-s="bGroup"><option value="">определить по названиям</option>${groups.map(g => `<option${S.bGroup === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label>Группа района по ресурсам светового климата <input type="number" min="1" max="5" step="1" data-s="group" value="${S.group}"></label>
      <label>ρср — средневзвешенный коэффициент отражения <input type="number" step="0.01" data-s="rho" value="${S.rho}"></label>
      <label>τ1 окон — светопропускание <select data-s="t1">${opt(LIB.DATA.tau1, S.t1)}</select></label>
      <label>τ2 окон — переплёты <select data-s="t2">${opt(LIB.DATA.tau2, S.t2)}</select></label>
      <label>τ1 фонарей <select data-s="lt1">${opt(LIB.DATA.tau1, S.lt1)}</select></label>
      <label>τ2 фонарей <select data-s="lt2">${opt(LIB.DATA.tau2, S.lt2)}</select></label>
      <label>ρ стенок шахты фонаря <input type="number" step="0.05" data-s="lrho" value="${S.lrho}"></label>
      <label>ρф — отражение фасадов противостоящих зданий <input type="number" step="0.05" data-s="rhoF" value="${S.rhoF}"></label>
      <label>Не рассчитывать и не объединять автоматически (имя содержит) <input type="text" data-s="exclude" value="${esc(S.exclude)}"></label>
      <label>Высота среза для контуров, м <input type="number" step="0.1" data-s="cut" value="${S.cut}"></label>
      <label>Поправка на север, ° по часовой (пусто — из модели) <input type="text" data-s="northDeg" value="${esc(S.northDeg)}"></label>
      <p class="muted" style="font-size:11px">Тип здания для норм: ${esc(st.group || 'не определён')}. Норма пространства из нескольких помещений — наибольшая из норм входящих помещений. Ориентация — по истинному северу из модели. Затенение окон: козырьки и балконы — лучами по модели (K, табл. Б.19), противостоящие здания — по карте высот (схема № 1, εзд, bф, Kзд); перегородки внутри пространства закрывают часть окна для расчётной точки. Фонари — прозрачные элементы, обращённые вверх (окна и панели в кровле, стеклянные кровли, обобщённые модели с «фонарь/зенит/skylight» в имени); перекрытия и потолки фонарями не считаются.</p>
      <div class="kb-row"><button class="kb-btn pri" data-a="rerun">Пересчитать</button></div>`;
  }
  function bindSettings(root) {
    root.querySelectorAll('[data-s]').forEach(el => el.onchange = () => { const k = el.dataset.s; S[k] = (el.type === 'text' || k === 'bGroup') ? el.value : +el.value; });
    root.querySelector('[data-a=rerun]').onclick = () => run();
  }

  function areaHTML(r) {
    if (!r.rooms.length) return '';
    const A = r.area, rows = r.rooms.map(rm => `<tr><td>${esc(rm.num)}</td><td>${esc(rm.name)}${rm.byBalance !== undefined ? ' <span class="bdg w">по балансу площадей</span>' : rm.byUser ? ' <span class="bdg">назначено вручную</span>' : ''}</td><td class="num">${rm.area > 0 ? f2(rm.area) : '—'}</td><td class="muted">${rm.areaRaw !== undefined ? esc(`${f2(+rm.areaRaw, 3)} ${UNIT[rm.areaUnit] || rm.areaUnit || ''}`) : '—'}</td><td class="muted">${esc(rm.eid || rm.key)}</td></tr>`).join('');
    let h = `<h3>Помещения Revit и площадь</h3><table class="kb-t"><tr><th>№</th><th>Помещение</th><th class="num">S, м²</th><th>в модели</th><th>ElementId</th></tr>${rows}</table>`;
    if (A) h += `<p class="muted" style="font-size:12px">Площадь Revit (свойство Area${r.rooms.length > 1 ? ', сумма без повторов' : ''}): <b>${f2(A.revit)}</b> м². По контуру среза: ${f2(A.model, 1)} м² в чистоте, ${f2(A.modelV, 1)} м² до осей стен${A.dA !== null ? `, расхождение ${f2(A.dA * 100, 1)} %` : ''}. Для расчёта используется контур среза (L, B, dп), площадь Revit — для сверки.</p>`;
    if (A && A.warn) h += `<div class="kb-warn">Площадь Revit и площадь контура расходятся больше чем на 5 % — проверьте состав пространства (объединение, линии разделения) и границы помещения в модели.</div>`;
    r.rooms.filter(rm => rm.warn && rm.warn.length).forEach(rm => h += `<div class="kb-warn">${esc(rm.num)}: ${esc(rm.warn.join('; '))}</div>`);
    return h;
  }
  function compHTML(r) {
    const sp = r.sp, U = sp ? sp.unknown : r.unk ? [r.unk] : [];
    let h = '';
    U.forEach((u, i) => h += `<div class="kb-warn">${sp ? `В объёме есть часть ${f2(u.area, 1)} м² без помещения Revit` : 'Часть здания без помещения Revit'} (не выделена линиями разделения). ${u.cands.length ? 'Подходят по площади (в чистоте ' + f2(u.area, 1) + ' м², до осей ' + f2(u.areaV, 1) + ' м²):' : 'По площади однозначно не подбирается — посчитайте вручную.'}${u.cands.map((c, j) => `<br>${esc(c.label)} (${f2(c.sum)} м²) <button class="kb-btn" data-asg="${i}:${j}">Это они</button>`).join('')}</div>`);
    if (!sp) return h;
    if (sp.merged) h += `<p style="font-size:12px">Одно расчётное пространство из ${sp.rooms.length} помещений Revit: между ними нет сплошной стены и двери (только линия разделения). Перегородки внутри учитываются как препятствие для света. ${sp.manual ? '<b>Решение пользователя.</b>' : 'Объединено автоматически.'} <button class="kb-btn" data-dec="split">Считать раздельно</button></p>`;
    // основание включения каждого помещения и проходы между помещениями
    const nm = k => { const x = [...sp.rooms, ...sp.neighbours].find(r => r.key === k); return x ? `${x.num} ${x.name}` : k; };
    h += `<details><summary>Состав: основание включения помещений</summary><ul style="font-size:12px;margin:4px 0;padding-left:18px">${sp.rooms.map(rm => `<li>${esc(rm.num + ' ' + rm.name)} — ${rm.byUser ? 'назначено пользователем' : rm.byBalance !== undefined ? 'подобрано по площади (единственный вариант)' : `собственный контур в срезе (расхождение площади ${f2((rm.dA || 0) * 100, 1)} %)`}</li>`).join('')}${(sp.links || []).map(l => `<li>${esc(nm(l.a))} ↔ ${esc(nm(l.b))}: проход без двери ≈ ${f2(l.w, 1)} м (только линия разделения)${l.inside ? '' : ' — помещение не включено'}</li>`).join('')}</ul><span class="muted" style="font-size:11px">Двери без остекления считаются закрытыми и разделяют пространства; совпадение площади само по себе основанием для объединения не является.</span></details>`;
    if (sp.balance.length) h += `<div class="kb-warn">${sp.balance.map(rm => esc(rm.num + ' ' + rm.name)).join(', ')} — собственный контур не выделен по срезу (нет линии разделения); отнесено к контуру с той же площадью — единственный вариант по площади. Проверьте.</div>`;
    if (sp.dup) h += `<div class="kb-warn">В одном физическом объёме несколько помещений одного назначения — считаются раздельно. Если это одно помещение, объедините.</div>`;
    { const mix = !sp.manual && seriesMix(sp); if (mix) h += `<div class="kb-warn">В одном физическом объёме помещения из разных серий номеров: ${mix.map(rm => esc(rm.num + ' ' + rm.name)).join(', ')}. Помещения сопоставлены с контурами только по площади — проверьте, что контур не получил чужое помещение той же площади (типовые ячейки).</div>`; }
    { const lo = sp.rooms.filter(x => x.loose); if (lo.length) h += `<div class="kb-warn">Контур опознан с допуском до 10 % (единственная подходящая пара): ${lo.map(rm => `${esc(rm.num + ' ' + rm.name)} — Area ${f2(rm.area)} м², контур ${f2(rm.areaModel, 1)} м²`).join('; ')}. Обычно контур урезан нишей или шкафом.</div>`; }
    if ((sp.auxNb || []).length) h += `<div class="kb-warn">Открытый проход без двери в помещение без нормы КЕО: ${sp.auxNb.map(rm => esc(rm.num + ' ' + rm.name)).join(', ')} — в расчётное пространство не включено, его стены остаются препятствием для света. Если это часть помещения (ниша), объедините.</div>`;
    const nb = sp.neighbours.filter(x => !sp.rooms.includes(x));
    if (nb.length) h += `<p style="font-size:12px">В том же физическом объёме (открытый проход): ${nb.map(rm => `${esc(rm.num + ' ' + rm.name)}${isExcluded(rm) ? ' <span class="bdg">исключено</span>' : ''} <button class="kb-btn" data-merge="${esc(rm.key)}">Объединить</button>`).join(' ')}<br><span class="muted">Коридоры, холлы и другие исключённые помещения автоматически не объединяются.</span></p>`;
    if (sp.manual && !sp.merged) h += `<p class="muted" style="font-size:12px">Считается отдельно по решению пользователя. <button class="kb-btn" data-dec="reset">Вернуть авто</button></p>`;
    return h;
  }
  // размер отверстия фонаря: круглый — ⌀ верх/низ шахты (D1/D2), прямоугольный — a×b
  const lanDim = l => l.round || l.dTop ? `⌀${f2(l.dTop || l.d)}${l.dBot && l.dBot !== l.dTop ? '/' + f2(l.dBot) : ''}` : `${f2(l.av)}×${f2(l.bv)}`;
  const LAN_ST = l => l.conf === 'skip' ? 'не фонарь (решение)' : !l.conf ? 'тип не подтверждён — не учтён' : l.shaded ? 'не учтён: ' + l.shaded : 'учтён (Б.3)';
  function lansHTML(r) {
    const ls = r.lans || []; if (!ls.length) return '';
    const con = new Map((r.lanContrib || []).map(c => [c.id, c.e]));
    return '<h3>Фонари</h3><table class="kb-t"><tr><th>ID, семейство : тип</th><th>отверстие, м</th><th>наклон</th><th class="num">H / hш, м</th><th>Статус</th><th class="num">вклад eв по РТ, %</th></tr>' + ls.map(l => `<tr><td>${esc(String(l.id))}<div class="muted">${esc(l.label || l.type || l.cat)}</div></td><td>${lanDim(l)}<div class="muted">${l.round || l.dTop ? 'стекло ⌀' + f2(l.d || l.av) : 'оси ' + esc(l.ori || '')}</div></td><td>${l.tilt === null || l.tilt === undefined ? '?' : f2(l.tilt, 0) + '°'}</td><td class="num">${l.H ? f2(l.H) : '<b>?</b>'} / ${l.hsf !== undefined ? f2(l.hsf) : '<b>?</b>'}</td><td>${esc(LAN_ST(l))}${l.note ? `<div class="muted">${esc(l.note)}</div>` : ''}</td><td class="num">${con.has(l.id) ? con.get(l.id).map(x => f2(x, 3)).join('<br>') : '—'}</td></tr>`).join('') + '</table>';
  }
  function pointsHTML(r) {
    if (r.mode === 'comb') {
      const c = r.comb;
      return `<h3>Расчётные точки (Б.4: e = eв + eб)</h3><table class="kb-t"><tr><th>РТ</th><th class="num">eв, %</th><th class="num">eб, %</th><th class="num">e, %</th></tr>${c.e.map((e, j) => `<tr><td>${j + 1}</td><td class="num">${f2(c.eTop[j], 3)}</td><td class="num">${f2(c.eSide[j], 3)}</td><td class="num">${f2(e, 3)}</td></tr>`).join('')}</table>
        <p class="muted" style="font-size:12px">eср (Б.10) = ${f2(c.eAvgR)} %, eмин = ${f2(c.eMin, 3)} %, равномерность eмин/eср = ${f2(c.uni, 3)} (не менее 1/3, п. 5.6 СП 52) — ${c.uniOk ? 'выполняется' : '<b>не выполняется</b>'}. eб в каждой точке — по формуле Б.1 через видимые из точки участки окон.</p>`;
    }
    if (r.mode === 'top') { const R = r.C.res; return `<h3>Расчётные точки (Б.3)</h3><table class="kb-t"><tr><th>РТ</th><th class="num">eв, %</th></tr>${R.e.map((e, j) => `<tr><td>${j + 1}</td><td class="num">${f2(e, 3)}</td></tr>`).join('')}</table><p class="muted" style="font-size:12px">eср (Б.10) = ${f2(R.eAvgR)} %, равномерность eмин/eср = ${f2(R.uni, 3)} (не менее 1/3) — ${r.C.uniOk ? 'выполняется' : '<b>не выполняется</b>'}.</p>`; }
    return '';
  }
  function renderDetail() {
    const box = document.getElementById('kb-detail'); if (!box) return; const r = st.sel;
    if (!r) { box.innerHTML = '<p class="muted">Нажмите на строку таблицы или на метку в модели — откроется разбор.</p>'; return; }
    const s = status(r), e = eOf(r);
    let h = `<div class="kb-card"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${esc(r.title)}</b><div class="muted">${esc(r.level)}${r.mode ? ' · ' + MODE[r.mode] + ' освещение' : ''}</div></div><span class="chip c-${s.k}" style="align-self:start">${esc(s.t)}</span></div>`;
    const ok = r.kind === 'calc' && (r.comb || (r.C && r.C.ok));
    if (ok) {
      const n = r.comb ? r.comb.norm : r.C.norm;
      h += `<div style="display:flex;gap:16px;align-items:baseline;margin:8px 0"><div><span class="kb-big">${f2(e)}</span> %<div class="muted">${r.mode === 'side' ? 'расчётный e<sub>р</sub>' : 'e<sub>ср</sub> по точкам'}</div></div><div><span class="kb-big" style="font-weight:500">${n.v === null || n.v === undefined ? '—' : f2(n.v)}</span> %<div class="muted">нормируемый e<sub>н</sub></div></div></div>`;
      h += `<div class="muted" style="font-size:12px">${n.room ? `Норма: табл. А.1 СП 367, п. ${n.room.n} «${esc(n.room.name)}», ${esc(n.colName)}` : 'Назначение не найдено в табл. А.1 — норма не задана'}.${r.mode === 'side' ? ` Точка: ${r.multi ? 'центр пространства (проёмы в нескольких стенах)' : esc(LIB.KEO.RT_TEXT[r.row ? r.row.rt : 'center'])}, ${r.row && r.row.h === 0 ? 'на полу' : 'на УРП 0,8 м'}.` : ` Точки — на характерном разрезе по главной оси пространства (${r.pts.length} шт.).`}</div>`;
    }
    h += compHTML(r) + areaHTML(r);
    if (ok) {
      if (r.mode === 'side' || r.mode === 'comb') {
        const ws = r.mode === 'side' ? r.C.res.walls.map((w, i) => ({ w, W: r.st.side.walls[i] })) : (r.comb.sideAt[Math.floor(r.comb.sideAt.length / 2)].walls || []).map((w, i) => ({ w, W: r.comb.sideAt[Math.floor(r.comb.sideAt.length / 2)].st.side.walls[i] }));
        if (ws.length) h += `<h3>Окна и затенение${r.mode === 'comb' ? ' (для средней точки)' : ''}</h3><table class="kb-t"><tr><th>Стена</th><th>Окна (bо×hо, hпд), м</th><th>Затенение</th><th class="num">e, %</th></tr>` + ws.map(({ w, W }) => {
          const sh = [W.kType !== 'none' ? `козырёк/балкон ${f2(W.kDepth, 1)} м (K = ${f2(w.wins[0].K)})` : '', ...W.buildings.map(b => `здание l = ${f2(b.l, 1)} м, Hр = ${f2(b.Hp, 1)} м`)].filter(Boolean).join('; ') || 'нет';
          const az = (r.geo || []).find(g => g.f && W.orient === Cc.oriOf(g.az));
          return `<tr><td>${esc(W.orient)}${az ? ` <span class="muted">(${f2(((az.az - st.north.rot) % 360 + 360) % 360, 0)}° в осях модели ${st.north.rot >= 0 ? '+' : '−'} ${f2(Math.abs(st.north.rot), 1)}° = ${f2(az.az, 0)}° от севера)</span>` : ''}<div class="muted">lт ${f2(W.lt)} · dп ${f2(W.dp)} · Δст ${f2(W.dst)}</div></td><td>${W.windows.map(x => `${f2(x.bo)}×${f2(x.ho)}, ${f2(x.hpd)}`).join('<br>')}</td><td>${esc(sh)}</td><td class="num">${f2(w.e, 3)}</td></tr>`;
        }).join('') + `</table><p class="muted" style="font-size:11px">Ориентация — по наружной нормали каждого проёма; север: ${esc(st.north.src)}.</p>`;
      }
      h += lansHTML(r) + pointsHTML(r);
      const warn = [...(r.notes || []), ...(r.C && r.C.warn || [])];
      if (warn.length) h += `<p class="muted" style="font-size:11.5px">${[...new Set(warn)].map(esc).join('<br>')}</p>`;
      if (r.C && r.C.ok) h += `<details><summary>Полный разбор: формулы, коэффициенты, схема${r.mode === 'comb' ? ' (верхний свет, Б.3)' : ''}</summary><div class="rep">${reportHTML(LIB.KEO.buildModel(r.st, r.C))}</div></details>`;
      h += `<div class="kb-row" style="margin-top:8px"><button class="kb-btn" data-a="one">Исходные для калькулятора (.json)</button></div>`;
      const rowsA1 = LIB.DATA.rooms.slice().sort((a, b) => (b.g === st.group) - (a.g === st.group));
      h += `<label class="muted" style="display:block;font-size:12px">Назначение по табл. А.1: <select data-norm style="max-width:100%"><option value="">авто (по названиям помещений)</option>${['<option value="-"' + (st.normOv[r.key] === '-' ? ' selected' : '') + '>— без нормы КЕО —</option>', ...rowsA1.map(x => `<option value="${x.id}"${st.normOv[r.key] === x.id ? ' selected' : ''}>${esc(x.n + '. ' + x.name + ' (' + x.g.slice(0, 40) + ')')}</option>`)].join('')}</select></label>`;
      h += `<p class="muted" style="font-size:11px">${esc(PRELIM)}</p>`;
    } else if (r.kind === 'calc' && r.C && !r.C.ok) {
      h += `<p class="muted">${esc((r.C.err || []).join('; '))}</p>`;
    } else if (r.kind === 'err') {
      h += `<p class="muted">${esc(r.err)}</p>` + lansHTML(r) + ((r.notes || []).length ? `<p class="muted" style="font-size:11.5px">${r.notes.map(esc).join('<br>')}</p>` : '');
    } else if (r.kind === 'nogeo') h += `<p class="muted">${esc(r.why || '')} — помещение есть в модели, но его контур не удалось выделить по срезу и подобрать по балансу площадей. Посчитайте его в калькуляторе вручную или объедините с соседним помещением.</p>`;
    else if (r.kind === 'dark') h += `<p class="muted">${r.lanPending ? 'Окон нет; фонари есть, но их тип не подтверждён (раздел «Фонари в модели» ниже).' : 'У пространства нет наружных окон, витражей и фонарей.'}</p>` + lansHTML(r);
    else if (r.kind === 'unknown') h += `<p class="muted">После выбора помещений контур будет рассчитан как пространство.</p>`;
    box.innerHTML = h + '</div>';
    const sn = box.querySelector('[data-norm]'); if (sn) sn.onchange = () => { if (sn.value === '') delete st.normOv[r.key]; else st.normOv[r.key] = sn.value; saveDec(); rebuild(r.level); };
    const b1 = box.querySelector('[data-a=one]'); if (b1) b1.onclick = () => download(`КЕО_${r.nums}.json`, JSON.stringify(r.st, null, 2), 'application/json');
    const keys = r.rooms.map(x => x.key);
    box.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => decide(b.dataset.dec === 'split' ? 'split' : null, keys, r.level));
    box.querySelectorAll('[data-merge]').forEach(b => b.onclick = () => decide('merge', [...keys, b.dataset.merge], r.level));
    box.querySelectorAll('[data-asg]').forEach(b => b.onclick = () => { const [i, j] = b.dataset.asg.split(':').map(Number), u = (r.sp ? r.sp.unknown : [r.unk])[i]; decide('assign', u.cands[j].keys, r.level, u.at); });
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
    const rows = [['Уровень', 'Номера', 'Помещения Revit', 'ElementId', 'Площадь Revit, м2', 'Площадь контура, м2', 'Освещение', 'e, %', 'eн, %', 'Итог', 'Состав', 'Пункт табл. А.1']];
    st.res.forEach(r => { const s = status(r), e = eOf(r), en = enOf(r); rows.push([r.level, r.nums, r.rooms.map(x => x.name).join(' + '), r.rooms.map(x => x.eid || x.key).join(' + '), r.area ? f2(r.area.revit) : r.rooms[0] && r.rooms[0].area > 0 ? f2(r.rooms[0].area) : '', r.area ? f2(r.area.model) : '', r.mode ? MODE[r.mode] : '', e === null ? '' : f2(e), en === null || en === undefined ? '' : f2(en), s.t, r.sp ? (r.sp.merged ? (r.sp.manual ? 'объединено вручную' : 'объединено авто') : r.sp.manual ? 'раздельно (решение)' : '') : '', r.row ? r.row.n : '']); });
    download('КЕО_по_модели.csv', '﻿' + rows.map(x => x.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  }
  function exportJSON() {
    download('КЕО_по_модели.json', JSON.stringify({ settings: S, decisions: st.dec, normOv: st.normOv, spaces: st.res.filter(r => r.st).map(r => ({ level: r.level, rooms: r.rooms.map(x => ({ key: x.key, num: x.num, name: x.name, area: x.area, areaRaw: x.areaRaw, areaUnit: x.areaUnit })), mode: r.mode, e: eOf(r), comb: r.comb ? { eTop: r.comb.eTop, eSide: r.comb.eSide, e: r.comb.e, eAvgR: r.comb.eAvgR, uni: r.comb.uni } : undefined, state: r.st, notes: r.notes })) }, null, 1), 'application/json');
  }

  /* ---------- запуск ---------- */
  async function run(opts) {
    Object.assign(S, opts || {});
    if (!ui || !document.body.contains(ui)) mount();
    const t0 = performance.now();
    try {
      st.sel = null; await analyze(statusLine);
      const calc = st.res.filter(r => r.kind === 'calc');
      statusLine(`Готово за ${f2((performance.now() - t0) / 1000, 1)} с: рассчитано пространств — ${calc.length}.`);
      st.level = st.levels.length ? st.levels[st.levels.length - 1].name : null;
      draw(); renderList(); if (st.level) planView(st.level);
    } catch (e) { statusLine('Ошибка: ' + e.message); console.error(e); }
    return st;
  }
  return { run, st: () => st, S, select, planView, destroy, decide };
})();
try { if (window.KeoBim && window.KeoBim !== KeoBim && window.KeoBim.destroy) window.KeoBim.destroy(); } catch (e) { } // повторный запуск закладки: убрать панель, метки и обработчики прежней версии
window.KeoBim = KeoBim;
window.KeoBimLib = { BimGeom, BimCalc, BimSpaces };
