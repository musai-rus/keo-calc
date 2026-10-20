/* Research: declared IFC relationships, not a geometric/optical certificate.
   Pure JavaScript, usable in a browser. No network, AI or model-specific IDs.
   The source adapter must bind the file revision to the current Viewer. */
const BimIfcRelations = (() => {
  const TYPES = new Set(('IFCPROJECT IFCSPACE IFCWALL IFCWALLSTANDARDCASE IFCSLAB IFCROOF IFCWINDOW IFCDOOR IFCCURTAINWALL IFCPLATE IFCMEMBER IFCOPENINGELEMENT IFCBUILDINGELEMENTPROXY IFCRELSPACEBOUNDARY IFCRELSPACEBOUNDARY1STLEVEL IFCRELSPACEBOUNDARY2NDLEVEL IFCRELFILLSELEMENT IFCRELVOIDSELEMENT IFCRELAGGREGATES IFCRELNESTS IFCRELDEFINESBYPROPERTIES IFCPROPERTYSET IFCPROPERTYSINGLEVALUE').split(' '));
  for(const t of ['IFCRELDEFINESBYTYPE','IFCWINDOWTYPE','IFCDOORTYPE','IFCPLATETYPE','IFCCURTAINWALLTYPE'])TYPES.add(t);
  const ref = v => v && typeof v === 'object' && Number.isSafeInteger(v.ref) ? v.ref : null;
  const en = v => v && typeof v === 'object' ? v.enum || null : null;
  function decode(s) {
    return s.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h) => {
      if (h.length % 4) throw new Error('invalid-step-unicode');
      return h.match(/.{4}/g).map(x=>String.fromCharCode(parseInt(x,16))).join('');
    }).replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (_, h) => {
      if (h.length % 8) throw new Error('invalid-step-unicode');
      return h.match(/.{8}/g).map(x=>String.fromCodePoint(parseInt(x,16))).join('');
    });
  }
  function values(source) {
    let i=0, depth=0;
    const ws=()=>{while (/\s/.test(source[i]||'') && i<source.length)i++;};
    function value() {
      ws(); const c=source[i++];
      if(c==='$')return null;
      if(c==='*')return {omitted:true};
      if(c==="'") {
        let s='';
        while(i<source.length){const x=source[i++];if(x==="'"){if(source[i]==="'"){s+="'";i++;}else return decode(s);}else s+=x;}
        throw new Error('unterminated-step-string');
      }
      if(c==='('){
        if(++depth>64)throw new Error('step-depth-limit');
        const a=[];ws();if(source[i]===')'){i++;depth--;return a;}
        for(;;){a.push(value());ws();const sep=source[i++];if(sep===')'){depth--;return a;}if(sep!==',')throw new Error('invalid-step-list');}
      }
      if(c==='#'){const m=/^\d+/.exec(source.slice(i));if(!m)throw new Error('invalid-step-ref');i+=m[0].length;const n=Number(m[0]);if(!Number.isSafeInteger(n)||n<1)throw new Error('invalid-step-ref');return {ref:n};}
      i--; const tail=source.slice(i);
      let m=/^\.([A-Z_][A-Z_0-9]*)\./i.exec(tail);if(m){i+=m[0].length;return {enum:m[1].toUpperCase()};}
      m=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/.exec(tail);
      if(m){i+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n))throw new Error('nonfinite-step-number');return n;}
      m=/^[A-Z_][A-Z_0-9]*/i.exec(tail);
      if(m){i+=m[0].length;ws();if(source[i]!=='(')throw new Error('invalid-step-typed-value');return {type:m[0].toUpperCase(),values:value()};}
      throw new Error('unsupported-step-value:'+i);
    }
    const out=value();ws();if(i!==source.length)throw new Error('trailing-step-value');return out;
  }
  function parse(text, keep=TYPES) {
    if(typeof text!=='string')throw new Error('step-text-required');
    const records=new Map(),ids=new Set();let start=0,quote=false,comment=false,clean='',hasComment=false,count=0,schema=null,data=false,ended=false;
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(comment){if(c==='*'&&n==='/'){comment=false;i++;start=i+1;}continue;}
      if(quote){if(c==="'"){if(n==="'")i++;else quote=false;}continue;}
      if(c==="'"){quote=true;continue;}
      if(c==='/'&&n==='*'){clean+=text.slice(start,i)+' ';hasComment=true;comment=true;i++;continue;}
      if(c!==';')continue;
      const s=(hasComment?clean+text.slice(start,i):text.slice(start,i)).trim();start=i+1;clean='';hasComment=false;
      if(/^FILE_SCHEMA\(/i.test(s)){schema=values(s.slice(s.indexOf('(')))[0];continue;}
      if(s==='DATA'){data=true;continue;}
      if(s==='ENDSEC'){data=false;continue;}
      if(s==='END-ISO-10303-21'){ended=true;continue;}
      if(!data)continue;
      const m=/^#(\d+)\s*=\s*([A-Z][A-Z_0-9]*)\s*(\([\s\S]*\))$/i.exec(s);
      if(!m)throw new Error('unsupported-step-record');
      const id=Number(m[1]);if(!Number.isSafeInteger(id)||id<1||ids.has(id))throw new Error('duplicate-or-invalid-step-id');
      ids.add(id);count++;const type=m[2].toUpperCase();
      if(!keep || keep.has(type))records.set(id,{id,type,args:values(m[3])});
    }
    if(quote||comment||!ended||text.slice(start).trim())throw new Error('incomplete-step-file');
    if(!Array.isArray(schema)||schema.length!==1||schema[0]!=='IFC4')throw new Error('unsupported-ifc-schema');
    return {schema:schema[0],recordCount:count,records};
  }
  function analyze(index) {
    const {records}=index, issues=[], roots=new Map(),guidMap=new Map(),boundaries=[],fills=[],voids=[],parents=new Map(),props=new Map(),types=new Map();
    const ordered=[...records.values()].sort((a,b)=>a.id-b.id);
    const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
    const identity=id=>{const e=records.get(id);return e?{stepId:id,ifcClass:e.type,guid:typeof e.args[0]==='string'?e.args[0]:null,name:typeof e.args[2]==='string'?e.args[2]:null}:null;};
    for(const e of ordered){
      const a=e.args;
      if(/^IFC(?:REL|PROPERTY)/.test(e.type)||e.type==='IFCPROPERTYSET')continue;
      if(typeof a[0]==='string'){roots.set(e.id,identity(e.id));add(guidMap,a[0],e.id);}
    }
    for(const [guid,ids] of guidMap)if(ids.length!==1)issues.push({code:'duplicate-guid',guid,ids});
    function requireEntity(id,relation,role,type){const e=records.get(id);if(!e||type&&!type.test(e.type)){issues.push({code:'missing-or-wrong-reference',relation,role,stepId:id});return false;}return true;}
    for(const e of ordered){
      const a=e.args;
      if(e.type.startsWith('IFCRELSPACEBOUNDARY')){
        const space=ref(a[4]),element=ref(a[5]);
        if(!requireEntity(space,e.id,'space',/^IFCSPACE$/))continue;
        boundaries.push({stepId:e.id,space,element,geometry:ref(a[6]),physical:en(a[7]),exposure:en(a[8]),sourceClass:e.type});
      }else if(e.type==='IFCRELFILLSELEMENT'){
        const opening=ref(a[4]),element=ref(a[5]);
        if(requireEntity(opening,e.id,'opening',/^IFCOPENINGELEMENT$/)&&requireEntity(element,e.id,'filling'))fills.push({stepId:e.id,opening,element});
      }else if(e.type==='IFCRELVOIDSELEMENT'){
        const host=ref(a[4]),opening=ref(a[5]);
        if(requireEntity(host,e.id,'host')&&requireEntity(opening,e.id,'opening',/^IFCOPENINGELEMENT$/))voids.push({stepId:e.id,host,opening});
      }else if(e.type==='IFCRELAGGREGATES'||e.type==='IFCRELNESTS'){
        const parent=ref(a[4]);for(const child of a[5]||[])if(ref(child))add(parents,ref(child),{id:parent,relation:e.id});
      }else if(e.type==='IFCRELDEFINESBYTYPE'){
        const typeId=ref(a[5]);for(const item of a[4]||[])if(ref(item))add(types,ref(item),{stepId:e.id,typeId});
      }else if(e.type==='IFCRELDEFINESBYPROPERTIES'){
        const ps=records.get(ref(a[5]));if(ps?.type!=='IFCPROPERTYSET')continue;
        for(const item of a[4]||[])for(const p of ps.args[4]||[]){const v=records.get(ref(p));if(v?.type==='IFCPROPERTYSINGLEVALUE')add(props,ref(item),{pset:ps.args[2],name:v.args[0],value:v.args[2],unit:ref(v.args[3]),relation:e.id,property:v.id});}
      }
    }
    const byElement=new Map(),byOpening=new Map(),byFilling=new Map();
    for(const b of boundaries)if(b.element)add(byElement,b.element,b);
    for(const v of voids)add(byOpening,v.opening,v);
    for(const f of fills)add(byFilling,f.element,f);
    const candidates=[];
    for(const e of ordered){
      if(!['IFCWINDOW','IFCCURTAINWALL','IFCPLATE','IFCDOOR'].includes(e.type))continue;
      const ancestors=[],stack=[{id:e.id,path:[]}],seen=new Set();let cycle=false;
      while(stack.length){const s=stack.pop();if(s.path.includes(s.id)){cycle=true;continue;}if(seen.has(s.id))continue;seen.add(s.id);
        for(const p of parents.get(s.id)||[]){ancestors.push(p);stack.push({id:p.id,path:[...s.path,s.id]});}}
      const curtainParents=ancestors.filter(p=>records.get(p.id)?.type==='IFCCURTAINWALL');
      const declared=byElement.get(e.id)||[], fillLinks=byFilling.get(e.id)||[];
      const hosts=fillLinks.flatMap(f=>(byOpening.get(f.opening)||[]).map(v=>({opening:identity(f.opening),host:identity(v.host),fillRelation:f.stepId,voidRelation:v.stepId})));
      const explicitClaims=declared.map(b=>({...b,space:identity(b.space)}));
      const containerClaims=curtainParents.flatMap(p=>(byElement.get(p.id)||[]).map(b=>({...b,space:identity(b.space),container:identity(p.id),relation:p.relation})));
      const reasons=[];
      if(cycle)reasons.push('cyclic-decomposition');
      if((guidMap.get(e.args[0])||[]).length!==1)reasons.push('ambiguous-guid');
      if(fillLinks.length>1||hosts.length>1)reasons.push('ambiguous-opening-host');
      const typeRefs=types.get(e.id)||[],typeEntity=typeRefs.length===1?records.get(typeRefs[0].typeId):null;
      const validType=typeEntity&&typeEntity.type===e.type+'TYPE'&&(guidMap.get(typeEntity.args[0])||[]).length===1;
      if(typeRefs.length&&!validType)reasons.push('missing-or-ambiguous-type');
      if(!explicitClaims.length&&!containerClaims.length)reasons.push('no-declared-space-boundary');
      candidates.push({...identity(e.id),kind:e.type==='IFCWINDOW'?'window':e.type==='IFCCURTAINWALL'?'curtain-assembly':e.type==='IFCPLATE'?(curtainParents.length?'curtain-panel':'plate'):'door',
        declaredBoundaries:explicitClaims,containerBoundaries:containerClaims,hosts,curtainParents:curtainParents.map(p=>identity(p.id)),properties:props.get(e.id)||[],reasons,
        declaredType:validType?identity(typeEntity.id):null,typeRelations:typeRefs.map(t=>t.stepId),
        geometryVerified:false,ownershipVerified:false,opticsVerified:false,normativeVerified:false});
    }
    candidates.sort((a,b)=>a.stepId-b.stepId);
    return {version:1,schema:index.schema,recordCount:index.recordCount,spaces:[...roots.values()].filter(e=>e.ifcClass==='IFCSPACE'),candidates,issues,
      counts:{boundaries:boundaries.length,fills:fills.length,voids:voids.length,candidates:candidates.length},
      limits:['IFC declarations require geometric cross-check','Container boundaries do not assign every panel to every adjacent space','Window/door/plate type does not prove transparent infill','Missing boundary is unknown, not no daylight','Original-file/Viewer revision binding is required'],
      geometryVerified:false,ownershipVerified:false,opticsVerified:false,normativeVerified:false};
  }
  return {parse,values,analyze,TYPES};
})();
if(typeof module!=='undefined')module.exports=BimIfcRelations;
