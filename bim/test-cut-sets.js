/* Native Viewer contract: getter aggregates sets, public setter writes one set. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const G=new Function(fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom;')();
const p={x:0,y:0,z:1,w:-2},q={x:1,y:0,z:0,w:4};
function fixture(initial={view:[p],section:[q]}){
 const sets=new Map(Object.entries(initial)),writes=[];
 const impl={getCutPlaneSets:()=>[...sets].filter(([,ps])=>ps?.length).map(([k])=>k),getCutPlaneSet:k=>sets.get(k)||[],setCutPlaneSet(k,ps){writes.push(k);sets.set(k,ps?.slice())},getAllCutPlanes:()=>[...sets.values()].filter(Boolean).flat()};
 const v={areAllVisible:()=>true,impl,getCutPlanes:()=>impl.getAllCutPlanes(),setCutPlanes:ps=>impl.setCutPlaneSet('view',ps)};
 return {v,impl,sets,writes,snapshot:()=>JSON.stringify([...sets].filter(([,ps])=>ps?.length))};
}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name)}
(async()=>{
 await test('aggregate getter and single-set setter restore each owner without duplication',()=>{
  const s=fixture(),before=s.snapshot();assert.equal(G.withFullModel(s.v,()=>s.v.getCutPlanes().length),0);assert.equal(s.snapshot(),before);assert.deepEqual(s.impl.getCutPlaneSet('view'),[p]);assert.deepEqual(s.impl.getCutPlaneSet('section'),[q]);
 });
 await test('identical planes in distinct owners retain multiplicity and ownership',()=>{const s=fixture({view:[p],section:[p]}),before=s.snapshot();G.withFullModel(s.v,()=>{});assert.equal(s.snapshot(),before);assert.equal(s.v.getCutPlanes().length,2)});
 await test('aggregate order may differ from named-set enumeration',()=>{const s=fixture();s.v.getCutPlanes=()=>s.impl.getAllCutPlanes().slice().reverse();const before=s.snapshot();G.withFullModel(s.v,()=>{});assert.equal(s.snapshot(),before)});
 await test('nested sync and returned async scopes keep all sets clear until outer completion',async()=>{const s=fixture(),before=s.snapshot();await G.withFullModel(s.v,async()=>{await G.withFullModel(s.v,async()=>{await Promise.resolve();assert.equal(s.v.getCutPlanes().length,0)});assert.equal(s.v.getCutPlanes().length,0)});assert.equal(s.snapshot(),before)});
 await test('sync callback failure restores all owners exactly once',()=>{const s=fixture(),before=s.snapshot();assert.throws(()=>G.withFullModel(s.v,()=>{throw Error('callback failed')}),/callback failed/);assert.equal(s.snapshot(),before);assert.equal(s.writes.length,4)});
 await test('async rejection restores all owners',async()=>{const s=fixture(),before=s.snapshot();await assert.rejects(G.withFullModel(s.v,async()=>{throw Error('async failed')}),/async failed/);assert.equal(s.snapshot(),before)});
 await test('snapshot owns coefficient values when caller mutates original plane',()=>{const plane={...p},s=fixture({view:[plane]});G.withFullModel(s.v,()=>plane.w=100);assert.deepEqual(s.impl.getCutPlaneSet('view'),[p])});
 await test('work-created owners are removed while initial owners are restored',()=>{const s=fixture(),before=s.snapshot();G.withFullModel(s.v,()=>s.impl.setCutPlaneSet('temporary',[q]));assert.equal(s.snapshot(),before);assert.deepEqual(s.impl.getCutPlaneSet('temporary'),[])});
 await test('partial named-set API is rejected before any mutation',()=>{for(const k of ['getCutPlaneSets','getCutPlaneSet','setCutPlaneSet']){const s=fixture();delete s.impl[k];assert.throws(()=>G.withFullModel(s.v,()=>{}),/управление/);assert.equal(s.writes.length,0)}});
 await test('unaccounted clipping is rejected before any mutation',()=>{const s=fixture();s.impl.getAllCutPlanes=()=>[p,q,p];assert.throws(()=>G.withFullModel(s.v,()=>{}),/управление/);assert.equal(s.writes.length,0)});
 await test('malformed names and coefficients fail before mutation',()=>{
  for(const names of [null,{},['view','view'],[''],[42]]){const s=fixture();s.impl.getCutPlaneSets=()=>names;assert.throws(()=>G.withFullModel(s.v,()=>{}));assert.equal(s.writes.length,0)}
  for(const ps of [{},[{...p,w:NaN}],[null]]){const s=fixture();s.impl.getCutPlaneSet=()=>ps;assert.throws(()=>G.withFullModel(s.v,()=>{}));assert.equal(s.writes.length,0)}
 });
 await test('unsupported extension that refuses clearing blocks work and retains display',()=>{const s=fixture(),before=s.snapshot(),set=s.impl.setCutPlaneSet;s.impl.setCutPlaneSet=(k,ps)=>{if(k!=='section')set(k,ps)};let calls=0;assert.throws(()=>G.withFullModel(s.v,()=>calls++),/снять/);assert.equal(calls,0);assert.equal(s.snapshot(),before)});
 await test('silent owner restoration failure cancels the result',()=>{const s=fixture(),set=s.impl.setCutPlaneSet;s.impl.setCutPlaneSet=(k,ps)=>{if(!ps?.length)set(k,ps)};assert.throws(()=>G.withFullModel(s.v,()=>42),/восстановить/)});
 await test('3D recovery clears every owner, independently from result validity',()=>{const s=fixture();G.clearSections(s.v);assert.deepEqual(s.v.getCutPlanes(),[]);assert.deepEqual(s.impl.getCutPlaneSets(),[])});
 await test('failed explicit clear restores original owners instead of leaving partial state',()=>{const s=fixture(),before=s.snapshot(),set=s.impl.setCutPlaneSet;s.impl.setCutPlaneSet=(k,ps)=>{if(k!=='section')set(k,ps)};assert.throws(()=>G.clearSections(s.v),/снять/);assert.equal(s.snapshot(),before)});
 await test('permanent setter failure does not prevent restoring another owner',()=>{const s=fixture(),before=s.snapshot(),set=s.impl.setCutPlaneSet;s.impl.setCutPlaneSet=(k,ps)=>{if(k==='section')throw Error('read-only section');set(k,ps)};let calls=0;assert.throws(()=>G.withFullModel(s.v,()=>calls++),/read-only section/);assert.equal(calls,0);assert.equal(s.snapshot(),before)});
 await test('restoration attempts all changed owners after a setter failure',()=>{const s=fixture(),set=s.impl.setCutPlaneSet;s.impl.setCutPlaneSet=(k,ps)=>{if(k==='view'&&ps?.length)throw Error('view unavailable');set(k,ps)};assert.throws(()=>G.withFullModel(s.v,()=>42),/восстановить/);assert.deepEqual(s.impl.getCutPlaneSet('section'),[q])});
 await test('getter failure restores saved owners best-effort but cancels unverifiable result',()=>{const s=fixture(),before=s.snapshot();assert.throws(()=>G.withFullModel(s.v,()=>{s.impl.getCutPlaneSets=()=>{throw Error('enumeration failed')};return 42}),/восстановить/);assert.equal(s.snapshot(),before)});
 await test('setter that applies then throws is accepted only after full restoration verification',()=>{const s=fixture(),before=s.snapshot(),set=s.impl.setCutPlaneSet;s.impl.setCutPlaneSet=(k,ps)=>{set(k,ps);if(ps?.length)throw Error('after apply')};assert.equal(G.withFullModel(s.v,()=>42),42);assert.equal(s.snapshot(),before)});
 await test('overlapping async scopes restore once after the last completion',async()=>{const s=fixture(),before=s.snapshot();let doneA,doneB;const a=G.withFullModel(s.v,()=>new Promise(ok=>doneA=ok)),b=G.withFullModel(s.v,()=>new Promise(ok=>doneB=ok));doneA('a');assert.equal(await a,'a');assert.deepEqual(s.v.getCutPlanes(),[]);doneB('b');assert.equal(await b,'b');assert.equal(s.snapshot(),before);assert.equal(s.writes.length,4)});
 await test('overlapping rejection and nested synchronous error retain the shared lease',async()=>{const s=fixture(),before=s.snapshot();let rejectA,doneB;const a=G.withFullModel(s.v,()=>new Promise((_,bad)=>rejectA=bad)),b=G.withFullModel(s.v,()=>new Promise(ok=>doneB=ok));assert.throws(()=>G.withFullModel(s.v,()=>{throw Error('nested')}),/nested/);rejectA(Error('async failed'));await assert.rejects(a,/async failed/);assert.deepEqual(s.v.getCutPlanes(),[]);doneB();await b;assert.equal(s.snapshot(),before);G.withFullModel(s.v,()=>{});assert.equal(s.snapshot(),before)});
 await test('new overlapping scope rejects externally added clipping without running work',async()=>{const s=fixture(),before=s.snapshot();let done,calls=0;const a=G.withFullModel(s.v,()=>new Promise(ok=>done=ok));s.impl.setCutPlaneSet('external',[q]);assert.throws(()=>G.withFullModel(s.v,()=>calls++),/изменилось/);assert.equal(calls,0);done();await a;assert.equal(s.snapshot(),before)});
 console.log(`${count}/${count} cut-set groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
