/* Synthetic evidence tests, not acceptance of CHER or any real geometry. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const SP=new Function(fs.readFileSync(__dirname+'/spaces.js','utf8')+';return BimSpaces')();
const G=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom')();
const box=(x,w=4)=>[[x,0,x+w,0],[x+w,0,x+w,3],[x+w,3,x,3],[x,3,x,0]];
function fixture(two=false){const segs=two?[...box(0),...box(26,5)]:box(0);const make=()=>{const r=G.raster(segs,.05,G.bounds(segs));r.regs.forEach(x=>{if(x?.border)r.ext.add(x.id)});return r};return {R:make(),Rp:make()}}
for(const two of [false,true]){
 const {R,Rp}=fixture(two),rg=R.regs.find(r=>r&&!r.border),room={key:'synthetic',area:rg.areaC,per:rg.per};
 SP.matchRooms(R,[room],.04,{requireSpatial:true});
 const c=SP.compose(R,Rp,[room],()=>false,{});
 assert.equal(room.reg,undefined);assert.equal(room.byBalance,undefined);assert.equal(c.spaces.length,0);
 assert.equal(c.diagnostics[0].reason,'spatial_evidence_missing');assert.ok(c.diagnostics[0].candidates.strict.length);
 assert.ok(c.unknown.some(u=>u.cands.length&&u.reason==='spatial_evidence_missing'));
 // A remote contour's better area score cannot identify this room.
 assert.equal(c.diagnostics[0].region,null);
 const manual=SP.compose(R,Rp,[room],()=>false,{assign:[{at:[2,1],keys:[room.key],session:'current',level:'L'}]}, {placementSession:'current',level:'L'});
 assert.equal(SP.compose(R,Rp,[room],()=>false,{assign:[{at:[2,1],keys:[room.key],session:'old',level:'L'}]}, {placementSession:'current',level:'L'}).spaces.length,0);
 assert.equal(SP.compose(R,Rp,[room],()=>false,{assign:[{at:[2,1],keys:[room.key],session:'current',level:'other'}]}, {placementSession:'current',level:'L'}).spaces.length,0);
 assert.equal(manual.spaces.length,1);assert.equal(manual.diagnostics[0].identification,'manual');
}
{
 const {R,Rp}=fixture(),rg=R.regs.find(r=>r&&!r.border),rooms=[{key:'a',area:rg.areaC/2},{key:'b',area:rg.areaC/2}];
 SP.matchRooms(R,rooms,.04,{requireSpatial:true});const c=SP.compose(R,Rp,rooms,()=>false,{});
 assert.equal(c.spaces.length,0);assert.ok(c.unknown.every(u=>u.cands.length===0)); // no combinatorial sum search without spatial evidence
 assert.ok(rooms.every(r=>r.byBalance===undefined));
 // A prior heuristic match is removed, including its stale labels.
 rooms[0].reg=rg.id;rg.room=rooms[0];SP.matchRooms(R,rooms,.04,{requireSpatial:true});assert.equal(rg.room,undefined);assert.equal(rooms[0].reg,undefined);
 assert.throws(()=>SP.matchRooms(R,[{key:'duplicate'},{key:'duplicate'}],.04,{requireSpatial:true}),/Повторяются идентификаторы/);
}
// Real orchestration with geometry-only mocks: do not insert manual placement.
const scripts=[...fs.readFileSync(__dirname+'/test-purpose.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const status={textContent:''},c=vm.createContext({assert,console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},performance});c.window=c;
c.document={querySelector:()=>({}),getElementById:id=>id==='kb-status'?status:null,body:{contains:()=>true}};
c.localStorage={getItem:()=>null,setItem(){}};require('./fixture-binding-dom.js')(c);
vm.runInContext(scripts[0],c);
let bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8');
bundle=bundle.replace('  return { run, st: () => st, S,','  mount=()=>{ui={remove(){},querySelector:s=>document.getElementById(s.slice(1))}};draw=()=>{};renderList=()=>{};\n  return { _census:census, run, st: () => st, S,');
vm.runInContext(bundle,c);vm.runInContext(scripts[1].split('const log=document.querySelector')[0],c);
(async()=>{
 await vm.runInContext(`(async()=>{
  G.rooms=async()=>rooms();
  let calculations=0;const calculate=Cc.space;Cc.space=(...args)=>{calculations++;return calculate(...args)};
  await KeoBim.run({region:'г. Москва'});
  assert.ok(Number.isFinite(KeoBim.st().elapsedMs));assert.equal(calculations,0);assert.ok(KeoBim.st().res.some(r=>r.kind==='nogeo'));
  assert.ok(KeoBim.st().res.every(r=>r.kind!=='calc'&&!r.C&&!r.st));
  assert.ok(KeoBim.st().levels.every(l=>l.spaces.length===0));
  assert.equal(KeoBim._census().lans,2);assert.equal(KeoBim._census().lansLevel,2);assert.equal(KeoBim._census().lansIn,0);
  await KeoBim.setBuildingGroup(DATA.rooms.find(r=>r.id==='A57').g);
  assert.equal(calculations,0);assert.ok(KeoBim.st().res.every(r=>r.kind!=='calc'));
 })()`,c);
 assert.match(status.textContent,/связь Rooms с контурами не подтверждена/);
 console.log('OK: unique/remote/summed area candidates cannot place Rooms; stale labels cleared; duplicate keys rejected; explicit manual provenance; runtime and purpose changes cannot bypass evidence');
})().catch(e=>{console.error(e);process.exitCode=1});
