/* Read declared geometric contexts, north and units. No source edits; no
   automatic claim that the Viewer coordinate frame matches IFC coordinates. */
const fs=require('node:fs'),crypto=require('node:crypto'),R=require('../../bim/ifc-relations.js');
const [input,output]=process.argv.slice(2);if(!input)throw Error('Usage: node inspect-ifc-context.cjs source.ifc [private-output.json]');
const bytes=fs.readFileSync(input),source=bytes.toString('utf8'),records=new Map();
const wanted=new Set(['IFCGEOMETRICREPRESENTATIONCONTEXT','IFCGEOMETRICREPRESENTATIONSUBCONTEXT','IFCDIRECTION','IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCUNITASSIGNMENT','IFCSIUNIT','IFCMAPCONVERSION','IFCPROJECTEDCRS']);
for(const match of source.matchAll(/#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(([^;]*)\)\s*;/g))if(wanted.has(match[2]))records.set(+match[1],{id:+match[1],type:match[2],args:R.values('('+match[3]+')')});
const get=ref=>records.get(ref?.ref)||null;
const contexts=[...records.values()].filter(r=>r.type==='IFCGEOMETRICREPRESENTATIONCONTEXT').map(r=>({...r,worldSystem:get(r.args[4]),north:get(r.args[5])}));
const out={source:{path:input,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},contexts,units:[...records.values()].filter(r=>r.type==='IFCUNITASSIGNMENT').map(r=>({...r,units:r.args[0].map(get)})),mapConversions:[...records.values()].filter(r=>r.type==='IFCMAPCONVERSION'),viewerFrameBindingVerified:false};
if(output)fs.writeFileSync(output,JSON.stringify(out,null,2),{flag:'wx'});console.log(JSON.stringify(out));
