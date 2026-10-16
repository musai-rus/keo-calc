/* Actual app/engine persistence, reset and invalidation; synthetic Viewer, no DOM claim. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const scripts=[...fs.readFileSync(__dirname+'/test-purpose.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const storage=new Map(),context=vm.createContext({console:{log(){},error(){}},performance,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},assert});context.window=context;
context.document={querySelector:()=>({}),querySelectorAll:()=>[],getElementById:()=>null,body:{contains:()=>true}};
context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
vm.runInContext(scripts[0],context);
let source=fs.readFileSync(__dirname+'/keo-bim.js','utf8').replace('  return { run, st: () => st, S,','  mount=()=>{ui={remove(){}};};draw=()=>{};renderList=()=>{};\n  return {_html:shortSectionHTML,_bind:bindShortSection,_json:exportJSON,_csv:exportCSV,_one:exportOne,_dec:exportDec, run, st: () => st, S,');
source=source.replace(/  function download\(name, text, type\) \{[^\n]+\}/,'  function download(name,text,type){window.downloadedText=text;if(type===\'application/json\')window.downloaded=JSON.parse(text);}');
vm.runInContext(source,context);vm.runInContext(scripts[1].split('const log=document.querySelector')[0],context);
context.reloadApp=()=>{const methods={...context.KeoBimLib.BimGeom};vm.runInContext(source,context);Object.assign(context.KeoBimLib.BimGeom,methods);};
(async()=>{
await vm.runInContext(`(async()=>{
 let width=3.6;const height=2.4;
 const model=(urn,version=urn)=>({...makeModel(urn),getDocumentNode:()=>({data:{guid:'short-view'},getRootNode:()=>({urn:()=>version})})});
 NOP_VIEWER.model=model('short:A');
 G.location=async()=>[];
 G.rooms=async()=>[{id:1,key:'room',eid:'room',level:'L01',name:'Раздевальная',num:'synthetic',area:width*height,per:2*(width+height),h:3.6,warn:[]}];
 G.slice=(c,cat,cats)=>cats[0]==='Revit <Room Separation>'?[]:[[0,0,width,0],[width,0,width,height],[width,height,0,height],[0,height,0,0]];
 G.openings=()=>[{id:200,cat:'Revit Windows',roof:true,auto:true,type:'Synthetic shaft',label:'Synthetic shaft',c:[width/2,height/2],t:[1,0],n:[0,1],av:1,bv:1,z0:4.2,z1:4.4,tilt:0}];
 const opts={region:'г. Москва',bGroup:group('A57')},current=()=>KeoBim.st().res.find(r=>r.key==='room');
 await KeoBim.run(opts);assert.match(current().err,/L ≤ 4/);assert.equal(current().sectionContext.error,'');
 const p={y0:1.2,nPts:3,nPtsBasis:'Synthetic project section selection',confirmed:true};
 const preview=KeoBim.previewShortSection('room',p);assert.equal(preview.errors.length,0);assert.equal(preview.points.length,3);assert.equal(current().kind,'err');assert.equal(current().st,undefined);assert.equal(current().section.mode,'draft');
 KeoBim._json();assert.equal(downloaded.spaces.length,0);assert.equal(downloaded.calculationErrors[0].section.mode,'draft');assert.equal(Object.keys(downloaded.shortSections).length,0);
 assert.throws(()=>KeoBim.setShortSection('room',{...p,nPtsBasis:''}),/обоснование/);
 KeoBim.setShortSection('room',p);assert.equal(current().C.ok,true);assert.equal(current().section.mode,'manual');assert.equal(current().st.top.nPts,3);
 KeoBim._json();assert.equal(downloaded.spaces.length,1);assert.equal(downloaded.spaces[0].section.params.nPtsBasis,p.nPtsBasis);assert.equal(downloaded.spaces[0].state.top.y0,1.2);assert.equal(downloaded.shortSections.room.scope.model,'short:A');
 KeoBim._dec();assert.equal(downloaded.shortSections.room.params.confirmed,true);
 const saved=localStorage.getItem('keo-bim:decisions:short:A');assert.equal(JSON.parse(saved).shortSections.room.params.nPts,3);
 const initial=current().C.res.eFinal;await KeoBim.run(opts);assert.equal(current().C.res.eFinal,initial);assert.equal(current().section.mode,'manual');
 const storedBeforeInvalid=localStorage.getItem('keo-bim:decisions:short:A');
 for(const [field,value] of [['y0','NaN'],['y0','Infinity'],['y0',''],['nPts','NaN'],['nPts','Infinity'],['nPts',''],['nPts','3.5'],['nPtsBasis','']]){
  const inputs={y0:{value:'1.2'},nPts:{value:'3'},nPtsBasis:{value:p.nPtsBasis},confirmed:{checked:true}},message={textContent:''},apply={dataset:{shortAction:'apply'}};
  inputs[field].value=value;
  const editor={querySelector:s=>s==='[data-short-message]'?message:inputs[s.slice(12,-1)],querySelectorAll:s=>s==='[data-short]'?Object.values(inputs):[apply]};
  KeoBim._bind({querySelector:()=>editor},current());apply.onclick();
  assert.match(message.textContent,/Укажите|Число|обоснование|Разрез/);assert.equal(current().C.res.eFinal,initial);assert.equal(localStorage.getItem('keo-bim:decisions:short:A'),storedBeforeInvalid);
 }
 const html=KeoBim._html(current());assert.ok(html.includes('data-short-preview'));assert.ok(html.includes('data-short-action="auto"'));assert.ok(html.includes('Synthetic project section selection'));
 NOP_VIEWER.model=model('short:B');assert.throws(()=>KeoBim._json(),/Модель изменилась/);assert.throws(()=>KeoBim.setShortSection('room',p),/Модель изменилась/);await KeoBim.run(opts);assert.equal(Object.keys(KeoBim.st().sections).length,0);assert.equal(current().section.mode,'auto');assert.match(current().err,/L ≤ 4/);
 NOP_VIEWER.model=model('short:A');await KeoBim.run(opts);assert.equal(current().C.res.eFinal,initial);
 const oldNumeric=current();width=3.5;await KeoBim.run(opts);assert.equal(current().section.mode,'stale');assert.equal(current().st,undefined);assert.match(current().err,/устарел/);KeoBim._json();assert.equal(downloaded.spaces.length,0);assert.equal(downloaded.calculationErrors[0].section.mode,'stale');
 assert.throws(()=>KeoBim._one(oldNumeric),/устарел/);KeoBim._csv();const cells=downloadedText.split('\\r\\n')[1].split(';');assert.equal(cells[7],'""');assert.equal(cells[8],'""');assert.match(cells[9],/устарел/);
 assert.ok(KeoBim._html(current()).includes('устарел'));assert.equal(KeoBim._html(current()).includes('type="checkbox" checked'),false);
 KeoBim.setShortSection('room',p);assert.equal(current().C.ok,true);
 KeoBim.setShortSection('room',null);assert.equal(current().section.mode,'auto');assert.equal(current().st,undefined);assert.equal(Object.keys(KeoBim.st().sections).length,0);assert.equal(Object.keys(JSON.parse(localStorage.getItem('keo-bim:decisions:short:A')).shortSections).length,0);
 await KeoBim.run(opts);assert.match(current().err,/L ≤ 4/);
 KeoBim.setShortSection('room',p);NOP_VIEWER.model=model('short:A','another-derivative');await KeoBim.run(opts);assert.equal(current().section.mode,'stale');assert.equal(current().st,undefined);
 NOP_VIEWER.model=model('short:A');await KeoBim.run(opts);KeoBim.setShortSection('room',p);
 reloadApp();await KeoBim.run(opts);assert.equal(current().section.mode,'manual');KeoBim.setShortSection('room',null);
 reloadApp();await KeoBim.run(opts);assert.equal(current().section.mode,'auto');assert.match(current().err,/L ≤ 4/);assert.equal(Object.keys(KeoBim.st().sections).length,0);
 // Two independent short rooms on one level: one profile must not affect the other.
 const box=(x,w)=>[[x,0,x+w,0],[x+w,0,x+w,height],[x+w,height,x,height],[x,height,x,0]];
 Object.assign(KeoBimLib.BimGeom,{
  rooms:async()=>[3.6,3.4].map((w,i)=>({id:i+1,key:'room'+i,eid:'room'+i,level:'L01',name:'Раздевальная',num:'synthetic'+i,area:w*height,per:2*(w+height),h:3.6,warn:[]})),
  slice:(c,cat,cats)=>cats[0]==='Revit <Room Separation>'?[]:[...box(0,3.6),...box(5,3.4)],
  openings:()=>[1.8,6.7].map((x,i)=>({id:200+i,cat:'Revit Windows',roof:true,auto:true,type:'Synthetic shaft',label:'Synthetic shaft',c:[x,height/2],t:[1,0],n:[0,1],av:1,bv:1,z0:4.2,z1:4.4,tilt:0}))
 });
 NOP_VIEWER.model=model('short:two');await KeoBim.run(opts);assert.equal(KeoBim.st().res.length,2);assert.ok(KeoBim.st().res.every(r=>r.kind==='err'&&!r.sectionContext.error));
 const second=()=>KeoBim.st().res.find(r=>r.key==='room1');
 KeoBim.setShortSection('room0',p);assert.equal(KeoBim.st().res.find(r=>r.key==='room0').kind,'calc');assert.equal(second().kind,'err');
 KeoBim.setShortSection('room1',{...p,nPts:5,nPtsBasis:'Independent five-point section'});assert.equal(second().st.top.nPts,5);const secondValue=second().C.res.eFinal;
 KeoBim.previewShortSection('room0',{...p,y0:NaN});KeoBim._json();assert.equal(downloaded.spaces.length,1);assert.equal(downloaded.spaces[0].rooms[0].key,'room1');assert.equal(downloaded.calculationErrors[0].section.mode,'draft');assert.equal(second().C.res.eFinal,secondValue);
 KeoBim.setShortSection('room0',null);assert.equal(second().C.res.eFinal,secondValue);assert.equal(Object.keys(KeoBim.st().sections).join(','),'room1');
 reloadApp();await KeoBim.run(opts);assert.equal(second().C.res.eFinal,secondValue);assert.match(KeoBim.st().res.find(r=>r.key==='room0').err,/L ≤ 4/);
 // A manually edited persisted record with no explanation is never a numeric result.
 const persisted=JSON.parse(localStorage.getItem('keo-bim:decisions:short:two'));persisted.shortSections.room1.params.nPtsBasis='';localStorage.setItem('keo-bim:decisions:short:two',JSON.stringify(persisted));
 reloadApp();await KeoBim.run(opts);assert.equal(second().st,undefined);assert.match(second().err,/обоснование/);KeoBim._json();assert.equal(downloaded.spaces.length,0);assert.equal(downloaded.calculationErrors.length,2);
 KeoBim.destroy();
})()`,context);
console.log('PASS actual app: preview/apply, input handlers with NaN/Infinity/empty/fractional count, JSON/CSV/stale export, persisted bundle reload/reset, two models/rooms, geometry/version invalidation, hand-edited record without basis');
})().catch(e=>{console.error(e);process.exitCode=1});
