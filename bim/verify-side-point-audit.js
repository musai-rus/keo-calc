// Read-only audit of fe653f3. Synthetic data only; no normative oracle.
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const {load,manualState}=require(root+'/test-side-point-policy.js');
const L=load(undefined,'fe653f3'),C=L.BimCalc,K=L.KEO,copy=x=>JSON.parse(JSON.stringify(x));
const cases=[];function test(name,fn){try{cases.push({name,pass:true,data:fn()})}catch(e){cases.push({name,pass:false,error:e.message})}}
const rad=x=>x*Math.PI/180,rot=(p,a)=>[p[0]*Math.cos(rad(a))-p[1]*Math.sin(rad(a)),p[0]*Math.sin(rad(a))+p[1]*Math.cos(rad(a))];
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b} (tolerance ${e})`);
function op(id,c=[3,0],nin=[0,1],w=1.5){return {id,cat:'Revit Windows',c,t:[-nin[1],nin[0]],n:nin,nin,w,d:.05,z0:.8,z1:2.6,dIn:.05,dOut:.05,dst:.4}}
function transform(o,a,shift){const p=rot(o.c,a);return {...copy(o),c:[p[0]+shift[0],p[1]+shift[1]],t:rot(o.t,a),n:rot(o.n,a),nin:rot(o.nin,a)}}
const signature=ops=>C.facets(C.clusters(ops)).map(f=>({ids:f.cls.flatMap(c=>c.ids).sort(),area:f.area})).sort((a,b)=>a.ids[0]-b.ids[0]);
test('azimuth wrap and preserved world north',()=>{
 let n=0;for(const a of [0,.001,22.499,22.501,90,180,337.499,359.999,360,720,-360]){
  const v=[Math.sin(rad(a)),Math.cos(rad(a))],base=C.azimuth(v,0);
  for(const turn of [-360,-90,-15,0,17,90,360]){const actual=C.azimuth(rot(v,turn),turn),delta=Math.abs(actual-base);assert.ok(Math.min(delta,360-delta)<1e-9);assert.equal(C.oriOf(actual),C.oriOf(base));n++}
 }return {checks:n};
});
test('cluster/facet translation rotation and opening order',()=>{
 const ops=[op(1,[1,0]),op(2,[4,0]),op(3,[3,8],[0,-1]),op(4,[0,4],[1,0])],base=signature(ops);let n=0;
 for(const a of [-181,-90,-15,0,17,90,360])for(const shift of [[0,0],[123.4,-987.6],[100000,100000]])for(const reverse of [false,true]){
  const os=ops.map(o=>transform(o,a,shift));if(reverse)os.reverse();const sig=signature(os);assert.deepEqual(sig.map(x=>x.ids),base.map(x=>x.ids));sig.forEach((x,i)=>near(x.area,base[i].area,1e-7));n++;
 }return {checks:n,base};
});
test('coplanar fragmentation preserves envelope under transforms',()=>{
 let n=0;for(const a of [0,17,90,179,359.999])for(const shift of [[0,0],[123.4,-987.6]]){
  const whole=C.clusters([transform(op(1),a,shift)])[0];
  const parts=C.clusters([transform(op(2,[2.625,0],[0,1],.75),a,shift),transform(op(3,[3.375,0],[0,1],.75),a,shift)])[0];
  near(whole.bo,parts.bo);near(whole.c[0],parts.c[0]);near(whole.c[1],parts.c[1]);near(whole.z0,parts.z0);near(whole.z1,parts.z1);n++;
 }return {checks:n};
});
test('parallel distinct planes and angular thresholds are existing heuristics',()=>{
 const out=[];
 for(const d of [.249,.251,.399,.401]){const ops=[op(1,[3,0]),op(2,[3,d])];out.push({kind:'plane-offset',d,clusters:C.clusters(ops).length,facets:signature(ops).length})}
 for(const a of [2.999,3.001]){const ops=[op(1,[1,0]),op(2,[4,0],rot([0,1],a))];out.push({kind:'normal-angle',a,facets:signature(ops).length})}
 assert.deepEqual(out.slice(0,4).map(x=>x.clusters),[1,2,2,2]);assert.deepEqual(out.slice(0,4).map(x=>x.facets),[1,1,1,2]);assert.deepEqual(out.slice(4).map(x=>x.facets),[1,2]);return out;
});
test('manual collision: equal sector does not prove physical facade',()=>{
 const rows=[];for(const angles of [[17,27],[2,12],[-.001,.001],[359.999,.001]]){
  const s=manualState(L,'A57'),w=s.side.walls[0];s.side.walls=w.windows.map((x,i)=>({...copy(w),orient:C.oriOf((angles[i]%360+360)%360),windows:[copy(x)]}));
  const r=K.compute(s);rows.push({angles,orient:s.side.walls.map(x=>x.orient),rule:K.rtOf(s),lt:K.sideInput(s).walls.map(x=>x.lt),e:r.res.eFinal});
 }assert.equal(rows[0].rule,'center');assert.equal(rows[1].rule,'far1');assert.equal(rows[0].e,2.08);assert.equal(rows[1].e,.99);assert.equal(rows[2].rule,rows[3].rule);return {observedRisk:true,rows,note:'The physical relative angle is 10 degrees in the first two inputs. Orientation sector is a climate input, not a physical facade identifier. No normative point is asserted.'};
});
// Exact point cloud transformed together with openings. Rp=null deliberately
// excludes raster visibility and boundaries; this audits the continuous adapter only.
function sample(id,kind,a=0,shift=[0,0],multiFacet=false,lib=L){
 const C=lib.BimCalc;
 const pts=[];for(let x=.25;x<6;x+=.5)for(let y=.25;y<8;y+=.5)if(!multiFacet||x<3||y<4)pts.push([x,y]);
 const base=[op(1)],ops=kind==='split'?[op(2,[2.625,0],[0,1],.75),op(3,[3.375,0],[0,1],.75)]:kind==='opposite'?[...base,op(4,[3,8],[0,-1])]:kind==='adjacent'?[...base,op(5,[0,4],[1,0],1)]:base;
 const tx=p=>{const q=rot(p,a);return [q[0]+shift[0],q[1]+shift[1]]},row=lib.DATA.rooms.find(r=>r.id===id),P=pts.map(tx),sp={key:'synthetic',rooms:[{key:'synthetic',name:row.name,num:id,area:pts.length*.25,h:3.2}]};
 const env={...lib,settings:{rho:.55,t1:3,t2:0,t4:0,region:'г. Москва',group:1,bGroup:row.g},floor:0,pts:P,Rp:null,T:null,north:a,rows:[row],roomPts:()=>P,shade:()=>({kDepth:0,blds:[]})};
 const r=C.space(sp,ops.map(o=>transform(o,a,shift)),[],env);assert.equal(r.C?.ok,true,r.err||r.C?.err);return {...r,A:rot([r.A[0]-shift[0],r.A[1]-shift[1]],-a)};
}
test('adapter exact point cloud: translations rotations and decomposition',()=>{
 let n=0;const observations=[];
 for(const id of ['A57','A60'])for(const contour of ['rectangle','L-shaped'])for(const kind of ['one','split','opposite','adjacent']){
  const base=sample(id,kind,0,[0,0],contour==='L-shaped');let maxE=0,maxPoint=0,worst=null;
  for(const a of [-90,-15,0,17,90,180,360])for(const shift of [[0,0],[123.4,-987.6]]){
   const r=sample(id,kind,a,shift,contour==='L-shaped'),de=Math.abs(r.C.res.eFinal-base.C.res.eFinal),dp=Math.hypot(r.A[0]-base.A[0],r.A[1]-base.A[1]);if(dp>maxPoint)worst={a,shift,A:r.A,e:r.C.res.eFinal};maxE=Math.max(maxE,de);maxPoint=Math.max(maxPoint,dp);assert.equal(r.multi,base.multi);n++;
  }if(kind!=='opposite'){near(maxE,0);assert.ok(maxPoint<1e-8)}observations.push({id,contour,kind,maxE,maxPoint,basePoint:base.A,baseE:base.C.res.eFinal,worst});
  const split=sample(id,'split',0,[0,0],contour==='L-shaped'),one=sample(id,'one',0,[0,0],contour==='L-shaped');near(split.C.res.eFinal,one.C.res.eFinal);assert.deepEqual(split.A,one.A);
 }return {checks:n,observations,note:'Differences are recorded, not normalized away or treated as normative correctness. L-shaped sample has no raster/visibility proof.'};
});
test('room isolation A60 and explicit manual overrides',()=>{
 const a=manualState(L,'A57'),b=manualState(L,'A60');a.side.walls.push(copy(a.side.walls[0]));b.side.walls.push(copy(b.side.walls[0]));
 const a0=K.compute(a).res.eFinal,b0=K.compute(b).res.eFinal;
 for(let i=0;i<20;i++){assert.equal(K.rtOf(b),'center');assert.equal(K.compute(b).res.eFinal,b0);assert.equal(K.compute(a).res.eFinal,a0)}
 for(const rule of ['center','far1','manual']){const s=copy(a);s.rtManual=rule;s.side.walls.forEach(w=>w.lt=5.5);assert.equal(K.rtOf(s),rule)}
 return {alternations:20,A60:b0,A57:a0,note:'No room cross-contamination observed. This does not prove geometric provenance of imported walls.'};
});
const baseline=load(undefined,'5b56e2d');
test('all transformed adapter observations reproduce exact main model',()=>{let checks=0;for(const id of ['A57','A60'])for(const mf of [false,true])for(const kind of ['one','split','opposite','adjacent'])for(const a of [-90,-15,0,17,90,180,360])for(const shift of [[0,0],[123.4,-987.6]]){const current=sample(id,kind,a,shift,mf),prior=sample(id,kind,a,shift,mf,baseline);assert.deepEqual(current.A,prior.A);assert.equal(current.multi,prior.multi);assert.deepEqual(current.C.res,prior.C.res);checks++}return {checks,note:'Observed nearest-point tie instability also occurs using the exact main model source.'}});
const report={commit:'fe653f3a93ee96adb89c1a1b516d7e009fcd1108',published:false,scope:'Read-only synthetic audit; no source or bundle edits',cases};
console.log(JSON.stringify(report,null,2));if(cases.some(x=>!x.pass))process.exitCode=1;
