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
  return {inspect};
})();
if(typeof module!=='undefined')module.exports=BimNativeShaftSections;
