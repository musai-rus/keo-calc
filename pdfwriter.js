/* Минимальный генератор PDF: шрифты TrueType (Identity-H), текст, линии, фигуры. Единицы API — мм, начало координат — левый верхний угол листа. */
const PDFWriter = (function () {
  const FONTS = (typeof PDF_FONTS !== 'undefined') ? PDF_FONTS : require('./fonts.js');
  const MM = 72 / 25.4;
  const f2 = v => (Math.round(v * 1000) / 1000).toString();

  function b64ToBytes(b64) {
    if (typeof atob === 'function') { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  function gidOf(font, ch) { const g = font.cmap[ch.codePointAt(0)]; return g === undefined ? (font.cmap[63] || 0) : g; }
  function width(text, fk, size) { // мм
    const f = FONTS[fk]; let w = 0;
    for (const ch of String(text)) w += f.w[gidOf(f, ch)] || 0;
    return w / 1000 * size / MM;
  }
  function color(c) { // '#rrggbb' -> 'r g b'
    if (!c) return '0 0 0';
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f2(v / 255)).join(' ');
  }

  function Doc(opts) {
    this.W = (opts && opts.w) || 210; this.H = (opts && opts.h) || 297;
    this.pages = []; this.used = { R: new Set(), B: new Set(), I: new Set() };
    this.title = (opts && opts.title) || '';
  }
  Doc.prototype.addPage = function () { const p = { ops: [] }; this.pages.push(p); this.cur = p; return p; };
  Doc.prototype._op = function (s) { this.cur.ops.push(s); };
  const X = x => f2(x * MM);
  Doc.prototype.Y = function (y) { return f2((this.H - y) * MM); };

  // текст: x,y — базовая линия (мм); align: left|center|right
  Doc.prototype.text = function (str, x, y, o) {
    o = o || {}; const fk = o.font || 'R', size = o.size || 10, f = FONTS[fk];
    str = String(str);
    let xx = x; const w = width(str, fk, size);
    if (o.align === 'center') xx = x - w / 2; else if (o.align === 'right') xx = x - w;
    let hex = '';
    for (const ch of str) { const g = gidOf(f, ch); this.used[fk].add(g + ':' + ch.codePointAt(0)); hex += g.toString(16).padStart(4, '0'); }
    let tm = `1 0 0 1 ${X(xx)} ${this.Y(y)} Tm`;
    if (o.rotate === 90) tm = `0 1 -1 0 ${X(xx)} ${this.Y(y)} Tm`;
    this._op(`BT ${color(o.color)} rg /F${fk} ${f2(size)} Tf ${tm} <${hex}> Tj ET`);
    return w;
  };
  Doc.prototype.width = function (str, fk, size) { return width(str, fk || 'R', size || 10); };
  // перенос строк по ширине (мм)
  Doc.prototype.wrap = function (str, maxW, fk, size) {
    const out = [];
    String(str).split('\n').forEach(par => {
      const words = par.split(/(\s+)/); let line = '';
      words.forEach(wd => {
        const t = line + wd;
        if (width(t.trimEnd(), fk, size) <= maxW || !line.trim()) line = t;
        else { out.push(line.trimEnd()); line = wd.trimStart(); }
        // слишком длинное слово — режем
        while (width(line, fk, size) > maxW && line.length > 1) {
          let k = line.length; while (k > 1 && width(line.slice(0, k), fk, size) > maxW) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      });
      out.push(line.trimEnd());
    });
    return out;
  };
  Doc.prototype.line = function (x1, y1, x2, y2, o) {
    o = o || {}; this._op(`q ${color(o.color)} RG ${f2((o.lw || 0.25) * MM)} w ${o.dash ? `[${o.dash.map(d => f2(d * MM)).join(' ')}] 0 d` : ''} ${X(x1)} ${this.Y(y1)} m ${X(x2)} ${this.Y(y2)} l S Q`);
  };
  Doc.prototype.poly = function (pts, o) {
    o = o || {}; if (pts.length < 2) return;
    let s = `q ${color(o.stroke || '#000000')} RG ${color(o.fill || '#ffffff')} rg ${f2((o.lw || 0.25) * MM)} w ${o.dash ? `[${o.dash.map(d => f2(d * MM)).join(' ')}] 0 d` : ''} ${X(pts[0][0])} ${this.Y(pts[0][1])} m`;
    for (let i = 1; i < pts.length; i++) s += ` ${X(pts[i][0])} ${this.Y(pts[i][1])} l`;
    if (o.close) s += ' h';
    s += o.fill && o.stroke !== 'none' ? ' B' : (o.fill ? ' f' : ' S');
    this._op(s + ' Q');
  };
  Doc.prototype.rect = function (x, y, w, h, o) {
    o = o || {}; const op = o.fill && o.stroke ? 'B' : (o.fill ? 'f' : 'S');
    this._op(`q ${color(o.stroke || '#000000')} RG ${color(o.fill || '#ffffff')} rg ${f2((o.lw || 0.25) * MM)} w ${X(x)} ${this.Y(y + h)} ${f2(w * MM)} ${f2(h * MM)} re ${op} Q`);
  };
  Doc.prototype.circle = function (cx, cy, r, o) {
    o = o || {}; const k = 0.5523 * r, p = [];
    const pt = (x, y) => `${X(x)} ${this.Y(y)}`;
    let s = `q ${color(o.stroke || '#000000')} RG ${color(o.fill || '#ffffff')} rg ${f2((o.lw || 0.25) * MM)} w ${o.dash ? `[${o.dash.map(d => f2(d * MM)).join(' ')}] 0 d` : ''} ${pt(cx + r, cy)} m `;
    s += `${pt(cx + r, cy + k)} ${pt(cx + k, cy + r)} ${pt(cx, cy + r)} c ${pt(cx - k, cy + r)} ${pt(cx - r, cy + k)} ${pt(cx - r, cy)} c `;
    s += `${pt(cx - r, cy - k)} ${pt(cx - k, cy - r)} ${pt(cx, cy - r)} c ${pt(cx + k, cy - r)} ${pt(cx + r, cy - k)} ${pt(cx + r, cy)} c h `;
    s += o.fill && o.stroke !== 'none' ? 'B' : (o.fill ? 'f' : 'S');
    this._op(s + ' Q');
  };

  // сборка файла
  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') {
      if (typeof require !== 'undefined') { try { return new Uint8Array(require('zlib').deflateSync(bytes)); } catch (e) { return null; } }
      return null;
    }
    const cs = new CompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const enc = s => new TextEncoder().encode(s);

  Doc.prototype.build = async function () {
    const objs = []; // {id, parts:[Uint8Array|string]}
    let nextId = 1; const alloc = () => nextId++;
    const catalogId = alloc(), pagesId = alloc(), infoId = alloc();
    const put = (id, dict, streamBytes) => objs.push({ id, dict, stream: streamBytes });
    const fontIds = {};
    for (const fk of ['R', 'B', 'I']) {
      if (!this.used[fk].size) continue;
      const f = FONTS[fk];
      const t0 = alloc(), cid = alloc(), desc = alloc(), ff = alloc(), tu = alloc();
      fontIds[fk] = t0;
      const ttf = b64ToBytes(f.b64); const z = await deflate(ttf);
      put(ff, `<< /Length ${(z || ttf).length} /Length1 ${ttf.length}${z ? ' /Filter /FlateDecode' : ''} >>`, z || ttf);
      put(desc, `<< /Type /FontDescriptor /FontName /${f.name} /Flags ${f.flags} /FontBBox [${f.bbox.join(' ')}] /ItalicAngle ${f.italic} /Ascent ${f.asc} /Descent ${f.desc} /CapHeight ${f.cap} /StemV 80 /FontFile2 ${ff} 0 R >>`);
      const gids = [...this.used[fk]].map(s => s.split(':').map(Number));
      const uniq = new Map(); gids.forEach(([g, u]) => { if (!uniq.has(g)) uniq.set(g, u); });
      const sorted = [...uniq.keys()].sort((a, b) => a - b);
      const W = sorted.map(g => `${g} [${f.w[g] || 0}]`).join(' ');
      put(cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${f.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /W [${W}] /DW 500 /CIDToGIDMap /Identity >>`);
      let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
      const entries = sorted.map(g => {
        const u = uniq.get(g); const hex = u > 0xffff ? (() => { const s = String.fromCodePoint(u); return [...Array(s.length)].map((_, i) => s.charCodeAt(i).toString(16).padStart(4, '0')).join(''); })() : u.toString(16).padStart(4, '0');
        return `<${g.toString(16).padStart(4, '0')}> <${hex}>`;
      });
      for (let i = 0; i < entries.length; i += 100) { const ch = entries.slice(i, i + 100); cmap += `${ch.length} beginbfchar\n${ch.join('\n')}\nendbfchar\n`; }
      cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
      const cb = enc(cmap);
      put(tu, `<< /Length ${cb.length} >>`, cb);
      put(t0, `<< /Type /Font /Subtype /Type0 /BaseFont /${f.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    }
    const fontRes = Object.entries(fontIds).map(([k, id]) => `/F${k} ${id} 0 R`).join(' ');
    const pageIds = [];
    for (const p of this.pages) {
      const pid = alloc(), cidc = alloc(); pageIds.push(pid);
      const raw = enc(p.ops.join('\n')); const z = await deflate(raw);
      put(cidc, `<< /Length ${(z || raw).length}${z ? ' /Filter /FlateDecode' : ''} >>`, z || raw);
      put(pid, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(this.W * MM)} ${f2(this.H * MM)}] /Resources << /Font << ${fontRes} >> >> /Contents ${cidc} 0 R >>`);
    }
    put(pagesId, `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
    put(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const utf16 = s => { let h = 'FEFF'; for (const ch of s) { const c = ch.codePointAt(0); if (c > 0xffff) { const t = String.fromCodePoint(c); h += t.charCodeAt(0).toString(16).padStart(4, '0') + t.charCodeAt(1).toString(16).padStart(4, '0'); } else h += c.toString(16).padStart(4, '0'); } return `<${h.toUpperCase()}>`; };
    put(infoId, `<< /Title ${utf16(this.title)} /Producer ${utf16('Калькулятор КЕО (СП 367.1325800.2025)')} >>`);
    // сериализация
    objs.sort((a, b) => a.id - b.id);
    const chunks = []; let len = 0; const offs = [];
    const push = b => { chunks.push(b); len += b.length; };
    push(enc('%PDF-1.7\n%âãÏÓ\n'));
    for (const o of objs) {
      offs[o.id] = len;
      push(enc(`${o.id} 0 obj\n${o.dict}\n`));
      if (o.stream) { push(enc('stream\n')); push(o.stream); push(enc('\nendstream\n')); }
      push(enc('endobj\n'));
    }
    const xref = len; const n = nextId;
    let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
    for (let i = 1; i < n; i++) x += String(offs[i] || 0).padStart(10, '0') + ' 00000 n \n';
    x += `trailer\n<< /Size ${n} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    push(enc(x));
    const out = new Uint8Array(len); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  };
  return { Doc, width };
})();
if (typeof module !== 'undefined') module.exports = PDFWriter;
