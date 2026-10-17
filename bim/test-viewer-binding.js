const assert = require('node:assert/strict');
const B = require('./viewer-binding.js');
function setup() {
  const doc = {}, env = { document:doc, innerWidth:1000,innerHeight:800,location:{href:'https://viewer.autodesk.com/id/model-A?sheetId=view-A',hostname:'viewer.autodesk.com',pathname:'/id/model-A'}, getComputedStyle:e=>({display:'block',visibility:'visible',opacity:'1',...e.style}) };
  const el = parent => ({nodeType:1,parentElement:parent,ownerDocument:doc,isConnected:true,style:{},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),contains(e){return e===this||e.parentElement===this}});
  const container=el(null),canvas=el(container);let hosts=[container];doc.querySelectorAll=()=>hosts;
  let data={urn:'derivative-A'},root='model-A',guid='view-A';
  const model={getData:()=>data,getDocumentNode:()=>({getRootNode:()=>({urn:()=>root}),data:{guid}}),is2d:()=>false,getInstanceTree:()=>({}),getFragmentList:()=>({getCount:()=>10}),getPropertyDb:()=>({})};
  const v={model,container,canvas,isLoadDone:()=>true,getAllModels(){return [this.model]},getVisibleModels(){return [this.model]}};env.NOP_VIEWER=v;
  return {env,v,model,canvas,container,el,setHosts:x=>hosts=x,setRoot:x=>root=x,setGuid:x=>guid=x,setData:x=>data=x};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name)}
test('single connected visible loaded 3D Viewer is accepted',()=>{const s=setup();assert.equal(B.capture(s.env).m,s.model);assert.equal(B.assert(B.capture(s.env),s.env),true)});
test('stale disconnected NOP_VIEWER is rejected without choosing another object',()=>{const s=setup();s.canvas.isConnected=false;s.env.anotherViewer={...s.v};assert.throws(()=>B.capture(s.env),/отключён|скрыт/)});
test('container/canvas must belong to this document and each other',()=>{for(const mutate of [s=>s.container.isConnected=false,s=>s.canvas.ownerDocument={},s=>s.container.ownerDocument={},s=>s.canvas.parentElement=null]){const s=setup();mutate(s);assert.throws(()=>B.capture(s.env))}});
test('hidden/zero-size/non-finite canvas or ancestor is rejected',()=>{for(const mutate of [s=>s.canvas.getBoundingClientRect=()=>({left:0,top:0,width:0,height:100}),s=>s.canvas.getBoundingClientRect=()=>({left:0,top:0,width:Infinity,height:100}),s=>s.container.style.display='none',s=>s.canvas.style.visibility='hidden',s=>s.container.style.opacity='0',s=>s.container.hidden=true]){const s=setup();mutate(s);assert.throws(()=>B.capture(s.env))}});
test('two visible Viewer hosts fail closed; hidden second host is ignored',()=>{const s=setup(),other=s.el(null);s.setHosts([s.container,other]);assert.throws(()=>B.capture(s.env),/Неоднозначный/);other.style.display='none';assert.equal(B.capture(s.env).v,s.v)});
test('no host or a different host cannot validate the global Viewer',()=>{const s=setup();for(const hs of [[],[s.el(null)]]){s.setHosts(hs);assert.throws(()=>B.capture(s.env),/Неоднозначный/)}});
test('multiple loaded models, hidden current model and malformed lists rejected',()=>{for(const mutate of [s=>s.v.getAllModels=()=>[s.model,{}],s=>s.v.getVisibleModels=()=>[],s=>s.v.getVisibleModels=()=>[{}],s=>s.v.getAllModels=()=>null,s=>delete s.v.getAllModels]){const s=setup();mutate(s);assert.throws(()=>B.capture(s.env))}});
test('2D and incomplete loading/tree/geometry/property database rejected',()=>{for(const mutate of [s=>s.model.is2d=()=>true,s=>s.v.isLoadDone=()=>false,s=>delete s.v.isLoadDone,s=>s.model.getInstanceTree=()=>null,s=>s.model.getFragmentList=()=>null,s=>s.model.getFragmentList=()=>({getCount:()=>0}),s=>s.model.getPropertyDb=()=>null]){const s=setup();mutate(s);assert.throws(()=>B.capture(s.env))}});
test('connected old document under new page URN is rejected',()=>{const s=setup();s.setRoot('model-B');assert.throws(()=>B.capture(s.env),/не соответствует/)});
test('missing document identity on Autodesk route is rejected',()=>{const s=setup();s.setRoot(null);assert.throws(()=>B.capture(s.env),/не соответствует/)});
test('derivative URN need not equal document URN; file name is unused',()=>{const s=setup();s.setData({urn:'different-derivative',name:'untrusted-name'});assert.equal(B.capture(s.env).root,'model-A')});
test('SPA navigation invalidates an existing binding before model is swapped',()=>{const s=setup(),b=B.capture(s.env);s.env.location.href+='&new-view=1';assert.throws(()=>B.assert(b,s.env),/изменилась/)});
test('Viewer/model/canvas/container replacement invalidates even identical URN',()=>{for(const mutate of [s=>s.env.NOP_VIEWER={...s.v},s=>s.v.model={...s.model},s=>s.v.canvas=s.el(s.container),s=>{const c=s.el(null);s.v.container=c;s.v.canvas=s.el(c);s.setHosts([c])}]){const s=setup(),b=B.capture(s.env);mutate(s);assert.throws(()=>B.assert(b,s.env),/изменилась/)}});
test('in-place derivative, document or view identity changes invalidate',()=>{for(const mutate of [s=>s.setData({urn:'derivative-B'}),s=>s.setRoot('model-B'),s=>s.setGuid('view-B')]){const s=setup(),b=B.capture(s.env);mutate(s);assert.throws(()=>B.assert(b,s.env))}});
test('normal page reload produces a fresh valid binding, old one cannot be reused',()=>{const a=setup(),b=B.capture(a.env),next=setup();assert.throws(()=>B.assert(b,next.env));assert.equal(B.assert(B.capture(next.env),next.env),true)});
test('embedded single Viewer without Autodesk document route is supported',()=>{const s=setup();s.env.location={href:'http://localhost/test',hostname:'localhost',pathname:'/test'};s.setRoot(null);assert.equal(B.capture(s.env).m,s.model)});
test('offscreen canvas and unknown Autodesk route cannot appear active',()=>{const s=setup();s.canvas.getBoundingClientRect=()=>({left:2000,top:2000,width:800,height:600});assert.throws(()=>B.capture(s.env));const t=setup();t.env.location.pathname='/';assert.throws(()=>B.capture(t.env),/не подтверждён/)});
console.log(`${count}/${count} Viewer binding groups passed`);
