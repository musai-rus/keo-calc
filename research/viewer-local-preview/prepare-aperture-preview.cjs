const fs=require('node:fs');
const [relations,identities,output]=process.argv.slice(2);
if(!relations||!identities||!output)throw Error('Usage: node prepare-aperture-preview.cjs relations.json identities.json private-output.json');
const r=JSON.parse(fs.readFileSync(relations));
const v=JSON.parse(fs.readFileSync(identities));
const counts=new Map();for(const e of v.entities){const a=counts.get(e.GlobalId)||[];a.push(e);counts.set(e.GlobalId,a);}
const compact={version:1,source:{sha256:r.source.sha256,bytes:r.source.bytes},model:v.model,counts:r.counts,revisionBindingVerified:false,candidates:r.candidates.map(c=>({
  guid:c.guid,stepId:c.stepId,name:c.name,kind:c.kind,declaredType:c.declaredType,
  dbId:counts.get(c.guid)?.length===1?counts.get(c.guid)[0].id:null,
  classMatches:counts.get(c.guid)?.length===1&&counts.get(c.guid)[0].IfcClass.toUpperCase()===c.ifcClass,
  directSpaces:[...new Set(c.declaredBoundaries.map(b=>b.space.guid))],
  containerSpaces:[...new Set(c.containerBoundaries.map(b=>b.space.guid))],
  external:(()=>{const vals=c.properties.filter(p=>p.name==='IsExternal'&&p.pset?.startsWith('Pset_')).map(p=>p.value?.values?.[0]?.enum);return vals.length&&vals.every(v=>v==='F')?false:vals.length&&vals.every(v=>v==='T')?true:null;})(),
  hostCount:c.hosts.length,reasons:c.reasons
}))};
fs.writeFileSync(output,JSON.stringify(compact),{flag:'wx'});
console.log(JSON.stringify({bytes:JSON.stringify(compact).length,candidates:compact.candidates.length,uniqueGuidClassMatches:compact.candidates.filter(c=>c.dbId&&c.classMatches).length,withType:compact.candidates.filter(c=>c.declaredType).length}));
