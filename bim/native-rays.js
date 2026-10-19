/* Research-only mesh rays. No AI, names, area matching, raster cells or Viewer
   visibility. A probe finds candidate space SURFACES, not certified room entry,
   aperture ownership, glazing transmittance or a normative KEO result. */
const BimNativeRays = (() => {
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const vec=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  const EPS=128*Number.EPSILON;
  const evidence={reference:'supplied-decoded-mesh',sourceAccuracyVerified:false,normativeVerified:false,ownershipVerified:false};
  function bounds(points) {
    return {lo:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),hi:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))};
  }
  function boxInterval(box,o,d,limit,pad=0) {
    let near=0,far=limit;
    for(let k=0;k<3;k++) {
      if(d[k]===0) {if(o[k]<box.lo[k]-pad||o[k]>box.hi[k]+pad)return null;continue;}
      let a=(box.lo[k]-pad-o[k])/d[k],b=(box.hi[k]+pad-o[k])/d[k];
      if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
      if(near>far)return null;
    }
    return [near,far];
  }
  function tree(items) {
    if(!items.length)return null;
    const box={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity]};
    for(const t of items)for(let k=0;k<3;k++){box.lo[k]=Math.min(box.lo[k],t.box.lo[k]);box.hi[k]=Math.max(box.hi[k],t.box.hi[k]);}
    if(items.length<=12)return {...box,items};
    const span=sub(box.hi,box.lo),axis=span.indexOf(Math.max(...span));
    items.sort((a,b)=>(a.box.lo[axis]+a.box.hi[axis])-(b.box.lo[axis]+b.box.hi[axis]));
    const mid=items.length>>1;
    return {...box,left:tree(items.slice(0,mid)),right:tree(items.slice(mid))};
  }
  function build({meshes,unitScale,maxTriangles=2000000}) {
    if(!Array.isArray(meshes)||!Number.isFinite(unitScale)||unitScale<=0||!Number.isSafeInteger(maxTriangles)||maxTriangles<1)throw new Error('invalid-mesh-input');
    const ids=new Set(),items=[];let degenerate=0,coordinateScale=1;
    for(const mesh of meshes) {
      if(typeof mesh.id!=='string'||!mesh.id||ids.has(mesh.id)||!Array.isArray(mesh.triangles))throw new Error('invalid-or-duplicate-mesh-id');
      ids.add(mesh.id);
      for(const raw of mesh.triangles) {
        if(items.length+degenerate>=maxTriangles)throw new Error('triangle-resource-limit');
        if(!Array.isArray(raw)||raw.length!==3||!raw.every(vec))throw new Error('invalid-triangle');
        const p=raw.map(v=>v.map(x=>x*unitScale));if(!p.every(vec))throw new Error('invalid-scaled-triangle');
        const e1=sub(p[1],p[0]),e2=sub(p[2],p[0]),normal=cross(e1,e2),area2=Math.hypot(...normal);
        if(!Number.isFinite(area2))throw new Error('geometry-overflow');
        if(area2===0){degenerate++;continue;}
        for(const v of p)for(const x of v)coordinateScale=Math.max(coordinateScale,Math.abs(x));
        items.push({id:mesh.id,p:p[0],e1,e2,normal,area2,box:bounds(p)});
      }
    }
    const root=tree(items),stats={triangles:items.length,degenerate,meshes:meshes.length};
    function trace(origin,direction,maxDistance=Infinity) {
      if(!vec(origin)||!vec(direction)||!(maxDistance>=0)||(!Number.isFinite(maxDistance)&&maxDistance!==Infinity))return {status:'unavailable',reason:'invalid-ray'};
      const norm=Math.hypot(...direction);if(!Number.isFinite(norm)||!norm)return {status:'unavailable',reason:'invalid-direction'};
      const d=direction.map(x=>x/norm),error=EPS*Math.max(coordinateScale,...origin.map(Math.abs));
      let best=Infinity,hits=[],uncertain=Infinity,visited=0;
      function visit(node) {
        const range=node&&boxInterval(node,origin,d,Math.min(maxDistance,best+error),error);
        if(!range)return;
        if(!node.items){visit(node.left);visit(node.right);return;}
        for(const t of node.items) {
          const interval=boxInterval(t.box,origin,d,Math.min(maxDistance,best+error),error);if(!interval)continue;
          visited++;
          const h=cross(d,t.e2),det=dot(t.e1,h),s=sub(origin,t.p);
          // Near-parallel and near-edge hits are unresolved, never nudged into
          // the room. This envelope is arithmetic only, not model precision.
          if(Math.abs(det)<=EPS*Math.hypot(...t.e1)*Math.hypot(...t.e2)) {
            const offset=dot(s,t.normal),slope=dot(d,t.normal),a=offset+slope*interval[0],b=offset+slope*interval[1],planeError=error*t.area2;
            if(!Number.isFinite(a)||!Number.isFinite(b)||!(a>planeError&&b>planeError||a < -planeError&&b < -planeError))uncertain=Math.min(uncertain,interval[0]);
            continue;
          }
          const q=cross(s,t.e1),u=dot(s,h)/det,v=dot(d,q)/det,dist=dot(t.e2,q)/det;
          const baryError=EPS*(1+Math.hypot(...s))*Math.max(1,Math.hypot(...t.e1),Math.hypot(...t.e2))/Math.abs(det);
          if(![u,v,dist,baryError].every(Number.isFinite)){uncertain=Math.min(uncertain,interval[0]);continue;}
          if(u < -baryError||v < -baryError||u+v>1+baryError||dist < -error||dist>maxDistance+error)continue;
          const distance=Math.max(0,dist),edge=Math.min(u,v,1-u-v)<=baryError;
          if(distance<best-error){best=distance;hits=[];}
          if(distance<=best+error){best=Math.min(best,distance);hits.push({id:t.id,distance,edge});}
        }
      }
      visit(root);
      hits=hits.filter(h=>h.distance<=best+error);
      const hitIds=[...new Set(hits.map(h=>h.id))].sort();
      if(Number.isFinite(uncertain)&&uncertain<=Math.min(best,maxDistance)+error)return {status:'ambiguous',reason:'coplanar-or-unstable-ray',ids:hitIds,distance:Number.isFinite(best)?best:null,error,visited};
      if(!hits.length)return {status:'miss',ids:[],error,visited};
      return {status:hitIds.length>1||hits.some(h=>h.edge)?'ambiguous':'hit',reason:hitIds.length>1?'coincident-surfaces':hits.some(h=>h.edge)?'triangle-edge':null,ids:hitIds,distance:best,error,visited};
    }
    return {trace,stats,...evidence};
  }
  function probe({spaces,blockers,origin,normal}) {
    if(!spaces||typeof spaces.trace!=='function'||!blockers||typeof blockers.trace!=='function'||!vec(normal))return {status:'unavailable',reason:'missing-index-or-normal',...evidence};
    const directions=[normal,normal.map(x=>-x)].map(direction=>{
      const space=spaces.trace(origin,direction);
      if(space.status!=='hit')return {status:space.status==='miss'?'no-space-surface':'unresolved',space};
      const blocker=blockers.trace(origin,direction,space.distance+space.error);
      if(blocker.status==='miss')return {status:'candidate-surface',space,blocker};
      // An ambiguous edge still blocks if it is strictly before the room;
      // coplanar rays have no confirmed intersection and remain unresolved.
      if(blocker.distance!==null&&Number.isFinite(blocker.distance)&&blocker.reason!=='coplanar-or-unstable-ray'&&blocker.distance+blocker.error<space.distance-space.error)return {status:'blocked',space,blocker};
      return {status:'unresolved',space,blocker};
    });
    return {status:'diagnostic-only',directions,...evidence};
  }
  return {build,probe,boxInterval};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BimNativeRays;
