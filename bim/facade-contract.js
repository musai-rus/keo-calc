/* Research only. Exact rectangular planar support/coverage certificates.
   Not wired to Viewer or the calculation gate. A proof is relative to the
   supplied source contract; no source truth or normative point is inferred. */
const BimFacadeContract = (() => {
  const fail=(state,code,at)=>{throw {contractFailure:true,state,code,at};};
  const missing=(code,at)=>fail('insufficient-data',code,at),bad=(code,at)=>fail('contradicted',code,at);
  const text=(x,at)=>{if(typeof x!=='string'||!x.trim()||x.length>256)missing('missing-reference',at);return x;};
  const gcd=(a,b)=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a;};
  const rational=(n,d=1n)=>{if(!d)bad('zero-denominator','coordinate');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return[n/g,d/g];};
  const add=(a,b)=>rational(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),neg=a=>[-a[0],a[1]],sub=(a,b)=>add(a,neg(b));
  const mul=(a,b)=>rational(a[0]*b[0],a[1]*b[1]),div=(a,b)=>rational(a[0]*b[1],a[1]*b[0]);
  const compare=(a,b)=>{const n=a[0]*b[1]-b[0]*a[1];return n<0n?-1:n>0n?1:0;};
  const eq=(a,b)=>compare(a,b)===0,Z=[0n,1n],ONE=[1n,1n];
  const key=a=>a[1]===1n?String(a[0]):a[0]+'/'+a[1];
  const vec=(a,b,op)=>a.map((x,i)=>op(x,b[i])),dot=(a,b)=>a.reduce((s,x,i)=>add(s,mul(x,b[i])),Z);
  const cross=(a,b)=>[sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))];
  const same=(a,b)=>a.every((x,i)=>eq(x,b[i]));
  function number(x,at){
    if(Number.isSafeInteger(x))return rational(BigInt(x));
    if(typeof x!=='string'||x.length>128)missing('exact-rational-coordinate-required',at);
    if(/^[+-]?\d+\/[1-9]\d*$/.test(x)){const[n,d]=x.split('/');return rational(BigInt(n),BigInt(d));}
    if(!/^[+-]?\d+(\.\d+)?$/.test(x))missing('exact-rational-coordinate-required',at);
    const [whole,part='']=x.split('.'),d=10n**BigInt(part.length),sign=whole.startsWith('-')?-1n:1n;
    return rational(BigInt(whole)*d+sign*BigInt(part||'0'),d);
  }
  function vector(x,at,n=3){if(!Array.isArray(x)||x.length!==n)missing('missing-coordinate-vector',at);return x.map((v,i)=>number(v,at+'.'+i));}
  function list(x,at,limit=512){if(!Array.isArray(x)||!x.length)missing('missing-complete-geometry',at);if(x.length>limit)missing('certificate-size-limit',at);return x;}
  function exactSource(input){
    const s=input.scope||{},scope={};
    for(const name of ['modelId','revisionId','documentId','instanceId','viewId','frameId','roomBoundaryRevision'])scope[name]=text(s[name],'scope.'+name);
    const p=input.source||{};text(p.producer,'source.producer');text(p.evidence,'source.evidence');
    if(p.kind!=='native-planar-export'||p.reference!=='source-model'||p.reconstruction!=='exact'||p.complete!==true)
      missing('source-precision-or-completeness-unconfirmed','source');
    for(const [name,value]of Object.entries(scope))if(p.scope?.[name]!==value)bad('source-scope-mismatch','source.scope.'+name);
    if(p.coordinates!=='exact-rational'||p.transformPrecision!=='exact')missing('source-coordinate-or-transform-error-unconfirmed','source');
    const unit=new Map([['m',ONE],['mm',rational(1n,1000n)],['ft',rational(381n,1250n)]]).get(input.unit);
    if(!unit)missing('unknown-unit','unit');
    const m=vector(input.transform,'transform',16);
    if(!same([m[3],m[7],m[11],m[15]],[Z,Z,Z,ONE]))bad('non-affine-transform','transform');
    const axes=[m.slice(0,3),m.slice(4,7),m.slice(8,11)];
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(!eq(dot(axes[i],axes[j]),i===j?ONE:Z))missing('non-rigid-transform-not-supported','transform');
    if(!eq(dot(cross(axes[0],axes[1]),axes[2]),ONE))missing('reflection-transform-not-supported','transform');
    const direction=v=>[0,1,2].map(i=>v.reduce((a,x,k)=>add(a,mul(m[i+4*k],x)),Z));
    const position=v=>direction(v).map((x,i)=>mul(add(x,m[12+i]),unit));
    return {scope,unit,direction,position};
  }
  function frame(raw,ctx,at){
    if(!raw)missing('missing-plane-frame',at);
    const origin=ctx.position(vector(raw.origin,at+'.origin')),u=ctx.direction(vector(raw.u,at+'.u')),v=ctx.direction(vector(raw.v,at+'.v'));
    if(!eq(dot(u,u),ONE)||!eq(dot(v,v),ONE)||!eq(dot(u,v),Z))bad('non-orthonormal-plane-frame',at);
    // Supported subset: a vertical plane with horizontal u and upward v.
    if(!eq(u[2],Z)||!same(v,[Z,Z,ONE]))missing('nonvertical-or-nonrectilinear-frame-not-supported',at);
    const normal=cross(u,v),offset=dot(normal,origin),zero=normal.map(x=>mul(x,offset));
    return {origin,u,v,normal,offset,zero};
  }
  function rectangle(raw,F,canonical,unit,at){
    const r=vector(raw,at,4);if(compare(r[0],r[2])>=0||compare(r[1],r[3])>=0)bad('zero-or-reversed-rectangle',at);
    const project=(x,y)=>{
      const p=F.origin.map((v,i)=>add(v,add(mul(F.u[i],mul(x,unit)),mul(F.v[i],mul(y,unit))))),d=vec(p,canonical.zero,sub);
      if(!eq(dot(canonical.normal,d),Z))bad('polygon-outside-plane',at);
      return [dot(d,canonical.u),dot(d,canonical.v)];
    };
    const a=project(r[0],r[1]),b=project(r[2],r[3]);
    if(compare(a[0],b[0])>=0||compare(a[1],b[1])>=0)bad('inconsistent-polygon-winding',at);
    return [a[0],a[1],b[0],b[1]];
  }
  const sourceKey=(source,owner,at)=>{
    if(!source||!source.elementId)missing('missing-source-owner',at);
    if(source.elementId!==owner)bad('source-owner-mismatch',at);
    return JSON.stringify([owner,text(source.fragmentId,at+'.fragmentId'),text(source.partId,at+'.partId')]);
  };
  const positiveOverlap=(a,b)=>compare(a[0],b[1])<0&&compare(b[0],a[1])<0;
  function touchesEdge(a,b){return ((eq(a[2],b[0])||eq(b[2],a[0]))&&positiveOverlap([a[1],a[3]],[b[1],b[3]]))||((eq(a[3],b[1])||eq(b[3],a[1]))&&positiveOverlap([a[0],a[2]],[b[0],b[2]]));}
  function connected(rects){const seen=new Set([0]),todo=[0];while(todo.length){const i=todo.pop();for(let j=0;j<rects.length;j++)if(!seen.has(j)&&touchesEdge(rects[i],rects[j])){seen.add(j);todo.push(j);}}return seen.size===rects.length;}
  function coverage(group){
    const all=[...group.support,...[...group.openings.values()].flatMap(o=>[...o.domains.flat(),...o.fragments])];
    const axis=k=>[...new Map(all.flatMap(r=>[r[k],r[k+2]]).map(x=>[key(x),x])).values()].sort(compare);
    const xs=axis(0),ys=axis(1),W=xs.length-1,H=ys.length-1;
    if(W*H>50000)missing('certificate-size-limit','coverage');
    const xm=new Map(xs.map((x,i)=>[key(x),i])),ym=new Map(ys.map((x,i)=>[key(x),i]));
    const mark=(rects,at)=>{const mask=new Uint8Array(W*H);for(const r of rects)for(let y=ym.get(key(r[1]));y<ym.get(key(r[3]));y++)for(let x=xm.get(key(r[0]));x<xm.get(key(r[2]));x++){const i=y*W+x;if(mask[i])bad('overlapping-geometry',at);mask[i]=1;}return mask;};
    const canonical=mask=>{
      const result=[],active=new Map();
      for(let y=0;y<H;y++){
        const row=new Map();let x=0;
        while(x<W){if(!mask[y*W+x]){x++;continue;}const start=x;while(x<W&&mask[y*W+x])x++;
          const k=key(xs[start])+':'+key(xs[x]),prior=active.get(k);
          const r=prior&&eq(prior[3],ys[y])?prior:[xs[start],ys[y],xs[x],ys[y+1]];r[3]=ys[y+1];row.set(k,r);if(r!==prior)result.push(r);
        }active.clear();for(const [k,r]of row)active.set(k,r);
      }
      return result.map(r=>r.map(key)).sort((a,b)=>a.join(',').localeCompare(b.join(',')));
    };
    const support=mark(group.support,'support');if(!connected(group.support))bad('disconnected-support-domain','support');
    const used=new Uint8Array(W*H),out=[];
    for(const o of [...group.openings.values()].sort((a,b)=>a.id.localeCompare(b.id))){
      const domain=mark(o.domains[0],'opening.'+o.id+'.domain'),fragments=mark(o.fragments,'opening.'+o.id+'.fragments');let area=Z;
      for(const definition of o.domains.slice(1)){const alternative=mark(definition,'opening.'+o.id+'.domain');if(alternative.some((v,i)=>v!==domain[i]))bad('opening-definition-conflict','opening.'+o.id);}
      for(let i=0;i<domain.length;i++){
        if(domain[i]!==fragments[i])bad('incomplete-or-excess-fragment-coverage','opening.'+o.id);
        if(!domain[i])continue;if(!support[i])bad('opening-outside-support-or-in-hole','opening.'+o.id);if(used[i])bad('overlapping-openings','opening.'+o.id);used[i]=1;
        const x=i%W,y=Math.floor(i/W);area=add(area,mul(sub(xs[x+1],xs[x]),sub(ys[y+1],ys[y])));
      }
      out.push({id:o.id,sourceElementId:o.elementId,areaSquareMeters:key(area),domain:canonical(domain),fragmentSources:[...o.sources].sort()});
    }
    const supportArea=group.support.reduce((a,r)=>add(a,mul(sub(r[2],r[0]),sub(r[3],r[1]))),Z);
    return {openings:out,support:canonical(support),supportAreaSquareMeters:key(supportArea)};
  }
  function validate(input){
    try{
      if(!input||input.schema!=='keo.facade-contract/v1')missing('unsupported-or-missing-contract','schema');
      const ctx=exactSource(input),rooms=new Map();
      for(const room of list(input.rooms,'rooms',128)){
        const id=text(room.id,'room.id');if(rooms.has(id))bad('duplicate-room','rooms');
        const refs=new Map();for(const b of list(room.boundaries,'room.boundaries')){
          const tuple=JSON.stringify([text(b.hostId,'boundary.hostId'),text(b.faceId,'boundary.faceId')]);
          if(refs.has(tuple))bad('duplicate-boundary-reference','room.boundaries');
          text(b.sourceRef,'boundary.sourceRef');if(b.side!=='room-facing')missing('unknown-boundary-side','boundary.side');
          const normal=ctx.direction(vector(b.inwardNormal,'boundary.inwardNormal'));if(!eq(dot(normal,normal),ONE))bad('nonunit-boundary-normal','boundary.inwardNormal');
          refs.set(tuple,{sourceRef:b.sourceRef,normal});
        }rooms.set(id,refs);
      }
      const groups=new Map(),records=new Set(),patchSources=new Set(),glazingSources=new Set();let count=0;
      for(const face of list(input.faces,'faces',128)){
        const at='face.'+text(face.recordId,'face.recordId');if(records.has(face.recordId))bad('duplicate-record',at);records.add(face.recordId);
        if(Object.prototype.hasOwnProperty.call(face,'scope')){
          if(!face.scope||typeof face.scope!=='object'||Array.isArray(face.scope))missing('malformed-record-scope',at+'.scope');
          for(const [name,value]of Object.entries(ctx.scope))if(face.scope[name]!==value)bad('record-scope-mismatch',at+'.scope.'+name);
        }
        const owner=text(face.ownerId,at+'.ownerId'),id=text(face.faceId,at+'.faceId'),roomId=text(face.roomId,at+'.roomId'),identity=JSON.stringify([...Object.values(ctx.scope),owner,id,roomId]);
        const boundary=rooms.get(roomId)?.get(JSON.stringify([owner,id]));if(!boundary)bad('unbound-native-room-face',at);
        if(!face.association)missing('missing-native-room-association',at);
        if(face.association?.roomId!==roomId||face.association?.sourceRef!==boundary.sourceRef)bad('room-association-mismatch',at);
        const F=frame(face.frame,ctx,at+'.frame');if(!same(F.normal,boundary.normal))bad('room-facing-normal-mismatch',at);
        let g=groups.get(identity);if(!g){g={owner,id,roomId,F,support:[],openings:new Map(),recordIds:[]};groups.set(identity,g);}
        if(!same(F.normal,g.F.normal)||!eq(F.offset,g.F.offset)||!same(F.u,g.F.u)||!same(F.v,g.F.v))bad('same-face-id-geometry-conflict',at);
        g.recordIds.push(face.recordId);
        for(const p of list(face.patches,at+'.patches')){
          const k=sourceKey(p.source,owner,at+'.patch.source');if(patchSources.has(k))bad('reused-support-fragment',at);patchSources.add(k);
          g.support.push(rectangle(p.rect,F,g.F,ctx.unit,at+'.patch.rect'));if(++count>2048)missing('certificate-size-limit','geometry');
        }
        if(!Array.isArray(face.openings))missing('missing-opening-list',at);
        if(face.openings.length>512)missing('certificate-size-limit',at);
        for(const raw of face.openings){
          const openingId=text(raw.id,at+'.opening.id'),elementId=text(raw.elementId,at+'.opening.elementId');
          const domain=list(raw.domain,at+'.opening.domain').map(r=>rectangle(r,F,g.F,ctx.unit,at+'.opening.domain'));
          count+=domain.length;if(count>2048)missing('certificate-size-limit','geometry');
          let o=g.openings.get(openingId);if(!o){o={id:openingId,elementId,domains:[],fragments:[],sources:new Set()};g.openings.set(openingId,o);}
          if(o.elementId!==elementId)bad('opening-definition-conflict',at+'.opening');o.domains.push(domain);
          for(const f of list(raw.fragments,at+'.opening.fragments')){
            const k=sourceKey(f.source,elementId,at+'.fragment.source');if(glazingSources.has(k))bad('reused-glazing-fragment',at);glazingSources.add(k);o.sources.add(k);
            o.fragments.push(rectangle(f.rect,F,g.F,ctx.unit,at+'.fragment.rect'));if(++count>2048)missing('certificate-size-limit','geometry');
          }
        }
        if(count>2048)missing('certificate-size-limit','geometry');
      }
      const result=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([identity,g])=>({identity,ownerId:g.owner,faceId:g.id,roomId:g.roomId,recordIds:g.recordIds.sort(),plane:{normal:g.F.normal.map(key),offset:key(g.F.offset)},frame:{origin:g.F.zero.map(key),u:g.F.u.map(key),v:g.F.v.map(key)},...coverage(g),connected:true}));
      return {state:'confirmed',reference:'supplied-exact-contract-only',sourceTruthVerified:false,normativeConfirmed:false,physicalFacadeClassification:'not-inferred-between-native-identities',scope:ctx.scope,groups:result};
    }catch(e){if(e?.contractFailure)return {state:e.state,reason:e.code,at:e.at,groups:[],sourceTruthVerified:false,normativeConfirmed:false};return {state:'insufficient-data',reason:'malformed-contract',groups:[],sourceTruthVerified:false,normativeConfirmed:false};}
  }
  return {validate};
})();
if(typeof module!=='undefined')module.exports=BimFacadeContract;
