const fs=require('node:fs'),crypto=require('node:crypto');
const R=require('../../bim/ifc-relations.js');
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node audit-ifc-relations.cjs source.ifc private-output.json');
const data=fs.readFileSync(input),start=Date.now(),idx=R.parse(data.toString('utf8'));
const report=R.analyze(idx);report.source={path:input,sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length};
fs.writeFileSync(output,JSON.stringify(report),{flag:'wx'});
const kinds={};for(const c of report.candidates){const k=kinds[c.kind]??={total:0,direct:0,container:0,hosts:0,exposure:{},propertyNames:{}};k.total++;if(c.declaredBoundaries.length)k.direct++;if(c.containerBoundaries.length)k.container++;if(c.hosts.length)k.hosts++;
for(const b of c.declaredBoundaries)k.exposure[b.exposure]=(k.exposure[b.exposure]||0)+1;
for(const p of c.properties){const n=p.pset+'.'+p.name;if(/Glaz|Transmi|Extern|IsExternal|Sky|Illum/i.test(n))k.propertyNames[n]=(k.propertyNames[n]||0)+1;}}
console.log(JSON.stringify({ms:Date.now()-start,kept:idx.records.size,counts:report.counts,spaces:report.spaces.length,issues:report.issues.slice(0,15),issuesCount:report.issues.length,kinds},null,2));
