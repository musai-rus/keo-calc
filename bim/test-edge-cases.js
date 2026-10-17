/* Deeper reliability regressions: geometry and property inputs. No Autodesk required. */
const assert=require('node:assert/strict'),fs=require('node:fs');
let fixture=fs.readFileSync(__dirname+'/test-bim.js','utf8').replace('process.exit(fails ? 1 : 0);','if(fails) throw Error("Baseline fixture failed");');
const {SP,G,Cc,env,SPC}=new Function('require','__dirname','console',fixture+';return {SP,G,Cc,env,SPC};')(require,__dirname,{log(){}});
let total=0;function test(name,fn){fn();total++;console.log('OK '+name)}
const unit=n=>'autodesk.unit.unit:'+n+'-1.0.1';
test('Unit conversion rejects infinity, booleans and empty values',()=>{for(const v of [Infinity,-Infinity,'Infinity',NaN,true,false,{},' ',''])assert.equal(SP.conv(v,unit('meters'),'len').ok,false);assert.equal(SP.conv('1,5',unit('meters'),'len').v,1.5);assert.equal(SP.conv(5,unit('feet'),'len').v,1.524);});
test('Candidate 61 is included; no false unique assignment from truncation',()=>{const rs=Array.from({length:61},(_,i)=>({key:String(i),area:i===0||i===60?10:100,per:14}));const a=SP.combos(rs,[10],.1,14);assert.equal(a.length,2);assert.deepEqual(a.map(x=>x.sel[0].key),['0','60']);assert.equal(SP.combos(rs.slice().reverse(),[10],.1,14).length,2);});
test('Equal-area identities remain ambiguous instead of depending on input order',()=>{for(const reverse of [false,true]){const rooms=[{key:'A',area:10,per:14},{key:'B',area:10,per:14}];if(reverse)rooms.reverse();const R={regs:[null,{id:1,areaC:10,areaV:10,per:14},{id:2,areaC:10,areaV:10,per:14}]};SP.matchRooms(R,rooms);assert.ok(rooms.every(r=>!r.reg&&r.matchAmbiguous));assert.ok(R.regs.slice(1).every(r=>!r.room));}});
test('Small enclosed regions require matched or explicit room evidence',()=>{
 const segs=[[0,0,1.5,0],[1.5,0,1.5,1.2],[1.5,1.2,0,1.2],[0,1.2,0,0]];
 const make=()=>{const R=G.raster(segs,.05,G.bounds(segs));R.regs.forEach(r=>{if(r&&r.border)R.ext.add(r.id)});return R};
 const R=make(),Rp=make(),rg=R.regs.find(r=>r&&!r.border),rm={key:'small',area:rg.areaC,per:rg.per,name:'Office'};
 SP.matchRooms(R,[rm]);assert.ok(rm.reg);assert.equal(SP.compose(R,Rp,[rm],()=>false,{}).spaces.length,1);
 const empty=make();assert.equal(SP.compose(empty,make(),[],()=>false,{}).spaces.length,0);
 const manual=make(),r=manual.regs.find(r=>r&&!r.border),q={key:'manual',area:1.8};
 const ix=manual.lab.findIndex(id=>id===r.id),at=[manual.minx+(ix%manual.W+.5)*manual.cell,manual.miny+(Math.floor(ix/manual.W)+.5)*manual.cell];
 assert.equal(SP.compose(manual,make(),[q],()=>false,{assign:[{at,keys:['manual']}]}).spaces.length,1);
});
const rectangle=(x,y,w,h)=>[[x,y,x+w,y],[x+w,y,x+w,y+h],[x+w,y+h,x,y+h],[x,y+h,x,y]];
function rasterPlan(segs){const R=G.raster(segs,.05,G.bounds(segs));R.regs.forEach(r=>{if(r&&r.border)R.ext.add(r.id)});return R;}
test('Balance never resolves identical competing contours by order',()=>{
 const segs=[...rectangle(0,0,4,3),...rectangle(6,0,4,3)],R=rasterPlan(segs),Rp=rasterPlan(segs),rg=R.regs.find(r=>r&&!r.border),room={key:'one',area:rg.areaC,per:rg.per};
 SP.matchRooms(R,[room]);assert.ok(room.matchAmbiguous);const c=SP.compose(R,Rp,[room],()=>false,{});assert.equal(c.spaces.length,0);assert.equal(room.byBalance,undefined);
});
test('Balance requires manual confirmation for auxiliary/normed mixtures',()=>{
 const segs=rectangle(0,0,6,5),R=rasterPlan(segs),Rp=rasterPlan(segs),rg=R.regs.find(r=>r&&!r.border),rooms=[{key:'main',area:rg.areaC*.7},{key:'aux',area:rg.areaC*.3}];
 const c=SP.compose(R,Rp,rooms,()=>false,{}, {aux:r=>r.key==='aux'});assert.equal(c.spaces.length,0);assert.ok(c.unknown.some(u=>u.cands.length));
});
test('Unresolved small candidate contours never grow into a neighbor',()=>{
 const phys=rectangle(0,0,7,2),R=rasterPlan([...phys,[4,0,4,2]]),Rp=rasterPlan(phys),regs=R.regs.filter(r=>r&&!r.border).sort((a,b)=>b.areaC-a.areaC);
 const rooms=[{key:'office',area:regs[0].areaC,per:regs[0].per},{key:'main',area:regs[1].areaC*.7},{key:'aux',area:regs[1].areaC*.3}];SP.matchRooms(R,rooms);
 const c=SP.compose(R,Rp,rooms,()=>false,{}, {aux:r=>r.key==='aux'});assert.ok(c.unknown.length);assert.ok(c.spaces.every(s=>!s.grow.includes(regs[1].id)));
 const lab=SP.spaceLabel(R,Rp,c.spaces);assert.equal(lab[R.lab.findIndex(id=>id===regs[1].id)],-1);
});
test('Identified tiny rooms retain exterior-window assignment',()=>{
 const segs=rectangle(0,0,1.2,1),R=rasterPlan(segs),Rp=rasterPlan(segs),rg=R.regs.find(r=>r&&!r.border),room={key:'tiny',area:rg.areaC,per:rg.per};
 SP.matchRooms(R,[room]);const c=SP.compose(R,Rp,[room],()=>false,{}),lab=SP.spaceLabel(R,Rp,c.spaces),o={c:[.6,0],n:[0,1],z0:.8};
 assert.equal(G.assign(Rp,lab,[o],0,3).outer,1);assert.equal(o.space,0);
});
test('Overlapping floor bands cannot mix level and space ownership',()=>{
 const segs=rectangle(0,0,4,3),Rp=rasterPlan(segs),inside=Rp.regs.find(r=>r&&!r.border).id;
 const low=Int32Array.from(Rp.lab,id=>id===inside?0:-1),high=Int32Array.from(Rp.lab,id=>id===inside?1:-1),o={c:[2,0],n:[0,1],z0:2.8};
 G.assign(Rp,low,[o],0,3);o.lvl='L1';G.assign(Rp,high,[o],3,6);assert.equal(o.floor,0);assert.equal(o.space,0);assert.equal(o.lvl,'L1');assert.equal(o.levelBoundary,true);
 G.assign(Rp,high,[o],0,3);assert.equal(o.floor,0);assert.equal(o.space,1);
});
global.THREE={Matrix4:class{constructor(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}},Vector3:class{}};
const cat={byCat:{'Revit Windows':[1]},info:{1:{c:'Revit Windows',fam:'Skylight',type:'synthetic'}}};
function glazing(points,indices){const g={vb:new Float32Array(points.flat()),vbstride:3,attributes:{position:{itemSize:3,bytesPerItem:4,offset:0}},ib:new Uint16Array(indices)};return G.openings({S:1,it:{enumNodeFragments:(id,cb)=>cb(0),getRootId:()=>0,getNodeParentId:()=>0},fl:{getGeometry:()=>g,getWorldMatrix:()=>{},getMaterial:()=>({transparent:true})}},cat)[0];}
test('Named rooflight with missing geometry is diagnostic, not an analysis crash',()=>{
 for(const g of[null,{vb:[],vbstride:3,ib:[]},{isLines:true,vb:[0,0,0],vbstride:3}]){
 const r=G.openings({S:1,it:{enumNodeFragments:(id,cb)=>cb(0),getRootId:()=>0,getNodeParentId:()=>0},fl:{getGeometry:()=>g,getWorldMatrix:()=>{},getMaterial:()=>({transparent:true})}},cat);
 assert.equal(r.length,0);assert.ok(r.diag.some(d=>/геометрия.*отсутствует/.test(d.reason)));
 }
});
test('Four equal corner radii never establish a circular skylight',()=>{for(const [w,h]of[[4,2],[2,2]]){const r=glazing([[0,0,3],[w,0,3],[w,h,3],[0,h,3]],[0,1,2,0,2,3]);assert.equal(r.round,undefined);assert.equal(r.auto,true);}});
test('Rooflight footprint is invariant to triangulation and rotation',()=>{
 for(const [w,h]of[[4,2],[2,2]])for(const angle of[0,Math.PI/4,.3]){
 const raw=[[0,0,3],[w,0,3],[w,h,3],[0,h,3]],pts=raw.map(([x,y,z])=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),z]);
 const normal=glazing(pts,[0,1,2,0,2,3]),dup=glazing([pts[0],pts[1],pts[2],pts[0],pts[2],pts[3]],[0,1,2,3,4,5]);
 for(const r of[normal,dup]){assert.ok(Math.abs(r.av-w)<1e-5);assert.ok(Math.abs(r.bv-h)<1e-5);}
 }
});
test('Distributed circular perimeter retains circular geometry',()=>{const points=[[0,0,3],...Array.from({length:32},(_,i)=>[2*Math.cos(i*Math.PI/16),2*Math.sin(i*Math.PI/16),3])];const indices=Array.from({length:32},(_,i)=>[0,i+1,(i+1)%32+1]).flat();const r=glazing(points,indices);assert.equal(r.round,true);assert.ok(Math.abs(r.d-4)<1e-5);});
test('Circular perimeter classification ignores interior tessellation',()=>{
 const N=32,ring=r=>Array.from({length:N},(_,i)=>[r*Math.cos(i*2*Math.PI/N),r*Math.sin(i*2*Math.PI/N),3]),pts=[[0,0,3],...ring(1),...ring(2)],idx=[];
 for(let i=0;i<N;i++){const j=(i+1)%N;idx.push(0,1+i,1+j,1+i,1+N+i,1+N+j,1+i,1+N+j,1+j);}
 const r=glazing(pts,idx);assert.equal(r.round,true);assert.ok(Math.abs(r.d-4)<1e-5);
});
const lan=(x,tilt,extra={})=>({id:x,cat:'Revit Windows',type:'synthetic',roof:true,c:[x,4],t:[1,0],n:[0,1],av:1.5,bv:1.5,z0:4.2,z1:4.4,tilt,H:3.6,hsf:.6,...extra});
test('Rooflight type grouping preserves tilt/MF and is order independent',()=>{const ls=[lan(3,0),lan(9,60)],a=Cc.space(SPC,[],ls,env()),b=Cc.space(SPC,[],ls.slice().reverse(),env());assert.ok(a.C.ok&&b.C.ok);assert.equal(a.st.top.types.length,2);assert.deepEqual(a.st.top.types.map(t=>t.tilt).sort(),[0,2]);assert.equal(a.C.res.eAvgR,b.C.res.eAvgR);a.C.res.e.forEach((x,i)=>assert.ok(Math.abs(x-b.C.res.e[i])<1e-12));assert.deepEqual(a.C.res.types.map(t=>t.MF).sort(),[.67,.77]);});
test('Short shaft and missing tilt assumptions are disclosed',()=>{const a=Cc.space(SPC,[],[lan(3,null,{hsf:.05})],env());assert.ok(a.notes.some(n=>/меньше 0,1/.test(n)));assert.ok(a.notes.some(n=>/Наклон.*не определён/.test(n)));assert.equal(a.st.top.types[0].tilt,0);});
(async()=>{
 const bulk=(value,context)=>({m:{getBulkProperties2:(ids,opts,ok)=>ok([{dbId:1,properties:[{attributeName:'Diameter_Inside',displayValue:value,dataTypeContext:context}]}])}});
 for(const [v,u,expected]of[[5,'feet',1.524],['1,5','meters',1.5],[1500,'millimeters',1.5]])assert.equal((await G.lanternParams(bulk(v,unit(u)),[1]))[1].dIn,expected);
 for(const [v,u]of[[Infinity,unit('meters')],[1500,null],['12junk',unit('meters')]]){const r=(await G.lanternParams(bulk(v,u),[1]))[1];assert.equal(r.dIn,null);assert.ok(r.notes.length);}
 const c=bulk('5',null);c.m.getPropertyDb=()=>({executeUserFunction:async()=>[{id:1,values:[{name:'Diameter_Inside',value:5,context:unit('feet')}]}]});assert.equal((await G.lanternParams(c,[1]))[1].dIn,1.524);
 const broken={m:{getBulkProperties2:(ids,o,ok,bad)=>bad(Error('unavailable')),getPropertyDb:()=>({executeUserFunction:async()=>{throw Error('unavailable')}})}};const missing=await G.lanternParams(broken,[1]);assert.ok(missing[1].notes.some(n=>/отсутствие.*не подтверждено/.test(n)));
 total++;console.log('OK Shaft dimensions use explicit raw/bulk units; invalid/unknown dimensions warn');console.log(`${total}/${total} edge-case groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
