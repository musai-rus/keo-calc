const fs=require('node:fs'),crypto=require('node:crypto'),R=require('../../bim/ifc-relations'),M=require('../../bim/ifc-material-parts');
const [source,prismFile,output]=process.argv.slice(2);if(!source||!prismFile||!output)throw Error('Usage: node audit-ifc-material-parts.cjs source.ifc private-prism.json private-output.json');
const bytes=fs.readFileSync(source),prism=JSON.parse(fs.readFileSync(prismFile,'utf8').replace(/^\uFEFF/,''));
const guids=[...new Set(prism.fragments.map(r=>r.guid))].sort(),index=R.parse(bytes.toString('utf8'),new Set([...R.TYPES,...M.TYPES]));
const result={...M.analyze(index,guids),source:{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),viewerSnapshot:prism.source,revisionVerified:false}};
fs.writeFileSync(output,JSON.stringify(result),{flag:'wx'});
console.log(JSON.stringify({elements:result.elements.length,parts:result.elements.flatMap(e=>e.parts).length,statuses:result.elements.reduce((o,e)=>(o[e.reason||e.status]=(o[e.reason||e.status]||0)+1,o),{}),matched:result.elements.flatMap(e=>e.parts).filter(p=>p.sourceMaterialMatched).length}));
