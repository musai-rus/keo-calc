/* Synthetic independent geometry cases; not acceptance of a real IFC model. */
const assert=require('node:assert/strict'),N=require('./native-spaces');
const shell=(polygon,z0=0,z1=3)=>polygon.flatMap((a,i)=>{
  const b=polygon[(i+1)%polygon.length],p=[...a,z0],q=[...b,z0],r=[...b,z1],s=[...a,z1];
  return [[p,q,r],[p,r,s]];
});
const rectangle=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const make=(triangles,opts={})=>N.section({triangles,unitScale:1,z:1,...opts});
const rect=shell(rectangle(0,0,6,4));
let a=make(rect);assert.equal(a.status,'closed-section');assert.equal(a.area,24);
assert.equal(N.locate(a.loops,[3,2]),'inside');assert.equal(N.locate(a.loops,[9,2]),'outside');assert.equal(N.locate(a.loops,[0,2]),'boundary');
assert.equal(a.sourceAccuracyVerified,false);assert.equal(a.normativeVerified,false);
// Traversal, winding and choice of wall diagonal cannot define room identity.
assert.deepEqual(make(rect.toReversed().map(t=>t.toReversed())),a);
const otherDiagonal=rectangle(0,0,6,4).flatMap((p,i,poly)=>{const q=poly[(i+1)%poly.length];return [[[...p,0],[...q,0],[...p,3]],[[...q,0],[...q,3],[...p,3]]];});
assert.equal(make(otherDiagonal).area,24);
// Concave room, hole, nested island and independent components.
const l=make(shell([[0,0],[6,0],[6,2],[2,2],[2,5],[0,5]]));
assert.equal(l.area,18);assert.equal(N.locate(l.loops,[4,4]),'outside');assert.equal(N.locate(l.loops,[1,4]),'inside');
const hole=make([...rect,...shell(rectangle(1,1,2,2))]);assert.equal(hole.area,20);assert.equal(N.locate(hole.loops,[2,2]),'outside');assert.equal(hole.contours.filter(c=>c.hole).length,1);
const island=make([...rect,...shell(rectangle(1,1,2,2)),...shell(rectangle(1.5,1.5,1,1))]);assert.equal(island.area,21);assert.equal(N.locate(island.loops,[2,2]),'inside');
assert.equal(make([...rect,...shell(rectangle(10,0,2,3))]).area,30);
// Explicit unit conversion once; translated and rotated copies remain independent.
assert.equal(make(rect.map(t=>t.map(p=>p.map(x=>x*1000))),{unitScale:.001}).area,24);
assert.equal(make(rect.map(t=>t.map(([x,y,z])=>[-y+1e6,x-2e6,z]))).area,24);
// No filling of gaps, snapped coordinates, fabricated surfaces or duplicate area.
assert.equal(make(rect.slice(2)).reason,'open-or-branching-section');
assert.equal(make([...rect,rect[0]]).reason,'overlapping-section-segments');
assert.equal(make([...rect,...shell(rectangle(3,1,4,2))]).status,'unavailable');
assert.equal(make([...rect,...shell(rectangle(6,4,1,1))]).status,'unavailable');
const gap=rect.map(t=>t.map(p=>p.slice()));gap[0][0][0]=1e-8;assert.equal(make(gap).status,'unavailable');
assert.equal(make([...rect,[[0,0,1],[1,0,1],[1,1,1]]]).reason,'cut-coincides-with-surface');
assert.equal(make([]).reason,'missing-native-geometry');assert.equal(make(rect,{unitScale:NaN}).reason,'unknown-units-or-cut');
assert.equal(make([[[0,0,0],[Infinity,0,1],[0,1,0]]]).reason,'invalid-triangle');
assert.equal(make(rect,{maxSegments:3}).reason,'section-resource-limit');
assert.equal(N.locate(a.loops,[NaN,0]),'unavailable');
// Diagnostic evidence never bypasses acceptance or supplies usable loops/area.
const crossing=[...rect,...shell(rectangle(3,1,4,2))],d=make(crossing,{diagnostics:true});
assert.equal(d.reason,'crossing-or-touching-contours');assert.equal(d.status,'unavailable');
assert.deepEqual(d.loops,[]);assert.deepEqual(d.segments,[]);assert.equal(d.area,undefined);
assert.equal(d.diagnostic.status,'unverified-section-lines');assert.equal(d.diagnostic.candidateLoops.length,2);
assert.equal(d.diagnostic.contacts[0].segments.length,2);assert.equal(new Set(d.diagnostic.contacts[0].loopIndices).size,2);
assert.equal(make(crossing).diagnostic,undefined);assert.deepEqual(make(rect,{diagnostics:true}),make(rect));
const open=make(rect.slice(2),{diagnostics:true});assert(open.diagnostic.segments.length);assert(open.invalidVertices.length);assert.deepEqual(open.loops,[]);
const coplanar=make([...rect,[[0,0,1],[1,0,1],[1,1,1]]],{diagnostics:true});assert.equal(coplanar.coplanarTriangles,1);assert(coplanar.diagnostic.segments.length);
assert.equal(make(rect,{diagnostics:'yes'}).reason,'invalid-diagnostics-option');
console.log('OK: native mesh sections; concavity, holes, islands, separate components, winding/order/diagonal/units/transforms; invalid geometry fails closed; no source or normative claims');
