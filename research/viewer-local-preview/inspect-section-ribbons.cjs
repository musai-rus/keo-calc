const fs=require('node:fs'),R=require('./section-ribbon'),P=require('./section-ribbon-study');
const [sectionFile,cellFile,faceFile,output]=process.argv.slice(2);
if(!output)throw Error('Usage: node inspect-section-ribbons.cjs private-sections.json private-cell.json private-faces.json private-output.json');
const a=JSON.parse(fs.readFileSync(sectionFile,'utf8')),cell=JSON.parse(fs.readFileSync(cellFile,'utf8')),faces=JSON.parse(fs.readFileSync(faceFile,'utf8'));
const ribbons=P.prepare(a,cell,faces).map(job=>{
  const result=job.rejected?{status:'unavailable',reason:job.rejected,sides:[]}:R.inspect(job.input);
  console.log(JSON.stringify({fragment:job.base.fragment,status:result.status,reason:result.reason,cells:result.sides.map(s=>s.cells.length),operations:result.operations}));
  return {...job.base,...result};
});
const out={source:a.source,sectionCapturedAt:a.completedAt,z:a.z,scope:a.scope,rooms:a.rooms.map(({section,...r})=>r),structures:a.structures.map(({section,...r})=>r),ribbons,ownershipVerified:false,normativeVerified:false};
fs.writeFileSync(output,JSON.stringify(out),{flag:'wx'});
