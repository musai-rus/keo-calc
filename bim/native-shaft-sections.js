/* Diagnostic void loops in explicitly supplied assembly sections.
   A hole in an assembly section is not a host opening or a continuous shaft.
   No opacity, room ownership, source accuracy or KEO is inferred. */
const BimNativeShaftSections=(()=>{
  const area=loop=>{const o=loop[0];let s=0;for(let i=1;i+1<loop.length;i++)s+=(loop[i][0]-o[0])*(loop[i+1][1]-o[1])-(loop[i][1]-o[1])*(loop[i+1][0]-o[0]);return Math.abs(s)/2;};
  function inspect({triangles,unitScale,levels,maxLevels=64,maxTriangles=250000}={},Spaces){
    const base={reference:'assembly-horizontal-section-voids',hostOpeningVerified:false,continuousShaftVerified:false,ownershipVerified:false,normativeVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason,sections:[]});
    if(!Spaces||typeof Spaces.section!=='function'||typeof Spaces.locate!=='function')return fail('missing-section-dependency');
    if(!Array.isArray(triangles)||!triangles.length||!Number.isFinite(unitScale)||unitScale<=0||!Array.isArray(levels)||!levels.length||levels.some(z=>!Number.isFinite(z)))return fail('invalid-shaft-section-input');
    if(!Number.isSafeInteger(maxLevels)||maxLevels<1||!Number.isSafeInteger(maxTriangles)||maxTriangles<1)return fail('invalid-shaft-section-limit');
    if(levels.length>maxLevels||triangles.length>maxTriangles)return fail('shaft-section-resource-limit');
    const zs=[...new Set(levels)].sort((a,b)=>a-b),sections=[];
    for(const z of zs){
      const result=Spaces.section({triangles,unitScale,z});
      if(result.status!=='closed-section'){sections.push({z,status:'unavailable',reason:result.reason,voids:[]});continue;}
      const entries=result.loops.map((loop,i)=>({loop,i,containers:result.loops.map((other,j)=>j!==i&&Spaces.locate([other],loop[0])==='inside'?j:-1).filter(j=>j>=0)}));
      const voids=entries.filter(e=>e.containers.length%2===1).map(h=>{
        const islands=entries.filter(e=>e.containers.length===h.containers.length+1&&e.containers.includes(h.i));
        return {loops:[h.loop,...islands.map(e=>e.loop)],area:area(h.loop)-islands.reduce((s,e)=>s+area(e.loop),0),depth:h.containers.length};
      });
      sections.push({z,status:voids.length?'void-contours-found':'no-enclosed-void-in-section',solidSectionArea:result.area,loops:result.loops,voids});
    }
    return {...base,status:'diagnostic',sections};
  }
  function inspectParts({parts,unitScale,levels,maxLevels=64,maxTriangles=250000}={},Spaces,Union){
    const base={reference:'union-of-independent-assembly-part-sections',hostOpeningVerified:false,continuousShaftVerified:false,ownershipVerified:false,normativeVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason,sections:[]});
    if(!Spaces||typeof Spaces.section!=='function'||typeof Spaces.locate!=='function'||!Union||typeof Union.union!=='function')return fail('missing-section-union-dependency');
    if(!Array.isArray(parts)||!parts.length||parts.some(p=>!p||!Array.isArray(p.triangles)||!p.triangles.length)||new Set(parts.map(p=>p.id)).size!==parts.length||parts.some(p=>typeof p.id!=='string'&&!Number.isSafeInteger(p.id))||!Number.isFinite(unitScale)||unitScale<=0||!Array.isArray(levels)||!levels.length||levels.some(z=>!Number.isFinite(z)))return fail('invalid-shaft-parts-input');
    if(!Number.isSafeInteger(maxLevels)||maxLevels<1||!Number.isSafeInteger(maxTriangles)||maxTriangles<1)return fail('invalid-shaft-section-limit');
    if(levels.length>maxLevels||parts.reduce((n,p)=>n+p.triangles.length,0)>maxTriangles)return fail('shaft-section-resource-limit');
    const ranges=[];
    for(const p of parts){
      let lo=Infinity,hi=-Infinity;
      for(const t of p.triangles){if(!Array.isArray(t)||t.length!==3||t.some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||!Number.isFinite(x*unitScale))))return fail('invalid-part-triangle');for(const v of t){lo=Math.min(lo,v[2]*unitScale);hi=Math.max(hi,v[2]*unitScale);}}
      ranges.push([lo,hi]);
    }
    const sections=[];
    for(const z of [...new Set(levels)].sort((a,b)=>a-b)){
      const inputs=[],partSections=[];
      for(let i=0;i<parts.length;i++){
        const p=parts[i],[lo,hi]=ranges[i];
        if(z<lo||z>hi){partSections.push({id:p.id,status:'outside-part-height'});continue;}
        const s=Spaces.section({triangles:p.triangles,unitScale,z});
        partSections.push({id:p.id,status:s.status,reason:s.reason,area:s.area,loopCount:s.loops.length});
        if(s.status==='closed-section')inputs.push(s.loops);
      }
      if(partSections.some(p=>p.status==='unavailable')){sections.push({z,status:'unavailable',reason:'unavailable-part-section',partSections,voids:[]});continue;}
      if(!inputs.length){sections.push({z,status:'unavailable',reason:'no-part-at-section-height',partSections,voids:[]});continue;}
      const result=Union.union({regions:inputs});
      if(result.status!=='closed-union'){sections.push({z,status:'unavailable',reason:result.reason,partSections,voids:[]});continue;}
      // Orientations of the exact union identify holes. Islands are retained.
      // Rounded output must remain separable under the consumer's predicates.
      const entries=result.contours.map((c,i)=>({...c,i,containers:result.loops.map((other,j)=>j!==i?Spaces.locate([other],c.points[0]):'outside')}));
      if(entries.some(e=>e.containers.includes('boundary')||e.hole!==(e.containers.filter(v=>v==='inside').length%2===1))){sections.push({z,status:'unavailable',reason:'union-output-containment-ambiguous',partSections,voids:[]});continue;}
      const voids=entries.filter(e=>e.hole).map(h=>{const depth=h.containers.filter(v=>v==='inside').length,islands=entries.filter(e=>!e.hole&&e.containers[h.i]==='inside'&&e.containers.filter(v=>v==='inside').length===depth+1);return {loops:[h.points,...islands.map(e=>e.points)],area:h.area-islands.reduce((s,e)=>s+e.area,0),depth};});
      sections.push({z,status:voids.length?'void-contours-found':'no-enclosed-void-in-section',solidSectionArea:result.area,loops:result.loops,voids,partSections,union:{reference:result.reference,coordinateArithmetic:result.coordinateArithmetic,operations:result.operations}});
    }
    return {...base,status:'diagnostic',partRanges:parts.map((p,i)=>({id:p.id,zRange:ranges[i]})),sections};
  }
  return {inspect,inspectParts};
})();
if(typeof module!=='undefined')module.exports=BimNativeShaftSections;
