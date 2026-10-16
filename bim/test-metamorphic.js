/* Independent synthetic review controls. Usage: node bim/test-metamorphic.js [repo root]. */
const fs=require('fs'),assert=require('assert/strict'),root=process.argv[2]||require('path').join(__dirname,'..');
global.BimSpaces=new Function(fs.readFileSync(root+'/bim/spaces.js','utf8')+';return BimSpaces')();
const SP=BimSpaces,G=new Function(fs.readFileSync(root+'/bim/geom.js','utf8')+';return BimGeom')();
global.THREE={Matrix4:class{constructor(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}},Vector3:class{}};
function opening(points,indices,S,fam='Skylight'){
 const g={vb:new Float32Array(points.flat()),vbstride:3,attributes:{position:{itemSize:3,bytesPerItem:4}},ib:new Uint16Array(indices)};
 return G.openings({S,it:{enumNodeFragments:(id,cb)=>cb(0),getRootId:()=>0,getNodeParentId:()=>0},fl:{getGeometry:()=>g,getWorldMatrix:()=>{},getMaterial:()=>({transparent:true})}},{byCat:{'Revit Windows':[1]},info:{1:{c:'Revit Windows',fam}}})[0];
}
let geometry=0;
for(const S of[1,.001,.3048])for(const offset of[0,37,-83])for(const ang of[0,17,45,92])for(const reverse of[false,true]){
 const a=ang*Math.PI/180,ps=[[-2,-1],[2,-1],[2,1],[-2,1]].map(([x,y])=>[(x*Math.cos(a)-y*Math.sin(a)+offset)/S,(x*Math.sin(a)+y*Math.cos(a)-offset)/S,3/S]);
 if(reverse)ps.reverse();const r=opening(ps,[0,1,2,0,2,3],S);assert.ok(r.roof&&!r.round);assert.ok(Math.abs(r.av-4)<.0001&&Math.abs(r.bv-2)<.0001);assert.ok(Math.abs(r.c[0]-offset)<.0001&&Math.abs(r.c[1]+offset)<.0001);geometry++;
}
for(const S of[1,.001,.3048])for(const start of[0,.22])for(const reverse of[false,true]){
 let ps=Array.from({length:32},(_,i)=>[2*Math.cos(start+i*Math.PI/16)/S,2*Math.sin(start+i*Math.PI/16)/S,3/S]);if(reverse)ps.reverse();ps.unshift([0,0,3/S]);
 const r=opening(ps,Array.from({length:32},(_,i)=>[0,i+1,(i+1)%32+1]).flat(),S);assert.ok(r.round);assert.ok(Math.abs(r.d-4)<.0001);geometry++;
}
function raster(segs,bx=G.bounds(segs)){const R=G.raster(segs,.05,bx);R.regs.forEach(r=>{if(r?.border)R.ext.add(r.id)});return R}
const box=x=>[[x,0,x+4,0],[x+4,0,x+4,3],[x+4,3,x,3],[x,3,x,0]];let composition=0;
for(const offset of[0,20,-30])for(const rot of[0,1,2,3])for(const reverse of[false,true]){
 const T=(x,y)=>{for(let j=0;j<rot;j++)[x,y]=[-y,x];return[x+offset,y-offset]},segs=[...box(0),...box(6)].map(([a,b,c,d])=>[...T(a,b),...T(c,d)]);if(reverse)segs.reverse();
 const R=raster(segs),Rp=raster(segs),rg=R.regs.find(r=>r&&!r.border),rooms=[{key:'A',area:rg.areaC,per:rg.per,name:'Office'},{key:'B',area:rg.areaC,per:rg.per,name:'Office'}];if(reverse)rooms.reverse();
 SP.matchRooms(R,rooms);const out=SP.compose(R,Rp,rooms,()=>false,{});assert.equal(out.spaces.length,0);assert.equal(out.unknown.length,2);assert.ok(rooms.every(r=>!r.reg&&r.matchAmbiguous));composition++;
}
const unit=n=>'autodesk.unit.unit:'+n+'-1.0.1';
(async()=>{let crossLayer=0;
 for(const S of[1,.001,.3048]){
  const u=S===1?'meters':S===.001?'millimeters':'feet',a=S===1?'squareMeters':S===.001?'squareMillimeters':'squareFeet';
  const rooms=await G.rooms({m:{getPropertyDb:()=>({executeUserFunction:async()=>[{id:1,eid:'room1',name:'Office',num:'1',level:'L1',u:{Area:[24/S**2,unit(a)],Perimeter:[20/S,unit(u)],'Unbounded Height':[3/S,unit(u)]}}]})}});
  assert.ok(Math.abs(rooms[0].area-24)<1e-9);assert.ok(Math.abs(rooms[0].per-20)<1e-9);
  const segs=[[0,0,6,0],[6,0,6,4],[6,4,0,4],[0,4,0,0]],R=raster(segs),Rp=raster(segs);SP.matchRooms(R,rooms);assert.ok(rooms[0].reg);
  const out=SP.compose(R,Rp,rooms,()=>false,{});assert.equal(out.spaces.length,1);assert.equal(out.unplaced.length,0);
  const lab=SP.spaceLabel(R,Rp,out.spaces),count=Array.from(lab).filter(x=>x===0).length,rg=R.regs[rooms[0].reg];assert.equal(count,rg.cells);assert.ok(Math.abs(rg.areaC-24)<.05);assert.ok(Math.abs(count*R.cell**2-24)<20*R.cell);
  const o=opening([[2,0,.8],[4,0,.8],[4,0,2.3],[2,0,2.3]].map(p=>p.map(v=>v/S)),[0,1,2,0,2,3],S,'Window');assert.ok(Math.abs(o.w-2)<1e-6);assert.ok(Math.abs(o.z1-o.z0-1.5)<1e-6);
  assert.equal(G.assign(Rp,lab,[o],0,3).outer,1);assert.equal(o.space,0);assert.equal(o.reg,out.spaces[0].P);assert.ok(o.nin[1]>.9999);crossLayer++;
 }
 console.log(JSON.stringify({geometry,composition,crossLayer,total:geometry+composition+crossLayer,status:'PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1});
