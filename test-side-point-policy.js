/* Synthetic side-lighting policy and representation invariance, without Viewer.
   Adjacent-wall classification is a recorded limitation, not a normative oracle. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const copy=x=>JSON.parse(JSON.stringify(x));
function load(modelSource,revision){
 const files=['data.js','report.js','engine.js','schemes.js','model.js','bim/spaces.js','bim/precision.js','bim/geom.js','bim/rectangles.js','bim/sections.js','bim/calc.js'];
 const read=f=>revision?require('node:child_process').execFileSync('git',['show',revision+':'+f],{cwd:__dirname,encoding:'utf8'}):fs.readFileSync(path.join(__dirname,f),'utf8');
 const src=files.map(f=>f==='model.js'&&modelSource!==undefined?modelSource:read(f)).join('\n').split('\n').filter(l=>!/^if ?\(typeof module/.test(l)).join('\n');
 return new Function(src+';return {KEO,Engine,DATA,BimSpaces,BimGeom,BimCalc};')();
}
function manualState(lib,id,orient='Ю'){
 const K=lib.KEO,s=K.defaultState();s.roomId=id;s.bType=K.room(s).g;
 Object.assign(s.side.walls[0],{orient,dp:8,bp:6,H:3.2});
 s.side.walls[0].windows=[K.defaultWindow(-1.4),K.defaultWindow(1.4)];return s;
}
function manualMatrix(lib){
 const K=lib.KEO,report=[];
 for(const id of ['A57','A60'])for(const orient of K.ORIENTS){
  const s=manualState(lib,id,orient),w=s.side.walls[0],index=K.ORIENTS.indexOf(orient);
  const split=copy(s);split.side.walls=w.windows.map(x=>({...copy(w),windows:[copy(x)]}));
  const opposite=copy(s);opposite.side.walls.push({...copy(w),orient:K.ORIENTS[(index+4)%8]});
  const adjacent=copy(s);adjacent.side.walls.push({...copy(w),orient:K.ORIENTS[(index+2)%8],dp:6,bp:8});
  for(const [kind,st] of [['one',s],['same-facade-split',split],['opposite',opposite],['adjacent',adjacent]]){
   const before=JSON.stringify(st),C=K.compute(st),input=C.ok?K.sideInput(st):null;assert.equal(JSON.stringify(st),before,'calculation must not mutate the inputs');
   report.push({id,orient,kind,rule:K.rtOf(st),lt:input?.walls.map(w=>w.lt),hp:input?.hp,ok:C.ok,norm:C.norm?.v,e:C.res?.eFinal,result:C.res});
  }
 }
 return report;
}
function bimMatrix(lib){
 const {KEO,Engine,DATA,BimGeom:G,BimSpaces:SP,BimCalc:C}=lib;
 const physical=[[0,0,6,0],[6,0,6,8],[6,8,0,8],[0,8,0,0]],R=G.raster(physical,.05,G.bounds(physical));
 R.regs.forEach(r=>r&&r.border&&R.ext.add(r.id));
 const interior=R.regs.find(r=>r&&!r.border),pts=[];
 for(let j=0;j<R.H;j++)for(let i=0;i<R.W;i++)if(R.lab[j*R.W+i]===interior.id)pts.push([R.minx+(i+.5)*R.cell,R.miny+(j+.5)*R.cell]);
 const window=(id,c,t,n,w=1.5)=>({id,cat:'Revit Windows',c,t,n,nin:n,w,d:.05,z0:.8,z1:2.6,dIn:.05,dOut:.05,dst:.4});
 const south=window(100,[3,0],[1,0],[0,1]),north=window(101,[3,8],[1,0],[0,-1]),west=window(102,[0,4],[0,1],[1,0],1);
 const fragments=[window(103,[2.625,0],[1,0],[0,1],.75),window(104,[3.375,0],[1,0],[0,1],.75)];
 const report=[];
 for(const id of ['A57','A60']){
  const row=DATA.rooms.find(r=>r.id===id),sp={key:'synthetic-'+id,rooms:[{key:'synthetic-'+id,name:row.name,num:id,reg:interior.id,area:48,h:3.2}]};
  const env={KEO,Engine,DATA,settings:{rho:.55,t1:3,t2:0,t4:0,region:'г. Москва',group:1,bGroup:row.g},floor:0,pts,Rp:R,T:null,rows:[row],roomPts:()=>pts,shade:()=>({kDepth:0,blds:[]})};
  for(const [kind,openings] of [['one',[south]],['fragmented',[...fragments]],['reordered-fragments',[...fragments].reverse()],['opposite',[south,north]],['adjacent',[south,west]]]){
   const r=C.space(copy(sp),copy(openings),[],env);if(kind!=='one'){assert.equal(r.pointChoice?.status,'insufficient-data');assert.equal(r.C,undefined);assert.equal(r.A,undefined);report.push({id,kind,blocked:true,pointChoice:r.pointChoice});continue;}assert.equal(r.C?.ok,true,JSON.stringify({id,kind,error:r.err||r.C?.err}));
   const again=KEO.compute(copy(r.st));assert.equal(again.res.eFinal,r.C.res.eFinal,'BIM export must reproduce the chosen point');
   report.push({id,kind,A:r.A,multi:r.multi,rtManual:r.st.rtManual,pointRule:KEO.rtOf(r.st),autoRuleWithoutAdapterPoint:KEO.rtOf({...r.st,rtManual:null}),e:r.C.res.eFinal,norm:r.C.norm.v,result:r.C.res,notes:r.notes});
  }
 }
 return report;
}
function verify(lib){
 const K=lib.KEO,manual=manualMatrix(lib),bim=bimMatrix(lib);
 for(const id of ['A57','A60'])for(const orient of K.ORIENTS){
  const get=kind=>manual.find(r=>r.id===id&&r.orient===orient&&r.kind===kind),one=get('one');
  assert.equal(one.ok,true);assert.equal(one.rule,id==='A57'?'far1':'center');assert.equal(one.lt[0],id==='A57'?7:4);assert.equal(one.hp,0);
  for(const kind of ['same-facade-split','opposite','adjacent']){assert.equal(get(kind).ok,false);assert.equal(get(kind).rule,'unknown');assert.equal(get(kind).e,undefined)}
 }
 for(const row of lib.DATA.rooms){
  const s=manualState(lib,row.id),w=s.side.walls[0],split=copy(s);split.side.walls=w.windows.map(x=>({...copy(w),windows:[copy(x)]}));
  const before=JSON.stringify(split),blocked=K.compute(split);assert.equal(blocked.ok,false);assert.equal(blocked.pointChoice.status,'insufficient-data');assert.equal(blocked.res,undefined);assert.equal(blocked.pass,undefined);assert.deepEqual(K.buildModel(split,blocked),[]);assert.throws(()=>K.sideInput(split),/Недостаточно данных/);assert.equal(JSON.stringify(split),before);
 }
 for(const override of ['center','far1','manual']){
  const s=manualState(lib,'A57');s.side.walls.push(copy(s.side.walls[0]));s.side.walls.forEach(w=>{w.lt=5.5});s.rtManual=override;
  assert.equal(K.rtOf(s),override);assert.equal(K.compute(s).ok,true);assert.ok(K.sideInput(s).walls.every(w=>w.lt===(override==='manual'?5.5:override==='far1'?7:4)));
 }
 for(const orient of ['unknown','С']){const s=manualState(lib,'A57',orient);s.side.walls.push(copy(s.side.walls[0]));assert.equal(K.rtOf(s),'unknown');assert.equal(K.compute(s).ok,false)}
 return {manual,bim};
}
if(require.main===module){
 const report=verify(load());if(process.argv.includes('--json'))console.log(JSON.stringify(report));
 else console.log('PASS explicit insufficient-data policy: 64 manual cases; 10 BIM cases; all table rows block unverified multiple walls; BIM multiple openings block without a chosen point or verdict; explicit manual overrides remain available');
}
module.exports={load,manualState,manualMatrix,bimMatrix,verify};
