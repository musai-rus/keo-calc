/* Independent geometry dimensions and manual calculator states. No real IFC
   acceptance: fixtures intentionally exercise a bounded geometry adapter. */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
global.window=global;
const src=['data.js','report.js','engine.js','schemes.js','model.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n').split('\n').filter(l=>!/^if ?\(typeof module/.test(l)).join('\n');
const KEO=new Function(src+';return KEO')(),NativeSpaces=require('./native-spaces'),N=require('./native-side-input');
const lib={KEO,NativeSpaces,DATA:require('../data')},clone=x=>JSON.parse(JSON.stringify(x));
const face=points=>[[points[0],points[1],points[2]],[points[0],points[2],points[3]]];
function box(d,b,h){
  const p=[[0,0,0],[d,0,0],[d,b,0],[0,b,0],[0,0,h],[d,0,h],[d,b,h],[0,b,h]];
  return [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].flatMap(ids=>face(ids.map(i=>p[i])));
}
const corners=(x,y,z,w,h)=>[[x,y,z],[x,y+w,z],[x,y+w,z+h],[x,y,z+h]];
function fixture(multiple=false){
  const st=KEO.defaultState();st.region='';st.groupManual=true;st.group=5;st.roomId=multiple?'A57':'A56';st.rho=.55;st.hpManual=null;st.rtManual=null;
  st.meta.room=multiple?'Синтетическая проверка: четыре окна':'Контрольная геометрия: одно окно';
  st.side.walls=[{...KEO.defaultWall('В'),t1:0,t1c:.64,t2:0,t4:0,kType:'none',buildings:[]}];
  // Four-window fixture is intentionally wider than rounded AR2 inputs:
  // its first 1.65 m window at s=-2.88 would protrude 5 mm from a 7.4 m room.
  const d=multiple?8:8.1,b=multiple?7.5:3.06;
  const specs=multiple?[[-2.88,.75],[-1.12,.75],[.62,.70],[2.38,.75]]:[[0,.85]];
  const openings=specs.map(([s,t2],i)=>({id:'window-'+i,inner:corners(0,b/2+s-.825,.5,1.65,2.2),outer:corners(-.72,b/2+s-.825,.5,1.65,2.2),coefficients:{t2m:'manual',t2o:t2}}));
  return {unitScale:1,room:{id:'synthetic-room',triangles:box(d,b,3)},facade:{origin:[0,0,0],outerOrigin:[-.72,0,0],inward:[1,0,0],along:[0,1,0]},template:st,openings};
}
function manual(multiple){
  const s=fixture(multiple).template;
  s.side.walls[0]={...s.side.walls[0],dp:multiple?8:8.1,bp:multiple?7.5:3.06,H:3,dst:.72,lt:multiple?7:4.05,ds:0,
    windows:(multiple?[[-2.88,.75],[-1.12,.75],[.62,.70],[2.38,.75]]:[[0,.85]]).map(([x,t2])=>({...KEO.defaultWindow(),hpd:.5,ho:2.2,bo:1.65,s:x,t2m:'manual',t2o:t2}))};
  return s;
}
function good(input,multiple){
  const before=JSON.stringify(input),r=N.prepare(input,lib);assert.equal(JSON.stringify(input),before);assert.equal(r.status,'preview',JSON.stringify(r));
  const reference=KEO.compute(manual(multiple));assert.equal(reference.ok,true);
  assert.ok(Math.abs(r.calculation.res.e-reference.res.e)<1e-8);
  assert.equal(r.calculation.res.eFinal,reference.res.eFinal);if(!multiple)assert.equal(r.calculation.res.eFinal,1.27);
  assert.deepEqual(KEO.compute(JSON.parse(JSON.stringify(r.state))),r.calculation);
  assert.equal(r.normativeVerified,false);assert.equal(r.geometryVerified,false);return r;
}
const one=good(fixture(),false),four=good(fixture(true),true);
assert.deepEqual(one.point,[4.05,1.53,0]);assert.equal(four.inputs.lt,7);assert.equal(four.openingIds.length,4);
assert.equal(four.calculation.res.walls[0].wins.length,4);
// Unit conversion + independent rigid movement of source geometry and facade.
for(const scale of [1000,1/.3048]){
  const f=fixture(true);f.unitScale=1/scale;
  const move=([x,y,z])=>[(-y+100)*scale,(x-200)*scale,(z+12)*scale];
  f.room.triangles=f.room.triangles.map(t=>t.map(move));f.openings.forEach(o=>{o.inner=o.inner.map(move);o.outer=o.outer.map(move);});
  f.facade.origin=move(f.facade.origin);f.facade.outerOrigin=move(f.facade.outerOrigin);f.facade.inward=[0,1,0];f.facade.along=[-1,0,0];
  const r=good(f,true);assert.ok(Math.abs(r.point[2]-12)<1e-12);
}
const reversed=fixture(true);reversed.room.triangles.reverse().forEach(t=>t.reverse());reversed.openings.reverse();good(reversed,true);
const angled=fixture(true),rotate=([x,y,z])=>[.6*x-.8*y,.8*x+.6*y,z];
angled.room.triangles=angled.room.triangles.map(t=>t.map(rotate));angled.openings.forEach(o=>{o.inner=o.inner.map(rotate);o.outer=o.outer.map(rotate);});
angled.facade.outerOrigin=rotate(angled.facade.outerOrigin);angled.facade.inward=[.6,.8,0];angled.facade.along=[-.8,.6,0];good(angled,true);
function refused(change,reason){const f=fixture(true);change(f);const r=N.prepare(f,lib);assert.equal(r.status,'rejected',JSON.stringify(r));assert.equal(r.reason,reason);assert.equal(r.state,undefined);assert.equal(r.calculation,undefined);}
refused(f=>f.openings.push(clone(f.openings[0])),'missing-or-duplicate-opening-id');
refused(f=>{const o=clone(f.openings[0]);o.id='overlap';f.openings.push(o);},'overlapping-openings');
refused(f=>f.openings[0].inner[0][0]=1,'invalid-opening-plane-or-size');
refused(f=>f.openings[0].outer.forEach(p=>p[1]+=.1),'splayed-opening-not-supported');
refused(f=>f.openings[0].inner.reverse().splice(0,1),'nonrectangular-opening');
refused(f=>f.room.triangles.splice(0,2),'incomplete-or-overlapping-room-shell');
refused(f=>f.room.triangles.push(...box(1,1,3).map(t=>t.map(([x,y,z])=>[x+3,y+3,z]))),'unsupported-room-section');
refused(f=>f.room.triangles=f.room.triangles.map(t=>t.map(([x,y,z])=>[x,y,z===3?3+x/8:z])),'non-prismatic-room');
refused(f=>f.facade.inward=[0,0,1],'non-horizontal-or-non-orthonormal-frame');
refused(f=>f.unitScale=NaN,'unknown-units');
refused(f=>f.template.rtManual='manual','unsupported-or-unconfirmed-point-rule');
refused(f=>f.template.side.walls.push(clone(f.template.side.walls[0])),'missing-single-facade-calculator-template');
refused(f=>f.template.side.walls[0].t1c=-1,'calculator-rejected-input');
// No fallback to guessed material values or an arbitrary template.
refused(f=>delete f.template,'missing-single-facade-calculator-template');
refused(f=>f.template.roomId='absent','unknown-room-purpose');
refused(f=>f.template.group=0,'unknown-climate-group');
refused(f=>{f.template.groupManual=false;f.template.region='unconfirmed';},'unknown-region');
refused(f=>f.template.side.walls[0].orient='unknown','unknown-facade-orientation');
refused(f=>f.template.side.walls[0].t1c=Infinity,'invalid-template-value');
refused(f=>{f.room.triangles=box(8,7.4,3);f.openings.forEach(o=>{o.inner.forEach(p=>p[1]-=.05);o.outer.forEach(p=>p[1]-=.05);});},'opening-outside-room');
console.log('OK: native rectangular room + 1/4 openings -> shared calculator; AR2 one-window 1.27, synthetic four-window '+four.calculation.res.eFinal+', units/rotation/order, JSON replay and rejected unsupported geometry');
