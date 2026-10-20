/* Certify constant horizontal sections BETWEEN mesh vertex heights.
   Every nonhorizontal triangle must belong to an exact two-triangle vertical
   rectangle. No welding tolerance, sampled-height inference or missing face
   reconstruction. Unsupported meshes remain explicit uncertainty. This proves
   a property of supplied triangles, not a watertight solid or IFC accuracy. */
const KeoVerticalSectionBands=(()=>{
  const key=p=>JSON.stringify(p.map(x=>x===0?0:x));
  const compare=(a,b)=>a[0]-b[0]||a[1]-b[1];
  function certify(triangles,{maxTriangles=500000}={}){
    const base={sourceAccuracyVerified:false,solidVerified:false,normativeVerified:false};
    const fail=reason=>({...base,status:'unsupported',reason});
    if(!Number.isSafeInteger(maxTriangles)||maxTriangles<1)return fail('invalid-resource-limit');
    if(!Array.isArray(triangles)||!triangles.length||triangles.length>maxTriangles)return fail('missing-or-excessive-triangles');
    const groups=new Map(),levels=new Set();let horizontalTriangles=0;
    for(const t of triangles){
      if(!Array.isArray(t)||t.length!==3||t.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return fail('invalid-triangle');
      t.forEach(p=>levels.add(p[2]));
      if(t.every(p=>p[2]===t[0][2])){horizontalTriangles++;continue;}
      const xy=[...new Map(t.map(p=>[key(p.slice(0,2)),p.slice(0,2)])).values()].sort(compare),zs=[...new Set(t.map(p=>p[2]))].sort((a,b)=>a-b);
      if(xy.length!==2||zs.length!==2)return fail('nonrectangular-vertical-triangulation');
      const corners=t.map(p=>(key(p.slice(0,2))===key(xy[0])?0:1)+(p[2]===zs[0]?0:2));
      if(new Set(corners).size!==3)return fail('degenerate-side-triangle');
      const gkey=JSON.stringify([xy,zs]),g=groups.get(gkey)||{segment:xy,z0:zs[0],z1:zs[1],missing:[]};
      g.missing.push([0,1,2,3].find(c=>!corners.includes(c)));groups.set(gkey,g);
      if(g.missing.length>2)return fail('overlapping-rectangle-triangles');
    }
    const rectangles=[];
    for(const g of groups.values()){
      // Missing corners must be opposite; the common edge is then a diagonal.
      if(g.missing.length!==2||(g.missing[0]^g.missing[1])!==3)return fail('unpaired-vertical-rectangle');
      rectangles.push({segment:g.segment,z0:g.z0,z1:g.z1});
    }
    if(!rectangles.length)return fail('no-vertical-rectangles');
    return {...base,status:'constant-section-bands',levels:[...levels].sort((a,b)=>a-b),rectangles,horizontalTriangles,triangleCount:triangles.length,eventPlanesVerified:false};
  }
  function section(proof,z0,z1,nativeSpaces){
    const fail=reason=>({status:'unavailable',reason,loops:[]});
    if(proof?.status!=='constant-section-bands'||!Number.isFinite(z0)||!Number.isFinite(z1)||z0>=z1||typeof nativeSpaces?.section!=='function')return fail('invalid-band-input');
    if(proof.levels.some(z=>z>z0&&z<z1))return fail('band-crosses-mesh-event');
    const active=proof.rectangles.filter(r=>r.z0<=z0&&r.z1>=z1);
    if(!active.length)return {status:'empty-band',loops:[]};
    // Encode known 2D segments for the existing closed-contour validator.
    // These auxiliary triangles are NOT source geometry or model infill.
    // At z=0 their intersections are exactly the two original XY endpoints.
    const s=nativeSpaces.section({triangles:active.map(r=>[[...r.segment[0],-1],[...r.segment[0],1],[...r.segment[1],0]]),unitScale:1,z:0});
    return {...s,cutMeters:undefined,band:[z0,z1],bandInteriorVerified:s.status==='closed-section',eventPlanesVerified:false,triangleCount:undefined,verticalRectangles:active.length};
  }
  return {certify,section};
})();
if(typeof module!=='undefined')module.exports=KeoVerticalSectionBands;
