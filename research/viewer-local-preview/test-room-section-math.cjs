const assert=require('node:assert/strict'),M=require('./room-section-math.cjs');
const outer=[[0,0],[10,0],[10,8],[0,8]],hole=[[1,1],[3,1],[3,3],[1,3]];
for(const loops of [[outer,hole],[hole,outer],[outer.slice().reverse(),hole.slice().reverse()]]){
  const c=M.centroid(loops);assert.equal(c.area,76);assert.ok(Math.abs(c.point[0]-392/76)<1e-12);assert.ok(Math.abs(c.point[1]-312/76)<1e-12);
  assert.deepEqual(M.lineIntervals(loops,[0,2],[1,0]).inside,[[0,1],[3,10]]);
  const moved=loops.map(l=>l.map(([x,y])=>[x+1e9,y-1e9]));
  const cm=M.centroid(moved);assert.ok(Math.abs(cm.point[0]-1e9-c.point[0])<1e-7);
}
assert.deepEqual(M.lineIntervals([outer],[5,4],[1,0]).inside,[[-5,5]]);
assert.deepEqual(M.lineIntervals([outer],[20,4],[-2,0]).inside,[[10,20]]);
assert.deepEqual(M.lineIntervals([outer],[0,12],[1,0]).inside,[]);
assert.equal(M.lineIntervals([outer],[0,0],[1,0]).status,'boundary-overlap');
const u=[[0,0],[6,0],[6,6],[4,6],[4,2],[2,2],[2,6],[0,6]];
assert.deepEqual(M.lineIntervals([u],[0,3],[1,0]).inside,[[0,2],[4,6]]);
assert.equal(M.centroid([u]).location,'outside'); // Must never become an automatic room point.
assert.throws(()=>M.centroid([[[0,0],[1,0],[2,0]]]));
assert.throws(()=>M.lineIntervals([outer],[0,0],[0,0]));
assert.throws(()=>M.lineIntervals([outer],[0,0],[1.7e308,1.7e308]));
console.log('Room-section diagnostics: holes, orientation/order, translation, concavity, boundary and invalid inputs passed.');
