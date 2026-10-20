/* Independent diagnostic cross-check: 3D triangle BVH versus certified 2D
   bands. Sampling is used ONLY for testing, never to assign an aperture. */
const fs=require('node:fs'),Rays=require('../../bim/native-rays');
const [volumeFile,resultFile,output]=process.argv.slice(2);if(!output)throw Error('Usage: node verify-surface-bands.cjs private-volume.json private-results.json private-checks.json');
const a=JSON.parse(fs.readFileSync(volumeFile,'utf8')),out=JSON.parse(fs.readFileSync(resultFile,'utf8'));
if(a.busy||a.errors?.length||JSON.stringify(a.source)!==JSON.stringify(out.source)||a.completedAt!==out.capturedAt)throw Error('mismatched-or-incomplete-source');
const checks={matched:0,uncertaintyEnvelope:0,originIntersection:0,ambiguousRay:0,unrepresentableHeight:0,mismatches:[],panels:[]};
for(const r of out.results){
  if(r.status!=='surface-bands')continue;
  const meshes=[...a.rooms.map(m=>({id:'room:'+m.id,triangles:m.triangles})),...a.structures.filter(m=>!m.ancestors?.some(e=>e.id===r.assemblyId)).map(m=>({id:'fragment:'+m.fragment,triangles:m.triangles}))];
  const index=Rays.build({meshes,unitScale:1});let panelMatched=0;
  for(const b of r.bands){
    const z=b.zRange[0]+(b.zRange[1]-b.zRange[0])*.413;
    if(!(z>b.zRange[0]&&z<b.zRange[1])){checks.unrepresentableHeight++;continue;}
    const ribbon=r.ribbons[b.ribbonIndex];
    for(const side of ribbon.sides)for(const fraction of [.037,.173,.291,.419,.583,.751,.937]){
      const u=ribbon.width*fraction,c=side.cells.find(c=>c.range[0]<u&&c.range[1]>u);
      if(!c)throw Error('missing-interior-cell');
      if(c.status==='panel-intersects-section'){checks.originIntersection++;continue;}
      if(c.first?.kinds.includes('uncertain')){checks.uncertaintyEnvelope++;continue;}
      const origin=[...ribbon.segment[0].map((x,k)=>x+ribbon.along[k]*u),z],direction=[...ribbon.normal.map(x=>x*side.sign),0];
      const limit=Math.min(...direction.slice(0,2).map((d,k)=>d>0?(r.scope.hi[k]-origin[k])/d:d<0?(r.scope.lo[k]-origin[k])/d:Infinity));
      const hit=index.trace(origin,direction,limit);
      if(hit.status==='ambiguous'){checks.ambiguousRay++;continue;}
      const matches=c.status==='scope-exit'?hit.status==='miss':hit.status==='hit'&&JSON.stringify(hit.ids)===JSON.stringify(c.first.ids)&&hit.distance>=c.first.distanceRange[0]-hit.error*4&&hit.distance<=c.first.distanceRange[1]+hit.error*4;
      if(matches){checks.matched++;panelMatched++;}else checks.mismatches.push({fragment:r.fragment,z,u,side:side.sign,expected:c.first,status:c.status,actual:hit});
    }
  }
  checks.panels.push({fragment:r.fragment,matched:panelMatched});
}
fs.writeFileSync(output,JSON.stringify(checks),{flag:'wx'});console.log(JSON.stringify(checks));if(checks.mismatches.length||!checks.matched)process.exitCode=1;
