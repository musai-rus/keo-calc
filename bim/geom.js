/* КЕО по модели Autodesk Viewer — геометрия: срезы, растр помещений, проёмы, карта высот.
   Работает внутри страницы с уже загруженной моделью (NOP_VIEWER). Единицы — метры, координаты — мировые координаты Viewer × масштаб единиц. */
const BimGeom = (function () {
  const deg = r => r * 180 / Math.PI;

  function ctx(v) {
    const m = v.model, it = m.getInstanceTree(), fl = m.getFragmentList();
    return { v, m, it, fl, S: m.getUnitScale(), GZ: (m.getData().globalOffset || { z: 0 }).z };
  }
  // Observe the original intersection once; never issue a diagnostic ray.
  function rayIntersect(C, ray, ignoreTransparent, kind) {
    let hit;
    try { hit = C.v.impl.rayIntersect(ray, ignoreTransparent); }
    catch(e) { try { C.diagnostics?.recordRay(kind,ray,ignoreTransparent,null,e); } catch(_) {} throw e; }
    try { C.diagnostics?.recordRay(kind, ray, ignoreTransparent, hit); } catch (_) { /* evidence must not affect the ray */ }
    return hit;
  }

  // Viewer.getCutPlanes() is an aggregate, while setCutPlanes() writes only one
  // named set. Preserve the sets separately or restoration duplicates clipping.
  function cutState(v) {
    const impl=v.impl || {}, names=['getCutPlaneSets','getCutPlaneSet','setCutPlaneSet'];
    const present=names.filter(k=>typeof impl[k]==='function').length;
    const fail=()=>{throw new Error('Viewer не предоставляет проверяемое управление наборами сечений. Отключите сечение штатными средствами Viewer.');};
    const planes=value=>{
      if(value===null || value===undefined)return [];
      if(!Array.isArray(value) || value.some(p=>!p || !['x','y','z','w'].every(k=>Number.isFinite(p[k]))))fail();
      return value.map(p=>p.clone ? p.clone() : {...p});
    };
    const same=(a,b)=>a.length===b.length && a.every((p,i)=>['x','y','z','w'].every(k=>Math.abs(p[k]-b[i][k])<=1e-9));
    const bag=(a,b)=>{const rest=b.slice();return a.length===b.length && a.every(p=>{const i=rest.findIndex(q=>same([p],[q]));if(i<0)return false;rest.splice(i,1);return true;});};
    const aggregate=()=>planes(typeof impl.getAllCutPlanes==='function'?impl.getAllCutPlanes():v.getCutPlanes());
    if(typeof v.getCutPlanes!=='function' || present && present!==names.length)fail();
    let read,apply,equal,flatten;
    if(present){
      const keys=()=>{const ks=impl.getCutPlaneSets();if(!Array.isArray(ks)||ks.some(k=>typeof k!=='string'||!k)||new Set(ks).size!==ks.length)fail();return ks;};
      read=()=>new Map(keys().map(k=>[k,planes(impl.getCutPlaneSet(k))]).filter(([,p])=>p.length));
      apply=state=>{
        let current,error;
        try {current=read();} catch(e) {error=e;}
        // Restore every accessible saved owner even if enumeration or another
        // owner fails. Do not touch an unchanged owner that may be read-only.
        for(const k of new Set([...(current?.keys()||[]),...state.keys()])){
          const wanted=state.get(k)||[];
          if(current && same(current.get(k)||[],wanted))continue;
          try {impl.setCutPlaneSet(k,wanted.length?planes(wanted):undefined);} catch(e) {error ||= e;}
        }
        if(error)throw error;
      };
      equal=(a,b)=>a.size===b.size && [...a].every(([k,p])=>b.has(k)&&same(p,b.get(k)));
      flatten=state=>[...state.values()].flat();
    } else {
      if(typeof v.setCutPlanes!=='function')fail();
      read=()=>planes(v.getCutPlanes());apply=state=>v.setCutPlanes(planes(state));equal=same;flatten=state=>state;
    }
    const saved=read(),empty=present?new Map():[];
    const matches=state=>equal(read(),state)&&bag(aggregate(),flatten(state))&&bag(planes(v.getCutPlanes()),flatten(state));
    if(!matches(saved))fail(); // Unaccounted clipping cannot be safely restored.
    const restoreError=()=>new Error('Не удалось восстановить исходное сечение Viewer. Результат отменён; восстановите вид вручную.');
    return {
      clear(){apply(empty);if(!matches(empty))throw new Error('Не удалось снять все сечения Viewer. Отключите сечение и повторите расчёт.');},
      assertClear(){if(!matches(empty))throw new Error('Сечение Viewer изменилось во время расчёта. Результат отменён.');},
      restore(){
        try {if(matches(saved))return;} catch(_) {}
        try {apply(saved);} catch(_) {} // Verify the final state after best-effort recovery.
        try {if(matches(saved))return;} catch(_) {}
        throw restoreError();
      }
    };
  }
  function clearSections(v) {
    const cuts=cutState(v);
    try { cuts.clear(); } catch(e) { cuts.restore();throw e; }
  }

  // Every ray-based stage must see the whole model. Temporary clipping changes
  // do not change model identity/placement; those are checked by the binding.
  const fullModelScopes=new WeakMap();
  function withFullModel(v, work) {
    // Ray intersection follows Viewer visibility, including isolation. Do not
    // mutate that state without a verified restoration contract.
    if (!v.areAllVisible && !(v.getAggregateHiddenNodes && v.getAggregateIsolation) && !(v.getHiddenNodes && v.getIsolatedNodes)) throw new Error('Viewer не предоставляет проверку видимости всей модели. Расчёт остановлен.');
    const hasIds = list => {
      if (!Array.isArray(list) || list.some(x => typeof x !== 'number' && (!x || (!Array.isArray(x.ids) && !Array.isArray(x.nodeIds))))) throw new Error('Viewer вернул неизвестный формат видимости. Расчёт остановлен.');
      return list.some(x => typeof x === 'number' || (x.ids && x.ids.length) || (x.nodeIds && x.nodeIds.length));
    };
    const hidden = v.getAggregateHiddenNodes ? v.getAggregateHiddenNodes() : v.getHiddenNodes ? v.getHiddenNodes() : [];
    const isolated = v.getAggregateIsolation ? v.getAggregateIsolation() : v.getIsolatedNodes ? v.getIsolatedNodes() : [];
    if (hasIds(hidden) || hasIds(isolated) || (v.areAllVisible && v.areAllVisible() !== true)) throw new Error('Часть модели скрыта или изолирована. Покажите всю модель и повторите расчёт.');
    let scope=fullModelScopes.get(v);
    if(scope)scope.cuts.assertClear();
    else {
      const cuts=cutState(v);
      try {cuts.clear();} catch(e) {cuts.restore();throw e;}
      scope={cuts,count:0};fullModelScopes.set(v,scope);
    }
    scope.count++;let released=false,result;
    const release=()=>{
      if(released)return;released=true;
      if(--scope.count===0){fullModelScopes.delete(v);scope.cuts.restore();}
    };
    try {
      result=work();
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(release);
    } catch (e) {release();throw e;}
    release();return result;
  }

  // элементы с категорией, уровнем, типом: листовые узлы и узлы со своей геометрией.
  // Имя — из дерева модели (getBulkProperties2 имени не возвращает: без этого имя семейства, напр. «Skywindow», не проверялось).
  // Экземпляр семейства с вложенным семейством (фонарь A_GMO_Skywindow_Angle: категория «Окна», внутри — обобщённая модель-обрамление)
  // не листовой, но сам несёт стекло — раньше он пропускался.
  async function catalog(C) {
    const ids = []; C.it.enumNodeChildren(C.it.getRootId(), id => { if (C.it.getChildCount(id) === 0) { ids.push(id); return; } let own = 0; C.it.enumNodeFragments(id, () => { own++; }, false); if (own) ids.push(id); }, true);
    const props = await new Promise((ok, bad) => C.m.getBulkProperties2(ids, { propFilter: ['Category', 'Категория', 'CategoryId', 'BuiltInCategory', 'Type Name', 'Family Name'], ignoreHidden: false }, ok, bad));
    const byCat = {}, info = {}, diagnostics={sources:{},unknown:0,unknownExamples:[]};
    props.forEach(r => {
      const g = n => (r.properties.find(p => p.attributeName === n) || {}).displayValue;
      const category=BimCategories.resolve(r.properties),raw=g('Category')||g('Категория')||'—';
      const c=category.canonical || 'Unknown category: '+raw;
      diagnostics.sources[category.source]=(diagnostics.sources[category.source]||0)+1;
      if(!category.canonical){diagnostics.unknown++;if(diagnostics.unknownExamples.length<5)diagnostics.unknownExamples.push({id:r.dbId,category});}
      (byCat[c] = byCat[c] || []).push(r.dbId);
      info[r.dbId] = { c, rawCategory:raw, category, type:g('Type Name')||'', fam:g('Family Name')||'', name:r.name||C.it.getNodeName(r.dbId)||'' };
    });
    return { byCat, info, diagnostics };
  }

  // помещения из базы свойств (у них нет 3D-геометрии в экспорте viewer.autodesk.com); единицы — по dataTypeContext свойства
  async function rooms(C) {
    const extracted = await C.m.getPropertyDb().executeUserFunction(BimCategories.workerSource(),BimCategories.config());
    const raw=extracted.records;
    const result=raw.map(o => {
      const A = BimSpaces.conv(...(o.u['Area'] || []), 'area'), P = BimSpaces.conv(...(o.u['Perimeter'] || []), 'len'), H = BimSpaces.conv(...(o.u['Unbounded Height'] || []), 'len');
      const warn = [A.ok ? null : 'площадь: ' + A.warn, P.ok ? null : 'периметр: ' + P.warn, o.levelWarning].filter(Boolean);
      return { id: o.id, key: o.eid || ('db' + o.id), eid: o.eid, level: o.level, name: o.name || '', num: o.num || '', dep: o.dep, occ: o.occ,
        area: A.v, areaRaw: o.u['Area'] && o.u['Area'][0], areaUnit: A.unit, areaSrc: A.ok ? 'Revit, свойство Area' : null,
        per: P.v, h: H.v, category:o.category, warn };
    });
    Object.defineProperty(result,'diagnostics',{value:extracted.diagnostics,enumerable:false});
    return result;
  }

  // Location properties have no bearing on north or climate coefficients until
  // confirmed by the user. Preserve labels/sources; do not geocode zero/zero.
  async function location(C) {
    return C.m.getPropertyDb().executeUserFunction(function (pdb) {
      const out = [];
      pdb.enumObjects(id => {
        const values = []; let category = '';
        pdb.enumObjectProperties(id, (a, v) => {
          const d = pdb.getAttributeDef(a), n = d.name, value = pdb.getAttrValue(a, v);
          if (n === 'Category') category = String(value);
          if (/^(Project Address|Address|AECplaceName|Latitude|Longitude)$/i.test(n) && value !== null && value !== '')
            values.push({ name: n, value: String(value), unit: d.dataTypeContext || '' });
        });
        if (/Project Information|Project Base Point|Survey Point/i.test(category))
          values.forEach(p => out.push({ ...p, source: category, id }));
      });
      return out;
    });
  }

  // Viewer может хранить упакованные позиции внутри Float32Array: vbstride не означает xyz Float32.
  // Декодирование доверяем Viewer; запасной путь — только явно обычные Float32 позиции.
  function positionReader(g, e, S = 1, withPrecision=false) {
    const pos = g.attributes && g.attributes.position;
    const ve = typeof Autodesk !== 'undefined' && Autodesk.Viewing && Autodesk.Viewing.Private && Autodesk.Viewing.Private.VertexEnumerator;
    let read;
    if (ve && ve.makeReadPositionFunc) read = ve.makeReadPositionFunc(g);
    else {
      if (!pos || (pos.bytesPerItem && pos.bytesPerItem !== 4) || pos.normalized || (pos.itemSize && pos.itemSize !== 3))
        throw new Error('КЕО: формат координат требует декодера Autodesk Viewer. Перезагрузите модель.');
      const vb = g.vb || pos.array, st = g.vb ? g.vbstride : pos.itemSize, off = g.vb ? (pos.offset ?? pos.itemOffset ?? 0) : 0;
      read = (i, p) => { p.x = vb[i * st + off]; p.y = vb[i * st + off + 1]; p.z = vb[i * st + off + 2]; };
    }
    const p = new THREE.Vector3(),cache=withPrecision?new Map():null;
    return i => {
      if(cache?.has(i))return cache.get(i);
      read(i, p);
      const q = [(e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) * S, (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) * S, (e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14]) * S];
      if (!q.every(Number.isFinite)) throw new Error('КЕО: некорректные координаты геометрии Viewer. Расчёт остановлен.');
      if(withPrecision&&typeof BimPrecision!=='undefined') Object.defineProperty(q,'precision',{value:BimPrecision.vertex(g,e,i,[p.x,p.y,p.z])});
      if(cache)cache.set(i,q);
      return q;
    };
  }

  // перебор треугольников / линий элемента в мировых координатах (единицы модели)
  function eachGeom(C, dbId, onTri, onLine, fragFilter, withPrecision=false) {
    const mat = new THREE.Matrix4();
    C.it.enumNodeFragments(dbId, f => {
      if (fragFilter && !fragFilter(f)) return;
      const g = C.fl.getGeometry(f); if (!g || !g.vb) return; C.fl.getWorldMatrix(f, mat); const e = mat.elements;
      const P = positionReader(g, e, 1, withPrecision);
      const ib = g.ib || (g.index && g.index.array);
      if (g.isLines) { if (!onLine) return; if (ib) for (let i = 0; i + 1 < ib.length; i += 2) onLine(P(ib[i]), P(ib[i + 1]), {fragment:f,dbId}); return; }
      if (!onTri || !ib) return;
      for (let i = 0; i + 2 < ib.length; i += 3) onTri(P(ib[i]), P(ib[i + 1]), P(ib[i + 2]), {fragment:f,dbId});
    }, true);
  }

  // горизонтальный срез на отметке zM (м) → отрезки [x1,y1,x2,y2] в метрах
  function slice(C, cat, cats, zM, lineZ) {
    const S = C.S, z = zM / S, segs = [], entries=[], reasons=new Set(['exporter-accuracy-unknown']);
    cats.forEach(c => (cat.byCat[c] || []).forEach(id => eachGeom(C, id, (a, b, cc, meta) => {
      const p = [a, b, cc], d = p.map(q => q[2] - z), pts = [], bounds=[];
      for (let i = 0; i < 3; i++) { const j = (i + 1) % 3;
        if(typeof BimPrecision!=='undefined'){
          const q=p[i].precision?.bounds?.[2],zz=BimPrecision.div([zM,zM],[S,S]);
          if(!q||!zz||q[0]<=zz[1]&&q[1]>=zz[0])reasons.add('slice-topology-uncertain');
        }
        if ((d[i] > 0) !== (d[j] > 0)) {
          const t = d[i] / (d[i] - d[j]); pts.push([(p[i][0] + t * (p[j][0] - p[i][0])) * S, (p[i][1] + t * (p[j][1] - p[i][1])) * S]);
          const bound=typeof BimPrecision!=='undefined'?BimPrecision.intersection(p[i].precision,p[j].precision,zM,S):{bounds:null,reason:'precision-module-unavailable'};
          bounds.push(bound.bounds);if(bound.reason)reasons.add(bound.reason);
        }
      }
      if (pts.length === 2) {segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);entries.push({bounds:bounds.every(Boolean)?bounds.flat():null,provenance:{...meta,category:c,zM,unitScale:S,vertices:p.map(q=>q.precision?.provenance||{decoder:'unknown'}),operation:'triangle-plane interval intersection',reconstruction:'unknown'}});}
    }, lineZ ? (a, b, meta) => { const z0 = lineZ[0] / S, tol = lineZ[1] / S; if (Math.abs(a[2] - z0) < tol && Math.abs(b[2] - z0) < tol) {segs.push([a[0] * S, a[1] * S, b[0] * S, b[1] * S]);entries.push({bounds:null,provenance:{...meta,category:c,zM,unitScale:S,reason:'line-selection-precision-unknown'}});} } : null, undefined, true)));
    Object.defineProperty(segs,'precision',{value:{v:1,reference:'source-model',reconstruction:'unknown',complete:!reasons.has('slice-topology-uncertain'),entries,reasons:[...reasons].sort()}});
    return segs;
  }

  // растр среза и разметка связных свободных областей
  function bounds(segs) {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    segs.forEach(s => { minx = Math.min(minx, s[0], s[2]); maxx = Math.max(maxx, s[0], s[2]); miny = Math.min(miny, s[1], s[3]); maxy = Math.max(maxy, s[1], s[3]); });
    return [minx - 2, miny - 2, maxx + 2, maxy + 2];
  }
  function paintSegments(segs, cell, minx, miny, put) {
    segs.forEach(s => {
      const x0 = (s[0] - minx) / cell, y0 = (s[1] - miny) / cell, x1 = (s[2] - minx) / cell, y1 = (s[3] - miny) / cell;
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
      for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + t * (x1 - x0), y = y0 + t * (y1 - y0), i = Math.floor(x), j = Math.floor(y); put(i, j); put(Math.floor(x + 0.3), j); put(i, Math.floor(y + 0.3)); }
    });
  }
  // bx — общие границы, чтобы растры R и Rp совпадали поклеточно
  function raster(segs, cell, bx) {
    const [minx, miny, maxx, maxy] = bx || bounds(segs);
    const W = Math.ceil((maxx - minx) / cell), H = Math.ceil((maxy - miny) / cell);
    const occ = new Uint8Array(W * H);
    paintSegments(segs, cell, minx, miny, (i,j) => { if (i >= 0 && j >= 0 && i < W && j < H) occ[j * W + i] = 1; });
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
      const hit = rayIntersect(C, new THREE.Ray(new THREE.Vector3(r.cx / S, r.cy / S, zM / S), new THREE.Vector3(0, 0, 1)), false, 'exterior');
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
      const P = [], Pa = [], sourceFragments = []; let A = 0, NZ = 0, Aa = 0, NZa = 0, up = 0;
      C.it.enumNodeFragments(id, f => {
        const mt = C.fl.getMaterial(f), glass = !!(mt && (mt.transparent || mt.opacity < 0.95));
        const g = C.fl.getGeometry(f);
        if (C.diagnostics?.enabled) sourceFragments.push({fragment:f,glass,geometryAvailable:!!(g && g.vb && g.vb.length),isLines:!!g?.isLines});
        if (!g || !g.vb || !g.vb.length || g.isLines) return; C.fl.getWorldMatrix(f, mat4);
        const n = g.vb.length / g.vbstride, Q = [], read = positionReader(g, mat4.elements, S);
        for (let i = 0; i < n; i++) Q.push(read(i));
        const ib = g.ib || (g.index && g.index.array);
        if (ib) for (let i = 0; i + 2 < ib.length; i += 3) { const a = Q[ib[i]], b = Q[ib[i + 1]], cc = Q[ib[i + 2]]; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, ar = Math.hypot(nx, ny, nz) / 2; Aa += ar; NZa += Math.abs(nz) / 2; if (glass) { A += ar; NZ += Math.abs(nz) / 2; if (nz > 0) up += nz / 2; } }
        Q.forEach(q => Pa.push(q)); if (glass) Q.forEach(q => P.push(q));
      }, true);
      const source = C.diagnostics?.enabled ? {dbId:id,category:c,fragments:sourceFragments,geometryCompleteness:'not verified',glassSelection:'Viewer material.transparent or opacity < 0.95'} : null;
      const emit = record => { if (source) Object.defineProperty(record,'source',{value:source}); out.push(record); };
      if (!Pa.length) { if (named) diag.push({id, cat:c, label, named, reason:'геометрия элемента отсутствует — фонарь не учтён'}); return; }
      const box = pts => {
        // Minimum-area rectangle of the XY convex hull: independent of triangle
        // duplication, vertex order and unequal tessellation density.
        const q = [...new Map(pts.map(p => [p[0] + ':' + p[1], p])).values()].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
        const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        const half = list => { const h=[]; list.forEach(p => { while(h.length>1 && cross(h[h.length-2],h[h.length-1],p)<=0) h.pop(); h.push(p); }); return h; };
        const lo=half(q), hi=half(q.slice().reverse()), hull=lo.slice(0,-1).concat(hi.slice(0,-1));
        let best=null;
        for(let i=0;i<Math.max(1,hull.length);i++) {
          const a=hull[i]||q[0], b=hull[(i+1)%hull.length]||a;
          let angle=Math.atan2(b[1]-a[1],b[0]-a[0]); angle=((angle % Math.PI)+Math.PI)%Math.PI;
          const t=[Math.cos(angle),Math.sin(angle)], n=[-t[1],t[0]];
          let a0=Infinity,a1=-Infinity,b0=Infinity,b1=-Infinity;
          q.forEach(p=>{const u=p[0]*t[0]+p[1]*t[1],v=p[0]*n[0]+p[1]*n[1];a0=Math.min(a0,u);a1=Math.max(a1,u);b0=Math.min(b0,v);b1=Math.max(b1,v);});
          const w=a1-a0,d=b1-b0,area=w*d;
          if(!best || area<best.area-1e-9 || Math.abs(area-best.area)<=1e-9 && (w>best.w+1e-9 || Math.abs(w-best.w)<=1e-9 && angle<best.angle)) best={t,n,w,d,area,angle,c:[t[0]*(a0+a1)/2+n[0]*(b0+b1)/2,t[1]*(a0+a1)/2+n[1]*(b0+b1)/2]};
        }
        let z0=Infinity,z1=-Infinity;pts.forEach(p=>{z0=Math.min(z0,p[2]);z1=Math.max(z1,p[2]);});
        return {...best,hull,h:z1-z0,z0,z1};
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
        if (glassOk) {
          const rim = bb.hull;
          const rr = rim.map(p => Math.hypot(p[0] - bb.c[0], p[1] - bb.c[1])), radius = Math.max(...rr);
          const angles = [...new Set(rim.map(p => Math.round(Math.atan2(p[1] - bb.c[1], p[0] - bb.c[0]) * 1e6) / 1e6))].sort((a, b) => a - b);
          const gaps = angles.map((a, i) => (i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - a);
          // Equal corner radii alone also describe every rectangle. Require a
          // distributed polygonal perimeter, not repeated triangle vertices.
          if (radius > 0.1 && Math.min(bb.w, bb.d) / Math.max(bb.w, bb.d) > 0.9 && angles.length >= 8 && Math.max(...gaps) <= Math.PI / 2 &&
              rim.every(p => Math.abs(Math.hypot(p[0] - bb.c[0], p[1] - bb.c[1]) - radius) / radius < 0.05)) { rec.round = true; rec.d = 2 * radius; }
        }
        emit(rec); diag.push(rec); return;
      }
      if (!glassOk) { if (named) diag.push({ id, cat: c, label, named, reason: 'нет прозрачных фрагментов (стекло не выделено материалом) и геометрия не обращена вверх' }); return; }
      const bb = box(P);
      if (c === 'Revit Roofs' || c === 'Revit Generic Models') { if (flat < 0.3 && bb.w >= 0.3 && bb.h >= 0.3) emit({ id, cat: c, type: inf.type, c: bb.c, t: bb.t, n: bb.n, w: bb.w, d: bb.d, z0: bb.z0, z1: bb.z1 }); else if (named) diag.push({ id, cat: c, label, reason: `наклон стекла ${Math.round(Math.acos(Math.min(1, flat)) * 180 / Math.PI)}° — ни фонарь (≤ 60°), ни вертикальный проём` }); return; }
      if (bb.w < 0.15 && bb.d < 0.15) return; // щели и торцы стекла
      emit({ id, cat: c, type: inf.type, c: bb.c, t: bb.t, n: bb.n, w: bb.w, d: bb.d, z0: bb.z0, z1: bb.z1 });
      if (named) diag.push({ id, cat: c, label, reason: `стекло вертикальное (наклон ${Math.round(Math.acos(Math.min(1, flat)) * 180 / Math.PI)}°) — учтено как окно` });
    }));
    out.diag = diag;
    return out;
  }

  // двери без остекления считаются закрытыми: контур габарита двери в плане добавляется в физический растр Rp,
  // чтобы открытая (повёрнутая) створка не соединяла помещения в один объём
  function doorBoxes(C, cat, zM) {
    const S = C.S, segs = [], entries = [], box = new THREE.Box3(), fb = new THREE.Box3();
    (cat.byCat['Revit Doors'] || []).forEach(id => {
      box.makeEmpty(); let glass = false; const fragments=[];
      C.it.enumNodeFragments(id, f => { fragments.push(f); const mt = C.fl.getMaterial(f); if (mt && (mt.transparent || mt.opacity < 0.95)) glass = true; C.fl.getWorldBounds(f, fb); box.union(fb); }, true);
      if (glass || box.isEmpty() || box.min.z * S > zM || box.max.z * S < zM) return;
      const x0 = box.min.x * S, y0 = box.min.y * S, x1 = box.max.x * S, y1 = box.max.y * S;
      if (x1 - x0 > 4 || y1 - y0 > 4) return; // ворота, витражные блоки — не трогаем
      segs.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
      for(let i=0;i<4;i++) entries.push({bounds:null,provenance:{dbId:id,fragments,category:'Revit Doors',zM,unitScale:S,operation:'Viewer getWorldBounds; closed opaque door AABB',reconstruction:'unknown'}});
    });
    Object.defineProperty(segs,'precision',{value:{v:1,reference:'source-model',reconstruction:segs.length?'unknown':'exact',complete:true,entries,reasons:segs.length?['door-bounds-accuracy-unknown']:[]}});
    return segs;
  }

  // привязка вертикального проёма к пространству: по нормали в обе стороны до первой значимой области физического растра Rp
  // (линии разделения помещений светопрозрачны и не мешают); сторона — снаружи (Rp.ext) и внутри (клетка пространства)
  function assign(Rp, spaceLab, ops, floor, top) {
    const okReg = id => Rp.ext.has(id) || (Rp.regs[id] && Rp.regs[id].areaC > 1.5);
    const side = (o, sg) => { for (let k = 0.01; k < 2.5; k += 0.02) {
      const x = o.c[0] + sg * o.n[0] * k, y = o.c[1] + sg * o.n[1] * k, id = labelAt(Rp, x, y);
      const i = Math.floor((x - Rp.minx) / Rp.cell), j = Math.floor((y - Rp.miny) / Rp.cell);
      const sp = (i >= 0 && j >= 0 && i < Rp.W && j < Rp.H) ? spaceLab[j * Rp.W + i] : -1;
      if (id > 0 && (okReg(id) || sp >= 0)) return { id, k, sp };
    } return null; };
    const st = { level: 0, outer: 0, inner: 0, none: 0, noSpace: 0 };
    ops.forEach(o => {
      if (o.roof || o.z0 < floor - 0.3 || o.z0 >= top - 0.05) return;
      // Level bands overlap at floor-0.3. Preserve the first eligible owner
      // (app visits floors bottom-up); never mix another floor's space index
      // with the original level name. Cross-level geometry needs review.
      if (o.floor !== undefined && o.floor !== floor) { o.levelBoundary = true; return; }
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
    const S = C.S, h = rayIntersect(C, new THREE.Ray(new THREE.Vector3(x / S, y / S, z / S), new THREE.Vector3(0, 0, 1)), true, 'hitUp');
    return h && h.distance * S <= (maxD || 1e9) ? z + h.distance * S : null;
  }
  // размеры фонаря из параметров семейства (A_GMO_Skywindow_Angle: Diameter_Inside — D1, верхнее отверстие шахты под стеклом;
  // Diameter_Bottom — D2, нижнее отверстие в потолке; единицы из units / dataTypeContext)
  async function lanternParams(C, ids) {
    if (!ids.length) return {};
    const names = ['Diameter_Inside', 'Diameter_Bottom'];
    const unitLabels = new Map([['m','meters'],['mm','millimeters'],['cm','centimeters'],['dm','decimeters'],['ft','feet'],['in','inches']]);
    const lengthUnit = u => unitLabels.has(u) ? 'autodesk.unit.unit:' + unitLabels.get(u) + '-1.0.1' : u;
    let bulkFailed = false, rawFailed = false;
    const props = await new Promise((ok, bad) => C.m.getBulkProperties2(ids, { propFilter: names }, ok, bad)).catch(() => { bulkFailed = true; return []; });
    let raw = [];
    // Bulk display values can be rounded/localised and omit units. Prefer raw
    // property DB values paired with each attribute's explicit dataTypeContext.
    try { raw = await C.m.getPropertyDb().executeUserFunction(function (pdb) {
      const out = [];
      pdb.enumObjects(id => {
        const values = [];
        pdb.enumObjectProperties(id, (a, v) => {
          const d = pdb.getAttributeDef(a);
          if (d.name === 'Diameter_Inside' || d.name === 'Diameter_Bottom')
            values.push({ name: d.name, value: pdb.getAttrValue(a, v), context: d.dataTypeContext || d.units || null });
        });
        if (values.length) out.push({ id, values });
      });
      return out;
    }); } catch (e) { rawFailed = true; /* explicit bulk units may still be available */ }
    const out = {};
    ids.forEach(id => {
      const db = raw.find(r => r.id === id), bulk = props.find(r => r.dbId === id), notes = [];
      const read = name => {
        const rp = db && db.values.find(p => p.name === name), bp = bulk && bulk.properties.find(p => p.attributeName === name || p.displayName === name);
        if (!rp && !bp) return null;
        // Public Viewer PropertyResult reports units; property DB attributes
        // usually expose dataTypeContext. Never pair one API's value with the
        // other API's units (bulk may already be converted/localised).
        const candidates = [];
        if (rp) candidates.push({value:rp.value, context:rp.context, source:'property DB'});
        if (bp) candidates.push({value:bp.displayValue, context:bp.units || bp.dataTypeContext, source:'Viewer properties'});
        const failures = [];
        for (const p of candidates) {
          const c = BimSpaces.conv(p.value, lengthUnit(p.context), 'len');
          if (c.ok && c.v > 0) {
            if (failures.length) notes.push(`${name}: исходный параметр не прочитан с известными единицами; использовано значение ${p.source} с его единицами`);
            return c.v;
          }
          failures.push(c.warn || 'нужен положительный размер');
        }
        notes.push(`${name}: ${[...new Set(failures)].join('; ')}; параметр не используется`);
        return null;
      };
      const dIn = read('Diameter_Inside'), dBot = read('Diameter_Bottom');
      if ((!dIn || !dBot) && (bulkFailed || rawFailed)) notes.push('Не удалось полностью прочитать параметры шахты; отсутствие размеров в модели не подтверждено.');
      if (dIn || dBot || notes.length) out[id] = { dIn, dBot, notes };
    });
    return out;
  }
  // то же с элементом, в который упёрся луч
  function hitUpEl(C, x, y, z, maxD) {
    const S = C.S, h = rayIntersect(C, new THREE.Ray(new THREE.Vector3(x / S, y / S, z / S), new THREE.Vector3(0, 0, 1)), true, 'hitUpEl');
    return h && h.distance * S <= (maxD || 1e9) ? { z: z + h.distance * S, id: h.dbId } : null;
  }
  function hitDir(C, p, dir, maxD) {
    const S = C.S, h = rayIntersect(C, new THREE.Ray(new THREE.Vector3(p[0] / S, p[1] / S, p[2] / S), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()), true, 'hitDir');
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
      const hit = rayIntersect(C, new THREE.Ray(new THREE.Vector3(x / S, y / S, (zTop + 0.05) / S), new THREE.Vector3(0, 0, 1)), false, 'overhang');
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

  return { withFullModel, clearSections, ctx, catalog, rooms, location, eachGeom, slice, bounds, paintSegments, raster, labelAt, markExterior, openings, doorBoxes, assign, spaceCells, hitUp, hitUpEl, hitDir, lanternParams, heightMap, overhang, skyline, deg };
})();

