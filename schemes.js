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
    dim: { stroke: '#4c5a66', lw: 0.15 }, opq: { stroke: '#2b3640', lw: 0.45 }
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
      else if (e.t === 'circle') doc.circle(X(e.x), Y(e.y), Math.max(e.r * k, e.c === 'pt' ? 0.7 : 0), { fill: st.fill, stroke: st.stroke, lw: st.lw });
      else if (e.t === 'poly') doc.poly(e.pts.map(p => [X(p[0]), Y(p[1])]), { fill: st.fill, stroke: st.stroke, lw: st.lw, close: true });
      else if (e.t === 'text') doc.text(e.s, X(e.x), Y(e.y), { size: e.c === 'cap' ? 7 : fs, font: e.c === 'txtb' || e.c === 'cap' ? 'B' : 'R', align: e.a === 'middle' ? 'center' : (e.a === 'end' ? 'right' : 'left'), color: '#1b2329' });
      else if (e.t === 'dim' || e.t === 'dimv') {
        doc.line(X(e.x1), Y(e.y1), X(e.x2), Y(e.y2), { color: '#4c5a66', lw: 0.15 });
        [[e.x1, e.y1], [e.x2, e.y2]].forEach(([x, y]) => doc.line(X(x) - 0.6, Y(y) + 0.6, X(x) + 0.6, Y(y) - 0.6, { color: '#4c5a66', lw: 0.25 }));
        if (e.t === 'dim') doc.text(e.s, (X(e.x1) + X(e.x2)) / 2, Y(e.y1) - 0.8, { size: fs, align: 'center', color: '#1b2329' });
        else doc.text(e.s, X(e.x1) + 2.4, (Y(e.y1) + Y(e.y2)) / 2 + doc.width(e.s, 'R', fs) / 2, { size: fs, rotate: 90, color: '#1b2329' });
      }
    });
  }
  return { sideSection, sidePlan, topPlan, topSection, b2Sect, b2Plan, toSVG, toPDF };
})();
if (typeof module !== 'undefined') module.exports = Schemes;
