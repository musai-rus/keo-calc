/* Research capture for explicitly selected rooms. Selection is supplied by the
   caller; names, GUIDs and IDs of a project are not built into the algorithm.
   Nearby candidates are a study scope, not aperture ownership or a shading mask. */
(async()=>{
  const cfg=window.KeoRoomInputSelection,viewer=NOP_VIEWER,m=viewer.model,G=KeoNativeGeom,N=KeoNativeSpaces,C=G.ctx(viewer);
  if(!cfg||!Array.isArray(cfg.roomIds)||!cfg.roomIds.length||new Set(cfg.roomIds).size!==cfg.roomIds.length||!cfg.roomIds.every(Number.isSafeInteger))throw Error('explicit-room-selection-required');
  if(!Number.isFinite(cfg.marginMetres)||cfg.marginMetres<0||cfg.marginMetres>20)throw Error('explicit-study-margin-required');
  if(window.KeoRoomInputAudit?.busy)throw Error('room-input-audit-already-running');
  const fingerprint=()=>JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),assertModel=()=>{if(viewer.model!==m||fingerprint()!==stamp)throw Error('model-or-transform-changed');};
  const prior=KeoNativeApertureAudit;
  if(prior.busy||prior.errors.length||Object.keys(JSON.parse(stamp)).some(k=>JSON.stringify(prior.source.viewerSnapshot[k])!==JSON.stringify(JSON.parse(stamp)[k])))throw Error('aperture-snapshot-mismatch');
  const entities=new Map(KeoOpeningEntityRows.map(e=>[e.id,e])),properties=new Map();
  const property=async id=>{
    if(properties.has(id))return properties.get(id);
    const p=await new Promise((resolve,reject)=>m.getProperties(id,resolve,reject));assertModel();
    properties.set(id,{id,name:p.name,properties:p.properties.map(q=>({name:q.displayName,attribute:q.attributeName,category:q.displayCategory,value:q.displayValue,unit:q.units}))});return properties.get(id);
  };
  const checkIdentity=async e=>{
    const p=await property(e.id),get=k=>p.properties.find(q=>q.category==='IFC Attributes'&&q.attribute===k)?.value;
    if(get('GlobalId')!==e.GlobalId||get('IfcClass')!==e.IfcClass)throw Error('instance-identity-mismatch:'+e.id);
  };
  const chain=id=>{const list=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);if(entities.has(id))list.push({...entities.get(id),name:C.it.getNodeName(id)});id=C.it.getNodeParentId(id);}return list;};
  const box=points=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let k=0;k<3;k++){if(!Number.isFinite(p[k]))throw Error('nonfinite-coordinate');lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}return {lo,hi};};
  const overlaps=(a,b)=>a.lo.every((v,k)=>v<=b.hi[k]&&a.hi[k]>=b.lo[k]);
  const report=window.KeoRoomInputAudit={version:1,busy:true,selection:JSON.parse(JSON.stringify(cfg)),source:{viewerSnapshot:JSON.parse(stamp),ifcSha256:KeoIfcRelationAudit.source.sha256,revisionBindingVerified:false},rooms:[],candidates:[],structures:[],properties:[],errors:[],geometryVerified:false,ownershipVerified:false,normativeVerified:false,keo:null,startedAt:new Date().toISOString()};
  try{
    for(const id of cfg.roomIds){
      const e=entities.get(id);if(e?.IfcClass!=='IfcSpace')throw Error('selection-is-not-an-ifc-space:'+id);await checkIdentity(e);
      const old=KeoNativeSectionAudit.rows.find(r=>r.id===id);if(!old||old.category!=='Rooms'||old.guid!==e.GlobalId)throw Error('room-identity-mismatch:'+id);
      const triangles=[];G.eachGeom(C,id,(a,b,c)=>{if(triangles.length>=200000)throw Error('room-triangle-limit');triangles.push([a,b,c].map(p=>p.map(x=>x*C.S)));});
      if(!triangles.length)throw Error('empty-room:'+id);const bounds=box(triangles.flat()),z=bounds.lo[2]+1;
      const section=bounds.hi[2]>z?N.section({triangles,unitScale:1,z}):{status:'unavailable',reason:'insufficient-diagnostic-height'};
      report.rooms.push({id,guid:e.GlobalId,number:old.number,name:old.name,level:old.level,bounds,triangles,section,sectionHeightMetres:z,sectionIsNormativePlane:false});
    }
    report.studyBounds=box(report.rooms.flatMap(r=>[r.bounds.lo,r.bounds.hi]));
    for(let k=0;k<3;k++){report.studyBounds.lo[k]-=cfg.marginMetres;report.studyBounds.hi[k]+=cfg.marginMetres;}
    for(const r of prior.rows){
      const points=r.result.patches?.flatMap(p=>p.worldLoops?.flat()||[])||[];if(!points.length)continue;
      const bounds=box(points);if(!overlaps(bounds,report.studyBounds))continue;
      const ancestors=chain(r.dbId),owner=ancestors[0];if(!owner||owner.GlobalId!==r.guid)throw Error('candidate-owner-mismatch:'+r.dbId);
      await checkIdentity(owner);for(const a of ancestors.filter(a=>['IfcCurtainWall','IfcWindow','IfcDoor'].includes(a.IfcClass)))await checkIdentity(a);
      report.candidates.push({...r,bounds,ancestors});
    }
    let triangleCount=0;
    const structuralClasses=['IfcWall','IfcWallStandardCase','IfcSlab','IfcRoof','IfcColumn','IfcCovering'];
    for(let f=0;f<C.fl.getCount();f++){
      const id=C.fl.getDbIds(f),owner=chain(id)[0];if(!structuralClasses.includes(owner?.IfcClass))continue;
      const geom=C.fl.getGeometry(f);if(!geom||geom.isLines)continue;
      const b=new THREE.Box3();C.fl.getWorldBounds(f,b);const bounds={lo:[b.min.x,b.min.y,b.min.z].map(x=>x*C.S),hi:[b.max.x,b.max.y,b.max.z].map(x=>x*C.S)};
      if(![...bounds.lo,...bounds.hi].every(Number.isFinite))throw Error('invalid-fragment-bounds:'+f);if(!overlaps(bounds,report.studyBounds))continue;
      await checkIdentity(owner);const triangles=[];
      G.eachGeom(C,id,(a,b,c)=>{if(++triangleCount>500000)throw Error('structural-triangle-limit');triangles.push([a,b,c].map(p=>p.map(x=>x*C.S)));},null,fragment=>fragment===f);
      report.structures.push({fragment:f,dbId:id,owner,bounds,triangles});
      if(report.structures.length%25===0)await new Promise(r=>setTimeout(r,0));
    }
    report.declaredRelations=KeoIfcRelationAudit.candidates.filter(c=>report.candidates.some(r=>r.guid===c.guid)||report.rooms.some(r=>c.directSpaces?.includes(r.guid)||c.containerSpaces?.includes(r.guid)));
    report.neighbourSections=KeoNativeSectionAudit.rows.filter(r=>r.category==='Rooms'&&r.loops?.length&&overlaps({lo:[Math.min(...r.loops.flat().map(p=>p[0])),Math.min(...r.loops.flat().map(p=>p[1])),r.minZ],hi:[Math.max(...r.loops.flat().map(p=>p[0])),Math.max(...r.loops.flat().map(p=>p[1])),r.maxZ]},report.studyBounds));
    report.properties=[...properties.values()];report.scopeComplete=false;report.completedAt=new Date().toISOString();assertModel();
  }catch(e){report.errors.push(String(e.stack||e));}finally{report.busy=false;}
  return {rooms:report.rooms.map(r=>({id:r.id,number:r.number,section:r.section.status})),candidates:report.candidates.length,structures:report.structures.length,errors:report.errors};
})();
