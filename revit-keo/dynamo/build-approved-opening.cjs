'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8').replace(/\r\n/g,'\n');
const cut=n=>read(n).split('\nif "IN" in globals():\n')[0];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const source=cut('d0_probe.py')+'\n'+cut('d1_capture.py')+'\n'+read('d2_geometry.py')+'\n'+cut('d2_inspect.py')+'\n'+cut('d4_inputs.py')+'\n'+read('d4_section_probe.py')+'\n'+cut('d4_profile.py')+'\n'+cut('d5_pending.py')+'\n'+read('d5_approved_opening.py');
const graph=JSON.parse(read('KEO_D0_ReadOnly.dyn'));
const ids=new Map();
function visit(x){if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){if(['Id','Uuid'].includes(k)&&typeof v==='string')ids.set(v,hash('keo-approved-opening:'+v).slice(0,32));visit(v);}}
function rewrite(x){if(Array.isArray(x))return x.map(rewrite);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,rewrite(v)]));return ids.get(x)||x;}
visit(graph);const g=rewrite(graph);
g.Name='KEO D5 - Approved opening and preliminary plan';
g.Description='Explicitly approved test-only opening and gray preliminary result. Preview and rollback required. No RVT save or normative acceptance.';
g.Nodes[3].Code='BUNDLE_SHA256 = "'+hash(source)+'"\n'+source;
g.View.NodeViews[3].Name='D5 - Approved test changes';g.View.NodeViews[4].Name='D5 test result';
const content=JSON.stringify(g,null,2)+'\n';
if(process.argv.includes('--check')){if(read('KEO_D5_ApprovedOpening.dyn')!==content)throw Error('Stale graph');}
else fs.writeFileSync(path.join(__dirname,'KEO_D5_ApprovedOpening.dyn'),content);
console.log(JSON.stringify({bundleSha256:hash(source),nodes:g.Nodes.length,runType:g.View.Dynamo.RunType}));
