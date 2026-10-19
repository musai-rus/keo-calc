/* A fresh profile must explain why zero KEO results were produced. No Viewer/network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scripts=[...fs.readFileSync(__dirname+'/test-purpose.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const context=vm.createContext({assert,console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},performance});context.window=context;
const status={textContent:''};context.document={querySelector:()=>({}),getElementById:id=>id==='kb-status'?status:null,body:{contains:()=>true}};
const storage=new Map();context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
require('./fixture-binding-dom.js')(context);
vm.runInContext(scripts[0],context);
let bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8');
bundle=bundle.replace('  return { run, st: () => st, S,','  mount=()=>{ui={remove(){},querySelector:s=>document.getElementById(s.slice(1))}};draw=()=>{};renderList=()=>{};\n  return { _climateHTML:climateHTML, _bindSettings:bindSettings, run, st: () => st, S,');
vm.runInContext(bundle,context);vm.runInContext(scripts[1].split('const log=document.querySelector')[0],context);context.statusElement=status;
(async()=>{
 await vm.runInContext(`(async()=>{
  const allOpenings=G.openings;const supportedOpenings=(...a)=>allOpenings(...a).filter(o=>o.roof||o.c[0]===3);G.openings=supportedOpenings;
  await KeoBim.run();assert.equal(KeoBim.st().res.filter(r=>r.kind==='calc').length,0);
  assert.match(statusElement.textContent,/КЕО не рассчитан.*регион/);assert.equal(statusElement.textContent.includes('Готово'),false);
  assert.match(KeoBim._climateHTML(),/data-a="climate"/);assert.match(KeoBim._climateHTML(),/инкогнито/);
  await KeoBim.setBuildingGroup('');assert.match(statusElement.textContent,/КЕО не рассчитан.*регион/);assert.equal(statusElement.textContent.startsWith('Пересчёт завершён'),false);
  const region={dataset:{s:'region'},value:'',type:'select-one'},groupInput={dataset:{s:'group'},value:'',type:'number'};
  KeoBim._bindSettings({querySelectorAll:()=>[region,groupInput],querySelector:s=>s.includes('region')?region:s.includes('group')?groupInput:{}});
  region.value='Краснодарский край';region.onchange();assert.ok(KeoBim.st().res.some(r=>r.kind==='calc'));assert.match(statusElement.textContent,/Пересчёт завершён: рассчитано пространств — [1-9]/);
  assert.equal(KeoBim._climateHTML().includes('data-a="climate"'),false);const results=()=>JSON.stringify(KeoBim.st().res.map(r=>r.comb?.eAvgR??r.C?.res?.eFinal));const initial=results();
  await KeoBim.run();assert.equal(results(),initial);assert.match(statusElement.textContent,/Готово.*рассчитано пространств — [1-9]/);
  // A newly loaded bookmark has an explicit region even when storage says Moscow.
  await KeoBim.run({region:'г. Москва'});assert.equal(KeoBim.S.group,1);
  KeoBim.st().model=null;
  await KeoBim.run({region:'Краснодарский край'});assert.equal(KeoBim.S.region,'Краснодарский край');assert.equal(KeoBim.S.group,5);assert.equal(results(),initial);
  await KeoBim.run();assert.equal(KeoBim.S.group,5);assert.equal(results(),initial);
  KeoBim.st().model=null;await KeoBim.run();assert.equal(KeoBim.S.group,5);
  await KeoBim.run({region:'Unknown region',group:5});assert.equal(KeoBim.S.group,null);assert.match(statusElement.textContent,/КЕО не рассчитан.*регион/);
  await KeoBim.run({region:'Краснодарский край'});
  G.openings=allOpenings;await KeoBim.run();assert.match(statusElement.textContent,/КЕО не рассчитан.*Недостаточно данных/);assert.equal(statusElement.textContent.includes('Готово'),false);G.openings=supportedOpenings;
  // Incognito/new model/profile has no inherited climate choice.
  NOP_VIEWER.model=makeModel('test-purpose:fresh-profile');await KeoBim.run();assert.match(statusElement.textContent,/КЕО не рассчитан.*регион/);
  await KeoBim.run({region:'г. Москва'});
  const oldRooms=G.rooms;G.rooms=async()=>[];await KeoBim.run();assert.match(statusElement.textContent,/помещения Revit не получены/);assert.equal(statusElement.textContent.includes('Готово'),false);G.rooms=oldRooms;
  const oldAec=Autodesk.Viewing.Document.getAecModelData;Autodesk.Viewing.Document.getAecModelData=async()=>({levels:[]});await KeoBim.run();assert.match(statusElement.textContent,/не сопоставлены с уровнями/);Autodesk.Viewing.Document.getAecModelData=oldAec;
  const oldOpenings=G.openings;G.openings=()=>[];await KeoBim.run();assert.match(statusElement.textContent,/нет пространств с подтверждёнными световыми проёмами/);G.openings=oldOpenings;
  const oldSpace=Cc.space;Cc.space=()=>({err:'Synthetic unsupported input'});await KeoBim.run();assert.match(statusElement.textContent,/КЕО не рассчитан.*Synthetic unsupported input/);
  await KeoBim.setBuildingGroup('');assert.match(statusElement.textContent,/КЕО не рассчитан.*Synthetic unsupported input/);Cc.space=oldSpace;
 })()`,context);
 console.log('OK: fresh-profile zero reason; user region change and persisted rerun; new-profile separation; missing Rooms/levels/openings; calculation errors; no false success');
})().catch(e=>{console.error(e);process.exitCode=1});
