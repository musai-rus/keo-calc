/* BIM must fail closed for geometry unsupported by its shared-height/section model. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=fs.readFileSync(__dirname+'/test-bim.js','utf8').replace('process.exit(fails ? 1 : 0);','if(fails) throw Error("Baseline fixture failed");');
const {Cc,env,SPC,win}=new Function('require','__dirname','console',base+';return {Cc,env,SPC,win};')(require,__dirname,{log(){}});
const lantern=(id,H,x=3,y=4,extra={})=>({id,cat:'Revit Windows',type:'synthetic shaft',roof:true,c:[x,y],t:[1,0],n:[0,1],av:1.5,bv:1.5,round:true,dTop:1.5,dBot:2.1,z0:H+.6,z1:H+.8,tilt:0,H,hsf:.6,...extra});
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const blocked=(r,pattern)=>{assert.match(r.err,pattern);assert.ok(r.notes.some(n=>n===r.err));for(const k of ['C','comb','st','pass','e','eAvgR'])assert.equal(r[k],undefined,k+' must not contain a result');};
test('one lantern retains a numeric result',()=>{const r=Cc.space(SPC,[],[lantern(1,4)],env());assert.equal(r.C.ok,true);assert.equal(r.st.top.H,4);assert.ok(r.C.res.e.every(Number.isFinite));});
test('equal heights preserve results in either order',()=>{const a=lantern(1,4),b=lantern(2,4,9.5),r=Cc.space(SPC,[],[a,b],env()),rev=Cc.space(SPC,[],[b,a],env());assert.equal(r.C.ok,true);assert.deepEqual(r.C.res.e,rev.C.res.e);assert.equal(r.st.top.H,4);});
for(const mode of ['top','comb'])for(const reverse of [false,true])test(mode+' rejects 4/8 m, reverse='+reverse,()=>{let ls=[lantern(41,4),lantern(82,8,9.5)];if(reverse)ls.reverse();const r=Cc.space(SPC,mode==='comb'?[win(10,3,1.5)]:[],ls,env());blocked(r,/разными высотами/);assert.match(r.err,/ID 41: H=4 м/);assert.match(r.err,/ID 82: H=8 м/);});
test('range is checked between every pair, including a middle first height',()=>{blocked(Cc.space(SPC,[],[lantern(1,4),lantern(2,4-.75e-6,6),lantern(3,4+.75e-6,9.5)],env()),/разными высотами/);});
test('numeric height noise within 1e-6 m is accepted',()=>{assert.equal(Cc.space(SPC,[],[lantern(1,4),lantern(2,4+.5e-6,9.5)],env()).C.ok,true);});
test('shaded lantern at another height is excluded before validation',()=>{const one=Cc.space(SPC,[],[lantern(1,4)],env()),r=Cc.space(SPC,[],[lantern(1,4),lantern(2,8,9.5,4,{shaded:'opaque roof'})],env());assert.equal(r.C.ok,true);assert.deepEqual(r.C.res.e,one.C.res.e);assert.ok(r.notes.some(n=>/не учтён/.test(n)));});
const invalidHeights=[undefined,null,NaN,Infinity,-Infinity,0,-1,'4'];
for(const mode of ['top','comb'])for(const H of invalidHeights)for(const mixed of [false,true])test(`${mode} rejects H=${String(H)}, mixed=${mixed}`,()=>{
 const e=env();let calls=0;const compute=e.KEO.compute;e.KEO={...e.KEO,compute(...a){calls++;return compute(...a)}};
 const invalid=lantern('invalid',H),ls=mixed?[lantern('valid',4,9.5),invalid]:[invalid];
 const r=Cc.space(SPC,mode==='comb'?[win(10,3,1.5)]:[],ls,e);
 blocked(r,/Высота.*не определена или некорректна/);assert.match(r.err,/ID invalid/);assert.equal(calls,0,'must stop before compute');
 if(mixed)blocked(Cc.space(SPC,mode==='comb'?[win(10,3,1.5)]:[],ls.slice().reverse(),e),/Высота.*не определена или некорректна/);
});
for(const mode of ['top','comb'])test(mode+' ignores invalid heights only for excluded shaded lanterns',()=>{
 const ops=mode==='comb'?[win(10,3,1.5)]:[],ls=[lantern(1,4)],one=Cc.space(SPC,ops,ls,env());
 const r=Cc.space(SPC,ops,ls.concat(invalidHeights.map((H,i)=>lantern(i+2,H,9.5,4,{shaded:'opaque roof'}))),env());
 assert.equal(r.C.ok,true);assert.deepEqual(r.C.res.e,one.C.res.e);assert.deepEqual(r.comb?.e,one.comb?.e);
});
const U=[];for(let y=.125;y<10;y+=.25)for(let x=.125;x<12;x+=.25){if(!(x>3&&x<9&&y>3))U.push([x,y]);}
for(const mode of ['top','comb'])test(mode+' blocks U section whose middle points cross the void',()=>{const r=Cc.space(SPC,mode==='comb'?[win(10,2,1.5)]:[],[lantern(1,4,1.5,3,{av:1,bv:1,round:false,dTop:null,dBot:null,hsf:1}),lantern(2,4,10.5,3,{av:1,bv:1,round:false,dTop:null,dBot:null,hsf:1})],env({pts:U}));blocked(r,/характерный разрез/);assert.match(r.err,/РТ2, РТ3, РТ4/);assert.ok(r.pts.some(p=>p[0]>3&&p[0]<9&&p[1]>3));});
test('translated U remains blocked',()=>{const pts=U.map(([x,y])=>[x+70,y-40]);blocked(Cc.space(SPC,[],[lantern(1,4,71.5,-36)],env({pts})),/характерный разрез/);});

test('a narrow hole is rejected despite a nearby interior sample',()=>{
 const e=env(),initial=Cc.space(SPC,[],[lantern(1,4)],e),A=initial.pts[0];
 const contains=p=>Math.abs(p[0]-A[0])>.1||Math.abs(p[1]-A[1])>.1;
 const pts=e.pts.filter(contains);assert.ok(pts.some(p=>Math.abs(p[0]-A[0])<.3&&Math.abs(p[1]-A[1])<.3));
 const r=Cc.space(SPC,[],[lantern(1,4)],env({pts,containsPoint:contains}));blocked(r,/РТ1 вне контура/);
});
// Exercise the production mask predicate, including cell ownership at edges.
// Expected cells are hand-labelled; no parallel implementation of floor/indexing.
const maskSource=fs.readFileSync(__dirname+'/app.js','utf8').match(/containsPoint: (p => \{[^\n]+\}),/)[1];
const mask=new Function('L','i',`return (${maskSource});`)({R:{minx:0,miny:0,cell:1,W:3,H:3},lab:[7,-1,7,7,7,8,7,7,7]},7);
const edgeCases=[[[0,0],true],[[-1e-9,.5],false],[[3-1e-9,.5],true],[[3,.5],false],[[.5,-1e-9],false],[[.5,3-1e-9],true],[[.5,3],false],[[1-1e-9,.5],true],[[1,.5],false],[[2-1e-9,.5],false],[[2,.5],true],[[2,1],false],[[NaN,1],false],[[1,Infinity],false]];
test('production mask has half-open outer/cell edges and rejects void/another space/nonfinite points',()=>{edgeCases.forEach(([p,inside])=>assert.equal(mask(p),inside,JSON.stringify(p)));});
for(const mode of ['top','comb'])test(mode+' stops at mask boundaries before compute and permits owned cells',()=>{
 const e=env({pts:[[0,0],[4,0],[0,4],[4,4]]}),fr=Cc.planFrame(e.pts);
 for(const [world,inside]of edgeCases){
  let calls=0;const local=fr.toLocal(world);
  const r=Cc.space(SPC,mode==='comb'?[win(10,3,1.5)]:[],[lantern(1,4)],{...e,containsPoint:mask,KEO:{...e.KEO,topPoints:()=>[{x:local[0],y:local[1]}],compute:()=>{calls++;return{ok:false,err:['sentinel after mask']}}}});
  assert.equal(calls,inside?1:0,JSON.stringify(world));if(!inside)blocked(r,/характерный разрез/);
 }
});
for(const [unit,factor] of [['meters',1],['millimeters',1000],['feet',1/.3048]])test('height guard uses converted '+unit,()=>{
 const SP=new Function(fs.readFileSync(__dirname+'/spaces.js','utf8')+';return BimSpaces')();
 const h=v=>SP.conv(v*factor,'autodesk.unit.unit:'+unit+'-1.0.1','len').v;
 blocked(Cc.space(SPC,[],[lantern(1,h(4)),lantern(2,h(8),9.5)],env()),/разными высотами/);
});
console.log(`${count}/${count} calculation-limit groups passed`);
