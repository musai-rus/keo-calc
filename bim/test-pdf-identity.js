/* Synthetic IDs only; a plausible property row at the raw ID must not be joined. */
const assert = require('node:assert/strict'), I = require('./pdf-identity.js');
const node = () => ({data:{guid:'sheet-A'},getRootNode:()=>({urn:()=> 'document-A'})});
function model(extra={}) { return {is2d:()=>true,isPdf:()=>true,getDocumentNode:node,isIdRemapValid:()=>true,
  remapDbIdFor2D:id=>id===17?4:0,reverseMapDbIdFor2D:id=>id===4?17:0,
  getProperties:(id,ok)=>ok({dbId:id,externalId:id===4?'room-external':'unrelated-valid-wall-external',name:id===4?'Room':'Wall',properties:[]}),...extra}; }
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name)}
const rejects=(m,code)=>assert.rejects(I.read(m,17),e=>e.code===code);
(async()=>{
 await test('raw PDF ID differs from dbId even when raw property lookup looks valid',async()=>{const seen=[];const m=model(),get=m.getProperties;m.getProperties=(id,ok)=>{seen.push(id);get(id,ok)};const r=await I.read(m,17);assert.deepEqual(seen,[4]);assert.equal(r.externalId,'room-external');assert.equal(r.rawId,17);assert.equal(r.dbId,4);assert.equal(r.seedAccepted,false);assert.equal(r.geometryAccepted,false)});
 await test('explicit valid identity remap is supported',async()=>assert.equal((await I.read(model({remapDbIdFor2D:x=>x,reverseMapDbIdFor2D:x=>x}),17)).dbId,17));
 await test('absence or invalidity of remap never falls back to raw properties',async()=>{for(const m of [model({isIdRemapValid:()=>false}),model({remapDbIdFor2D:null}),model({reverseMapDbIdFor2D:null})])await rejects(m,'remap-unavailable')});
 await test('3D and ordinary non-PDF models are rejected',async()=>{await rejects(model({is2d:()=>false}),'not-pdf-sheet');await rejects(model({isPdf:()=>false}),'not-pdf-sheet')});
 await test('invalid raw IDs and remap roundtrips are rejected',async()=>{for(const x of [0,-1,1.5,'17',NaN,Infinity])await assert.rejects(I.read(model(),x),e=>e.code==='invalid-raw-id');for(const x of [0,-1,1.5,'4',NaN])await rejects(model({remapDbIdFor2D:()=>x}),'invalid-remap-roundtrip');await rejects(model({reverseMapDbIdFor2D:()=>18}),'invalid-remap-roundtrip')});
 await test('missing document/view identity is not accepted',async()=>{await rejects(model({getDocumentNode:()=>null}),'missing-source-identity');await rejects(model({getDocumentNode:()=>({...node(),data:{}})}),'missing-source-identity');await rejects(model({getDocumentNode:()=>({...node(),data:{guid:' '}})}),'missing-source-identity');await rejects(model({getDocumentNode:()=>({...node(),getRootNode:()=>({urn:()=> ' '})})}),'missing-source-identity')});
 await test('external identity and returned property-db ID are required',async()=>{for(const row of [{dbId:4},{dbId:4,externalId:' '},{dbId:17,externalId:'valid-but-wrong'}])await rejects(model({getProperties:(id,ok)=>ok(row)}),'property-identity-mismatch')});
 await test('property query errors propagate without a fallback lookup',async()=>{const error=new Error('property unavailable');await assert.rejects(I.read(model({getProperties:(id,ok,no)=>no(error)}),17),e=>e===error)});
 await test('async source or mapping changes invalidate a result',async()=>{for(const change of ['document','view','mapping']){const m=model(),base=m.getProperties;m.getProperties=(id,ok)=>{if(change==='document')m.getDocumentNode=()=>({data:{guid:'sheet-A'},getRootNode:()=>({urn:()=> 'document-B'})});if(change==='view')m.getDocumentNode=()=>({...node(),data:{guid:'sheet-B'}});if(change==='mapping'){m.remapDbIdFor2D=()=>8;m.reverseMapDbIdFor2D=()=>17}base(id,ok)};await rejects(m,'source-or-remap-changed')}});
 console.log(`${count}/${count} PDF identity groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
