const assert = require('node:assert/strict');
const {capture} = require('./viewer_snapshot');
const identity = {elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
const data = {urn:'invented-urn',globalOffset:{x:10,y:20,z:30},placementTransform:identity};
const model = { getData:()=>data, getUnitScale:()=>.3048,
  getModelTransform:()=>null, getModelToViewerTransform:()=>identity };
let changed=false;
const api={capture:()=>({m:model,root:'invented-root',guid:'invented-guid'}),assert:()=>{if(changed)throw Error('changed');}};
const env={crypto:{randomUUID:()=> 'invented-session'}};
const result=capture(api,env);
assert.equal(result.snapshot.viewerBindingVerified,false);
assert.equal(result.snapshot.derivativeVersion,null);
assert.equal(result.snapshot.phase,null);
assert.equal(result.snapshot.sourceToViewer,null); // No transform guessing from offset/units.
assert.deepEqual(result.snapshot.raw.globalOffset,[10,20,30]);
assert.equal(result.assertCurrent(),true);
data.globalOffset.x++;
assert.throws(()=>result.assertCurrent(),/transform changed/);
data.globalOffset.x--;
changed=true;
assert.throws(()=>result.assertCurrent(),/changed/);
assert.throws(()=>capture(api,env),/changed/);
console.log('Viewer snapshot: read-only synthetic capture, unknown provenance and stale-state rejection passed; no live QA');
