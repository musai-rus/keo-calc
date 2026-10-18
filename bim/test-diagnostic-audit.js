/* Recorded evidence, partial-data failures and comparison. Synthetic fixtures only. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const scripts=[...fs.readFileSync(__dirname+'/test-purpose.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const context=vm.createContext({assert,console,performance,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){}});context.window=context;
const status={textContent:''};context.document={querySelector:()=>({}),getElementById:id=>id==='kb-status'?status:null,body:{contains:()=>true}};
const storage=new Map();context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
require('./fixture-binding-dom.js')(context);
vm.runInContext(scripts[0],context);
let bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8').replace('  return { run, st: () => st, S,','  mount=()=>{ui={remove(){},querySelector:s=>document.getElementById(s.slice(1))}};draw=()=>{};renderList=()=>{};\n  return {_bindDiagnosticMode:bindDiagnosticMode,_settingsHTML:settingsHTML, run, st: () => st, S,');
vm.runInContext(bundle,context);context.productionOverhang=context.KeoBimLib.BimGeom.overhang;
vm.runInContext(scripts[1].split('const log=document.querySelector')[0],context);
(async()=>{
 await vm.runInContext(`(async()=>{
  const D=KeoBimLib.BimDiagnostics,copy=x=>JSON.parse(JSON.stringify(x));
  const special=D.decode(copy(D.encode({negativeZero:-0,nan:NaN,infinity:Infinity,missing:undefined,integer:12345678901234567890n,set:new Set([2,3])})));
  assert.ok(Object.is(special.negativeZero,-0));assert.ok(Number.isNaN(special.nan));assert.equal(special.infinity,Infinity);assert.equal(special.missing,undefined);assert.equal(special.integer,12345678901234567890n);assert.equal(special.set.has(3),true);
  let limit=1.7,distance=1,rayCalls=0;
  THREE.Ray=class {constructor(origin,direction){Object.assign(this,{origin,direction})}};
  NOP_VIEWER.model.id='synthetic-viewer-model';
  NOP_VIEWER.impl.rayIntersect=(ray,ignore)=>{rayCalls++;assert.equal(ignore,false);return Math.abs(ray.origin.y)<=limit?{distance,dbId:900,fragId:5,model:NOP_VIEWER.model}:null;};
  G.catalog=async()=>({byCat:{},info:{900:{c:'Revit Roofs',type:'Synthetic canopy'}}});
  G.overhang=productionOverhang;
  const originalOpenings=G.openings;
  G.openings=()=>originalOpenings().filter(o=>o.roof||o.c[0]===3).map(o=>{Object.defineProperty(o,'source',{value:{dbId:o.id,fragments:[{fragment:o.id,glass:true,geometryAvailable:true}],geometryCompleteness:'not verified'}});return o});
  const slice=G.slice;
  G.slice=(...args)=>{const segments=slice(...args);Object.defineProperty(segments,'precision',{value:{v:1,reference:'synthetic',complete:false,reconstruction:'unknown',reasons:['unknown synthetic precision'],entries:segments.map((s,i)=>({bounds:null,provenance:{dbId:'synthetic-wall-'+i,fragment:i}}))}});return segments;};
  const numeric=()=>JSON.stringify(KeoBim.st().res.map(r=>({st:r.st,C:r.C,comb:r.comb,pts:r.pts})));
  await KeoBim.run({region:'г. Москва',diagnostics:false});const without=numeric(),offRayCalls=rayCalls;rayCalls=0;
  await KeoBim.run({diagnostics:true});assert.equal(numeric(),without);assert.equal(rayCalls,offRayCalls,'diagnostics must not issue extra rays');
  const key=KeoBim.st().res[0].key,p=copy(KeoBim.diagnosticPackage(key));
  assert.equal(p.evidence.replay.state,'captured');assert.equal(p.evidence.sideRays.state,'recorded');assert.ok(p.evidence.sideRays.rayCount>0);
  assert.equal(p.evidence.sourceGeometry.state,'unverified');assert.equal(p.evidence.openingSources.state,'recorded');assert.equal(p.evidence.lanternSources.state,'recorded');
  assert.ok(p.rays.filter(r=>r.key===key&&r.callback==='shade'&&r.hit).every(r=>r.hit.element.c==='Revit Roofs'&&r.hit.modelMatchesAnalyzed===true));
  assert.equal(p.probes.filter(x=>x.key===key&&x.kind==='overhangSource').length,p.evidence.sideRays.shadeCalls);
  assert.ok(p.probes.filter(x=>x.key===key).every(x=>p.room.calls[x.callIndex].name==='shade'&&x.value.openingIds.length));
  const replay=KeoBim.replayDiagnostic(p);assert.equal(replay.matches,true);assert.equal(replay.rayExtractionReplayed,false);assert.equal(replay.geometryVerified,false);
  const identical=KeoBim.compareDiagnostics(p,copy(p));assert.ok(Object.values(identical.sections).every(x=>x.equal));assert.equal(identical.sourceRevisionVerified,false);assert.equal(identical.scopeStatus.state,'incomplete');
  const withDoors=copy(p);withDoors.level.sources.doors=[[[0,0],[1,0]]];withDoors.level.sources.doorEntries=[{provenance:{dbId:'synthetic-door'}}];assert.equal(D.evidence(withDoors).boundarySources.state,'recorded');
  withDoors.level.sources.doorEntries[0].provenance.dbId=null;assert.ok(D.evidence(withDoors).boundarySources.missingCollections.includes('doors'));
  delete withDoors.level.sources.doorEntries;assert.ok(D.evidence(withDoors).boundarySources.missingCollections.includes('doors'));
  const differentRuntime=copy(p);differentRuntime.model.runtime='synthetic other runtime';assert.equal(KeoBim.compareDiagnostics(p,differentRuntime).sections.environment.equal,false);
  const manyChanges=copy(p);manyChanges.room.input.openings=Array.from({length:100},(_,i)=>({id:'synthetic-'+i}));const bounded=KeoBim.compareDiagnostics(p,manyChanges).sections.inputs;assert.equal(bounded.equal,false);assert.ok(bounded.differences.length<=40);
  // Same geometric/calculator inputs, different ray visibility -> changed canopy and side contribution.
  limit=2.7;await KeoBim.run();const deeper=copy(KeoBim.diagnosticPackage(key)),changed=KeoBim.compareDiagnostics(p,deeper);
  assert.equal(changed.sections.inputs.equal,true);assert.equal(changed.sections.sideStates.equal,false);assert.equal(changed.sections.contributions.equal,false);assert.equal(changed.sections.rayRequests.equal,false);assert.equal(changed.sections.probeSources.equal,true);
  assert.ok(changed.sections.sideStates.differences.some(d=>d.path.includes('kDepth')));
  // Same requests and accepted extent, changed sub-threshold hit distance: do not invent an output change.
  distance=1.1;await KeoBim.run();const otherDistance=copy(KeoBim.diagnosticPackage(key)),changedHit=KeoBim.compareDiagnostics(deeper,otherDistance);
  assert.equal(changedHit.sections.rayRequests.equal,true);assert.equal(changedHit.sections.rayAnswers.equal,false);assert.equal(changedHit.sections.sideStates.equal,true);assert.equal(changedHit.sections.contributions.equal,true);
  const noRays=copy(p);noRays.rays=[];assert.equal(D.evidence(noRays).sideRays.state,'incomplete');
  assert.equal(KeoBim.replayDiagnostic(noRays).matches,true,'adapter replay intentionally does not verify ray extraction');assert.equal(KeoBim.replayDiagnostic(noRays).rayExtractionReplayed,false);
  const wrongShade=copy(p);wrongShade.room.calls.find(c=>c.name==='shade').value.kDepth+=.5;assert.equal(KeoBim.replayDiagnostic(wrongShade).matches,false);
  assert.equal(KeoBim.compareDiagnostics(p,wrongShade).sections.callbackTrace.equal,false);
  for(const mutate of [q=>delete q.room.input.env.pts,q=>delete q.room.input.env.rows,q=>delete q.room.result,q=>delete q.room.calls,q=>q.room.callbacks={},q=>q.room.callbacks=['KEO'],q=>q.room.calls[0]={name:'shade',args:[],value:1,error:{name:'Error',message:'ambiguous'}}]){
   const broken=copy(p);mutate(broken);assert.equal(D.evidence(broken).replay.state,'incomplete');assert.throws(()=>KeoBim.replayDiagnostic(broken),/complete replay/);
  }
  const reordered=copy(p);[reordered.room.calls[0],reordered.room.calls[1]]=[reordered.room.calls[1],reordered.room.calls[0]];assert.throws(()=>KeoBim.replayDiagnostic(reordered),/callback/);
  // Missing snapshots are exportable as explicitly incomplete, while original work still runs once.
  const rec=D.create(true,p.algorithm),cycle={};cycle.self=cycle;let invoked=0;
  assert.equal(rec.capture({key:'cycle',level:'L'},cycle,[],[],{},()=>++invoked),1);assert.equal(invoked,1);const partial=rec.packet('cycle');assert.equal(partial.evidence.replay.state,'incomplete');assert.equal(partial.evidence.boundarySources.state,'unavailable');
  assert.ok(partial.errorEvents.some(x=>x.kind==='inputSnapshot'));
  assert.doesNotThrow(()=>rec.setCatalog({get info(){throw Error('synthetic unreadable catalog metadata')}}));assert.ok(rec.packet('cycle').errorEvents.some(x=>x.kind==='catalogSnapshot'));
  // Ray API exceptions retain the original error object and exactly one API call.
  const realRay=NOP_VIEWER.impl.rayIntersect;
  for(const err of [Error('synthetic ray failure'),null,undefined,0,'synthetic primitive failure'])for(const enabled of [false,true]){
   const d=D.create(enabled,p.algorithm),c={v:NOP_VIEWER,m:NOP_VIEWER.model,S:1,diagnostics:d};let count=0;
   NOP_VIEWER.impl.rayIntersect=()=>{count++;throw err};
   let caught=false;try{d.capture({key:'ray-error',level:'L'},{rooms:[]},[],[],{settings:{},pts:[],rows:[],shade:()=>productionOverhang(c,{c:[0,0],nin:[0,1],dOut:0},3)},e=>e.shade())}catch(e){caught=true;assert.ok(Object.is(e,err))}assert.equal(caught,true);
   assert.equal(count,1);if(enabled){const ep=d.packet('ray-error');assert.equal(ep.rays[0].error.message,err?.message ?? String(err));assert.equal(ep.rays[0].hit,null);assert.equal(ep.evidence.sideRays.failedRayCount,1);assert.equal(ep.evidence.replay.outcome,'thrown');assert.equal(D.replay(ep,{algorithm:p.algorithm,BimCalc:{space:(s,o,l,e)=>e.shade()}}).matches,true);}
   for(const asyncMode of [false,true]){let caught=false;try{if(asyncMode)await d.measureAsync('synthetic-error',async()=>{throw err});else d.measure('synthetic-error',()=>{throw err})}catch(e){caught=true;assert.ok(Object.is(e,err))}assert.equal(caught,true)}
  }
  // A failed logger cannot change the original overhang result or imply empty/clear rays.
  const d=D.create(true,p.algorithm),c={v:NOP_VIEWER,m:NOP_VIEWER.model,S:1,diagnostics:d};
  NOP_VIEWER.impl.rayIntersect=()=>({distance:1,get dbId(){throw Error('synthetic unreadable hit metadata')}});
  const depth=d.capture({key:'log-error',level:'L'},{rooms:[]},[],[],{settings:{},pts:[],rows:[],shade:()=>productionOverhang(c,{c:[0,0],nin:[0,1],dOut:0},3)},e=>e.shade());
  assert.ok(depth>3.9);assert.equal(d.packet('log-error').evidence.sideRays.state,'incomplete');assert.ok(d.packet('log-error').errorEvents.some(x=>x.kind==='raySnapshot'));
  NOP_VIEWER.impl.rayIntersect=realRay;
  window.auditPackets=[p,deeper];
  // User-visible opt-in performs the same full run; no console setup or persisted coefficient changes.
  const control={checked:false},root={querySelector:()=>control};KeoBim._bindDiagnosticMode(root);
  control.checked=false;await control.onchange();assert.throws(()=>KeoBim.diagnosticPackage(key),/не включена/);assert.equal(KeoBim.S.diagnostics,undefined);
  control.checked=true;await control.onchange();assert.equal(KeoBim.diagnosticPackage(key).evidence.replay.state,'captured');assert.match(KeoBim._settingsHTML(),/data-diagnostic-mode checked/);
  assert.equal(JSON.stringify(JSON.parse(localStorage.getItem('keo-bim:decisions:test-purpose:A'))).includes('diagnostics'),false);
  KeoBim.st().busy=true;control.checked=false;control.onchange();assert.equal(control.checked,true);KeoBim.st().busy=false;
  NOP_VIEWER.model=makeModel('audit:switched');control.checked=false;control.onchange();assert.equal(control.checked,true);
 })()`,context);
 const os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'keo-audit-'));
 try{const files=context.auditPackets.map((p,i)=>{const file=path.join(dir,i+'.json');fs.writeFileSync(file,JSON.stringify(p));return file});
  const diff=JSON.parse(cp.execFileSync(process.execPath,[__dirname+'/compare-diagnostics.js',...files],{encoding:'utf8'}));assert.equal(diff.sections.inputs.equal,true);assert.equal(diff.sections.contributions.equal,false);
 }finally{fs.rmSync(dir,{recursive:true});}
 console.log('PASS diagnostic audit: real ray-call parity; source/probe linkage; partial and corrupt snapshots; callback/result mismatch; ray errors and logger failures; comparison CLI; explicit UI opt-in');
})().catch(e=>{console.error(e);process.exitCode=1});
