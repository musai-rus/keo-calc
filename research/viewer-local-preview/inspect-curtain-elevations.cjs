const fs=require('node:fs'),P=require('./curtain-elevation-profile'),U=require('../../bim/native-section-union');
const [capture,geometry,output,tolerance]=process.argv.slice(2),axisToleranceMetres=Number(tolerance);
if(!capture||!geometry||!output||tolerance===undefined||!Number.isFinite(axisToleranceMetres)||axisToleranceMetres<0)throw Error('Usage: node inspect-curtain-elevations.cjs private-assemblies.json private-room-geometry.json private-output.json axis-tolerance-metres');
const a=JSON.parse(fs.readFileSync(capture,'utf8')),g=JSON.parse(fs.readFileSync(geometry,'utf8'));
if(a.version!==2||a.busy||a.errors.length||JSON.stringify(a.source)!==JSON.stringify(g.source))throw Error('incomplete-or-mismatched-capture');
const properties=new Map(a.properties.map(p=>[p.id,p]));
const assemblies=a.assemblies.map(row=>{
  // Longest candidate panel gives a reproducible drawing axis, not a normative
  // façade plane or proof of the panel's material or opening ownership.
  const face=g.faces.filter(f=>f.assemblyId===row.root.id).sort((a,b)=>b.width-a.width||a.fragment-b.fragment)[0];
  if(!face)return {root:row.root,status:'unavailable',reason:'no-drawing-axis'};
  const parts=row.parts.map(p=>({id:p.fragment,triangles:p.triangles}));
  const result=P.inspect({parts,origin:[...face.centre,Math.min(...row.parts.map(p=>p.lo[2]))],along:face.along,axisToleranceMetres},U);
  return {root:row.root,axisCandidateFragment:face.fragment,properties:row.properties,...result,parts:result.parts.map(r=>{const p=row.parts.find(p=>p.fragment===r.id);return {...r,dbId:p.dbId,name:p.name,ancestors:p.ancestors,declaredMaterials:(properties.get(p.dbId)?.properties||[]).filter(q=>q.attribute==='Material').map(q=>q.value)};})};
});
const windows=[];
for(const assembly of assemblies){
  const owners=new Map();for(const p of assembly.parts||[]){const e=p.ancestors?.find(e=>['IfcWindow','IfcDoor'].includes(e.IfcClass));if(e)owners.set(e.id,e);}
  for(const root of owners.values()){
    const parts=assembly.parts.filter(p=>p.ancestors.some(e=>e.id===root.id)),result=P.framedRectangle(parts,U);
    const declaredDimensions=(properties.get(root.id)?.properties||[]).filter(q=>['OverallWidth','OverallHeight','Width','Height','Area'].includes(q.attribute));
    windows.push({root,assemblyId:assembly.root.id,origin:assembly.origin,along:assembly.along,parts:parts.map(p=>p.id),declaredDimensions,...result,openBottomFrame:root.IfcClass==='IfcDoor'?P.openBottomFrame(parts):null});
  }
}
const out={source:a.source,capturedAt:a.completedAt,axisToleranceMetres,assemblies,windows,openingDimensionsVerified:false,normativeVerified:false};
fs.writeFileSync(output,JSON.stringify(out),{flag:'wx'});
console.log(JSON.stringify(assemblies.map(a=>({id:a.root.id,status:a.status,reason:a.reason,combined:a.combined&&{status:a.combined.status,reason:a.combined.reason,area:a.combined.area,loops:a.combined.loops.length},parts:a.parts?.length,holes:a.parts?.filter(p=>p.silhouette.contours.some(c=>c.hole)).map(p=>({id:p.id,name:p.name,holes:p.silhouette.contours.filter(c=>c.hole).length}))}))));
console.log(JSON.stringify(windows.map(({root,status,reason,outer,infill})=>({id:root.id,status,reason,outer,infill}))));
