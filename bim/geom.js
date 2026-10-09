/* КЕО по модели Autodesk Viewer — геометрия: срезы, растр помещений, проёмы, карта высот.
   Работает внутри страницы с уже загруженной моделью (NOP_VIEWER). Единицы — метры, координаты — мировые координаты Viewer × масштаб единиц. */
const BimGeom = (function () {
  const deg = r => r * 180 / Math.PI;

  function ctx(v) {
    const m = v.model, it = m.getInstanceTree(), fl = m.getFragmentList();
    return { v, m, it, fl, S: m.getUnitScale(), GZ: (m.getData().globalOffset || { z: 0 }).z };
  }

  // элементы с категорией, уровнем, типом: листовые узлы и узлы со своей геометрией.
  // Имя — из дерева модели (getBulkProperties2 имени не возвращает: без этого имя семейства, напр. «Skywindow», не проверялось).
  // Экземпляр семейства с вложенным семейством (фонарь A_GMO_Skywindow_Angle: категория «Окна», внутри — обобщённая модель-обрамление)
  // не листовой, но сам несёт стекло — раньше он пропускался.
  async function catalog(C) {
    const ids = []; C.it.enumNodeChildren(C.it.getRootId(), id => { if (C.it.getChildCount(id) === 0) { ids.push(id); return; } let own = 0; C.it.enumNodeFragments(id, () => { own++; }, false); if (own) ids.push(id); }, true);
    const props = await new Promise((ok, bad) => C.m.getBulkProperties2(ids, { propFilter: ['Category', 'Type Name', 'Family Name'] }, ok, bad));
    const byCat = {}, info = {};
    props.forEach(r => { const g = n => (r.properties.find(p => p.attributeName === n) || {}).displayValue; const c = g('Category') || '—'; (byCat[c] = byCat[c] || []).push(r.dbId); info[r.dbId] = { c, type: g('Type Name') || '', fam: g('Family Name') || '', name: r.name || C.it.getNodeName(r.dbId) || '' }; });
    return { byCat, info };
  }

  // помещения из базы свойств (у них нет 3D-геометрии в экспорте viewer.autodesk.com); единицы — по dataTypeContext свойства
  async function rooms(C) {
    const raw = await C.m.getPropertyDb().executeUserFunction(function (pdb) {
      const out = [];
      pdb.enumObjects(id => {
        const o = { id, u: {} }; let isRoom = false;
        pdb.enumObjectProperties(id, (a, v) => {
          const d = pdb.getAttributeDef(a), n = d.name, val = pdb.getAttrValue(a, v);
          if (n === 'Category' && val === 'Revit Rooms') isRoom = true;
          if (n === 'Level' && isNaN(+val)) o.level = val; if (n === 'Name') o.name = val; if (n === 'Number') o.num = val;
          if (n === 'ElementId') o.eid = String(val);
          if (n === 'Area' || n === 'Perimeter' || n === 'Unbounded Height' || n === 'Base Offset') o.u[n] = [val, d.dataTypeContext || null];
          if (n === 'Department') o.dep = val; if (n === 'Occupancy') o.occ = val;
        });
        if (isRoom) out.push(o);
      });
      return out;
    });
    return raw.map(o => {
      const A = BimSpaces.conv(...(o.u['Area'] || []), 'area'), P = BimSpaces.conv(...(o.u['Perimeter'] || []), 'len'), H = BimSpaces.conv(...(o.u['Unbounded Height'] || []), 'len');
      const warn = [A.ok ? null : 'площадь: ' + A.warn, P.ok ? null : 'периметр: ' + P.warn].filter(Boolean);
      return { id: o.id, key: o.eid || ('db' + o.id), eid: o.eid, level: o.level, name: o.name || '', num: o.num || '', dep: o.dep, occ: o.occ,
        area: A.v, areaRaw: o.u['Area'] && o.u['Area'][0], areaUnit: A.unit, areaSrc: A.ok ? 'Revit, свойство Area' : null,
        per: P.v, h: H.v, warn };
    }).filter(r => r.area > 0 || r.warn.length);
  }

  // перебор треугольников / линий элемента в мировых координатах (единицы модели)
  function eachGeom(C, dbId, onTri, onLine, fragFilter) {
    const mat = new THREE.Matrix4();
    C.it.enumNodeFragments(dbId, f => {
      if (fragFilter && !fragFilter(f)) return;
      const g = C.fl.getGeometry(f); if (!g || !g.vb) return; C.fl.getWorldMatrix(f, mat); const e = mat.elements;
      const st = g.vbstride, off = (g.attributes.position.offset ?? g.attributes.position.itemOffset) || 0, vb = g.vb;
      const P = i => { const x = vb[i * st + off], y = vb[i * st + off + 1], z = vb[i * st + off + 2]; return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
      const ib = g.ib || (g.index && g.index.array);
      if (g.isLines) { if (!onLine) return; if (ib) for (let i = 0; i + 1 < ib.length; i += 2) onLine(P(ib[i]), P(ib[i + 1])); return; }
      if (!onTri || !ib) return;
      for (let i = 0; i + 2 < ib.length; i += 3) onTri(P(ib[i]), P(ib[i + 1]), P(ib[i + 2]));
    }, true);
  }

  // горизонтальный срез на отметке zM (м) → отрезки [x1,y1,x2,y2] в метрах
  function slice(C, cat, cats, zM, lineZ) {
    const S = C.S, z = zM / S, segs = [];
    cats.forEach(c => (cat.byCat[c] || []).forEach(id => eachGeom(C, id, (a, b, cc) => {
      const p = [a, b, cc], d = p.map(q => q[2] - z), pts = [];
      for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; if ((d[i] > 0) !== (d[j] > 0)) { const t = d[i] / (d[i] - d[j]); pts.push([(p[i][0] + t * (p[j][0] - p[i][0])) * S, (p[i][1] + t * (p[j][1] - p[i][1])) * S]); } }
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    }, lineZ ? (a, b) => { const z0 = lineZ[0] / S, tol = lineZ[1] / S; if (Math.abs(a[2] - z0) < tol && Math.abs(b[2] - z0) < tol) segs.push([a[0] * S, a[1] * S, b[0] * S, b[1] * S]); } : null)));
    return segs;
  }

  // растр среза и разметка связных свободных областей
  function bounds(segs) {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    segs.forEach(s => { minx = Math.min(minx, s[0], s[2]); maxx = Math.max(maxx, s[0], s[2]); miny = Math.min(miny, s[1], s[3]); maxy = Math.max(maxy, s[1], s[3]); });
    return [minx - 2, miny - 2, maxx + 2, maxy + 2];
  }
  // bx — общие границы, чтобы растры R и Rp совпадали поклеточно
  function raster(segs, cell, bx) {
    const [minx, miny, maxx, maxy] = bx || bounds(segs);
    const W = Math.ceil((maxx - minx) / cell), H = Math.ceil((maxy - miny) / cell);
    const occ = new Uint8Array(W * H);
    const put = (i, j) => { if (i >= 0 && j >= 0 && i < W && j < H) occ[j * W + i] = 1; };
    segs.forEach(s => {
      const x0 = (s[0] - minx) / cell, y0 = (s[1] - miny) / cell, x1 = (s[2] - minx) / cell, y1 = (s[3] - miny) / cell;
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
      for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + t * (x1 - x0), y = y0 + t * (y1 - y0), i = Math.floor(x), j = Math.floor(y); put(i, j); put(Math.floor(x + 0.3), j); put(i, Math.floor(y + 0.3)); }
    });
    const lab = new Int32Array(W * H), q = new Int32Array(W * H), regs = [null];
    for (let s0 = 0; s0 < W * H; s0++) {
      if (occ[s0] || lab[s0]) continue;
      const id = regs.length; let h = 0, t = 0; q[t++] = s0; lab[s0] = id; let cnt = 0, border = false, sx = 0, sy = 0;
      while (h < t) {
        const p = q[h++]; cnt++; const i = p % W, j = (p - i) / W; sx += i; sy += j;
        if (i === 0 || j === 0 || i === W - 1 || j === H - 1) border = true;
        if (i > 0 && !occ[p - 1] && !lab[p - 1]) { lab[p - 1] = id; q[t++] = p - 1; }
        if (i < W - 1 && !occ[p + 1] && !lab[p + 1]) { lab[p + 1] = id; q[t++] = p + 1; }
        if (j > 0 && !occ[p - W] && !lab[p - W]) { lab[p - W] = id; q[t++] = p - W; }
        if (j < H - 1 && !occ[p + W] && !lab[p + W]) { lab[p + W] = id; q[t++] = p + W; }
      }
      regs.push({ id, seed: s0, cells: cnt, area: cnt * cell * cell, border, cx: minx + (sx / cnt + 0.5) * cell, cy: miny + (sy / cnt + 0.5) * cell });
    }
    // граничные клетки → поправка площади на половину ширины линии растра
    const bnd = new Float64Array(regs.length);
    for (let p = 0; p < W * H; p++) { const id = lab[p]; if (!id) continue; const i = p % W; if ((i > 0 && lab[p - 1] !== id) || (i < W - 1 && lab[p + 1] !== id) || (p >= W && lab[p - W] !== id) || (p < W * (H - 1) && lab[p + W] !== id)) bnd[id]++; }
    regs.forEach(r => { if (r) { r.areaC = r.area + bnd[r.id] * cell * cell * 0.5; r.per = bnd[r.id] * cell; } });
    // площадь «до осей стен»: свободные области растут в занятые клетки (стены) навстречу друг другу, не более 0,3 м
    const own = new Int32Array(lab); let fr = [];
    for (let p = 0; p < W * H; p++) if (lab[p]) { const i = p % W; if ((i > 0 && !lab[p - 1]) || (i < W - 1 && !lab[p + 1]) || (p >= W && !lab[p - W]) || (p < W * (H - 1) && !lab[p + W])) fr.push(p); }
    for (let d = 1; d <= Math.round(0.3 / cell) && fr.length; d++) {
      const nf = [];
      fr.forEach(p => { const id = own[p], i = p % W; if (i > 0 && !lab[p - 1] && !own[p - 1]) { own[p - 1] = id; nf.push(p - 1); } if (i < W - 1 && !lab[p + 1] && !own[p + 1]) { own[p + 1] = id; nf.push(p + 1); } if (p >= W && !lab[p - W] && !own[p - W]) { own[p - W] = id; nf.push(p - W); } if (p < W * (H - 1) && !lab[p + W] && !own[p + W]) { own[p + W] = id; nf.push(p + W); } });
      fr = nf;
    }
    const add = new Float64Array(regs.length); for (let p = 0; p < W * H; p++) if (!lab[p] && own[p]) add[own[p]]++;
    regs.forEach(r => { if (r) r.areaV = r.area + add[r.id] * cell * cell; });
    return { W, H, cell, minx, miny, lab, regs, ext: new Set() };
  }
  const labelAt = (R, x, y) => { const i = Math.floor((x - R.minx) / R.cell), j = Math.floor((y - R.miny) / R.cell); if (i < 0 || j < 0 || i >= R.W || j >= R.H) return 1; return R.lab[j * R.W + i]; };

  // наружные области: касается края растра или большая несопоставленная область без перекрытия над ней (двор)
  function markExterior(C, R, zM) {
    R.regs.forEach(r => { if (r && r.border) R.ext.add(r.id); });
    const S = C.S;
    R.regs.forEach(r => {
      if (!r || r.border || r.room || r.areaC < 60) return;
      if (labelAt(R, r.cx, r.cy) !== r.id) return;
      const hit = C.v.impl.rayIntersect(new THREE.Ray(new THREE.Vector3(r.cx / S, r.cy / S, zM / S), new THREE.Vector3(0, 0, 1)), false);
      if (!hit) R.ext.add(r.id);
    });
  }

  // светопрозрачные элементы. Вертикальные — окна, витражи, остеклённые двери (по прозрачным фрагментам — стеклу).
  // Кандидаты в фонари — элементы кровли и окна/панели/обобщённые модели, у которых остекление обращено вверх (доля площади
  // стекла с |nz| > 0,5, т.е. наклон ≤ 60°) или имя семейства/типа указывает на фонарь. Для каждого кандидата сохраняется диагностика:
  // семейство, тип, площадь стекла, наклон, причина, почему элемент не принят. Перекрытия и потолки фонарями не считаются.
  const LANTERN_NAME = /фонар|зенит|sky ?light|sky ?window|roof ?light|roof ?window|мансардн|light ?well|световод|светов|купол|dome/i;
  const LANTERN_ZENITH = /зенит|sky ?light|sky ?window|roof ?light|фонар/i;
  function openings(C, cat, excludeRe) {
    const out = [], diag = [], mat4 = new THREE.Matrix4(), S = C.S, root = C.it.getRootId();
    // вложенный элемент проёма (обрамление, створка внутри окна/двери/панели) уже учтён в родителе — enumNodeFragments рекурсивен
    const HOST = new Set(['Revit Windows', 'Revit Curtain Panels', 'Revit Doors', 'Revit Skylights']);
    const nested = id => { for (let p = C.it.getNodeParentId(id); p && p !== root; p = C.it.getNodeParentId(p)) { const i = cat.info[p]; if (i && HOST.has(i.c)) return true; } return false; };
    ['Revit Windows', 'Revit Curtain Panels', 'Revit Doors', 'Revit Roofs', 'Revit Generic Models', 'Revit Skylights'].forEach(c => (cat.byCat[c] || []).forEach(id => {
      if (nested(id)) return;
      const inf = cat.info[id], label = [inf.fam, inf.type].filter(Boolean).join(' : ') || inf.name || '';
      const named = LANTERN_NAME.test([inf.type, inf.fam, inf.name].join(' '));
      if (excludeRe && excludeRe.test(inf.type || '')) { if (named) diag.push({ id, cat: c, label, reason: 'тип исключён настройкой «стекло не учитывать»' }); return; }
      if (c === 'Revit Generic Models' && !named) return;
      // P — точки стекла; A/NZ — площадь стекла и её проекция на горизонталь; Pa/Aa/NZa — то же по всей геометрии элемента
      const P = [], Pa = []; let A = 0, NZ = 0, Aa = 0, NZa = 0, up = 0;
      C.it.enumNodeFragments(id, f => {
        const mt = C.fl.getMaterial(f), glass = !!(mt && (mt.transparent || mt.opacity < 0.95));
        const g = C.fl.getGeometry(f); if (!g || !g.vb || g.isLines) return; C.fl.getWorldMatrix(f, mat4);
        const e = mat4.elements, st = g.vbstride, off = (g.attributes.position.offset ?? g.attributes.position.itemOffset) || 0, n = g.vb.length / st, Q = [];
        for (let i = 0; i < n; i++) { const x = g.vb[i * st + off], y = g.vb[i * st + off + 1], z = g.vb[i * st + off + 2]; Q.push([(e[0] * x + e[4] * y + e[8] * z + e[12]) * S, (e[1] * x + e[5] * y + e[9] * z + e[13]) * S, (e[2] * x + e[6] * y + e[10] * z + e[14]) * S]); }
        const ib = g.ib || (g.index && g.index.array);
        if (ib) for (let i = 0; i + 2 < ib.length; i += 3) { const a = Q[ib[i]], b = Q[ib[i + 1]], cc = Q[ib[i + 2]]; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, ar = Math.hypot(nx, ny, nz) / 2; Aa += ar; NZa += Math.abs(nz) / 2; if (glass) { A += ar; NZ += Math.abs(nz) / 2; if (nz > 0) up += nz / 2; } }
        Q.forEach(q => Pa.push(q)); if (glass) Q.forEach(q => P.push(q));
      }, true);
      const box = pts => {
        let mx = 0, my = 0, z0 = 1e9, z1 = -1e9; pts.forEach(p => { mx += p[0]; my += p[1]; z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }); mx /= pts.length; my /= pts.length;
        let sxx = 0, syy = 0, sxy = 0; pts.forEach(p => { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), t = [Math.cos(ang), Math.sin(ang)], n = [-t[1], t[0]];
        let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
        pts.forEach(p => { const u = (p[0] - mx) * t[0] + (p[1] - my) * t[1], w = (p[0] - mx) * n[0] + (p[1] - my) * n[1]; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, w); b1 = Math.max(b1, w); });
        return { t, n, w: a1 - a0, d: b1 - b0, h: z1 - z0, z0, z1, c: [mx + t[0] * (a0 + a1) / 2 + n[0] * (b0 + b1) / 2, my + t[1] * (a0 + a1) / 2 + n[1] * (b0 + b1) / 2] };
      };
      const glassOk = P.length >= 3 && A > 0.02;
      const flat = glassOk ? NZ / A : 0, flatAll = Aa > 0 ? NZa / Aa : 0;
      // кандидат в фонари: стекло обращено вверх или (по имени) элемент — фонарь
      const roofish = c !== 'Revit Doors' && ((glassOk && flat > 0.5) || (named && c !== 'Revit Curtain Panels' && (!glassOk || flat > 0.3)));
      if (roofish) {
        const bb = box(glassOk ? P : Pa);
        const rec = { id, cat: c, type: inf.type, fam: inf.fam, label, roof: true, c: bb.c, t: bb.t, n: bb.n, av: bb.w, bv: bb.d, z0: bb.z0, z1: bb.z1,
          tilt: glassOk ? Math.acos(Math.min(1, flat)) * 180 / Math.PI : null, glassArea: A, named, glass: glassOk, zb: Pa.reduce((m, p) => Math.min(m, p[2]), 1e9) };
        if (bb.w < 0.2 || bb.d < 0.2) { diag.push({ ...rec, reason: `слишком мал в плане (${bb.w.toFixed(2)}×${bb.d.toFixed(2)} м)` }); return; }
        // тип фонаря: подтверждён автоматически только горизонтальное остекление (≤ 15°) в элементе с именем фонаря;
        // остальное (наклонное, без выделенного стекла, без имени) — требует подтверждения пользователя
        rec.kind = !glassOk ? 'unknown' : rec.tilt <= 15 ? 'flat' : 'pitched';
        rec.auto = glassOk && rec.tilt <= 15 && LANTERN_ZENITH.test([inf.type, inf.fam, inf.name].join(' '));
        if (!glassOk) rec.note = 'стекло в семействе не выделено материалом — размеры по габариту элемента';
        // круглое остекление: точки стекла на одном расстоянии от центра (разброс < 5 %) — фонарь круглый, d — по стеклу
        if (glassOk) { const rr = P.map(p => Math.hypot(p[0] - bb.c[0], p[1] - bb.c[1])), r1 = Math.max(...rr), r0 = Math.min(...rr.filter(r => r > 0.3 * r1)); if (r1 > 0.1 && (r1 - r0) / r1 < 0.05) { rec.round = true; rec.d = 2 * r1; } }
        out.push(rec); diag.push(rec); return;
      }
      if (!glassOk) { if (named) diag.push({ id, cat: c, label, named, reason: 'нет прозрачных фрагментов (стекло не выделено материалом) и геометрия не обращена вверх' }); return; }
      const bb = box(P);
      if (c === 'Revit Roofs' || c === 'Revit Generic Models') { if (flat < 0.3 && bb.w >= 0.3 && bb.h >= 0.3) out.push({ id, cat: c, type: inf.type, c: bb.c, t: bb.t, n: bb.n, w: bb.w, d: bb.d, z0: bb.z0, z1: bb.z1 }); else if (named) diag.push({ id, cat: c, label, reason: `наклон стекла ${Math.round(Math.acos(Math.min(1, flat)) * 180 / Math.PI)}° — ни фонарь (≤ 60°), ни вертикальный проём` }); return; }
      if (bb.w < 0.15 && bb.d < 0.15) return; // щели и торцы стекла
      out.push({ id, cat: c, type: inf.type, c: bb.c, t: bb.t, n: bb.n, w: bb.w, d: bb.d, z0: bb.z0, z1: bb.z1 });
      if (named) diag.push({ id, cat: c, label, reason: `стекло вертикальное (наклон ${Math.round(Math.acos(Math.min(1, flat)) * 180 / Math.PI)}°) — учтено как окно` });
    }));
    out.diag = diag;
    return out;
  }

  // двери без остекления считаются закрытыми: контур габарита двери в плане добавляется в физический растр Rp,
  // чтобы открытая (повёрнутая) створка не соединяла помещения в один объём
  function doorBoxes(C, cat, zM) {
    const S = C.S, segs = [], box = new THREE.Box3(), fb = new THREE.Box3();
    (cat.byCat['Revit Doors'] || []).forEach(id => {
      box.makeEmpty(); let glass = false;
      C.it.enumNodeFragments(id, f => { const mt = C.fl.getMaterial(f); if (mt && (mt.transparent || mt.opacity < 0.95)) glass = true; C.fl.getWorldBounds(f, fb); box.union(fb); }, true);
      if (glass || box.isEmpty() || box.min.z * S > zM || box.max.z * S < zM) return;
      const x0 = box.min.x * S, y0 = box.min.y * S, x1 = box.max.x * S, y1 = box.max.y * S;
      if (x1 - x0 > 4 || y1 - y0 > 4) return; // ворота, витражные блоки — не трогаем
      segs.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
    });
    return segs;
  }

  // привязка вертикального проёма к пространству: по нормали в обе стороны до первой значимой области физического растра Rp
  // (линии разделения помещений светопрозрачны и не мешают); сторона — снаружи (Rp.ext) и внутри (клетка пространства)
  function assign(Rp, spaceLab, ops, floor, top) {
    const okReg = id => Rp.ext.has(id) || (Rp.regs[id] && Rp.regs[id].areaC > 1.5);
    const side = (o, sg) => { for (let k = 0.01; k < 2.5; k += 0.02) { const x = o.c[0] + sg * o.n[0] * k, y = o.c[1] + sg * o.n[1] * k, id = labelAt(Rp, x, y); if (id > 0 && okReg(id)) { const i = Math.floor((x - Rp.minx) / Rp.cell), j = Math.floor((y - Rp.miny) / Rp.cell); return { id, k, sp: (i >= 0 && j >= 0 && i < Rp.W && j < Rp.H) ? spaceLab[j * Rp.W + i] : -1 }; } } return null; };
    const st = { level: 0, outer: 0, inner: 0, none: 0, noSpace: 0 };
    ops.forEach(o => {
      if (o.roof || o.z0 < floor - 0.3 || o.z0 >= top - 0.05) return;
      st.level++;
      const A = side(o, 1), B = side(o, -1); if (!A || !B) { st.none++; return; }
      const ea = Rp.ext.has(A.id), eb = Rp.ext.has(B.id);
      if (ea === eb) { if (!ea) st.inner++; return; }
      const inn = ea ? B : A, out = ea ? A : B, sg = ea ? -1 : 1;
      if (inn.sp < 0) { st.noSpace++; return; }
      Object.assign(o, { space: inn.sp, reg: inn.id, nin: [o.n[0] * sg, o.n[1] * sg], dIn: inn.k, dOut: out.k, dst: inn.k + out.k, floor });
      st.outer++;
    });
    return st;
  }

  // клетки пространств (с прореживанием step) и горизонтальные «полосы» для заливки
  function spaceCells(R, lab, n, step) {
    const pts = [...Array(n)].map(() => []), runs = [...Array(n)].map(() => []);
    const { W, H, cell, minx, miny } = R;
    for (let j = 0; j < H; j++) {
      let cur = -1, start = 0;
      for (let i = 0; i <= W; i++) {
        const id = i < W ? lab[j * W + i] : -1;
        if (id !== cur) { if (cur >= 0) runs[cur].push([minx + start * cell, minx + i * cell, miny + j * cell, miny + (j + 1) * cell]); cur = id; start = i; }
        if (id >= 0 && i % step === 0 && j % step === 0) pts[id].push([minx + (i + 0.5) * cell, miny + (j + 0.5) * cell]);
      }
    }
    runs.forEach((rs, id) => {
      const m = []; rs.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
      rs.forEach(r => { const l = m[m.length - 1]; if (l && Math.abs(l[0] - r[0]) < 1e-6 && Math.abs(l[1] - r[1]) < 1e-6 && Math.abs(l[3] - r[2]) < 1e-6) l[3] = r[3]; else m.push(r.slice()); });
      runs[id] = m;
    });
    return { pts, runs };
  }

  // первое непрозрачное препятствие по вертикали вверх от (x, y, z): отметка в м или null
  function hitUp(C, x, y, z, maxD) {
    const S = C.S, h = C.v.impl.rayIntersect(new THREE.Ray(new THREE.Vector3(x / S, y / S, z / S), new THREE.Vector3(0, 0, 1)), true);
    return h && h.distance * S <= (maxD || 1e9) ? z + h.distance * S : null;
  }
  // размеры фонаря из параметров семейства (A_GMO_Skywindow_Angle: Diameter_Inside — D1, верхнее отверстие шахты под стеклом;
  // Diameter_Bottom — D2, нижнее отверстие в потолке; значения в мм)
  async function lanternParams(C, ids) {
    if (!ids.length) return {};
    const names = ['Diameter_Inside', 'Diameter_Bottom'];
    const props = await new Promise((ok, bad) => C.m.getBulkProperties2(ids, { propFilter: names }, ok, bad)).catch(() => []);
    const out = {}, m = v => { const x = parseFloat(v); return isNaN(x) || x <= 0 ? null : x > 20 ? x / 1000 : x; };
    props.forEach(r => { const g = n => (r.properties.find(p => p.attributeName === n || p.displayName === n) || {}).displayValue; const dIn = m(g('Diameter_Inside')), dBot = m(g('Diameter_Bottom')); if (dIn || dBot) out[r.dbId] = { dIn, dBot }; });
    return out;
  }
  // то же с элементом, в который упёрся луч
  function hitUpEl(C, x, y, z, maxD) {
    const S = C.S, h = C.v.impl.rayIntersect(new THREE.Ray(new THREE.Vector3(x / S, y / S, z / S), new THREE.Vector3(0, 0, 1)), true);
    return h && h.distance * S <= (maxD || 1e9) ? { z: z + h.distance * S, id: h.dbId } : null;
  }
  function hitDir(C, p, dir, maxD) {
    const S = C.S, h = C.v.impl.rayIntersect(new THREE.Ray(new THREE.Vector3(p[0] / S, p[1] / S, p[2] / S), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()), true);
    return h && h.distance * S <= (maxD || 1e9) ? h.distance * S : null;
  }

  // карта высот (верх непрозрачной и прозрачной геометрии) для поиска противостоящих зданий
  function heightMap(C, cat, cats, cell, box) {
    const S = C.S, W = Math.ceil((box[2] - box[0]) / cell), H = Math.ceil((box[3] - box[1]) / cell);
    const top = new Float32Array(W * H).fill(-1e9);
    cats.forEach(c => (cat.byCat[c] || []).forEach(id => eachGeom(C, id, (a, b, cc) => {
      const x0 = Math.min(a[0], b[0], cc[0]) * S, x1 = Math.max(a[0], b[0], cc[0]) * S, y0 = Math.min(a[1], b[1], cc[1]) * S, y1 = Math.max(a[1], b[1], cc[1]) * S, zt = Math.max(a[2], b[2], cc[2]) * S;
      const i0 = Math.max(0, Math.floor((x0 - box[0]) / cell)), i1 = Math.min(W - 1, Math.floor((x1 - box[0]) / cell)), j0 = Math.max(0, Math.floor((y0 - box[1]) / cell)), j1 = Math.min(H - 1, Math.floor((y1 - box[1]) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const p = j * W + i; if (zt > top[p]) top[p] = zt; }
    })));
    return { W, H, cell, x0: box[0], y0: box[1], top, at(x, y) { const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((y - this.y0) / this.cell); return (i < 0 || j < 0 || i >= this.W || j >= this.H) ? -1e9 : this.top[j * this.W + i]; } };
  }

  // козырёк / балкон над проёмом: лучи вверх из точек перед фасадом
  function overhang(C, o, zTop) {
    const S = C.S; let depth = 0;
    for (let k = 0.2; k <= 4.0001; k += 0.2) {
      const x = o.c[0] - o.nin[0] * (o.dOut + k), y = o.c[1] - o.nin[1] * (o.dOut + k);
      const hit = C.v.impl.rayIntersect(new THREE.Ray(new THREE.Vector3(x / S, y / S, (zTop + 0.05) / S), new THREE.Vector3(0, 0, 1)), false);
      if (hit && hit.distance * S < 3.0) depth = k; else break;
    }
    return depth;
  }

  // профиль затенения: для направлений φ (от нормали) — наибольший угол возвышения препятствия по карте высот
  function skyline(HM, P0, nout, t, zc, d0, step) {
    const res = [];
    for (let ph = -75; ph <= 75.001; ph += step) {
      const a = ph * Math.PI / 180, dx = nout[0] * Math.cos(a) + t[0] * Math.sin(a), dy = nout[1] * Math.cos(a) + t[1] * Math.sin(a);
      let best = null;
      for (let d = d0; d < 150; d += HM.cell * 0.7) {
        const h = HM.at(P0[0] + dx * d, P0[1] + dy * d); if (h < zc - 50) continue;
        const el = Math.atan2(h - zc, d);
        if (h > zc - 3 && (!best || el > best.el)) best = { el, d, h };
      }
      res.push({ ph, best });
    }
    return res;
  }

  return { ctx, catalog, rooms, eachGeom, slice, bounds, raster, labelAt, markExterior, openings, doorBoxes, assign, spaceCells, hitUp, hitUpEl, hitDir, lanternParams, heightMap, overhang, skyline, deg };
})();
