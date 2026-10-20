/* Explain rejected room cuts without replacing the accepted section snapshot.
   Nearby heights are diagnostics, never automatic calculation planes. */
(async()=>{
  const viewer=NOP_VIEWER,m=viewer.model,G=KeoNativeGeom,C=G.ctx(viewer),S=KeoNativeSpaces,prior=KeoNativeSectionAudit;
  const fingerprint=()=>({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),assertModel=()=>{if(viewer.model!==m||Object.keys(stamp).some(k=>JSON.stringify(fingerprint()[k])!==JSON.stringify(stamp[k])))throw Error('model-or-transform-changed');};
  const audit=window.KeoNativeContourDiagnosis={version:1,busy:true,source:stamp,rows:[],errors:[],normativeVerified:false,sourceAccuracyVerified:false,limits:['Rejected Rooms only; accepted snapshot is unchanged','Raw section lines and candidate loops are not accepted room contours','First crossing/contact pair only; other conflicts may exist','Nearby heights +/-0.1m are diagnostic; no replacement of primary cut or normative point']};
  try{
    if(prior.busy||prior.error)throw Error('section-audit-incomplete');
    const records=await m.getPropertyDb().executeUserFunction(KeoIfcSpaceProperties.read);assertModel();
    const fresh=new Map(records.filter(r=>r.ifc.IfcClass==='IfcSpace').map(r=>[r.id,r]));
    for(const r of prior.rows.filter(r=>r.category==='Rooms'&&r.status!=='closed-section')){
      assertModel();const out={id:r.id,guid:r.guid,number:r.number,name:r.name,level:r.level,status:'unavailable'};audit.rows.push(out);
      if(fresh.get(r.id)?.ifc.GlobalId!==r.guid){out.reason='room-identity-mismatch';continue;}
      const triangles=[];G.eachGeom(C,r.id,(a,b,c)=>triangles.push([a,b,c]));
      let min=Infinity,max=-Infinity;for(const t of triangles)for(const p of t){min=Math.min(min,p[2]*C.S);max=Math.max(max,p[2]*C.S);}
      const z=min+1;out.triangleCount=triangles.length;out.cutZ=z;
      if(!Number.isFinite(z)||z!==r.cutZ||triangles.length!==r.triangleCount){out.reason='section-snapshot-changed';continue;}
      out.primary=S.section({triangles,unitScale:C.S,z,diagnostics:true});
      out.nearby=[-.1,.1].map(offset=>{const result=S.section({triangles,unitScale:C.S,z:z+offset});return {z:z+offset,offset,status:result.status,reason:result.reason||null};});
      out.status='diagnostic';await new Promise(resolve=>setTimeout(resolve,0));
    }
    assertModel();audit.completedAt=new Date().toISOString();
  }catch(e){audit.errors.push(String(e.stack||e));}finally{audit.busy=false;}
})();
