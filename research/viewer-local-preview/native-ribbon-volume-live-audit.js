/* Bounded full-height mesh capture. All scalar selection is supplied by caller;
   source geometry is read without changing the model, visibility or cut planes. */
(async()=>{
  const a=window.KeoRoomInputAudit,cfg=window.KeoRibbonVolumeSelection,v=NOP_VIEWER,m=v.model,G=KeoNativeGeom,C=G.ctx(v);
  if(!a||a.busy||a.errors.length||!Array.isArray(cfg?.zRange)||cfg.zRange.length!==2||!cfg.zRange.every(Number.isFinite)||cfg.zRange[0]>=cfg.zRange[1])throw Error('explicit-valid-volume-selection-required');
  if(window.KeoRibbonVolumeAudit?.busy)throw Error('ribbon-volume-already-running');
  const fingerprint=()=>JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),check=()=>{if(v.model!==m||fingerprint()!==stamp)throw Error('model-or-transform-changed');};
  if(stamp!==JSON.stringify(a.source.viewerSnapshot))throw Error('room-snapshot-mismatch');
  const scope={lo:[...a.studyBounds.lo.slice(0,2),cfg.zRange[0]],hi:[...a.studyBounds.hi.slice(0,2),cfg.zRange[1]]},entities=new Map(KeoOpeningEntityRows.map(e=>[e.id,e])),checked=new Set();
  const identity=async e=>{if(checked.has(e.id))return;const p=await new Promise((ok,bad)=>m.getProperties(e.id,ok,bad));check();const val=k=>p.properties.find(p=>p.attributeName===k&&p.displayCategory==='IFC Attributes')?.displayValue;if(val('GlobalId')!==e.GlobalId||val('IfcClass')!==e.IfcClass)throw Error('entity-identity-mismatch:'+e.id);checked.add(e.id);};
  const bounds=f=>{const b=new THREE.Box3();C.fl.getWorldBounds(f,b);return {lo:[b.min.x,b.min.y,b.min.z].map(x=>x*C.S),hi:[b.max.x,b.max.y,b.max.z].map(x=>x*C.S)};};
  const relevant=b=>{if(![...b.lo,...b.hi].every(Number.isFinite))throw Error('invalid-bounds');return scope.lo.every((x,k)=>x<=b.hi[k]&&scope.hi[k]>=b.lo[k]);};
  const out=window.KeoRibbonVolumeAudit={version:1,busy:true,source:a.source,scope,rooms:[],structures:[],errors:[],scopeComplete:false,ownershipVerified:false,normativeVerified:false,startedAt:new Date().toISOString()};
  let count=0;
  const triangles=(id,fragment)=>{const ts=[];G.eachGeom(C,id,(x,y,z)=>{if(++count>500000)throw Error('volume-triangle-limit');ts.push([x,y,z].map(p=>p.map(q=>q*C.S)));},null,fragment===undefined?undefined:f=>f===fragment);return ts;};
  try{
    for(const e of entities.values()){
      if(e.IfcClass!=='IfcSpace')continue;
      const old=KeoNativeSectionAudit.rows.find(r=>r.id===e.id&&r.guid===e.GlobalId);if(!old)throw Error('space-catalogue-mismatch');
      if(old.category!=='Rooms')continue;
      const bs=[];C.it.enumNodeFragments(e.id,f=>bs.push(bounds(f)),true);if(!bs.length)continue;
      const b={lo:[0,1,2].map(k=>Math.min(...bs.map(b=>b.lo[k]))),hi:[0,1,2].map(k=>Math.max(...bs.map(b=>b.hi[k])))};if(!relevant(b))continue;
      await identity(e);out.rooms.push({id:e.id,guid:e.GlobalId,number:old.number,name:old.name,level:old.level,bounds:b,triangles:triangles(e.id),selected:a.rooms.some(r=>r.id===e.id)});
    }
    const classes=['IfcWall','IfcWallStandardCase','IfcSlab','IfcRoof','IfcColumn','IfcCovering','IfcBeam','IfcMember','IfcPlate','IfcCurtainWall','IfcDoor','IfcWindow','IfcBuildingElementProxy','IfcStair','IfcStairFlight','IfcRailing','IfcFurniture','IfcDistributionElement'];
    for(let f=0;f<C.fl.getCount();f++){
      const id=C.fl.getDbIds(f),seen=new Set(),ancestors=[];let current=id;
      while(current&&!seen.has(current)){seen.add(current);if(entities.has(current))ancestors.push(entities.get(current));current=C.it.getNodeParentId(current);}
      const owner=ancestors[0];if(!classes.includes(owner?.IfcClass))continue;
      const geom=C.fl.getGeometry(f);if(!geom||geom.isLines)continue;const b=bounds(f);if(!relevant(b))continue;
      await identity(owner);for(const ancestor of ancestors.filter(e=>e.IfcClass==='IfcCurtainWall'))await identity(ancestor);
      out.structures.push({fragment:f,dbId:id,owner:{...owner,name:C.it.getNodeName(owner.id)},ancestors,bounds:b,triangles:triangles(id,f),physicalRole:'unspecified'});
      if(out.structures.length%20===0)await new Promise(r=>setTimeout(r,0));
    }
    check();out.structuralClasses=classes;out.triangleCount=count;out.completedAt=new Date().toISOString();
  }catch(e){out.errors.push(String(e.stack||e));}finally{out.busy=false;}
  return {rooms:out.rooms.length,structures:out.structures.length,triangles:count,errors:out.errors};
})();
