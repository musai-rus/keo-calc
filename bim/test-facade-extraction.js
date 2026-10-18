/* Read-only integration assessment of the actual Viewer-shaped extraction.
   Synthetic triangles demonstrate the information lost before grouping. */
const fs=require('node:fs'),assert=require('node:assert/strict');
global.THREE={Matrix4:class{constructor(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}},Vector3:class{}};
const G=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom;')();
function extract(rectangles){
 const meshes=rectangles.map(([x0,z0,x1,z1])=>({vb:new Float32Array([x0,0,z0,x1,0,z0,x1,0,z1,x0,0,z1]),vbstride:3,attributes:{position:{itemSize:3,bytesPerItem:4}},ib:new Uint16Array([0,1,2,0,2,3])}));
 const C={S:1,it:{getRootId:()=>0,getNodeParentId:()=>0,enumNodeFragments:(id,cb)=>meshes.forEach((g,i)=>cb(i))},fl:{getMaterial:()=>({transparent:true}),getGeometry:i=>meshes[i],getWorldMatrix:()=>{}}};
 const ops=G.openings(C,{byCat:{'Revit Windows':[1]},info:{1:{c:'Revit Windows',fam:'Synthetic window'}}});assert.equal(ops.length,1);return ops[0];
}
const ring=extract([[0,0,3,1],[0,2,3,3],[0,1,1,2],[2,1,3,2]]);
assert.equal(ring.w*(ring.z1-ring.z0),9); // actual triangle area is 8; one hole
const disconnected=extract([[0,0,1,1],[3,0,4,1]]);
assert.equal(disconnected.w*(disconnected.z1-disconnected.z0),4); // actual area 2
for(const op of [ring,disconnected])for(const key of ['fragmentIds','triangles','vertices','loops','holes','hostId','nativeRoomId','precision','matrix'])assert.equal(op[key],undefined);
assert.ok(ring.c&&ring.t&&ring.n); // derived bounding rectangle is available
console.log('PASS actual extraction assessment: ring hole and disconnected glass become one bbox; source topology, fragment/matrix provenance and native host/room proof are absent');
