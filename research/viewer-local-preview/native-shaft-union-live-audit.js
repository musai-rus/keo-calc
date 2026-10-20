/* Three independent probes across each assembly's complete height.
   This solves overlaps in 2D; it does not certify a continuous 3D shaft.
   Run with the existing official browser connection and prior aperture audit. */
(async()=>{
  const viewer=NOP_VIEWER,model=viewer.model,G=KeoNativeGeom,C=G.ctx(viewer),H=KeoNativeShaftSections,S=KeoNativeSpaces,U=KeoNativeSectionUnion,prior=KeoNativeShaftAudit;
  const fingerprint=()=>({urn:model.getData().urn,unit:model.getUnitScale(),offset:model.getData().globalOffset,placement:model.getData().placementTransform?.elements,world:model.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=JSON.parse(JSON.stringify(fingerprint())),assertModel=()=>{const now=fingerprint();if(viewer.model!==model||Object.keys(now).some(k=>JSON.stringify(now[k])!==JSON.stringify(stamp[k])))throw Error('model-or-transform-changed');};
  if(window.KeoNativeShaftUnionAudit?.busy)throw Error('shaft-union-audit-already-running');
  const audit=window.KeoNativeShaftUnionAudit={version:1,busy:true,source:stamp,rows:[],errors:[],hostOpeningVerified:false,continuousShaftVerified:false,normativeVerified:false,limits:['Three probes at 25%, 50%, 75% of each full assembly height, not a continuity proof','Each fragment section must independently close; no fragment is ignored due to a failed section','Union preserves cavities and small features; no largest-void shaft assignment','Fragment is a converter partition, not a verified IFC solid','No material opacity, source revision, host cut, ownership or KEO inferred']};
  try{
    if(!prior||prior.busy||prior.errors.length||Object.keys(fingerprint()).some(k=>JSON.stringify(prior.source[k])!==JSON.stringify(stamp[k])))throw Error('shaft-audit-mismatch');
    for(const row of prior.rows){
      assertModel();const out={fragment:row.fragment,guid:row.guid,assemblyDbId:row.assemblyDbId,status:'unavailable'};audit.rows.push(out);
      if(!row.assemblyDbId){out.reason='missing-window-assembly';continue;}
      const props=await new Promise((resolve,reject)=>model.getProperties(row.assemblyDbId,resolve,reject));
      // Psets and the type have their own GlobalIds. Only root attributes
      // identify the current instance (same scope as the room collector).
      const values=name=>[...new Set(props.properties.filter(p=>p.displayCategory==='IFC Attributes'&&p.attributeName===name).map(p=>p.displayValue))];
      const guidValues=values('GlobalId'),classes=values('IfcClass');
      if(guidValues.length!==1||guidValues[0]!==row.guid||classes.length!==1||classes[0]!=='IfcWindow'){out.reason='mismatched-window-guid-or-class';continue;}
      const map=new Map();G.eachGeom(C,row.assemblyDbId,(a,b,c,meta)=>{if(!map.has(meta.fragment))map.set(meta.fragment,{id:meta.fragment,triangles:[]});map.get(meta.fragment).triangles.push([a,b,c]);});
      const parts=[...map.values()];let lo=Infinity,hi=-Infinity;for(const p of parts)for(const t of p.triangles)for(const v of t){lo=Math.min(lo,v[2]*C.S);hi=Math.max(hi,v[2]*C.S);}
      out.assemblyHeight=[lo,hi];out.partCount=parts.length;out.sections=[];
      if(!(hi>lo)){out.reason='missing-assembly-height';continue;}
      for(const f of [.25,.5,.75]){
        assertModel();const z=lo+(hi-lo)*f,started=performance.now();
        const combined=H.inspect({triangles:parts.flatMap(p=>p.triangles),unitScale:C.S,levels:[z]},S);
        const result=H.inspectParts({parts,unitScale:C.S,levels:[z]},S,U);
        out.partRanges=result.partRanges;
        out.sections.push({...result.sections[0],z,status:result.sections[0]?.status||'unavailable',reason:result.sections[0]?.reason||result.reason,previousStatus:combined.sections[0]?.status,previousReason:combined.sections[0]?.reason,elapsedMs:performance.now()-started});
        await new Promise(r=>setTimeout(r,0));
      }
      out.status='diagnostic';
    }
    assertModel();audit.completedAt=new Date().toISOString();
  }catch(e){audit.errors.push(String(e.stack||e));}finally{audit.busy=false;}
})();
