/* Diagnostics describe evidence without changing matching or tolerances. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const SP=new Function(fs.readFileSync(__dirname+'/spaces.js','utf8')+';return BimSpaces')();
const G=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom')();
const box=(x,y,w,h)=>[[x,y,x+w,y],[x+w,y,x+w,y+h],[x+w,y+h,x,y+h],[x,y+h,x,y]];
const raster=segs=>{const R=G.raster(segs,.05,G.bounds(segs));R.regs.forEach(r=>{if(r&&r.border)R.ext.add(r.id)});return R};
const setup=()=>{const segs=box(0,0,4,3),R=raster(segs),Rp=raster(segs),r=R.regs.find(r=>r&&!r.border);return{R,Rp,r}};
let count=0;
function test(name,fn){fn();count++;console.log('OK '+name)}
test('Direct placement, exclusion and invalid area are separate stages',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'ok',area:r.areaC,per:r.per},{key:'missing',area:null},{key:'excluded',area:100}];SP.matchRooms(R,rooms);
 const c=SP.compose(R,Rp,rooms,rm=>rm.key==='excluded',{}),d=new Map(c.diagnostics.map(d=>[d.key,d]));
 assert.equal(d.get('ok').placement,'placed');assert.equal(d.get('ok').identification,'direct');assert.equal(d.get('ok').physical,'interior');
 assert.equal(d.get('missing').reason,'invalid_area');assert.equal(d.get('excluded').placement,'excluded');assert.equal(c.unplaced.length,0);
});
test('Equal contours stay ambiguous and diagnostics list their IDs',()=>{
 const segs=[...box(0,0,4,3),...box(6,0,4,3)],R=raster(segs),Rp=raster(segs),r=R.regs.find(r=>r&&!r.border),rooms=[{key:'one',area:r.areaC,per:r.per}];SP.matchRooms(R,rooms);
 const c=SP.compose(R,Rp,rooms,()=>false,{});assert.equal(c.spaces.length,0);assert.equal(c.diagnostics[0].reason,'ambiguous');assert.equal(c.diagnostics[0].candidates.strict.length,2);assert.ok(c.unknown.every(u=>u.reason==='competing_contours'));
});
test('Perimeter rejection differs from absence of area candidates',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'per',area:r.areaC,per:100},{key:'none',area:100}];SP.matchRooms(R,rooms);const c=SP.compose(R,Rp,rooms,()=>false,{});
 assert.equal(c.diagnostics[0].reason,'perimeter_rejected');assert.ok(c.diagnostics[0].candidates.perimeterRejected.length);assert.equal(c.diagnostics[1].reason,'no_area_candidate');
});
test('Matched exterior mapping is not reported as no candidate',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'outside',area:r.areaC,per:r.per}];SP.matchRooms(R,rooms);Rp.regs.forEach(r=>{if(r)Rp.ext.add(r.id)});
 const c=SP.compose(R,Rp,rooms,()=>false,{});assert.equal(c.diagnostics[0].identification,'direct');assert.equal(c.diagnostics[0].physical,'exterior');assert.equal(c.diagnostics[0].reason,'physical_exterior');
});
test('Manual and balance placement do not require rm.reg',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'balance',area:r.areaC,per:r.per}];let c=SP.compose(R,Rp,rooms,()=>false,{});assert.equal(c.diagnostics[0].placement,'placed');assert.equal(c.diagnostics[0].identification,'balance');assert.equal(rooms[0].reg,undefined);
 const p=R.lab.findIndex(id=>id===r.id),at=[R.minx+(p%R.W+.5)*R.cell,R.miny+(Math.floor(p/R.W)+.5)*R.cell];c=SP.compose(R,Rp,rooms,()=>false,{assign:[{at,keys:['balance']}]});assert.equal(c.diagnostics[0].identification,'manual');
});
test('Candidate ownership includes manual and balance claims',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'A',area:r.areaC,per:r.per},{key:'B',area:r.areaC,per:r.per}];SP.matchRooms(R,rooms);
 const p=R.lab.findIndex(id=>id===r.id),at=[R.minx+(p%R.W+.5)*R.cell,R.miny+(Math.floor(p/R.W)+.5)*R.cell];
 const c=SP.compose(R,Rp,rooms,()=>false,{assign:[{at,keys:['A']}]});const b=c.diagnostics.find(d=>d.key==='B');assert.equal(b.reason,'claimed_candidate');assert.deepEqual(b.candidates.strict[0].claimedBy,['A']);assert.equal(b.candidates.strict[0].claimSource,'manual');
});
test('Individual area evidence is distinct from rejected combined balance',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'A',area:r.areaC/2},{key:'B',area:r.areaC/2}];SP.matchRooms(R,rooms);
 const c=SP.compose(R,Rp,rooms,()=>false,{}, {aux:rm=>rm.key==='B'});
 assert.ok(c.diagnostics.every(d=>d.reason==='no_area_candidate'&&d.candidates.strict.length===0&&d.candidates.loose.length===0));
 assert.equal(c.unknown[0].reason,'mixed_auxiliary');assert.deepEqual(c.unknown[0].cands[0].keys,['A','B']);
});
test('Repeated composition diagnostics are stable across reset',()=>{
 const {R,Rp,r}=setup(),rooms=[{key:'one',area:r.areaC,per:r.per}];SP.matchRooms(R,rooms);const a=SP.compose(R,Rp,rooms,()=>false,{});SP.compose(R,Rp,rooms,()=>false,{split:[['one']]});const b=SP.compose(R,Rp,rooms,()=>false,{});assert.deepEqual(b.diagnostics,a.diagnostics);assert.deepEqual(b.spaces.map(s=>s.key),a.spaces.map(s=>s.key));
});
console.log(`${count}/${count} room-diagnostic groups passed`);
