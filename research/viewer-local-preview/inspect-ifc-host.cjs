/* Read-only source check for an explicitly selected IFC host GUID. */
const fs=require('node:fs'),R=require('../../bim/ifc-relations');
const [source,guid]=process.argv.slice(2);if(!source||!guid)throw Error('Usage: node inspect-ifc-host.cjs source.ifc host-guid');
const geometryTypes=['IFCPRODUCTDEFINITIONSHAPE','IFCSHAPEREPRESENTATION','IFCEXTRUDEDAREASOLID','IFCARBITRARYPROFILEDEFWITHVOIDS','IFCARBITRARYCLOSEDPROFILEDEF','IFCBOOLEANCLIPPINGRESULT','IFCBOOLEANRESULT','IFCFACETEDBREP','IFCCLOSEDSHELL','IFCADVANCEDBREP','IFCMAPPEDITEM','IFCREPRESENTATIONMAP','IFCSHAPEREPRESENTATION','IFCRECTANGLEPROFILEDEF','IFCCIRCLEPROFILEDEF'];
const materialTypes=['IFCRELASSOCIATESMATERIAL','IFCMATERIALLAYERSETUSAGE','IFCMATERIALLAYERSET','IFCMATERIALLAYER','IFCMATERIAL','IFCMATERIALLIST','IFCMATERIALCONSTITUENTSET','IFCMATERIALCONSTITUENT','IFCMATERIALPROFILESETUSAGE','IFCMATERIALPROFILESET','IFCMATERIALPROFILE','IFCMATERIALPROPERTIES'];
const index=R.parse(fs.readFileSync(source,'utf8'),new Set([...R.TYPES,...geometryTypes,...materialTypes,'IFCSHAPEASPECT']));
const hosts=[...index.records.values()].filter(e=>e.args[0]===guid);if(hosts.length!==1)throw Error('missing-or-ambiguous-host-guid');
const host=hosts[0],voids=[...index.records.values()].filter(e=>e.type==='IFCRELVOIDSELEMENT'&&e.args[4]?.ref===host.id);
const refs=v=>Array.isArray(v)?v.flatMap(refs):v&&typeof v==='object'?(v.ref?[v.ref]:refs(v.values)):[];
const geometry=[],queue=refs(host.args[6]),seen=new Set();while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);const e=index.records.get(id);if(!e||!geometryTypes.includes(e.type))continue;geometry.push(e);queue.push(...refs(e.args));}
const types=[...index.records.values()].filter(e=>e.type==='IFCRELDEFINESBYTYPE'&&refs(e.args[4]).includes(host.id));
const ownerIds=[host.id,...types.flatMap(e=>refs(e.args[5]))];
const associations=[...index.records.values()].filter(e=>e.type==='IFCRELASSOCIATESMATERIAL'&&refs(e.args[4]).some(id=>ownerIds.includes(id)));
const materials=[],materialQueue=associations.flatMap(e=>refs(e.args[5])),materialSeen=new Set();
while(materialQueue.length){const id=materialQueue.shift();if(materialSeen.has(id))continue;materialSeen.add(id);const e=index.records.get(id);if(!e||!materialTypes.includes(e.type))continue;materials.push(e);materialQueue.push(...refs(e.args));}
const aspects=[...index.records.values()].filter(e=>e.type==='IFCSHAPEASPECT'&&e.args[4]?.ref===host.args[6]?.ref).map(e=>({...e,representations:refs(e.args[0]).map(id=>index.records.get(id)||{id,missing:true})}));
console.log(JSON.stringify({host,voids,geometry,types,associations,materials,aspects,limitations:['Selected declared host/type material associations; no opacity inferred from names','Only declared host void relations and selected representation records','Does not reconstruct or verify source solids or converter output']},null,2));
