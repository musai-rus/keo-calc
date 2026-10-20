const assert=require('node:assert/strict'),P=require('./curtain-elevation-profile'),U=require('../../bim/native-section-union');
function box(x0,x1,z0,z1,d0=0,d1=.25){
  const p=[[x0,d0,z0],[x1,d0,z0],[x1,d1,z0],[x0,d1,z0],[x0,d0,z1],[x1,d0,z1],[x1,d1,z1],[x0,d1,z1]];
  return [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(t=>t.map(i=>p[i]));
}
const left=box(0,.125,0,2),right=box(2.875,3,0,2),bottom=box(.125,2.875,0,.125),top=box(.125,2.875,1.875,2);
const frame={id:'frame',triangles:[...left,...right,...bottom,...top]},glass={id:'infill',triangles:box(.0625,2.9375,.0625,1.9375,.0625,.125)};
const profile=parts=>P.inspect({parts,origin:[0,0,0],along:[1,0]},U);
const base=profile([frame,glass]),measure=P.framedRectangle(base.parts,U);
assert.equal(base.status,'profile');assert.equal(base.combined.area,6);
assert.equal(measure.status,'framed-rectangle-candidate');assert.equal(measure.outer.width,3);assert.equal(measure.outer.height,2);
assert.equal(measure.infill.width,2.875);assert.equal(measure.openingDimensionsVerified,false);assert.equal(measure.materialsVerified,false);
// Transparent-looking U shapes must not turn into filled rectangular apertures.
assert.equal(P.framedRectangle(profile([{id:'u',triangles:[...left,...right,...top]},glass]).parts,U).reason,'no-closed-frame-ring');
const open=profile([{id:'u',triangles:[...left,...right,...top]}]);
const door=P.openBottomFrame(open.parts);assert.equal(door.status,'open-bottom-frame-candidate');assert.equal(door.outer.width,3);assert.equal(door.outer.height,2);assert.equal(door.inner.width,2.75);assert.equal(door.infillGeometryPresent,false);
assert.equal(P.openBottomFrame(base.parts).status,'unresolved');
assert.equal(P.openBottomFrame(profile([{id:'inverted-u',triangles:[...left,...right,...bottom]}]).parts).status,'unresolved');
assert.equal(P.framedRectangle(profile([frame]).parts,U).status,'unresolved');
assert.equal(P.framedRectangle(profile([frame,{id:'half',triangles:box(.0625,1.5,.0625,1.9375,.0625,.125)}]).parts,U).status,'unresolved');
assert.equal(P.framedRectangle(profile([frame,{id:'behind',triangles:box(.0625,2.9375,.0625,1.9375,1,1.125)}]).parts,U).status,'unresolved');
assert.equal(P.framedRectangle([...base.parts,base.parts[1]],U).reason,'ambiguous-infill');
const changedName=[{...frame,id:'glass'},{...glass,id:'opaque'}];
assert.equal(P.framedRectangle(profile(changedName).parts,U).status,'framed-rectangle-candidate'); // names cannot certify roles
const rev=profile([glass,frame].map(p=>({...p,triangles:p.triangles.slice().reverse().map(t=>t.slice().reverse())})));
assert.deepEqual(P.framedRectangle(rev.parts,U).outer,measure.outer);
const transform=p=>[100+p[0]*.6-p[1]*.8,-300+p[0]*.8+p[1]*.6,1e9+p[2]];
const rotated=P.inspect({parts:[frame,glass].map(p=>({...p,triangles:p.triangles.map(t=>t.map(transform))})),origin:[100,-300,1e9],along:[.6,.8]},U);
const rotatedMeasure=P.framedRectangle(rotated.parts,U);assert.equal(rotatedMeasure.status,'framed-rectangle-candidate');assert.ok(Math.abs(rotatedMeasure.outer.width-3)<1e-12);
const wrongAxis=P.inspect({parts:[frame,glass],origin:[0,0,0],along:[.6,.8]},U);
assert.equal(P.framedRectangle(wrongAxis.parts,U).reason,'projection-axis-not-aligned-with-parts');
// Preserve a small through-hole instead of filling it by a hull or area threshold.
const tiny=profile([{id:'tiny',triangles:[...box(0,.5,0,1),...box(.500001,1,0,1),...box(.5,.500001,0,.5),...box(.5,.500001,.500001,1)]}]);
assert.equal(tiny.parts[0].silhouette.contours.filter(c=>c.hole).length,1);
assert.equal(P.rectangle([[0,0],[3,0],[3,2],[2,2],[2,1],[1,1],[1,2],[0,2]]),null);
assert.equal(P.inspect({parts:[frame],origin:[0,0,0],along:[0,0]},U).status,'unavailable');
assert.equal(P.inspect({parts:[frame],origin:[0,0,0],along:[1,0],maxTriangles:1},U).reason,'profile-resource-limit');
assert.equal(P.inspect({parts:[{id:1,triangles:[[[0,0,0],[1,0,0],[NaN,1,1]]]}],origin:[0,0,0],along:[1,0]},U).reason,'invalid-triangle');
assert.equal(P.inspect({parts:[{id:1,triangles:[[[0,0,0],[1,0,0],[1,1,0]]]}],origin:[0,0,0],along:[1,0]},U).reason,'edge-on-part:1');
console.log('Curtain profiles: outer/infill dimensions, open U, missing/partial/remote infill, ambiguous roles, holes, rotation, translation, winding and invalid-input checks passed.');
