const fs=require('node:fs'),A=require('../../bim/native-apertures'),S=require('../../bim/native-spaces');
const [apertures,sections,output]=process.argv.slice(2);
if(!apertures||!sections||!output)throw Error('Usage: node audit-aperture-projections.cjs apertures.json sections.json private-output.json');
const a=JSON.parse(fs.readFileSync(apertures)),s=JSON.parse(fs.readFileSync(sections));
const rooms=s.rows.filter(r=>r.category==='Rooms'),rows=[];
for(const r of a.rows.filter(r=>r.ifcClass==='IfcWindow')){
  const p=r.result.patches.filter(p=>p.status==='planar-contour').sort((a,b)=>b.area-a.area)[0];if(!p||p.inclinationDeg>=45)continue;
  const xy=p.worldLoops.map(l=>l.map(p=>p.slice(0,2))),minZ=Math.min(...p.worldLoops.flat().map(p=>p[2]));
  const matches=[];
  for(const room of rooms.filter(r=>r.status==='closed-section'&&r.minZ<minZ)){
    const q=A.planCoverage(xy,room.loops,S);if(q.status!=='outside')matches.push({guid:room.guid,number:room.number,level:room.level,...q});
  }
  rows.push({guid:r.guid,fragment:r.fragment,matches,ownershipVerified:false});
}
const report={version:1,kind:'continuous aperture footprint diagnostic',ownershipVerified:false,rows,unavailableRooms:rooms.filter(r=>r.status!=='closed-section').map(r=>({guid:r.guid,reason:r.reason})),limits:['XY projection does not prove vertical light path, shaft or opening through roof','All candidate floors retained; nearest/highest room is not automatically accepted']};
fs.writeFileSync(output,JSON.stringify(report),{flag:'wx'});
console.log(JSON.stringify({upperFragments:rows.length,anyContained:rows.filter(r=>r.matches.some(m=>m.status==='contained-projection')).length,multipleFloors:rows.filter(r=>new Set(r.matches.filter(m=>m.status==='contained-projection').map(m=>m.level)).size>1).length,statusCounts:rows.flatMap(r=>r.matches).reduce((o,m)=>(o[m.status]=(o[m.status]||0)+1,o),{}),unavailableRooms:report.unavailableRooms.length},null,2));
