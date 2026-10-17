/* Universal replay/non-interference regressions. Synthetic data only, no model IDs. */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const html=fs.readFileSync(__dirname+'/test-purpose.html','utf8'), scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const context=vm.createContext({console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},performance,assert});context.window=context;
const statusElement={textContent:''};context.document={querySelector:()=>({}),getElementById:id=>id==='kb-status'?statusElement:null,body:{contains:()=>true}};
const storage=new Map();context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
vm.runInContext(scripts[0],context);
let bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8');
bundle=bundle.replace('  return { run, st: () => st, S,','  mount=()=>{ui={remove(){}}};draw=()=>{};renderList=()=>{};\n  return { _detail:renderDetail, run, st: () => st, S,');
vm.runInContext(bundle,context);vm.runInContext(scripts[1].split('const log=document.querySelector')[0],context);
(async()=>{
 await vm.runInContext(`(async()=>{
  const D=KeoBimLib.BimDiagnostics, cc=KeoBimLib.BimCalc;
  const snapshot=()=>JSON.stringify(stableResults());
  function stableResults(){return KeoBim.st().res.map(r=>({key:r.key,kind:r.kind,row:r.row,mode:r.mode,st:r.st,C:r.C,comb:r.comb,geo:r.geo,pts:r.pts,A:r.A,notes:r.notes,section:r.section}));}
  let shadeCalls=0,depth=1.2;G.overhang=()=>{shadeCalls++;return depth};
  const inputs=G.openings;const cases=[['combined',()=>inputs()],['side',()=>inputs().filter(x=>!x.roof)],['top',()=>inputs().filter(x=>x.roof)]];
  for(const [name,openings] of cases){
   G.openings=openings;shadeCalls=0;await KeoBim.run({diagnostics:false,region:'г. Москва'});const before=snapshot(),calls=shadeCalls;
   assert.throws(()=>KeoBim.diagnosticPackage(),/Диагностика/);
   shadeCalls=0;await KeoBim.run({diagnostics:true});assert.equal(snapshot(),before,name+' unchanged by diagnostics');assert.equal(shadeCalls,calls,'no additional shade queries');
   assert.equal(KeoBim.S.diagnostics,undefined,'mode not persisted in calculation settings');
   for(const r of KeoBim.st().res){
    const packet=JSON.parse(JSON.stringify(KeoBim.diagnosticPackage(r.key)));
    if(!window.syntheticDiagnostic)window.syntheticDiagnostic=packet;
    assert.equal(packet.schema,D.SCHEMA);assert.match(packet.algorithm.sha256,/^[a-f0-9]{64}$/);
    assert.equal(packet.model.exactSourceRevision,null);assert.equal(packet.model.urn,'test-purpose:A');
    assert.equal(packet.level.sources.nativeRoomBoundaries.status,'unavailable');
    assert.ok(packet.level.sources.physical.length);assert.ok(packet.room.binding.contourRuns.length);
    assert.ok(packet.room.input.openings.every(x=>x.source.status==='unavailable'));
    assert.ok(packet.phases.some(p=>p.phase==='roomCalculation'&&Number.isFinite(p.ms)));
    assert.ok(packet.phases.some(p=>p.phase==='roomMatching'));
    const beforeReplay=shadeCalls;
    for(let repeat=0;repeat<3;repeat++)assert.equal(KeoBim.replayDiagnostic(packet).matches,true,name+' replay');
    const realDate=Date;window.Date=class extends realDate {toLocaleDateString(){return 'other day'}};
    assert.equal(KeoBim.replayDiagnostic(packet).matches,true,'report date also replayed');window.Date=realDate;
    assert.equal(shadeCalls,beforeReplay,'replay must not call Viewer/shade');
    const corrupted=JSON.parse(JSON.stringify(packet));corrupted.algorithm.sha256='old-algorithm';assert.throws(()=>KeoBim.replayDiagnostic(corrupted),/version mismatch/);
    if(packet.room.calls.length){const missing=JSON.parse(JSON.stringify(packet));missing.room.calls.shift();assert.throws(()=>KeoBim.replayDiagnostic(missing),/callback/);}
    if(name==='combined')assert.ok(packet.room.result.comb.sideAt.every(x=>x.st.side.walls.length),'all point-wise side states retained');
    const snap=JSON.stringify(packet.room);r.st.rho=.1;assert.equal(JSON.stringify(packet.room),snap,'detached packet');
   }
   await KeoBim.run({diagnostics:true});const p1=KeoBim.diagnosticPackage(KeoBim.st().res[0].key);
   await KeoBim.run();const p2=KeoBim.diagnosticPackage(KeoBim.st().res[0].key);
   assert.equal(JSON.stringify(p1.room.input),JSON.stringify(p2.room.input),'identical ordered input');
   assert.equal(JSON.stringify(p1.room.result),JSON.stringify(p2.room.result),'stable repeat result');
   assert.equal(JSON.stringify(p1.room.calls),JSON.stringify(p2.room.calls),'stable callback trace');
  }
  G.openings=inputs;
  await KeoBim.run({diagnostics:true});const small=KeoBim.diagnosticPackage(KeoBim.st().res[0].key),low=snapshot();
  depth=2.2;await KeoBim.run();const large=KeoBim.diagnosticPackage(KeoBim.st().res[0].key),high=snapshot();
  assert.notEqual(low,high,'changed measured shading is a changed input, not same-input nondeterminism');
  assert.equal(KeoBim.replayDiagnostic(small).matches,true);assert.equal(KeoBim.replayDiagnostic(large).matches,true);
  assert.ok(small.room.result.comb.sideAt.every(x=>x.st.side.walls.every(w=>w.kDepth===1.2)));
  assert.ok(large.room.result.comb.sideAt.every(x=>x.st.side.walls.every(w=>w.kDepth===2.2)));
  const first=KeoBim.st().res[0].key;await KeoBim.setBuildingGroup('');const rebuilt=KeoBim.diagnosticPackage(first);
  assert.equal(rebuilt.runKind,'rebuild');assert.equal(KeoBim.replayDiagnostic(rebuilt).matches,true);
  assert.equal(rebuilt.phases.some(p=>p.phase==='physicalSlice'),false,'rebuild does not invent extraction timings');
  await KeoBim.run({diagnostics:false});assert.throws(()=>KeoBim.diagnosticPackage(first),/не включена/);
  await KeoBim.run({diagnostics:true});KeoBim.st().dirty=true;assert.throws(()=>KeoBim.diagnosticPackage(first),/пересчёт/);KeoBim.st().dirty=false;
  NOP_VIEWER.model=makeModel('test-purpose:changed');assert.throws(()=>KeoBim.diagnosticPackage(first),/Модель изменилась/);
  // Recorder itself must propagate calculation errors and survive a broken clock.
  const rec=D.create(true,null,()=>{throw Error('clock unavailable')});let calculated=0;
  assert.equal(rec.measure('stage',()=>++calculated),1);assert.equal(calculated,1);
  assert.throws(()=>rec.measure('stage',()=>{throw Error('calculation failure')}),/calculation failure/);
  assert.ok(rec.summary().errors.includes('clock unavailable'));
  const bad={};bad.self=bad;const fallback=D.create(true);let invoked=0;
  assert.equal(fallback.capture({key:'cycle',level:'synthetic'},bad,[],[],{},()=>++invoked),1);assert.equal(invoked,1);
  assert.ok(fallback.summary().errors.some(s=>s.includes('Cyclic')));
  const failingRecorder=D.create(true,small.algorithm),cyclic={};cyclic.self=cyclic;
  assert.equal(failingRecorder.capture({key:'unserializable',level:'L'}, {},[],[],{shade:()=>cyclic},e=>{assert.equal(e.shade(),cyclic);return 7}),7);
  assert.throws(()=>KeoBim.replayDiagnostic(failingRecorder.packet('unserializable')),/complete replay/);
  const sourceRecorder=D.create(true),vertex={decoder:'synthetic-decoder',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,5,6,0,1]},sources={physical:[[0,0,1,0]],physicalEntries:[{bounds:null,provenance:{dbId:'source-wall',fragment:5,vertices:[vertex,vertex,vertex]}}],doors:[],doorEntries:[],roomSeparation:[],roomSeparationEntries:[]};
  const sourceBefore=JSON.stringify(sources);sourceRecorder.captureLevel({name:'L',floor:0,top:4,R:{cell:.1,minx:0,miny:0,W:10,H:10},boundaryPrecision:{complete:false,reconstruction:'unknown',entries:sources.physicalEntries}},sources);
  sourceRecorder.captureUnavailable({key:'no-boundary',level:'L'},'Unmatched');const preserved=sourceRecorder.packet('no-boundary');assert.equal(JSON.stringify(sources),sourceBefore);
  assert.equal(preserved.level.sources.vertexSources.length,1);assert.equal(preserved.level.sources.physicalEntries[0].provenance.dbId,'source-wall');
  assert.equal(JSON.stringify(preserved.level.sources.physicalEntries[0].provenance.vertexSourceIndices),'[0,0,0]');assert.equal(JSON.stringify(preserved.level.sources.vertexSources[0]),JSON.stringify(vertex));
  rec.captureUnavailable({key:'unmatched',level:'L01'},'No room boundary');const missing=JSON.parse(JSON.stringify(rec.packet('unmatched')));
  assert.equal(missing.room.availability,'not-calculated');assert.throws(()=>KeoBim.replayDiagnostic(missing),/complete replay/);
  assert.throws(()=>KeoBim.replayDiagnostic({model:'legacy',spaces:[]}),/complete replay/,'legacy exports cannot pretend to reproduce geometry');
  // Near-parallel opening normals: the existing cluster chooses its first member's
  // basis. Reordering is a different adapter input; this witness does not establish
  // that such reordering occurred in any historical real-model run.
  const a={id:'arbitrary-a',c:[0,0],nin:[0,1],t:[-1,0],w:1,z0:1,z1:3,dIn:.1,dOut:.1,dst:.2},angle=2*Math.PI/180;
  const b={...a,id:'arbitrary-b',c:[.9,0],nin:[Math.sin(angle),Math.cos(angle)]};
  assert.notDeepEqual(cc.clusters([a,b])[0].nin,cc.clusters([b,a])[0].nin);
  // Same rectangular geometry, different directory purposes, several rotations:
  // check point provenance without real project room IDs or project dimensions.
  const libs=KeoBim.st().res[0].env;
  for(const angle of [0,Math.PI/6,Math.PI/2])for(const name of ['Групповая','Спальня']){
   const rotate=p=>[20+p[0]*Math.cos(angle)-p[1]*Math.sin(angle),30+p[0]*Math.sin(angle)+p[1]*Math.cos(angle)];
   const normal=[-Math.sin(angle),Math.cos(angle)],pts=[];for(let y=1;y<=8;y+=.5)for(let x=1;x<=7;x+=.5)pts.push(rotate([x,y]));
   const row=cc.mapNorm(name,libs.DATA.rooms,group('A57')),space={key:'purpose-fixture',rooms:[{key:'room-fixture',num:'arbitrary',name,h:3.6}]};
   const opening={id:'opening-fixture',cat:'Revit Windows',c:rotate([4,0]),t:[-normal[1],normal[0]],nin:normal,w:4,z0:.8,z1:3,dIn:.1,dOut:.1,dst:.2};
   const env={...libs,settings:{...libs.settings,bGroup:group('A57')},floor:0,pts,rows:[row],Rp:undefined,shortSection:undefined,north:0,shade:()=>({kDepth:0,blds:[]}),roomPts:undefined,containsPoint:undefined};
   const recorder=D.create(true,small.algorithm),out=recorder.capture({key:space.key,level:'synthetic'},space,[opening],[],env,e=>cc.space(space,[opening],[],e));
   assert.equal(out.row.rt,name==='Групповая'?'far1':'center');assert.ok(out.C.ok);
   assert.ok(Math.abs(out.st.side.walls[0].lt-libs.KEO.ltAuto(out.row.rt,out.st.side.walls[0].dp))<=.011);
   assert.equal(KeoBim.replayDiagnostic(JSON.parse(JSON.stringify(recorder.packet(space.key)))).matches,true);
  }
 })()`,context);
 const os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'keo-diagnostic-test-'));
 try{const file=path.join(dir,'synthetic.json');fs.writeFileSync(file,JSON.stringify(context.syntheticDiagnostic));const output=JSON.parse(cp.execFileSync(process.execPath,[__dirname+'/replay-diagnostic.js',file],{encoding:'utf8'}));assert.equal(output.matches,true);}finally{fs.rmSync(dir,{recursive:true});}
 // Production overhang loop with controlled Viewer ray responses; no geometry model or HTTP.
 class Vector {constructor(x,y,z){Object.assign(this,{x,y,z})}normalize(){const d=Math.hypot(this.x,this.y,this.z);this.x/=d;this.y/=d;this.z/=d;return this}}
 const THREE={Vector3:Vector,Ray:class {constructor(origin,direction){Object.assign(this,{origin,direction})}}};
 const geom=new Function('THREE',fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom;')(THREE);
 const D=new Function(fs.readFileSync(__dirname+'/diagnostics.js','utf8')+';return BimDiagnostics;')();
 for(const limit of [1.2,2.2]){
  const run=enabled=>{let calls=0;const d=D.create(enabled),C={S:1,diagnostics:d,v:{impl:{rayIntersect:(r,ignore)=>{calls++;assert.equal(ignore,false);return r.origin.x<=limit+1e-9?{distance:1,dbId:900,fragId:2}:null}}}};
   const value=d.capture({key:'arbitrary',level:'L'}, {},[],[],{},()=>geom.overhang(C,{c:[0,0],nin:[-1,0],dOut:0},4));
   return {value,calls,packet:enabled?d.packet('arbitrary'):null};};
  const off=run(false),on=run(true);assert.equal(off.value,on.value);assert.equal(off.calls,on.calls);assert.ok(Math.abs(on.value-limit)<1e-9);
  assert.equal(on.packet.rays.length,on.calls);assert.equal(on.packet.rays.at(-1).hit,null);assert.equal(on.packet.rays[0].hit.dbId,900);
 }
 console.log('OK: diagnostic off/on equivalence; side/top/combined replay; repeated identical inputs; per-point states; version/trace guards; lifecycle; single-call Viewer ray evidence; controlled canopy change');
})().catch(e=>{console.error(e);process.exitCode=1});
