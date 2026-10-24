'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8').replace(/\r\n/g,'\n');
const cut=n=>read(n).split('\nif "IN" in globals():\n')[0];
const source=cut('d0_probe.py')+'\n'+cut('d1_capture.py')+'\n'+read('d4_inputs.py');
const sha=crypto.createHash('sha256').update(source).digest('hex');
const original=JSON.parse(read('KEO_D0_ReadOnly.dyn'));
const ids=new Map();
function visit(x){if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){if(['Id','Uuid'].includes(k)&&typeof v==='string')ids.set(v,crypto.createHash('sha256').update('keo-inputs:'+v).digest('hex').slice(0,32));visit(v);}}
function rewrite(x){if(Array.isArray(x))return x.map(rewrite);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,rewrite(v)]));return ids.get(x)||x;}
visit(original);const graph=rewrite(original);
graph.Name='KEO D4 - Input candidates';
graph.Description='Read-only parameters and necessary Room outlines. No accepted calculation or writes.';
graph.Nodes[3].Code='BUNDLE_SHA256 = "'+sha+'"\n'+source;
graph.View.NodeViews[3].Name='D4 - Input candidates';
graph.View.NodeViews[4].Name='D4 summary';
const content=JSON.stringify(graph,null,2)+'\n';
if(process.argv.includes('--check')) {if(read('KEO_D4_InputCandidates.dyn')!==content)throw Error('Stale graph');}
else fs.writeFileSync(path.join(__dirname,'KEO_D4_InputCandidates.dyn'),content);
console.log(JSON.stringify({bundleSha256:sha,nodes:graph.Nodes.length,runType:graph.View.Dynamo.RunType}));
