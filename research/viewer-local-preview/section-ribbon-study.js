/* Shared preparation for offline and in-Viewer execution. Private selection
   and geometry are arguments; no model IDs or room-specific rules live here. */
const KeoSectionRibbonStudy=(()=>{
  function prepare(a,cell,faces){
    if(a?.version!==2||a.busy||a.errors.length||!Number.isFinite(a.z)||JSON.stringify(a.source)!==JSON.stringify(faces?.source)||JSON.stringify(a.source)!==JSON.stringify(cell?.source))throw Error('incomplete-or-mismatched-input');
    const uncertain=b=>[[b.lo[0],b.lo[1]],[b.hi[0],b.lo[1]],[b.hi[0],b.hi[1]],[b.lo[0],b.hi[1]]];
    const roomRegions=a.rooms.map(r=>({id:'room:'+r.id,kind:r.section.status==='closed-section'?'room':'uncertain',loops:r.section.status==='closed-section'?r.section.loops:[uncertain(r.bounds)]}));
    const jobs=[];
    for(const f of faces.faces){
      const original=cell.candidates.find(c=>c.fragment===f.fragment);
      if(!f.assemblyId||original?.ancestors[0]?.IfcClass!=='IfcPlate'||!(f.z0<a.z&&f.z1>a.z))continue;
      const base={fragment:f.fragment,assemblyId:f.assemblyId,face:f};
      const face=original.result.patches.filter(p=>p.status==='planar-contour'&&p.inclinationDeg>89).sort((a,b)=>b.area-a.area)[0];
      if(face?.normal[2]!==0){jobs.push({base,rejected:'nonvertical-face-requires-height-intersection'});continue;}
      // Own frames are handled in the opening/τ2 study. Other assemblies remain
      // geometric contacts; their physical opacity has not been classified.
      const structures=a.structures.filter(r=>!r.ancestors?.some(e=>e.id===f.assemblyId));
      const regions=[...roomRegions,...structures.map(r=>({id:'fragment:'+r.fragment,kind:r.section.status==='closed-section'?'structure':'uncertain',loops:r.section.status==='closed-section'?r.section.loops:[uncertain(r.bounds)]}))];
      const segment=[-.5,.5].map(k=>f.centre.map((v,i)=>v+f.along[i]*f.width*k));
      jobs.push({base,input:{segment,regions,scope:a.scope}});
    }
    return jobs;
  }
  return {prepare};
})();
if(typeof module!=='undefined')module.exports=KeoSectionRibbonStudy;
