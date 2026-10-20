/* Fresh inventory of curtain-wall assemblies around the selected rooms.
   Bounds/render-material names are evidence for inspection, not glass/frame
   classification, an outer opening contour, or a transmittance coefficient. */
(async()=>{
  const source=window.KeoRoomInputAudit,v=NOP_VIEWER,m=v.model,C=KeoNativeGeom.ctx(v);
  if(!source||source.busy||source.errors.length)throw Error('room-input-audit-unavailable');
  if(window.KeoCellAssemblyCapture?.busy)throw Error('assembly-capture-already-running');
  const fingerprint=()=>JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),check=()=>{if(v.model!==m||fingerprint()!==stamp)throw Error('model-or-transform-changed');};
  if(stamp!==JSON.stringify(source.source.viewerSnapshot))throw Error('room-snapshot-mismatch');
  const out=window.KeoCellAssemblyCapture={version:1,busy:true,source:source.source,assemblies:[],errors:[],geometryVerified:false,materialsVerified:false};
  try{
    const roots=new Map();for(const c of source.candidates)for(const e of c.ancestors)if(e.IfcClass==='IfcCurtainWall')roots.set(e.id,e);
    for(const root of roots.values()){
      const p=await new Promise((ok,bad)=>m.getProperties(root.id,ok,bad));check();
      const identity=k=>p.properties.find(q=>q.displayCategory==='IFC Attributes'&&q.attributeName===k)?.displayValue;
      if(identity('GlobalId')!==root.GlobalId||identity('IfcClass')!==root.IfcClass)throw Error('assembly-identity-mismatch');
      const parts=[];C.it.enumNodeFragments(root.id,f=>{
        const box=new THREE.Box3();C.fl.getWorldBounds(f,box);
        const lo=[box.min.x,box.min.y,box.min.z].map(x=>x*C.S),hi=[box.max.x,box.max.y,box.max.z].map(x=>x*C.S);
        if(![...lo,...hi].every(Number.isFinite))throw Error('nonfinite-bounds');
        const dbId=C.fl.getDbIds(f);parts.push({fragment:f,dbId,name:C.it.getNodeName(dbId),lo,hi,renderMaterialName:C.fl.getMaterial(f)?.name||null});
      },true);
      out.assemblies.push({root,parts,properties:p.properties.filter(q=>['Length','Height','Width','Area','NetSideArea','GrossSideArea','Base Offset','Top Offset','IsExternal'].includes(q.displayName)).map(q=>({name:q.displayName,category:q.displayCategory,value:q.displayValue,unit:q.units}))});
    }
    check();out.completedAt=new Date().toISOString();
  }catch(e){out.errors.push(String(e.stack||e));}finally{out.busy=false;}
  return {assemblies:out.assemblies.length,fragments:out.assemblies.reduce((n,r)=>n+r.parts.length,0),errors:out.errors};
})();
