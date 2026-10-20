const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),D=require('./calculator-input-draft');
const root=path.join(__dirname,'../..');global.window=global;
const src=['data.js','report.js','engine.js','schemes.js','model.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n').split('\n').filter(l=>!/^if ?\(typeof module/.test(l)).join('\n');
const lib=new Function(src+';return {KEO,DATA}')(),input={room:{guid:'synthetic-id',name:'Synthetic import fixture',number:'X'},normId:'A57',region:'Краснодарский край',source:{viewerSnapshot:{test:true}},facadeOrientation:{value:'ЮЗ',basis:'synthetic test direction'},optics:{t1:{index:3,value:.74},t2:{index:0,value:.9},basis:'explicit test scenario'}};
for(const normId of ['A57','A60','A56']){
  const r=D.create({...input,normId},lib),s=JSON.parse(JSON.stringify(r.state)),m=lib.KEO.migrate(s).st,c=lib.KEO.compute(m);
  assert.equal(c.ok,false);assert.equal('res' in c,false);assert.equal('pass' in c,false);
  assert.equal(m.side.walls[0].dp,null);assert.equal(m.side.walls[0].windows.length,0);assert.equal(m.rtManual,'unknown');assert.equal(lib.KEO.groupOf(m),5);
  assert.equal(lib.KEO.wallCoef(m,m.side.walls[0],0).t1.v,.74);assert.equal(lib.KEO.wallCoef(m,m.side.walls[0],0).t2.v,.9);
  assert.deepEqual(m._bimDraft,s._bimDraft);
}
assert.throws(()=>D.create({...input,optics:{...input.optics,t1:{index:3,value:.8}}},lib));
assert.throws(()=>D.create({...input,normId:'unknown'},lib));
assert.throws(()=>D.create({...input,facadeOrientation:{value:'',basis:'unknown'}},lib));
const detached=D.create(input,lib);input.source.viewerSnapshot.changed=true;input.optics.t1.value=.8;
assert.equal(detached.state._bimDraft.source.viewerSnapshot.changed,undefined);assert.equal(detached.state._bimDraft.optics.t1.value,.74);
console.log('Calculator draft: 3 purposes survive JSON/migration, retain explicit optics/region and cannot produce a result; invalid choices rejected.');
