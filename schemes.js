/* Схемы (план/разрез) как набор примитивов в метрах → SVG (экран) и PDF (отчёт). */
const Schemes = (function () {
  const r2 = (x, n = 2) => Number(x).toFixed(n).replace('.', ',');
  // классы: wall, glass, room, ray, rayb, sky, bld, pt, dim, txt, lan, sec, axis
  function sideSection(inp, res) {
    // inp: {dp, hp, dst, H, win (max window), buildings}
    const it = []; const w = inp.windows.reduce((a, b) => (b.hpd + b.ho > a.hpd + a.ho ? b : a), inp.windows[0]);
    const top = Math.max(...inp.windows.map(x => x.hpd + x.ho));
    const H = Math.max(inp.H || 0, top + 0.4, 2.7);
    const dst = inp.dst, dp = inp.dp;
    // ось x: внутренняя грань стены = 0, помещение x>0, улица x<0
    const ext = Math.min(Math.max(dp * 0.6, 2.2), 4);
    it.push({ t: 'rect', x: -dst, y: 0, w: dst, h: w.hpd, c: 'wall' });
    it.push({ t: 'rect', x: -dst, y: w.hpd + w.ho, w: dst, h: H + 0.3 - (w.hpd + w.ho), c: 'wall' });
    it.push({ t: 'line', x1: -dst / 2, y1: w.hpd, x2: -dst / 2, y2: w.hpd + w.ho, c: 'glass' });
    it.push({ t: 'line', x1: -dst - ext, y1: 0, x2: dp + 0.3, y2: 0, c: 'room' });
    it.push({ t: 'line', x1: 0, y1: H, x2: dp, y2: H, c: 'room' });
    it.push({ t: 'line', x1: dp, y1: 0, x2: dp, y2: H, c: 'room' });
    if (inp.hp > 0) it.push({ t: 'line', x1: 0, y1: inp.hp, x2: dp, y2: inp.hp, c: 'axis' });
    const A = { x: inp.lt, y: inp.hp };
    // лучи к границам видимого участка
    const W0 = res && res.wins && res.wins[0];
    if (W0 && W0.geo && W0.geo.z2 > W0.geo.z1) {
      const g = W0.geo, L = Math.hypot(inp.lt + dst + ext, 0);
      [[g.z1, 'rayb'], [g.z2, 'rayb']].forEach(([z, c]) => {
        const k = (inp.lt + dst + ext) / g.D;
        it.push({ t: 'line', x1: A.x, y1: A.y, x2: A.x - g.D * k, y2: A.y + z * k, c });
      });
      const zm = (g.z1 + g.z2) / 2, k = (inp.lt + dst + ext * 0.85) / g.D;
      it.push({ t: 'line', x1: A.x, y1: A.y, x2: A.x - g.D * k, y2: A.y + zm * k, c: 'ray' });
      const sg = res.wins[0].sectors.find(s => s.type === 'sky');
      it.push({ t: 'text', x: A.x - g.D * 0.55, y: A.y + zm * 0.55 + 0.12, s: 'γ = ' + r2(sg ? sg.gamma : Engine.deg(Math.atan2(zm, g.D))) + '°', c: 'txt', a: 'middle' });
    }
    // здания (условно, со сжатием расстояния)
    (inp.buildings || []).forEach((b, i) => {
      const xb = -dst - Math.min(ext - 0.3, 0.6 + i * 0.4);
      it.push({ t: 'rect', x: xb - 0.25, y: 0, w: 0.25, h: Math.min(b.Hp, H + 1.2), c: 'bld' });
      it.push({ t: 'text', x: xb - 0.12, y: Math.min(b.Hp, H + 1.2) + 0.15, s: `здание ${i + 1}: l = ${r2(b.l, 1)} м`, c: 'txt', a: 'end' });
    });
    it.push({ t: 'circle', x: A.x, y: A.y, r: 0.08, c: 'pt' });
    it.push({ t: 'text', x: A.x + 0.12, y: A.y + 0.15, s: 'А', c: 'txtb' });
    // размеры
    it.push({ t: 'dim', x1: 0, y1: -0.5, x2: inp.lt, y2: -0.5, s: 'lт = ' + r2(inp.lt) });
    it.push({ t: 'dim', x1: 0, y1: -1.05, x2: dp, y2: -1.05, s: 'dп = ' + r2(dp) });
    it.push({ t: 'dimv', x1: dp + 0.35, y1: 0, x2: dp + 0.35, y2: top, s: 'hв.о = ' + r2(top) });
    it.push({ t: 'text', x: -dst - ext + 0.1, y: H + 0.1, s: 'Разрез', c: 'cap' });
    return { box: [-dst - ext, -1.3, dp + 0.9, H + 1.6], it };
  }

  function sidePlan(inp, res) {
    const it = []; const dp = inp.dp, bp = inp.bp, dst = inp.dst;
    // ось y — вдоль стены (вверх на схеме), x — вглубь
    const y0 = -bp / 2, y1 = bp / 2;
    it.push({ t: 'rect', x: 0, y: y0, w: dp, h: bp, c: 'roomf' });
    const A = { x: inp.lt, y: inp.ds || 0 };
    if (res && res.wins) res.wins.forEach(W => {
      if (!(W.geo.y2 > W.geo.y1 && W.geo.z2 > W.geo.z1)) return;
      const k = (inp.lt + dst + 0.8) / W.geo.D;
      it.push({ t: 'poly', pts: [[A.x, A.y], [A.x - W.geo.D * k, A.y + W.geo.y1 * k], [A.x - W.geo.D * k, A.y + W.geo.y2 * k]], c: 'skyf' });
    });
    // стена с проёмами
    const ws = inp.windows.map(w => [w.s - w.bo / 2, w.s + w.bo / 2]).sort((a, b) => a[0] - b[0]);
    let cur = y0 - 0.3;
    ws.forEach(([a, b]) => { if (a > cur) it.push({ t: 'rect', x: -dst, y: cur, w: dst, h: a - cur, c: 'wall' }); it.push({ t: 'line', x1: -dst / 2, y1: a, x2: -dst / 2, y2: b, c: 'glass' }); cur = Math.max(cur, b); });
    if (cur < y1 + 0.3) it.push({ t: 'rect', x: -dst, y: cur, w: dst, h: y1 + 0.3 - cur, c: 'wall' });
    it.push({ t: 'line', x1: -dst - 0.8, y1: A.y, x2: dp, y2: A.y, c: 'axis' });
    it.push({ t: 'circle', x: A.x, y: A.y, r: 0.08, c: 'pt' });
    it.push({ t: 'text', x: A.x + 0.12, y: A.y + 0.15, s: 'А', c: 'txtb' });
    it.push({ t: 'dimv', x1: dp + 0.35, y1: y0, x2: dp + 0.35, y2: y1, s: 'bп = ' + r2(bp) });
    it.push({ t: 'dim', x1: 0, y1: y0 - 0.45, x2: dp, y2: y0 - 0.45, s: 'dп = ' + r2(dp) });
    it.push({ t: 'text', x: -dst - 0.7, y: y1 + 0.55, s: 'План', c: 'cap' });
    return { box: [-dst - 0.9, y0 - 0.9, dp + 1.0, y1 + 0.85], it };
  }

  function topPlan(inp, pts) {
    const it = []; const L = inp.L, B = inp.B;
    it.push({ t: 'rect', x: 0, y: 0, w: L, h: B, c: 'roomf' });
    it.push({ t: 'line', x1: -0.3, y1: inp.y0, x2: L + 0.3, y2: inp.y0, c: 'axis' });
    inp.types.forEach((T, ti) => T.lanterns.forEach((l, li) => {
      if (T.shape === 'round') it.push({ t: 'circle', x: l.x, y: l.y, r: T.dv / 2, c: 'lan' });
      else it.push({ t: 'rect', x: l.x - T.av / 2, y: l.y - T.bv / 2, w: T.av, h: T.bv, c: 'lan' });
      it.push({ t: 'text', x: l.x, y: l.y - 0.1, s: (inp.types.length > 1 ? (ti + 1) + '.' : '') + (li + 1), c: 'txt', a: 'middle' });
    }));
    pts.forEach((p, j) => {
      it.push({ t: 'circle', x: p.x, y: p.y, r: 0.07, c: 'pt' });
      it.push({ t: 'text', x: p.x, y: p.y - 0.42, s: 'РТ' + (j + 1), c: 'txtb', a: 'middle' });
    });
    if (inp.sideWall) {
      const x = inp.sideWall === 'xL' ? L : 0;
      it.push({ t: 'rect', x: x === 0 ? -0.25 : L, y: 0, w: 0.25, h: B, c: 'wallw' });
    }
    it.push({ t: 'dim', x1: 0, y1: -0.45, x2: L, y2: -0.45, s: 'L = ' + r2(L) });
    it.push({ t: 'dimv', x1: L + 0.4, y1: 0, x2: L + 0.4, y2: B, s: 'B = ' + r2(B) });
    it.push({ t: 'text', x: 0, y: B + 0.35, s: 'План', c: 'cap' });
    return { box: [-0.6, -0.9, L + 1.0, B + 0.7], it };
  }

  function topSection(inp, pts) {
    const it = []; const L = inp.L, H = inp.H, hs = Math.max(...inp.types.map(t => t.hsf));
    it.push({ t: 'line', x1: 0, y1: 0, x2: L, y2: 0, c: 'room' });
    it.push({ t: 'line', x1: 0, y1: 0, x2: 0, y2: H, c: 'room' });
    it.push({ t: 'line', x1: L, y1: 0, x2: L, y2: H, c: 'room' });
    it.push({ t: 'line', x1: 0, y1: inp.hurp, x2: L, y2: inp.hurp, c: 'axis' });
    // перекрытие с шахтами (проекция фонарей на разрез)
    const holes = [];
    inp.types.forEach(T => T.lanterns.forEach(l => { const w = T.shape === 'round' ? T.dn : T.an; holes.push([l.x - w / 2, l.x + w / 2, T]); }));
    holes.sort((a, b) => a[0] - b[0]);
    let cur = 0; holes.forEach(([a, b]) => { if (a > cur) it.push({ t: 'rect', x: cur, y: H, w: a - cur, h: 0.25, c: 'wall' }); cur = Math.max(cur, b); });
    if (cur < L) it.push({ t: 'rect', x: cur, y: H, w: L - cur, h: 0.25, c: 'wall' });
    holes.forEach(([a, b, T]) => {
      const wv = T.shape === 'round' ? T.dv : T.av, c = (a + b) / 2;
      it.push({ t: 'line', x1: a, y1: H, x2: c - wv / 2, y2: H + T.hsf, c: 'room' });
      it.push({ t: 'line', x1: b, y1: H, x2: c + wv / 2, y2: H + T.hsf, c: 'room' });
      it.push({ t: 'line', x1: c - wv / 2, y1: H + T.hsf, x2: c + wv / 2, y2: H + T.hsf, c: 'glass' });
    });
    pts.forEach((p, j) => { it.push({ t: 'circle', x: p.x, y: inp.hurp, r: 0.07, c: 'pt' }); it.push({ t: 'text', x: p.x, y: inp.hurp - 0.4, s: 'РТ' + (j + 1), c: 'txtb', a: 'middle' }); });
    const mid = pts[Math.floor(pts.length / 2)];
    if (mid) holes.forEach(([a, b]) => it.push({ t: 'line', x1: mid.x, y1: inp.hurp, x2: (a + b) / 2, y2: H, c: 'ray' }));
    it.push({ t: 'dimv', x1: L + 0.4, y1: inp.hurp, x2: L + 0.4, y2: H, s: 'hр = ' + r2(H - inp.hurp) });
    it.push({ t: 'text', x: 0, y: H + hs + 0.45, s: 'Разрез по линии расчётных точек (фонари спроецированы)', c: 'cap' });
    return { box: [-0.5, -0.8, L + 1.1, H + hs + 0.75], it };
  }


  /* ---------- надстройки: поперечный разрез и план ---------- */
  function b2Sect(inp, res, j, sideWall) {
    const it = [], L = inp.L, Hk = inp.Hk;
    const sec = Engine.b2Section(inp);
    const top = Math.max(Hk + 0.5, ...sec.inst.map(p => p.top));
    it.push({ t: 'line', x1: -0.3, y1: 0, x2: L + 0.3, y2: 0, c: 'room' });
    it.push({ t: 'line', x1: 0, y1: inp.hurp, x2: L, y2: inp.hurp, c: 'axis' });
    // видимые участки из точки j
    const A = { x: inp.points[j].x, z: inp.hurp };
    if (res) res.types.forEach(T => (T.pts[j] ? T.pts[j].sectors : []).forEach(x => {
      const g = sec.inst.find(p => p.ti === x.ti && p.k === x.inst);
      const ext = (phi) => { const sn = Math.max(Math.sin(phi * Math.PI / 180), 0.05), r = Math.min(1.25 * Math.hypot(x.C.x - A.x, x.C.z - A.z), (top + 0.7 - A.z) / sn); return [A.x + r * Math.cos(phi * Math.PI / 180), A.z + r * Math.sin(phi * Math.PI / 180)]; };
      void g; it.push({ t: 'poly', pts: [[A.x, A.z], ext(x.phiA), ext(x.phiB)], c: 'skyf' });
    }));
    // покрытие (с толщиной условно 0,25 м) и стены
    sec.segs.forEach(g => {
      if (g.role === 'roof') it.push({ t: 'rect', x: g.x1, y: Hk, w: g.x2 - g.x1, h: 0.25, c: 'wall' });
      else if (g.role === 'wall') it.push({ t: 'line', x1: g.x1, y1: g.z1, x2: g.x2, y2: g.z2, c: 'room' });
      else if (g.kind === 'glass') it.push({ t: 'line', x1: g.x1, y1: g.z1, x2: g.x2, y2: g.z2, c: 'glass' });
      else it.push({ t: 'line', x1: g.x1, y1: g.z1, x2: g.x2, y2: g.z2, c: 'opq' });
    });
    if (sideWall) { const x = sideWall === 'xL' ? L : 0; it.push({ t: 'rect', x: x === 0 ? -0.25 : L, y: 0, w: 0.25, h: Hk, c: 'wallw' }); }
    const lblY = Math.min(inp.hurp, 0) - 0.6;
    inp.points.forEach((p, k) => { it.push({ t: 'circle', x: p.x, y: inp.hurp, r: 0.09, c: 'pt' }); it.push({ t: 'text', x: p.x, y: lblY, s: 'РТ' + (k + 1), c: k === j ? 'txtb' : 'txt', a: 'middle' }); });
    it.push({ t: 'dim', x1: 0, y1: lblY - 0.9, x2: L, y2: lblY - 0.9, s: 'L = ' + r2(L) });
    it.push({ t: 'dimv', x1: L + 0.5, y1: 0, x2: L + 0.5, y2: Hk, s: 'H = ' + r2(Hk) });
    it.push({ t: 'text', x: 0, y: top + 0.9, s: 'Поперечный разрез', c: 'cap' });
    return { box: [-0.6, lblY - 1.3, L + 1.3, top + 1.3], it };
  }
  function b2Plan(inp, sideWall) {
    const it = [], L = inp.L, B = inp.W;
    it.push({ t: 'rect', x: 0, y: 0, w: L, h: B, c: 'roomf' });
    inp.types.forEach((t, ti) => {
      const n = Math.max(1, t.pieces || 1);
      t.xs.forEach((xc, k) => {
        for (let i = 0; i < n; i++) { const ya = t.ystart + i * (t.pitch || 0); it.push({ t: 'rect', x: xc - t.b / 2, y: ya, w: t.b, h: t.ylen, c: 'lan' }); }
        it.push({ t: 'text', x: xc, y: t.ystart + t.ylen + 0.5, s: (inp.types.length > 1 ? (ti + 1) + '.' : '') + (k + 1), c: 'txt', a: 'middle' });
      });
    });
    it.push({ t: 'line', x1: -0.4, y1: inp.y0, x2: L + 0.4, y2: inp.y0, c: 'axis' });
    inp.points.forEach((p, j) => { it.push({ t: 'circle', x: p.x, y: inp.y0, r: 0.12, c: 'pt' }); });
    if (sideWall) { const x = sideWall === 'xL' ? L : 0; it.push({ t: 'rect', x: x === 0 ? -0.3 : L, y: 0, w: 0.3, h: B, c: 'wallw' }); }
    it.push({ t: 'dim', x1: 0, y1: -0.9, x2: L, y2: -0.9, s: 'L = ' + r2(L) });
    it.push({ t: 'dimv', x1: L + 0.6, y1: 0, x2: L + 0.6, y2: B, s: 'B = ' + r2(B) });
    it.push({ t: 'text', x: 0, y: B + 0.8, s: 'План', c: 'cap' });
    return { box: [-0.7, -1.5, L + 1.5, B + 1.4], it };
  }

  /* ---------- проверка по графикам Данилюка I и II (СП 367: п. 8.4.1, рис. 8.8–8.11; Б.2.10–Б.2.11, (Б.11), (Б.12)) ----------
     Независимо от ядра: углы видимой области строятся заново по исходным размерам (рёбра проёма на внутренней и наружной
     гранях стены, противостоящие здания), затем число лучей СЧИТЫВАЕТСЯ с графиков, построенных по их определению:
     луч k графика I — угол возвышения θk, 50·(1 − cos θk) = k; луч k графика II — угол ψk от оси, (100/π)·(ψk + ½·sin 2ψk) = k.
     Отсчёт у каждой границы — номер луча с десятыми по ближайшей пунктирной линии (n = отсчёт у верхней/правой − у нижней/левой).
     Затеняющие элементы фасада (балкон, лоджия, козырёк, экран) лучи не обрезают — их влияние учтено K (п. 8.4.2).
     Только для прямоугольных проёмов. */
  const DAN = (() => {
    const PI = Math.PI, N1 = th => 50 * (1 - Math.cos(th)), TH = k => Math.acos(1 - k / 50);
    const N2 = p => (100 / PI) * (p + 0.5 * Math.sin(2 * p));
    const PSI = (() => { const c = []; for (let k = 0; k <= 50; k++) { let a = 0, b = PI / 2; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (N2(m) < k) a = m; else b = m; } c.push((a + b) / 2); } return k => c[k]; })();
    const tenth = x => Math.round(x * 10) / 10;
    // отсчёт по графику: ближайшая пунктирная линия десятых долей луча (пунктир графика — доли луча: k + j/10)
    function read1(th) { return tenth(N1(th)); }
    function read2(y, R) { return Math.sign(y) * tenth(N2(Math.atan(Math.abs(y) / R))); }
    // видимые участки одного проёма: небо и фасады противостоящих зданий
    function sectors(raw, win, blds) {
      const lt = raw.lt, D = raw.lt + raw.dst, faces = [[lt, 'внутренняя грань'], [D, 'наружная грань']];
      const zs = win.hpd - raw.hp, zt = win.hpd + win.ho - raw.hp, yl = win.s - win.bo / 2 - (raw.ds || 0), yr = win.s + win.bo / 2 - (raw.ds || 0);
      const pick = (v, cmp) => faces.map(([x, n]) => ({ a: Math.atan2(v, x), n })).reduce((p, q) => cmp(q.a, p.a) ? q : p);
      const lo = pick(zs, (a, b) => a > b), hi = pick(zt, (a, b) => a < b), L = pick(yl, (a, b) => a > b), Rr = pick(yr, (a, b) => a < b);
      if (lo.a < 0) { lo.a = 0; lo.n = 'горизонт (уровень точки А)'; }
      const edges = { lo, hi, L, R: Rr, D, zs, zt, yl, yr };
      if (!(hi.a > lo.a + 1e-9 && Rr.a > L.a + 1e-9)) return { edges, list: [] };
      const B = (blds || []).map((b, i) => { const Db = D + b.l; return { i, Db, pa: Math.atan2(b.off - b.a / 2, Db), pb: Math.atan2(b.off + b.a / 2, Db), top: Math.atan2(b.Hp - raw.hp, Db) }; });
      const br = [L.a, Rr.a]; B.forEach(b => [b.pa, b.pb].forEach(p => { if (p > L.a && p < Rr.a) br.push(p); })); br.sort((a, b) => a - b);
      const parts = [];
      for (let i = 0; i < br.length - 1; i++) {
        const pa = br[i], pb = br[i + 1]; if (pb - pa < 1e-12) continue; const pm = (pa + pb) / 2;
        let tc = lo.a; B.filter(b => b.pa <= pm && b.pb >= pm).sort((a, b) => a.Db - b.Db).forEach(b => { const t = Math.min(b.top, hi.a); if (t > tc + 1e-12) { parts.push({ type: 'bld', bld: b.i, ta: tc, tb: t, pa, pb }); tc = t; } });
        if (hi.a > tc + 1e-12) parts.push({ type: 'sky', ta: tc, tb: hi.a, pa, pb });
      }
      const list = [];
      parts.forEach(s => { const m = list[list.length - 1]; if (m && m.type === s.type && m.bld === s.bld && Math.abs(m.ta - s.ta) < 1e-12 && Math.abs(m.tb - s.tb) < 1e-12 && Math.abs(m.pb - s.pa) < 1e-12) m.pb = s.pb; else list.push({ ...s }); });
      list.forEach(s => {
        const za = D * Math.tan(s.ta), zb = D * Math.tan(s.tb), zm = (za + zb) / 2;
        s.ya = D * Math.tan(s.pa); s.yb = D * Math.tan(s.pb); s.za = za; s.zb = zb; s.R = Math.hypot(D, zm); s.gamma = Math.atan2(zm, D) * 180 / PI;
        s.r1a = read1(s.ta); s.r1b = read1(s.tb); s.n1g = tenth(s.r1b - s.r1a); s.n1a = N1(s.tb) - N1(s.ta);
        s.r2a = read2(s.ya, s.R); s.r2b = read2(s.yb, s.R); s.n2g = tenth(s.r2b - s.r2a); s.n2a = N2(Math.atan(s.yb / s.R)) - N2(Math.atan(s.ya / s.R));
      });
      return { edges, list };
    }
    return { N1, N2, TH, PSI, read1, read2, sectors };
  })();

  // совмещённая схема в одном масштабе: сверху — разрез с графиком I (полюс в А), снизу — план с графиком II
  // (полюс на оси, проходящей через А перпендикулярно стене, на расстоянии R от наружной грани — горизонталь R совпадает с гранью)
  function danScheme(raw, wi, dsec, sel) {
    const it = [], win = raw.windows[wi], s0 = dsec.list[sel] || dsec.list[0], e = dsec.edges, dst = raw.dst, lt = raw.lt, D = e.D, ds = raw.ds || 0;
    const R = s0 ? s0.R : D, Rg = Math.max(R, D) * 1.12, deg = a => (a * 180 / Math.PI);
    const hp = raw.hp, H = Math.max(raw.H || 0, win.hpd + win.ho + 0.3);
    // ---- разрез: x — глубина (внутренняя грань стены x = 0, А при x = lт), z — от пола
    const A = { x: lt, z: hp }, pol = (r, th) => [A.x - r * Math.cos(th), A.z + r * Math.sin(th)];
    // высота разреза ограничена: проём, точка C и запас 1,2 м; лучи графика I обрезаются по верхней границе
    const zTop = Math.max(win.hpd + win.ho, s0 ? hp + (s0.za + s0.zb) / 2 : 0, hp + 1) + 1.2;
    const clipR = th => Math.min(Rg, Math.sin(th) > 1e-9 ? (zTop - A.z) / Math.sin(th) : Rg);
    const xL = Math.min(-dst - 0.6, A.x - Rg - 0.2);
    it.push({ t: 'line', x1: xL, y1: 0, x2: raw.dp + 0.2, y2: 0, c: 'room' });
    if (hp > 0) { it.push({ t: 'line', x1: 0, y1: hp, x2: raw.dp, y2: hp, c: 'axis' }); it.push({ t: 'text', x: raw.dp - 0.05, y: hp + 0.08, s: 'УРП', c: 'txt', a: 'end' }); }
    it.push({ t: 'rect', x: -dst, y: 0, w: dst, h: win.hpd, c: 'wall' });
    it.push({ t: 'rect', x: -dst, y: win.hpd + win.ho, w: dst, h: Math.max(0.2, H - win.hpd - win.ho), c: 'wall' });
    it.push({ t: 'line', x1: -dst / 2, y1: win.hpd, x2: -dst / 2, y2: win.hpd + win.ho, c: 'glass' });
    // видимые участки выбранного проёма (выделен выбранный)
    dsec.list.forEach((s, k) => it.push({ t: 'poly', pts: [[A.x, A.z], pol(clipR(s.ta), s.ta), pol(clipR(s.tb), s.tb)], c: s.type === 'sky' ? (k === sel ? 'skysel' : 'skyf') : (k === sel ? 'bldsel' : 'bldf') }));
    // лучи графика I (номер — у конца луча, каждый десятый; пятые — средней линией)
    for (let k = 0; k <= 50; k++) { const th = DAN.TH(k), rr = clipR(th), p = pol(rr, th); it.push({ t: 'line', x1: A.x, y1: A.z, x2: p[0], y2: p[1], c: k % 10 === 0 ? 'gr10' : k % 5 === 0 ? 'gr5' : 'gr1' }); if (k % 10 === 0) { const q = pol(rr + 0.15, th); it.push({ t: 'text', x: q[0], y: q[1] - 0.04, s: String(k), c: 'grt', a: 'middle' }); } }
    // ограничивающие рёбра и граничные лучи
    if (s0) {
      [s0.ta, s0.tb].forEach(th => { const p = pol(clipR(th), th); it.push({ t: 'line', x1: A.x, y1: A.z, x2: p[0], y2: p[1], c: 'lim' }); });
      const C = { x: -dst, z: hp + (s0.za + s0.zb) / 2 };
      const arc = []; for (let i = 0; i <= 90; i++) { const q = pol(s0.R, i * Math.PI / 180); if (q[1] > zTop) break; arc.push(q); }
      it.push({ t: 'pline', pts: arc, c: 'arc' });
      it.push({ t: 'circle', x: C.x, y: C.z, r: 0.05, c: 'cpt' }); it.push({ t: 'text', x: C.x - 0.08, y: C.z + 0.08, s: 'C', c: 'txtb', a: 'end' });
      it.push({ t: 'line', x1: A.x, y1: A.z, x2: C.x, y2: C.z, c: 'ray' });
    }
    [[e.zs, e.lo], [e.zt, e.hi]].forEach(([z, g]) => { if (g.n.startsWith('горизонт')) return; const x = g.n === 'внутренняя грань' ? 0 : -dst; it.push({ t: 'circle', x, y: hp + z, r: 0.045, c: 'edge' }); });
    it.push({ t: 'circle', x: A.x, y: A.z, r: 0.07, c: 'pt' }); it.push({ t: 'text', x: A.x + 0.1, y: A.z + 0.1, s: 'А', c: 'txtb' });
    it.push({ t: 'dim', x1: -dst, y1: -0.35, x2: 0, y2: -0.35, s: 'Δст' });
    it.push({ t: 'dim', x1: 0, y1: -0.35, x2: lt, y2: -0.35, s: 'lт = ' + r2(lt) });
    const topZ = zTop + 0.45;
    it.push({ t: 'text', x: xL + 0.05, y: topZ, s: 'Разрез · график I', c: 'cap' });
    // ---- план: y — вдоль стены, ниже разреза; полюс графика II — P
    const yr = [win.s - win.bo / 2, win.s + win.bo / 2, ds - 1, ds + 1, ...(s0 ? [ds + s0.ya, ds + s0.yb] : [])], half = Math.max(1.4, ...yr.map(y => Math.abs(y - ds))) + 0.5;
    const off = -0.9 - half, Y = y => off + (y - ds); // ds — ось через А
    const Px = -dst + R, P = { x: Px, y: Y(ds) };
    it.push({ t: 'rect', x: -dst, y: Y(ds - half), w: dst, h: 2 * half, c: 'wall' });
    raw.windows.forEach((w2, j) => { const a = w2.s - w2.bo / 2, b = w2.s + w2.bo / 2; if (b < ds - half || a > ds + half) return; it.push({ t: 'rect', x: -dst, y: Y(Math.max(a, ds - half)), w: dst, h: Math.min(b, ds + half) - Math.max(a, ds - half), c: j === wi ? 'opn' : 'opn2' }); });
    it.push({ t: 'line', x1: -dst, y1: Y(ds - half), x2: -dst, y2: Y(ds + half), c: 'hz' });
    it.push({ t: 'line', x1: xL, y1: Y(ds), x2: Math.max(Px, A.x) + 0.3, y2: Y(ds), c: 'axis' });
    if (s0) {
      dsec.list.forEach((s, k) => it.push({ t: 'poly', pts: [[P.x, P.y], [-dst, Y(ds + s.ya)], [-dst, Y(ds + s.yb)]], c: s.type === 'sky' ? (k === sel ? 'skysel' : 'skyf') : (k === sel ? 'bldsel' : 'bldf') }));
      for (let k = 0; k <= 50; k++) [1, -1].forEach(sg => { if (k === 0 && sg < 0) return; const yy = sg * R * Math.tan(DAN.PSI(k)); if (Math.abs(yy) > half + 0.05) return; it.push({ t: 'line', x1: P.x, y1: P.y, x2: -dst - 0.25, y2: Y(ds + yy * (R + 0.25) / R), c: k % 10 === 0 ? 'gr10' : k % 5 === 0 ? 'gr5' : 'gr1' }); if (k % 5 === 0) it.push({ t: 'text', x: -dst - 0.3, y: Y(ds + yy * (R + 0.3) / R) - 0.05, s: String(k), c: 'grt', a: 'end' }); });
      [s0.ya, s0.yb].forEach(y => it.push({ t: 'line', x1: P.x, y1: P.y, x2: -dst, y2: Y(ds + y), c: 'lim' }));
      // истинные ограничивающие лучи из А (через рёбра откосов)
      [s0.ya, s0.yb].forEach(y => it.push({ t: 'line', x1: A.x, y1: Y(ds), x2: -dst, y2: Y(ds + y), c: 'rayb' }));
      it.push({ t: 'circle', x: P.x, y: P.y, r: 0.06, c: 'cpt' }); it.push({ t: 'text', x: P.x + 0.08, y: P.y - 0.3, s: 'P', c: 'txtb' });
      it.push({ t: 'dim', x1: -dst, y1: Y(ds - half) - 0.3, x2: Px, y2: Y(ds - half) - 0.3, s: 'R = ' + r2(R) });
    }
    it.push({ t: 'circle', x: A.x, y: Y(ds), r: 0.07, c: 'pt' }); it.push({ t: 'text', x: A.x + 0.1, y: Y(ds) + 0.1, s: 'А', c: 'txtb' });
    it.push({ t: 'text', x: xL + 0.05, y: Y(ds + half) + 0.25, s: 'План · график II (полюс P)', c: 'cap' });
    const xR = Math.max(raw.dp + 0.3, Px + 0.6);
    return { box: [xL - 0.2, Y(ds - half) - 0.75, xR, topZ + 0.3], it };
  }

  /* ---------- рендер в SVG ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function toSVG(sc, opt) {
    const [x0, y0, x1, y1] = sc.box, W = x1 - x0, H = y1 - y0;
    const s = 100; // px на метр (масштаб внутри viewBox)
    const X = x => (x - x0) * s, Y = y => (y1 - y) * s;
    const fsz = Math.max(30, W * s / 30), pr = Math.max(9, W * s * 0.006);
    let o = `<svg viewBox="0 0 ${W * s} ${H * s}" class="scheme" role="img" aria-label="${esc((opt && opt.label) || 'Схема')}" style="--fs:${fsz.toFixed(0)}px">`;
    o += '<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 2 L10 5 L0 8" fill="none" class="s-dimm"/></marker></defs>';
    sc.it.forEach(e => {
      if (e.t === 'line') o += `<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" class="s-${e.c}"/>`;
      else if (e.t === 'rect') o += `<rect x="${X(e.x)}" y="${Y(e.y + e.h)}" width="${e.w * s}" height="${e.h * s}" class="s-${e.c}"/>`;
      else if (e.t === 'circle') o += `<circle cx="${X(e.x)}" cy="${Y(e.y)}" r="${e.c === 'pt' ? Math.max(e.r * s, pr) : e.r * s}" class="s-${e.c}"/>`;
      else if (e.t === 'poly') o += `<polygon points="${e.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" class="s-${e.c}"/>`;
      else if (e.t === 'pline') o += `<polyline points="${e.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" class="s-${e.c}"/>`;
      else if (e.t === 'text') o += `<text x="${X(e.x)}" y="${Y(e.y)}" text-anchor="${e.a || 'start'}" class="s-${e.c}">${esc(e.s)}</text>`;
      else if (e.t === 'dim' || e.t === 'dimv') {
        o += `<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" class="s-dim" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
        if (e.t === 'dim') o += `<text x="${(X(e.x1) + X(e.x2)) / 2}" y="${Y(e.y1) - fsz * 0.25}" text-anchor="middle" class="s-dimt">${esc(e.s)}</text>`;
        else o += `<text transform="translate(${X(e.x1) + fsz * 0.9} ${(Y(e.y1) + Y(e.y2)) / 2}) rotate(-90)" text-anchor="middle" class="s-dimt">${esc(e.s)}</text>`;
      }
    });
    return o + '</svg>';
  }

  /* ---------- рендер в PDF ---------- */
  const PST = {
    wall: { fill: '#9aa5ad', stroke: '#2b3640', lw: 0.2 }, wallw: { fill: '#9aa5ad', stroke: '#2b3640', lw: 0.2 },
    glass: { stroke: '#1f6fb2', lw: 0.5 }, room: { stroke: '#1b2329', lw: 0.35 }, roomf: { fill: '#f4f6f7', stroke: '#1b2329', lw: 0.35 },
    ray: { stroke: '#c48a00', lw: 0.3, dash: [1.2, 0.8] }, rayb: { stroke: '#c48a00', lw: 0.2 }, skyf: { fill: '#fbefc9', stroke: '#c48a00', lw: 0.15 },
    bld: { fill: '#c9cfd4', stroke: '#2b3640', lw: 0.2 }, pt: { fill: '#b3261e', stroke: '#b3261e', lw: 0.2 },
    axis: { stroke: '#7a8691', lw: 0.2, dash: [2, 0.6, 0.4, 0.6] }, lan: { fill: '#e3eef8', stroke: '#1f6fb2', lw: 0.3 },
    dim: { stroke: '#4c5a66', lw: 0.15 }, opq: { stroke: '#2b3640', lw: 0.45 },
    skysel: { fill: '#f6d27a', stroke: '#c48a00', lw: 0.25 }, bldf: { fill: '#dfe3e6', stroke: '#6b7780', lw: 0.15 }, bldsel: { fill: '#b9c2c9', stroke: '#2b3640', lw: 0.25 },
    gr1: { stroke: '#9fb4c7', lw: 0.06 }, gr5: { stroke: '#6f8fae', lw: 0.12 }, gr10: { stroke: '#2d5d8b', lw: 0.2 }, lim: { stroke: '#b3261e', lw: 0.35 },
    arc: { stroke: '#2d5d8b', lw: 0.25, dash: [1, 0.6] }, cpt: { fill: '#2d5d8b', stroke: '#2d5d8b', lw: 0.2 }, edge: { fill: '#ffffff', stroke: '#b3261e', lw: 0.3 },
    opn: { fill: '#cfe3f5', stroke: '#1f6fb2', lw: 0.3 }, opn2: { fill: '#eef3f7', stroke: '#7a8691', lw: 0.15 }, hz: { stroke: '#2d5d8b', lw: 0.3 }
  };
  function toPDF(doc, sc, bx, by, bw, bh) {
    const [x0, y0, x1, y1] = sc.box, W = x1 - x0, H = y1 - y0;
    const k = Math.min(bw / W, bh / H); const ox = bx + (bw - W * k) / 2, oy = by + (bh - H * k) / 2;
    const X = x => ox + (x - x0) * k, Y = y => oy + (y1 - y) * k;
    const fs = 6.5;
    sc.it.forEach(e => {
      const st = PST[e.c] || { stroke: '#1b2329', lw: 0.2 };
      if (e.t === 'line') doc.line(X(e.x1), Y(e.y1), X(e.x2), Y(e.y2), { color: st.stroke, lw: st.lw, dash: st.dash });
      else if (e.t === 'rect') doc.rect(X(e.x), Y(e.y + e.h), e.w * k, e.h * k, { fill: st.fill, stroke: st.stroke, lw: st.lw });
      else if (e.t === 'circle') doc.circle(X(e.x), Y(e.y), Math.max(e.r * k, e.c === 'pt' ? 0.7 : (e.c === 'cpt' || e.c === 'edge') ? 0.5 : 0), { fill: st.fill, stroke: st.stroke, lw: st.lw });
      else if (e.t === 'poly') doc.poly(e.pts.map(p => [X(p[0]), Y(p[1])]), { fill: st.fill, stroke: st.stroke, lw: st.lw, close: true });
      else if (e.t === 'pline') doc.poly(e.pts.map(p => [X(p[0]), Y(p[1])]), { stroke: st.stroke, lw: st.lw, dash: st.dash, close: false });
      else if (e.t === 'text') doc.text(e.s, X(e.x), Y(e.y), { size: e.c === 'cap' ? 7 : e.c === 'grt' ? 5 : fs, font: e.c === 'txtb' || e.c === 'cap' ? 'B' : 'R', align: e.a === 'middle' ? 'center' : (e.a === 'end' ? 'right' : 'left'), color: '#1b2329' });
      else if (e.t === 'dim' || e.t === 'dimv') {
        doc.line(X(e.x1), Y(e.y1), X(e.x2), Y(e.y2), { color: '#4c5a66', lw: 0.15 });
        [[e.x1, e.y1], [e.x2, e.y2]].forEach(([x, y]) => doc.line(X(x) - 0.6, Y(y) + 0.6, X(x) + 0.6, Y(y) - 0.6, { color: '#4c5a66', lw: 0.25 }));
        if (e.t === 'dim') doc.text(e.s, (X(e.x1) + X(e.x2)) / 2, Y(e.y1) - 0.8, { size: fs, align: 'center', color: '#1b2329' });
        else doc.text(e.s, X(e.x1) + 2.4, (Y(e.y1) + Y(e.y2)) / 2 + doc.width(e.s, 'R', fs) / 2, { size: fs, rotate: 90, color: '#1b2329' });
      }
    });
  }
  return { sideSection, sidePlan, topPlan, topSection, b2Sect, b2Plan, toSVG, toPDF, DAN, danScheme };
})();
if (typeof module !== 'undefined') module.exports = Schemes;
