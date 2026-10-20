/* Geometry inventory for the calculator-input study, not a calculation.
   Nearest section boundaries are candidates, not proof of an opening. */
const fs=require('node:fs');
const M=require('./room-section-math.cjs');
const [input,output]=process.argv.slice(2);if(!input)throw Error('Usage: node inspect-room-cell.cjs private-capture.json [private-result.json]');
const a=JSON.parse(fs.readFileSync(input,'utf8'));
if(a.busy||a.errors.length||!a.rooms.length)throw Error('incomplete-room-capture');
const dot=(p,q)=>p[0]*q[0]+p[1]*q[1],sub=(p,q)=>[p[0]-q[0],p[1]-q[1]],cross=(p,q)=>p[0]*q[1]-p[1]*q[0];
function lineHits(loops,origin,direction){
  const hits=[];
  for(const l of loops)for(let j=0;j<l.length;j++){
    const p=l[j],q=l[(j+1)%l.length],s=sub(q,p),v=sub(p,origin),den=cross(direction,s);
    if(!den)continue;const u=cross(v,direction)/den,t=cross(v,s)/den;
    if(u>=0&&u<1)hits.push(t);
  }
  return hits.sort((x,y)=>x-y);
}
const faces=a.candidates.map(r=>{
  const p=r.result.patches.filter(p=>p.status==='planar-contour'&&p.inclinationDeg>89).sort((x,y)=>y.area-x.area)[0];if(!p)return null;
  const normal=p.normal.slice(0,2),length=Math.hypot(...normal);normal[0]/=length;normal[1]/=length;
  const along=[-normal[1],normal[0]],points=p.worldLoops.flat(),ts=points.map(q=>dot(q,along)),zs=points.map(q=>q[2]),lo=Math.min(...ts),hi=Math.max(...ts),d=dot(p.origin,normal),mid=(lo+hi)/2;
  const centre=[along[0]*mid+normal[0]*d,along[1]*mid+normal[1]*d];
  const adjacent=[];for(const room of a.neighbourSections.filter(s=>s.level===a.rooms[0].level&&s.status==='closed-section')){const hits=lineHits(room.loops,centre,normal);if(hits.length)adjacent.push({id:room.id,number:room.number,name:room.name,negative:hits.filter(x=>x<=0).at(-1)??null,positive:hits.find(x=>x>=0)??null});}
  const closest=direction=>adjacent.filter(q=>q[direction]!==null).sort((x,y)=>Math.abs(x[direction])-Math.abs(y[direction]))[0];
  const assembly=r.ancestors.find(e=>e.IfcClass==='IfcCurtainWall');
  return {fragment:r.fragment,dbId:r.dbId,guid:r.guid,assemblyId:assembly?.id,assemblyName:assembly?.name,normal,along,origin:p.origin,centre,lo,hi,width:hi-lo,z0:Math.min(...zs),z1:Math.max(...zs),area:p.area,negative:closest('negative'),positive:closest('positive'),selected:adjacent.filter(q=>a.rooms.some(r=>r.id===q.id))};
}).filter(Boolean);
const result={source:a.source,geometryVerified:false,ownershipVerified:false,normativeVerified:false,rooms:a.rooms.map(r=>{
  const centre=M.centroid(r.section.loops);
  const sections=faces.filter(f=>[f.negative?.id,f.positive?.id].includes(r.id)).map(f=>{
    const normal=M.lineIntervals(r.section.loops,centre.point,f.normal),along=M.lineIntervals(r.section.loops,centre.point,f.along);
    const containing=section=>section.status==='intervals'?section.inside.find(([lo,hi])=>lo<0&&hi>0):null;
    const n=containing(normal),b=containing(along);
    return {fragment:f.fragment,normal,along,depthAtCentroid:n?n[1]-n[0]:null,widthAtCentroid:b?b[1]-b[0]:null,calculatorDimensionsVerified:false};
  });
  return {id:r.id,number:r.number,name:r.name,bounds:r.bounds,sectionArea:r.section.area,loops:r.section.loops,centroid:centre.point,centroidLocation:centre.location,centroidIsNormativePoint:false,sections};
}),faces};
if(output)fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({rooms:result.rooms.map(({loops,...r})=>r),faces:faces.map(({origin,selected,assemblyName,...r})=>({...r,negative:r.negative&&[r.negative.number,r.negative.negative],positive:r.positive&&[r.positive.number,r.positive.positive]}))}));
