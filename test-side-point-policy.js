/* Synthetic side-lighting policy and representation invariance, without Viewer.
   Adjacent-wall classification is a recorded limitation, not a normative oracle. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const copy=x=>JSON.parse(JSON.stringify(x));
function load(modelSource){
 const files=['data.js','report.js','engine.js','schemes.js','model.js','bim/spaces.js','bim/precision.js','bim/geom.js','bim/rectangles.js','bim/sections.js','bim/calc.js'];
 const src=files.map(f=>f==='model.js'&&modelSource!==undefined?modelSource:fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n').split('\n').filter(l=>!/^if ?\(typeof module/.test(l)).join('\n');
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
   const before=JSON.stringify(st),C=K.compute(st),input=K.sideInput(st);assert.equal(JSON.stringify(st),before,'calculation must not mutate the inputs');
   report.push({id,orient,kind,rule:K.rtOf(st),lt:input.walls.map(w=>w.lt),hp:input.hp,ok:C.ok,norm:C.norm?.v,e:C.res?.eFinal,result:C.res});
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
   const r=C.space(copy(sp),copy(openings),[],env);assert.equal(r.C?.ok,true,JSON.stringify({id,kind,error:r.err||r.C?.err}));
   const again=KEO.compute(copy(r.st));assert.equal(again.res.eFinal,r.C.res.eFinal,'BIM export must reproduce the chosen point');
   report.push({id,kind,A:r.A,multi:r.multi,rtManual:r.st.rtManual,pointRule:KEO.rtOf(r.st),autoRuleWithoutAdapterPoint:KEO.rtOf({...r.st,rtManual:null}),e:r.C.res.eFinal,norm:r.C.norm.v,result:r.C.res,notes:r.notes});
  }
 }
 return report;
}
function verify(lib){
 const K=lib.KEO,manual=manualMatrix(lib),bim=bimMatrix(lib);
 for(const id of ['A57','A60'])for(const orient of K.ORIENTS){
  const get=kind=>manual.find(r=>r.id===id&&r.orient===orient&&r.kind===kind),one=get('one'),split=get('same-facade-split');
  assert.equal(one.rule,id==='A57'?'far1':'center');assert.equal(one.lt[0],id==='A57'?7:4);assert.equal(one.hp,0);
  assert.equal(split.rule,one.rule,'splitting one physical facade into records must not change its point rule');
  assert.ok(split.lt.every(x=>x===one.lt[0]));assert.equal(split.e,one.e,'same openings and point must preserve final KEO');
  assert.equal(get('opposite').rule,'center');assert.deepEqual(get('opposite').lt,[4,4]);
  // Preserve the inherited adjacent-wall choice pending separate interpretation.
  assert.equal(get('adjacent').rule,'center');assert.deepEqual(get('adjacent').lt,[4,3]);
 }
 for(const id of ['A57','A60']){
  const get=kind=>bim.find(r=>r.id===id&&r.kind===kind),one=get('one');
  for(const kind of ['fragmented','reordered-fragments']){assert.deepEqual(get(kind).A,one.A);assert.equal(get(kind).e,one.e);assert.equal(get(kind).multi,false)}
  const opposite=get('opposite');assert.equal(opposite.multi,true);assert.ok(Math.abs(opposite.A[0]-3)<.1&&Math.abs(opposite.A[1]-4)<.1);
  assert.equal(get('adjacent').multi,false);assert.equal(get('adjacent').pointRule,'manual');
  if(id==='A57'){assert.ok(one.A[1]>6.8);assert.ok(get('adjacent').A[1]>6.8);assert.equal(get('adjacent').autoRuleWithoutAdapterPoint,'center')}else{assert.ok(Math.abs(one.A[1]-4)<.1);assert.ok(Math.abs(get('adjacent').A[1]-4)<.1)}
 }
 for(const override of ['center','far1','manual']){
  const s=manualState(lib,'A57');s.side.walls.push(copy(s.side.walls[0]));s.side.walls.forEach(w=>{w.lt=5.5});s.rtManual=override;
  assert.equal(K.rtOf(s),override);assert.ok(K.sideInput(s).walls.every(w=>w.lt===(override==='manual'?5.5:override==='center'?4:7)));
 }
 // An unknown direction must not become evidence of one-sided lighting.
 const unknown=manualState(lib,'A57');unknown.side.walls[0].orient='unknown';unknown.side.walls.push(copy(unknown.side.walls[0]));assert.equal(K.rtOf(unknown),'center');
 // The fix is not keyed to A57: representation invariance also holds for the
 // other table rows (including far1.2). This does not audit their assignment.
 for(const row of lib.DATA.rooms){
  const s=manualState(lib,row.id),split=copy(s),w=s.side.walls[0];split.side.walls=w.windows.map(x=>({...copy(w),windows:[copy(x)]}));
  const a=K.compute(s),b=K.compute(split);assert.equal(a.ok,true,row.id);assert.equal(b.ok,true,row.id);
  assert.equal(K.rtOf(split),K.rtOf(s),row.id);assert.equal(a.res.eFinal,b.res.eFinal,row.id);assert.equal(a.norm.v,b.norm.v,row.id);
 }
 return {manual,bim};
}
if(require.main===module){
 const report=verify(load());if(process.argv.includes('--json'))console.log(JSON.stringify(report));
 else console.log('PASS side-point policy: 64 manual cases; 10 BIM cases; facade-splitting invariant across all table rows; fragment-order invariance; group/bedroom; opposite/adjacent boundaries; export replay and manual overrides');
}
module.exports={load,manualState,manualMatrix,bimMatrix,verify};
