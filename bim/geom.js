/* КЕО по модели Autodesk Viewer — геометрия: срезы, растр помещений, проёмы, карта высот.
   Работает внутри страницы с уже загруженной моделью (NOP_VIEWER). Единицы — метры, координаты — мировые координаты Viewer × масштаб единиц. */
const BimGeom = (function () {
  const deg = r => r * 180 / Math.PI;

  function ctx(v) {
    const m = v.model, it = m.getInstanceTree(), fl = m.getFragmentList();
    return { v, m, it, fl, S: m.getUnitScale(), GZ: (m.getData().globalOffset || { z: 0 }).z };
  }

  // все листовые элементы с категорией, уровнем, типом
  async function catalog(C) {
    const ids = []; C.it.enumNodeChildren(C.it.getRootId(), id => { if (C.it.getChildCount(id) === 0) ids.push(id); }, true);
    const props = await new Promise((ok, bad) => C.m.getBulkProperties2(ids, { propFilter: ['Category', 'Type Name', 'Family Name'] }, ok, bad));
    const byCat = {}, info = {};
    props.forEach(r => { const g = n => (r.properties.find(p => p.attributeName === n) || {}).displayValue; const c = g('Category') || '—'; (byCat[c] = byCat[c] || []).push(r.dbId); info[r.dbId] = { c, type: g('Type Name') || '', fam: g('Family Name') || '', name: r.name }; });
    return { byCat, info };
  }

  // помещения из базы свойств (у них нет 3D-геометрии в экспорте viewer.autodesk.com)
  async function rooms(C) {
    return C.m.getPropertyDb().executeUserFunction(function (pdb) {
      const out = [];
      pdb.enumObjects(id => {
        const o = { id }; let isRoom = false;
        pdb.enumObjectProperties(id, (a, v) => {
          const n = pdb.getAttributeDef(a).name, val = pdb.getAttrValue(a, v);
          if (n === 'Category' && val === 'Revit Rooms') isRoom = true;
          if (n === 'Level' && isNaN(+val)) o.level = val; if (n === 'Name') o.name = val; if (n === 'Number') o.num = val;
          if (n === 'Area') o.area = +val; if (n === 'Perimeter') o.per = +val; if (n === 'Unbounded Height') o.h = +val;
          if (n === 'Department') o.dep = val; if (n === 'Occupancy') o.occ = val; if (n === 'Base Offset') o.off = +val;
        });
        if (isRoom && o.area > 0) out.push(o);
      });
      return out;
    });
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
  function raster(segs, cell) {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    segs.forEach(s => { minx = Math.min(minx, s[0], s[2]); maxx = Math.max(maxx, s[0], s[2]); miny = Math.min(miny, s[1], s[3]); maxy = Math.max(maxy, s[1], s[3]); });
    minx -= 2; miny -= 2; maxx += 2; maxy += 2;
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
      regs.push({ id, cells: cnt, area: cnt * cell * cell, border, cx: minx + (sx / cnt + 0.5) * cell, cy: miny + (sy / cnt + 0.5) * cell });
    }
    // граничные клетки → поправка площади на половину ширины линии растра
    const bnd = new Float64Array(regs.length);
    for (let p = 0; p < W * H; p++) { const id = lab[p]; if (!id) continue; const i = p % W; if ((i > 0 && lab[p - 1] !== id) || (i < W - 1 && lab[p + 1] !== id) || (p >= W && lab[p - W] !== id) || (p < W * (H - 1) && lab[p + W] !== id)) bnd[id]++; }
    regs.forEach(r => { if (r) { r.areaC = r.area + bnd[r.id] * cell * cell * 0.5; r.per = bnd[r.id] * cell; } });
    return { W, H, cell, minx, miny, lab, regs, ext: new Set() };
  }
  const labelAt = (R, x, y) => { const i = Math.floor((x - R.minx) / R.cell), j = Math.floor((y - R.miny) / R.cell); if (i < 0 || j < 0 || i >= R.W || j >= R.H) return 1; return R.lab[j * R.W + i]; };

  // сопоставление областей с помещениями уровня по площади (жадно, по возрастанию расхождения)
  function matchRooms(R, rooms) {
    const regs = R.regs.filter(r => r && !r.border && r.areaC >= 0.8);
    const pairs = [];
    rooms.forEach(rm => regs.forEach(rg => {
      const d = Math.abs(rg.areaC - rm.area) / rm.area; if (!(d < 0.06 || Math.abs(rg.areaC - rm.area) < 0.4)) return;
      // периметр отсекает узкие полости той же площади (зазоры за витражами, шахты)
      if (rm.per > 0) { const k = rg.per / (rm.per / 1000); if (k < 0.75 || k > 1.45) return; }
      pairs.push([d, rm, rg]);
    }));
    pairs.sort((a, b) => a[0] - b[0]);
    const byRoom = new Map();
    pairs.forEach(([d, rm, rg]) => { if (byRoom.has(rm.id) || rg.room) return; byRoom.set(rm.id, rg.id); rg.room = rm; rg.dA = d; rm.reg = rg.id; rm.dA = d; rm.areaModel = rg.areaC; });
    return byRoom;
  }

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

  // светопрозрачные элементы: только прозрачные фрагменты (стекло); геометрия в плане — по главным осям
  function openings(C, cat, excludeRe) {
    const out = [], mat4 = new THREE.Matrix4(), S = C.S;
    ['Revit Windows', 'Revit Curtain Panels', 'Revit Doors'].forEach(c => (cat.byCat[c] || []).forEach(id => {
      if (excludeRe && excludeRe.test(cat.info[id].type || '')) return;
      const P = [];
      C.it.enumNodeFragments(id, f => {
        const mt = C.fl.getMaterial(f); if (!(mt && (mt.transparent || mt.opacity < 0.95))) return;
        const g = C.fl.getGeometry(f); if (!g || !g.vb || g.isLines) return; C.fl.getWorldMatrix(f, mat4);
        const e = mat4.elements, st = g.vbstride, off = (g.attributes.position.offset ?? g.attributes.position.itemOffset) || 0, n = g.vb.length / st;
        for (let i = 0; i < n; i++) { const x = g.vb[i * st + off], y = g.vb[i * st + off + 1], z = g.vb[i * st + off + 2]; P.push([(e[0] * x + e[4] * y + e[8] * z + e[12]) * S, (e[1] * x + e[5] * y + e[9] * z + e[13]) * S, (e[2] * x + e[6] * y + e[10] * z + e[14]) * S]); }
      }, true);
      if (P.length < 3) return;
      let mx = 0, my = 0, z0 = 1e9, z1 = -1e9; P.forEach(p => { mx += p[0]; my += p[1]; z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }); mx /= P.length; my /= P.length;
      let sxx = 0, syy = 0, sxy = 0; P.forEach(p => { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), t = [Math.cos(ang), Math.sin(ang)], n = [-t[1], t[0]];
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      P.forEach(p => { const u = (p[0] - mx) * t[0] + (p[1] - my) * t[1], w = (p[0] - mx) * n[0] + (p[1] - my) * n[1]; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, w); b1 = Math.max(b1, w); });
      const w = a1 - a0, d = b1 - b0, h = z1 - z0;
      if (w < 0.15 && d < 0.15) return; // щели и торцы стекла
      out.push({ id, cat: c, type: cat.info[id].type, c: [mx + t[0] * (a0 + a1) / 2 + n[0] * (b0 + b1) / 2, my + t[1] * (a0 + a1) / 2 + n[1] * (b0 + b1) / 2], t, n, w, d, z0, z1, horiz: h < 0.3 && w > 0.3 && d > 0.3 });
    }));
    return out;
  }

  // привязка проёма к помещению: по нормали в обе стороны до первой значимой области
  function assign(R, ops, floor, top) {
    const okReg = id => R.ext.has(id) || (R.regs[id] && (R.regs[id].room || R.regs[id].areaC > 3));
    const side = (o, sg) => { for (let k = 0.01; k < 2.5; k += 0.02) { const id = labelAt(R, o.c[0] + sg * o.n[0] * k, o.c[1] + sg * o.n[1] * k); if (id > 0 && okReg(id)) return { id, k }; } return null; };
    const st = { level: 0, outer: 0, inner: 0, none: 0, noRoom: 0 };
    ops.forEach(o => {
      if (o.horiz || o.z0 < floor - 0.3 || o.z0 >= top - 0.05) return;
      st.level++;
      const A = side(o, 1), B = side(o, -1); if (!A || !B) { st.none++; return; }
      const ea = R.ext.has(A.id), eb = R.ext.has(B.id);
      if (ea === eb) { if (!ea) st.inner++; return; }
      const inn = ea ? B : A, out = ea ? A : B, sg = ea ? -1 : 1, rg = R.regs[inn.id];
      if (!rg.room) { st.noRoom++; return; }
      Object.assign(o, { room: rg.room, reg: inn.id, nin: [o.n[0] * sg, o.n[1] * sg], dIn: inn.k, dOut: out.k, dst: inn.k + out.k, floor });
      st.outer++;
    });
    return st;
  }

  // клетки областей (с прореживанием) и горизонтальные «полосы» для заливки
  function regionCells(R, regIds, step) {
    const want = new Set(regIds), pts = new Map(), runs = new Map();
    regIds.forEach(id => { pts.set(id, []); runs.set(id, []); });
    const { W, H, lab, cell, minx, miny } = R;
    for (let j = 0; j < H; j++) {
      let cur = 0, start = 0;
      for (let i = 0; i <= W; i++) {
        const id = i < W ? lab[j * W + i] : 0;
        if (id !== cur) { if (want.has(cur)) runs.get(cur).push([minx + start * cell, minx + i * cell, miny + j * cell, miny + (j + 1) * cell]); cur = id; start = i; }
        if (i < W && want.has(id) && i % step === 0 && j % step === 0) pts.get(id).push([minx + (i + 0.5) * cell, miny + (j + 0.5) * cell]);
      }
    }
    // сливаем полосы соседних строк с одинаковыми границами
    runs.forEach((rs, id) => {
      const m = []; rs.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
      rs.forEach(r => { const l = m[m.length - 1]; if (l && Math.abs(l[0] - r[0]) < 1e-6 && Math.abs(l[1] - r[1]) < 1e-6 && Math.abs(l[3] - r[2]) < 1e-6) l[3] = r[3]; else m.push(r.slice()); });
      runs.set(id, m);
    });
    return { pts, runs };
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

  return { ctx, catalog, rooms, eachGeom, slice, raster, labelAt, matchRooms, markExterior, openings, assign, regionCells, heightMap, overhang, skyline, deg };
})();
