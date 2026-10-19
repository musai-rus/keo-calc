const assert=require('node:assert/strict'),P=require('./ifc-space-properties');
// Viewer IFC properties contain many Pset GlobalIds alongside element GlobalId.
// A file from a different exporter need not have Revit's Category or Number.
const objects=[
  [['IfcClass','IFC Attributes','IfcSpace'],['GlobalId','IFC Attributes','space-guid'],['GlobalId','Pset_SpaceCommon','pset-guid'],['Category','Other','Rooms'],['Number','Identity Data','001'],['Number','Identity Data(Type)','WRONG'],['Area','Dimensions',12,'squareMeters-2.0.0']],
  [['IfcClass','IFC Attributes','IfcSpace'],['GlobalId','IFC Attributes','other-exporter-space'],['Name','IFC Attributes','Room A']],
  [['IfcClass','IFC Attributes','IfcBuildingStorey'],['GlobalId','IFC Attributes','storey-guid'],['Elevation','IFC Attributes',4500]],
  [['IfcClass','IFC Attributes','IfcWall'],['GlobalId','IFC Attributes','wall-guid'],['Category','Other','Rooms']],
  [['IfcClass','Custom','IfcSpace'],['GlobalId','Custom','fake-guid']]
];
const defs=[],values=[];const refs=objects.map(ps=>ps.map(([name,category,value,dataTypeContext])=>{const i=defs.length;defs.push({name,category,dataTypeContext});values.push(value);return i;}));
const pdb={enumObjects:cb=>refs.forEach((_,i)=>cb(i+1)),enumObjectProperties:(id,cb)=>refs[id-1].forEach(i=>cb(i,i)),getAttributeDef:i=>defs[i],getAttrValue:(i,v)=>values[v]};
const result=P.read(pdb);assert.equal(result.length,3);assert.equal(result[0].ifc.GlobalId,'space-guid');assert.equal(result[0].properties.Number.value,'001');assert.deepEqual(result[0].properties.Area,{value:12,unit:'squareMeters-2.0.0'});
assert.equal(result[1].ifc.GlobalId,'other-exporter-space');assert.equal(result[1].properties.Category,undefined);assert.equal(result[2].ifc.Elevation,4500);
// Function must run in an isolated PropertyDB worker with no imported module.
assert.deepEqual(new Function('return ('+P.read.toString()+')')()(pdb),result);
console.log('OK: IFC entity identities isolated from Psets/type properties; non-Revit spaces retained; units preserved; worker is self-contained');
