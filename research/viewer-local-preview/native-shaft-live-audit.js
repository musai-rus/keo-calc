/* Existing geometry only. Three diagnostic sections per intersected host band
   do not prove the shape between them or create a hole in the host. */
(async()=>{
  const viewer=NOP_VIEWER,model=viewer.model,G=KeoNativeGeom,C=G.ctx(viewer),H=KeoNativeShaftSections,S=KeoNativeSpaces,prior=KeoNativePrismAudit;
  const fingerprint=()=>({urn:model.getData().urn,unit:model.getUnitScale(),offset:model.getData().globalOffset,placement:model.getData().placementTransform?.elements,world:model.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),assertModel=()=>{const now=fingerprint();if(viewer.model!==model||Object.keys(stamp).some(k=>JSON.stringify(now[k])!==JSON.stringify(stamp[k])))throw Error('model-or-transform-changed');};
  const audit=window.KeoNativeShaftAudit={version:1,busy:true,source:stamp,rows:[],errors:[],hostOpeningVerified:false,continuousShaftVerified:false,normativeVerified:false,limits:['Existing IfcWindow assembly geometry only','Three interior height sections per intersected structural fragment band','An enclosed void in a window assembly is not a cut in a ceiling/slab','No inferred material opacity, room ownership or KEO','Current model fingerprint is checked; source conversion revision remains unverified']};
  try{
    if(prior.busy||prior.errors.length||Object.keys(stamp).some(k=>JSON.stringify(prior.source[k])!==JSON.stringify(stamp[k])))throw Error('prism-audit-mismatch');
    const entities=new Map(KeoOpeningEntityRows.map(e=>[e.id,e])),apertures=new Map(KeoNativeApertureAudit.rows.map(r=>[r.fragment,r]));
    const owner=id=>{const seen=new Set();while(id&&!seen.has(id)){seen.add(id);const e=entities.get(id);if(e?.IfcClass==='IfcWindow')return e;id=C.it.getNodeParentId(id);}return null;};
    for(const row of prior.rows){
      assertModel();const a=apertures.get(row.fragment),e=a&&owner(a.dbId),out={fragment:row.fragment,guid:row.guid,bands:[],status:'unavailable'};audit.rows.push(out);
      if(!e||e.GlobalId!==row.guid){out.reason='missing-or-mismatched-window-assembly';continue;}
      out.assemblyDbId=e.id;const triangles=[];G.eachGeom(C,e.id,(a,b,c)=>triangles.push([a,b,c]));
      let lo=Infinity,hi=-Infinity;for(const t of triangles)for(const p of t){lo=Math.min(lo,p[2]*C.S);hi=Math.max(hi,p[2]*C.S);}
      out.assemblyHeight=[lo,hi];out.triangleCount=triangles.length;
      const hits=new Map(row.tests.flatMap(t=>t.hits||[]).filter(h=>h.interiorTriangles&&h.zRange).map(h=>[h.id,h]));
      for(const h of hits.values()){
        const z0=Math.max(lo,h.zRange[0]),z1=Math.min(hi,h.zRange[1]);
        if(!(z1>z0)){out.bands.push({hostFragment:h.id,hostGuid:h.guid,status:'outside-assembly-height'});continue;}
        const levels=[.25,.5,.75].map(t=>z0+(z1-z0)*t),result=H.inspect({triangles,unitScale:C.S,levels},S);
        out.bands.push({hostFragment:h.id,hostDbId:h.dbId,hostGuid:h.guid,hostClass:h.ifcClass,zRange:[z0,z1],...result});
      }
      out.status='diagnostic';await new Promise(r=>setTimeout(r,0));
    }
    assertModel();audit.completedAt=new Date().toISOString();
  }catch(e){audit.errors.push(String(e.stack||e));}finally{audit.busy=false;}
})();
