/* Candidate SET invariance; no normative choice or record-order tie-break. */
const assert=require('node:assert/strict'),{load,manualState,bimMatrix}=require('../test-side-point-policy');
const L=load(),C=L.BimCalc,K=L.KEO,clone=x=>JSON.parse(JSON.stringify(x));
const R=(p,a)=>{const c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180);return[p[0]*c-p[1]*s,p[0]*s+p[1]*c]};
const grid=(Lshape=false)=>{const p=[];for(let x=.25;x<6;x+=.5)for(let y=.25;y<8;y+=.5)if(!Lshape||x<3||y<4)p.push([x,y]);return p};
const shape=[{name:'rectangle',pts:grid(),expected:[[2.75,3.75],[2.75,4.25],[3.25,3.75],[3.25,4.25]]},{name:'L samples',pts:grid(true),expected:[[2.25,3.25],[2.75,3.25]]},{name:'unique sample',pts:[[0,0],[2,0],[0,2],[2,2],[1,1]],expected:[[1,1]]}];
const precision={unit:'m',coordinateTolerance:1e-8,source:'controlled synthetic transforms bounded to 100000 m'};
let transforms=0;
for(const f of shape){
 const before=JSON.stringify(f.pts),base=C.centerCandidates(f.pts,precision);assert.deepEqual(base.candidates,f.expected);assert.equal(base.normativeConfirmed,false);assert.equal(base.status,f.expected.length===1?'unique':'ambiguous');
 for(const a of [-181,-90,-15,0,17,90,180,360])for(const shift of [[0,0],[123.4,-987.6],[100000,-100000]])for(const permutation of [0,1,2]){
  let p=f.pts.map(q=>{const t=R(q,a);return[t[0]+shift[0],t[1]+shift[1]]});
  if(permutation===1)p.reverse();if(permutation===2)p=p.filter((q,i)=>i%2).concat(p.filter((q,i)=>!(i%2)));
  const copy=JSON.stringify(p),out=C.centerCandidates(p,precision);assert.equal(JSON.stringify(p),copy);assert.equal(out.status,base.status);assert.equal(out.candidates.length,f.expected.length);
  const inverse=out.candidates.map(q=>R([q[0]-shift[0],q[1]-shift[1]],-a));
  for(const q of f.expected)assert.ok(inverse.some(x=>Math.hypot(q[0]-x[0],q[1]-x[1])<1e-7),`${f.name}, turn ${a}: missing ${q}`);
  assert.equal(out.A,undefined);assert.equal(out.chosen,undefined);transforms++;
 }
 assert.equal(JSON.stringify(f.pts),before);
 assert.deepEqual(C.centerCandidates(f.pts.concat(f.pts.slice(0,5)),precision).candidates,f.expected,'duplicate records must not reweight a geometric sample set');
}
for(const pts of [[],[[NaN,0]],[[Infinity,0]],[[0]],[[0,'1']]]){const r=C.centerCandidates(pts);assert.equal(r.status,'insufficient-data');assert.deepEqual(r.candidates,[])}
for(const magnitude of [1e200,1e308]){const r=C.centerCandidates([[-magnitude,0],[magnitude,0]],precision);assert.equal(r.reason,'numeric-range');assert.deepEqual(r.candidates,[])}
// Do not overflow call stack when collecting candidates from a larger cloud.
const many=[];for(let x=0;x<400;x++)for(let y=0;y<400;y++)many.push([x,y]);assert.equal(C.centerCandidates(many,precision).candidates.length,4);

// Exactly represented dyadic inputs must not gain candidates from large world
// coordinates or from selecting a different first record.
const exact={unit:'m',coordinateTolerance:0,source:'exact dyadic fixture'};
for(const pts of [[[0,0],[2,0],[0,2],[2+2**-20,2]],[[0,0],[2,0],[0,2],[2,2],[.5,1],[1.5+2**-20,1]]]){
 const base=C.centerCandidates(pts,exact);assert.equal(base.status,'unique');
 for(const shift of [0,13*2**20,1e9])for(const turn of [0,90,180,270]){
  const tx=([x,y])=>{for(let k=0;k<turn/90;k++)[x,y]=[-y,x];return[x+shift,y+shift]};
  const transformed=pts.map(tx);for(const ps of [transformed,transformed.slice().reverse(),transformed.slice(2).concat(transformed.slice(0,2))]){const out=C.centerCandidates(ps,exact);assert.equal(out.status,'unique');assert.deepEqual(out.candidates,base.candidates.map(tx))}
 }
}
assert.equal(C.centerCandidates(shape[0].pts).reason,'sample-precision-unconfirmed');
assert.equal(C.centerCandidates(shape[0].pts,{...precision,coordinateTolerance:-1}).status,'insufficient-data');

// New state has no selected point, scalar result, verdict or calculator replay.
const blocked=bimMatrix(L).filter(x=>x.blocked);assert.equal(blocked.length,8);assert.ok(blocked.every(x=>x.pointChoice.classification==='unconfirmed'));
for(const id of ['A57','A60'])for(const orients of [['С','С'],['С','СВ'],['С','Ю'],['unknown','unknown']]){
 const st=manualState(L,id),w=st.side.walls[0];st.side.walls=w.windows.map((x,i)=>({...clone(w),orient:orients[i],windows:[clone(x)]}));
 const before=JSON.stringify(st),r=K.compute(st);assert.equal(r.ok,false);assert.equal(r.res,undefined);assert.equal(r.pass,undefined);assert.equal(r.pointChoice.status,'insufficient-data');assert.equal(K.rtOf(st),'unknown');assert.ok(Number.isNaN(K.ltAuto('unknown',8)));assert.equal(JSON.stringify(st),before);
 for(const choice of ['center','far1','manual']){const explicit=clone(st);explicit.rtManual=choice;explicit.side.walls.forEach(w=>w.lt=5.5);assert.equal(K.rtOf(explicit),choice);assert.equal(K.compute(explicit).ok,!orients.includes('unknown'))}
}
console.log(`PASS point candidate sets: ${transforms} rotations/translations/permutations, duplicate invariance, invalid inputs, 160000 samples; unverified input blocks and explicit point remains explicit`);
