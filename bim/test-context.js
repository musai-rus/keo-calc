/* Regression tests: clipping and explicit climate selection. Node >=18, no dependencies. */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const DATA = require('../data.js');
const G = new Function(fs.readFileSync(__dirname + '/geom.js', 'utf8') + ';return BimGeom;')();
const C = new Function(fs.readFileSync(__dirname + '/calc.js', 'utf8') + ';return BimCalc;')();
let total = 0;
function test(name, fn) { fn(); total++; console.log('OK ' + name); }
const plane = {x:0,y:0,z:1,w:-2};
function viewer(initial = []) { let cp = initial; return {areAllVisible:()=>true,getCutPlanes:()=>cp,setCutPlanes:p=>cp=p,impl:{getAllCutPlanes:()=>cp}}; }
test('Clipped and unclipped calculation see the same full geometry', () => {
 const v=viewer([plane]);const ray=()=>v.getCutPlanes().length?0:12;
 assert.equal(G.withFullModel(v,ray),12);assert.deepEqual(v.getCutPlanes(),[plane]);
 const u=viewer();assert.equal(G.withFullModel(u,()=>12),12);assert.deepEqual(u.getCutPlanes(),[]);
});
test('Exceptions restore the original section',()=>{const v=viewer([plane]);assert.throws(()=>G.withFullModel(v,()=>{throw Error('synthetic failure')}),/synthetic/);assert.deepEqual(v.getCutPlanes(),[plane]);});
test('Nested lantern calculations do not restore clipping before side shading',()=>{const v=viewer([plane]);G.withFullModel(v,()=>{G.withFullModel(v,()=>assert.equal(v.getCutPlanes().length,0));assert.equal(v.getCutPlanes().length,0)});assert.deepEqual(v.getCutPlanes(),[plane]);});
test('Unsupported extension clipping fails closed and restores display',()=>{const v=viewer([plane]);v.impl.getAllCutPlanes=()=>[plane];let called=false;assert.throws(()=>G.withFullModel(v,()=>called=true),/сечения/);assert.equal(called,false);assert.deepEqual(v.getCutPlanes(),[plane]);});
test('Missing visibility audit fails closed',()=>{let called=false;const v=viewer();delete v.areAllVisible;assert.throws(()=>G.withFullModel(v,()=>called=true),/проверку видимости/);assert.equal(called,false);});
test('Hidden and isolated geometry fails closed without changing display',()=>{
 for(const extra of [{getHiddenNodes:()=>[42]},{getIsolatedNodes:()=>[42]},{getAggregateHiddenNodes:()=>[{model:{},ids:[42]}]},{getAggregateIsolation:()=>[{model:{},ids:[42]}]},{areAllVisible:()=>false}]){
  const v=Object.assign(viewer([plane]),extra);let called=false;assert.throws(()=>G.withFullModel(v,()=>called=true),/скрыта или изолирована/);assert.equal(called,false);assert.deepEqual(v.getCutPlanes(),[plane]);
 }
});
test('Malformed visibility evidence is rejected',()=>{for(const val of [null,{},[{}]]){const v=viewer();v.getAggregateHiddenNodes=()=>val;assert.throws(()=>G.withFullModel(v,()=>1),/формат видимости/);}});
test('Silent section restoration failure invalidates the calculation',()=>{let cp=[plane];const v={areAllVisible:()=>true,getCutPlanes:()=>cp,setCutPlanes:p=>{if(!p.length)cp=[]},impl:{getAllCutPlanes:()=>cp}};assert.throws(()=>G.withFullModel(v,()=>42),/восстановить/);});
test('Empty initial section is restored if work changes it',()=>{const v=viewer();G.withFullModel(v,()=>v.setCutPlanes([plane]));assert.deepEqual(v.getCutPlanes(),[]);});
test('Region is unknown by default, including zero coordinates',()=>{for(const s of [{},{region:'',group:null},{latitude:0,longitude:0},{region:'Сириус',group:1}])assert.equal(C.climate(s,DATA.regions),null);});
test('Only existing directory mapping supplies the region group',()=>{const c=C.climate({region:'Краснодарский край',group:1},DATA.regions);assert.equal(c.group,5);assert.equal(c.source,'region');assert.equal(C.climate({region:'г. Москва'},DATA.regions).group,1);});
test('Explicit manual groups 1–5; invalid/empty/fractional values rejected',()=>{for(let group=1;group<=5;group++)assert.deepEqual(C.climate({group},DATA.regions),{region:'',group,source:'manual'});for(const group of [null,undefined,'','abc',NaN,Infinity,0,6,2.5,true,[1],{}])assert.equal(C.climate({group},DATA.regions),null);});
// Exercise the real app orchestration and actual BIM/KEO calculation. Only UI
// rendering is disabled; Viewer extraction uses the same two-floor synthetic
// geometry as test-purpose.html. This is not a real Autodesk/DOM/browser test.
const html=fs.readFileSync(__dirname+'/test-purpose.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const context=vm.createContext({console:{log(){},error(){}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},performance,assert});
context.window=context;
const statusElement={textContent:''};
context.document={querySelector:()=>({}),getElementById:id=>id==='kb-status'?statusElement:null,body:{contains:()=>true}};
context.statusElement=statusElement;
const storage=new Map();context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
require('./fixture-binding-dom.js')(context);
vm.runInContext(scripts[0],context);
let bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8');
bundle=bundle.replace('  return { run, st: () => st, S,', '  mount = () => { ui = { remove() {}, querySelector:s=>document.getElementById(s.slice(1)) }; }; draw = () => {}; renderList = () => {};\n  return { _exportJSON: exportJSON, _exportCSV: exportCSV, _roomDiagnosticData: roomDiagnosticData, _focusLantern: focusLantern, _exportOne: exportOne, _exportDec: exportDec, _status: status, _validateDec: validateDec, _bindSettings: bindSettings, run, st: () => st, S,');
bundle=bundle.replace(/  function download\(name, text, type\) \{[^\n]+\}/,'  function download(name, text, type) { window.capturedDownload = { name, text, type }; }');
vm.runInContext(bundle,context);
vm.runInContext(scripts[1].split('const log=document.querySelector')[0],context);
(async()=>{
 await vm.runInContext(`(async()=>{
  NOP_VIEWER.areAllVisible=()=>true;
  for(const d of[{merge:[null]},{merge:[],assign:[{at:[NaN,0],keys:['a']}]},{merge:[],lanterns:{a:'bad'}},{merge:[],normOv:{a:'obsolete'}}])assert.throws(()=>KeoBim._validateDec(d),/формат/);
  assert.equal(KeoBim._status({kind:'dark',lanPending:1}).t,'уточните тип фонаря');assert.equal(KeoBim._status({kind:'dark',lanPending:0}).t,'нет световых проёмов');
  G.location=async()=>[{source:'Revit Project Information',name:'Project Address',value:'Synthetic site'}, {source:'Revit Survey Point',name:'Latitude',value:'0'}];
  G.overhang=()=>{assert.equal(NOP_VIEWER.getCutPlanes().length,0);return 0.3};
  G.hitUpEl=()=>{assert.equal(NOP_VIEWER.getCutPlanes().length,0);return null};
  const cuts=[{x:0,y:0,z:1,w:-1.3}];NOP_VIEWER.setCutPlanes(cuts);
  await KeoBim.run();
  assert.equal(KeoBim.S.group,null);assert.ok(KeoBim.st().res.every(r=>r.kind==='err'&&/Регион/.test(r.err)));
  assert.equal(JSON.stringify(NOP_VIEWER.getCutPlanes()),JSON.stringify(cuts));
  await KeoBim.run({region:'г. Москва'});
  assert.ok(KeoBim.st().res.every(r=>r.kind==='calc'&&r.C.ok));
  const roomDiag=KeoBim._roomDiagnosticData();assert.equal(roomDiag.rooms.length,KeoBim.st().rooms.length);assert.equal(Object.values(roomDiag.counts.placement).reduce((a,b)=>a+b,0),roomDiag.rooms.length);assert.deepEqual(Object.keys(roomDiag.unplacedReasons),[]);
  const actual=KeoBim.st().res[0];assert.equal(actual.env.containsPoint(actual.env.pts[0]),true);assert.equal(actual.env.containsPoint([1e9,1e9]),false);
  const blocked={kind:'err',level:'L01',key:'unsupported-fixture',rooms:[{key:'synthetic-room',num:'synthetic',name:'Synthetic unsupported room'}],err:'Unsupported synthetic section',notes:['Unsupported synthetic section']};
  KeoBim.st().res.push(blocked);KeoBim._exportJSON();const exported=JSON.parse(capturedDownload.text);assert.equal(exported.calculationErrors.length,1);assert.equal(exported.calculationErrors[0].error,blocked.err);assert.equal(exported.spaces.some(r=>r.rooms.some(rm=>rm.key==='synthetic-room')),false);assert.equal(exported.calculationErrors[0].state,undefined);assert.equal(exported.calculationErrors[0].pass,undefined);
  KeoBim._exportCSV();const csvLine=capturedDownload.text.split('\\r\\n').find(l=>l.includes('Synthetic unsupported room'));assert.ok(csvLine.includes('"";"";"Unsupported synthetic section"'));assert.equal(csvLine.includes('соответствует'),false);KeoBim.st().res.pop();
  const result=()=>JSON.stringify(KeoBim.st().res.map(r=>({key:r.key,e:r.comb?.eAvgR??r.C?.res?.eFinal,side:r.comb?.eSide,top:r.comb?.eTop})));
  const initial=result();
  assert.equal(KeoBim.st().res[0].st.groupManual,false);
  await KeoBim.setBuildingGroup(group('A108'));
  await KeoBim.setBuildingGroup('');assert.equal(result(),initial);
  assert.equal(JSON.stringify(NOP_VIEWER.getCutPlanes()),JSON.stringify(cuts));
  NOP_VIEWER.setCutPlanes([]);await KeoBim.setBuildingGroup('');assert.equal(result(),initial);
  NOP_VIEWER.setCutPlanes(cuts);await KeoBim.run();assert.equal(result(),initial);
  assert.equal(JSON.stringify(NOP_VIEWER.getCutPlanes()),JSON.stringify(cuts));
  NOP_VIEWER.model=makeModel('test-purpose:another');await KeoBim.run();assert.equal(KeoBim.S.group,null);
  NOP_VIEWER.model=makeModel('test-purpose:A');await KeoBim.run();assert.equal(KeoBim.S.region,'г. Москва');assert.equal(result(),initial);
  const saved=localStorage.getItem('keo-bim:decisions:test-purpose:A');assert.equal(JSON.parse(saved).climate.source,'region');
  // Invalid region cannot silently fall back to inherited group 1.
  await KeoBim.run({region:'Unknown site'});assert.ok(KeoBim.st().res.every(r=>r.kind==='err'));
  await KeoBim.run({region:'',group:5});assert.ok(KeoBim.st().res.every(r=>r.C.ok&&r.st.group===5&&r.st.groupManual));
  assert.equal(JSON.stringify(NOP_VIEWER.getCutPlanes()),JSON.stringify(cuts));
  const oldCatalog=G.catalog;G.catalog=async()=>{throw Error('catalog failed')};await KeoBim.run();
  assert.equal(JSON.stringify(NOP_VIEWER.getCutPlanes()),JSON.stringify(cuts));assert.equal(KeoBim.st().res.length,0);G.catalog=oldCatalog;
  await KeoBim.run({region:'г. Москва'});
  NOP_VIEWER.impl.getAllCutPlanes=()=>cuts;await KeoBim.run();assert.equal(KeoBim.st().res.length,0);delete NOP_VIEWER.impl.getAllCutPlanes;
  localStorage.setItem('keo-bim:decisions:test-purpose:cleared',JSON.stringify({merge:[],climate:null}));
  NOP_VIEWER.model=makeModel('test-purpose:cleared');await KeoBim.run({region:'г. Москва',group:1});assert.equal(KeoBim.S.group,null);
  assert.ok(KeoBim.st().res.every(r=>r.kind==='err'));
  const regionInput={dataset:{s:'region'},value:'',type:'select-one'}, groupInput={dataset:{s:'group'},value:'',type:'number'}, rerun={};
  const controls={querySelectorAll:()=>[regionInput,groupInput],querySelector:s=>s.includes('region')?regionInput:s.includes('group')?groupInput:rerun};
  KeoBim._bindSettings(controls);
  regionInput.value='Краснодарский край';regionInput.onchange();assert.equal(KeoBim.S.group,5);assert.equal(KeoBim.st().res[0].st.groupManual,false);
  assert.ok(statusElement.textContent.includes('рассчитано пространств — '+KeoBim.st().res.filter(r=>r.kind==='calc').length));
  groupInput.value='2';groupInput.onchange();assert.equal(KeoBim.S.region,'');assert.equal(KeoBim.st().res[0].st.group,2);
  groupInput.value='2.5';groupInput.onchange();assert.ok(KeoBim.st().res.every(r=>r.kind==='err'));
  groupInput.value='1';groupInput.onchange();assert.ok(KeoBim.st().res.every(r=>r.C.ok));
  await KeoBim.run({northDeg:'32,6'});assert.equal(KeoBim.st().north.rot,32.6);
  const currentModel=NOP_VIEWER.model;NOP_VIEWER.model=makeModel('test-purpose:north-new');await KeoBim.run({region:'г. Москва'});assert.equal(Math.abs(KeoBim.st().north.rot),0);
  NOP_VIEWER.model=currentModel;await KeoBim.run();assert.equal(KeoBim.st().north.rot,32.6);
  assert.equal(JSON.parse(localStorage.getItem('keo-bim:decisions:test-purpose:cleared')).northDeg,'32,6');
  await KeoBim.run({northDeg:'Infinity'});assert.equal(KeoBim.st().res.length,0);
  await KeoBim.run({northDeg:'   '});assert.equal(Math.abs(KeoBim.st().north.rot),0);
  const getAec=Autodesk.Viewing.Document.getAecModelData;Autodesk.Viewing.Document.getAecModelData=async(...args)=>({...await getAec(...args),refPointTransformation:[Infinity,1,0,0,1]});
  await KeoBim.run();assert.equal(KeoBim.st().north.unknown,true);assert.equal(KeoBim.st().north.rot,0);Autodesk.Viewing.Document.getAecModelData=getAec;
  const northInput={dataset:{s:'northDeg'},value:'oops',type:'text'}, other={dataset:{s:'rho'},value:'.2',type:'number'};
  KeoBim._bindSettings({querySelectorAll:()=>[northInput,other],querySelector:()=>({})});northInput.onchange();assert.equal(KeoBim.st().res.length,0);
  await assert.rejects(()=>KeoBim.setBuildingGroup(''),/полный пересчёт/);assert.equal(KeoBim.st().res.length,0);
  await KeoBim.run({northDeg:'0'});assert.ok(KeoBim.st().res.every(r=>r.C.ok));
  assert.throws(()=>KeoBim._exportOne({}),/Результат устарел/);
  const setCuts=NOP_VIEWER.setCutPlanes;NOP_VIEWER.setCutPlanes(cuts);NOP_VIEWER.setCutPlanes=p=>{if(!p.length)setCuts(p)};regionInput.value='Краснодарский край';regionInput.onchange();assert.equal(KeoBim.st().res.length,0);assert.ok(/восстановить/.test(statusElement.textContent));assert.equal(KeoBim.st().dirty,true);assert.equal(KeoBim._roomDiagnosticData().available,false);assert.deepEqual(KeoBim._roomDiagnosticData().unplacedReasons,{});assert.throws(()=>KeoBim._exportDec(),/полный пересчёт/);assert.throws(()=>KeoBim._exportJSON(),/полный пересчёт/);NOP_VIEWER.setCutPlanes=setCuts;setCuts(cuts);await KeoBim.run({region:'г. Москва'});groupInput.value='1';groupInput.onchange();
  const normKey=KeoBim.st().res[0].key;KeoBim.st().normOv[normKey]='obsolete-id';await KeoBim.setBuildingGroup('');assert.equal(KeoBim.st().res.length,0);
  delete KeoBim.st().normOv[normKey];await KeoBim.run();assert.ok(KeoBim.st().res.every(r=>r.C.ok));
  other.onchange();assert.equal(KeoBim.st().res.length,0);assert.equal(KeoBim.st().dirty,true);assert.throws(()=>KeoBim.decide('split',['synthetic']),/полный пересчёт/);
  await KeoBim.run();assert.equal(KeoBim.st().dirty,false);assert.ok(KeoBim.st().res.every(r=>r.st.rho===.2));
  let resume;G.catalog=()=>new Promise(r=>resume=r);const pending=KeoBim.run();
  const beforeDec=JSON.stringify(KeoBim.st().dec);KeoBim.decide('split',['synthetic']);assert.equal(JSON.stringify(KeoBim.st().dec),beforeDec);
  regionInput.value='Краснодарский край';regionInput.onchange();assert.equal(KeoBim.S.group,1);assert.equal(KeoBim.S.region,'');
  resume({byCat:{},info:{}});await pending;G.catalog=oldCatalog;
  NOP_VIEWER.model=makeModel('test-purpose:unanalysed');groupInput.value='5';groupInput.onchange();assert.equal(KeoBim.S.group,1);
  assert.throws(()=>KeoBim._focusLantern(1),/Модель изменилась/);assert.throws(()=>KeoBim._exportOne({}),/Модель изменилась/);assert.throws(()=>KeoBim._exportDec(),/Модель изменилась/);
  assert.throws(()=>KeoBim.planView('L01'),/Модель изменилась/);assert.throws(()=>KeoBim.select({}),/Модель изменилась/);
  assert.throws(()=>KeoBim.decide('split',['synthetic']),/Модель изменилась/);assert.equal(JSON.stringify(KeoBim.st().dec),beforeDec);
  let release;G.catalog=()=>new Promise(r=>release=r);const switched=KeoBim.run();NOP_VIEWER.model=makeModel('test-purpose:switch-during-analysis');release({byCat:{},info:{}});await switched;assert.equal(KeoBim.st().res.length,0);G.catalog=oldCatalog;
  G.catalog=async()=>{throw Error('new model catalog failure')};await KeoBim.run();G.catalog=oldCatalog;
  assert.equal(KeoBim.st().levels.length,0);assert.equal(KeoBim.st().dirty,true);groupInput.value='1';groupInput.onchange();assert.equal(KeoBim.st().res.length,0);
  assert.throws(()=>KeoBim.decide('split',['synthetic']),/полный пересчёт/);
  let finishClosed;G.catalog=()=>new Promise(r=>finishClosed=r);const closing=KeoBim.run();KeoBim.destroy();finishClosed({byCat:{},info:{}});await closing;assert.equal(KeoBim.st().res.length,0);G.catalog=oldCatalog;
  KeoBim.destroy();assert.equal(JSON.stringify(NOP_VIEWER.getCutPlanes()),JSON.stringify(cuts));
 })()`,context);
 total++;console.log('OK Real app/engine: two floors, unknown region, clipped/full/repeated recalculation, per-model climate, failure/close restoration');
 console.log(`${total}/${total} test groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
