const assert=require('node:assert/strict'),R=require('./section-ribbon');
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],scope={lo:[-2,-5],hi:[12,15]},segment=[[0,0],[10,0]];
const region=(id,kind,loop)=>({id,kind,loops:[loop]});
const run=regions=>R.inspect({segment,scope,regions});
const plus=result=>{assert.equal(result.status,'ribbon',result.reason);return result.sides.find(s=>s.sign===1).cells;};
const at=(cells,x)=>cells.find(c=>c.range[0]<x&&c.range[1]>x);
let result=run([region('left','room',rect(0,1,5,8)),region('right','room',rect(5,1,10,8)),region('partition','structure',rect(4.75,.5,5.25,8))]);
let cells=plus(result);assert.deepEqual(at(cells,2).first.ids,['left']);assert.deepEqual(at(cells,8).first.ids,['right']);assert.deepEqual(at(cells,4.9).first.ids,['partition']);assert.deepEqual(at(cells,4.9).nearestRoom.ids,['left']);
// Two crossing near boundaries exchange nearest owner inside an edge interval.
cells=plus(run([region('rising','room',[[0,1],[10,5],[10,9],[0,9]]),region('falling','room',[[0,5],[10,1],[10,10],[0,10]])]));
assert.deepEqual(at(cells,2).first.ids,['rising']);assert.deepEqual(at(cells,8).first.ids,['falling']);assert.ok(cells.some(c=>c.range[0]===5||c.range[1]===5));
// A sub-millimetre wall is an interval, never skipped by sampling density.
cells=plus(run([region('room','room',rect(0,1,10,8)),region('thin','structure',rect(4.99999,.5,5.00001,2))]));
assert.deepEqual(at(cells,5).first.ids,['thin']);assert.ok(Math.abs(at(cells,5).range[1]-at(cells,5).range[0]-0.00002)<1e-12);
// An uncertainty envelope stays uncertain rather than becoming a wall or void.
cells=plus(run([region('room','room',rect(0,1,10,8)),region('missing-section','uncertain',rect(4,.5,6,2))]));assert.deepEqual(at(cells,5).first.kinds,['uncertain']);
// Coincident independent boundaries retain both owners.
cells=plus(run([region('a','room',rect(0,1,10,8)),region('b','structure',rect(0,1,10,8))]));assert.deepEqual(at(cells,5).first.ids,['a','b']);
cells=plus(run([region('far','room',rect(0,20,10,25))]));assert.equal(at(cells,5).status,'scope-exit');assert.equal(at(cells,5).nearestRoom,null);
cells=plus(run([region('overlap','room',rect(2,-1,8,8))]));assert.equal(at(cells,5).status,'panel-intersects-section');assert.equal(at(cells,5).originRegions[0].location,'inside');
// Interior loops remain holes, including a panel starting inside a hole.
cells=plus(run([{id:'holed',kind:'room',loops:[rect(0,-2,10,8),rect(2,-1,8,3)]}]));assert.equal(at(cells,5).originRegions.length,0);assert.deepEqual(at(cells,5).first.distanceRange,[3,3]);
cells=plus(run([region('touch','structure',rect(2,0,8,2))]));assert.equal(at(cells,5).originRegions[0].location,'boundary');
const reversed=R.inspect({segment:segment.slice().reverse(),scope,regions:[region('left','room',rect(0,1,5,8)),region('right','room',rect(5,1,10,8)),region('partition','structure',rect(4.75,.5,5.25,8))]});
assert.deepEqual(at(reversed.sides.find(s=>s.sign===-1).cells,2).first.ids,['right']);
const moved=R.inspect({segment:segment.map(([x,y])=>[x+1e9,y-1e9]),scope:{lo:scope.lo.map((v,k)=>v+(k?-1e9:1e9)),hi:scope.hi.map((v,k)=>v+(k?-1e9:1e9))},regions:[region('room','room',rect(0,1,10,8).map(([x,y])=>[x+1e9,y-1e9]))]});assert.deepEqual(at(plus(moved),5).first.distanceRange,[1,1]);
assert.equal(R.inspect({segment,scope,regions:[],maxOperations:1}).status,'unavailable');
assert.equal(R.inspect({segment:[[0,0],[0,0]],scope,regions:[]}).status,'unavailable');
assert.equal(R.inspect({segment,scope,regions:[region('x','room',rect(0,1,5,8)),region('x','room',rect(5,1,10,8))]}).status,'unavailable');
// Independent oracle: intersect extruded boundary meshes with native-rays.
const Rays=require('../../bim/native-rays');
const oracleRegions=[region('room','room',[[0,2],[10,4],[10,10],[0,10]]),region('left-wall','structure',rect(2,1,3,6)),region('sloped-wall','structure',[[6,.5],[8,1.5],[8,7],[6,7]])];
const oracle=Rays.build({unitScale:1,meshes:oracleRegions.map(r=>({id:r.id,triangles:r.loops.flatMap(l=>l.flatMap((a,i)=>{const b=l[(i+1)%l.length];return [[[...a,0],[...b,0],[...b,1]],[[...a,0],[...b,1],[...a,1]]];}))}))});
cells=plus(run(oracleRegions));let checked=0;
for(let i=0;i<120;i++){const x=(i+.371)/12,hit=oracle.trace([x,0,.381],[0,1,0],15),cell=at(cells,x);if(hit.status!=='hit')continue;assert.deepEqual(cell.first.ids,hit.ids);assert.ok(hit.distance>=cell.first.distanceRange[0]-1e-9&&hit.distance<=cell.first.distanceRange[1]+1e-9);checked++;}
assert.ok(checked>100);
console.log('Section ribbon: continuous partitions, crossing envelopes, thin barriers, uncertainty, coincident owners, scope, holes, origin overlaps, reversal, translation and resource guards passed.');
console.log('Independent 3D triangle-ray oracle comparisons:',checked);
