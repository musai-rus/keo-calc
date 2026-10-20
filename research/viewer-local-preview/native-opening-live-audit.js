/* Private live diagnostic. One largest-triangle centroid per transparent
   fragment is a sample, never proof of full aperture coverage or ownership. */
(async()=>{
  const R=window.KeoNativeRays,G=window.KeoNativeGeom,C=G.ctx(NOP_VIEWER),model=C.m;
  const report=window.KeoNativeOpeningAudit={version:1,busy:true,rows:[],errors:[],normativeVerified:false,ownershipVerified:false,sourceAccuracyVerified:false,
    sampleRule:'One centroid of a largest non-degenerate triangle per rendering-transparent physical fragment; both triangle normals',
    limitations:['Rendering transparency is not optical transmittance','A first space surface is not proof of entry or ownership','No complete aperture coverage','Spaces are not certified closed volumes','Areas excluded only for this model-specific diagnostic'],startedAt:new Date().toISOString()};
  const assertModel=()=>{if(NOP_VIEWER.model!==model||model.getUnitScale()!==C.S||C.fl.getCount()!==fragmentCount)throw new Error('model-changed');};
  const fragmentCount=C.fl.getCount(),byId=new Map(KeoOpeningEntityRows.map(r=>[r.id,r]));
  const pause=()=>new Promise(r=>setTimeout(r,0));
  try {
    const sourceRows=await model.getPropertyDb().executeUserFunction(KeoIfcSpaceProperties.read);
    assertModel();
    const roomRows=sourceRows.filter(r=>r.ifc.IfcClass==='IfcSpace'&&r.properties.Category?.value==='Rooms');
    const guidCounts=new Map();for(const r of sourceRows.filter(r=>r.ifc.IfcClass==='IfcSpace'))guidCounts.set(r.ifc.GlobalId,(guidCounts.get(r.ifc.GlobalId)||0)+1);
    if(!roomRows.length||roomRows.some(r=>!r.ifc.GlobalId||guidCounts.get(r.ifc.GlobalId)!==1))throw new Error('missing-or-ambiguous-space-identity');
    const meshes=roomRows.map(r=>{const triangles=[];G.eachGeom(C,r.id,(a,b,c)=>triangles.push([a,b,c]));if(!triangles.length)throw new Error('missing-space-mesh:'+r.id);return {id:r.ifc.GlobalId,triangles};});
    const spaces=R.build({meshes,unitScale:C.S});report.spaceIndex=spaces.stats;report.roomCount=roomRows.length;
    function entity(id){for(let n=0;n<64&&id;n++,id=C.it.getNodeParentId(id)){const e=byId.get(id);if(e)return e;}return null;}
    const opaque=[],glass=[];report.excluded={};
    for(let f=0;f<fragmentCount;f++){
      const g=C.fl.getGeometry(f);if(!g||g.isLines)continue;
      const id=C.fl.getDbIds(f),e=entity(id);
      if(['IfcSpace','IfcOpeningElement','IfcGrid','IfcAnnotation'].includes(e?.IfcClass)){report.excluded[e.IfcClass]=(report.excluded[e.IfcClass]||0)+1;continue;}
      const b=new THREE.Box3();C.fl.getWorldBounds(f,b);
      const box={lo:[b.min.x,b.min.y,b.min.z].map(x=>x*C.S),hi:[b.max.x,b.max.y,b.max.z].map(x=>x*C.S)};
      if(![...box.lo,...box.hi].every(Number.isFinite))throw new Error('invalid-fragment-bounds:'+f);
      const m=C.fl.getMaterial(f),item={f,id,e,box};
      (m?.transparent||m?.opacity<.95?glass:opaque).push(item);
    }
    report.transparentFragments=glass.length;report.opaqueFragments=opaque.length;
    const cache=new Map();let cachedTriangles=0;
    const read=item=>{const triangles=[];G.eachGeom(C,item.id,(a,b,c)=>triangles.push([a,b,c]),null,f=>f===item.f);if(!triangles.length)throw new Error('undecodable-physical-fragment:'+item.f);return triangles;};
    const blockers={trace(origin,direction,limit){
      const norm=Math.hypot(...direction),d=direction.map(x=>x/norm),hits=[];
      for(const item of opaque){
        const pad=128*Number.EPSILON*Math.max(1,...origin.map(Math.abs),...item.box.lo.map(Math.abs),...item.box.hi.map(Math.abs));
        if(!R.boxInterval(item.box,origin,d,limit,pad))continue;
        let idx=cache.get(item.f);
        if(!idx){const triangles=read(item);cachedTriangles+=triangles.length;if(cachedTriangles>1000000)throw new Error('diagnostic-cache-limit');idx=R.build({meshes:[{id:String(item.id),triangles}],unitScale:C.S});cache.set(item.f,idx);}
        const hit=idx.trace(origin,direction,limit);if(hit.status!=='miss')hits.push(hit);
      }
      if(!hits.length)return {status:'miss',ids:[],error:0};
      if(hits.some(h=>h.status==='unavailable'||h.reason==='coplanar-or-unstable-ray'))return {status:'ambiguous',reason:'coplanar-or-unstable-ray',distance:null,ids:[...new Set(hits.flatMap(h=>h.ids||[]))],error:0};
      const first=Math.min(...hits.map(h=>h.distance)),near=hits.filter(h=>h.distance<=first+h.error),ids=[...new Set(near.flatMap(h=>h.ids))].sort();
      return {status:ids.length>1?'ambiguous':near[0].status,reason:ids.length>1?'coincident-surfaces':near[0].reason,distance:first,ids,error:Math.max(...near.map(h=>h.error))};
    }};
    for(const item of glass){
      assertModel();const triangles=read(item);let sample=null,area2=0;
      for(const t of triangles){const a=t[1].map((x,i)=>(x-t[0][i])*C.S),b=t[2].map((x,i)=>(x-t[0][i])*C.S),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=Math.hypot(...n);
        if(len>area2){area2=len;sample={origin:[0,1,2].map(k=>(t[0][k]+t[1][k]+t[2][k])/3*C.S),normal:n.map(x=>x/len)};}}
      const row={fragment:item.f,dbId:item.id,entity:item.e,...sample,triangleArea:area2/2};
      row.result=sample?R.probe({spaces,blockers,...sample}):{status:'unavailable',reason:'degenerate-glazing'};
      report.rows.push(row);if(report.rows.length%10===0)await pause();
    }
    assertModel();report.cache={fragments:cache.size,triangles:cachedTriangles};report.summary={};
    for(const row of report.rows)for(const d of row.result.directions||[])report.summary[d.status]=(report.summary[d.status]||0)+1;
    report.completedAt=new Date().toISOString();
  }catch(e){report.errors.push(String(e.stack||e));}finally{report.busy=false;}
})();
