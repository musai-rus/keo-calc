/* Модель отчёта (общая для экрана и PDF) + рендер в PDF с рамкой и основной надписью. */
const Report = (function () {
  const f = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' : Number(x).toFixed(n).replace('.', ',');

  /* ---------- rich-текст: e_{р}^{б} ---------- */
  function parseRich(s) {
    const out = []; let i = 0; s = String(s);
    while (i < s.length) {
      const c = s[i];
      if ((c === '_' || c === '^') && s[i + 1] === '{') {
        const j = s.indexOf('}', i + 2); out.push({ t: s.slice(i + 2, j), k: c === '_' ? 'sub' : 'sup' }); i = j + 1; continue;
      }
      let j = i; while (j < s.length && !((s[j] === '_' || s[j] === '^') && s[j + 1] === '{')) j++;
      out.push({ t: s.slice(i, j), k: 'n' }); i = j;
    }
    return out;
  }
  function richHTML(s) {
    return parseRich(s).map(p => {
      const t = p.t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return p.k === 'sub' ? `<sub>${t}</sub>` : p.k === 'sup' ? `<sup>${t}</sup>` : t;
    }).join('');
  }
  function richWidth(doc, s, fk, size) { return parseRich(s).reduce((w, p) => w + doc.width(p.t, fk, p.k === 'n' ? size : size * 0.7), 0); }
  function richText(doc, s, x, y, o) {
    const size = o.size || 9, fk = o.font || 'R';
    let xx = x; if (o.align === 'center') xx = x - richWidth(doc, s, fk, size) / 2;
    parseRich(s).forEach(p => {
      const sz = p.k === 'n' ? size : size * 0.7, dy = p.k === 'sub' ? size * 0.09 : p.k === 'sup' ? -size * 0.14 : 0;
      xx += doc.text(p.t, xx, y + dy, { font: fk, size: sz, color: o.color });
    });
    return xx - x;
  }
  // перенос rich-строки: режем по пробелам, не разрывая {}
  function richWrap(doc, s, maxW, fk, size) {
    const tokens = []; let cur = ''; let depth = 0;
    for (const ch of String(s)) { if (ch === '{') depth++; if (ch === '}') depth--; cur += ch; if (ch === ' ' && depth === 0) { tokens.push(cur); cur = ''; } }
    if (cur) tokens.push(cur);
    const lines = []; let line = '';
    tokens.forEach(t => { if (line && richWidth(doc, (line + t).trimEnd(), fk, size) > maxW) { lines.push(line.trimEnd()); line = t; } else line += t; });
    if (line) lines.push(line.trimEnd());
    return lines;
  }

  /* ---------- PDF ---------- */
  const PAGE = { L: 20, R: 205, T: 5, B: 292, stampH: 15 };
  const C = { x: 25, w: 175, top: 11, bottom: PAGE.B - PAGE.stampH - 4 };
  const INK = '#111111', GREY = '#555555', FILL = '#eef1f3';

  function frame(doc, meta, sheet) {
    doc.rect(PAGE.L, PAGE.T, PAGE.R - PAGE.L, PAGE.B - PAGE.T, { lw: 0.5 });
    // основная надпись (форма 6 ГОСТ Р 21.101): 185×15
    const y0 = PAGE.B - PAGE.stampH, x0 = PAGE.L;
    doc.line(x0, y0, PAGE.R, y0, { lw: 0.5 });
    const cols = [7, 10, 10, 10, 15, 10]; let x = x0;
    const labels = ['Изм.', 'Кол.уч.', 'Лист', '№ док.', 'Подп.', 'Дата'];
    cols.forEach((w, i) => { x += w; doc.line(x, y0, x, PAGE.B, { lw: 0.5 }); doc.text(labels[i], x - w / 2, PAGE.B - 1.3, { size: 5.5, align: 'center' }); });
    for (let r = 1; r < 3; r++) doc.line(x0, y0 + r * 5, x0 + 62, y0 + r * 5, { lw: r === 2 ? 0.5 : 0.25 });
    const xl = PAGE.R - 10; doc.line(xl, y0, xl, PAGE.B, { lw: 0.5 }); doc.line(xl, y0 + 7, PAGE.R, y0 + 7, { lw: 0.25 });
    doc.text('Лист', xl + 5, y0 + 4.6, { size: 6, align: 'center' });
    doc.text(String(sheet), xl + 5, y0 + 12.6, { size: 9, align: 'center' });
    const cx = (x0 + 62 + xl) / 2;
    doc.text(meta.code || '', cx, y0 + 6.4, { size: 10, align: 'center', font: 'B' });
    doc.text(meta.stampTitle || '', cx, y0 + 12, { size: 7.5, align: 'center' });
    // дополнительные графы слева (форма 19)
    const sx = 8, sw = 12;
    [[PAGE.B - 25, 25, 'Инв. № подл.'], [PAGE.B - 60, 35, 'Подп. и дата'], [PAGE.B - 85, 25, 'Взам. инв. №']].forEach(([y, h, t]) => {
      doc.rect(sx, y, sw, h, { lw: 0.5 }); doc.line(sx + 5, y, sx + 5, y + h, { lw: 0.25 });
      doc.text(t, sx + 3.6, y + h / 2 + doc.width(t, 'R', 5.5) / 2, { size: 5.5, rotate: 90 });
    });
  }

  async function toPDF(model, meta) {
    const doc = new PDFWriter.Doc({ title: meta.docTitle || 'Расчёт КЕО' });
    let sheet = meta.sheetStart || 1, y = 0;
    const newPage = () => { doc.addPage(); frame(doc, meta, sheet++); y = C.top + 3; };
    const ensure = h => { if (y + h > C.bottom) newPage(); };
    newPage();
    const para = (txt, o = {}) => {
      const size = o.size || 8.5, fk = o.font || 'R', lh = size * 0.42;
      const lines = doc.wrap(txt, o.w || C.w, fk, size);
      lines.forEach(l => { ensure(lh); y += lh; doc.text(l, (o.x || C.x), y, { size, font: fk, color: o.color || INK }); });
      y += o.after !== undefined ? o.after : 1.2;
    };
    const table = (blk) => {
      const size = blk.size || 7.2, lh = size * 0.4, pad = 1.0;
      const totalW = blk.cols.reduce((s, c) => s + c.w, 0), k = C.w / totalW;
      const ws = blk.cols.map(c => c.w * k);
      const cellLines = (row, isHead) => row.map((cell, i) => {
        const txt = cell === null || cell === undefined ? '' : String(cell);
        return isHead ? doc.wrap(txt.replace(/_\{|\^\{|\}/g, ''), ws[i] - 2 * pad, 'B', size) : (txt.includes('_{') || txt.includes('^{') ? [txt] : doc.wrap(txt, ws[i] - 2 * pad, 'R', size));
      });
      const drawRow = (row, isHead, fill) => {
        const ls = cellLines(row, isHead); const n = Math.max(...ls.map(l => l.length));
        const h = n * lh + 2 * pad + 0.6;
        ensure(h);
        let x = C.x;
        row.forEach((cell, i) => {
          doc.rect(x, y, ws[i], h, { lw: 0.15, stroke: '#666666', fill: isHead ? FILL : (fill || null) });
          ls[i].forEach((l, li) => {
            const al = isHead ? 'center' : (blk.cols[i].a || 'left');
            const tx = al === 'center' ? x + ws[i] / 2 : al === 'right' ? x + ws[i] - pad : x + pad;
            const ty = y + pad + (li + 1) * lh - 0.1;
            if (!isHead && (l.includes('_{') || l.includes('^{'))) richText(doc, l, al === 'center' ? x + ws[i] / 2 : x + pad, ty, { size, align: al === 'center' ? 'center' : 'left' });
            else doc.text(l, tx, ty, { size, font: isHead ? 'B' : (blk.boldFirst && i === 0 ? 'B' : 'R'), align: al });
          });
          x += ws[i];
        });
        y += h;
      };
      if (blk.title) { ensure(12); para(blk.title, { font: 'I', size: 8, after: 0.6 }); }
      drawRow(blk.cols.map(c => c.h), true);
      blk.rows.forEach(r => {
        if (y + 6 > C.bottom) { newPage(); drawRow(blk.cols.map(c => c.h), true); }
        drawRow(Array.isArray(r) ? r : r.cells, false, Array.isArray(r) ? null : r.fill);
      });
      y += 2;
      if (blk.note) para(blk.note, { size: 7, color: GREY });
    };
    for (const b of model) {
      if (b.type === 'pagebreak') { newPage(); continue; }
      if (b.type === 'h1') { ensure(14); y += 5; doc.text(b.text, C.x + C.w / 2, y, { size: 13, font: 'B', align: 'center' }); y += 2; if (b.sub) { y += 4; doc.text(b.sub, C.x + C.w / 2, y, { size: 9, align: 'center', color: GREY }); } y += 4; continue; }
      if (b.type === 'h2') { ensure(16); y += 3.5; doc.text(b.text, C.x, y, { size: 10, font: 'B' }); y += 2.5; continue; }
      if (b.type === 'h3') { ensure(10); y += 2.5; doc.text(b.text, C.x, y, { size: 8.5, font: 'B' }); y += 1.6; continue; }
      if (b.type === 'p') { para(b.text, { size: b.small ? 7.2 : 8.5, color: b.small ? GREY : INK, font: b.italic ? 'I' : 'R' }); continue; }
      if (b.type === 'formula') {
        for (const ln of b.lines) {
          const parts = richWrap(doc, ln, C.w - 10, 'R', 9);
          parts.forEach((p, i) => { ensure(5.2); y += 4.6; richText(doc, (i ? '    ' : '') + p, C.x + 5, y, { size: 9 }); });
        }
        if (b.src) { y += 1.4; para(b.src, { size: 7, color: GREY, x: C.x + 5, w: C.w - 5 }); }
        y += 1.5; continue;
      }
      if (b.type === 'kv') { table({ cols: [{ h: 'Параметр', w: 52 }, { h: 'Обозн.', w: 14, a: 'center' }, { h: 'Значение', w: 26, a: 'center' }, { h: 'Источник / примечание', w: 60 }], rows: b.rows, title: b.title, size: 7.2 }); continue; }
      if (b.type === 'table') { table(b); continue; }
      if (b.type === 'scheme') {
        const h = b.h || 62; ensure(h + 8);
        const n = b.schemes.length, gap = 4, wts = b.weights || b.schemes.map(() => 1), tw = wts.reduce((a, v) => a + v, 0);
        let x = C.x;
        b.schemes.forEach((sc, i) => { const w = (C.w - gap * (n - 1)) * wts[i] / tw; doc.rect(x, y, w, h, { lw: 0.15, stroke: '#999999' }); Schemes.toPDF(doc, sc, x + 2, y + 2, w - 4, h - 4); x += w + gap; });
        y += h + 1.5;
        if (b.caption) para(b.caption, { size: 7.2, color: GREY });
        continue;
      }
      if (b.type === 'verdict') {
        ensure(24); y += 1;
        const ok = b.ok; const col = ok ? '#1e6b3c' : '#a3221b';
        doc.rect(C.x, y, C.w, 20, { lw: 0.6, stroke: col, fill: ok ? '#eef6f0' : '#fbeeee' });
        richText(doc, b.left, C.x + 5, y + 7.5, { size: 10, font: 'B' });
        richText(doc, b.left2 || '', C.x + 5, y + 14.5, { size: 9 });
        doc.text(ok ? 'СООТВЕТСТВУЕТ' : 'НЕ СООТВЕТСТВУЕТ', C.x + C.w - 5, y + 11.8, { size: 13, font: 'B', align: 'right', color: col });
        y += 23; continue;
      }
    }
    return doc.build();
  }
  return { parseRich, richHTML, toPDF, f };
})();
if (typeof module !== 'undefined') module.exports = Report;
