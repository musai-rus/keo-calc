// Регрессия форматов позиций Viewer: срезы, линии, окна и фонари.
const assert = require('assert/strict'), fs = require('fs');
const G = new Function(fs.readFileSync(__dirname + '/geom.js', 'utf8') + ';return BimGeom;')();
global.THREE = { Matrix4: class { constructor() { this.elements = [1,0,0,0,0,1,0,0,0,0,1,0,10,20,30,1]; } }, Vector3: class {} };
const pts = [0,0,0, 4,0,0, 4,0,2, 0,0,2];
function geom(packed, roof = false) {
  const p = roof ? [0,0,2,4,0,2,4,2,2,0,2,2] : pts;
  // Точные half-float коды 0, 2, 4; четвёртая компонента — padding.
  const bits = {0:0,2:0x4000,4:0x4400};
  return { vb: packed ? new Float32Array(new Uint16Array(p.flatMap((v,i) => i%3===2 ? [bits[v],0] : [bits[v]])).buffer) : new Float32Array(p), vbstride: packed ? 2 : 3, attributes:{position:{itemSize:packed?4:3,bytesPerItem:packed?2:4,normalized:packed,offset:0}}, ib:new Uint16Array([0,1,2,0,2,3]) };
}
function context(g) { return {S:0.5, it:{enumNodeFragments:(id,cb)=>cb(0),getRootId:()=>0,getNodeParentId:()=>0},fl:{getGeometry:()=>g,getWorldMatrix:()=>{},getMaterial:()=>({transparent:true})}}; }
const cat = {byCat:{'Revit Windows':[1]},info:{1:{c:'Revit Windows',fam:'Skylight',type:'test'}}};
const plain = G.slice(context(geom(false)),cat,['Revit Windows'],15.5);
assert.equal(plain.length,2); assert.deepEqual(plain[0],[7,10,6,10]);
const windowPlain = G.openings(context(geom(false)),cat);
const roofPlain = G.openings(context(geom(false,true)),cat);
// Контракт официального декодера; реальный декодер дополнительно проверяется в Viewer.
global.Autodesk = {Viewing:{Private:{VertexEnumerator:{makeReadPositionFunc:g => {
  const raw = new Uint16Array(g.vb.buffer,g.vb.byteOffset,g.vb.byteLength/2);
  const half = x => (x & 0x8000 ? -1 : 1) * (x & 1023 ? 1+(x&1023)/1024 : 1) * 2**(((x>>10)&31)-15);
  return (i,p) => { ['x','y','z'].forEach((k,j)=>{const x=raw[i*4+j];p[k]=x===0?0:half(x);}); };
}}}}};
assert.deepEqual(G.slice(context(geom(true)),cat,['Revit Windows'],15.5),plain);
assert.deepEqual(G.openings(context(geom(true)),cat),windowPlain);
assert.deepEqual(G.openings(context(geom(true,true)),cat),roofPlain);
const line = geom(true); line.isLines=true; line.ib=new Uint16Array([0,1]);
assert.deepEqual(G.slice(context(line),cat,['Revit Windows'],15,[15,0.1]),[[5,10,7,10]]);
delete global.Autodesk;
assert.throws(()=>G.slice(context(geom(true)),cat,['Revit Windows'],15.5),/декодера/);
const bad=geom(false);bad.vb[0]=NaN;
assert.throws(()=>G.slice(context(bad),cat,['Revit Windows'],15.5),/некорректные координаты/);
console.log('OK: Float32, half-float, матрица и масштаб, срез, линии, окна, фонари, отказ при неверных координатах');
