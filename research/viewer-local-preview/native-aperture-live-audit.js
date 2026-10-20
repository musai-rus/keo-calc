/* Private diagnostic runner. It reads decoded geometry regardless of UI cuts.
   Rendering-transparent fragments are a candidate selection, not physical glass. */
(async()=>{
  const model=NOP_VIEWER.model,G=KeoNativeGeom,C=G.ctx(NOP_VIEWER),A=KeoNativeApertures;
  const fingerprint=()=>JSON.stringify({unit:model.getUnitScale(),offset:model.getData().globalOffset,placement:model.getData().placementTransform?.elements,
    world:model.getModelTransform?.()?.elements,urn:model.getData().urn,fragments:C.fl.getCount()});
  const stamp=fingerprint(),audit=window.KeoNativeApertureAudit={version:1,busy:true,rows:[],errors:[],source:{viewerSnapshot:JSON.parse(stamp)},planarityTolerance:0.00001,
    geometryVerified:false,ownershipVerified:false,opticsVerified:false,normativeVerified:false,startedAt:new Date().toISOString()};
  const assertModel=()=>{if(NOP_VIEWER.model!==model||fingerprint()!==stamp)throw Error('model-or-placement-changed');};
  try{
    const rows=KeoNativeOpeningAudit.rows.filter(r=>['IfcWindow','IfcPlate','IfcDoor'].includes(r.entity?.IfcClass));
    for(const row of rows){
      assertModel();const triangles=[];G.eachGeom(C,row.dbId,(a,b,c)=>triangles.push([a,b,c]),null,f=>f===row.fragment);
      const result=A.extract({triangles,unitScale:C.S,planarityTolerance:audit.planarityTolerance},KeoNativeSpaces);
      audit.rows.push({fragment:row.fragment,dbId:row.dbId,guid:row.entity.GlobalId,ifcClass:row.entity.IfcClass,result});
      if(audit.rows.length%10===0)await new Promise(r=>setTimeout(r,0));
    }
    assertModel();audit.completedAt=new Date().toISOString();
  }catch(e){audit.errors.push(String(e.stack||e));}finally{audit.busy=false;}
})();
