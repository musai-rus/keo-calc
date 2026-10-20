/* Extend section ribbons through height only where the supplied triangles prove
   invariant sections. The first contact can be an uncertainty envelope; it is
   never silently replaced by the nearest room behind it. No KEO calculation. */
const KeoSurfaceBandStudy=(()=>{
  function prepare(a,B){
    if(a?.version!==1||a.busy||a.errors?.length!==0||!a.completedAt||!a.source||!a.rooms?.length||!Array.isArray(a.structures))throw Error('incomplete-volume-capture');
    if(!a.scope||!['lo','hi'].every(k=>Array.isArray(a.scope[k])&&a.scope[k].length===3&&a.scope[k].every(Number.isFinite))||a.scope.lo.some((x,k)=>x>=a.scope.hi[k]))throw Error('invalid-volume-scope');
    const rows=[...a.rooms.map(r=>({...r,key:'room:'+r.id,kind:'room'})),...a.structures.map(r=>({...r,key:'fragment:'+r.fragment,kind:'structure'}))];
    if(new Set(rows.map(r=>r.key)).size!==rows.length)throw Error('duplicate-volume-identity');
    return rows.map(r=>{
      if(!r.triangles?.length||!r.bounds||!['lo','hi'].every(k=>Array.isArray(r.bounds[k])&&r.bounds[k].length===3&&r.bounds[k].every(Number.isFinite))||r.bounds.lo.some((x,k)=>x>r.bounds.hi[k]))throw Error('missing-volume-mesh-or-bounds');
      // Enclose both native bounds and decoded coordinates; never use a smaller
      // rounded box to hide an unsupported triangle.
      const bounds={lo:r.bounds.lo.slice(),hi:r.bounds.hi.slice()};
      for(const t of r.triangles){if(!Array.isArray(t)||t.length!==3)throw Error('invalid-volume-triangle');for(const p of t){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('invalid-volume-point');p.forEach((x,k)=>{bounds.lo[k]=Math.min(bounds.lo[k],x);bounds.hi[k]=Math.max(bounds.hi[k],x);});}}
      const proof=B.certify(r.triangles);
      return {key:r.key,kind:r.kind,id:r.id,fragment:r.fragment,number:r.number,name:r.name,owner:r.owner,ancestors:r.ancestors,bounds,proof};
    });
  }
  async function inspect({capture,rows,face,original,B,N,R,maxBands=256,yieldControl=async()=>{}}){
    const base={source:capture.source,capturedAt:capture.completedAt,fragment:face.fragment,assemblyId:face.assemblyId,ownershipVerified:false,opacityVerified:false,normativeVerified:false,keo:null,eventPlanesVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason,bands:[],ribbons:[]});
    if(!Number.isSafeInteger(maxBands)||maxBands<1)return fail('invalid-band-limit');
    if(!face.assemblyId||original?.ancestors[0]?.IfcClass!=='IfcPlate')return fail('explicit-plate-assembly-required');
    const patch=original.result?.patches?.filter(p=>p.status==='planar-contour'&&p.inclinationDeg>89).sort((a,b)=>b.area-a.area)[0];
    if(patch?.normal[2]!==0||!Array.isArray(patch.worldLoops)||patch.worldLoops.length!==1)return fail('nonvertical-or-multiple-panel-contours');
    // A rectangular domain must be proven, not taken from a bounding box.
    const local=patch.loops?.[0],world=patch.worldLoops[0];
    if(!Array.isArray(world)||world.some(q=>!Array.isArray(q)||q.length!==3||!q.every(Number.isFinite)))return fail('invalid-panel-points');
    if(!Array.isArray(local)||local.length!==world.length||local.some(q=>!Array.isArray(q)||q.length!==2||!q.every(Number.isFinite)))return fail('missing-planar-panel-contour');
    // The planar-contour producer inserts collinear midpoints. Remove only
    // exact axis-collinear points in that supplied plane, never use a hull.
    const p=world.filter((q,i)=>{const a=local[(i+local.length-1)%local.length],b=local[i],c=local[(i+1)%local.length];return !((a[0]===b[0]&&b[0]===c[0]&&b[1]>Math.min(a[1],c[1])&&b[1]<Math.max(a[1],c[1]))||(a[1]===b[1]&&b[1]===c[1]&&b[0]>Math.min(a[0],c[0])&&b[0]<Math.max(a[0],c[0])));});
    const xy=[...new Map(p.map(q=>[JSON.stringify(q.slice(0,2)),q.slice(0,2)])).values()];
    const zs=[...new Set(p.map(q=>q[2]))].sort((a,b)=>a-b),corners=new Set(p.map(q=>JSON.stringify(q)));
    if(p.length!==4||corners.size!==4||xy.length!==2||zs.length!==2||p.some(q=>!q.every(Number.isFinite)))return fail('nonrectangular-panel-contour');
    if(p.some((q,i)=>{const next=p[(i+1)%p.length];return q[2]!==next[2]&&(q[0]!==next[0]||q[1]!==next[1]);}))return fail('crossed-panel-contour');
    const oldSegment=[-.5,.5].map(k=>face.centre.map((x,i)=>x+face.along[i]*face.width*k));
    // Preserve the prior A/B direction while using the literal patch endpoints.
    if(Math.hypot(...xy[1].map((x,k)=>x-oldSegment[0][k]))<Math.hypot(...xy[0].map((x,k)=>x-oldSegment[0][k])))xy.reverse();
    const [z0,z1]=zs,scope={lo:capture.scope.lo.slice(0,2),hi:capture.scope.hi.slice(0,2)};
    if(z0<capture.scope.lo[2]||z1>capture.scope.hi[2])return fail('panel-exceeds-captured-height');
    if(xy.some(p=>p.some((x,k)=>x<=scope.lo[k]||x>=scope.hi[k])))return fail('panel-not-strictly-inside-scope');
    const relevant=rows.filter(r=>!r.ancestors?.some(e=>e.id===face.assemblyId)&&r.bounds.hi[2]>z0&&r.bounds.lo[2]<z1);
    const events=[...new Set([z0,z1,...relevant.flatMap(r=>r.proof.status==='constant-section-bands'?[...r.proof.levels,r.bounds.lo[2],r.bounds.hi[2]]:[r.bounds.lo[2],r.bounds.hi[2]]).filter(z=>z>z0&&z<z1)])].sort((a,b)=>a-b);
    if(events.length-1>maxBands)return fail('height-band-resource-limit');
    const bands=[],ribbons=[],ribbonCache=new Map(),sections=new Map();
    const uncertain=b=>[[b.lo[0],b.lo[1]],[b.hi[0],b.lo[1]],[b.hi[0],b.hi[1]],[b.lo[0],b.hi[1]]];
    for(let i=1;i<events.length;i++){
      const low=events[i-1],high=events[i],regions=[],unresolved=[];
      for(const r of relevant){
        if(r.bounds.lo[2]>=high||r.bounds.hi[2]<=low)continue;
        let s;
        if(r.proof.status==='constant-section-bands'){
          const k=r.key+':'+r.proof.levels.filter(z=>z<=low).length;
          s=sections.get(k);if(!s){s=B.section(r.proof,low,high,N);sections.set(k,s);}
        }
        if(s?.status==='empty-band')continue;
        if(s?.status==='closed-section')regions.push({id:r.key,kind:r.kind,loops:s.loops});
        else {if(r.bounds.lo.slice(0,2).some((x,k)=>x>=r.bounds.hi[k]))return fail('degenerate-uncertainty-envelope:'+r.key);regions.push({id:r.key,kind:'uncertain',loops:[uncertain(r.bounds)]});unresolved.push({id:r.key,reason:s?.reason||r.proof.reason});}
      }
      const signature=JSON.stringify(regions);let index=ribbonCache.get(signature);
      if(index===undefined){index=ribbons.length;ribbons.push(R.inspect({segment:xy,regions,scope}));ribbonCache.set(signature,index);}
      if(ribbons[index].status!=='ribbon')return fail('band-ribbon-failed:'+ribbons[index].reason);
      bands.push({zRange:[low,high],ribbonIndex:index,unresolved,roomSections:regions.filter(r=>r.kind==='room').length});
      await yieldControl();
    }
    return {...base,status:'surface-bands',segment:xy,zRange:zs,width:ribbons[0].width,bands,ribbons,scope,domain:'derived-rectangular-vertical-patch',sourceAccuracyVerified:false,interiorCoverage:'all-open-height-bands',eventPlanes:events,scopeComplete:false};
  }
  return {prepare,inspect};
})();
if(typeof module!=='undefined')module.exports=KeoSurfaceBandStudy;
