/* Certified R perimeter, pure matching/diagnostics/balance, synthetic data only. */
const fs=require('node:fs'),assert=require('node:assert/strict'),read=n=>fs.readFileSync(__dirname+'/'+n+'.js','utf8');
const P=new Function(read('precision')+';return BimPrecision')(),G=new Function('BimPrecision',read('geom')+';return BimGeom')(P),Q=new Function('BimPrecision',read('rectangles')+';return BimRectangles')(P),SP=new Function('BimPrecision',read('spaces')+';return BimSpaces')(P);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const exact=ss=>({v:1,reference:'synthetic-authoritative-R',reconstruction:'exact',complete:true,reasons:[],entries:ss.map(s=>({bounds:s.map(x=>[x,x]),provenance:{source:'synthetic R contour, independent of Rooms'}}))});
const mark=R=>{R.regs.forEach(r=>{if(r?.border)R.ext.add(r.id)});return R};
function fixture({a=1,b=1,scale=1,dx=0,dy=0,two=false,unknown=false,notch=false,thin=false}={}){
 const world=([x,y],o=0)=>[dx+scale*(a*x-b*y)+o,dy+scale*(b*x+a*y)],B=thin?.01:1.5,ring=notch?[[0,0],[2.5,0],[2.5,B],[1.3,B],[1.3,B-.001],[1.2,B-.001],[1.2,B],[0,B]]:[[0,0],[2.5,0],[2.5,B],[0,B]];
 const ss=[0,...(two?[12]:[])].flatMap(o=>{const ps=ring.map(p=>world(p,o));return ps.map((p,j)=>[...p,...ps[(j+1)%ps.length]])}),R=mark(G.raster(ss,.05)),Rp=mark(G.raster(ss,.05)),precision=exact(ss),original=R.regs.map(r=>r?.per);if(unknown)precision.reconstruction='unknown';
 const status=Q.certifyRegionPerimeters(R,ss,precision,G.paintSegments);assert.deepEqual(R.regs.map(r=>r?.per),original,'raster perimeter must remain unchanged');
 return {R,Rp,ss,status,precision,regs:R.regs.filter(r=>r&&!r.border&&r.areaC>=.8),area:2.5*B*(a*a+b*b)*scale**2,per:2*(2.5+B)*Math.hypot(a,b)*scale};
}
const roomsFor=(f,n=1,area=f.area)=>Array.from({length:n},(_,i)=>({key:'room'+i,name:'Room '+String.fromCharCode(65+i),num:String(i),area,per:f.per}));
for(const [a,b]of [[1,0],[1,1],[1,-1],[.75,1]])for(const scale of [.5,1,1.5])for(const [dx,dy]of [[0,0],[.125,.25],[1000,-2000],[1e6,-1e6]])test('R metric before matching a/b/scale/translation '+[a,b,scale,dx,dy],()=>{
 const f=fixture({a,b,scale,dx,dy});assert.equal(f.status.confirmed,1);const r=f.regs[0],metric=SP.perimeterMetric(r);assert.equal(metric.source,'confirmed-R-boundary');assert.ok(metric.range.min<=f.per&&metric.range.max>=f.per);assert.equal(r.room,undefined);
 const rooms=roomsFor(f);SP.matchRooms(f.R,rooms);assert.equal(rooms[0].reg,r.id);assert.equal(rooms[0].matchAmbiguous,undefined);
 const c=SP.compose(f.R,f.Rp,rooms,()=>false,{}),d=c.diagnostics[0];assert.equal(d.identification,'direct');assert.equal(d.candidates.strict[0].perimeterMetric.source,'confirmed-R-boundary');assert.deepEqual(d.candidates.strict[0].perimeterRatioRange,SP.perimeterCheck(r,rooms).ratioRange);
});
for(const variant of ['strict-duplicate','competing-contours','two-by-two','loose-duplicate','loose-unique'])test('ambiguity and second-pass guards '+variant,()=>{
 const f=fixture({two:['competing-contours','two-by-two'].includes(variant)}),n=['strict-duplicate','two-by-two','loose-duplicate'].includes(variant)?2:1,rooms=roomsFor(f,n,variant.startsWith('loose')?f.regs[0].areaC/.92:f.area);SP.matchRooms(f.R,rooms);
 if(variant==='loose-unique'){assert.ok(rooms[0].reg);assert.equal(rooms[0].loose,true);}else assert.ok(rooms.every(r=>!r.reg));
 if(['strict-duplicate','competing-contours','two-by-two'].includes(variant))assert.ok(rooms.every(r=>r.matchAmbiguous));
});
for(const variant of ['unique','mixed-auxiliary','competing-contours','multiple-combinations'])test('balance uses certified interval and preserves guards '+variant,()=>{
 const f=fixture({two:variant==='competing-contours'}),rooms=[{key:'A',name:'A',num:'A',area:f.area*.4,per:f.per},{key:'B',name:'B',num:'B',area:f.area*.6,per:f.per}];if(variant==='multiple-combinations')rooms.push({key:'C',name:'C',num:'C',area:f.area,per:f.per});
 const candidates=SP.combos(rooms,[f.regs[0].areaC,f.regs[0].areaV],.6,f.regs[0]);assert.ok(candidates.length);assert.equal(candidates[0].perimeter.metric.source,'confirmed-R-boundary');
 const c=SP.compose(f.R,f.Rp,rooms,()=>false,{}, {aux:r=>variant==='mixed-auxiliary'&&r.key==='B'});
 if(variant==='unique'){assert.equal(c.spaces.length,1);assert.equal(c.spaces[0].balance.length,2);assert.ok(c.diagnostics.every(d=>d.identification==='balance'));}
 else{assert.equal(c.spaces.length,0);assert.ok(rooms.every(r=>r.byBalance===undefined));assert.ok(c.unknown.length);assert.ok(c.unknown.every(u=>u.reason===({ 'mixed-auxiliary':'mixed_auxiliary','competing-contours':'competing_contours','multiple-combinations':'multiple_combinations'}[variant])));assert.equal(c.unknown[0].cands[0].perimeter.metric.source,'confirmed-R-boundary');}
});
for(const range of [{min:NaN,max:12},{min:10,max:Infinity},{min:12,max:10},{min:0,max:12},{min:-1,max:12},null,{},[10,12]])test('invalid declared interval fails closed '+JSON.stringify(range),()=>{
 const f=fixture(),r=f.regs[0];r.perimeterEvidence.range=range;const rooms=roomsFor(f);assert.equal(SP.perimeterMetric(r).source,'invalid-certificate');SP.matchRooms(f.R,rooms);assert.equal(rooms[0].reg,undefined);assert.equal(SP.combos(rooms,[r.areaC],.6,r).length,0);
 const c=SP.compose(f.R,f.Rp,rooms,()=>false,{});assert.equal(c.spaces.length,0);assert.equal(c.diagnostics[0].reason,'perimeter_rejected');assert.equal(c.diagnostics[0].candidates.perimeterRejected[0].perimeterMetric.source,'invalid-certificate');assert.equal(SP.perimeterCheck(r,[{area:f.area}],true).ok,false);
});
for(const change of ['source','region','rasterPerimeter','state'])test('invalid binding never falls back '+change,()=>{const f=fixture(),r=f.regs[0];r.perimeterEvidence[change]=change==='region'?99:'invalid';assert.equal(SP.perimeterCheck(r,roomsFor(f)).ok,false);});
for(const [min,max]of [[.5,1.1],[.9,1.5],[.74,.76],[1.44,1.46]])test('whole interval, not midpoint, at acceptance cutoff '+min+'/'+max,()=>{
 const f=fixture(),r=f.regs[0];r.perimeterEvidence.range={min:min*f.per,max:max*f.per};const rooms=roomsFor(f);assert.equal(SP.perimeterCheck(r,rooms).ok,false);SP.matchRooms(f.R,rooms);assert.equal(rooms[0].reg,undefined);assert.equal(SP.combos(rooms,[f.area],.6,r).length,0);const d=SP.compose(f.R,f.Rp,rooms,()=>false,{}).diagnostics[0];assert.equal(d.candidates.strict.length,0);assert.equal(d.candidates.loose.length,0);assert.ok(d.candidates.perimeterRejected[0].perimeterRatioRange);
});
for(const max of [Infinity,NaN,Number.MAX_VALUE])test('certified ratio overflow or nonfinite Room perimeter '+max,()=>{const f=fixture();assert.equal(SP.perimeterCheck(f.regs[0],[{per:max}]).ok,false);});
for(const opts of [{unknown:true},{notch:true},{thin:true}])test('uncertified/near-degenerate geometry cannot substitute perimeter '+JSON.stringify(opts),()=>{const f=fixture(opts);assert.equal(f.status.confirmed,0);assert.ok(f.regs.every(r=>SP.perimeterMetric(r).source==='raster'));if(!opts.thin){const rooms=roomsFor(f);SP.matchRooms(f.R,rooms);assert.equal(rooms[0].reg,undefined);}});
test('recompute with unknown precision clears prior certificates',()=>{const f=fixture();assert.equal(f.status.confirmed,1);Q.certifyRegionPerimeters(f.R,f.ss,{...f.precision,reconstruction:'unknown'},G.paintSegments);assert.ok(f.regs.every(r=>!r.perimeterEvidence));});
test('R source includes Room Separation; physical-only or Rp source cannot stand in',()=>{
 const physical=[[0,0,2.5,0],[2.5,0,5,0],[5,0,5,3],[5,3,2.5,3],[2.5,3,0,3],[0,3,0,0]],sep=[[2.5,0,2.5,3]],ss=physical.concat(sep),R=G.raster(ss,.05);
 assert.equal(Q.certifyRegionPerimeters(R,physical,exact(physical),G.paintSegments).confirmed,0);
 assert.equal(Q.certifyRegionPerimeters(R,ss,exact(ss),G.paintSegments).confirmed,2);
});
// Independent exact validation of the result, not a copy of the search algorithm.
function integer(x){const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,x);const b=d.getBigUint64(0),e=Number((b>>52n)&2047n);return ((b&((1n<<52n)-1n))+(e?1n<<52n:0n))<<BigInt(e?e-1:0);}
for(const exponent of [-1074,-1073,-1022,-500,-1,0,1,500,1023])for(const norm of [1n,2n,5n,1n<<4096n])test('root bracket covers finite/subnormal/near-degenerate exponent='+exponent+'/normbits='+norm.toString(2).length,()=>{
 const x=2**exponent,s=integer(x),c={span:[s,s],norm},q=Q.exactLengthRange(c);assert.ok(q);const lo=integer(q.min),hi=integer(q.max);assert.ok(lo*lo*norm<=s*s&&hi*hi*norm>=s*s);assert.ok(q.min===q.max||P.next(q.min,true)===q.max);
 // Caller guesses, even invalid or very remote, cannot affect the result.
 assert.deepEqual(Q.exactLengthRange(c,NaN),q);assert.deepEqual(Q.exactLengthRange(c,1e300),q);
});
for(const c of [null,{}, {norm:0n,span:[1n,1n]},{norm:-1n,span:[1n,1n]},{norm:1,span:[1n,1n]},{norm:1n,span:[]},{norm:1n,span:[1n,-1n]},{norm:1n,span:[1,2]},{norm:1n,span:[0n,0n]},{norm:1n,span:[integer(Number.MAX_VALUE)*2n,1n]}])test('invalid/overflowing exact length certificate',()=>assert.equal(Q.exactLengthRange(c),null));
test('legacy scalar comparisons and missing perimeter behavior remain unchanged',()=>{
 assert.equal(SP.perimeterCheck(12,[{per:12}]).ok,true);assert.equal(SP.perimeterCheck(12,[{}]).ok,true);assert.equal(SP.perimeterCheck(0,[{per:12}],true).ok,true);assert.equal(SP.perimeterCheck(0,[{per:12}]).ok,false);assert.deepEqual(SP.combos([{key:'r',area:10,per:14}],[10],.1,14).map(x=>Object.keys(x)),[['sel','d','sum']]);
});
console.log(`${count}/${count} certified-perimeter groups passed`);
