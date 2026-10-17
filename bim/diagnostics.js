/* Opt-in, local-only evidence. Never re-query Viewer or substitute a calculation input.
   Replay covers the adapter/calculator with recorded callback answers, not extraction
   from an original RVT or an independent verification of the geometry. */
const BimDiagnostics = (function () {
  const SCHEMA = 'keo-room-diagnostic/1';
  function encode(value, seen = new Set()) {
    if (typeof value === 'function') return undefined;
    if (value === undefined) return { $keo: 'undefined' };
    if (typeof value === 'number' && !Number.isFinite(value)) return { $keo: String(value) };
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) throw Error('Cyclic diagnostic input');
    seen.add(value);
    let out;
    if (value instanceof Set) out = { $keo: 'Set', values: [...value].map(x => encode(x, seen)) };
    else if (Array.isArray(value) || ArrayBuffer.isView(value)) out = Array.from(value, x => encode(x, seen));
    else out = Object.fromEntries(Object.keys(value).filter(k => typeof value[k] !== 'function').map(k => [k, encode(value[k], seen)]));
    seen.delete(value); return out;
  }
  function decode(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(decode);
    if (value.$keo === 'undefined') return undefined;
    if (value.$keo === 'NaN') return NaN;
    if (value.$keo === 'Infinity') return Infinity;
    if (value.$keo === '-Infinity') return -Infinity;
    if (value.$keo === 'Set') return new Set(value.values.map(decode));
    return Object.fromEntries(Object.keys(value).map(k => [k, decode(value[k])]));
  }
  const stable = value => JSON.stringify(value, function (key, v) {
    return v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v;
  });
  const equal = (a,b) => stable(encode(a)) === stable(encode(b));
  function frame(f) {
    if (!f) return f;
    const { O, u, v } = f;
    return { ...f, toLocal: p => [(p[0]-O[0])*u[0]+(p[1]-O[1])*u[1], (p[0]-O[0])*v[0]+(p[1]-O[1])*v[1]],
      toWorld: p => [O[0]+p[0]*u[0]+p[1]*v[0], O[1]+p[0]*u[1]+p[1]*v[1]] };
  }
  function replay(packet, lib) {
    if (packet.schema !== SCHEMA || !packet.room?.input || packet.room.captureError) throw Error('No complete replay input');
    if (!packet.algorithm?.sha256 || !lib.algorithm?.sha256 || packet.algorithm.sha256 !== lib.algorithm.sha256) throw Error('Algorithm version mismatch or unavailable');
    const r = packet.room, input = decode(r.input), calls = decode(r.calls); let next = 0;
    const answer = name => (...args) => {
      const call = calls[next++];
      if (!call || call.name !== name || !equal(args, call.args)) throw Error('Recorded callback mismatch: '+name);
      if (call.error) throw Object.assign(Error(call.error.message), { name: call.error.name });
      return call.value;
    };
    const env = { ...input.env, KEO: lib.KEO, Engine: lib.Engine, DATA: lib.DATA };
    for (const name of r.callbacks) env[name] = answer(name);
    if (env.shortSection?.context) {
      env.shortSection.context.frame = frame(env.shortSection.context.frame);
      if (r.sectionContainsPoint) env.shortSection.context.containsPoint = answer('sectionContainsPoint');
    }
    let result;
    try { result = lib.BimCalc.space(input.space, input.openings, input.lanterns, env); }
    catch (e) { if (!r.thrown || e.message !== r.thrown.message || e.name !== r.thrown.name) throw e; result = { thrown: r.thrown }; }
    if (next !== calls.length) throw Error('Recorded callbacks not fully consumed');
    const expected = r.thrown ? { thrown: r.thrown } : decode(r.result);
    return { matches: equal(result, expected), result };
  }
  function create(enabled, algorithm = null, now = () => performance.now()) {
    const phases = [], rays = [], rooms = new Map(), levels = new Map(), errors = [], rasters = new WeakMap();
    let model = null, inspectedModel = null, scope = {}, runKind = 'analysis';
    const safe = work => { try { return work(); } catch (e) { errors.push(e.message); return null; } };
    const clock = () => { const n=safe(now);return typeof n==='number' && Number.isFinite(n) ? n : null; };
    function measure(name, work, info = {}) {
      if (!enabled) return work();
      const start = clock(), prev = scope; scope = { ...prev, ...info, phase: name };
      try { return work(); }
      finally { const end = clock(); safe(() => phases.push({ ...scope, runKind, ms: start === null || end === null ? null : Math.max(0, end-start) })); scope = prev; }
    }
    async function measureAsync(name, work, info = {}) {
      if (!enabled) return work();
      const start = clock(), prev = scope; scope = { ...prev, ...info, phase: name };
      try { return await work(); }
      finally { const end = clock(); safe(() => phases.push({ ...scope, runKind, ms: start === null || end === null ? null : Math.max(0, end-start) })); scope = prev; }
    }
    function inspectModel(C, viewerVersion) {
      if (!enabled) return;
      inspectedModel=C.m;
      safe(() => {
        const d = C.m.getData(), node = C.m.getDocumentNode(), root = node?.getRootNode();
        model = encode({ urn: d.urn || null, documentUrn: root?.urn?.() || null, view: node?.data?.guid || null,
          unitScale: C.S, globalOffset: d.globalOffset || null, viewerVersion: viewerVersion || null,
          runtime:typeof navigator === 'undefined' ? 'non-browser/unspecified' : navigator.userAgent,
          exactSourceRevision: null, sourceRevisionStatus: 'URN/view recorded; immutable source revision not verified',
          loadState: { loadDone: d.loadDone ?? null, geometryLoaded: d.geometryLoaded ?? null },
          cuts: C.v.getCutPlanes?.() || [], visibilityAudit: 'withFullModel guards ray stages; captured cuts are display context' });
      });
    }
    function captureLevel(L, sources) {
      if (!enabled) return;
      safe(() => {
        // Many slice segments share the same decoder/matrix provenance. Retain
        // exact records through dictionary indices rather than copying a matrix
        // three times per triangle and again in the combined precision object.
        const vertexSources=[], indices=new Map(), compact={...sources};
        for(const key of ['physicalEntries','roomSeparationEntries','doorEntries']) if(sources[key]) compact[key]=sources[key].map(entry=>{
          const p={...entry.provenance};
          if(p.vertices){p.vertexSourceIndices=p.vertices.map(v=>{const signature=stable(encode(v));if(!indices.has(signature)){indices.set(signature,vertexSources.length);vertexSources.push(v)}return indices.get(signature)});delete p.vertices;}
          return {...entry,provenance:p};
        });
        compact.vertexSources=vertexSources;
        const precision=L.boundaryPrecision && Object.fromEntries(Object.entries(L.boundaryPrecision).filter(([k])=>k!=='entries'));
        levels.set(L.name, encode({ floor:L.floor,top:L.top,grid:{cell:L.R.cell,minx:L.R.minx,miny:L.R.miny,W:L.R.W,H:L.R.H},
          sources:compact,physicalPrecision:precision,interpretation:{physical:'slice + closed opaque door AABBs',matching:'slice + Room Separation; not native Room boundaries'} }));
      });
    }
    function capture(binding, space, openings, lanterns, env, calculate) {
      if (!enabled) return calculate(env);
      let rec;
      const captured = safe(() => {
        rec = { binding: encode(binding), callbacks: [], calls: [], sectionContainsPoint: false,
          input: encode({ space, openings: openings.map(o=>({...o, source:o.source || { status:'unavailable' }})), lanterns: lanterns.map(o=>({...o, source:o.source || { status:'unavailable' }})),
            env: Object.fromEntries(['settings','floor','pts','T','north','rows','shortSection'].map(k=>[k,env[k]])) }) };
        if (env.Rp) {
          if (!rasters.has(env.Rp)) rasters.set(env.Rp, encode({ ...Object.fromEntries(['cell','minx','miny','W','H','lab','ext'].map(k=>[k,env.Rp[k]])), regs:env.Rp.regs.map(r=>r ? {areaC:r.areaC} : null) }));
          rec.input.env.Rp = rasters.get(env.Rp);
        }
        return true;
      });
      if (!captured) return calculate(env);
      const record = work => { try { return work(); } catch(e) { rec.captureError=e.message;errors.push(e.message);return null; } };
      const wrap = (fn, name) => (...args) => {
        // Call the original exactly once. Recording failures must not change its value/error.
        let call; record(() => { call = { name, args: encode(args) }; });
        const previous = scope; scope = { ...scope, callback:name, callIndex:rec.calls.length };
        try { const value = fn(...args); record(() => rec.calls.push({ ...call, value: encode(value) })); return value; }
        catch (e) { record(() => rec.calls.push({ ...call, error: { name:e.name, message:e.message } })); throw e; }
        finally { scope=previous; }
      };
      const traced = { ...env };
      for (const name of ['shade','containsPoint','roomPts']) if (typeof env[name] === 'function') { rec.callbacks.push(name); traced[name] = wrap(env[name],name); }
      if (env.shortSection?.context && typeof env.shortSection.context.containsPoint === 'function') {
        rec.sectionContainsPoint = true;
        traced.shortSection = { ...env.shortSection, context: { ...env.shortSection.context, containsPoint: wrap(env.shortSection.context.containsPoint, 'sectionContainsPoint') } };
      }
      const prev = scope; scope = { ...scope, key:binding.key, level:binding.level };
      try {
        const result = measure('roomCalculation', () => calculate(traced));
        record(() => {
          rec.result = encode(result);
          if (result.st?.meta?.date !== undefined) rec.input.env.reportDate=result.st.meta.date;
          rec.interpretation=encode({pointRule:{directoryRow:result.row || null,multi:result.multi ?? null,adapterRtManual:result.st?.rtManual,
            note:'rtManual may be assigned by the adapter for multi-wall/combined calculation; it is not proof of a user override'},
            coefficients:{source:'Saved settings, per-point calculator states and computed wall/window records in result; not measured material properties'},
            sourceBindings:'Opening dbIds/fragments and contour segment provenance are retained; native Room boundaries remain unverified'});
        }); return result;
      } catch (e) { rec.thrown = { name:e.name, message:e.message }; throw e; }
      finally { if (!Object.prototype.hasOwnProperty.call(rec,'result') && !rec.thrown) rec.captureError='Result snapshot unavailable'; safe(() => rooms.set(binding.key, rec)); scope = prev; }
    }
    function recordRay(kind, ray, ignoreTransparent, hit) {
      if (!enabled) return;
      safe(() => rays.push({ ...scope, kind, ignoreTransparent, origin: encode(ray.origin), direction: encode(ray.direction),
        hit: hit ? { dbId:hit.dbId ?? null, fragId:hit.fragId ?? null, modelId:hit.model?.id ?? null, modelMatchesAnalyzed:hit.model && inspectedModel ? hit.model===inspectedModel : null,
          distance:hit.distance, point:encode(hit.intersectPoint || hit.point || null) } : null }));
    }
    function captureUnavailable(binding, reason) {
      if (enabled) safe(()=>rooms.set(binding.key,{binding:encode(binding),availability:'not-calculated',reason,callbacks:[],calls:[]}));
    }
    function packet(key) {
      if (!enabled) throw Error('Диагностика не включена: запустите KeoBim.run({diagnostics:true}).');
      const room = rooms.get(key); if (!room) throw Error('Для этого пространства нет диагностического входа.');
      return encode({ schema:SCHEMA, algorithm, model, runKind, room,
        level:levels.get(room.binding.level), phases:phases.filter(p=>!p.key || p.key===key), rays:rays.filter(r=>(!r.key || r.key===key) && (!r.level || r.level===room.binding.level)), errors,
        limitations:['Local private data; no network upload', 'Replay uses recorded Viewer callback answers, not original RVT extraction', 'Geometry/Room identity and normative accuracy are not certified', 'Timings overlap; diagnostic copying/serialization adds overhead and is not a production benchmark'] });
    }
    return { enabled, measure, measureAsync, inspectModel, captureLevel, capture, captureUnavailable, recordRay, packet,
      beginRebuild() { if (enabled) { runKind='rebuild'; rooms.clear(); phases.length=0; rays.length=0; } },
      summary: () => ({ enabled, errors:errors.slice(), roomCount:rooms.size }) };
  }
  return { create, replay, encode, decode, equal, SCHEMA };
})();
