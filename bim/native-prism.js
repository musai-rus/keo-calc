/* Continuous vertical-prism / supplied mesh intersection, in metres.
   This diagnostic is not optical ray tracing, a shaft certificate, an aperture
   ownership decision, a blocked-area fraction, or a normative daylight result. */
const BimNativePrism=(()=>{
  const EPS=256*Number.EPSILON;
  const evidence={reference:'continuous-vertical-prism-vs-supplied-triangles',geometryVerified:false,ownershipVerified:false,normativeVerified:false};
  const vec=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  const bounds=ps=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of ps)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}return {lo,hi};};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  function build({meshes,unitScale,maxTriangles=2000000}={},ProjectedArea){
    if(!Array.isArray(meshes)||!meshes.length||!Number.isFinite(unitScale)||unitScale<=0||!Number.isSafeInteger(maxTriangles)||maxTriangles<1)throw Error('invalid-prism-mesh-input');
    const ids=new Set(),items=[];let count=0,degenerate=0,coordinateScale=1;
    for(const mesh of meshes){
      if(typeof mesh.id!=='string'||!mesh.id||ids.has(mesh.id)||!Array.isArray(mesh.triangles)||!mesh.triangles.length)throw Error('missing-or-duplicate-prism-mesh');ids.add(mesh.id);
      const triangles=[];
      for(const raw of mesh.triangles){
        if(++count>maxTriangles)throw Error('prism-triangle-resource-limit');
        if(!Array.isArray(raw)||raw.length!==3||!raw.every(vec))throw Error('invalid-prism-triangle');
        const p=raw.map(q=>q.map(v=>v*unitScale));if(!p.every(vec))throw Error('nonfinite-prism-coordinate');
        const a=Math.hypot(...cross(sub(p[1],p[0]),sub(p[2],p[0])));
        if(!Number.isFinite(a))throw Error('overflow-prism-triangle');
        if(a===0)degenerate++;
        for(const q of p)for(const v of q)coordinateScale=Math.max(coordinateScale,Math.abs(v));
        triangles.push({p,box:bounds(p),degenerate:a===0});
      }
      const box={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity]};
      for(const t of triangles)for(let k=0;k<3;k++){box.lo[k]=Math.min(box.lo[k],t.box.lo[k]);box.hi[k]=Math.max(box.hi[k],t.box.hi[k]);}
      items.push({id:mesh.id,box,triangles});
    }
    items.sort((a,b)=>a.id.localeCompare(b.id));
    function test({polygon,zMin,zMax,maxClipOperations=20000000}={}){
      const unavailable=reason=>({...evidence,status:'unavailable',reason});
      if(!Array.isArray(polygon)||polygon.length<3||polygon.length>2048||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||!Number.isFinite(zMin)||!Number.isFinite(zMax)||zMax<=zMin)return unavailable('invalid-prism');
      if(!Number.isSafeInteger(maxClipOperations)||maxClipOperations<1)return unavailable('invalid-prism-resource-limit');
      const origin=[...polygon[0],zMin],vertices=polygon.map(p=>[p[0]-origin[0],p[1]-origin[1]]),height=zMax-zMin;
      const error=EPS*Math.max(coordinateScale,Math.abs(zMin),Math.abs(zMax),...polygon.flat().map(Math.abs),1);
      for(let i=0;i<vertices.length;i++)for(let j=0;j<i;j++)if(Math.hypot(vertices[i][0]-vertices[j][0],vertices[i][1]-vertices[j][1])<=error)return unavailable('duplicate-or-unstable-footprint-vertex');
      if(height<=4*error)return unavailable('unstable-prism-height');
      let twiceArea=0;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];twiceArea+=a[0]*b[1]-b[0]*a[1];}
      if(!Number.isFinite(twiceArea)||Math.abs(twiceArea)<=error*error)return unavailable('degenerate-prism-footprint');
      const sign=Math.sign(twiceArea),planes=[];
      for(let i=0;i<vertices.length;i++){
        const a=vertices[i],b=vertices[(i+1)%vertices.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
        if(!Number.isFinite(length)||length<=error)return unavailable('duplicate-or-unstable-footprint-edge');
        const n=[-dy*sign/length,dx*sign/length,0],c=-(n[0]*a[0]+n[1]*a[1]);
        // All vertices must be inside every edge half-plane. No convex hull or
        // rectangle is substituted for a non-convex aperture or an aperture hole.
        if(vertices.some(p=>n[0]*p[0]+n[1]*p[1]+c < -error))return unavailable('nonconvex-or-crossing-footprint');
        planes.push({n,c});
      }
      planes.push({n:[0,0,1],c:0},{n:[0,0,-1],c:height});
      const box=bounds(polygon.flatMap(p=>[[...p,zMin],[...p,zMax]]));
      const overlap=b=>b.lo.every((v,k)=>v<=box.hi[k]+error&&b.hi[k]>=box.lo[k]-error);
      const hits=[],projectedCutters=[];let checked=0,operations=0;
      for(const mesh of items){
        if(!overlap(mesh.box))continue;
        let intersected=0,contacts=0,uncertain=0,hitMin=Infinity,hitMax=-Infinity;
        for(const t of mesh.triangles){
          if(!overlap(t.box))continue;checked++;
          let ps=t.p.map(p=>sub(p,origin));
          for(const {n,c} of planes){
            if(!ps.length)break;
            const next=[];
            for(let i=0;i<ps.length;i++){
              if(++operations>maxClipOperations)return unavailable('prism-clipping-resource-limit');
              const a=ps[i],b=ps[(i+1)%ps.length],da=n.reduce((s,v,k)=>s+v*a[k],c),db=n.reduce((s,v,k)=>s+v*b[k],c);
              // Expand by arithmetic error only, retaining uncertain contacts.
              const ia=da>=-error,ib=db>=-error;if(ia)next.push(a);
              if(ia!==ib){const f=(da+error)/(da-db);const p=a.map((v,k)=>v+(b[k]-v)*f);if(!p.every(Number.isFinite))return unavailable('unstable-prism-clipping');next.push(p);}
            }
            ps=next;
          }
          if(!ps.length)continue;
          // A collapsed source triangle is retained as uncertainty only where
          // it meets this prism; it is never silently discarded as valid mesh.
          if(t.degenerate){uncertain++;continue;}
          const center=[0,1,2].map(k=>ps.reduce((s,p)=>s+p[k],0)/ps.length);
          // Positive margin distinguishes interior intersection from contact
          // at a side/cap. A vertical wall can intersect with zero projected area.
          const interior=planes.every(({n,c})=>n.reduce((s,v,k)=>s+v*center[k],c)>error);
          if(interior){intersected++;for(const p of ps){hitMin=Math.min(hitMin,p[2]+zMin);hitMax=Math.max(hitMax,p[2]+zMin);}if(ps.length>=3&&ProjectedArea)projectedCutters.push(ps.map(p=>p.slice(0,2)));}else contacts++;
        }
        if(intersected||contacts||uncertain)hits.push({id:mesh.id,interiorTriangles:intersected,contactTriangles:contacts,uncertainTriangles:uncertain,zRange:intersected?[hitMin,hitMax]:null});
      }
      const uncertainTriangles=hits.reduce((s,h)=>s+h.uncertainTriangles,0);
      const coverage=ProjectedArea?(uncertainTriangles?{status:'unavailable',reason:'degenerate-source-triangles'}:ProjectedArea.remainder({footprint:vertices,cutters:projectedCutters})):{status:'not-requested'};
      if(coverage.remainingCells)coverage.remainingCells=coverage.remainingCells.map(l=>l.map(p=>[p[0]+origin[0],p[1]+origin[1]]));
      return {...evidence,status:hits.some(h=>h.interiorTriangles)?'intersected':uncertainTriangles?'unavailable':hits.length?'contact-only':'no-intersection-in-supplied-meshes',reason:uncertainTriangles?'degenerate-source-triangles':null,uncertainTriangles,hits,coverage,checkedTriangles:checked,clipOperations:operations,numericalErrorMetres:error,footprintArea:Math.abs(twiceArea)/2,zMin,zMax};
    }
    return {test,stats:{meshes:items.length,triangles:count,degenerate},...evidence};
  }
  return {build};
})();
if(typeof module!=='undefined')module.exports=BimNativePrism;
