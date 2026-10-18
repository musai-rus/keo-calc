/* Synthetic Room/region conflicts. No private model IDs or coordinates. */
const assert=require('node:assert/strict');
const SP=new Function(require('node:fs').readFileSync(__dirname+'/spaces.js','utf8')+';return BimSpaces;')();
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS '+name);}
const region=(id,area)=>({id,areaC:area,areaV:area,per:14});
const room=(key,area)=>({key,area,per:14});
test('claimed first choice does not promote a second choice into identity',()=>{
  for(const reverseRooms of [false,true])for(const reverseRegions of [false,true]){
    // A->1 is reciprocal. B also prefers 1; region 2 prefers B, but that
    // non-reciprocal edge must not become an assignment after A claims 1.
    const rooms=[room('A',10),room('B',10.1)];if(reverseRooms)rooms.reverse();
    const regions=[region(1,10),region(2,10.25)];if(reverseRegions)regions.reverse();
    const R={regs:[null,...regions]};SP.matchRooms(R,rooms);
    assert.equal(rooms.find(r=>r.key==='A').reg,1);
    assert.equal(rooms.find(r=>r.key==='B').reg,undefined);
    assert.equal(regions.find(r=>r.id===2).room,undefined);
  }
});
test('a greedy chain cannot promote a third choice after two preferred regions are claimed',()=>{
  for(const rev of [false,true]){
    const rooms=[room('A',10),room('B',10.2),room('C',10.09)];
    const regions=[region(1,10),region(2,10.2),region(3,10.45)];
    if(rev){rooms.reverse();regions.reverse();}
    SP.matchRooms({regs:[null,...regions]},rooms);
    assert.equal(rooms.find(r=>r.key==='A').reg,1);
    assert.equal(rooms.find(r=>r.key==='B').reg,2);
    assert.equal(rooms.find(r=>r.key==='C').reg,undefined);
    assert.equal(regions.find(r=>r.id===3).room,undefined);
  }
});
test('reciprocal unique first choices retain the original numerical match',()=>{
  const rooms=[room('A',8),room('B',15)];const R={regs:[null,region(1,8.01),region(2,15.02)]};
  SP.matchRooms(R,rooms);assert.deepEqual(rooms.map(r=>r.reg),[1,2]);
  assert.equal(rooms[0].areaModel,8.01);assert.equal(rooms[1].areaModel,15.02);
});
test('equal first choices still refuse identity in either input order',()=>{
  for(const rev of [false,true]){const rooms=[room('A',10),room('B',10)];if(rev)rooms.reverse();
    const R={regs:[null,region(1,10),region(2,10)]};SP.matchRooms(R,rooms);
    assert.ok(rooms.every(r=>!r.reg&&r.matchAmbiguous));assert.ok(R.regs.slice(1).every(r=>!r.room));}
});
test('the existing mutually sole relaxed pass remains available',()=>{
  const rooms=[room('A',20)];const R={regs:[null,region(1,21.2)]};
  SP.matchRooms(R,rooms);assert.equal(rooms[0].reg,1);assert.equal(rooms[0].loose,true);
});
test('a relaxed-only room cannot take a region with an unresolved tight preference',()=>{
  const rooms=[room('A',10),room('B',10.1),room('relaxed',11)];
  const R={regs:[null,region(1,10),region(2,10.25)]};SP.matchRooms(R,rooms);
  assert.equal(rooms[0].reg,1);assert.equal(rooms[1].reg,undefined);assert.equal(rooms[2].reg,undefined);
  assert.equal(R.regs[2].room,undefined);
});
console.log(tests+'/'+tests+' Room preference groups passed');
