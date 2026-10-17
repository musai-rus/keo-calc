/* Historical raster diagnostics only (production context fails closed without source proof); synthetic geometry only, Node standard library. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const Sections=new Function(fs.readFileSync(__dirname+'/sections.js','utf8')+';return {...BimSections,context:BimSections.rasterDiagnostics}')();
const Cc=new Function('BimSections',fs.readFileSync(__dirname+'/calc.js','utf8')+';return BimCalc')(Sections);
const Geom=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom')();
const base=fs.readFileSync(__dirname+'/test-bim.js','utf8').replace('process.exit(fails ? 1 : 0);','if(fails) throw Error("Baseline fixture failed");');
const {env,SPC,win}=new Function('require','__dirname','console',base+';return {env,SPC,win};')(require,__dirname,{log(){}});
const scope={model:'synthetic:model:v1',version:'derivative:v1',view:'synthetic-view',level:'L1',floor:0,rooms:['synthetic-room']};
function fixture({L=3.6,B=2.4,angle=0,dx=0,dy=0,keep=()=>true}={}) {
 const cell=.05,grid={minx:-6,miny:-6,W:320,H:320},runs=[],pts=[],lab=new Set(),u=[Math.cos(angle),Math.sin(angle)],v=[-u[1],u[0]];
 const world=p=>[dx+p[0]*u[0]+p[1]*v[0],dy+p[0]*u[1]+p[1]*v[1]];
 for(let y=0;y<grid.H;y++){let start=null;for(let x=0;x<=grid.W;x++){
  const p=[grid.minx+(x+.5)*cell,grid.miny+(y+.5)*cell],px=p[0]-dx,py=p[1]-dy,q=[px*u[0]+py*u[1],px*v[0]+py*v[1]],inside=x<grid.W&&q[0]>=0&&q[0]<L&&q[1]>=0&&q[1]<B&&keep(q);
  if(inside){lab.add(y*grid.W+x);if(x%4===0&&y%4===0)pts.push(p);if(start===null)start=x;}
  if(!inside&&start!==null){runs.push([grid.minx+start*cell,grid.minx+x*cell,grid.miny+y*cell,grid.miny+(y+1)*cell]);start=null;}
 }}
 const containsPoint=p=>{const x=Math.floor((p[0]-grid.minx)/cell),y=Math.floor((p[1]-grid.miny)/cell);return x>=0&&y>=0&&x<grid.W&&y<grid.H&&lab.has(y*grid.W+x)};
 const lantern={id:'shaft',c:world([L/2,B/2]),av:1,bv:1,round:true,dTop:1,dBot:1.2,H:4,hsf:.6,tilt:0};
 const opening={...win('window',L/2,1),c:world([L/2,0]),t:u,n:v,nin:v};
 const args={scope,runs,cell,cut:1,grid,containsPoint,lanterns:[lantern],openings:[opening]},ctx=Sections.context(args),e=env({pts,Rp:null,containsPoint});
 return {args,ctx,e,lantern,opening,world};
}
const params=ctx=>({y0:ctx.frame.B/2,nPts:3,nPtsBasis:'Synthetic designer-selected three-point section',confirmed:true});
function rasterFixture(options) {
 const f=fixture(options),{L=3.6,B=2.4,outline=[[0,0],[L,0],[L,B],[0,B]],holes=[]}=options;
 const segments=[outline,...holes].flatMap(ring=>{const cs=ring.map(f.world);return cs.map((p,j)=>[...p,...cs[(j+1)%cs.length]])}),R=Geom.raster(segments,f.args.cell);
 const id=R.regs.filter(r=>r&&!r.border).sort((a,b)=>b.cells-a.cells)[0].id,lab=Int32Array.from(R.lab,x=>x===id?0:-1),cells=Geom.spaceCells(R,lab,1,4);
 const containsPoint=p=>{const x=Math.floor((p[0]-R.minx)/R.cell),y=Math.floor((p[1]-R.miny)/R.cell);return x>=0&&y>=0&&x<R.W&&y<R.H&&R.lab[y*R.W+x]===id};
 const args={...f.args,runs:cells.runs[0],grid:R,containsPoint},ctx=Sections.context(args);
 return {...f,args,ctx,e:{...f.e,pts:cells.pts[0],containsPoint}};
}
const blocked=r=>{assert.ok(r.err);for(const k of ['st','C','comb','pass','e'])assert.equal(r[k],undefined)};
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name)}
for(const mode of ['top','comb'])for(const angle of [0,Math.PI/6,-Math.PI/4])test(mode+' accepts an explicitly confirmed short rectangle, angle='+angle,()=>{
 const f=fixture({angle,dx:.013,dy:.017}),p=params(f.ctx);assert.equal(f.ctx.error,'');const record=Sections.record(f.ctx,p,f.e.KEO),r=Cc.space(SPC,mode==='comb'?[f.opening]:[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record}});
 assert.equal(r.C.ok,true);assert.equal(r.section.mode,'manual');assert.equal(r.st.top.nPts,3);assert.equal(r.st.top.nPtsBasis,p.nPtsBasis);assert.equal(r.pts.length,3);assert.ok(r.pts.every(f.e.containsPoint));
 assert.ok(Math.abs(r.st.top.L-3.6)<.1);if(r.comb)assert.ok(r.comb.e.every((e,i)=>Math.abs(e-r.comb.eTop[i]-r.comb.eSide[i])<1e-12));
});
test('auto is unchanged and no manual count is guessed',()=>{const f=fixture(),a=Cc.space(SPC,[],[f.lantern],f.e),b=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:f.ctx}});blocked(a);blocked(b);assert.equal(a.err,b.err);assert.match(a.err,/L ≤ 4/)});
test('preview has points but does not compute or create a record',()=>{const f=fixture(),p=Sections.preview(f.ctx,params(f.ctx),f.e.KEO);assert.deepEqual(p.errors,[]);assert.equal(p.points.length,3);assert.equal(p.C,undefined);assert.equal(p.st,undefined)});
for(const patch of [{y0:NaN},{y0:Infinity},{y0:-Infinity},{y0:null},{y0:''},{y0:undefined},{y0:0},{y0:99},{nPts:NaN},{nPts:Infinity},{nPts:-Infinity},{nPts:null},{nPts:''},{nPts:undefined},{nPts:0},{nPts:2},{nPts:3.5},{nPts:102},{nPtsBasis:''},{nPtsBasis:'   '},{confirmed:false}])test('rejects invalid/implicit choice '+JSON.stringify(patch),()=>{const f=fixture();assert.throws(()=>Sections.record(f.ctx,{...params(f.ctx),...patch},f.e.KEO));});
test('section continuity rejects a gap between otherwise valid points',()=>{const f=fixture(),p=params(f.ctx),ctx={...f.ctx,containsPoint:q=>f.ctx.containsPoint(q)&&!(q[0]>1.3&&q[0]<1.36)};const preview=Sections.preview(ctx,p,f.e.KEO);assert.equal(preview.points.length,3);assert.ok(preview.points.every(ctx.containsPoint));assert.ok(preview.errors.some(e=>/пересекает разрыв/.test(e)));assert.throws(()=>Sections.record(ctx,p,f.e.KEO),/разрыв/)});
test('a hand-edited record without a basis never restores numeric results',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO);record.params.nPtsBasis='';const r=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record}});blocked(r);assert.match(r.err,/обоснование/)});
for(const variant of [{L:2,B:1.5},{L:1.5,B:1},{L:4.2},{keep:q=>!(q[0]>1&&q[0]<2&&q[1]>1)},{keep:q=>!(q[0]>1.45&&q[0]<1.55&&q[1]>.8&&q[1]<1)},{keep:q=>!(q[0]>1.45&&q[0]<1.5&&q[1]>2.35)}])test('unsupported geometry remains blocked '+JSON.stringify(variant),()=>{const f=fixture(variant);assert.ok(f.ctx.error);assert.throws(()=>Sections.record(f.ctx,params(f.ctx),f.e.KEO));});
for(const change of ['model','version','view','level','rooms','geometry','hole','cut','height','tilt','opening'])test('saved profile invalidates on '+change,()=>{
 const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO);let a={...f.args,scope:{...scope}};
 if(change==='rooms')a.scope.rooms=['another-room'];else if(['model','version','view','level'].includes(change))a.scope[change]='changed';
 else if(change==='geometry')a=fixture({dx:.2}).args;else if(change==='hole')a=fixture({keep:q=>!(q[0]>1&&q[0]<1.1&&q[1]>1&&q[1]<1.1)}).args;
 else if(change==='cut')a.cut=1.1;else if(change==='height')a.lanterns=[{...f.lantern,H:4.1}];else if(change==='tilt')a.lanterns=[{...f.lantern,tilt:30}];else a.openings=[{...f.opening,z1:3}];
 const ctx=Sections.context(a),r=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:ctx,record}});blocked(r);assert.equal(r.section.mode,'stale');assert.match(r.err,/устарел/);
});
test('saved profile invalidates when the lantern changes from round to rectangular',()=>{const f=fixture(),lantern={...f.lantern,dTop:undefined,dBot:undefined},ctx=Sections.context({...f.args,lanterns:[lantern]}),record=Sections.record(ctx,params(ctx),f.e.KEO);assert.equal(Cc.space(SPC,[],[lantern],{...f.e,shortSection:{context:ctx,record}}).st.top.types[0].shape,'round');const changed={...lantern,round:false},next=Sections.context({...f.args,lanterns:[changed]});assert.notEqual(next.signature,ctx.signature);const r=Cc.space(SPC,[],[changed],{...f.e,shortSection:{context:next,record}});blocked(r);assert.equal(r.section.mode,'stale')});
test('display labels and notes do not invalidate identical geometry',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO),rename=o=>({...o,label:'Renamed display label',note:'New display note',warn:['Display warning']}),ctx=Sections.context({...f.args,openings:f.args.openings.map(rename),lanterns:f.args.lanterns.map(rename)});assert.equal(ctx.signature,f.ctx.signature);assert.equal(Sections.resolve(ctx,record,f.e.KEO).mode,'manual');assert.deepEqual(Sections.resolve(ctx,record,f.e.KEO).errors,[])});
for(const [name,make] of [['center-sampled',fixture],['G.raster + spaceCells',rasterFixture]])for(const angle of [0,Math.PI/6,Math.PI/4,-Math.PI/4])for(const L of [1.95,2,2.05,3.6,3.95,4,4.05])test(name+' length interval L='+L+', angle='+angle,()=>{
 const f=make({L,B:1.5,angle,dx:.013,dy:.017}),range=f.ctx.lengthRange;
 assert.ok(range);assert.ok(range.min<=L&&range.max>=L,'analytic rectangle length must lie inside the raster uncertainty interval');
 if(L<=2||L>=3.95){assert.ok(f.ctx.error);assert.throws(()=>Sections.record(f.ctx,params(f.ctx),f.e.KEO));const record={v:1,scope:f.ctx.scope,signature:f.ctx.signature,params:params(f.ctx)};blocked(Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record}}));}
 if(!f.ctx.error){assert.ok(range.min>2&&range.max<=4);assert.ok(L>2&&L<=4);}
});
test('real raster conservatively rejects rotated stair-step masks without relaxing concavity guard',()=>{for(const angle of [Math.PI/6,Math.PI/4,-Math.PI/4]){const f=rasterFixture({L:3.6,B:2.4,angle,dx:.013,dy:.017});assert.match(f.ctx.error,/сложный контур/);assert.throws(()=>Sections.record(f.ctx,params(f.ctx),f.e.KEO));}});
test('real raster notch and hole remain blocked',()=>{for(const geometry of [{outline:[[0,0],[3.6,0],[3.6,2.4],[1.5,2.4],[1.5,2.35],[1.45,2.35],[1.45,2.4],[0,2.4]]},{holes:[[[1.4,1],[1.5,1],[1.5,1.1],[1.4,1.1]]]}]){const f=rasterFixture({...geometry,dx:.013,dy:.017});assert.match(f.ctx.error,/сложный контур/);assert.throws(()=>Sections.record(f.ctx,params(f.ctx),f.e.KEO));}});
test('serialization retains the exact model/geometry binding and explanation',()=>{const f=fixture(),r=Sections.record(f.ctx,params(f.ctx),f.e.KEO),copy=JSON.parse(JSON.stringify({key:r}));Sections.validateRecords(copy);assert.deepEqual(Sections.resolve(f.ctx,copy.key,f.e.KEO).errors,[]);copy.key.v++;assert.equal(Sections.resolve(f.ctx,copy.key,f.e.KEO).mode,'stale');});
test('unknown model identity blocks saving instead of using a global profile',()=>{const f=fixture(),ctx=Sections.context({...f.args,scope:{...scope,model:null}});assert.throws(()=>Sections.record(ctx,params(ctx),f.e.KEO),/идентичности/)});
test('draft removes a previous numeric result without altering the stored record',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO),snapshot=JSON.stringify(record),r=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record,pending:params(f.ctx)}});blocked(r);assert.equal(r.section.mode,'draft');assert.equal(JSON.stringify(record),snapshot)});
test('same scope and geometry ignore input ordering',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO),ctx=Sections.context({...f.args,runs:f.args.runs.slice().reverse()});assert.deepEqual(Sections.resolve(ctx,record,f.e.KEO).errors,[])});
console.log(`${n}/${n} historical raster-diagnostic groups passed`);
