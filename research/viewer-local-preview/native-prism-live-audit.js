/* Diagnostic only: the continuous footprint column against walls and slabs.
   No implied empty volume, shaft, complete blocker set or normative shading. */
(async()=>{
  const viewer=NOP_VIEWER,model=viewer.model,G=KeoNativeGeom,C=G.ctx(viewer),P=KeoNativePrism,A=KeoNativeApertures,S=KeoNativeSpaces;
  const fingerprint=()=>JSON.stringify({urn:model.getData().urn,unit:model.getUnitScale(),offset:model.getData().globalOffset,placement:model.getData().placementTransform?.elements,world:model.getModelTransform?.()?.elements,fragments:C.fl.getCount()});
  const stamp=fingerprint(),assertModel=()=>{if(viewer.model!==model||fingerprint()!==stamp)throw Error('model-or-transform-changed');};
  const audit=window.KeoNativePrismAudit={version:1,busy:true,rows:[],errors:[],source:JSON.parse(stamp),scope:['IfcWall','IfcWallStandardCase','IfcSlab','IfcRoof'],scopeComplete:false,ownershipVerified:false,normativeVerified:false,startedAt:new Date().toISOString(),limits:['Only selected wall/roof/slab meshes','No mesh intersection does not prove empty volume, shaft, room ownership or absence of obstacles','Straight vertical column is not the full set of daylight directions','Convex single-loop aperture footprint only','From diagnostic room section to minimum glazing face Z, not a normative calculation point']};
  try{
    const prior=KeoNativeApertureAudit.source?.viewerSnapshot,now=JSON.parse(stamp);
    if(!prior||['urn','unit','offset','placement','world','fragments'].some(k=>JSON.stringify(prior[k])!==JSON.stringify(now[k])))throw Error('aperture-snapshot-does-not-match-current-model');
    audit.materialsVerified=false;
    audit.sectionSnapshotVerified=false;
    audit.limits.push('Room sections lack an independent persisted model fingerprint; source revision and section provenance remain unverified','Material semantics are not resolved; geometry includes air and other non-opaque or unknown materials');
    const rooms=KeoNativeSectionAudit.rows.filter(r=>r.category==='Rooms'),entities=new Map(KeoOpeningEntityRows.map(r=>[r.id,r]));
    audit.unavailableRooms=rooms.filter(r=>r.status!=='closed-section').map(r=>({guid:r.guid,reason:r.reason}));
    const boxes=[],queries=[];
    for(const r of KeoNativeApertureAudit.rows.filter(r=>r.ifcClass==='IfcWindow')){
      const face=r.result.patches.filter(p=>p.status==='planar-contour').slice().sort((a,b)=>b.area-a.area)[0];if(!face||face.inclinationDeg>=45)continue;
      const loops=face.worldLoops.map(l=>l.map(p=>p.slice(0,2))),zMax=Math.min(...face.worldLoops.flat().map(p=>p[2]));
      const row={fragment:r.fragment,guid:r.guid,tests:[],footprintLoops:loops};audit.rows.push(row);
      if(loops.length!==1){row.reason='multiple-aperture-loops-unsupported';continue;}
      for(const room of rooms.filter(room=>room.status==='closed-section'&&room.cutZ<zMax)){
        const coverage=A.planCoverage(loops,room.loops,S);if(coverage.status!=='contained-projection')continue;
        const polygon=loops[0],zMin=room.cutZ,box={lo:[Math.min(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1])),zMin],hi:[Math.max(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[1])),zMax]};
        boxes.push(box);queries.push({row,room,polygon,zMin,zMax});
      }
    }
    const overlaps=(a,b)=>a.lo.every((v,k)=>v<=b.hi[k]&&a.hi[k]>=b.lo[k]);
    const owner=id=>{const seen=new Set();while(id&&!seen.has(id)){seen.add(id);if(entities.has(id))return entities.get(id);id=C.it.getNodeParentId(id);}return null;};
    const meshes=[],meta=[];let triangleCount=0;
    for(let f=0;f<C.fl.getCount();f++){
      assertModel();const id=C.fl.getDbIds(f),e=owner(id);if(!audit.scope.includes(e?.IfcClass))continue;
      const geom=C.fl.getGeometry(f);if(!geom||geom.isLines)continue;
      const b=new THREE.Box3();C.fl.getWorldBounds(f,b);const box={lo:[b.min.x,b.min.y,b.min.z].map(x=>x*C.S),hi:[b.max.x,b.max.y,b.max.z].map(x=>x*C.S)};
      if(![...box.lo,...box.hi].every(Number.isFinite))throw Error('invalid-structural-bounds:'+f);
      if(!boxes.some(q=>overlaps(q,box)))continue;
      const triangles=[];G.eachGeom(C,id,(a,b,c)=>triangles.push([a,b,c]),null,frag=>frag===f);
      if(!triangles.length)throw Error('undecodable-structural-fragment:'+f);
      triangleCount+=triangles.length;if(triangleCount>2000000)throw Error('prism-live-resource-limit');
      meshes.push({id:String(f),triangles});meta.push({id:String(f),dbId:id,guid:e.GlobalId,ifcClass:e.IfcClass,materialStatus:'unverified',box});
      if(meshes.length%20===0)await new Promise(r=>setTimeout(r,0));
    }
    assertModel();audit.fragments=meta;
    const index=P.build({meshes,unitScale:C.S},KeoProjectedArea);audit.indexStats=index.stats;
    const byFragment=new Map(meta.map(m=>[m.id,m]));
    for(const q of queries){
      assertModel();const result=index.test(q);q.row.tests.push({spaceGuid:q.room.guid,number:q.room.number,level:q.room.level,zMin:q.zMin,zMax:q.zMax,...result,hits:result.hits?.map(h=>({...h,...byFragment.get(h.id)}))});
      await new Promise(r=>setTimeout(r,0));
    }
    assertModel();audit.completedAt=new Date().toISOString();
  }catch(e){audit.errors.push(String(e.stack||e));}finally{audit.busy=false;}
})();
