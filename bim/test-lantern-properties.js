/* Viewer-shaped property records. Runs the actual property-DB callback. */
const assert=require('node:assert/strict'),fs=require('node:fs');
global.BimSpaces=new Function(fs.readFileSync(__dirname+'/spaces.js','utf8')+';return BimSpaces;')();
const G=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom;')();
const U=u=>'autodesk.unit.unit:'+u+'-1.0.1';
const fixture=(records,raw=[])=>({m:{
 getBulkProperties2:(ids,opts,ok)=>ok(records),
 getPropertyDb:()=>({executeUserFunction:async fn=>{
  const defs=[],values=[],objects=new Map();
  raw.forEach(o=>objects.set(o.id,o.values.map(p=>{const a=defs.push({name:p.name,dataTypeContext:p.context,units:p.units,category:p.category,dataType:p.dataType})-1,v=values.push(p.value)-1;return[a,v]})));
  return fn({enumObjects:cb=>objects.forEach((v,id)=>cb(id)),enumObjectProperties:(id,cb)=>(objects.get(id)||[]).forEach(([a,v])=>cb(a,v)),getAttributeDef:a=>defs[a],getAttrValue:(a,v)=>values[v]});
 }})
}});
const bulk=(a,b,units)=>[{dbId:1,properties:[{attributeName:'Diameter_Inside',displayName:'Diameter_Inside',displayValue:a,units},{attributeName:'Diameter_Bottom',displayName:'Diameter_Bottom',displayValue:b,units}]}];
(async()=>{
 let n=0;
 for(const [a,b,u]of[[1500,2100,'millimeters'],['1,50','2,10','meters'],[150,210,'centimeters']]){
  const r=(await G.lanternParams(fixture(bulk(a,b,U(u))),[1]))[1];assert.equal(r.dIn,1.5);assert.equal(r.dBot,2.1);assert.deepEqual(r.notes,[]);n++;
 }
 for(const [a,b,u]of[[1500,2100,'mm'],[1.5,2.1,'m'],[150,210,'cm'],[15,21,'dm'],[1.5/.3048,2.1/.3048,'ft'],[1.5/.0254,2.1/.0254,'in']]){const r=(await G.lanternParams(fixture(bulk(a,b,u)),[1]))[1];assert.ok(Math.abs(r.dIn-1.5)<1e-12);assert.ok(Math.abs(r.dBot-2.1)<1e-12);n++;}
 // Values must stay paired with their own units. Raw millimetres cannot use
 // public API metres, and rounded display values cannot replace raw precision.
 const raw=[{id:1,values:[{name:'Diameter_Inside',value:1501,context:U('millimeters')},{name:'Diameter_Bottom',value:2102,context:U('millimeters')}]}];
 const r=(await G.lanternParams(fixture(bulk(1.5,2.1,U('meters')),raw),[1]))[1];assert.ok(Math.abs(r.dIn-1.501)<1e-12);assert.equal(r.dBot,2.102);n++;
 const unknown=[{id:1,values:[{name:'Diameter_Inside',value:1500},{name:'Diameter_Bottom',value:2100}]}];
 const known=(await G.lanternParams(fixture(bulk(1.5,2.1,U('meters')),unknown),[1]))[1];assert.equal(known.dIn,1.5);assert.equal(known.dBot,2.1);n++;
 const unknownUnit=raw.map(o=>({...o,values:o.values.map(v=>({...v,context:'unsupported-unit'}))}));const fallback=(await G.lanternParams(fixture(bulk(1.5,2.1,U('meters')),unknownUnit),[1]))[1];assert.equal(fallback.dIn,1.5);assert.equal(fallback.dBot,2.1);assert.ok(fallback.notes.length);n++;
 const bad=(await G.lanternParams(fixture(bulk(1500,2100,undefined),unknown),[1]))[1];assert.equal(bad.dIn,null);assert.equal(bad.dBot,null);assert.equal(bad.notes.length,2);n++;
 // Synthetic documented SVF link shape, not a captured live link. The raw
 // traversal is intentionally unsupported; the public resolved record works.
 const linked=[{id:1,values:[{name:'instanceof_objid',category:'__instanceof__',dataType:11,value:99}]},{id:99,values:[{name:'Diameter_Inside',value:1500,context:U('millimeters')},{name:'Diameter_Bottom',value:2100,context:U('millimeters')}]}];
 const resolved=(await G.lanternParams(fixture(bulk(1500,2100,U('millimeters')),linked),[1]))[1];assert.equal(resolved.dIn,1.5);assert.equal(resolved.dBot,2.1);n++;
 assert.deepEqual(await G.lanternParams(fixture([],linked),[1]),{});n++;
 // A similarly named unrelated type never supplies parameters without a link.
 const unrelated=raw.map(o=>({...o,id:99}));assert.equal(Object.keys(await G.lanternParams(fixture([],unrelated),[1])).length,0);n++;
 console.log(`${n}/${n} Viewer property groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
