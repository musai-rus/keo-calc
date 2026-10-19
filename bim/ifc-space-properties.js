/* PropertyDB worker. Native IFC identity is scoped to IFC Attributes;
   Pset GlobalIds and translated display names never identify a space. */
const BimIfcSpaceProperties = (() => {
  function read(pdb) {
    const records=[];
    pdb.enumObjects(id=>{
      const r={id,ifc:{},properties:{}};
      pdb.enumObjectProperties(id,(a,v)=>{
        const d=pdb.getAttributeDef(a),value=pdb.getAttrValue(a,v);
        if(d.category==='IFC Attributes'&&['IfcClass','GlobalId','Name','LongName','Elevation','CompositionType'].includes(d.name))r.ifc[d.name]=value;
        if((d.category==='Other'&&d.name==='Category')||(d.category==='Identity Data'&&['Number','Name'].includes(d.name))||(d.category==='Constraints'&&d.name==='Level')||(d.category==='Dimensions'&&['Area','Perimeter','Unbounded Height'].includes(d.name)))r.properties[d.name]={value,unit:d.dataTypeContext||null};
      });
      if(['IfcSpace','IfcBuildingStorey'].includes(r.ifc.IfcClass))records.push(r);
    });
    return records;
  }
  return {read};
})();
if(typeof module!=='undefined')module.exports=BimIfcSpaceProperties;
