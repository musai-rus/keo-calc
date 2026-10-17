/* Historical floating nominal fit diagnostics, not production certification. Source-boundary path through the real raster; synthetic data only. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const G=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom')();
const Rectangles=new Function(fs.readFileSync(__dirname+'/rectangles.js','utf8')+';return {...BimRectangles,certify:BimRectangles.nominalDiagnostics}')();
const Sections=new Function('BimRectangles',fs.readFileSync(__dirname+'/sections.js','utf8')+';return {...BimSections,context:BimSections.rasterDiagnostics}')(Rectangles);
const Cc=new Function('BimSections',fs.readFileSync(__dirname+'/calc.js','utf8')+';return BimCalc')(Sections);
const base=fs.readFileSync(__dirname+'/test-bim.js','utf8').replace('process.exit(fails ? 1 : 0);','if(fails)throw Error("baseline fixture");');
const {env,SPC,win}=new Function('require','__dirname','console',base+';return {env,SPC,win}')(require,__dirname,{log(){}});
const scope={model:'synthetic',version:'v1',view:'3d',rooms:['room']};
function fixture({L=3.6,B=2.4,angle=0,dx=.013,dy=.017,outline=[[0,0],[L,0],[L,B],[0,B]],holes=[],extra=[],pieces=1}={}) {
 const c=Math.cos(angle),s=Math.sin(angle),world=p=>[dx+p[0]*c-p[1]*s,dy+p[0]*s+p[1]*c],cell=.05;
 const segments=[outline,...holes].flatMap(ring=>ring.flatMap((p,j)=>{const q=ring[(j+1)%ring.length];return Array.from({length:pieces},(_,k)=>[...world(p.map((x,i)=>x+(q[i]-x)*k/pieces)),...world(p.map((x,i)=>x+(q[i]-x)*(k+1)/pieces))])})).concat(extra.map(x=>[...world(x.slice(0,2)),...world(x.slice(2))]));
 const R=G.raster(segments,cell),id=R.regs.filter(r=>r&&!r.border).sort((a,b)=>b.cells-a.cells)[0]?.id;assert.ok(id,'closed synthetic source region');
 const labels=Int32Array.from(R.lab,x=>x===id?0:-1),cells=G.spaceCells(R,labels,1,4),containsPoint=p=>{const i=Math.floor((p[0]-R.minx)/cell),j=Math.floor((p[1]-R.miny)/cell);return i>=0&&j>=0&&i<R.W&&j<R.H&&R.lab[j*R.W+i]===id};
 const lantern={id:'shaft',c:world([L/2,B/2]),av:1,bv:1,round:true,dTop:1,dBot:1.2,H:4,hsf:.6,tilt:0},opening={...win('window',L/2,1),c:world([L/2,0]),t:[c,s],n:[-s,c],nin:[-s,c]};
 const args={scope,runs:cells.runs[0],cell,cut:1,grid:R,containsPoint,lanterns:[lantern],openings:[opening],boundarySegments:segments,paintSegments:G.paintSegments},ctx=Sections.context(args),e=env({pts:cells.pts[0],Rp:null,containsPoint});
 return {args,ctx,e,lantern,opening,world,segments};
}
const params=f=>({y0:f.ctx.frame.B/2,nPts:3,nPtsBasis:'Synthetic source-boundary section',confirmed:true});
const blocked=r=>{assert.ok(r.err);for(const k of ['st','C','comb','pass','e'])assert.equal(r[k],undefined)};
let total=0;function test(name,fn){fn();total++;console.log('PASS '+name)}
for(const angle of [0,Math.PI/6,Math.PI/4,-Math.PI/4,Math.PI/3,Math.PI*.37])for(const pieces of [1,3,7])test('source rectangle angle='+angle+', triangle pieces='+pieces,()=>{
 const f=fixture({angle,pieces});assert.equal(f.ctx.error,'');assert.equal(f.ctx.source.kind,'slice-segments');assert.ok(Math.abs(f.ctx.frame.L-3.6)<1e-12);assert.ok(Math.abs(f.ctx.frame.B-2.4)<1e-12);
 const record=Sections.record(f.ctx,params(f),f.e.KEO);
 for(const mode of ['top','comb']){const r=Cc.space(SPC,mode==='comb'?[f.opening]:[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record}});assert.equal(r.C.ok,true);assert.equal(r.section.mode,'manual');assert.ok(r.pts.every(f.args.containsPoint));assert.equal(r.pts.length,3);}
});
for(const angle of [0,Math.PI/6,Math.PI/4,-Math.PI/4])for(const L of [1.95,2,2.05,3.95,4,4.05])test('exact length boundary L='+L+', angle='+angle,()=>{
 const f=fixture({L,B:1.5,angle});assert.ok(f.ctx.source);assert.ok(Math.abs(f.ctx.frame.L-L)<1e-12);
 if(L>2&&L<4){assert.equal(f.ctx.error,'');Sections.record(f.ctx,params(f),f.e.KEO)}else{assert.ok(f.ctx.error);assert.throws(()=>Sections.record(f.ctx,params(f),f.e.KEO));}
});
for(const angle of [0,Math.PI/6,Math.PI/4,-Math.PI/4])for(const depth of [.001,.05,.3])test('notch remains blocked angle='+angle+', depth='+depth,()=>{
 const f=fixture({angle,outline:[[0,0],[3.6,0],[3.6,2.4],[1.55,2.4],[1.55,2.4-depth],[1.45,2.4-depth],[1.45,2.4],[0,2.4]]});assert.ok(f.ctx.error);assert.equal(f.ctx.source,undefined);assert.throws(()=>Sections.record(f.ctx,params(f),f.e.KEO));
});
for(const angle of [0,Math.PI/6,Math.PI/4,-Math.PI/4])for(const size of [.001,.05,.3])test('hole remains blocked angle='+angle+', size='+size,()=>{
 const f=fixture({angle,holes:[[[1.4,1],[1.4+size,1],[1.4+size,1+size],[1.4,1+size]]]});assert.ok(f.ctx.error);assert.throws(()=>Sections.record(f.ctx,params(f),f.e.KEO));
});
test('interior open wall cannot be ignored even when it does not split the region',()=>{const f=fixture({extra:[[1.4,.5,1.4,1]]});assert.ok(f.ctx.error);assert.throws(()=>Sections.record(f.ctx,params(f),f.e.KEO));});
test('missing source side cannot certify an existing raster',()=>{const f=fixture(),ctx=Sections.context({...f.args,boundarySegments:f.segments.slice(1)});assert.ok(ctx.error);});
test('wrong space mask is rejected instead of accepting only a few test points',()=>{const f=fixture({angle:Math.PI/6}),ctx=Sections.context({...f.args,containsPoint:p=>f.args.containsPoint(p)&&Math.hypot(p[0]-f.world([1.5,1])[0],p[1]-f.world([1.5,1])[1])>.08});assert.ok(ctx.error);});
test('source gap is rejected without extending segments to close it',()=>{const f=fixture(),segments=f.segments.slice();segments[0]=segments[0].slice();segments[0][2]-=.001;const ctx=Sections.context({...f.args,boundarySegments:segments});assert.ok(ctx.error);});
test('subcell source notch invalidates a saved profile even with the old raster',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f),f.e.KEO),notch=fixture({outline:[[0,0],[3.6,0],[3.6,2.4],[1.55,2.4],[1.55,2.399],[1.45,2.399],[1.45,2.4],[0,2.4]]}),ctx=Sections.context({...f.args,boundarySegments:notch.segments});assert.ok(ctx.error);assert.equal(Sections.resolve(ctx,record,f.e.KEO).mode,'stale');blocked(Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:ctx,record}}));});
test('source segment order and endpoint direction do not change the signature',()=>{const f=fixture({angle:Math.PI/6,pieces:3}),segments=f.segments.slice().reverse().map(s=>[s[2],s[3],s[0],s[1]]),ctx=Sections.context({...f.args,boundarySegments:segments});assert.equal(ctx.error,'');assert.equal(ctx.signature,f.ctx.signature);});
test('nearby outer wall skin participates in the same raster sampling',()=>{const f=fixture({angle:Math.PI/6,extra:[[-.01,0,-.01,2.4]]});assert.equal(f.ctx.error,'');});
test('oversized source signature is refused before a record can be persisted',()=>{const f=fixture(),ctx={...f.ctx,signature:'x'.repeat(2000001)};assert.throws(()=>Sections.record(ctx,params(f),f.e.KEO),/формат/);});
for(const [dx,dy] of [[0,0],[-20,-15],[1500,-2000]])test('translated source coordinates '+dx+','+dy,()=>{const f=fixture({angle:Math.PI/6,dx,dy});assert.equal(f.ctx.error,'');assert.ok(Math.abs(f.ctx.frame.L-3.6)<1e-9);assert.ok(Sections.preview(f.ctx,params(f),f.e.KEO).points.every(f.args.containsPoint));});
for(const outline of [[[0,0],[3.6,0],[3.6,2.2],[0,2.4]],[[0,0],[3.6,0],[3.7,2.4],[.1,2.4]]])test('convex nonrectangle is not certified',()=>{const f=fixture({outline,angle:Math.PI/6});assert.ok(f.ctx.error);});
test('unrelated distant source segments do not invalidate this space',()=>{const f=fixture({angle:Math.PI/6}),ctx=Sections.context({...f.args,boundarySegments:[...f.segments,[10,10,11,11]]});assert.equal(ctx.error,'');assert.equal(ctx.signature,f.ctx.signature);});
test('an interior degenerate source obstacle is rejected conservatively',()=>{const f=fixture({extra:[[1.4,.5,1.4,.5]]});assert.ok(f.ctx.error);});
console.log(`${total}/${total} nominal-fit diagnostic groups passed`);
