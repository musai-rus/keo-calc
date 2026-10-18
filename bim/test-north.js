/* Independent cardinal direction expectations and transform composition. No Viewer or private model. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const N=new Function(fs.readFileSync(__dirname+'/north.js','utf8')+';return BimNorth')();
const C=new Function(fs.readFileSync(__dirname+'/calc.js','utf8')+';return BimCalc')();
let count=0;const test=(s,f)=>{f();count++;console.log('PASS '+s)},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const ref=degrees=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [c,s,0,-s,c,0,0,0,1,123,456,789]};
const world=degrees=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,-100,200,5,1]};
for(const [input,expected] of [[0,0],[90,90],[180,180],[270,270],[-90,270],[360,0],[720,0],[-360,0]])test('Manual '+input+' gives expected cardinal azimuth in Viewer axes',()=>{
 const n=N.resolve(ref(68.8),input,'manual',world(120));assert.equal(n.source,'manual');close(n.rot,expected);close(C.azimuth([0,1],n.rot),expected);close(C.azimuth([1,0],n.rot),(expected+90)%360);
});
test('Manual angle accepts comma, preserves input, rejects invalid values',()=>{
 assert.equal(N.resolve(null,'32,6').rot,32.6);assert.equal(N.resolve(null,'-90').input,-90);
 for(const raw of ['Infinity','NaN','oops',Infinity,NaN,true,{},[90]])assert.throws(()=>N.resolve(null,raw,'manual'),/конечным/);
 assert.equal(N.resolve(null,'','manual').rot,null);
});
test('Unknown auto north never supplies zero',()=>{
 for(const T of [null,[],[1,0,0,0,1],ref(0).map((x,i)=>i===0?Infinity:x)]){const n=N.resolve(T,'','auto');assert.equal(n.rot,null);assert.equal(n.unknown,true)}
 assert.equal(N.resolve(ref(0),'','auto').rot,0);
});
test('Auto removes placement rotation exactly once; manual ignores auto matrices',()=>{
 close(N.resolve(ref(70),'','auto',world(30)).rot,-40);
 close(N.resolve(ref(70),'','auto',world(70)).rot,0);
 close(C.azimuth([-.5,Math.sqrt(3)/2],N.resolve(ref(70),'','auto',world(30)).rot),290);
 assert.equal(N.resolve(ref(70),90,'manual',world(30)).rot,90);
});
test('Nonplanar, mirrored, sheared or malformed transforms cannot authorize auto',()=>{
 const bad=[[],world(0).map((x,i)=>i===1?.1:x),world(0).map((x,i)=>i===0?-1:x),world(0).map((x,i)=>i===2?.1:x),world(0).map((x,i)=>i===15?0:x)];
 bad.forEach(m=>assert.equal(N.resolve(ref(0),'','auto',m).unknown,true));
 const shear=ref(0);shear[3]=.1;assert.equal(N.resolve(shear,'','auto').unknown,true);
});
console.log(`${count}/${count} north groups passed`);
