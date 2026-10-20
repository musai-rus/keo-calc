/* Planar connected faces of supplied meshes. These are geometric candidates;
   render transparency, IFC class and a face do not certify a light aperture.
   Explicit planarity tolerance measures approximation of the decoded mesh. */
const BimNativeApertures = (() => {
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>Math.hypot(...a),unit=a=>a.map(v=>v/norm(a));
  const key=p=>JSON.stringify(p.map(x=>x===0?0:x));
  const edgeKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
  function extract({triangles,unitScale,planarityTolerance,maxTriangles=100000}={},NativeSpaces){
    const base={geometryVerified:false,ownershipVerified:false,opticsVerified:false,normativeVerified:false,reference:'decoded-mesh-planar-patches'};
    const fail=reason=>({...base,status:'unavailable',reason,patches:[]});
    if(!Array.isArray(triangles)||!triangles.length)return fail('missing-geometry');
    if(!Number.isFinite(unitScale)||unitScale<=0)return fail('unknown-units');
    if(!Number.isFinite(planarityTolerance)||planarityTolerance<0)return fail('explicit-planarity-tolerance-required');
    if(!Number.isSafeInteger(maxTriangles)||maxTriangles<1||triangles.length>maxTriangles)return fail('geometry-resource-limit');
    if(!NativeSpaces?.section)return fail('missing-contour-validator');
    const ts=[],points=new Map(),edges=new Map(),duplicates=new Set();let degenerate=0;
    for(const raw of triangles){
      if(!Array.isArray(raw)||raw.length!==3||raw.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return fail('invalid-triangle');
      const ps=raw.map(p=>p.map(v=>v*unitScale));if(ps.some(p=>!p.every(Number.isFinite)))return fail('nonfinite-scaled-coordinate');
      const ks=ps.map(key),n=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])),length=norm(n);
      if(length===0){degenerate++;continue;}
      const tk=ks.slice().sort().join('|');if(duplicates.has(tk))return fail('duplicate-triangle');duplicates.add(tk);
      ps.forEach((p,i)=>points.set(ks[i],p));ts.push({ks,ps,normal:n.map(v=>v/length),area:length/2,key:tk});
    }
    if(degenerate)return fail('degenerate-triangle');
    ts.sort((a,b)=>a.key.localeCompare(b.key));
    for(let i=0;i<ts.length;i++)for(let j=0;j<3;j++){const k=edgeKey(ts[i].ks[j],ts[i].ks[(j+1)%3]);if(!edges.has(k))edges.set(k,[]);edges.get(k).push(i);}
    if([...edges.values()].some(a=>a.length>2))return fail('nonmanifold-edge');
    const used=new Set(),patches=[];
    for(let seed=0;seed<ts.length;seed++){
      if(used.has(seed))continue;
      const first=ts[seed],origin=first.ps[0],normal=first.normal.slice();
      const dominant=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));if(normal[dominant]<0)normal.forEach((_,i)=>normal[i]*=-1);
      const axis=[0,0,0];axis[normal.map(Math.abs).indexOf(Math.min(...normal.map(Math.abs)))]=1;
      const u=unit(cross(axis,normal)),v=cross(normal,u),queue=[seed],members=[],candidateSeen=new Set();let deviation=0;
      while(queue.length){const i=queue.pop();if(used.has(i)||candidateSeen.has(i))continue;candidateSeen.add(i);const t=ts[i];
        // Opposite windings are accepted; touching triangles on a different
        // plane stay in a separate face. Tolerance is explicit and reported.
        const d=Math.max(...t.ps.map(p=>Math.abs(dot(sub(p,origin),normal))));
        if(d>planarityTolerance)continue;
        used.add(i);members.push(i);deviation=Math.max(deviation,d);
        for(let j=0;j<3;j++)for(const other of edges.get(edgeKey(t.ks[j],t.ks[(j+1)%3])))if(!used.has(other))queue.push(other);
      }
      // A zero tolerance can reject the seed through arithmetic alone.
      if(!members.length)return fail('unstable-plane');
      const memberSet=new Set(members),rim=[];
      for(const i of members)for(let j=0;j<3;j++){
        const a=ts[i].ks[j],b=ts[i].ks[(j+1)%3],linked=edges.get(edgeKey(a,b));
        if(linked.filter(k=>memberSet.has(k)).length===1)rim.push([a,b]);
      }
      const project=p=>[dot(sub(p,origin),u),dot(sub(p,origin),v)];
      // Validate just the 2D boundary graph with the existing section solver.
      // Artificial +/-1 extrusion is an internal topology check, not model geometry.
      const sides=[];for(const [ka,kb] of rim){const a=project(points.get(ka)),b=project(points.get(kb));sides.push([[...a,-1],[...b,-1],[...b,1]],[[...a,-1],[...b,1],[...a,1]]);}
      const contour=NativeSpaces.section({triangles:sides,unitScale:1,z:0});
      const meshArea=members.reduce((s,i)=>s+ts[i].area,0),area=contour.area??null;
      // Projected triangle area independently detects overlap or lost interior.
      const projectedArea=members.reduce((s,i)=>s+ts[i].area*Math.abs(dot(ts[i].normal,normal)),0);
      const areaError=512*Number.EPSILON*Math.max(1,projectedArea,area||0)*Math.max(1,members.length);
      const reason=contour.status!=='closed-section'?contour.reason:Math.abs(projectedArea-area)>areaError?'overlapping-or-incomplete-face':null;
      const world=p=>origin.map((x,i)=>x+u[i]*p[0]+v[i]*p[1]);
      patches.push({status:reason?'unavailable':'planar-contour',reason,origin,normal,u,v,area,meshArea,projectedArea,maxPlaneDeviation:deviation,planarityTolerance,
        triangleCount:members.length,loops:contour.loops,contours:contour.contours||[],worldLoops:(contour.loops||[]).map(l=>l.map(world)),
        inclinationDeg:Math.acos(Math.min(1,Math.abs(normal[2])))*180/Math.PI});
    }
    return {...base,status:'patches',patches,triangleCount:ts.length,planarityTolerance};
  }
  function planCoverage(apertureLoops,spaceLoops,NativeSpaces){
    const base={ownershipVerified:false,reference:'continuous-XY-projection-only'};
    const valid=ls=>Array.isArray(ls)&&ls.length&&ls.every(l=>Array.isArray(l)&&l.length>=3&&l.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
    if(!valid(apertureLoops)||!valid(spaceLoops)||!NativeSpaces?.locate)return {...base,status:'unavailable'};
    const bounds=ls=>{const p=ls.flat();return [Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];};
    const a=bounds(apertureLoops),b=bounds(spaceLoops);
    if(a[2]<b[0]||b[2]<a[0]||a[3]<b[1]||b[3]<a[1])return {...base,status:'outside'};
    const turn=(a,b,c)=>{const u=(b[0]-a[0])*(c[1]-a[1]),v=(b[1]-a[1])*(c[0]-a[0]),d=u-v;return Math.abs(d)>16*Number.EPSILON*(Math.abs(u)+Math.abs(v))?Math.sign(d):0;};
    const contact=(a,b,c,d)=>{
      if(Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))>Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))||Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))>Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1])))return false;
      const p=turn(a,b,c),q=turn(a,b,d),r=turn(c,d,a),s=turn(c,d,b);return (!p||!q||p!==q)&&(!r||!s||r!==s);
    };
    let checks=0;
    for(const al of apertureLoops)for(const bl of spaceLoops)for(let i=0;i<al.length;i++)for(let j=0;j<bl.length;j++){
      if(++checks>2000000)return {...base,status:'unavailable',reason:'projection-resource-limit'};
      if(contact(al[i],al[(i+1)%al.length],bl[j],bl[(j+1)%bl.length]))return {...base,status:'crosses-or-touches-boundary'};
    }
    const locations=apertureLoops.flat().map(p=>NativeSpaces.locate(spaceLoops,p));
    if(locations.some(x=>x==='unavailable'||x==='boundary'))return {...base,status:'unavailable',reason:'uncertain-projection'};
    // A hole entirely enclosed by the aperture has no edge intersection.
    if(spaceLoops.some(l=>NativeSpaces.locate(apertureLoops,l[0])==='inside'))return {...base,status:'covers-space-boundary-or-hole'};
    return {...base,status:locations.every(x=>x==='inside')?'contained-projection':locations.some(x=>x==='inside')?'partial-projection':'outside'};
  }
  return {extract,planCoverage};
})();
if(typeof module!=='undefined')module.exports=BimNativeApertures;
