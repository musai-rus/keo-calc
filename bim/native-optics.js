/* Explicit selections from the existing unchanged calculator tables.
   No inference from material colour, alpha, names or geometry. */
const BimNativeOptics=(()=>{
  const source={t1:'СП 367.1325800.2025, п. Б.2.7, табл. Б.13–Б.14',t2:'СП 367.1325800.2025, п. Б.2.7, табл. Б.15'};
  function select(field,index,DATA){
    if(!Object.hasOwn(source,field))throw Error('unknown-optical-field');
    const table=DATA[field==='t1'?'tau1':'tau2'],row=table?.[index];
    if(!Number.isSafeInteger(index)||!row||!Number.isFinite(row.v)||row.v<=0||row.v>1)throw Error('invalid-table-selection');
    return {index,label:row.t,value:row.v,range:row.r||null,source:source[field]};
  }
  function resolve(settings,context,DATA){
    const out={status:'needs-input',values:{},sources:{},missing:[],issues:[],opticsVerified:false};
    if(!settings||typeof settings.modelKey!=='string'||!settings.modelKey||settings.modelKey!==context?.modelKey){out.issues.push('model-settings-mismatch');return out;}
    for(const field of ['t1','t2']){
      const choices=[['element',context.elementGuid&&settings.elements?.[context.elementGuid]],['type',context.typeGuid&&settings.types?.[context.typeGuid]],['common',settings.common]];
      const chosen=choices.find(([,o])=>o&&Object.hasOwn(o,field));
      if(!chosen||chosen[1][field]===null){out.missing.push(field);continue;}
      const saved=chosen[1][field];let row;
      try{row=select(field,saved.index,DATA);}catch{out.issues.push('invalid-'+field);continue;}
      if(row.label!==saved.label||row.value!==saved.value||row.range!==saved.range||row.source!==saved.source){out.issues.push('changed-table-'+field);continue;}
      out.values[field]=row.value;out.sources[field]={...row,scope:chosen[0],kind:'explicit-user-table-selection'};
    }
    if(!out.missing.length&&!out.issues.length)out.status='specified';
    // t1/t2 alone never certify complete tau0, material identity or geometry.
    return out;
  }
  return {select,resolve};
})();
if(typeof module!=='undefined')module.exports=BimNativeOptics;
