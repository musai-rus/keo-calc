/* Converter-specific labels are checked against declared source keywords and
   source material names; no physical role inferred from names or transparency. */
(async()=>{
  const viewer=NOP_VIEWER,m=viewer.model,C=KeoNativeGeom.ctx(viewer),source=KeoIfcMaterialPartsAudit,prior=KeoNativePrismAudit;
  const audit=window.KeoNativeMaterialAudit={version:1,busy:true,source:source.source,rows:[],errors:[],materialsVerified:false,normativeVerified:false};
  const fingerprint=()=>({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),assertModel=()=>{const now=fingerprint();if(viewer.model!==m||Object.keys(stamp).some(k=>JSON.stringify(now[k])!==JSON.stringify(stamp[k])))throw Error('model-or-transform-changed');};
  try{
    if(!source.source.sha256||Object.keys(stamp).some(k=>JSON.stringify(source.source.viewerSnapshot[k])!==JSON.stringify(stamp[k])))throw Error('material-source-snapshot-mismatch');
    if(prior.busy||prior.errors.length||Object.keys(stamp).some(k=>JSON.stringify(prior.source[k])!==JSON.stringify(stamp[k])))throw Error('prism-snapshot-mismatch');
    const byGuid=new Map(source.elements.map(e=>[e.guid,e])),entities=new Map(KeoOpeningEntityRows.map(e=>[e.id,e]));
    const ids=[...new Set(prior.fragments.map(f=>f.dbId))],props=await new Promise((ok,bad)=>m.getBulkProperties2(ids,{propFilter:['Name','Material','Appearance','Transparency'],ignoreHidden:false},ok,bad));assertModel();
    const byId=new Map(props.map(p=>[p.dbId,p]));
    for(const f of prior.fragments){
      const props=byId.get(f.dbId)?.properties||[],get=name=>{const a=props.filter(p=>p.attributeName===name&&!p.displayCategory);return a.length===1?a[0].displayValue:null;};
      const nodeName=C.it.getNodeName(f.dbId),name=get('Name')||nodeName,materialName=get('Material'),aspectName=typeof name==='string'&&name.startsWith('IfcShapeAspect::')?name.slice('IfcShapeAspect::'.length):null;
      let id=f.dbId,e=null;const seen=new Set();while(id&&!seen.has(id)){seen.add(id);if(entities.has(id)){e=entities.get(id);break;}id=C.it.getNodeParentId(id);}
      const match=e?.GlobalId===f.guid?KeoIfcMaterialParts.matchViewer(byGuid.get(f.guid),{aspectName,materialName}):{status:'unavailable',reason:'host-guid-mismatch',sourceMaterialMatched:false};
      audit.rows.push({fragment:f.id,dbId:f.dbId,guid:f.guid,...match,viewer:{aspectName,materialName,appearance:get('Appearance'),renderTransparency:props.filter(p=>p.attributeName==='Transparency').map(p=>p.displayValue)}});
    }
    assertModel();audit.completedAt=new Date().toISOString();
  }catch(e){audit.errors.push(String(e.stack||e));}finally{audit.busy=false;}
})();
