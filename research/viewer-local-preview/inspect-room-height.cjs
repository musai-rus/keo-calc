/* Nearest vertical surfaces at diagnostic area centroids. This does not prove
   a clear height over the entire room or a normative characteristic section. */
const fs=require('node:fs'),M=require('./room-section-math.cjs'),R=require('../../bim/native-rays');
const [input,output]=process.argv.slice(2);if(!input)throw Error('Usage: node inspect-room-height.cjs capture.json [private-output.json]');
const a=JSON.parse(fs.readFileSync(input,'utf8'));
if(a.errors.length||a.busy)throw Error('incomplete-room-capture');
const index=R.build({unitScale:1,meshes:a.structures.map(s=>({id:String(s.fragment),triangles:s.triangles}))});
const identify=hit=>({...hit,elements:hit.ids.map(id=>{const s=a.structures.find(x=>String(x.fragment)===id);return {fragment:s.fragment,owner:s.owner};})});
const rooms=a.rooms.map(r=>{
  const centre=M.centroid(r.section.loops);if(centre.location!=='inside')return {id:r.id,number:r.number,status:'centroid-outside-room'};
  const origin=[...centre.point,r.sectionHeightMetres],up=identify(index.trace(origin,[0,0,1],r.bounds.hi[2]-origin[2]+1)),down=identify(index.trace(origin,[0,0,-1],origin[2]-r.bounds.lo[2]+1));
  return {id:r.id,number:r.number,origin,up,down,localHeight:up.status==='hit'&&down.status==='hit'?up.distance+down.distance:null,roomEnvelopeHeight:r.bounds.hi[2]-r.bounds.lo[2],normativePoint:false};
});
const result={source:a.source,rooms,geometryVerified:false,normativeVerified:false};if(output)fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
