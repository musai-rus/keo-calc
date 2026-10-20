const fs=require('node:fs'),B=require('./vertical-section-bands'),S=require('./surface-band-study'),R=require('./section-ribbon'),N=require('../../bim/native-spaces');
const [volumeFile,cellFile,faceFile,selectionFile,output]=process.argv.slice(2);
if(!output)throw Error('Usage: node inspect-surface-bands.cjs private-volume.json private-cell.json private-faces.json private-selection.json private-output.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),capture=read(volumeFile),cell=read(cellFile),faces=read(faceFile),selection=read(selectionFile);
if(cell.busy||cell.errors?.length!==0||JSON.stringify(capture.source)!==JSON.stringify(cell.source)||JSON.stringify(capture.source)!==JSON.stringify(faces.source))throw Error('surface-input-source-mismatch');
if(!Array.isArray(selection.fragments)||!selection.fragments.length||!selection.fragments.every(Number.isSafeInteger)||new Set(selection.fragments).size!==selection.fragments.length)throw Error('invalid-panel-selection');
(async()=>{
  const rows=S.prepare(capture,B),results=[];
  for(const fragment of selection.fragments){
    const face=faces.faces.find(f=>f.fragment===fragment),original=cell.candidates.find(c=>c.fragment===fragment);if(!face||!original)throw Error('missing-selected-panel');
    const result=await S.inspect({capture,rows,face,original,B,N,R});results.push(result);
    console.log(JSON.stringify({fragment,status:result.status,reason:result.reason,bands:result.bands.length,uniqueRibbons:result.ribbons.length}));
  }
  fs.writeFileSync(output,JSON.stringify({version:1,source:capture.source,capturedAt:capture.completedAt,results,errors:[],ownershipVerified:false,normativeVerified:false,keo:null}),{flag:'wx'});
})().catch(e=>{console.error(e);process.exitCode=1;});
