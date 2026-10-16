/* Synthetic property extraction → shaft inputs → calculation; no live model claim. */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2]||path.join(__dirname,'..'),dir=path.join(root,'bim');
const source=fs.readFileSync(path.join(dir,'test-lantern-properties.js'),'utf8').split('(async()=>{')[0];
const {G,fixture,bulk,U}=new Function('require','__dirname',source+';return {G,fixture,bulk,U};')(require,dir);
const base=fs.readFileSync(path.join(dir,'test-bim.js'),'utf8').replace('process.exit(fails ? 1 : 0);','if(fails) throw Error("Baseline fixture failed");');
const {Cc,env,SPC}=new Function('require','__dirname','console',base+';return {Cc,env,SPC};')(require,dir,{log(){}});
const lantern=()=>({id:1,cat:'Revit Windows',type:'synthetic shaft',roof:true,c:[3,4],t:[1,0],n:[0,1],av:1.7,bv:1.7,d:1.7,round:true,z0:4.2,z1:4.4,tilt:0,H:3.6,hsf:.6});
(async()=>{
 let count=0;
 const cases=[
  ['bulk millimeters',bulk(1500,2100,U('millimeters')),[]],
  ['bulk decimal comma meters',bulk('1,50','2,10',U('meters')),[]],
  ['bulk centimeters',bulk(150,210,U('centimeters')),[]],
  ['valid raw preferred',bulk(1.7,1.7,U('meters')),[{id:1,values:[{name:'Diameter_Inside',value:1500,context:U('millimeters')},{name:'Diameter_Bottom',value:2100,context:U('millimeters')}]}]],
  ['unknown raw falls back',bulk(1.5,2.1,U('meters')),[{id:1,values:[{name:'Diameter_Inside',value:1500},{name:'Diameter_Bottom',value:2100}]}]],
  ['invalid raw falls back',bulk(1.5,2.1,U('meters')),[{id:1,values:[{name:'Diameter_Inside',value:-1500,context:U('millimeters')},{name:'Diameter_Bottom',value:Infinity,context:U('millimeters')}]}]]
 ];
 let expected;
 for(const [name,records,raw]of cases){
  const p=(await G.lanternParams(fixture(records,raw),[1]))[1];assert.equal(p.dIn,1.5);assert.equal(p.dBot,2.1);
  const l=lantern();l.dTop=p.dIn||null;l.dBot=p.dBot||null;l.paramNotes=p.notes||[];
  const result=Cc.space(SPC,[],[l],env());assert.ok(result.C.ok);const type=result.st.top.types[0];assert.equal(type.shape,'round');assert.equal(type.dv,1.5);assert.equal(type.dn,2.1);
  assert.ok(result.C.res.e.every(Number.isFinite));if(expected)assert.deepEqual(result.C.res.e,expected);else expected=result.C.res.e;
  if(name.includes('falls back'))assert.ok(l.paramNotes.length);else assert.equal(l.paramNotes.length,0);
  console.log('PASS '+name+': shaft 1.5/2.1 m replaces glazing 1.7 m');count++;
 }
 const fallback=Cc.space(SPC,[],[lantern()],env());assert.ok(fallback.C.ok);assert.equal(fallback.st.top.types[0].dv,1.7);assert.equal(fallback.st.top.types[0].dn,1.7);assert.notDeepEqual(fallback.C.res.e,expected);count++;
 console.log(`${count}/${count} synthetic shaft-to-calculation groups passed; no live-model KEO asserted`);
})().catch(e=>{console.error(e);process.exitCode=1});
