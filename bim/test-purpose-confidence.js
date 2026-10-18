/* Generic confidence gating: real orchestration, presentation and export. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const DATA=require('../data.js'),C=new Function(fs.readFileSync(__dirname+'/calc.js','utf8')+';return BimCalc')();
const group=id=>DATA.rooms.find(r=>r.id===id).g;
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
const gate=(names,manual='')=>C.purposeGate(manual,C.inferGroup(names,DATA.rooms),DATA.rooms);
for(const [label,names]of[['bedrooms in residential or unknown building',['Спальня','Мастер-спальня',...Array(100).fill('Спальня')]],['single kindergarten hint',['Групповая']],['mixed strong functions',['Групповая','Спальня','Жилая комната','Квартира']],['unknown names',['Помещение XYZ','Коридор']]])test(label+' cannot authorize normative claims',()=>assert.equal(gate(names).allowed,false));
test('supported kindergarten and saved explicit choice retain prior normative results',()=>{
 assert.equal(gate(['Групповая','Спальня','Раздевальная']).allowed,true);
 for(const names of [[],['Спальня'],['Групповая','Квартира']])assert.equal(gate(names,group('A191')).allowed,true);
 assert.equal(C.purposeGate('Unknown manual group',{status:'supported',group:group('A57')},DATA.rooms).allowed,false);
});
test('gate preserves numeric KEO and input objects while removing side/top/combined verdicts',()=>{
 const raw={C:{ok:true,res:{eFinal:1.23,e:[1,2]},norm:{v:.5,room:{n:'A'}},pass:true,normOk:true,uniOk:true},comb:{e:[2,3],eAvgR:2.5,norm:{v:1},pass:false,normOk:false,uniOk:false}};
 const before=JSON.stringify(raw),r=C.gateNorms(raw,gate(['Спальня']));
 for(const x of [r.C,r.comb]){assert.equal(x.pass,null);assert.equal(x.normOk,null);assert.equal(x.uniOk,null);assert.equal(x.norm.v,null);assert.equal(x.norm.room,null);assert.equal(x.norm.pending,true)}
 assert.deepEqual(r.C.res,raw.C.res);assert.deepEqual(r.comb.e,raw.comb.e);assert.equal(JSON.stringify(raw),before);
 const trusted=C.gateNorms(raw,gate([],group('A191')));assert.equal(trusted.C,raw.C);assert.equal(trusted.comb,raw.comb);
});
const scripts=[...fs.readFileSync(__dirname+'/test-purpose.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const context=vm.createContext({console:{log(){},error(){}},performance,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},assert});context.window=context;
const status={textContent:''},detail={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
context.document={querySelector:()=>({}),getElementById:id=>id==='kb-status'?status:id==='kb-detail'?detail:null,body:{contains:()=>true}};
require('./fixture-binding-dom.js')(context);const storage=new Map();context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
vm.runInContext(scripts[0],context);
let bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8').replace('  return { run, st: () => st, S,',`  mount=()=>{ui={remove(){},querySelector:s=>document.getElementById(s.slice(1))}};draw=()=>{};renderList=()=>{};
  return {_status:status,_en:enOf,_purposeHTML:purposeHTML,_detail:renderDetail,_exportOne:exportOne,_exportJSON:exportJSON,_exportCSV:exportCSV,run,st:()=>st,S,`);
bundle=bundle.replace(/  function download\(name, text, type\) \{[^\n]+\}/,'  function download(name,text,type){window.capturedDownload={name,text,type}}');
vm.runInContext(bundle,context);vm.runInContext(scripts[1].split('const log=document.querySelector')[0],context);
(async()=>{
 await vm.runInContext(`(async()=>{
  const originalRooms=G.rooms;G.rooms=async C=>(await originalRooms(C)).map((r,i)=>({...r,name:i%2?'Спальня':'Мастер-спальня',dep:'Synthetic apartment group'}));G.location=async()=>[];
  await KeoBim.run({region:'г. Москва'});
  assert.ok(['tentative','unknown'].includes(KeoBim.st().purpose.status));assert.equal(KeoBim.S.bGroup,'');
  const rs=KeoBim.st().res.filter(r=>r.kind==='calc');assert.ok(rs.length);
  const numbers=rs.map(r=>r.comb?.eAvgR??r.C.res.eFinal);
  rs.forEach(r=>{assert.equal(r.C.pass,null);assert.equal(r.C.norm.v,null);assert.equal(KeoBim._en(r),null);assert.equal(KeoBim._status(r).t,'подтвердите назначение здания')});
  assert.match(KeoBim._purposeHTML(),/Назначение не подтверждено/);assert.match(KeoBim._purposeHTML(),/Предположение по названиям/);assert.ok(KeoBim._purposeHTML().includes('<b>Назначение здания: не подтверждено</b>'));assert.match(KeoBim._purposeHTML(),/<details open>/);assert.match(KeoBim._purposeHTML(),/Подтвердить этот вариант/);assert.match(KeoBim._purposeHTML(),/слабый признак/);assert.match(KeoBim._purposeHTML(),/один общий выбор не подтверждает/);assert.match(KeoBim._purposeHTML(),/Synthetic apartment group × 4/);assert.match(document.getElementById('kb-status').textContent,/Норма и соответствие не определены/);
  KeoBim.st().sel=rs[0];KeoBim._detail();const html=document.getElementById('kb-detail').innerHTML;assert.match(html,/Вычисленный КЕО предварительный/);assert.equal(html.includes('Полный разбор: формулы'),false);assert.equal(html.includes('Исходные для калькулятора (.json)'),false);assert.equal(html.includes('Норма: табл.'),false);
  assert.throws(()=>KeoBim._exportOne(rs[0]),/Подтвердите назначение/);
  KeoBim._exportJSON();const out=JSON.parse(capturedDownload.text);assert.equal(out.purpose.confidence.allowed,false);out.spaces.forEach(r=>{assert.equal(r.state,undefined);assert.equal(r.normative.norm,null);assert.ok(r.previewInputs.warning);assert.equal(r.normative.status,'подтвердите назначение здания')});
  KeoBim._exportCSV();assert.ok(capturedDownload.text.includes('подтвердите назначение здания'));assert.equal(capturedDownload.text.includes('соответствует'),false);
  await KeoBim.setBuildingGroup(group('A57'));assert.equal(KeoBim.S.bGroup,group('A57'));assert.ok(KeoBim.st().res.filter(r=>r.kind==='calc').every(r=>r.purposeGate.allowed));
  KeoBim._exportJSON();assert.ok(JSON.parse(capturedDownload.text).spaces.every(r=>r.state));
  await KeoBim.setBuildingGroup('');assert.equal(KeoBim.S.bGroup,'');assert.ok(KeoBim.st().res.filter(r=>r.kind==='calc').every(r=>r.C.pass===null));
  assert.deepEqual(KeoBim.st().res.filter(r=>r.kind==='calc').map(r=>r.comb?.eAvgR??r.C.res.eFinal),numbers);
  const saved=JSON.parse(localStorage.getItem('keo-bim:decisions:test-purpose:A'));assert.equal(saved.bGroup,'');
  KeoBim.destroy();
 })()`,context);
 passed++;console.log('PASS actual weak-purpose run, manual confirmation, return to auto, UI and export gate');
 console.log(`${passed}/${passed} confidence groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
