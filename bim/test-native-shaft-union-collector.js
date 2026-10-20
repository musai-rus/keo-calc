/* Collector contracts: instance identity, stale transforms and single run.
   Geometry algorithms themselves are tested in the adjacent test modules. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../research/viewer-local-preview/native-shaft-union-live-audit.js'),'utf8');
async function run({change,wrongClass=false,wrongGuid=false,stale=false,busy=false}={}){
  const offset={x:0,y:0,z:0},data={urn:'synthetic',globalOffset:offset};let world;
  const model={getData:()=>data,getUnitScale:()=>1,getModelTransform:()=>world,getProperties:(id,ok)=>{
    if(change==='offset')offset.x=1;
    if(change==='new-transform')world={elements:[1,0,0,1]};
    ok({properties:[{attributeName:'GlobalId',displayCategory:'IFC Attributes',displayValue:wrongGuid?'foreign':'instance'},{attributeName:'IfcClass',displayCategory:'IFC Attributes',displayValue:wrongClass?'IfcSpace':'IfcWindow'},{attributeName:'GlobalId',displayCategory:'IFC Type Attributes',displayValue:'type'},{attributeName:'GlobalId',displayCategory:'Text',displayValue:'pset'}]});
  }};
  const old={source:{urn:'synthetic',unit:stale?2:1,offset:{...offset},fragments:1},busy:false,errors:[],rows:[{fragment:1,guid:'instance',assemblyDbId:2}]};
  const section=z=>({z,status:'void-contours-found',voids:[]});
  const context={NOP_VIEWER:{model},KeoNativeGeom:{ctx:()=>({S:1,fl:{getCount:()=>1}}),eachGeom:(c,id,fn)=>fn([0,0,0],[1,0,4],[0,1,4],{fragment:1})},KeoNativeShaftSections:{inspect:p=>({sections:p.levels.map(section)}),inspectParts:p=>({partRanges:[],sections:p.levels.map(section)})},KeoNativeSpaces:{},KeoNativeSectionUnion:{},KeoNativeShaftAudit:old,setTimeout:fn=>queueMicrotask(fn),performance:{now:()=>0}};
  context.window=context;if(busy)context.KeoNativeShaftUnionAudit={busy:true};
  try{await vm.runInNewContext(script,context);}catch(e){return {thrown:e.message};}return context.KeoNativeShaftUnionAudit;
}
(async()=>{
  let a=await run();assert.equal(a.rows[0].sections.length,3);assert.equal(a.busy,false);assert.equal(a.errors.length,0);assert.equal(a.normativeVerified,false);
  for(const opts of [{wrongClass:true},{wrongGuid:true}]){a=await run(opts);assert.equal(a.rows[0].reason,'mismatched-window-guid-or-class');assert.equal(a.rows[0].sections,undefined);}
  for(const change of ['offset','new-transform']){a=await run({change});assert(a.errors[0].includes('model-or-transform-changed'));assert.equal(a.rows[0].sections.length,0);assert.equal(a.source.offset.x,0);}
  a=await run({stale:true});assert(a.errors[0].includes('shaft-audit-mismatch'));assert.equal(a.rows.length,0);
  assert.equal((await run({busy:true})).thrown,'shaft-union-audit-already-running');
  console.log('Shaft collector passed: instance vs Pset/type IDs, wrong class/GUID, stale prior, in-place offset and newly defined transform, concurrent run');
})().catch(e=>{console.error(e);process.exitCode=1;});
