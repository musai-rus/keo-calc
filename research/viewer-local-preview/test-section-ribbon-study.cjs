const assert=require('node:assert/strict'),P=require('./section-ribbon-study'),R=require('./section-ribbon');
const loop=[[0,1],[4,1],[4,3],[0,3]],source={test:'synthetic-source'};
const section={status:'closed-section',loops:[loop]},bounds={lo:[0,1,0],hi:[4,3,3]};
const a={version:2,source,z:1,errors:[],scope:{lo:[-2,-4],hi:[6,6]},rooms:[{id:11,section,bounds}],structures:[
  {fragment:100,ancestors:[{id:7}],section,bounds},
  {fragment:101,ancestors:[{id:8}],section,bounds},
  {fragment:102,ancestors:[{id:9}],section:{status:'unavailable'},bounds}
]};
const faces={source,faces:[{fragment:1,assemblyId:7,z0:0,z1:3,centre:[2,0],along:[1,0],width:4}]};
const cell={source,candidates:[{fragment:1,ancestors:[{IfcClass:'IfcPlate'}],result:{patches:[{status:'planar-contour',inclinationDeg:90,area:12,normal:[0,1,0]}]}}]};
const jobs=P.prepare(a,cell,faces);assert.equal(jobs.length,1);
assert.deepEqual(jobs[0].input.regions.map(r=>r.id),['room:11','fragment:101','fragment:102']);
assert.equal(jobs[0].input.regions[2].kind,'uncertain');
assert.deepEqual(jobs[0].input.segment,[[0,0],[4,0]]);
assert.equal(R.inspect(jobs[0].input).status,'ribbon');
const copy=x=>JSON.parse(JSON.stringify(x));
let bad=copy(a);bad.source.test='other';assert.throws(()=>P.prepare(bad,cell,faces));
bad=copy(a);bad.errors.push('partial');assert.throws(()=>P.prepare(bad,cell,faces));
bad=copy(a);bad.busy=true;assert.throws(()=>P.prepare(bad,cell,faces));
bad=copy(a);bad.version=1;assert.throws(()=>P.prepare(bad,cell,faces));
bad=copy(cell);bad.candidates[0].result.patches[0].normal[2]=1e-8;
assert.equal(P.prepare(a,bad,faces)[0].rejected,'nonvertical-face-requires-height-intersection');
bad=copy(cell);bad.candidates[0].ancestors[0].IfcClass='IfcDoor';assert.equal(P.prepare(a,bad,faces).length,0);
bad=copy(a);bad.z=3;assert.equal(P.prepare(bad,cell,faces).length,0);
bad=copy(a);bad.rooms[0].section={status:'unavailable'};assert.equal(P.prepare(bad,cell,faces)[0].input.regions[0].kind,'uncertain');
console.log('Ribbon study: snapshot guards, own-assembly exclusion, other assemblies, uncertainty envelopes, nonvertical planes and height endpoints passed.');
