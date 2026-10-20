/* Synthetic contracts, independently located planes. Not a real IFC approval. */
const assert=require('node:assert/strict'),R=require('./native-rays');
const face=(x,y=0,z=0)=>[[[x,y,z],[x,y+4,z],[x,y+4,z+3]],[[x,y,z],[x,y+4,z+3],[x,y,z+3]]];
const mesh=(id,x)=>({id,triangles:face(x)});
const index=(meshes,unitScale=1)=>R.build({meshes,unitScale});
const origin=[0,1,1],normal=[1,0,0];
const spaces=index([mesh('near',2),mesh('far',9)]),empty=index([]);
assert.deepEqual(spaces.trace(origin,normal).ids,['near']);
assert.equal(spaces.trace(origin,normal).distance,2);
assert.equal(spaces.trace(origin,[10,0,0]).distance,2);
assert.equal(spaces.trace(origin,normal,1).status,'miss');
let p=R.probe({spaces,blockers:empty,origin,normal});
assert.equal(p.directions[0].status,'candidate-surface');
assert.equal(p.directions[1].status,'no-space-surface');
assert.equal(p.ownershipVerified,false);assert.equal(p.normativeVerified,false);
assert.equal(R.probe({spaces,origin,normal}).status,'unavailable');
assert.equal(R.probe({spaces,blockers:index([mesh('wall',1)]),origin,normal}).directions[0].status,'blocked');
assert.equal(R.probe({spaces,blockers:index([mesh('wall',3)]),origin,normal}).directions[0].status,'candidate-surface');
assert.equal(R.probe({spaces,blockers:index([mesh('wall',2)]),origin,normal}).directions[0].status,'unresolved');
assert.equal(R.probe({spaces:index([mesh('a',2),mesh('b',-2)]),blockers:empty,origin,normal}).directions.filter(x=>x.status==='candidate-surface').length,2);
assert.equal(index([mesh('a',2),mesh('b',2)]).trace(origin,normal).reason,'coincident-surfaces');
assert.deepEqual(index([mesh('b',2),mesh('a',2)]).trace(origin,normal).ids,['a','b']);
assert.equal(spaces.trace([0,2,1.5],normal).reason,'triangle-edge');
assert.equal(spaces.trace([2,1,1],[0,1,0]).reason,'coplanar-or-unstable-ray');
assert.equal(spaces.trace([0,1,1],[0,1,0]).status,'miss');
assert.equal(spaces.trace(origin,[0,0,0]).status,'unavailable');
assert.equal(spaces.trace([NaN,0,0],normal).status,'unavailable');
assert.equal(spaces.trace(origin,normal,-1).status,'unavailable');
// Units, axis rotation, winding and a large common translation.
const scaled=[mesh('near',2)].map(m=>({...m,triangles:m.triangles.map(t=>t.map(v=>v.map(x=>x*1000)))}));
assert.equal(index(scaled,.001).trace(origin,normal).distance,2);
const transform=v=>[v[2]+1e6,v[0]-2e6,v[1]+3e6];
const rotated=index([{id:'rotated',triangles:face(2).toReversed().map(t=>t.toReversed().map(transform))}]);
assert.equal(rotated.trace(transform(origin),[0,1,0]).distance,2);
// Actual sloping pane normal, a lower storey, and a foreground wall away from ray.
const s=Math.SQRT1_2,tilt=([x,y,z])=>[(x-z)*s,y,(x+z)*s];
const sloped=index([{id:'slope',triangles:face(2).map(t=>t.map(tilt))}]);
assert.ok(Math.abs(sloped.trace(tilt(origin),[s,0,s]).distance-2)<1e-12);
const roof=index([{id:'room',triangles:[[[0,0,0],[4,0,0],[0,4,0]]]}]);
assert.equal(roof.trace([1,1,3],[0,0,-1]).distance,3);
assert.equal(roof.trace([1,1,3],[0,0,1]).status,'miss');
assert.equal(R.probe({spaces,blockers:index([{id:'wall',triangles:face(1,5)}]),origin,normal}).directions[0].status,'candidate-surface');
// BVH pruning must agree with independent vertical-plane answers, regardless of order.
const many=Array.from({length:257},(_,i)=>mesh(String(i),i+1));
const manyIndex=index(many.toReversed());
for(let i=0;i<256;i+=7)assert.equal(manyIndex.trace([i+.25,1,1],normal).distance,.75);
assert.ok(manyIndex.trace(origin,normal).visited<50);
// Close but distinct room surfaces must not be merged by a model-space tolerance.
assert.deepEqual(index([mesh('a',2),mesh('b',2.000001)]).trace(origin,normal).ids,['a']);
assert.throws(()=>index([mesh('a',2),mesh('a',3)]),/duplicate/);
assert.throws(()=>index([mesh('a',2)],0),/invalid/);
assert.throws(()=>index([{id:'a',triangles:[[[0,0,0],[1,0,0],[NaN,0,0]]]}]),/invalid-triangle/);
assert.throws(()=>R.build({meshes:[mesh('a',2)],unitScale:1,maxTriangles:1}),/resource/);
assert.equal(index([{id:'a',triangles:[[[0,0,0],[0,0,0],[0,0,0]]]}]).stats.degenerate,1);
console.log('OK: native 3D mesh rays; obstruction, ties, edges, both sides, units, transforms and indexed search; diagnostic candidates only');
