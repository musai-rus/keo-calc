/* Local browser experiment. No source-model edits, persistent settings or AI. */
(async () => {
  const m=NOP_VIEWER.model,G=window.KeoNativeGeom,N=window.KeoNativeSpaces;
  const records=await m.getPropertyDb().executeUserFunction(window.KeoIfcSpaceProperties.read);
  if(m!==NOP_VIEWER.model)throw Error('Model changed during IFC extraction');
  const C=G.ctx(NOP_VIEWER),guidCounts=new Map(),rows=[];
  for(const r of records.filter(r=>r.ifc.IfcClass==='IfcSpace'))guidCounts.set(r.ifc.GlobalId,(guidCounts.get(r.ifc.GlobalId)||0)+1);
  const report=window.KeoNativeSectionAudit={version:1,reference:'decoded-viewer-mesh',normativeVerified:false,sourceAccuracyVerified:false,cutRule:'1 metre above minimum native space vertex Z; geometry diagnostic only',rows,busy:true};
  try{
    for(const r of records.filter(r=>r.ifc.IfcClass==='IfcSpace')){
      const triangles=[];G.eachGeom(C,r.id,(a,b,c)=>triangles.push([a,b,c]));
      let min=Infinity,max=-Infinity;for(const t of triangles)for(const p of t){min=Math.min(min,p[2]*C.S);max=Math.max(max,p[2]*C.S);}
      const guid=r.ifc.GlobalId,duplicate=guidCounts.get(guid)!==1;
      const result=!guid||duplicate?{status:'unavailable',reason:'missing-or-duplicate-guid'}:max-min<=1?{status:'unavailable',reason:'no-height-for-diagnostic-cut'}:N.section({triangles,unitScale:C.S,z:min+1});
      rows.push({id:r.id,guid,category:r.properties.Category?.value||null,number:r.properties.Number?.value||r.ifc.Name||null,name:r.ifc.LongName||r.properties.Name?.value||null,level:r.properties.Level?.value||null,triangleCount:triangles.length,minZ:min,maxZ:max,cutZ:min+1,status:result.status,reason:result.reason||null,sectionArea:result.area||null,loops:result.loops||[],invalidVertices:result.invalidVertices||[],propertyArea:r.properties.Area||null});
      await new Promise(resolve=>setTimeout(resolve,0));
      if(m!==NOP_VIEWER.model)throw Error('Model changed during geometry analysis');
    }
    report.completedAt=new Date().toISOString();
  }catch(e){report.error=e.message;throw e;}finally{report.busy=false;}
  return JSON.stringify({spaces:rows.length,byCategory:rows.reduce((o,r)=>(o[r.category||'unknown']=(o[r.category||'unknown']||0)+1,o),{}),status:rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),roomStatuses:rows.filter(r=>r.category==='Rooms').reduce((o,r)=>(o[r.reason||r.status]=(o[r.reason||r.status]||0)+1,o),{})});
})();
