/* КЕО — расчётное ядро. СП 367.1325800.2025, СП 52.13330.2016.
   Чистые функции: на вход — исходные данные, на выход — результат + журнал шагов (для отчёта). */
const Engine = (function () {
  const D = (typeof DATA !== 'undefined') ? DATA : require('./data.js');
  const PI = Math.PI, rad = d => d * PI / 180, deg = r => r * 180 / PI;
  const r2f = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' : Number(x).toFixed(n).replace('.', ',');

  /* ---------- интерполяция ---------- */
  // xs — монотонный массив (возр. или убыв.), ys — значения (null допускаются — пропускаются)
  function interp(xs, ys, x, mode) {
    const pts = xs.map((v, i) => [v, ys[i]]).filter(p => p[1] !== null && p[1] !== undefined).sort((a, b) => a[0] - b[0]);
    const info = { lo: pts[0][0], hi: pts[pts.length - 1][0], clamped: false, extrap: false };
    if (pts.length === 1) return { v: pts[0][1], ...info, clamped: x !== pts[0][0] };
    if (x <= pts[0][0] || x >= pts[pts.length - 1][0]) {
      const left = x <= pts[0][0];
      if (mode === 'extrap') {
        const [a, b] = left ? [pts[0], pts[1]] : [pts[pts.length - 2], pts[pts.length - 1]];
        const v = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
        return { v, ...info, extrap: x !== (left ? pts[0][0] : pts[pts.length - 1][0]) };
      }
      return { v: left ? pts[0][1] : pts[pts.length - 1][1], ...info, clamped: x !== (left ? pts[0][0] : pts[pts.length - 1][0]) };
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (x >= x0 && x <= x1) return { v: y0 + (y1 - y0) * (x - x0) / (x1 - x0), ...info };
    }
  }
  const iv = (xs, ys, x, mode) => interp(xs, ys, x, mode).v;
  const clampNote = (name, x, xs) => {
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (x < lo) return `${name} = ${r2f(x)} < ${r2f(lo)} — принято по границе таблицы ${r2f(lo)}`;
    if (x > hi) return `${name} = ${r2f(x)} > ${r2f(hi)} — принято по границе таблицы ${r2f(hi)}`;
    return null;
  };

  /* ---------- базовые функции ---------- */
  // (3.2) СП 367: q(γ) = 0,429·[1 + 4·exp(−0,7 / sin γ)]
  function qGamma(gDeg) {
    if (gDeg <= 0) return 0.429;
    return 0.429 * (1 + 4 * Math.exp(-0.7 / Math.sin(rad(Math.min(gDeg, 90)))));
  }
  // График I Данилюка: число лучей между углами возвышения θa<θb (рад) в разрезе
  const n1Rays = (ta, tb) => 50 * (Math.cos(ta) - Math.cos(tb));
  // График II Данилюка: накопленное число лучей от оси до бокового смещения y при наклонной дальности R
  const Gp = (y, R) => { const p = Math.atan2(y, R); return (100 / PI) * (p + 0.5 * Math.sin(2 * p)); };

  /* ---------- нормативные таблицы ---------- */
  function CNwall(group, orient) {
    const key = { 'С': 'С', 'СВ': 'СВ-СЗ', 'СЗ': 'СВ-СЗ', 'В': 'З-В', 'З': 'З-В', 'ЮВ': 'ЮВ-ЮЗ', 'ЮЗ': 'ЮВ-ЮЗ', 'Ю': 'Ю' }[orient];
    return { v: D.CN.wall[key][group - 1], row: key };
  }
  const CNzenith = group => D.CN.zenith[group - 1];
  function MF(env, angleIdx, glassMult) {
    const base = D.MF[env][angleIdx];
    return { base, v: base * (glassMult || 1) };
  }

  // r0 — табл. Б.6 (УРП) / Б.7 (пол)
  function r0Lookup(onFloor, dh, ld, bd, rho) {
    const T = D.r0, rows = onFloor ? T.floor : T.ur;
    const dhs = [1, 3, 5];
    const notes = [clampNote('dп/h01', dh, dhs), clampNote('lт/dп', ld, [0.1, 0.9]), clampNote('bп/dп', bd, T.bd), clampNote('ρср', rho, T.rho)].filter(Boolean);
    const valAt = (dhv, ri, bi) => {
      const rr = rows.filter(r => r[0] === dhv);
      return iv(rr.map(r => r[1]), rr.map(r => r[2 + ri * 3 + bi]), ld);
    };
    const byDh = dhs.map(dhv => {
      const byRho = T.rho.map((_, ri) => iv(T.bd, T.bd.map((_, bi) => valAt(dhv, ri, bi)), bd));
      return iv(T.rho, byRho, rho);
    });
    return { v: iv(dhs, byDh, dh), notes, table: onFloor ? 'Б.7' : 'Б.6' };
  }

  // Kзд0 — табл. Б.8 (схема № 1, параллельное расположение)
  function kzd0Lookup(rhoF, rhoIn, z1, z2, ld) {
    const T = D.kzd0;
    const notes = [clampNote('ρф', rhoF, T.rhoF), clampNote('ρср', rhoIn, T.rhoIn), clampNote('z1', z1, T.z1), clampNote('z2', z2, T.z2), clampNote('lт/dп', ld, T.ld)].filter(Boolean);
    const blk = T.ld.map(l => {
      const rows = T.rows[String(l)];
      const byF = T.rhoF.map(f => {
        const byIn = T.rhoIn.map(ri => {
          const byZ1 = T.z1.map(zz => {
            const row = rows.find(r => r[0] === f && r[1] === ri && r[2] === zz);
            return iv(T.z2, row.slice(3), z2);
          });
          return iv(T.z1, byZ1, z1);
        });
        return iv(T.rhoIn, byIn, rhoIn);
      });
      return iv(T.rhoF, byF, rhoF);
    });
    return { v: iv(T.ld, blk, ld), notes };
  }

  // bф — табл. Б.1
  function bfLookup(rhoF, la, aH) {
    const T = D.bf;
    const notes = [clampNote('ρф', rhoF, T.rhoF), clampNote('l/a', la, T.la), clampNote('a/Hр', aH, T.aH)].filter(Boolean);
    const byF = T.rhoF.map(f => {
      const byLa = T.la.map(l => { const row = T.rows.find(r => r[0] === f && r[1] === l); return iv(T.aH, row.slice(2), aH); });
      return iv(T.la, byLa, la);
    });
    return { v: iv(T.rhoF, byF, rhoF), notes };
  }

  // K — табл. Б.17–Б.20 (интерполяция и экстраполяция по примечаниям к таблицам)
  function KLookup(type, depthRoom, depthEl, pos) {
    if (!type || type === 'none') return { v: 1, notes: [], tab: null };
    const T = D.K[type], key = pos === 'wall1' ? 'wall1' : 'center';
    const byDepth = D.K.depths.map((_, di) => interp(T.el, T[key][di], depthEl, 'extrap').v);
    const v = interp(D.K.depths, byDepth, depthRoom, 'extrap').v;
    return { v: Math.min(1, Math.max(0, v)), notes: [], tab: T.tab, title: T.title };
  }

  // r2 — табл. Б.21
  function r2Lookup(hl, rho, spans) {
    const T = D.r2, si = Math.min(Math.max(spans, 1), 3) - 1;
    const notes = [clampNote('hр/l1', hl, T.hl), clampNote('ρср', rho, T.rho)].filter(Boolean);
    const byRho = T.rho.map(r => iv(T.hl, T.v[String(r)][si], hl));
    return { v: iv(T.rho, byRho, rho), notes };
  }

  // Kс — рис. Б.2 (диффузное) / Б.3 (направленное отражение стенок шахты)
  function kcLookup(kind, i, rho) {
    const T = D.kc[kind];
    const notes = [clampNote('iф', i, [T.i[0], T.i[T.i.length - 1]]), clampNote('ρ стенок', rho, T.rho)].filter(Boolean);
    const byRho = T.rho.map((_, k) => iv(T.i, T.v[k], i));
    return { v: iv(T.rho, byRho, rho), notes, fig: kind === 'diffuse' ? 'Б.2' : 'Б.3' };
  }

  /* ---------- журнал ---------- */
  function Log() { this.items = []; }
  Log.prototype.add = function (o) { this.items.push(o); return o.val; };

  /* ---------- геометрия бокового света ---------- */
  // P: {lt, ds, hp}; W: {dst}; win: {hpd, ho, bo, s}; blds: [{l, Hp, a, off}]
  function sideSectors(P, dst, win, blds) {
    const d1 = P.lt, Dd = P.lt + dst;
    const yl = win.s - win.bo / 2 - P.ds, yr = win.s + win.bo / 2 - P.ds;
    const y1 = Math.max(yl, yl * Dd / d1), y2 = Math.min(yr, yr * Dd / d1);
    const zs = win.hpd - P.hp, zt = win.hpd + win.ho - P.hp;
    let z1 = Math.max(zs, zs * Dd / d1); const z2 = Math.min(zt, zt * Dd / d1);
    z1 = Math.max(z1, 0);
    const geo = { D: Dd, y1, y2, z1, z2, thLo: deg(Math.atan2(z1, Dd)), thHi: deg(Math.atan2(z2, Dd)) };
    const sectors = [];
    if (!(y2 > y1 + 1e-9 && z2 > z1 + 1e-9)) return { geo, sectors };
    const pb = (blds || []).map((b, idx) => {
      const Db = Dd + b.l, k = Dd / Db;
      return { idx, Db, ya: (b.off - b.a / 2) * k, yb: (b.off + b.a / 2) * k, top: (b.Hp - P.hp) * k };
    });
    const br = [y1, y2];
    pb.forEach(b => [b.ya, b.yb].forEach(y => { if (y > y1 && y < y2) br.push(y); }));
    br.sort((a, b) => a - b);
    for (let i = 0; i < br.length - 1; i++) {
      const ya = br[i], yb = br[i + 1]; if (yb - ya < 1e-9) continue;
      const ym = (ya + yb) / 2;
      const cover = pb.filter(b => b.ya <= ym && b.yb >= ym).sort((a, b) => a.Db - b.Db);
      let zc = z1; const segs = [];
      cover.forEach(b => { const top = Math.min(b.top, z2); if (top > zc + 1e-9) { segs.push({ type: 'bld', bld: b.idx, za: zc, zb: top }); zc = top; } });
      if (z2 > zc + 1e-9) segs.push({ type: 'sky', za: zc, zb: z2 });
      segs.forEach(s => {
        const ta = Math.atan2(s.za, Dd), tb = Math.atan2(s.zb, Dd);
        const zm = (s.za + s.zb) / 2, R = Math.hypot(Dd, zm);
        const n1 = n1Rays(ta, tb), n2 = Gp(yb, R) - Gp(ya, R);
        const g = deg(Math.atan2(zm, Dd));
        sectors.push({ ...s, ya, yb, n1, n2, eps: 0.01 * n1 * n2, gamma: g, q: s.type === 'sky' ? qGamma(g) : null });
      });
    }
    // объединяем соседние полосы неба с одинаковыми границами по высоте (как одна «полоса» на графике)
    const merged = [];
    sectors.forEach(s => {
      const m = merged[merged.length - 1];
      if (m && m.type === s.type && m.bld === s.bld && Math.abs(m.za - s.za) < 1e-9 && Math.abs(m.zb - s.zb) < 1e-9 && Math.abs(m.yb - s.ya) < 1e-9) {
        m.yb = s.yb; m.n2 += s.n2; m.eps = 0.01 * m.n1 * m.n2;
      } else merged.push({ ...s });
    });
    // число лучей округляется до десятых долей луча (пунктир на графиках I и II), εб = 0,01·n1·n2 — по округлённым значениям
    merged.forEach(m => { m.n1raw = m.n1; m.n2raw = m.n2; m.n1 = Math.round(m.n1 * 10 + 1e-9) / 10; m.n2 = Math.round(m.n2 * 10 + 1e-9) / 10; m.eps = 0.01 * m.n1 * m.n2; });
    return { geo, sectors: merged };
  }

  /* ---------- боковое освещение: одна стена ---------- */
  // inp: {name, orient, group, CN?, MF, rho, bp, dp, hp, lt, ds, dst, kPos, windows:[...], buildings:[...]}
  function sideWall(inp) {
    const L = new Log();
    const P = { lt: inp.lt, ds: inp.ds || 0, hp: inp.hp };
    const CNr = inp.CN !== undefined ? { v: inp.CN, row: '—' } : CNwall(inp.group, inp.orient);
    const CN = CNr.v;
    L.add({ sym: 'CN', name: 'Коэффициент светового климата', val: CN, src: `СП 52.13330.2016, табл. 5.1 (группа ${inp.group}, ориентация ${inp.orient})` });
    const onFloor = inp.hp <= 0.001;
    const hUrp = onFloor ? 0.8 : inp.hp;
    const topMax = Math.max(...inp.windows.map(w => w.hpd + w.ho));
    const h01 = topMax - hUrp;
    // табличные параметры округляются до сотых (как при ручном расчёте и в keo.expert)
    const rnd2 = x => Math.round(x * 100 + 1e-9) / 100;
    const dh = rnd2(inp.dp / h01), ld = rnd2(inp.lt / inp.dp), bd = rnd2(inp.bp / inp.dp);
    const ldOut = rnd2((inp.lt + inp.dst) / inp.dp);
    const r0 = inp.r0 !== undefined ? { v: inp.r0, notes: ['задан вручную'], table: '—' } : r0Lookup(onFloor, dh, ld, bd, inp.rho);
    L.add({ sym: 'h01', name: 'Высота верха окна над УРП', formula: onFloor ? 'h01 = hв.о − 0,8' : 'h01 = hв.о − hр', subst: `${r2f(topMax)} − ${r2f(hUrp)}`, val: h01, unit: 'м', src: onFloor ? 'Табл. Б.7 СП 367 (отношение к высоте от уровня УРП)' : 'Табл. Б.6 СП 367' });
    L.add({ sym: 'r0', name: 'Коэффициент отражённого света', formula: `табл. ${r0.table}: dп/h01 = ${r2f(dh)}; lт/dп = ${r2f(ld)}; bп/dп = ${r2f(bd)}; ρср = ${r2f(inp.rho)}`, val: r0.v, notes: r0.notes, src: `СП 367.1325800.2025, табл. ${r0.table}` });

    const bsp = (() => { const a = Math.min(...inp.windows.map(w => w.s - w.bo / 2)), b = Math.max(...inp.windows.map(w => w.s + w.bo / 2)); return b - a; })();
    const hWin = topMax; // hо + hпд
    const blds = (inp.buildings || []).map(b => ({ ...b }));
    // параметры зданий: bф, z1, z2, Kзд0
    blds.forEach(b => {
      b.la = b.l / b.a; b.aH = b.a / b.Hp;
      const bf = b.bf !== undefined ? { v: b.bf, notes: ['задано вручную'] } : bfLookup(b.rhoF, b.la, b.aH);
      b.bfv = bf.v; b.bfNotes = bf.notes;
      b.z1 = b.a * (inp.lt + inp.dst) / ((b.l + inp.lt + inp.dst) * bsp);
      b.z2 = b.Hp * (inp.lt + inp.dst) / ((b.l + inp.lt + inp.dst) * hWin);
      const k0 = b.kzd0 !== undefined ? { v: b.kzd0, notes: ['задано вручную'] } : kzd0Lookup(b.rhoF, inp.rho, b.z1, b.z2, ldOut);
      b.kzd0v = k0.v; b.kzd0Notes = k0.notes;
    });
    // секторы по окнам
    const wins = inp.windows.map((w, wi) => {
      const sec = sideSectors(P, inp.dst, w, blds);
      const tau0 = w.tau0 !== undefined ? w.tau0 : (w.t1 * w.t2 * (w.t3 || 1) * (w.t4 || 1) * (w.t5 || 1));
      const K = w.K !== undefined ? { v: w.K, tab: null, title: 'задан вручную' } : KLookup(w.kType, inp.dp, w.kDepth || 0, inp.kPos);
      return { idx: wi, w, ...sec, tau0, K: K.v, Kinfo: K };
    });
    const sumEb = wins.reduce((s, w) => s + w.sectors.filter(x => x.type === 'sky').reduce((a, x) => a + x.eps, 0), 0);
    const sumEzd = wins.reduce((s, w) => s + w.sectors.filter(x => x.type === 'bld').reduce((a, x) => a + x.eps, 0), 0);
    const frac = (sumEb + sumEzd) > 0 ? sumEzd / (sumEb + sumEzd) : 0;
    blds.forEach(b => { b.kzd = b.kzdv !== undefined ? b.kzdv : 1 + (b.kzd0v - 1) * frac; });
    const MFv = inp.MF;
    wins.forEach(w => {
      w.sumSky = w.sectors.filter(x => x.type === 'sky').reduce((a, x) => a + x.eps * x.q, 0);
      w.sumBld = w.sectors.filter(x => x.type === 'bld').reduce((a, x) => a + x.eps * blds[x.bld].bfv * blds[x.bld].kzd, 0);
      w.e = CN * (w.sumSky + w.sumBld) * r0.v * w.tau0 * w.K * MFv;
    });
    const e = wins.reduce((s, w) => s + w.e, 0);
    return { kind: 'side', name: inp.name, orient: inp.orient, CN, CNrow: CNr.row, MF: MFv, onFloor, h01, dh, ld, bd, ldOut, r0: r0.v, r0info: r0, bsp, wins, blds, sumEb, sumEzd, frac, e, log: L.items, inp };
  }

  // Боковое освещение помещения: сумма по стенам (п. 8.4.1, прим.)
  function side(inp) {
    const walls = inp.walls.map(w => sideWall({ ...w, rho: inp.rho, hp: inp.hp, MF: w.MF !== undefined ? w.MF : inp.MF, group: inp.group }));
    const e = walls.reduce((s, w) => s + w.e, 0);
    return { kind: 'side', walls, e, eR: Math.round(e * 100 + 1e-9) / 100 };
  }

  /* ---------- верхнее освещение: зенитные и шахтные фонари ---------- */
  function lanternIndex(t) {
    if (t.shape === 'round') {
      const rv = t.dv / 2, rn = t.dn / 2;
      return { i: (rv + rn) / (2 * t.hsf), Av: PI * rv * rv, An: PI * rn * rn, Pv: 2 * PI * rv, Pn: 2 * PI * rn, formula: 'iф = (rф.в + rф.н) / (2·hс.ф)', eq: '(8.3)', subst: `(${r2f(rv)} + ${r2f(rn)}) / (2·${r2f(t.hsf)})` };
    }
    const Av = t.av * t.bv, An = t.an * t.bn, Pv = 2 * (t.av + t.bv), Pn = 2 * (t.an + t.bn);
    return { i: 4 * (Av + An) / (Math.sqrt(PI) * t.hsf * (Pv + Pn)), Av, An, Pv, Pn, formula: 'iф = 4·(Aф.в + Aф.н) / (√π·hс.ф·(Pф.в + Pф.н))', eq: '(8.2)', subst: `4·(${r2f(Av, 3)} + ${r2f(An, 3)}) / (√π·${r2f(t.hsf)}·(${r2f(Pv)} + ${r2f(Pn)}))` };
  }
  function avgB10(es) { const N = es.length; if (N < 2) return es[0]; let s = (es[0] + es[N - 1]) / 2; for (let j = 1; j < N - 1; j++) s += es[j]; return s / (N - 1); }

  // inp: {group, CN?, MF, rho, H, hurp, spans, l1, points:[{x,y}], types:[{name, shape, av,bv,an,bn | dv,dn, hsf, refl, rhoW, Kc?, t1..t5 | tau0, lanterns:[{x,y}] , lf?:[[...per point per lantern]] }]}
  function top(inp) {
    const CN = inp.CN !== undefined ? inp.CN : CNzenith(inp.group);
    const hr = inp.H - inp.hurp;
    const r2 = inp.r2 !== undefined ? { v: inp.r2, notes: ['задан вручную'] } : r2Lookup(hr / inp.l1, inp.rho, inp.spans);
    const types = inp.types.map(t => {
      const idx = lanternIndex(t);
      const kc = t.Kc !== undefined ? { v: t.Kc, notes: ['задан вручную'], fig: '—' } : kcLookup(t.refl, idx.i, t.rhoW);
      const m = 2 + 2 / kc.v;
      const tau0 = t.tau0 !== undefined ? t.tau0 : t.t1 * t.t2 * (t.t3 || 1) * (t.t4 || 1) * (t.t5 || 1);
      const MFv = t.MF !== undefined ? t.MF : inp.MF;
      const coef = 100 * idx.Av / (PI * hr * hr);
      const pts = inp.points.map((p, j) => {
        const rows = t.lanterns.map((l, li) => {
          const lf = (t.lf && t.lf[j]) ? t.lf[j][li] : Math.hypot(l.x - p.x, l.y - p.y);
          const a = Math.atan2(lf, hr), aDeg = deg(a);
          const q = qGamma(90 - aDeg), c = Math.pow(Math.cos(a), m);
          return { li, lf, lfh: lf / hr, a: aDeg, q, cm: c, qc: q * c };
        });
        const S = rows.reduce((s, r) => s + r.qc, 0);
        return { rows, S, eps: coef * S };
      });
      const epsAvg = pts.reduce((s, p) => s + p.eps, 0) / pts.length;
      const sOtr = epsAvg * (r2.v - 1) * tau0 * MFv * CN;
      pts.forEach(p => { p.sPr = p.eps * tau0 * MFv * CN; p.e = p.sPr + sOtr; });
      return { t, idx, kc, m, tau0, MF: MFv, coef, pts, epsAvg, sOtr };
    });
    const e = inp.points.map((_, j) => types.reduce((s, T) => s + T.pts[j].e, 0));
    return { kind: 'top', CN, hr, r2: r2.v, r2info: r2, hl: hr / inp.l1, types, e, ...stats(e), inp };
  }
  /* ---------- верхнее освещение: фонари-надстройки и проёмы в покрытии, формула (Б.2) ---------- */
  const KF = { rect: 1.2, trap: 1.15, A: 1.15, shedV: 1.4, shedI: 1.3, ribbon: 1.0, pieces: 1.1 };
  const KIND_NAME = { rect: 'прямоугольный (вертикальное двустороннее остекление)', trap: 'трапециевидный (наклонное двустороннее остекление)', A: 'А-образный (наклонное двустороннее остекление)', shedV: 'шедовый с вертикальным остеклением', shedI: 'шедовый с наклонным остеклением', plane: 'световой проём в плоскости покрытия' };
  function kfOf(t) { return t.kind === 'plane' ? (t.pieces > 1 ? KF.pieces : KF.ribbon) : KF[t.kind]; }
  function tiltIdx(t) { const b = (t.kind === 'rect' || t.kind === 'shedV') ? 90 : (t.kind === 'plane' ? 0 : t.beta); return b <= 15 ? 0 : b <= 45 ? 1 : b <= 75 ? 2 : 3; }
  // профиль фонаря в разрезе: отрезки относительно оси фонаря xc и отметки низа проёма Hk
  function lanternProfile(t, xc, Hk) {
    const b2 = t.b / 2, Hn = Hk + (t.hst || 0), segs = [], glass = [];
    const op = (x1, z1, x2, z2, role) => segs.push({ x1, z1, x2, z2, kind: 'opaque', role });
    const gl = (x1, z1, x2, z2, side) => { const s = { x1, z1, x2, z2, kind: 'glass', side }; segs.push(s); glass.push(s); };
    if (t.hst > 0) { op(xc - b2, Hk, xc - b2, Hn, 'upstand'); op(xc + b2, Hk, xc + b2, Hn, 'upstand'); }
    const run = t.beta ? t.ho / Math.tan(rad(t.beta)) : 0;
    const f = t.face === 'L' ? -1 : 1; // для шедов: сторона остекления
    if (t.kind === 'rect') { gl(xc - b2, Hn, xc - b2, Hn + t.ho, 'L'); gl(xc + b2, Hn, xc + b2, Hn + t.ho, 'R'); op(xc - b2, Hn + t.ho, xc + b2, Hn + t.ho, 'cover'); }
    else if (t.kind === 'trap') { gl(xc - b2, Hn, xc - b2 + run, Hn + t.ho, 'L'); gl(xc + b2, Hn, xc + b2 - run, Hn + t.ho, 'R'); op(xc - b2 + run, Hn + t.ho, xc + b2 - run, Hn + t.ho, 'cover'); }
    else if (t.kind === 'A') { const h = b2 * Math.tan(rad(t.beta)); gl(xc - b2, Hn, xc, Hn + h, 'L'); gl(xc + b2, Hn, xc, Hn + h, 'R'); }
    else if (t.kind === 'shedV') { gl(xc + f * b2, Hn, xc + f * b2, Hn + t.ho, f > 0 ? 'R' : 'L'); op(xc - f * b2, Hn, xc + f * b2, Hn + t.ho, 'slope'); }
    else if (t.kind === 'shedI') { const xt = xc + f * (b2 - run); gl(xc + f * b2, Hn, xt, Hn + t.ho, f > 0 ? 'R' : 'L'); op(xc - f * b2, Hn, xt, Hn + t.ho, 'slope'); }
    else if (t.kind === 'plane') { gl(xc - b2, Hn, xc + b2, Hn, 'H'); }
    return { segs, glass, Hn, top: Math.max(...segs.map(s => Math.max(s.z1, s.z2))) };
  }
  // полный разрез: стены, покрытие с проёмами, фонари
  function b2Section(inp) {
    const L = inp.L, Hk = inp.Hk, segs = [], inst = [];
    inp.types.forEach((t, ti) => t.xs.forEach((xc, k) => { const p = lanternProfile(t, xc, Hk); p.ti = ti; p.k = k; p.xc = xc; p.xa = xc - t.b / 2; p.xb = xc + t.b / 2; inst.push(p); }));
    inst.sort((a, b) => a.xa - b.xa);
    segs.push({ x1: 0, z1: 0, x2: 0, z2: Hk, kind: 'opaque', role: 'wall' }, { x1: L, z1: 0, x2: L, z2: Hk, kind: 'opaque', role: 'wall' });
    let cur = 0;
    inst.forEach(p => { if (p.xa > cur + 1e-9) segs.push({ x1: cur, z1: Hk, x2: p.xa, z2: Hk, kind: 'opaque', role: 'roof' }); cur = Math.max(cur, p.xb); });
    if (cur < L - 1e-9) segs.push({ x1: cur, z1: Hk, x2: L, z2: Hk, kind: 'opaque', role: 'roof' });
    inst.forEach((p, ii) => p.segs.forEach(s => { s.inst = ii; s.ti = p.ti; segs.push(s); }));
    return { segs, inst };
  }
  function hitT(ax, az, c, s, g) { // луч A + t·(c, s) против отрезка g
    const dx = g.x2 - g.x1, dz = g.z2 - g.z1, den = c * dz - s * dx;
    if (Math.abs(den) < 1e-14) return null;
    const qx = g.x1 - ax, qz = g.z1 - az;
    const t = (qx * dz - qz * dx) / den, u = (qx * s - qz * c) / den;
    return (t > 1e-9 && u >= -1e-12 && u <= 1 + 1e-12) ? t : null;
  }
  // видимые через каждое остекление угловые интервалы (в разрезе), φ отсчитывается от направления +x
  function b2Visible(sec, A) {
    const crit = new Set([0, PI]);
    sec.segs.forEach(g => [[g.x1, g.z1], [g.x2, g.z2]].forEach(([x, z]) => { const a = Math.atan2(z - A.z, x - A.x); if (a > 0 && a < PI) crit.add(a); }));
    const cs = [...crit].sort((a, b) => a - b), vis = new Map();
    for (let i = 0; i < cs.length - 1; i++) {
      const a = cs[i], b = cs[i + 1]; if (b - a < 1e-10) continue;
      const m = (a + b) / 2, c = Math.cos(m), s = Math.sin(m);
      const hits = []; sec.segs.forEach(g => { const t = hitT(A.x, A.z, c, s, g); if (t !== null) hits.push([t, g]); });
      if (!hits.length) continue;
      hits.sort((p, q) => p[0] - q[0]);
      const [t0, g0] = hits[0];
      if (g0.kind !== 'glass') continue;
      if (hits.some(([t, g]) => g !== g0 && t > t0 + 1e-9)) continue; // за остеклением — препятствие (соседний фонарь)
      if (!vis.has(g0)) vis.set(g0, []);
      const L = vis.get(g0), last = L[L.length - 1];
      if (last && Math.abs(last[1] - a) < 1e-10) last[1] = b; else L.push([a, b]);
    }
    return vis;
  }
  const pointOn = (A, phi, g) => { const t = hitT(A.x, A.z, Math.cos(phi), Math.sin(phi), g) ?? hitT(A.x, A.z, Math.cos(phi + (phi < PI / 2 ? 1e-9 : -1e-9)), Math.sin(phi + (phi < PI / 2 ? 1e-9 : -1e-9)), g); return t === null ? null : { x: A.x + t * Math.cos(phi), z: A.z + t * Math.sin(phi), t }; };
  // протяжённость фонаря вдоль оси: отрезки y относительно линии разреза y0
  function b2Ysegs(t, y0) {
    const n = Math.max(1, t.pieces || 1), out = [];
    for (let i = 0; i < n; i++) { const ya = t.ystart + i * (t.pitch || 0); out.push([ya - y0, ya + t.ylen - y0]); }
    return out;
  }
  // inp: {group, rho, L, W, Hk, hurp, spans, l1, y0, points:[{x}], types:[{name, kind, b, hst, ho, beta, face, pieces, ystart, ylen, pitch, t1..t5, MF, CNrow|CN, xs:[...] }]}
  function lanternsB2(inp) {
    const sec = b2Section(inp), y0 = inp.y0;
    const CNrowVal = (t) => t.CN !== undefined ? t.CN : (t.CNrow === 'zenith' ? D.CN.zenith : t.CNrow === 'shed' ? D.CN.lantern.shed : D.CN.lantern[t.CNrow])[inp.group - 1];
    const types = inp.types.map((t, ti) => {
      const kf = t.kf !== undefined ? t.kf : kfOf(t);
      const tau0 = t.tau0 !== undefined ? t.tau0 : t.t1 * t.t2 * (t.t3 || 1) * (t.t4 || 1) * (t.t5 || 1);
      const Hn = inp.Hk + (t.hst || 0), hf = Hn - inp.hurp;
      const r2 = t.r2 !== undefined ? { v: t.r2, notes: ['задан вручную'] } : r2Lookup(hf / inp.l1, inp.rho, inp.spans);
      return { t, ti, kf, tau0, CN: CNrowVal(t), MF: t.MF, hf, hl: hf / inp.l1, r2: r2.v, r2info: r2, ys: b2Ysegs(t, y0), pts: [] };
    });
    inp.points.forEach((p, j) => {
      const A = { x: p.x, z: inp.hurp };
      const vis = b2Visible(sec, A);
      types.forEach(T => T.pts[j] = { sectors: [], S: 0 });
      sec.inst.forEach((I, ii) => I.glass.forEach(g => {
        (vis.get(g) || []).forEach(([pa, pb]) => {
          const P1 = pointOn(A, pa, g), P2 = pointOn(A, pb, g); if (!P1 || !P2) return;
          const C = { x: (P1.x + P2.x) / 2, z: (P1.z + P2.z) / 2 };
          const R = Math.hypot(C.x - A.x, C.z - A.z), gam = deg(Math.atan2(C.z - A.z, Math.abs(C.x - A.x)));
          const T = types[I.ti];
          // график II: горизонталь № R через C; торцы проёма на уровне покрытия лежат ниже C на (zC − Hk) — учитываем более ограничивающий уровень
          const Rr = Math.max(R - (C.z - inp.Hk), 1e-6);
          let n1 = 50 * Math.abs(Math.cos(pa) - Math.cos(pb)), n2 = T.ys.reduce((s, [ya, yb]) => { const lo = Math.max(ya / R, ya / Rr), hi = Math.min(yb / R, yb / Rr); return hi > lo ? s + Gp(hi, 1) - Gp(lo, 1) : s; }, 0);
          const n1raw = n1, n2raw = n2;
          n1 = Math.round(n1 * 10 + 1e-9) / 10; n2 = Math.round(n2 * 10 + 1e-9) / 10;
          const eps = 0.01 * n1 * n2, q = qGamma(gam);
          T.pts[j].sectors.push({ inst: I.k, ti: I.ti, side: g.side, phiA: deg(pa), phiB: deg(pb), C, R, gamma: gam, n1, n2, n1raw, n2raw, eps, q, eq: eps * q });
        });
      }));
      types.forEach(T => { T.pts[j].sectors.sort((a, b) => a.inst - b.inst || a.phiA - b.phiA); T.pts[j].S = T.pts[j].sectors.reduce((s, x) => s + x.eq, 0); });
    });
    types.forEach(T => {
      T.epsAvg = T.pts.reduce((s, p) => s + p.S, 0) / T.pts.length;
      T.refl = T.epsAvg * (T.r2 * T.kf - 1);
      T.pts.forEach(p => { p.sPr = T.CN * p.S * T.tau0 * T.MF; p.e = T.CN * (p.S + T.refl) * T.tau0 * T.MF; });
      T.sOtr = T.CN * T.refl * T.tau0 * T.MF;
    });
    const e = inp.points.map((_, j) => types.reduce((s, T) => s + T.pts[j].e, 0));
    return { kind: 'b2', sec, types, e, ...stats(e), inp };
  }
  // контроль: точное интегрирование по полусфере (равнояркое небо или небо МКО) для той же геометрии
  function b2Exact(inp, p, withQ, nPhi = 3000, nPsi = 120) {
    const sec = b2Section(inp), A = { x: p.x, z: inp.hurp }, y0 = inp.y0;
    let sum = 0;
    for (let i = 0; i < nPhi; i++) {
      const phi = (i + 0.5) * PI / nPhi, c = Math.cos(phi), s = Math.sin(phi);
      const hits = []; sec.segs.forEach(g => { const t = hitT(A.x, A.z, c, s, g); if (t !== null) hits.push([t, g]); });
      if (!hits.length) continue; hits.sort((a, b) => a[0] - b[0]);
      const [tg, g0] = hits[0]; if (g0.kind !== 'glass' || hits.some(([t, g]) => g !== g0 && t > tg + 1e-9)) continue;
      const tr = (inp.Hk - A.z) / s; // пересечение плоскости проёма в покрытии
      const T = inp.types[g0.ti];
      b2Ysegs(T, y0).forEach(([ya, yb]) => {
        const lo = Math.max(ya / tr, ya / tg), hi = Math.min(yb / tr, yb / tg); if (hi <= lo) return;
        const p1 = Math.atan(lo), p2 = Math.atan(hi);
        if (!withQ) { sum += s * ((p2 + 0.5 * Math.sin(2 * p2)) - (p1 + 0.5 * Math.sin(2 * p1))) / 2 * (PI / nPhi); return; }
        for (let k = 0; k < nPsi; k++) { const ps = p1 + (k + 0.5) * (p2 - p1) / nPsi, cp = Math.cos(ps); const el = Math.asin(cp * s); sum += s * cp * cp * qGamma(deg(el)) * (p2 - p1) / nPsi * (PI / nPhi); }
      });
    }
    return 100 * sum / PI;
  }

  function stats(e) {
    const eAvg = avgB10(e), eMin = Math.min(...e);
    const eAvgR = Math.round(eAvg * 100 + 1e-9) / 100;
    return { eAvg, eAvgR, eMin, uni: eMin / eAvg, uniInv: eAvg / eMin };
  }

  /* ---------- комбинированное (Б.4) ---------- */
  // inp.top — как для top(); inp.side — как для side(), но lt и ds в каждой точке вычисляются из координат точки
  // inp.sideMap: {axis:'x'|'y', wallAt: число (координата внутренней грани стены с окнами), sign:+1/-1, axisCoord: координата оси стены вдоль}
  function combined(inp) {
    const T = inp.topKind === 'b2' ? lanternsB2(inp.top) : top(inp.top);
    const S = inp.top.points.map(p => {
      const sm = inp.sideMap;
      const lt = sm.axis === 'x' ? Math.abs(p.x - sm.wallAt) : Math.abs(p.y - sm.wallAt);
      const along = sm.axis === 'x' ? p.y : p.x;
      const walls = inp.side.walls.map(w => ({ ...w, lt, ds: (along - sm.axisCoord) * (sm.flip ? -1 : 1) }));
      return side({ ...inp.side, walls });
    });
    const e = T.e.map((v, j) => v + S[j].e);
    return { kind: 'comb', top: T, side: S, e, ...stats(e) };
  }

  return { lanternsB2, b2Exact, b2Section, lanternProfile, kfOf, tiltIdx, KIND_NAME, qGamma, n1Rays, Gp, interp, r0Lookup, kzd0Lookup, bfLookup, KLookup, r2Lookup, kcLookup, CNwall, CNzenith, MF, sideSectors, sideWall, side, lanternIndex, top, combined, avgB10, r2f, deg, rad };
})();
if (typeof module !== 'undefined') module.exports = Engine;
