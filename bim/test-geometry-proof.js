/* Three-state production contract; all geometry is synthetic, no model data. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(__dirname+'/'+n+'.js','utf8');
const P=new Function(read('precision')+';return BimPrecision')();
const G=new Function('BimPrecision',read('geom')+';return BimGeom')(P);
const Rct=new Function('BimPrecision',read('rectangles')+';return BimRectangles')(P);
const S=new Function('BimRectangles',read('sections')+';return BimSections')(Rct);
const scope={model:'synthetic-proof',version:'v1',view:'3d',rooms:['r']};
const exact=ss=>({v:1,reference:'synthetic authoritative segments',reconstruction:'exact',complete:true,reasons:[],entries:ss.map(s=>({bounds:s.map(x=>[x,x]),provenance:{source:'synthetic exact binary64 coordinates'}}))});
function fixture({ring=[[0,0],[3.6,0],[3.6,2.4],[0,2.4]],extra=[],matrix=[1,0,0,1,0,0],radius=0,precision=true}={}){
 const [a,b,c,d,tx,ty]=matrix,world=([x,y])=>[a*x+c*y+tx,b*x+d*y+ty],points=ring.map(world),ss=points.map((p,i)=>[...p,...points[(i+1)%points.length]]).concat(extra.map(s=>[...world(s.slice(0,2)),...world(s.slice(2))]));
 const grid=G.raster(ss,.05),reg=grid.regs.filter(r=>r&&!r.border).sort((a,b)=>b.cells-a.cells)[0];assert.ok(reg);
 const labels=Int32Array.from(grid.lab,x=>x===reg.id?0:-1),runs=G.spaceCells(grid,labels,1,1).runs[0],containsPoint=p=>G.labelAt(grid,...p)===reg.id;
 const metadata=exact(ss);if(radius){metadata.reconstruction='bounded';metadata.entries=ss.map(s=>({bounds:s.map(x=>[P.next(x-radius,false),P.next(x+radius,true)]),provenance:{source:'independent quantizer contract',radius}}));}
 const args={scope,runs,grid,cell:grid.cell,cut:1,containsPoint,boundarySegments:ss,boundaryPrecision:precision?metadata:undefined,paintSegments:G.paintSegments};
 return {args,ctx:S.context(args),ss};
}
let n=0;const test=(name,fn)=>{fn();n++;console.log('PASS '+name)};
const inside=(x,b)=>assert.ok(b&&b[0]<=x&&b[1]>=x,`${x} not in ${b}`);
for(const matrix of [[1,0,0,1,0,0],[0,1,-1,0,.125,-.25],[-1,0,0,-1,-128,256],[.75,0,0,.5,1024,-2048],[.75,1,-1,.75,.125,.25]])test('exact rectangle transforms '+matrix,()=>{
 const ring=matrix[0]===.75&&matrix[1]===1?[[0,0],[3,0],[3,1.5],[0,1.5]]:undefined,f=fixture({matrix,ring});
 assert.equal(f.ctx.geometryProof.state,'confirmed');assert.equal(f.ctx.source.proof,'exact-dyadic-predicates');
});
for(const angle of [Math.PI/18,Math.PI/6,Math.PI/4,Math.PI*.37])for(const translation of [0,1000])test('floating rotated endpoints cannot become an exact proof '+angle+'/'+translation,()=>{
 const c=Math.cos(angle),s=Math.sin(angle),f=fixture({matrix:[c,s,-s,c,translation,-translation]});
 // Some IEEE constructions are exactly rectangular; the exact predicate decides.
 if(f.ctx.geometryProof.state==='confirmed')assert.ok(Rct.exactRectangle(f.ss,f.ctx.source.segments));else assert.ok(f.ctx.error);
});
for(const radius of [1e-12,1e-6,1/65535,.001,.01])for(const angle of [0,Math.PI/6])test('nonzero bound never certifies rectangle radius='+radius+'/'+angle,()=>{
 const c=Math.cos(angle),s=Math.sin(angle),f=fixture({radius,matrix:[c,s,-s,c,0,0]});assert.equal(f.ctx.geometryProof.state,'insufficient');assert.ok(f.ctx.error);assert.equal(f.ctx.source,undefined);
});
for(const delta of [1e-13,1e-9,1e-6,.0001,.001])test('almost rectangle is never confirmed delta='+delta,()=>{
 const f=fixture({ring:[[0,0],[3.6,0],[3.6,2.4],[0,2.4+delta]]});assert.notEqual(f.ctx.geometryProof.state,'confirmed');assert.ok(f.ctx.error);
});
for(const depth of [.001,.002,.004,.006])for(const angle of [0,Math.PI/6,Math.PI/4])test('real small notch remains blocked '+depth+'/'+angle,()=>{
 const c=Math.cos(angle),s=Math.sin(angle),f=fixture({ring:[[0,0],[3.6,0],[3.6,2.4],[1.55,2.4],[1.55,2.4-depth],[1.45,2.4-depth],[1.45,2.4],[0,2.4]],matrix:[c,s,-s,c,0,0]});assert.notEqual(f.ctx.geometryProof.state,'confirmed');assert.ok(f.ctx.error);
});
for(const size of [.001,.002,.004,.006])for(const radius of [0,1e-6,.0001])test('bounded interior micro obstacle has contradiction witness '+size+'/'+radius,()=>{
 const f=fixture({extra:[[1.4,1,1.4+size,1],[1.4+size,1,1.4+size,1+size],[1.4+size,1+size,1.4,1+size],[1.4,1+size,1.4,1]],radius});
 assert.equal(f.ctx.geometryProof.state,'contradicted');assert.equal(f.ctx.geometryProof.reason,'source-obstacle-inside-center-hull');assert.ok(f.ctx.geometryProof.witness);assert.ok(f.ctx.error);
});
test('unknown precision remains insufficient even with apparent internal obstacle',()=>{const f=fixture({extra:[[1.4,1,1.401,1]],precision:false});assert.equal(f.ctx.geometryProof.state,'insufficient');});
test('missing source cannot fall back to raster permission',()=>{const f=fixture(),a={...f.args};delete a.boundarySegments;delete a.boundaryPrecision;const ctx=S.context(a);assert.equal(ctx.geometryProof.state,'insufficient');assert.ok(ctx.error);});
for(const patch of [{complete:false},{reconstruction:'unknown'},{entries:[]},{entries:{}},{entries:[null]},{entries:[{bounds:[0]}]},{v:99}])test('incomplete precision fails closed '+JSON.stringify(patch),()=>{const f=fixture(),ctx=S.context({...f.args,boundaryPrecision:{...f.args.boundaryPrecision,...patch}});assert.equal(ctx.geometryProof.state,'insufficient');assert.ok(ctx.error);});
test('precision change invalidates saved geometry signature',()=>{const f=fixture(),g=fixture({radius:1e-6});assert.notEqual(f.ctx.signature,g.ctx.signature);assert.ok(g.ctx.error);});
for(const code of [0,1,1023,32767,32768,65534,65535])for(const rule of ['nearest','directed',undefined])test('unorm16 decode cell '+code+'/'+rule,()=>{
 const c=P.decodeCell(code,'unorm16-centered',rule);inside(code/65535-.5,c.arithmetic);if(rule)inside(c.value,c.input);else assert.equal(c.input,null);
});
for(const value of [0,-0,2**-149,-(2**-149),.5,1,-1,Math.fround(.1),2**24])for(const rule of ['nearest','directed','exact',undefined])test('float32 cell '+value+'/'+rule,()=>{
 const c=P.decodeCell(value,'float32',rule);inside(value,c.arithmetic);if(rule)inside(value,c.input);else assert.equal(c.input,null);
});
for(const scale of [.001,.3048,1,1000])for(const angle of [0,Math.PI/6,Math.PI/4])for(const translation of [0,1e6])test('quantization + transform + slice bounds '+scale+'/'+angle+'/'+translation,()=>{
 const c=Math.cos(angle),s=Math.sin(angle),m=[2*c,2*s,0,0,-3*s,3*c,0,0,0,0,4,0,translation,-translation,2,1];
 const code=[12000,30000,45000],local=code.map(x=>P.decodeCell(x,'unorm16-centered','nearest').input),bounds=P.transform(local,m);
 // Quantizer-cell extremes are independent of the room discrepancy.
 for(const dx of [0,1])for(const dy of [0,1])for(const dz of [0,1]){
  const v=[local[0][dx],local[1][dy],local[2][dz]],q=[0,1,2].map(k=>m[k]*v[0]+m[k+4]*v[1]+m[k+8]*v[2]+m[k+12]);q.forEach((x,k)=>inside(x,bounds[k]));
 }
 const aa={bounds:P.transform([[.1,.1],[.2,.2],[-.5,-.5]],m)},bb={bounds:P.transform([[.3,.3],[.4,.4],[.5,.5]],m)},cut=2*scale,seg=P.intersection(aa,bb,cut,scale);
 assert.ok(seg.bounds);const point=[.2,.3,0],world=[0,1].map(k=>(m[k]*point[0]+m[k+4]*point[1]+m[k+12])*scale);world.forEach((x,k)=>inside(x,seg.bounds[k]));
});
test('slice through uncertain vertex or denominator fails closed',()=>{
 const a={bounds:[[0,0],[0,0],[-1,1]]},b={bounds:[[1,1],[1,1],[1,2]]};assert.equal(P.intersection(a,b,0,1).bounds,null);
 assert.equal(P.div([1,2],[-1,1]),null);assert.equal(P.intersection({bounds:null},b,0,1).bounds,null);
});
test('actual decoder verification and exporter provenance are separate',()=>{
 const raw=new Uint16Array([0,32768,65535,0]),g={vb:new Float32Array(raw.buffer),vbstride:2,attributes:{position:{itemSize:4,bytesPerItem:2,normalized:true,offset:0}}},m=[1,0,0,0,0,1,0,0,0,0,1,0,10,20,30,1];
 const p=P.vertex(g,m,0,[-.5,32768/65535-.5,.5]);assert.equal(p.provenance.decoder,'unorm16-centered');assert.equal(p.provenance.reconstruction,'unknown');assert.ok(p.bounds);assert.equal(P.vertex(g,m,0,[0,0,0]).bounds,null);
});

for(const packed of [false,true])for(const scale of [.001,.3048,1000])test('actual G.slice keeps numbers and annotates decoded arithmetic '+packed+'/'+scale,()=>{
 const codes=[[0,10000,0],[40000,10000,65535],[40000,50000,65535]],pts=codes.map(v=>v.map(x=>x/65535-.5));
 const vb=packed?new Float32Array(new Uint16Array(codes.flatMap(p=>[...p,0])).buffer):new Float32Array(pts.flat());
 const g={vb,vbstride:packed?2:3,ib:new Uint16Array([0,1,2]),attributes:{position:{itemSize:packed?4:3,bytesPerItem:packed?2:4,normalized:packed,offset:0}}};
 const m=[1.5,2,0,0,-2,1.5,0,0,0,0,4,0,1000,-2000,2,1];
 global.THREE={Matrix4:class{constructor(){this.elements=m.slice()}},Vector3:class{}};
 global.Autodesk={Viewing:{Private:{VertexEnumerator:{makeReadPositionFunc:g=>(i,p)=>{const raw=new Uint16Array(g.vb.buffer);['x','y','z'].forEach((k,j)=>p[k]=packed?raw[i*4+j]/65535-.5:g.vb[i*3+j]);}}}}};
 const C={S:scale,it:{enumNodeFragments:(id,cb)=>cb(17)},fl:{getGeometry:()=>g,getWorldMatrix:()=>{}}},cat={byCat:{Walls:[123]}},z=2*scale,ss=G.slice(C,cat,['Walls'],z);
 assert.equal(ss.length,1);assert.equal(ss.precision.reconstruction,'unknown');assert.equal(ss.precision.entries[0].provenance.fragment,17);assert.equal(ss.precision.entries[0].provenance.unitScale,scale);
 assert.equal(ss.precision.entries[0].provenance.vertices[0].decoder,packed?'unorm16-centered':'float32');ss[0].forEach((x,k)=>inside(x,ss.precision.entries[0].bounds[k]));
 const decoded=packed?pts:Array.from({length:3},(_,i)=>Array.from(g.vb.slice(i*3,i*3+3))),world=decoded.map(p=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]));
 const expected=[];for(let i=0;i<3;i++){const j=(i+1)%3,da=world[i][2]-2,db=world[j][2]-2;if((da>0)!==(db>0)){const t=da/(da-db);expected.push(...[0,1].map(k=>(world[i][k]+t*(world[j][k]-world[i][k]))*scale));}}
 assert.deepEqual(ss[0],expected);delete global.THREE;delete global.Autodesk;
});
test('nonaffine transform has no supported precision proof',()=>{
 const g={vb:new Float32Array([0,0,0]),vbstride:3,attributes:{position:{bytesPerItem:4,itemSize:3}}},m=[1,0,0,.1,0,1,0,0,0,0,1,0,0,0,0,1];assert.equal(P.vertex(g,m,0,[0,0,0]).bounds,null);
});

for(const bits of [8,12,16,20])for(const rule of ['nearest','directed'])for(const scale of [.001,1,1000])test('independent quantizer step and transformed cell '+bits+'/'+rule+'/'+scale,()=>{
 const max=2**bits-1,source=[.12345,-.23456,.34567],codes=source.map(x=>rule==='nearest'?Math.round((x+.5)*max):Math.floor((x+.5)*max)),decoded=codes.map(x=>x/max-.5),r=(rule==='nearest'?.5:1)/max;
 const cells=decoded.map(x=>[P.next(x-r,false),P.next(x+r,true)]),c=Math.cos(.37),s=Math.sin(.37),m=[scale*c,scale*s,0,0,-2*scale*s,2*scale*c,0,0,0,0,scale,0,1024,-2048,3,1],bounds=P.transform(cells,m);
 const world=[0,1,2].map(k=>m[k]*source[0]+m[k+4]*source[1]+m[k+8]*source[2]+m[k+12]);world.forEach((x,k)=>inside(x,bounds[k]));
 const f=fixture({radius:r*scale});assert.notEqual(f.ctx.geometryProof.state,'confirmed');assert.ok(f.ctx.error);
});

for(const L of [1.95,2,2.05,3.95,4,4.05])test('exact length range at normative boundary '+L,()=>{
 const f=fixture({ring:[[0,0],[L,0],[L,1.5],[0,1.5]]});assert.equal(f.ctx.geometryProof.state,'confirmed');assert.equal(f.ctx.lengthRange.method,'exact integer square comparison');inside(L,[f.ctx.lengthRange.min,f.ctx.lengthRange.max]);
 assert.equal(!!f.ctx.error,!(L>2&&L<=4));
});
test('exact root bounds do not inherit candidate epsilon at large translations',()=>{
 const f=fixture({matrix:[1,0,0,1,1e6,-1e6]});assert.equal(f.ctx.geometryProof.state,'confirmed');assert.equal(f.ctx.lengthRange.min,f.ctx.frame.L);assert.equal(f.ctx.lengthRange.max,f.ctx.frame.L);
});

test('all 65536 unorm16 cells outwardly enclose exact nearest and directed rational endpoints',()=>{
 const bytes=new DataView(new ArrayBuffer(8)),unit=1n<<1074n,denominator=131070n;
 const scaled=x=>{bytes.setFloat64(0,x);const bits=bytes.getBigUint64(0),e=Number((bits>>52n)&2047n),mant=(bits&((1n<<52n)-1n))+(e?1n<<52n:0n);return (bits>>63n?-1n:1n)*(mant<<BigInt(e?e-1:0));};
 for(const rule of ['nearest','directed'])for(let code=0;code<=65535;code++){
  const c=P.decodeCell(code,'unorm16-centered',rule),offset=rule==='nearest'?1n:2n,k=BigInt(code),a=2n*k-offset-65535n,b=2n*k+offset-65535n,lo=a< -65535n?-65535n:a,hi=b>65535n?65535n:b;
  assert.ok(scaled(c.input[0])*denominator<=lo*unit,'lower rational bound code='+code+' '+rule);
  assert.ok(scaled(c.input[1])*denominator>=hi*unit,'upper rational bound code='+code+' '+rule);
  assert.ok(c.input[0]>=-.5&&c.input[1]<=.5);assert.equal(P.decodeCell(code,'unorm16-centered').input,null);
 }
 const sample=P.decodeCell(32768,'unorm16-centered','nearest');assert.ok(scaled(sample.input[1])*65535n>=unit,'reported 32768 counterexample');
});
console.log(`${n}/${n} production geometry-proof groups passed`);
