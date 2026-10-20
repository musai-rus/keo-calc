/* Fresh geometry of curtain-wall assemblies around the selected rooms.
   Declared class/material is evidence, not a physical transparency rule.
   Keep part boundaries and triangles: a rotated AABB is not an opening. */
(async()=>{
  const source=window.KeoRoomInputAudit,v=NOP_VIEWER,m=v.model,C=KeoNativeGeom.ctx(v);
  if(!source||source.busy||source.errors.length)throw Error('room-input-audit-unavailable');
  if(window.KeoCellAssemblyCapture?.busy)throw Error('assembly-capture-already-running');
  const fingerprint=()=>JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),check=()=>{if(v.model!==m||fingerprint()!==stamp)throw Error('model-or-transform-changed');};
  if(stamp!==JSON.stringify(source.source.viewerSnapshot))throw Error('room-snapshot-mismatch');
  const entities=new Map(KeoOpeningEntityRows.map(e=>[e.id,e])),properties=new Map();
  const property=async id=>{
    if(!properties.has(id)){
      const p=await new Promise((ok,bad)=>m.getProperties(id,ok,bad));check();
      const e=entities.get(id),get=k=>p.properties.find(q=>q.displayCategory==='IFC Attributes'&&q.attributeName===k)?.displayValue;
      if(e&&(get('GlobalId')!==e.GlobalId||get('IfcClass')!==e.IfcClass))throw Error('part-identity-mismatch:'+id);
      properties.set(id,{id,name:p.name,properties:p.properties.map(q=>({attribute:q.attributeName,category:q.displayCategory,value:q.displayValue,unit:q.units}))});
    }
    return properties.get(id);
  };
  const chain=id=>{const list=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);if(entities.has(id))list.push({...entities.get(id)});id=C.it.getNodeParentId(id);}return list;};
  const out=window.KeoCellAssemblyCapture={version:2,busy:true,source:source.source,assemblies:[],properties:[],errors:[],geometryVerified:false,materialsVerified:false,startedAt:new Date().toISOString()};
  try{
    let triangleCount=0;
    const roots=new Map();for(const c of source.candidates)for(const e of c.ancestors)if(e.IfcClass==='IfcCurtainWall')roots.set(e.id,e);
    for(const root of roots.values()){
      const p=await new Promise((ok,bad)=>m.getProperties(root.id,ok,bad));check();
      const identity=k=>p.properties.find(q=>q.displayCategory==='IFC Attributes'&&q.attributeName===k)?.displayValue;
      if(identity('GlobalId')!==root.GlobalId||identity('IfcClass')!==root.IfcClass)throw Error('assembly-identity-mismatch');
      const parts=[];C.it.enumNodeFragments(root.id,f=>{
        const box=new THREE.Box3();C.fl.getWorldBounds(f,box);
        const lo=[box.min.x,box.min.y,box.min.z].map(x=>x*C.S),hi=[box.max.x,box.max.y,box.max.z].map(x=>x*C.S);
        if(![...lo,...hi].every(Number.isFinite))throw Error('nonfinite-bounds');
        const dbId=C.fl.getDbIds(f),triangles=[];
        KeoNativeGeom.eachGeom(C,dbId,(a,b,c)=>{
          if(++triangleCount>500000)throw Error('assembly-triangle-limit');
          const t=[a,b,c].map(p=>p.map(x=>x*C.S));if(!t.flat().every(Number.isFinite))throw Error('nonfinite-triangle');triangles.push(t);
        },null,fragment=>fragment===f);
        if(!triangles.length)throw Error('empty-part-geometry:'+f);
        parts.push({fragment:f,dbId,name:C.it.getNodeName(dbId),ancestors:chain(dbId),lo,hi,triangles,renderMaterialName:C.fl.getMaterial(f)?.name||null});
      },true);
      for(const part of parts){await property(part.dbId);for(const ancestor of part.ancestors)await property(ancestor.id);}
      out.assemblies.push({root,parts,properties:p.properties.filter(q=>['Length','Height','Width','Area','NetSideArea','GrossSideArea','Base Offset','Top Offset','IsExternal'].includes(q.displayName)).map(q=>({name:q.displayName,category:q.displayCategory,value:q.displayValue,unit:q.units}))});
    }
    check();out.properties=[...properties.values()];out.triangleCount=triangleCount;out.completedAt=new Date().toISOString();
  }catch(e){out.errors.push(String(e.stack||e));}finally{out.busy=false;}
  return {assemblies:out.assemblies.length,fragments:out.assemblies.reduce((n,r)=>n+r.parts.length,0),errors:out.errors};
})();
