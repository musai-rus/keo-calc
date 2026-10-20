(async()=>{
  const a=window.KeoRibbonSectionAudit,v=NOP_VIEWER,m=v.model,C=KeoNativeGeom.ctx(v),cfg=window.KeoRibbonRunSelection;
  if(window.KeoSectionRibbonLiveAudit?.busy)throw Error('ribbon-run-already-active');
  const fingerprint=()=>JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint();if(stamp!==JSON.stringify(a?.source?.viewerSnapshot))throw Error('section-snapshot-mismatch');
  const check=()=>{if(v.model!==m||fingerprint()!==stamp||window.KeoRibbonSectionAudit!==a)throw Error('model-or-section-changed');};
  if(cfg&&(!Array.isArray(cfg.fragments)||!cfg.fragments.every(Number.isSafeInteger)))throw Error('invalid-fragment-selection');
  const jobs=window.KeoSectionRibbonStudy.prepare(a,KeoRoomInputAudit,KeoRoomCellGeometry).filter(j=>!cfg||cfg.fragments.includes(j.base.fragment));
  const out=window.KeoSectionRibbonLiveAudit={source:a.source,sectionCapturedAt:a.completedAt,z:a.z,busy:true,ribbons:[],errors:[],ownershipVerified:false,normativeVerified:false};
  try{for(const job of jobs){check();const result=job.rejected?{status:'unavailable',reason:job.rejected,sides:[]}:window.KeoSectionRibbon.inspect(job.input);out.ribbons.push({...job.base,...result});await new Promise(r=>setTimeout(r,0));}check();out.completedAt=new Date().toISOString();}catch(e){out.errors.push(String(e.stack||e));}finally{out.busy=false;}
  return {ribbons:out.ribbons.length,errors:out.errors};
})();
