const assert=require('node:assert/strict'),B=require('./vertical-section-bands'),S=require('./surface-band-study'),R=require('./section-ribbon'),N=require('../../bim/native-spaces');
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function extrude(loops,z0,z1){return loops.flatMap(loop=>loop.flatMap((a,i)=>{const b=loop[(i+1)%loop.length],p=[...a,z0],q=[...b,z0],r=[...b,z1],s=[...a,z1];return [[p,q,r],[p,r,s]];}));}
const copy=x=>JSON.parse(JSON.stringify(x)),box=ts=>({lo:[0,1,2].map(k=>Math.min(...ts.flat().map(p=>p[k]))),hi:[0,1,2].map(k=>Math.max(...ts.flat().map(p=>p[k])))});
const loop=rect(0,1,4,5),hole=rect(1,2,2,3),ts=extrude([loop,hole],0,3),proof=B.certify(ts);
assert.equal(proof.status,'constant-section-bands');assert.equal(proof.rectangles.length,8);
const section=B.section(proof,.1,2.9,N);assert.equal(section.status,'closed-section');assert.equal(section.area,15);assert.equal(section.loops.length,2);
assert.equal(section.bandInteriorVerified,true);assert.equal(proof.solidVerified,false);
assert.equal(B.certify(ts.slice(1)).status,'unsupported');
assert.equal(B.certify([...ts,ts[0]]).status,'unsupported');
const wrongPair=copy(ts);wrongPair[1]=[ts[0][0],ts[0][1],ts[1][2]];assert.equal(B.certify(wrongPair).status,'unsupported');
const sloped=copy(ts);sloped[0][2][0]+=.1;assert.equal(B.certify(sloped).status,'unsupported');
const open=B.certify(ts.slice(2));assert.equal(open.status,'constant-section-bands');assert.equal(B.section(open,.2,2.8,N).status,'unavailable');
const bad=copy(ts);bad[0][0][0]=NaN;assert.equal(B.certify(bad).status,'unsupported');
assert.equal(B.certify(ts,{maxTriangles:1}).status,'unsupported');
const shifted=ts.map(t=>t.map(p=>[p[0]+1e6,p[1]-1e6,p[2]+100]));assert.equal(B.section(B.certify(shifted),100.1,102.9,N).area,15);
const source={test:'synthetic-only'},roomTriangles=extrude([loop],0,3),thinTriangles=extrude([rect(1,.25,2,.5)],1.11,1.11000002);
const capture={version:1,source,busy:false,errors:[],completedAt:'synthetic',scope:{lo:[-2,-3,0],hi:[6,7,3]},rooms:[{id:1,bounds:box(roomTriangles),triangles:roomTriangles}],structures:[{fragment:9,ancestors:[{id:200}],bounds:box(thinTriangles),triangles:thinTriangles}]};
const face={fragment:7,assemblyId:100,centre:[2,0],along:[1,0],width:4};
const patch={status:'planar-contour',inclinationDeg:90,normal:[0,1,0],area:12,loops:[[[0,0],[4,0],[4,3],[0,3]]],worldLoops:[[[0,0,0],[4,0,0],[4,0,3],[0,0,3]]]};
const original={ancestors:[{IfcClass:'IfcPlate'}],result:{patches:[patch]}};
const run=(a=capture,changes={})=>S.inspect({capture:a,rows:S.prepare(a,B),face,original,B,N,R,...changes});
// Independent Moller-Trumbore intersections of the supplied 3D triangles.
const sub=(a,b)=>a.map((x,k)=>x-b[k]),dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function hit(o,tri){const d=[0,1,0],e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-15)return Infinity;const t=sub(o,tri[0]),u=dot(t,p)/det,q=cross(t,e1),v=dot(d,q)/det,dist=dot(e2,q)/det;return u>=0&&v>=0&&u+v<=1&&dist>0?dist:Infinity;}
(async()=>{
  const out=await run();assert.equal(out.status,'surface-bands');assert.equal(out.bands.length,3);
  assert.equal(B.section(B.certify(thinTriangles),1,2,N).reason,'band-crosses-mesh-event');
  let checks=0;
  for(const z of [.17,.91,1.11000001,1.9,2.87])for(const x of [.31,1.23,1.77,2.39,3.81]){
    const b=out.bands.find(b=>b.zRange[0]<z&&b.zRange[1]>z),c=out.ribbons[b.ribbonIndex].sides[1].cells.find(c=>c.range[0]<x&&c.range[1]>x);
    const o=[x,0,z],room=Math.min(...roomTriangles.map(t=>hit(o,t))),wall=Math.min(...thinTriangles.map(t=>hit(o,t)));
    assert.deepEqual(c.first.ids,[wall<room?'fragment:9':'room:1']);checks++;
  }
  assert.equal(out.ownershipVerified,false);assert.equal(out.keo,null);assert.equal(out.eventPlanesVerified,false);
  assert.equal((await run(capture,{maxBands:1})).reason,'height-band-resource-limit');
  const unknown=copy(capture);unknown.structures[0].triangles[0][0][0]+=.01;
  const u=await run(unknown),ub=u.bands.find(b=>b.zRange[0]<1.11000001&&b.zRange[1]>1.11000001),uc=u.ribbons[ub.ribbonIndex].sides[1].cells.find(c=>c.range[0]<1.5&&c.range[1]>1.5);
  assert.deepEqual(uc.first.kinds,['uncertain']);assert.deepEqual(uc.nearestRoom.ids,['room:1']);
  const own=copy(capture);own.structures[0].ancestors=[{id:100}];assert.equal((await run(own)).bands.length,1);
  const snapshot=copy(capture);snapshot.busy=true;assert.throws(()=>S.prepare(snapshot,B));snapshot.busy=false;snapshot.errors=['partial'];assert.throws(()=>S.prepare(snapshot,B));
  const unsupported=copy(original);unsupported.result.patches[0].normal[2]=1e-12;assert.equal((await run(capture,{original:unsupported})).status,'unavailable');
  const nonrectangle=copy(original);nonrectangle.result.patches[0].worldLoops[0][1][2]=.1;assert.equal((await run(capture,{original:nonrectangle})).status,'unavailable');
  const crossed=copy(original);[crossed.result.patches[0].worldLoops[0][1],crossed.result.patches[0].worldLoops[0][2]]=[crossed.result.patches[0].worldLoops[0][2],crossed.result.patches[0].worldLoops[0][1]];assert.equal((await run(capture,{original:crossed})).status,'unavailable');
  const midpoint=copy(original);midpoint.result.patches[0].loops[0].splice(1,0,[2,0]);midpoint.result.patches[0].worldLoops[0].splice(1,0,[2,0,0]);assert.equal((await run(capture,{original:midpoint})).status,'surface-bands');
  console.log(`Surface bands: ${checks} independent 3D ray intersections; holes, narrow height band, malformed/open/sloped meshes, conservative uncertainty, own assembly, domain and limits passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
