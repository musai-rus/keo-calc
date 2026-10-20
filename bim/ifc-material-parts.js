/* Declared IFC4 constituent -> shape-aspect -> representation-item links.
   Exact semantic keywords, not material-name/colour heuristics. No opacity.
   IFC4 IfcMaterialConstituent and IfcShapeAspect, buildingSMART specification. */
const BimIfcMaterialParts=(()=>{
  const TYPES=new Set(('IFCSHAPEASPECT IFCPRODUCTDEFINITIONSHAPE IFCSHAPEREPRESENTATION IFCRELASSOCIATESMATERIAL IFCMATERIALCONSTITUENTSET IFCMATERIALCONSTITUENT IFCMATERIAL IFCMATERIALLAYERSETUSAGE IFCMATERIALLAYERSET IFCMATERIALLAYER IFCMATERIALLIST IFCSLABTYPE IFCWALLTYPE IFCROOFTYPE IFCEXTRUDEDAREASOLID IFCFACETEDBREP IFCADVANCEDBREP IFCTRIANGULATEDFACESET IFCPOLYGONALFACESET IFCMAPPEDITEM IFCBOOLEANRESULT IFCBOOLEANCLIPPINGRESULT').split(' '));
  const ROOTS=new Set(['IFCWALL','IFCWALLSTANDARDCASE','IFCSLAB','IFCROOF','IFCWINDOW','IFCDOOR','IFCPLATE']);
  const ref=v=>v&&Number.isSafeInteger(v.ref)?v.ref:null;
  const refs=v=>Array.isArray(v)&&v.every(x=>ref(x))?v.map(ref):null;
  const base={sourceMaterialMatched:false,geometryVerified:false,physicalRole:'unspecified',opticsVerified:false,normativeVerified:false};
  function analyze(index,guids){
    if(!index||!(index.records instanceof Map)||!Array.isArray(guids)||guids.some(g=>typeof g!=='string'||!g)||new Set(guids).size!==guids.length)throw Error('invalid-material-part-input');
    const records=index.records,all=[...records.values()];
    return {version:1,reference:'declared-ifc4-constituent-shape-aspect',elements:guids.map(guid=>{
      const out={...base,guid,status:'unavailable',parts:[],issues:[]},roots=all.filter(e=>ROOTS.has(e.type)&&e.args[0]===guid);
      const fail=reason=>({...out,reason});if(roots.length!==1)return fail('missing-or-duplicate-element-guid');
      const host=roots[0],pds=records.get(ref(host.args[6]));out.stepId=host.id;out.ifcClass=host.type;
      if(pds?.type!=='IFCPRODUCTDEFINITIONSHAPE')return fail('missing-product-definition-shape');
      const rootReps=refs(pds.args[2]);if(!rootReps?.length)return fail('missing-body-representations');
      const bodyItems=new Set();for(const id of rootReps){const r=records.get(id);if(r?.type==='IFCSHAPEREPRESENTATION'&&r.args[1]==='Body')for(const item of refs(r.args[3])||[])bodyItems.add(item);}
      if(!bodyItems.size)return fail('missing-body-items');
      const typeLinks=all.filter(e=>e.type==='IFCRELDEFINESBYTYPE'&&refs(e.args[4])?.includes(host.id));
      if(typeLinks.length>1)return fail('ambiguous-declared-type');
      const typeId=typeLinks.length?ref(typeLinks[0].args[5]):null;
      if(typeLinks.length&&(!typeId||!records.has(typeId)))return fail('missing-type-record');
      const owners=new Set([host.id,...(typeId?[typeId]:[])]);
      const assoc=all.filter(e=>e.type==='IFCRELASSOCIATESMATERIAL'&&refs(e.args[4])?.some(id=>owners.has(id)));
      const setIds=[...new Set(assoc.map(e=>ref(e.args[5])))];out.associations=assoc.map(e=>e.id);
      if(setIds.length!==1||!setIds[0])return fail(setIds.length?'ambiguous-material-association':'missing-material-association');
      const set=records.get(setIds[0]);out.materialDefinitionId=setIds[0];
      if(set?.type!=='IFCMATERIALCONSTITUENTSET')return fail('unsupported-material-definition');
      const cids=refs(set.args[2]);if(!cids?.length||new Set(cids).size!==cids.length)return fail('invalid-material-constituents');
      const constituents=cids.map(id=>records.get(id));if(constituents.some(e=>e?.type!=='IFCMATERIALCONSTITUENT'))return fail('missing-material-constituent');
      const aspects=all.filter(e=>e.type==='IFCSHAPEASPECT'&&ref(e.args[4])===pds.id);
      if(!aspects.length)return fail('missing-direct-shape-aspects');
      for(const a of aspects){
        const part={...base,aspectId:a.id,name:a.args[1],productDefinitional:a.args[3]?.enum||null,itemIds:[],status:'unavailable'};out.parts.push(part);
        const bad=reason=>{part.reason=reason;};
        if(typeof part.name!=='string'||!part.name){bad('missing-aspect-keyword');continue;}
        const matches=constituents.filter(c=>c.args[0]===part.name);
        if(matches.length!==1){bad(matches.length?'ambiguous-constituent-keyword':'missing-constituent-keyword');continue;}
        const constituent=matches[0],material=records.get(ref(constituent.args[2]));
        if(material?.type!=='IFCMATERIAL'){bad('missing-material-record');continue;}
        const reps=refs(a.args[0]);if(!reps?.length){bad('missing-aspect-representation');continue;}
        for(const rid of reps){const r=records.get(rid),items=r?.type==='IFCSHAPEREPRESENTATION'&&r.args[1]==='Body'?refs(r.args[3]):null;if(!items?.length){bad('unsupported-aspect-representation');break;}part.itemIds.push(...items);}
        if(part.reason)continue;
        if(new Set(part.itemIds).size!==part.itemIds.length||part.itemIds.some(id=>!bodyItems.has(id)||!records.has(id))){bad('aspect-items-not-in-current-body');continue;}
        part.constituentId=constituent.id;part.material={stepId:material.id,name:material.args[0],category:material.args[2],constituentCategory:constituent.args[4]};
        part.status='declared-part-material';part.sourceMaterialMatched=true;
      }
      const counts=new Map();for(const p of out.parts)for(const id of p.itemIds)counts.set(id,(counts.get(id)||0)+1);
      for(const p of out.parts)if(p.itemIds.some(id=>counts.get(id)>1)){p.status='unavailable';p.reason='overlapping-shape-aspects';p.sourceMaterialMatched=false;}
      out.unassignedBodyItemIds=[...bodyItems].filter(id=>!out.parts.some(p=>p.status==='declared-part-material'&&p.itemIds.includes(id)));
      out.status='diagnostic';return out;
    })};
  }
  function matchViewer(element,{aspectName,materialName}={}){
    const fail=reason=>({...base,status:'unavailable',reason});
    if(element?.status!=='diagnostic')return fail(element?.reason||'missing-source-part');
    if(typeof aspectName!=='string'||typeof materialName!=='string')return fail('missing-viewer-part');
    const parts=element.parts.filter(p=>p.name===aspectName);
    if(parts.length!==1)return fail(parts.length?'ambiguous-source-aspect-name':'missing-source-aspect-name');
    const p=parts[0];if(p.status!=='declared-part-material')return fail(p.reason);
    if(p.material.name!==materialName)return fail('viewer-material-does-not-match-source');
    return {...base,status:'declared-material-match',sourceMaterialMatched:true,aspectId:p.aspectId,aspectName:p.name,material:p.material,itemIds:p.itemIds,revisionVerified:false};
  }
  return {TYPES,analyze,matchViewer};
})();
if(typeof module!=='undefined')module.exports=BimIfcMaterialParts;
