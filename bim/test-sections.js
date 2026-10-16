/* Explicit short-section contract; synthetic geometry only, Node standard library. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const Sections=new Function(fs.readFileSync(__dirname+'/sections.js','utf8')+';return BimSections')();
const Cc=new Function('BimSections',fs.readFileSync(__dirname+'/calc.js','utf8')+';return BimCalc')(Sections);
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
const blocked=r=>{assert.ok(r.err);for(const k of ['st','C','comb','pass','e'])assert.equal(r[k],undefined)};
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name)}
for(const mode of ['top','comb'])for(const angle of [0,Math.PI/6,-Math.PI/4])test(mode+' accepts an explicitly confirmed short rectangle, angle='+angle,()=>{
 const f=fixture({angle,dx:.013,dy:.017}),p=params(f.ctx);assert.equal(f.ctx.error,'');const record=Sections.record(f.ctx,p,f.e.KEO),r=Cc.space(SPC,mode==='comb'?[f.opening]:[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record}});
 assert.equal(r.C.ok,true);assert.equal(r.section.mode,'manual');assert.equal(r.st.top.nPts,3);assert.equal(r.st.top.nPtsBasis,p.nPtsBasis);assert.equal(r.pts.length,3);assert.ok(r.pts.every(f.e.containsPoint));
 assert.ok(Math.abs(r.st.top.L-3.6)<.1);if(r.comb)assert.ok(r.comb.e.every((e,i)=>Math.abs(e-r.comb.eTop[i]-r.comb.eSide[i])<1e-12));
});
test('auto is unchanged and no manual count is guessed',()=>{const f=fixture(),a=Cc.space(SPC,[],[f.lantern],f.e),b=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:f.ctx}});blocked(a);blocked(b);assert.equal(a.err,b.err);assert.match(a.err,/L ≤ 4/)});
test('preview has points but does not compute or create a record',()=>{const f=fixture(),p=Sections.preview(f.ctx,params(f.ctx),f.e.KEO);assert.deepEqual(p.errors,[]);assert.equal(p.points.length,3);assert.equal(p.C,undefined);assert.equal(p.st,undefined)});
for(const patch of [{y0:NaN},{y0:Infinity},{y0:0},{y0:99},{nPts:0},{nPts:2},{nPts:3.5},{nPts:102},{nPtsBasis:''},{nPtsBasis:'   '},{confirmed:false}])test('rejects invalid/implicit choice '+JSON.stringify(patch),()=>{const f=fixture();assert.throws(()=>Sections.record(f.ctx,{...params(f.ctx),...patch},f.e.KEO));});
for(const variant of [{L:2,B:1.5},{L:1.5,B:1},{L:4.2},{keep:q=>!(q[0]>1&&q[0]<2&&q[1]>1)},{keep:q=>!(q[0]>1.45&&q[0]<1.55&&q[1]>.8&&q[1]<1)},{keep:q=>!(q[0]>1.45&&q[0]<1.5&&q[1]>2.35)}])test('unsupported geometry remains blocked '+JSON.stringify(variant),()=>{const f=fixture(variant);assert.ok(f.ctx.error);assert.throws(()=>Sections.record(f.ctx,params(f.ctx),f.e.KEO));});
for(const change of ['model','version','view','level','rooms','geometry','hole','cut','height','opening'])test('saved profile invalidates on '+change,()=>{
 const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO);let a={...f.args,scope:{...scope}};
 if(change==='rooms')a.scope.rooms=['another-room'];else if(['model','version','view','level'].includes(change))a.scope[change]='changed';
 else if(change==='geometry')a=fixture({dx:.2}).args;else if(change==='hole')a=fixture({keep:q=>!(q[0]>1&&q[0]<1.1&&q[1]>1&&q[1]<1.1)}).args;
 else if(change==='cut')a.cut=1.1;else if(change==='height')a.lanterns=[{...f.lantern,H:4.1}];else a.openings=[{...f.opening,z1:3}];
 const ctx=Sections.context(a),r=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:ctx,record}});blocked(r);assert.equal(r.section.mode,'stale');assert.match(r.err,/устарел/);
});
test('serialization retains the exact model/geometry binding and explanation',()=>{const f=fixture(),r=Sections.record(f.ctx,params(f.ctx),f.e.KEO),copy=JSON.parse(JSON.stringify({key:r}));Sections.validateRecords(copy);assert.deepEqual(Sections.resolve(f.ctx,copy.key,f.e.KEO).errors,[]);copy.key.v++;assert.equal(Sections.resolve(f.ctx,copy.key,f.e.KEO).mode,'stale');});
test('unknown model identity blocks saving instead of using a global profile',()=>{const f=fixture(),ctx=Sections.context({...f.args,scope:{...scope,model:null}});assert.throws(()=>Sections.record(ctx,params(ctx),f.e.KEO),/идентичности/)});
test('draft removes a previous numeric result without altering the stored record',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO),snapshot=JSON.stringify(record),r=Cc.space(SPC,[],[f.lantern],{...f.e,shortSection:{context:f.ctx,record,pending:params(f.ctx)}});blocked(r);assert.equal(r.section.mode,'draft');assert.equal(JSON.stringify(record),snapshot)});
test('same scope and geometry ignore input ordering',()=>{const f=fixture(),record=Sections.record(f.ctx,params(f.ctx),f.e.KEO),ctx=Sections.context({...f.args,runs:f.args.runs.slice().reverse()});assert.deepEqual(Sections.resolve(ctx,record,f.e.KEO).errors,[])});
console.log(`${n}/${n} short-section groups passed`);
