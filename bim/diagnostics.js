/* Opt-in, local-only evidence. Never re-query Viewer or substitute a calculation input.
   Replay covers the adapter/calculator with recorded callback answers, not extraction
   from an original RVT or an independent verification of the geometry. */
const BimDiagnostics = (function () {
  const SCHEMA = 'keo-room-diagnostic/1';
  function encode(value, seen = new Set()) {
    if (typeof value === 'function') return undefined;
    if (value === undefined) return { $keo: 'undefined' };
    if (typeof value === 'bigint') return { $keo:'BigInt',value:value.toString() };
    if (Object.is(value,-0)) return { $keo:'-0' };
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
    if (value.$keo === 'BigInt') return BigInt(value.value);
    if (value.$keo === '-0') return -0;
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
  const own = (o,k) => !!o && Object.prototype.hasOwnProperty.call(o,k);
  function errorInfo(error) {
    try {
      if(error===null || ['undefined','string','number','boolean','bigint'].includes(typeof error))return {name:'ThrownValue',message:String(error),value:encode(error)};
      if(typeof error?.name==='string' && typeof error.message==='string')return {name:error.name,message:error.message};
    }catch(_){}
    return {name:'UninspectableError',message:'Thrown value metadata is unavailable',uninspectable:true};
  }
  function replayIssues(packet) {
    const r=packet?.room,input=r?.input,issues=[];
    if(packet?.schema!==SCHEMA)issues.push('unsupported-schema');
    if(!input || r?.captureError)issues.push('missing-or-failed-input-snapshot');
    if(input && (!input.space || !Array.isArray(input.space.rooms) || !Array.isArray(input.openings) || !Array.isArray(input.lanterns) || !input.env || !own(input.env,'settings') || !Array.isArray(input.env.pts) || !Array.isArray(input.env.rows)))issues.push('missing-calculation-input-fields');
    if(!r || !own(r,'result') && !r.thrown)issues.push('missing-recorded-outcome');
    const validError=e=>e && typeof e.name==='string' && typeof e.message==='string' && !e.uninspectable;
    if(r?.thrown && (!validError(r.thrown) || own(r,'result')))issues.push('invalid-recorded-error');
    const allowed=new Set(['shade','containsPoint','roomPts']),callbacks=r?.callbacks;
    if(!Array.isArray(callbacks) || callbacks.some(n=>!allowed.has(n)) || new Set(callbacks).size!==callbacks.length)issues.push('invalid-callback-contract');
    if(r?.sectionContainsPoint===true)allowed.add('sectionContainsPoint');
    if(!Array.isArray(r?.calls) || r.calls.some(c=>!c || !allowed.has(c.name) || c.name!=='sectionContainsPoint'&&(!Array.isArray(callbacks)||!callbacks.includes(c.name)) || !Array.isArray(c.args) ||
      (!own(c,'value')&&!c.error) || own(c,'value')&&!!c.error || c.error&&!validError(c.error)))issues.push('missing-or-invalid-callback-trace');
    return issues;
  }
  function evidence(packet) {
    const r=packet?.room || {},level=packet?.level?.$keo==='undefined'?null:packet?.level,issues=replayIssues(packet),
      calls=Array.isArray(r.calls)?r.calls:[],allRays=Array.isArray(packet?.rays)?packet.rays:[],events=Array.isArray(packet?.errorEvents)?packet.errorEvents:[],
      sideCalls=calls.flatMap((c,i)=>c?.name==='shade'?[i]:[]),
      roomRays=allRays.filter(x=>x.key===r.binding?.key && x.callback==='shade');
    const unobserved=sideCalls.filter(i=>!roomRays.some(ray=>ray.callIndex===i));
    const entries=['physical','roomSeparation','doors'].map(k=>({kind:k,count:level?.sources?.[k]?.length ?? null,entries:level?.sources?.[k==='doors'?'doorEntries':k+'Entries']}));
    const missing=entries.filter(x=>x.count===null || x.count>0 && (!Array.isArray(x.entries) || x.entries.length!==x.count || x.entries.some(e=>e?.provenance?.dbId===null || e?.provenance?.dbId===undefined))).map(x=>x.kind);
    const coverage=list=>({state:!Array.isArray(list)?'unavailable':list.every(o=>o.source && o.source.status!=='unavailable')?'recorded':'partial',count:Array.isArray(list)?list.length:null,
      missingIds:Array.isArray(list)?list.filter(o=>!o.source || o.source.status==='unavailable').map(o=>o.id):[]});
    return { replay:{state:r.availability==='not-calculated'?'not-calculated':issues.length?'incomplete':'captured',issues,
        outcome:r.thrown?'thrown':r.result?.err || r.result?.C?.ok===false?'rejected':own(r,'result')?'returned':'unavailable'},
      sourceGeometry:{state:'unverified',nativeRoomBoundaries:'not-collected',exactSourceRevision:packet.model?.exactSourceRevision ?? null,loadCompleteness:'not-verified'},
      boundarySources:{state:!level?'unavailable':missing.length?'partial':'recorded',missingCollections:missing,counts:entries.map(({kind,count})=>({kind,count}))},
      openingSources:coverage(r.input?.openings),lanternSources:coverage(r.input?.lanterns),
      sideRays:{state:!sideCalls.length?'not-requested':unobserved.length || events.some(e=>e.kind==='raySnapshot' && (!e.key || e.key===r.binding.key) && e.runId===packet.runId)?'incomplete':'recorded',
        shadeCalls:sideCalls.length,rayCount:roomRays.length,unobservedShadeCalls:unobserved,
        unknownHitModelCount:roomRays.filter(x=>x.hit && x.hit.modelMatchesAnalyzed===null).length,
        failedRayCount:roomRays.filter(x=>x.error).length} };
  }
  // Bounded diagnostic diff, not a numerical tolerance or a normative verdict.
  function differences(a,b,limit=40,path='$',out=[]) {
    if(out.length>=limit || Object.is(a,b))return out;
    if(a===null || b===null || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b))out.push({path,before:a===undefined?{$keo:'missing-property'}:a,after:b===undefined?{$keo:'missing-property'}:b});
    else if(Array.isArray(a) && a.length!==b.length)out.push({path:path+'.length',before:a.length,after:b.length});
    else for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){differences(a[key],b[key],limit,Array.isArray(a)?path+'['+key+']':path+'.'+key,out);if(out.length>=limit)break;}
    return out;
  }
  function compare(a,b) {
    if(a?.schema!==SCHEMA || b?.schema!==SCHEMA || !a.room?.binding || !b.room?.binding)throw Error('Comparable diagnostic packets required');
    const scope=p=>({algorithm:p.algorithm?.sha256,urn:p.model?.urn,documentUrn:p.model?.documentUrn,view:p.model?.view,unitScale:p.model?.unitScale,globalOffset:p.model?.globalOffset,room:p.room.binding.key,level:p.room.binding.level});
    const states=p=>{const r=decode(p.room.result);return (r?.mode==='comb'?r.comb?.sideAt?.map(x=>x.st):r?.mode==='side'?[r.st]:[])?.map(s=>s && Object.fromEntries(Object.entries(s).filter(([k])=>k!=='meta')));};
    const contributions=p=>{const r=decode(p.room.result);return r?.mode==='comb'?{side:r.comb?.eSide,top:r.comb?.eTop,total:r.comb?.e,mean:r.comb?.eAvgR}:r?.mode==='side'?{side:[r.C?.res?.eFinal]}:{top:r?.C?.res?.e};};
    const rays=p=>(p.rays || []).filter(r=>r.key===p.room.binding.key && r.callback==='shade');
    const request=r=>Object.fromEntries(['callIndex','kind','ignoreTransparent','origin','direction'].map(k=>[k,r[k]]));
    const environment=p=>({viewerVersion:p.model?.viewerVersion,runtime:p.model?.runtime,loadState:p.model?.loadState,cuts:p.model?.cuts,runKind:p.runKind});
    const sections={scope:[scope(a),scope(b)],environment:[environment(a),environment(b)],inputs:[a.room.input,b.room.input],sideStates:[states(a),states(b)],contributions:[contributions(a),contributions(b)],
      callbackTrace:[a.room.calls,b.room.calls],probeSources:[a.probes,b.probes],rayRequests:[rays(a).map(request),rays(b).map(request)],rayAnswers:[rays(a).map(r=>({hit:r.hit,error:r.error})),rays(b).map(r=>({hit:r.hit,error:r.error}))]};
    const missingScopeFields=Object.keys(sections.scope[0]).filter(k=>sections.scope.some(s=>s[k]===null || s[k]===undefined || s[k]===''));
    return {sameRecordedScope:missingScopeFields.length?null:equal(...sections.scope),scopeStatus:{state:missingScopeFields.length?'incomplete':equal(...sections.scope)?'matching-recorded-fields':'different',missingFields:missingScopeFields},
      sourceRevisionVerified:!!a.model?.exactSourceRevision && a.model.exactSourceRevision===b.model?.exactSourceRevision,
      sections:Object.fromEntries(Object.entries(sections).map(([k,[x,y]])=>[k,{equal:equal(x,y),differences:differences(encode(x),encode(y)),detailLimit:40}])),
      evidence:[evidence(a),evidence(b)],limitations:['Equality compares recorded evidence only; immutable source revision and geometry accuracy may remain unknown','Missing ray evidence is not an empty/clear ray result','Detailed differences are bounded; equal is checked independently without numeric tolerance']};
  }
  function frame(f) {
    if (!f) return f;
    const { O, u, v } = f;
    return { ...f, toLocal: p => [(p[0]-O[0])*u[0]+(p[1]-O[1])*u[1], (p[0]-O[0])*v[0]+(p[1]-O[1])*v[1]],
      toWorld: p => [O[0]+p[0]*u[0]+p[1]*v[0], O[1]+p[0]*u[1]+p[1]*v[1]] };
  }
  function replay(packet, lib) {
    const missing=replayIssues(packet);
    if (missing.length) throw Error('No complete replay input: '+missing.join(', '));
    if (!packet.algorithm?.sha256 || !lib.algorithm?.sha256 || packet.algorithm.sha256 !== lib.algorithm.sha256) throw Error('Algorithm version mismatch or unavailable');
    const r = packet.room, input = decode(r.input), calls = decode(r.calls); let next = 0;
    const answer = name => (...args) => {
      const call = calls[next++];
      if (!call || call.name !== name || !equal(args, call.args)) throw Error('Recorded callback mismatch: '+name);
      if (call.error) { if(own(call.error,'value'))throw call.error.value;throw Object.assign(Error(call.error.message), { name: call.error.name }); }
      return call.value;
    };
    const env = { ...input.env, KEO: lib.KEO, Engine: lib.Engine, DATA: lib.DATA };
    for (const name of r.callbacks) env[name] = answer(name);
    if (env.shortSection?.context) {
      env.shortSection.context.frame = frame(env.shortSection.context.frame);
      if (r.sectionContainsPoint) env.shortSection.context.containsPoint = answer('sectionContainsPoint');
    }
    let result,didThrow=false;
    try { result = lib.BimCalc.space(input.space, input.openings, input.lanterns, env); }
    catch (e) { if (!r.thrown || !equal(errorInfo(e),r.thrown)) throw e;didThrow=true;result = { thrown: r.thrown }; }
    if (next !== calls.length) throw Error('Recorded callbacks not fully consumed');
    const expected = r.thrown ? { thrown: r.thrown } : decode(r.result);
    return { matches: didThrow===!!r.thrown && equal(result, expected), scope:'adapter/calculator with recorded callback answers', rayExtractionReplayed:false, geometryVerified:false, result };
  }
  function create(enabled, algorithm = null, now = () => performance.now()) {
    const phases = [], rays = [], probes = [], rooms = new Map(), levels = new Map(), errors = [], errorEvents = [], rasters = new WeakMap();
    let model = null, inspectedModel = null, catalogInfo = null, scope = {}, runKind = 'analysis', runId=0;
    const fail = (e,kind) => { const info=errorInfo(e);errors.push(info.message);errorEvents.push({...scope,runKind,runId,kind,...info}); };
    const safe = (work,kind='record') => { try { return work(); } catch (e) { fail(e,kind); return null; } };
    const clock = () => { const n=safe(now,'clock');return typeof n==='number' && Number.isFinite(n) ? n : null; };
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
      },'modelSnapshot');
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
      },'levelSnapshot');
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
      },'inputSnapshot');
      if (!captured) { safe(()=>rooms.set(binding.key,{binding:{key:binding.key,level:binding.level},availability:'incomplete',captureError:'Input snapshot failed',callbacks:[],calls:[]})); return calculate(env); }
      const record = work => { try { return work(); } catch(e) { rec.captureError=errorInfo(e).message;fail(e,'roomSnapshot');return null; } };
      const wrap = (fn, name) => (...args) => {
        // Call the original exactly once. Recording failures must not change its value/error.
        let call; record(() => { call = { name, args: encode(args) }; });
        const previous = scope; scope = { ...scope, callback:name, callIndex:rec.calls.length };
        try { const value = fn(...args); record(() => rec.calls.push({ ...call, value: encode(value) })); return value; }
        catch (e) { const info=errorInfo(e);record(() => {if(info.uninspectable)rec.captureError=info.message;rec.calls.push({ ...call, error:info });}); throw e; }
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
          rec.interpretation=encode({purpose:{gate:binding.purposeGate || null,previewOnly:binding.previewOnly !== false,
            rawResultStage:'before purpose gating',note:'Raw result is retained for exact replay. Norm/pass fields are hypothetical until purpose is confirmed; a confirmed purpose alone does not certify geometry or normative accuracy.'},pointRule:{directoryRow:result.row || null,multi:result.multi ?? null,adapterRtManual:result.st?.rtManual,
            note:'rtManual may be assigned by the adapter for multi-wall/combined calculation; it is not proof of a user override'},
            coefficients:{source:'Saved settings, per-point calculator states and computed wall/window records in result; not measured material properties'},
            sourceBindings:'Opening dbIds/fragments and contour segment provenance are retained; native Room boundaries remain unverified'});
        }); return result;
      } catch (e) { rec.thrown=errorInfo(e);if(rec.thrown.uninspectable)rec.captureError=rec.thrown.message;throw e; }
      finally { if (!Object.prototype.hasOwnProperty.call(rec,'result') && !rec.thrown) rec.captureError='Result snapshot unavailable'; safe(() => rooms.set(binding.key, rec)); scope = prev; }
    }
    function recordRay(kind, ray, ignoreTransparent, hit, error) {
      if (!enabled) return;
      safe(() => rays.push({ ...scope, kind, ignoreTransparent, origin: encode(ray.origin), direction: encode(ray.direction),
        hit: hit ? { dbId:hit.dbId ?? null, fragId:hit.fragId ?? null, modelId:hit.model?.id ?? null, modelMatchesAnalyzed:hit.model && inspectedModel ? hit.model===inspectedModel : null,
          distance:hit.distance, point:encode(hit.intersectPoint || hit.point || null),
          element:hit.model && inspectedModel && hit.model!==inspectedModel?{status:'different-model'}:catalogInfo?.[hit.dbId]?{status:hit.model?'active-model-catalog':'active-catalog-hit-model-unverified',...encode(catalogInfo[hit.dbId])}:{status:'unavailable'} } : null,
        error:arguments.length>=5?errorInfo(error):null }),'raySnapshot');
    }
    function captureUnavailable(binding, reason) {
      if (enabled) safe(()=>rooms.set(binding.key,{binding:encode(binding),availability:'not-calculated',reason,callbacks:[],calls:[]}));
    }
    function packet(key) {
      if (!enabled) throw Error('Диагностика не включена: запустите KeoBim.run({diagnostics:true}).');
      const room = rooms.get(key); if (!room) throw Error('Для этого пространства нет диагностического входа.');
      const result = encode({ schema:SCHEMA, algorithm, model, runKind, runId, room,
        level:levels.get(room.binding.level), phases:phases.filter(p=>!p.key || p.key===key), rays:rays.filter(r=>(!r.key || r.key===key) && (!r.level || r.level===room.binding.level)),
        probes:probes.filter(p=>!p.key || p.key===key), errors,errorEvents:errorEvents.filter(e=>!e.key || e.key===key),
        limitations:['Local private data; no network upload', 'Replay uses recorded Viewer callback answers, not original RVT extraction', 'Geometry/Room identity and normative accuracy are not certified', 'Timings overlap; diagnostic copying/serialization adds overhead and is not a production benchmark'] });
      result.evidence=encode(evidence(result));return result;
    }
    return { enabled, measure, measureAsync, inspectModel, captureLevel, capture, captureUnavailable, recordRay, packet,
      setCatalog(cat) {if(enabled)safe(()=>{catalogInfo=cat?.info || null;},'catalogSnapshot');},
      recordProbe(kind,value) {if(enabled)safe(()=>probes.push({...scope,kind,value:encode(value)}),'probeSnapshot');},
      beginRebuild() { if (enabled) { runKind='rebuild';runId++; rooms.clear(); phases.length=0; rays.length=0;probes.length=0; } },
      summary: () => ({ enabled, errors:errors.slice(), roomCount:rooms.size }) };
  }
  return { create, replay, compare, evidence, replayIssues, encode, decode, equal, SCHEMA };
})();
