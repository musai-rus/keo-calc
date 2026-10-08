/* КЕО по модели: из геометрии помещения и его проёмов — исходные данные калькулятора (то же состояние, что вводится вручную),
   расчёт тем же ядром и моделью (KEO.compute). Методика расчёта не меняется: модель только «снимает размеры». */
const BimCalc = (function () {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const r2 = x => Math.round(x * 100) / 100;
  const fc = x => String(r2(x)).replace('.', ',');

  /* ---------- нормы: назначение помещения по табл. А.1 ---------- */
  const stem = w => w.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '').slice(0, 5);
  const STOP = new Set(['для', 'и', 'с', 'в', 'на', 'при', 'по', 'без', 'от', 'до', 'помещ', 'комна', 'залы', 'зал']);
  function words(s) { return String(s || '').split(/[\s,.;:()«»"/\-–—]+/).map(stem).filter(w => w.length >= 3 && !STOP.has(w)); }
  // типовые назначения ДОО и общественных зданий (проверяются первыми); null — помещение без нормы КЕО
  const RULES = [
    [/туалет|санузел|с\/у|душев|уборн|умываль|кладов|склад|инвентар|венткам|вентиляц|техническ|электрощит|щитов|насосн|загрузк|растарив|мусор|тамбур|шлюз|шахт|лифт|гардероб персонала|постирочн|гладиль|прачечн/i, null],
    [/групп|игров|занят|кружков|изостуд|логопед|дефектолог|психолог|сенсорн/i, 'A57'],
    [/спальн/i, 'A60'], [/раздевал/i, 'A56'], [/изолятор|заболевш/i, 'A61'],
    [/музыкал|физкульт|спортивн.*зал|спортзал/i, 'A58'],
    [/медицин|процедур|медсестр|прививоч/i, 'A62'],
    [/обеденн|столов/i, 'A59'],
    [/кабинет|методист|заведующ|канцеляр|приемн|бухгалтер|офис|переговор|тренерск/i, 'A1']
  ];
  const DOO = /Дошкольные/;
  function mapNorm(name, rows, group) {
    if (DOO.test(group || '')) for (const [re, id] of RULES) if (re.test(name || '')) return id ? rows.find(r => r.id === id) || null : null;
    const ws = words(name); if (!ws.length) return null;
    let best = null;
    rows.filter(r => !group || r.g === group || /Прочие помещения|Вспомогательные/.test(r.g)).forEach(r => {
      const rw = new Set(words(r.name)); let hit = 0; ws.forEach(w => { if (rw.has(w)) hit++; });
      if (!hit) return;
      const sc = hit / ws.length + (r.g === group ? 0.2 : 0) + 0.01 * hit;
      if (!best || sc > best.sc) best = { sc, r };
    });
    return best && best.sc >= 0.5 ? best.r : null;
  }
  // тип здания — группа табл. А.1, по которой назначения совпадают чаще всего
  function guessGroup(names, rows) {
    const n = re => names.filter(x => re.test(x || '')).length;
    if (n(/групп/i) >= 2 && n(/спальн|раздевал/i) >= 2) return rows.find(r => DOO.test(r.g)).g;
    const cnt = {};
    names.forEach(n => { const ws = words(n); rows.forEach(r => { const rw = new Set(words(r.name)); if (ws.some(w => rw.has(w))) cnt[r.g] = (cnt[r.g] || 0) + 1; }); });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
  }

  /* ---------- ориентация по сторонам света ---------- */
  const ORI = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  function azimuth(nout, T) {
    const X = T ? T[0] * nout[0] + T[3] * nout[1] : nout[0], Y = T ? T[1] * nout[0] + T[4] * nout[1] : nout[1];
    return (Math.atan2(X, Y) * 180 / Math.PI + 360) % 360;
  }
  const oriOf = az => ORI[Math.round(az / 45) % 8];

  /* ---------- проёмы помещения: объединение панелей в окна, окна — в плоскости стен ---------- */
  function clusters(ops) {
    const n = ops.length, par = [...Array(n).keys()], f = i => par[i] === i ? i : (par[i] = f(par[i]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = ops[i], b = ops[j];
      if (dot(a.nin, b.nin) < Math.cos(3 * Math.PI / 180)) continue;
      if (Math.abs(dot(sub(b.c, a.c), a.nin)) > 0.25) continue;
      const ta = dot(a.c, a.t), tb = dot(b.c, a.t);
      const gapT = Math.max(tb - b.w / 2 - (ta + a.w / 2), ta - a.w / 2 - (tb + b.w / 2));
      const gapZ = Math.max(b.z0 - a.z1, a.z0 - b.z1);
      if (gapT < 0.25 && gapZ < 0.35) par[f(j)] = f(i);
    }
    const g = new Map(); ops.forEach((o, i) => { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(o); });
    return [...g.values()].map(list => {
      const o0 = list[0], t = [-o0.nin[1], o0.nin[0]];
      let t0 = 1e9, t1 = -1e9, z0 = 1e9, z1 = -1e9, sn = 0;
      list.forEach(o => { const tc = dot(o.c, t); t0 = Math.min(t0, tc - o.w / 2); t1 = Math.max(t1, tc + o.w / 2); z0 = Math.min(z0, o.z0); z1 = Math.max(z1, o.z1); sn += dot(o.c, o0.nin); });
      sn /= list.length;
      const c = [t[0] * (t0 + t1) / 2 + o0.nin[0] * sn, t[1] * (t0 + t1) / 2 + o0.nin[1] * sn];
      return { ids: list.map(o => o.id), cats: [...new Set(list.map(o => o.cat))], nin: o0.nin, t, c, bo: t1 - t0, z0, z1, dIn: Math.min(...list.map(o => o.dIn)), dOut: Math.max(...list.map(o => o.dOut)), dst: med(list.map(o => o.dst)) };
    });
  }
  function facets(cls) {
    const out = [];
    cls.slice().sort((a, b) => b.bo * (b.z1 - b.z0) - a.bo * (a.z1 - a.z0)).forEach(c => {
      const f = out.find(F => dot(F.nin, c.nin) > Math.cos(3 * Math.PI / 180) && Math.abs(dot(sub(c.c, F.c0), F.nin)) < 0.4);
      if (f) f.cls.push(c); else out.push({ nin: c.nin, c0: c.c, cls: [c] });
    });
    out.forEach(F => {
      const nin = F.nin, t = [-nin[1], nin[0]];
      const face = med(F.cls.map(c => dot(c.c, nin) + c.dIn)); // внутренняя грань стены
      const tc = F.cls.reduce((s, c) => s + dot(c.c, t), 0) / F.cls.length;
      F.t = t; F.O = [t[0] * tc + nin[0] * face, t[1] * tc + nin[1] * face];
      F.dst = Math.min(1.2, Math.max(0.1, med(F.cls.map(c => c.dst))));
      F.area = F.cls.reduce((s, c) => s + c.bo * (c.z1 - c.z0), 0);
    });
    return out.sort((a, b) => b.area - a.area);
  }

  /* ---------- расчётное пространство (одно или несколько помещений Revit) ---------- */
  // норма пространства — наибольшая из норм входящих помещений по нужной графе (боковое / верхнее и комбинированное)
  function spaceNorm(rows, col) {
    let best = null; rows.forEach(r => { if (r && r[col] !== null && r[col] !== undefined && (!best || r[col] > best[col])) best = r; });
    return best || rows.find(Boolean) || null;
  }
  const title = sp => sp.rooms.map(r => `${r.num} ${r.name}`).join(' + ');
  function baseState(env, sp, row) {
    const S = env.settings, st = env.KEO.defaultState();
    st.meta = { code: S.code || '', object: S.object || '', room: title(sp), author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 };
    st.region = S.region; st.group = S.group; st.groupManual = true; st.bType = row ? row.g : (S.bGroup || st.bType); st.roomId = row ? row.id : '';
    st.rho = S.rho; st.env = 'normal';
    return st;
  }
  // главные оси пространства в плане (для верхнего света): начало — угол охватывающего прямоугольника
  function planFrame(pts) {
    let mx = 0, my = 0; pts.forEach(p => { mx += p[0]; my += p[1]; }); mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0; pts.forEach(p => { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), u = [Math.cos(ang), Math.sin(ang)], v = [-u[1], u[0]];
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; pts.forEach(p => { const a = (p[0] - mx) * u[0] + (p[1] - my) * u[1], b = (p[0] - mx) * v[0] + (p[1] - my) * v[1]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); });
    const O = [mx + u[0] * a0 + v[0] * b0, my + u[1] * a0 + v[1] * b0];
    return { O, u, v, L: a1 - a0, B: b1 - b0, toLocal: p => [(p[0] - O[0]) * u[0] + (p[1] - O[1]) * u[1], (p[0] - O[0]) * v[0] + (p[1] - O[1]) * v[1]], toWorld: q => [O[0] + u[0] * q[0] + v[0] * q[1], O[1] + u[1] * q[0] + v[1] * q[1]] };
  }
  const inside = (pts, p, r) => pts.some(q => Math.abs(q[0] - p[0]) < r && Math.abs(q[1] - p[1]) < r);

  // стены бокового света для точки A: окна — только видимые из A участки остекления (перегородки — препятствие)
  function sideWalls(F, A, env, pts, notes, multi, rule) {
    const walls = [];
    F.forEach(f => {
      const uv = pts.map(p => { const d = sub(p, f.O); return [dot(d, f.nin), dot(d, f.t)]; });
      const vmin = Math.min(...uv.map(x => x[1])), vmax = Math.max(...uv.map(x => x[1])), vmid = (vmin + vmax) / 2;
      const a = [dot(sub(A, f.O), f.nin), dot(sub(A, f.O), f.t)];
      const line = uv.filter(x => Math.abs(x[1] - a[1]) < 0.3); const dp = Math.max(...(line.length ? line : uv).map(x => x[0]));
      const ori = oriOf(azimuth([-f.nin[0], -f.nin[1]], env.T));
      if (a[0] < 0.3) { notes.push(`стена ${ori}: расчётная точка за плоскостью остекления или вплотную к нему — стена не учтена`); return; }
      // ширина помещения bп и его ось — по свободному сечению через точку параллельно стене (перегородка внутри пространства — граница сечения)
      const sw = env.Rp ? BimSpaces.sectionWidth(env.Rp, A, f.t, f.nin) : null, useS = sw && sw[0] + sw[1] > 0.5;
      const ax = useS ? a[1] + (sw[0] - sw[1]) / 2 : vmid, bp = useS ? sw[0] + sw[1] : vmax - vmin;
      const wins = [];
      f.cls.forEach(c => {
        const face = [c.c[0] + c.nin[0] * c.dIn, c.c[1] + c.nin[1] * c.dIn];
        const parts = env.Rp ? BimSpaces.visibleParts(env.Rp, A, face, f.t, c.bo) : [{ a: -c.bo / 2, b: c.bo / 2 }];
        const vis = parts.reduce((s, q) => s + q.b - q.a, 0);
        if (vis < c.bo - 0.05) notes.push(vis < 0.05 ? `стена ${ori}: проём ${fc(c.bo)} м не виден из точки — закрыт перегородкой или стеной` : `стена ${ori}: проём ${fc(c.bo)} м виден из точки на ${fc(vis)} м — остальное закрыто перегородкой или стеной`);
        parts.filter(q => q.b - q.a >= 0.1).forEach(q => wins.push({ c, bo: q.b - q.a, s: dot(sub(c.c, f.O), f.t) + (q.a + q.b) / 2 - ax }));
      });
      if (!wins.length) { notes.push(`стена ${ori}: остекление не видно из расчётной точки — не учтено`); return; }
      walls.push({ f, wins, dp: multi ? Math.max(dp, a[0] + 0.05) : dp, bp, vmid: ax, lt: a[0], ds: multi ? a[1] - ax : 0 });
    });
    return walls;
  }
  function wallState(w, env, A, H) {
    const S = env.settings, f = w.f, az = azimuth([-f.nin[0], -f.nin[1]], env.T);
    const sh = env.shade(f, A, w);
    return {
      st: {
        orient: oriOf(az), dp: r2(w.dp), bp: r2(w.bp), H: r2(H), dst: r2(f.dst), lt: r2(w.lt), ds: r2(w.ds),
        t1: S.t1, t1c: null, t2: S.t2, t4: S.t4, t5: 1, kType: sh.kDepth >= 0.3 ? 'canopy' : 'none', kDepth: r2(sh.kDepth),
        windows: w.wins.map(x => ({ hpd: r2(Math.max(0, x.c.z0 - env.floor)), ho: r2(x.c.z1 - x.c.z0), bo: r2(x.bo), s: r2(x.s), t2o: null, tau0o: null, Ko: null })),
        buildings: sh.blds
      }, geo: { f, A, az, sh, cls: f.cls }
    };
  }

  // sp — пространство (rooms, ключ), ops — вертикальные проёмы, lans — фонари [{c, av, bv, tilt, hsf, H, shaded, note}]
  // env: {KEO, Engine, settings, floor, pts, Rp, T, rows (норма каждого помещения, по порядку sp.rooms), roomPts(rm) — клетки собственного контура помещения, shade(f, A, w)}
  function space(sp, ops, lans, env) {
    const S = env.settings, notes = [], pts = env.pts;
    if (pts.length < 4) return { err: 'контур слишком мал' };
    const lanterns = (lans || []).filter(l => { if (l.shaded) notes.push(`фонарь ${fc(l.av)}×${fc(l.bv)} м: ${l.shaded} — не учтён`); return !l.shaded; });
    (lans || []).forEach(l => l.note && notes.push(l.note));
    const hasSide = ops && ops.length, hasTop = lanterns.length > 0;
    if (!hasSide && !hasTop) return { err: 'нет световых проёмов' };
    const mode = hasSide && hasTop ? 'comb' : hasTop ? 'top' : 'side';
    const col = mode === 'side' ? 'eSideN' : 'eTopN';
    const row = spaceNorm(env.rows, col), rule = row ? row.rt : 'center';
    // расчётная точка бокового света — в помещении, определяющем норму пространства (например, в групповой, а не на перегородке со спальней)
    const gi = row ? env.rows.indexOf(row) : -1, gov = gi >= 0 ? sp.rooms[gi] : null;
    const gp = gov && sp.rooms.length > 1 && env.roomPts ? env.roomPts(gov) : null, base = gp && gp.length >= 4 ? gp : pts;
    if (base !== pts) notes.push(`расчётная точка — в помещении ${gov.num} «${gov.name}», определяющем норму пространства`);
    const H = (Math.max(...sp.rooms.map(r => r.h || 0)) || 3);
    const F = hasSide ? facets(clusters(ops)) : [];

    if (mode === 'side') {
      // точка: одна стена — по правилу п. 5.3 СП 52 на характерном разрезе; несколько стен со значимым остеклением — центр (как в калькуляторе).
      // Стена с остеклением меньше 25 % от основной на выбор точки не влияет (её вклад учитывается)
      const multi = F.filter(f => f.area >= 0.25 * F[0].area).length > 1; let A;
      if (!multi) {
        const f = F[0], uvOf = P => P.map(p => { const d = sub(p, f.O); return [dot(d, f.nin), dot(d, f.t)]; }), uv = uvOf(pts), ub = uvOf(base);
        const vmid = (Math.min(...ub.map(x => x[1])) + Math.max(...ub.map(x => x[1]))) / 2;
        const line = uv.filter(x => Math.abs(x[1] - vmid) < 0.3); const dp = Math.max(...(line.length ? line : uv).map(x => x[0]));
        const lt = env.KEO.ltAuto(rule, dp);
        A = [f.O[0] + f.t[0] * vmid + f.nin[0] * lt, f.O[1] + f.t[1] * vmid + f.nin[1] * lt];
      } else {
        const cx = base.reduce((s, p) => s + p[0], 0) / base.length, cy = base.reduce((s, p) => s + p[1], 0) / base.length;
        A = base.reduce((b, p) => { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; return !b || d < b.d ? { p, d } : b; }, null).p;
      }
      const walls = sideWalls(F, A, env, pts, notes, F.length > 1, rule);
      if (!walls.length) return { err: 'остекление не видно из расчётной точки', notes, A };
      if (!multi && F.length > 1) notes.push('расчётная точка — по правилу для основной стены с остеклением; остекление других стен мало (< 25 % основной) и учтено только вкладом');
      const st = baseState(env, sp, row); st.mode = 'side';
      // если после проверки видимости осталась одна стена, а точка ставилась как центр — фиксируем её положение вручную
      st.rtManual = (multi || walls.length > 1) ? 'manual' : null;
      const ws = walls.map(w => wallState(w, env, A, H)); st.side.walls = ws.map(x => x.st);
      return { mode, row, st, C: env.KEO.compute(st), A, pts: [A], geo: ws.map(x => x.geo), notes, multi };
    }

    // верхний свет (Б.3) — фонари в системе координат главных осей пространства
    const fr = planFrame(pts);
    const types = [];
    lanterns.forEach(l => {
      const q = fr.toLocal(l.c), av = r2(l.av), bv = r2(l.bv);
      if (!(l.hsf > 0)) notes.push(`фонарь ${fc(av)}×${fc(bv)} м: высота шахты не определена по модели — принята 0,1 м (допущение, уточните)`);
      const hsf = r2(Math.max(0.1, l.hsf || 0.1));
      let T = types.find(t => t.av === av && t.bv === bv && t.hsf === hsf);
      if (!T) { T = { name: `Фонарь ${av}×${bv}`, shape: 'rect', av, bv, an: av, bn: bv, dv: 1, dn: 1, hsf, refl: 'diffuse', rhoW: S.lrho ?? 0.7, t1: env.DATA.tau1[S.lt1 ?? S.t1].v, t2: env.DATA.tau2[S.lt2 ?? S.t2].v, t3: 1, t4: 1, net: false, tilt: l.tilt <= 15 ? 0 : l.tilt <= 45 ? 1 : l.tilt <= 75 ? 2 : 3, lanterns: [] }; types.push(T); }
      T.lanterns.push({ x: r2(q[0]), y: r2(q[1]) });
    });
    notes.push(`Фонари — допущения: шахта вертикальная (нижнее отверстие = верхнему), стенки шахты — диффузное отражение ρ = ${String(S.lrho ?? 0.7).replace('.', ',')}, τ1 и τ2 — из настроек, несущих конструкций в проёме нет (τ3 = 1), солнцезащиты нет (τ4 = 1) — проверьте по проекту.`);
    const Hs = lanterns.map(l => l.H).filter(h => h > 0);
    if (Hs.length < lanterns.length) notes.push(`высота помещения под фонарём не определена по модели — принята высота помещения ${fc(H)} м (допущение)`);
    const st = baseState(env, sp, row); st.mode = 'top';
    st.top = { sys: 'shaft', L: r2(fr.L), B: r2(fr.B), H: r2(Hs.length ? Math.min(...Hs) : H), spans: 1, l1: null, y0: null, nPts: 0, types, b2: [] };
    const Ct = env.KEO.compute(st);
    const P = env.KEO.topPoints(st).map(p => fr.toWorld([p.x, p.y]));
    P.forEach((p, j) => { if (!inside(pts, p, 0.3)) notes.push(`РТ${j + 1} вне контура пространства (сложная форма в плане) — результат в ней ориентировочный`); });
    if (mode === 'top') return { mode, row, st, C: Ct, A: P[Math.floor(P.length / 2)], pts: P, frame: fr, notes };

    // комбинированное (Б.4): e = eв + eб в каждой точке; eб — боковое освещение в той же точке через видимые участки окон
    if (!Ct.ok) return { mode, row, st, C: Ct, err: (Ct.err || []).join('; '), notes };
    const sideAt = P.map(A => {
      const walls = sideWalls(F, A, env, pts, [], true, 'center');
      if (!walls.length) return { e: 0, walls: [] };
      const ws = walls.map(w => wallState(w, env, A, H));
      const s1 = baseState(env, sp, row); s1.mode = 'side'; s1.rtManual = 'manual'; s1.side.walls = ws.map(x => x.st);
      const si = env.KEO.sideInput(s1); const r = env.Engine.side(si);
      return { e: r.e, st: s1, walls: r.walls, geo: ws.map(x => x.geo) };
    });
    const eTop = Ct.res.e, e = eTop.map((v, j) => v + sideAt[j].e), stt = env.Engine.avgB10(e), eMin = Math.min(...e);
    const eAvgR = Math.round(stt * 100 + 1e-9) / 100, norm = env.KEO.normOf(st), uni = eMin / stt;
    const normOk = norm.v === null || norm.v === undefined ? null : eAvgR >= norm.v - 1e-9, uniOk = uni >= 1 / 3 - 1e-9;
    const comb = { eTop, eSide: sideAt.map(x => x.e), e, eAvg: stt, eAvgR, eMin, uni, uniInv: stt / eMin, norm, normOk, uniOk, pass: normOk === null ? null : normOk && uniOk, sideAt };
    return { mode, row, st, C: Ct, comb, A: P[Math.floor(P.length / 2)], pts: P, frame: fr, geo: sideAt[Math.floor(P.length / 2)].geo || [], notes };
  }

  /* ---------- противостоящие здания из профиля затенения ---------- */
  // samples: [{ph (°), best:{el, d, h}}] от точки P0 на наружной грани; vP0 — координата P0 вдоль стены относительно оси точки
  function buildings(samples, floor, vP0, rhoF, d0) {
    const out = []; let cur = null;
    samples.forEach(s => {
      const b = s.best; const ok = b && b.el > 1 * Math.PI / 180 && b.d > d0;
      if (!ok) { cur = null; return; }
      const a = s.ph * Math.PI / 180, ln = b.d * Math.cos(a);
      if (ln < 0.5) { cur = null; return; }
      if (cur && Math.abs(ln - cur.lnLast) < Math.max(3, 0.25 * ln)) cur.s.push({ ...s, ln, a }); else { cur = { s: [{ ...s, ln, a }] }; out.push(cur); }
      cur.lnLast = ln;
    });
    return out.map(g => {
      const top = g.s.reduce((m, x) => x.best.el > m.best.el ? x : m);
      const l = top.ln, Hp = top.best.h - floor;
      const ys = g.s.map(x => vP0 + l * Math.tan(x.a)), step = 5 * Math.PI / 180;
      const y0 = Math.min(...ys) - l * Math.tan(step) / 2, y1 = Math.max(...ys) + l * Math.tan(step) / 2;
      return { l: r2(l), Hp: r2(Hp), a: r2(Math.max(0.5, y1 - y0)), off: r2((y0 + y1) / 2), rhoF };
    }).filter(b => b.Hp > 0.5 && b.l > 0);
  }

  return { mapNorm, guessGroup, clusters, facets, space, spaceNorm, planFrame, buildings, azimuth, oriOf, words, title };
})();
