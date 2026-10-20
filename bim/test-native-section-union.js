const assert=require('node:assert/strict'),U=require('./native-section-union');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],square=(a,b)=>rect(a,a,b-a,b-a);
const run=regions=>U.union({regions}),near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const overlap=[[rect(0,0,3,2)],[rect(1,1,3,2)]];
let r=run(overlap);assert.equal(r.status,'closed-union');near(r.area,10);assert.equal(r.loops.length,1);
assert.equal(r.normativeVerified,false);assert.equal(r.sourceAccuracyVerified,false);
near(run([[rect(0,0,2,2)],[rect(2,0,2,2)]]).area,8); // coincident opposite sides
near(run([[rect(0,0,4,4)],[rect(1,0,2,4)]]).area,16); // collinear subdivisions
near(run([[square(0,4)],[square(1,3)]]).area,16);
near(run([[square(0,4)],[square(0,4)]]).area,16);
r=run([[square(0,4),square(1,3)],[square(1.5,2.5)]]);near(r.area,13);assert.equal(r.loops.length,3);assert.equal(r.contours.filter(c=>c.hole).length,1);
near(run([[square(0,4),square(1,3)],[square(1,3)]]).area,16);
// Overlapping rings: union keeps only their common internal void, plus exterior.
r=run([[square(0,4),square(1,3)],[rect(2,0,4,4),rect(3,1,2,2)]]);
near(r.area,20);assert.equal(r.contours.filter(c=>c.hole).length,2);
r=run([[square(0,4),square(1,3)],[rect(.5,0,4,4),rect(1.5,1,2,2)]]);
near(r.area,15);assert.equal(r.contours.filter(c=>c.hole).length,1);near(r.contours.find(c=>c.hole).area,3);
assert.equal(run([[rect(0,0,1,1)],[rect(1,1,1,1)]]).reason,'point-contact-or-open-union-boundary');
assert.equal(run([[square(0,3),square(1,4)]]).reason,'contact-within-input-region');
assert.equal(run([[[[0,0],[3,0],[0,2],[2,2],[0,0.5]]]]).status,'unavailable');
assert.equal(run([[[[0,0],[1,0],[1,0],[0,1]]]]).reason,'duplicate-input-vertex');
for(const regions of [[],[[]],[[[[0,0],[1,0],[NaN,1]]]]])assert.equal(run(regions).status,'unavailable');
assert.equal(U.union({regions:overlap,maxSegments:3}).reason,'section-union-segment-limit');
assert.equal(U.union({regions:overlap,maxOperations:1}).reason,'section-union-operation-limit');
// Preserve a real thin feature instead of tolerance welding it away.
r=run([[rect(0,0,1,1)],[rect(1+2**-40,0,1,1)]]);assert.equal(r.loops.length,2);near(r.area,2);
const reversed=overlap.slice().reverse().map(g=>g.map(l=>l.slice().reverse()));near(run(reversed).area,10);
const rotate=([x,y])=>[10-y,20+x];near(run(overlap.map(g=>g.map(l=>l.map(rotate)))).area,10);
// Independently known area of two right triangles crossing at rational points.
r=run([[[[0,0],[3,0],[0,3]]],[[[0,0],[3,3],[0,3]]]]);near(r.area,6.75);
// Rectangle oracle does not use the union implementation.
let seed=17;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)%21)-10;
for(let i=0;i<100;i++){
  const a=[rand(),rand(),1+Math.abs(rand()),1+Math.abs(rand())],b=[rand(),rand(),1+Math.abs(rand()),1+Math.abs(rand())];
  const ix=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])),iy=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
  r=run([[rect(...a)],[rect(...b)]]);if(r.status==='unavailable'){assert.equal(r.reason,'point-contact-or-open-union-boundary');assert(ix===0&&iy===0);}else near(r.area,a[2]*a[3]+b[2]*b[3]-ix*iy);
}
console.log('Section union passed: overlap, holes/islands, coincident edges, rational intersections, thin gaps, winding, limits and 100 independent rectangle areas');
