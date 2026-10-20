(async()=>{
  const capture=window.KeoRibbonVolumeAudit,cell=window.KeoRoomInputAudit,faces=window.KeoRoomCellGeometry,cfg=window.KeoSurfaceBandSelection;
  if(window.KeoSurfaceBandAudit?.busy)throw Error('surface-band-run-already-busy');
  if(!capture||!cell||cell.busy||cell.errors?.length!==0||!faces||JSON.stringify(capture.source)!==JSON.stringify(cell.source)||JSON.stringify(capture.source)!==JSON.stringify(faces.source))throw Error('surface-input-source-mismatch');
  if(!Array.isArray(cfg?.fragments)||!cfg.fragments.length||new Set(cfg.fragments).size!==cfg.fragments.length||!cfg.fragments.every(Number.isSafeInteger))throw Error('explicit-panel-selection-required');
  const v=NOP_VIEWER,m=v.model,C=KeoNativeGeom.ctx(v);
  const fingerprint=()=>JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const capturedAt=capture.completedAt,stamp=JSON.stringify(capture.source.viewerSnapshot),check=()=>{if(v.model!==m||fingerprint()!==stamp||window.KeoRibbonVolumeAudit!==capture||capture.busy||capture.completedAt!==capturedAt)throw Error('surface-model-or-capture-changed');};
  check();
  const rows=KeoSurfaceBandStudy.prepare(capture,KeoVerticalSectionBands);
  const out=window.KeoSurfaceBandAudit={version:1,busy:true,source:capture.source,capturedAt:capture.completedAt,results:[],errors:[],ownershipVerified:false,normativeVerified:false,keo:null,startedAt:new Date().toISOString()};
  try{
    for(const fragment of cfg.fragments){
      check();const face=faces.faces.find(f=>f.fragment===fragment),original=cell.candidates.find(c=>c.fragment===fragment);if(!face||!original)throw Error('missing-selected-panel');
      out.results.push(await KeoSurfaceBandStudy.inspect({capture,rows,face,original,B:KeoVerticalSectionBands,N:KeoNativeSpaces,R:KeoSectionRibbon,yieldControl:async()=>{await new Promise(r=>setTimeout(r,0));check();}}));
    }
    check();out.completedAt=new Date().toISOString();
  }catch(e){out.errors.push(String(e.stack||e));}finally{out.busy=false;}
  return {panels:out.results.map(r=>({fragment:r.fragment,status:r.status,bands:r.bands.length})),errors:out.errors};
})();
