/* Focused UI logic tests with a minimal DOM double, not browser/layout QA. */
const fs=require('fs'),assert=require('assert');
const nodes=new Map(),common=[];
function node(k){if(!nodes.has(k))nodes.set(k,{innerHTML:'',value:'',querySelectorAll:()=>[]});return nodes.get(k);}
global.window=global;
global.document={readyState:'loading',activeElement:null,addEventListener(){},querySelector:node,querySelectorAll:q=>q.includes('[data-common-coef]')?common:[]};
global.localStorage={setItem(){},getItem(){return null;}};
const core=['data.js','report.js','engine.js','schemes.js','model.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
const app=fs.readFileSync('app.js','utf8').replace(/\}\)\(\);\s*$/, 'return {setState(s){S=s}, update, schemeList, excEditor, cardRoomSide, cardBuildings};})();');
const {KEO,UI}=new Function(core+'\nconst UI='+app.replace('/* Интерфейс калькулятора КЕО */','')+'\nreturn {KEO,UI};')();
const s=KEO.defaultState();s.rtManual='center';s.roomId='A57';const w=s.side.walls[0];Object.assign(w,{dp:8,bp:7.4,H:'',dst:.4});w.windows=[KEO.defaultWindow(0)];
UI.setState(s);UI.update();assert(KEO.compute(s).ok);assert(/H не задана/.test(node('#schemes').innerHTML));assert(/ЕО:/.test(node('#result').innerHTML)&&/СО:/.test(node('#result').innerHTML));
assert(/перпендикулярно окнам/.test(UI.cardRoomSide()));assert(/не Δs|Это не Δs/.test(UI.cardBuildings()));
const before=KEO.compute(s).res.eFinal;w.H=3.5;assert.equal(KEO.compute(s).res.eFinal,before);s.rhoMode='surf';assert(!KEO.compute(s).ok);s.rhoMode='default';
const x=w.windows[0];x.tau0m='wall';x.tau0o=.36;
common.push({dataset:{commonCoef:'tau0'},value:'0,36'});UI.update();const actual=KEO.winCoef(KEO.wallCoef(s,w,w.dp),x,0).tau0.v;
assert(Math.abs(+common[0].value.replace(',','.')-actual)<1e-12);assert.equal(x.tau0o,.36);
x.tau0m='manual';assert(UI.excEditor('side.walls.0',0,x,0).includes('value="0,36"'));x.tau0m='wall';
const stored=JSON.stringify(s);w.windows.push({...w.windows[0]});UI.update();assert(!KEO.compute(s).ok);assert(/перекрываются/.test(node('#result').innerHTML));assert(/Диагностическая схема/.test(node('#schemes').innerHTML));assert(/<svg/.test(node('#schemes').innerHTML));assert(!/Соответствует/.test(node('#result').innerHTML));assert.equal(UI.schemeList().length,2);
w.dp='';UI.update();assert.equal(node('#schemes').innerHTML,'');
console.log('PASS: H optional/unchanged result, H surface validation, clear labels, common coefficient/stored override, both norms, overlap geometry without result, invalid geometry clears stale scheme. DOM double only.');
