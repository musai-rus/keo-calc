/* КЕО по модели — расчётные пространства (чистые функции, без Viewer; проверяются bim/test-bim.js).
   R  — растр с линиями разделения помещений (для опознания помещений Revit);
   Rp — растр только физических преград: стены, витражи, двери, окна, колонны (для света и состава пространства). */
const BimSpaces = (function () {

  /* ---------- единицы свойств Revit ---------- */
  // dataTypeContext вида 'autodesk.unit.unit:squareMeters-1.0.1'
  const AREA = { squareMeters: 1, squareMillimeters: 1e-6, squareCentimeters: 1e-4, squareFeet: 0.09290304, squareInches: 0.00064516 };
  const LEN = { meters: 1, millimeters: 1e-3, centimeters: 1e-2, decimeters: 0.1, feet: 0.3048, inches: 0.0254, feetFractionalInches: 0.3048, metersCentimeters: 1 };
  function unitOf(ctx) { const m = /unit:([A-Za-z]+)-/.exec(ctx || ''); return m ? m[1] : null; }
  // → {v (в м² или м), unit, ok, warn}
  function conv(raw, ctx, kind) {
    if (raw === undefined || raw === null || raw === '' || isNaN(+raw)) return { v: null, unit: null, ok: false, warn: 'нет значения' };
    const u = unitOf(ctx), tab = kind === 'area' ? AREA : LEN;
    if (u && tab[u] !== undefined) return { v: +raw * tab[u], unit: u, ok: true };
    return { v: null, unit: u || ctx || 'не указаны', ok: false, warn: `единицы ${u || ctx || '(не указаны)'} не распознаны — значение ${raw} не используется` };
  }

  /* ---------- помещения ↔ области растра R ---------- */
  // площадь Revit сравнивается с площадью области в чистоте (areaC) и до осей стен (areaV) — зависит от настройки расчёта площадей в Revit
  function matchRooms(R, rooms, tol = 0.04) {
    const regs = R.regs.filter(r => r && !r.border && r.areaC >= 0.8);
    const pairs = [];
    rooms.forEach(rm => {
      if (!(rm.area > 0)) return;
      regs.forEach(rg => {
        const dd = Math.min(Math.abs(rg.areaC - rm.area), Math.abs((rg.areaV || rg.areaC) - rm.area));
        if (!(dd / rm.area < tol || dd < 0.4)) return;
        if (rm.per > 0) { const k = rg.per / rm.per; if (k < 0.75 || k > 1.45) return; } // периметр отсекает узкие полости той же площади
        pairs.push([dd / rm.area, rm, rg]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    pairs.forEach(([d, rm, rg]) => { if (rm.reg || rg.room) return; rg.room = rm; rg.dA = d; rm.reg = rg.id; rm.dA = d; rm.areaModel = rg.areaC; rm.areaModelV = rg.areaV; });
    // второй проход: допуск по площади до tol2 (10 %) — только для взаимно единственной пары «помещение ↔ контур»
    // (контур урезан нишей/шкафом за дверными полотнами и т.п.; пример — спальня 84 модели 1226: Area 55,14 м², контур 51,1–52,0 м²)
    const tol2 = 0.10, cand = new Map(), back = new Map();
    rooms.forEach(rm => {
      if (rm.reg || !(rm.area > 0)) return;
      regs.forEach(rg => {
        if (rg.room || rg.areaC < 4) return;
        const dd = Math.min(Math.abs(rg.areaC - rm.area), Math.abs((rg.areaV || rg.areaC) - rm.area));
        if (dd / rm.area >= tol2) return;
        if (rm.per > 0) { const k = rg.per / rm.per; if (k < 0.75 || k > 1.45) return; }
        (cand.get(rm) || cand.set(rm, []).get(rm)).push([dd / rm.area, rg]); (back.get(rg) || back.set(rg, []).get(rg)).push(rm);
      });
    });
    cand.forEach((list, rm) => { if (list.length !== 1) return; const [d, rg] = list[0]; if (back.get(rg).length !== 1) return; rg.room = rm; rg.dA = d; rm.reg = rg.id; rm.dA = d; rm.loose = true; rm.areaModel = rg.areaC; rm.areaModelV = rg.areaV; });
  }

  /* ---------- состав пространств ---------- */
  // rooms — помещения уровня (rm.key — уникальный ключ: ElementId/dbId; номер не используется как ключ)
  // isExcluded(rm) — ЛК, коридоры, холлы, вестибюли: не объединяются автоматически и не рассчитываются
  // decisions — ручные решения пользователя: merge [[key…]], split [[key…]], assign [{at: [x, y], keys: [key…]}] (помещения в неопознанный контур)
  // opts.aux(rm) — помещение без нормы КЕО (кладовая, санузел): с нормируемыми автоматически не объединяется, только по решению пользователя
  const nameKey = n => String(n || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z]/g, '');
  // связи между контурами R через проходы без стены и без двери (клетки, занятые только линией разделения): ширина прохода, м
  function links(R, Rp) {
    const W = R.W, N = W * R.H, cnt = new Map();
    for (let p = 0; p < N; p++) {
      if (R.lab[p] !== 0 || !Rp.lab[p]) continue;
      const ids = new Set(), i = p % W;
      for (let d = 1; d <= 3; d++) for (const q of [i - d >= 0 ? p - d : -1, i + d < W ? p + d : -1, p - d * W, p + d * W]) { if (q >= 0 && q < N && R.lab[q] > 0) ids.add(R.lab[q]); }
      const a = [...ids].sort((x, y) => x - y);
      const j = (p - i) / W;
      for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) { const k = a[x] + ':' + a[y], b = cnt.get(k); if (!b) cnt.set(k, [i, i, j, j]); else { b[0] = Math.min(b[0], i); b[1] = Math.max(b[1], i); b[2] = Math.min(b[2], j); b[3] = Math.max(b[3], j); } }
    }
    // ширина прохода — протяжённость клеток линии разделения между двумя контурами
    const out = new Map(); cnt.forEach((b, k) => out.set(k, (Math.max(b[1] - b[0], b[3] - b[2]) + 1) * R.cell));
    return out;
  }
  function compose(R, Rp, rooms, isExcluded, decisions, opts) {
    const aux = (opts && opts.aux) || (() => false);
    decisions = decisions || {};
    const M = decisions.merge || [], SPL = decisions.split || [], AS = decisions.assign || [];
    rooms.forEach(rm => { delete rm.byBalance; delete rm.byUser; delete rm.sub; }); // повторная сборка после ручного решения
    R.regs.forEach(r => { if (r) { delete r.rooms; delete r.cands; } });
    const byKey = new Map(rooms.map(r => [r.key, r]));
    // R-подобласть → область Rp
    // (в Rp могут быть преграды, которых нет в R, — контуры закрытых дверей: берётся первая клетка контура, свободная в Rp)
    const subsOf = new Map(), toP = new Int32Array(R.regs.length);
    for (let p = 0; p < R.lab.length; p++) { const id = R.lab[p]; if (id > 0 && !toP[id] && Rp.lab[p] > 0 && Rp.regs[Rp.lab[p]] && Rp.regs[Rp.lab[p]].areaC >= 2) toP[id] = Rp.lab[p]; }
    R.regs.forEach(r => { if (!r || r.border) return; const P = toP[r.id]; if (!P || Rp.ext.has(P)) return; if (!subsOf.has(P)) subsOf.set(P, []); subsOf.get(P).push(r); });
    const free = r => !r.room && !r.rooms;
    // 1) ручное назначение помещений в контур без помещения
    AS.forEach(a => {
      const rg = R.regs[cellLab(R, a.at)]; if (!rg || rg.border || !free(rg)) return;
      const list = (a.keys || []).map(k => byKey.get(k)).filter(rm => rm && !rm.reg && rm.sub === undefined);
      if (!list.length) return;
      rg.rooms = list; list.forEach(rm => { rm.sub = rg.id; rm.byUser = true; });
    });
    // 2) автоматически: контур ≥ 3 м² без помещения ↔ 1–3 неопознанных помещения с той же суммой площадей; только если вариант единственный
    const pool = () => rooms.filter(rm => !rm.reg && rm.sub === undefined && rm.area > 0 && !isExcluded(rm));
    [...subsOf.values()].flat().filter(r => free(r) && r.areaC >= 3).sort((a, b) => b.areaC - a.areaC).forEach(rg => {
      const tol = Math.max(0.6, 0.03 * rg.areaC), c = combos(pool(), [rg.areaC, rg.areaV || rg.areaC], tol, rg.per);
      if (c.length === 1) { rg.rooms = c[0].sel; c[0].sel.forEach(rm => { rm.sub = rg.id; rm.byBalance = rg.id; }); }
      else if (c.length > 1) rg.cands = c.slice(0, 6);
    });
    const spaces = [], unknown = [], keyIn = (list, k) => list.some(g => g.includes(k)), LK = links(R, Rp);
    const unk = s => ({ at: cellXY(R, s.seed), area: s.areaC, areaV: s.areaV, cands: (s.cands || []).map(c => ({ keys: c.sel.map(r => r.key), label: c.sel.map(r => `${r.num} ${r.name}`).join(' + '), sum: c.sum })) });
    [...subsOf.keys()].sort((a, b) => a - b).forEach(P => {
      const subs = subsOf.get(P), subOf = new Map(), units = [];
      const big = subs.filter(s => free(s) && s.areaC >= 8).map(unk); unknown.push(...big.map(u => ({ ...u, P })));
      subs.forEach(s => { const rs = s.room ? [s.room] : s.rooms || []; rs.forEach(r => subOf.set(r, s)); if (rs.length) units.push(rs); });
      const all = units.flat();
      const nonEx = all.filter(r => !isExcluded(r)), ex = all.filter(r => isExcluded(r));
      if (!nonEx.length && !M.some(g => all.some(r => g.includes(r.key)))) return;
      // по умолчанию нормируемые помещения физического объёма (групповая + спальня с проходом у витража) — одно пространство.
      // Не объединяются автоматически: исключённые (коридоры и т.п.), помещения без нормы КЕО (кладовая, санузел) и несколько
      // помещений одного назначения (две спальни) — для них показывается проход и решение за пользователем
      const normed = nonEx.filter(r => !aux(r));
      const dup = new Set(normed.map(r => nameKey(r.name))).size < normed.length;
      const splitUser = nonEx.some(r => keyIn(SPL, r.key));
      const unitsNE = units.map(u => u.filter(r => !isExcluded(r))).filter(u => u.length);
      let groups = (splitUser || dup) ? unitsNE : [...(normed.length ? [unitsNE.filter(u => u.some(r => !aux(r))).flat()] : []), ...unitsNE.filter(u => u.every(r => aux(r)))];
      M.forEach(g => {
        const members = all.filter(r => g.includes(r.key)); if (members.length < 2) return;
        groups = groups.map(x => x.filter(r => !members.includes(r))).filter(x => x.length);
        groups.push(members);
      });
      // свободные части без помещения < 8 м² (полосы у витражей, зазоры) делятся между пространствами объёма по близости (spaceLabel);
      // крупные части без помещения не присоединяются — их состав определяет пользователь
      const grow = subs.filter(s => free(s) && s.areaC < 8).map(s => s.id);
      const main = groups.slice().sort((a, b) => b.reduce((s, r) => s + r.area, 0) - a.reduce((s, r) => s + r.area, 0))[0];
      const used = new Set(), subId = r => (subOf.get(r) || {}).id;
      groups.forEach(g => {
        const regIds = [];
        g.forEach(r => { const s = subOf.get(r); if (s && !used.has(s.id)) { used.add(s.id); regIds.push(s.id); } });
        const others = all.filter(r => !g.includes(r));
        // проходы без двери между помещениями группы и соседями по объёму (ширина по линии разделения)
        const lk = [];
        g.forEach(a => all.forEach(b => { if (a === b || (g.includes(b) && a.key > b.key)) return; const ia = subId(a), ib = subId(b); if (!ia || !ib || ia === ib) return; const w = LK.get(Math.min(ia, ib) + ':' + Math.max(ia, ib)); if (w) lk.push({ a: a.key, b: b.key, w, inside: g.includes(b) }); }));
        spaces.push({
          P, rooms: g, regIds, grow, key: g.map(r => r.key).sort().join('+'),
          merged: g.length > 1, manual: M.some(x => g.every(r => x.includes(r.key))) || splitUser, links: lk,
          auxNb: others.filter(r => aux(r) && !isExcluded(r)), // открытый проход в помещение без нормы — не объединено автоматически
          dup: dup && !M.some(x => g.every(r => x.includes(r.key))),
          balance: g.filter(r => r.byBalance !== undefined), byUser: g.filter(r => r.byUser),
          unknown: g === main ? big : [], // части объёма ≥ 8 м² без помещения Revit — состав объёма не определён до решения пользователя
          neighbours: others, // в том же физическом объёме, но не в этой группе (например, коридор)
          excludedNeighbours: ex.filter(r => !g.includes(r))
        });
      });
    });
    const placed = new Set(spaces.flatMap(s => s.rooms));
    const unplaced = rooms.filter(rm => !placed.has(rm) && rm.area > 0 && !isExcluded(rm));
    return { spaces, unplaced, unknown }; // unknown — все части уровня ≥ 8 м² без помещения Revit
  }
  const cellLab = (R, at) => { const i = Math.floor((at[0] - R.minx) / R.cell), j = Math.floor((at[1] - R.miny) / R.cell); return (i < 0 || j < 0 || i >= R.W || j >= R.H) ? 0 : R.lab[j * R.W + i]; };
  const cellXY = (R, p) => { const i = p % R.W, j = (p - i) / R.W; return [Math.round((R.minx + (i + 0.5) * R.cell) * 1000) / 1000, Math.round((R.miny + (j + 0.5) * R.cell) * 1000) / 1000]; };
  // все наборы из 1–3 помещений, сумма площадей которых совпадает с площадью контура (в чистоте или до осей) в пределах tol;
  // периметр контура per (если задан) должен быть совместим: одно помещение — 0,75…1,45 его периметра, несколько — 0,45…1,15 суммы периметров
  function combos(list, targets, tol, per) {
    const out = [], n = Math.min(list.length, 60);
    const perOk = sel => { if (!(per > 0) || sel.some(r => !(r.per > 0))) return true; const k = per / sel.reduce((a, r) => a + r.per, 0); return sel.length === 1 ? k >= 0.75 && k <= 1.45 : k >= 0.45 && k <= 1.15; };
    const consider = sel => { const s = sel.reduce((a, r) => a + r.area, 0), d = Math.min(...targets.map(t => Math.abs(s - t))); if (d <= tol && perOk(sel)) out.push({ sel, d, sum: s }); };
    for (let i = 0; i < n; i++) { consider([list[i]]); for (let j = i + 1; j < n; j++) { consider([list[i], list[j]]); for (let k = j + 1; k < n; k++) consider([list[i], list[j], list[k]]); } }
    return out.sort((a, b) => a.d - b.d);
  }
  // клетка → номер пространства (−1 — не в пространстве): контуры помещений пространства, затем рост по близости в пределах
  // физического объёма — в клетки линий разделения и в мелкие свободные части (s.grow); в чужие помещения и крупные части без помещения не растёт
  function spaceLabel(R, Rp, spaces) {
    const N = R.W * R.H, W = R.W, lab = new Int32Array(N).fill(-1), regTo = new Map(), allowed = new Set();
    spaces.forEach((s, i) => { s.regIds.forEach(id => regTo.set(id, i)); (s.grow || []).forEach(id => allowed.add(id)); });
    const q = new Int32Array(N); let h = 0, t = 0;
    for (let p = 0; p < N; p++) { const id = R.lab[p]; if (id > 0 && regTo.has(id)) { lab[p] = regTo.get(id); q[t++] = p; } }
    while (h < t) {
      const p = q[h++], i = p % W;
      for (const nb of [i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (nb < 0 || nb >= N || lab[nb] >= 0 || !Rp.lab[nb] || Rp.lab[nb] !== Rp.lab[p]) continue;
        const id = R.lab[nb]; if (id !== 0 && !allowed.has(id)) continue;
        lab[nb] = lab[p]; q[t++] = nb;
      }
    }
    return lab;
  }

  /* ---------- видимость проёма из расчётной точки (физические перегородки — препятствие) ---------- */
  // A — точка, Q — точка на внутренней грани проёма; препятствием считаются только клетки, занятые в Rp; последние skip м у проёма не проверяются (откос, импосты)
  function lineFree(Rp, A, Q, skip) {
    const dx = Q[0] - A[0], dy = Q[1] - A[1], L = Math.hypot(dx, dy); if (L < 1e-6) return true;
    const n = Math.ceil(L / (Rp.cell * 0.5)), stop = Math.max(0, 1 - (skip || 0.2) / L);
    for (let k = 1; k <= n; k++) {
      const t = k / n; if (t > stop) break;
      const i = Math.floor((A[0] + dx * t - Rp.minx) / Rp.cell), j = Math.floor((A[1] + dy * t - Rp.miny) / Rp.cell);
      if (i < 0 || j < 0 || i >= Rp.W || j >= Rp.H || Rp.lab[j * Rp.W + i] === 0) return false;
    }
    return true;
  }
  // окно на грани: центр c (на внутренней грани), направляющая t, ширина bo → видимые участки [{a, b}] вдоль t относительно центра
  function visibleParts(Rp, A, c, t, bo, step = 0.1, skip = 0.2) {
    const n = Math.max(2, Math.round(bo / step)), parts = []; let cur = null;
    for (let k = 0; k < n; k++) {
      const u = -bo / 2 + (k + 0.5) * bo / n, Q = [c[0] + t[0] * u, c[1] + t[1] * u];
      const ok = lineFree(Rp, A, Q, skip);
      if (ok) { if (!cur) { cur = { a: u - bo / (2 * n), b: u + bo / (2 * n) }; parts.push(cur); } else cur.b = u + bo / (2 * n); } else cur = null;
    }
    return parts;
  }

  // свободное сечение через точку A вдоль t в физическом растре Rp: [до препятствия по +t, по −t].
  // Колонны (препятствие, свободное на ±1 м по нормали n) пропускаются; стены, перегородки и остекление ограничивают сечение
  function sectionWidth(Rp, A, t, n, maxL = 80) {
    const at = (x, y) => { const i = Math.floor((x - Rp.minx) / Rp.cell), j = Math.floor((y - Rp.miny) / Rp.cell); return (i < 0 || j < 0 || i >= Rp.W || j >= Rp.H) ? -1 : Rp.lab[j * Rp.W + i]; };
    const own = at(A[0], A[1]); if (own <= 0) return null;
    const go = sg => {
      const step = Rp.cell * 0.5;
      for (let s = step; s < maxL; s += step) {
        const x = A[0] + t[0] * sg * s, y = A[1] + t[1] * sg * s, id = at(x, y);
        if (id === own) continue;
        const solid = id === 0 || (id > 0 && !Rp.ext.has(id) && Rp.regs[id] && Rp.regs[id].areaC < 2); // контур препятствия или его внутренность
        if (solid && at(x + n[0], y + n[1]) === own && at(x - n[0], y - n[1]) === own) continue; // колонна
        return s - step;
      }
      return maxL;
    };
    return [go(1), go(-1)];
  }

  return { conv, unitOf, matchRooms, compose, links, combos, spaceLabel, lineFree, visibleParts, sectionWidth };
})();
