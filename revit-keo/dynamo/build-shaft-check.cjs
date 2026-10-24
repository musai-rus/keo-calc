'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8').replace(/\r\n/g,'\n');
const cut=n=>read(n).split('\nif "IN" in globals():\n')[0];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const source=['d0_probe.py','d1_capture.py','d2_geometry.py','d2_inspect.py','d4_inputs.py','d4_section_probe.py','d4_profile.py'].map(cut).join('\n')+'\n'+read('d4_shaft_check.py');
const graph=JSON.parse(read('KEO_D0_ReadOnly.dyn'));
const ids=new Map();
function visit(x){if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){if(['Id','Uuid'].includes(k)&&typeof v==='string')ids.set(v,hash('keo-shaft-review:'+v).slice(0,32));visit(v);}}
function rewrite(x){if(Array.isArray(x))return x.map(rewrite);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,rewrite(v)]));return ids.get(x)||x;}
visit(graph);const g=rewrite(graph);
g.Name='KEO D4 - Shaft review';
g.Description='Read-only saved profile, above-aperture candidates and existing RoomTag types. No acceptance or model writes.';
g.Nodes[3].Code='BUNDLE_SHA256 = "'+hash(source)+'"\n'+source;
g.View.NodeViews[3].Name='D4 - Shaft review';g.View.NodeViews[4].Name='D4 shaft summary';
const content=JSON.stringify(g,null,2)+'\n';
if(process.argv.includes('--check')){if(read('KEO_D4_ShaftCheck.dyn')!==content)throw Error('Stale graph');}
else fs.writeFileSync(path.join(__dirname,'KEO_D4_ShaftCheck.dyn'),content);
console.log(JSON.stringify({bundleSha256:hash(source),nodes:g.Nodes.length,runType:g.View.Dynamo.RunType}));
