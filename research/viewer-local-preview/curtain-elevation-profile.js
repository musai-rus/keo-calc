/* Orthographic silhouettes of separate curtain parts. Projection is a drawing,
   not unfolding: curved assemblies must not become rectangular calculator inputs.
   No snapping, convex hull, filled holes, material guesses or model identifiers. */
const KeoCurtainElevationProfile=(()=>{
  function inspect({parts,origin,along,axisToleranceMetres=0,maxTriangles=20000}={},Union){
    const base={reference:'union-of-projected-part-triangles',openingDimensionsVerified:false,ownershipVerified:false,normativeVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason,parts:[]});
    const point=(p,n)=>Array.isArray(p)&&p.length===n&&p.every(Number.isFinite);
    if(!Union?.union)return fail('missing-union-dependency');
    if(!Number.isFinite(axisToleranceMetres)||axisToleranceMetres<0)return fail('invalid-axis-tolerance');
    if(!point(origin,3)||!point(along,2)||!Math.hypot(...along)||!Number.isFinite(Math.hypot(...along)))return fail('invalid-projection-frame');
    if(!Array.isArray(parts)||!parts.length||parts.some(p=>p.id===undefined||!Array.isArray(p.triangles)||!p.triangles.length)||new Set(parts.map(p=>p.id)).size!==parts.length)return fail('invalid-parts');
    if(!Number.isSafeInteger(maxTriangles)||maxTriangles<1||parts.reduce((n,p)=>n+p.triangles.length,0)>maxTriangles)return fail('profile-resource-limit');
    const length=Math.hypot(...along),u=along.map(x=>x/length),n=[-u[1],u[0]],rows=[];
    const project=p=>[(p[0]-origin[0])*u[0]+(p[1]-origin[1])*u[1],p[2]-origin[2]];
    for(const p of parts){
      if(p.triangles.some(t=>!Array.isArray(t)||t.length!==3||t.some(v=>!point(v,3))))return fail('invalid-triangle');
      const regions=[],depths=[];let edgeOnTriangles=0,maxTrianglePlaneSpan=0,axisAligned=true;
      for(const t of p.triangles){
        const q=t.map(project),d=t.map(v=>(v[0]-origin[0])*n[0]+(v[1]-origin[1])*n[1]);depths.push(...d);
        if(!q.flat().every(Number.isFinite)||!depths.slice(-3).every(Number.isFinite))return fail('nonfinite-projection');
        const span=Math.min(...[q.map(v=>v[0]),d,q.map(v=>v[1])].map(a=>Math.max(...a)-Math.min(...a)));
        const arithmeticBound=256*Number.EPSILON*Math.max(1,...origin.map(Math.abs),...t.flat().map(Math.abs));
        maxTrianglePlaneSpan=Math.max(maxTrianglePlaneSpan,span);if(span>axisToleranceMetres+arithmeticBound)axisAligned=false;
        const determinant=(q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0]);
        if(!Number.isFinite(determinant))return fail('nonfinite-projection-area');
        // An exactly edge-on triangle has no projected area; all other areas,
        // however small, stay in the union. A rounding failure is not repaired.
        if(determinant===0){edgeOnTriangles++;continue;}
        regions.push([q]);
      }
      if(!regions.length)return fail('edge-on-part:'+p.id);
      const silhouette=Union.union({regions});
      if(silhouette.status!=='closed-union')return fail('part-'+p.id+':'+silhouette.reason);
      const points=silhouette.loops.flat(),bounds={lo:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],hi:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};
      rows.push({id:p.id,depthRange:[Math.min(...depths),Math.max(...depths)],bounds,edgeOnTriangles,silhouette,axisAlignment:{withinTolerance:axisAligned,maxTrianglePlaneSpan,axisToleranceMetres,sourceAccuracyVerified:false}});
    }
    const combined=Union.union({regions:rows.map(p=>p.silhouette.loops)});
    // Separate silhouettes remain useful even if their combined outline is
    // unresolved. Never substitute a bounding rectangle for the failed union.
    return {...base,status:'profile',origin:origin.slice(),along:u,normal:n,parts:rows,combined};
  }
  // Only accept a boundary already proved by the union, with every edge on
  // the four outside sides. An area ratio or bounding box alone is insufficient.
  function rectangle(loop){
    if(!Array.isArray(loop)||loop.length<4||loop.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
    const lo=[0,1].map(k=>Math.min(...loop.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...loop.map(p=>p[k])));
    if(lo.some((v,k)=>v>=hi[k]))return null;
    if(loop.some((p,i)=>{const q=loop[(i+1)%loop.length];return !((p[0]===q[0]&&(p[0]===lo[0]||p[0]===hi[0]))||(p[1]===q[1]&&(p[1]===lo[1]||p[1]===hi[1])));}))return null;
    if(![[lo[0],lo[1]],[lo[0],hi[1]],[hi[0],lo[1]],[hi[0],hi[1]]].every(c=>loop.some(p=>p[0]===c[0]&&p[1]===c[1])))return null;
    return {lo,hi,width:hi[0]-lo[0],height:hi[1]-lo[1]};
  }
  function framedRectangle(parts,Union){
    const base={openingDimensionsVerified:false,materialsVerified:false,ownershipVerified:false,normativeVerified:false};
    const fail=reason=>({...base,status:'unresolved',reason});
    if(!Union?.union||!Array.isArray(parts)||parts.length<2||parts.some(p=>p.silhouette?.status!=='closed-union'||!p.silhouette.contours?.length||!Array.isArray(p.depthRange)||p.depthRange.length!==2||!p.depthRange.every(Number.isFinite)||p.depthRange[0]>p.depthRange[1]))return fail('incomplete-part-profiles');
    if(parts.some(p=>p.axisAlignment?.withinTolerance!==true))return fail('projection-axis-not-aligned-with-parts');
    const rings=parts.filter(p=>p.silhouette.contours.filter(c=>c.hole).length===1&&p.silhouette.contours.filter(c=>!c.hole).length===1);
    if(rings.length!==1)return fail(rings.length?'ambiguous-frame-rings':'no-closed-frame-ring');
    const ring=rings[0],outer=rectangle(ring.silhouette.contours.find(c=>!c.hole).points),inner=rectangle(ring.silhouette.contours.find(c=>c.hole).points);
    if(!outer||!inner)return fail('nonrectangular-frame');
    const contains=(a,b)=>a.lo.every((v,k)=>v<=b.lo[k]&&a.hi[k]>=b.hi[k]);
    const fillers=parts.filter(p=>p!==ring&&p.silhouette.contours.length===1&&!p.silhouette.contours[0].hole).map(p=>({p,rect:rectangle(p.silhouette.contours[0].points)})).filter(({p,rect})=>rect&&contains(outer,rect)&&contains(rect,inner)&&p.depthRange[0]>=ring.depthRange[0]&&p.depthRange[1]<=ring.depthRange[1]);
    if(fillers.length!==1)return fail(fillers.length?'ambiguous-infill':'no-contained-infill-covering-frame-hole');
    if(parts.length!==2)return fail('additional-parts-require-review');
    const combined=Union.union({regions:parts.map(p=>p.silhouette.loops)});
    if(combined.status!=='closed-union'||combined.contours.length!==1||combined.contours[0].hole||!rectangle(combined.loops[0]))return fail('combined-profile-not-filled-rectangle');
    return {...base,status:'framed-rectangle-candidate',framePart:ring.id,infillPart:fillers[0].p.id,outer,inner,infill:fillers[0].rect,depthRange:ring.depthRange.slice(),reference:'closed-rectangular-ring-with-depth-contained-infill'};
  }
  function openBottomFrame(parts){
    const base={openingDimensionsVerified:false,materialsVerified:false,infillGeometryPresent:false,normativeVerified:false};
    if(!Array.isArray(parts))return {...base,status:'unresolved',reason:'invalid-parts'};
    const candidates=[];
    for(const part of parts||[]){
      if(part.axisAlignment?.withinTolerance!==true||part.silhouette?.status!=='closed-union'||part.silhouette.contours.length!==1||part.silhouette.contours[0].hole)continue;
      const loop=part.silhouette.loops[0].map(p=>p.slice());
      // Remove only exactly collinear axis-aligned intermediate points. No
      // tolerance join: tiny notches/gaps remain and can prevent recognition.
      let changed=true;while(changed&&loop.length>3){changed=false;for(let i=0;i<loop.length;i++){const a=loop[(i+loop.length-1)%loop.length],b=loop[i],c=loop[(i+1)%loop.length];if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1])){loop.splice(i,1);changed=true;break;}}}
      if(loop.length!==8)continue;
      const lo=[0,1].map(k=>Math.min(...loop.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...loop.map(p=>p[k])));
      const inner=loop.filter(p=>p[0]>lo[0]&&p[0]<hi[0]&&p[1]>lo[1]&&p[1]<hi[1]).sort((a,b)=>a[0]-b[0]);
      if(inner.length!==2||inner[0][1]!==inner[1][1]||inner[0][0]===inner[1][0])continue;
      const expected=[[lo[0],lo[1]],[inner[0][0],lo[1]],inner[0],inner[1],[inner[1][0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]];
      const matches=seq=>loop.some((_,start)=>seq.every((p,k)=>p[0]===loop[(start+k)%8][0]&&p[1]===loop[(start+k)%8][1]));
      if(!matches(expected)&&!matches(expected.slice().reverse()))continue;
      candidates.push({framePart:part.id,outer:{lo,hi,width:hi[0]-lo[0],height:hi[1]-lo[1]},inner:{lo:[inner[0][0],lo[1]],hi:inner[1],width:inner[1][0]-inner[0][0],height:inner[1][1]-lo[1]},additionalParts:parts.filter(p=>p!==part).map(p=>p.id)});
    }
    return candidates.length===1?{...base,status:'open-bottom-frame-candidate',...candidates[0],reference:'three-sided-frame-profile; no-infill-created'}:{...base,status:'unresolved',reason:candidates.length?'ambiguous-open-bottom-frames':'no-open-bottom-frame'};
  }
  return {inspect,rectangle,framedRectangle,openBottomFrame};
})();
if(typeof module!=='undefined')module.exports=KeoCurtainElevationProfile;
