/* Three samples per candidate pane from a diagnostic interior point. Discrete
   probes do not certify an entire pane, aperture ownership or normative KEO. */
const fs=require('node:fs'),R=require('../../bim/native-rays'),M=require('./room-section-math.cjs');
const [capture,geometry,output]=process.argv.slice(2);if(!capture||!geometry)throw Error('Usage: node inspect-room-visibility.cjs capture.json geometry.json [private-output.json]');
const a=JSON.parse(fs.readFileSync(capture,'utf8')),g=JSON.parse(fs.readFileSync(geometry,'utf8'));
if(a.busy||a.errors.length||JSON.stringify(a.source)!==JSON.stringify(g.source))throw Error('incomplete-or-mismatched-input');
const index=R.build({unitScale:1,meshes:a.structures.map(s=>({id:String(s.fragment),triangles:s.triangles}))});
const rooms=a.rooms.map(room=>{
  const c=M.centroid(room.section.loops);if(c.location!=='inside')return {id:room.id,number:room.number,status:'centroid-outside-room'};
  const origin=[...c.point,room.sectionHeightMetres];
  const panes=g.faces.filter(f=>[f.negative?.id,f.positive?.id].includes(room.id)).map(f=>({fragment:f.fragment,assemblyId:f.assemblyId,assemblyName:f.assemblyName,width:f.width,z0:f.z0,z1:f.z1,probes:[.1,.5,.9].map(fraction=>{
    const point=[...f.centre,f.z0+(f.z1-f.z0)*fraction],direction=point.map((x,i)=>x-origin[i]),distance=Math.hypot(...direction),trace=index.trace(origin,direction,distance);
    return {fraction,point,...trace,elements:trace.ids.map(id=>a.structures.find(s=>String(s.fragment)===id)?.owner)};
  })}));
  return {id:room.id,number:room.number,origin,normativePoint:false,panes};
});
const result={source:a.source,rooms,geometryVerified:false,ownershipVerified:false,normativeVerified:false};if(output)fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(rooms.map(r=>({number:r.number,panes:r.panes?.map(p=>({fragment:p.fragment,assembly:p.assemblyId,width:p.width,z0:p.z0,z1:p.z1,probes:p.probes.map(q=>({fraction:q.fraction,status:q.status,elements:q.elements?.map(e=>({id:e?.id,name:e?.name}))}))}))}))));
