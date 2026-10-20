/* Continuous first-boundary study along a supplied panel segment at one height.
   Exact rational lower envelopes on the projected binary64 coordinates. No ray
   spacing, nearest-centroid assignment, distance cutoff, opacity or KEO formula.
   Loops must already be validated sections; bounds of unavailable geometry may
   be supplied explicitly as kind 'uncertain', never as a physical wall. */
const KeoSectionRibbon=(()=>{
  const abs=n=>n<0n?-n:n,gcd=(a,b)=>{a=abs(a);b=abs(b);while(b){const t=a%b;a=b;b=t;}return a;};
  const q=(a,b=1n)=>{if(!b)throw Error('zero-denominator');if(b<0n){a=-a;b=-b;}const g=gcd(a,b);return [a/g,b/g];};
  const add=(a,b)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),sub=(a,b)=>q(a[0]*b[1]-b[0]*a[1],a[1]*b[1]);
  const mul=(a,b)=>q(a[0]*b[0],a[1]*b[1]),div=(a,b)=>q(a[0]*b[1],a[1]*b[0]);
  const cmp=(a,b)=>{const d=a[0]*b[1]-b[0]*a[1];return d>0n?1:d<0n?-1:0;},zero=q(0n),two=q(2n);
  const min=(a,b)=>cmp(a,b)<0?a:b,max=(a,b)=>cmp(a,b)>0?a:b,mid=(a,b)=>div(add(a,b),two),key=x=>x.join('/');
  function binary(x){const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x);const bits=b.getBigUint64(0),e=Number((bits>>52n)&2047n),f=bits&((1n<<52n)-1n),m=(bits>>63n?-1n:1n)*(e?f+(1n<<52n):f),p=e?e-1075:-1074;return p>=0?q(m<<BigInt(p)):q(m,1n<<BigInt(-p));}
  function number(a){if(!a[0])return 0;const n=abs(a[0]),ns=Math.max(0,n.toString(2).length-53),ds=Math.max(0,a[1].toString(2).length-53);return (a[0]<0n?-1:1)*Number(n>>BigInt(ns))/Number(a[1]>>BigInt(ds))*2**(ns-ds);}
  const value=(f,x)=>add(mul(f.m,x),f.b);
  const sameLine=(a,b)=>cmp(a.m,b.m)===0&&cmp(a.b,b.b)===0;
  const sameOwners=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  function inspect({segment,regions,scope,maxEdges=30000,maxOperations=3000000,maxCells=20000}={}){
    const base={reference:'continuous-two-sided-section-lower-envelope',ownershipVerified:false,opacityVerified:false,normativeVerified:false,sourceAccuracyVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason,sides:[]});
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
    if(!Array.isArray(segment)||segment.length!==2||!segment.every(point)||!scope||!point(scope.lo)||!point(scope.hi)||scope.lo.some((v,k)=>v>=scope.hi[k]))return fail('invalid-panel-or-scope');
    if(!Array.isArray(regions)||regions.some(r=>typeof r.id!=='string'||!['room','structure','uncertain'].includes(r.kind)||!Array.isArray(r.loops)||!r.loops.length||r.loops.some(l=>!Array.isArray(l)||l.length<3||!l.every(point)))||new Set(regions.map(r=>r.id)).size!==regions.length||regions.some(r=>r.id==='__scope__'))return fail('invalid-section-regions');
    if(![maxEdges,maxOperations,maxCells].every(n=>Number.isSafeInteger(n)&&n>0))return fail('invalid-resource-limits');
    if(regions.reduce((n,r)=>n+r.loops.reduce((n,l)=>n+l.length,0),0)>maxEdges)return fail('ribbon-edge-limit');
    const origin=segment[0],delta=segment[1].map((v,k)=>v-origin[k]),width=Math.hypot(...delta);
    if(!width||!Number.isFinite(width))return fail('invalid-panel-width');
    if(segment.some(p=>p.some((v,k)=>v<=scope.lo[k]||v>=scope.hi[k])))return fail('panel-not-strictly-inside-scope');
    const u=delta.map(v=>v/width),normal=[-u[1],u[0]],end=binary(width),cuts=new Map([[key(zero),zero],[key(end),end]]);
    const transform=p=>{const x=p[0]-origin[0],y=p[1]-origin[1],v=[x*u[0]+y*u[1],x*normal[0]+y*normal[1]];if(!v.every(Number.isFinite))throw Error('nonfinite-projection');return v.map(binary);};
    let operations=0;const tick=()=>{if(++operations>maxOperations)throw Error('ribbon-operation-limit');};
    const cut=x=>{if(cmp(x,zero)>0&&cmp(x,end)<0)cuts.set(key(x),x);};
    try{
      const scopeLoop=[[scope.lo[0],scope.lo[1]],[scope.hi[0],scope.lo[1]],[scope.hi[0],scope.hi[1]],[scope.lo[0],scope.hi[1]]];
      const rows=[...regions,{id:'__scope__',kind:'scope',loops:[scopeLoop]}].map(r=>({...r,loops:r.loops.map(l=>l.map(transform))}));
      const byId=new Map(rows.map(r=>[r.id,r])),pieces=[[],[]],originCandidates=[];
      for(const r of rows){
        let dMin=null,dMax=null;
        for(const l of r.loops)for(let i=0;i<l.length;i++){
          tick();const a=l[i],b=l[(i+1)%l.length];dMin=dMin===null?min(a[1],b[1]):min(dMin,min(a[1],b[1]));dMax=dMax===null?max(a[1],b[1]):max(dMax,max(a[1],b[1]));
          if(cmp(a[1],zero)===0)cut(a[0]);
          if(cmp(b[1],zero)===0)cut(b[0]);
          if(cmp(a[0],b[0])===0){if(cmp(min(a[1],b[1]),zero)<=0&&cmp(max(a[1],b[1]),zero)>=0)cut(a[0]);continue;}
          const lo=max(zero,min(a[0],b[0])),hi=min(end,max(a[0],b[0]));if(cmp(lo,hi)>=0)continue;
          const m=div(sub(b[1],a[1]),sub(b[0],a[0])),f={m,b:sub(a[1],mul(m,a[0])),ids:[r.id]};
          const intervals=[lo,hi];if(cmp(m,zero)){const root=div(sub(zero,f.b),m);if(cmp(root,lo)>0&&cmp(root,hi)<0){intervals.splice(1,0,root);cut(root);}}
          for(let j=1;j<intervals.length;j++){
            const x=intervals[j-1],y=intervals[j],sign=cmp(value(f,mid(x,y)),zero);
            if(!sign){cut(x);cut(y);continue;}
            pieces[sign>0?1:0].push({lo:x,hi:y,f:sign>0?f:{m:sub(zero,f.m),b:sub(zero,f.b),ids:f.ids}});
          }
        }
        if(r.kind!=='scope'&&cmp(dMin,zero)<=0&&cmp(dMax,zero)>=0)originCandidates.push(r);
      }
      function envelope(inputs){
        let cells=[{lo:zero,hi:end,f:null}];
        for(const p of inputs){
          const next=[];
          const push=c=>{if(cmp(c.lo,c.hi)>=0)return;const last=next.at(-1);if(last&&cmp(last.hi,c.lo)===0&&((!last.f&&!c.f)||(last.f&&c.f&&sameLine(last.f,c.f)&&sameOwners(last.f.ids,c.f.ids))))last.hi=c.hi;else next.push(c);};
          for(const c of cells){
            tick();const lo=max(c.lo,p.lo),hi=min(c.hi,p.hi);if(cmp(lo,hi)>=0){push(c);continue;}
            if(cmp(c.lo,lo)<0)push({...c,hi:lo});
            const split=[lo,hi];if(c.f&&cmp(p.f.m,c.f.m)){const cross=div(sub(c.f.b,p.f.b),sub(p.f.m,c.f.m));if(cmp(cross,lo)>0&&cmp(cross,hi)<0)split.splice(1,0,cross);}
            for(let j=1;j<split.length;j++){
              const a=split[j-1],b=split[j],order=c.f?cmp(value(p.f,mid(a,b)),value(c.f,mid(a,b))):-1;
              const f=order<0?p.f:order>0?c.f:{...p.f,ids:[...new Set([...p.f.ids,...c.f.ids])].sort()};push({lo:a,hi:b,f});
            }
            if(cmp(hi,c.hi)<0)push({...c,lo:hi});
          }
          if(next.length>maxCells)throw Error('ribbon-cell-limit');cells=next;
        }
        return cells;
      }
      const originLocation=(r,x)=>{
        let inside=false;
        for(const l of r.loops)for(let i=0;i<l.length;i++){
          tick();const a=l[i],b=l[(i+1)%l.length],cross=sub(mul(sub(b[0],a[0]),sub(zero,a[1])),mul(sub(b[1],a[1]),sub(x,a[0])));
          if(!cmp(cross,zero)&&cmp(x,min(a[0],b[0]))>=0&&cmp(x,max(a[0],b[0]))<=0&&cmp(min(a[1],b[1]),zero)<=0&&cmp(max(a[1],b[1]),zero)>=0)return 'boundary';
          if((cmp(a[1],zero)>0)!==(cmp(b[1],zero)>0)&&cmp(cross,zero)*cmp(b[1],a[1])>0)inside=!inside;
        }return inside?'inside':'outside';
      };
      const sides=[];
      for(let side=0;side<2;side++){
        const all=envelope(pieces[side]),room=envelope(pieces[side].filter(p=>byId.get(p.f.ids[0]).kind==='room')),structure=envelope(pieces[side].filter(p=>['structure','uncertain'].includes(byId.get(p.f.ids[0]).kind))),limit=envelope(pieces[side].filter(p=>p.f.ids[0]==='__scope__'));
        const localCuts=new Map(cuts);for(const env of [all,room,structure,limit])for(const c of env){localCuts.set(key(c.lo),c.lo);localCuts.set(key(c.hi),c.hi);}
        // A room envelope can cross the scope boundary without changing the
        // global first hit (e.g. a nearer wall); split this comparison as well.
        for(const channel of [room,structure])for(const a of channel)for(const b of limit){tick();if(!a.f||!b.f||!cmp(a.f.m,b.f.m))continue;const lo=max(a.lo,b.lo),hi=min(a.hi,b.hi);if(cmp(lo,hi)>=0)continue;const x=div(sub(b.f.b,a.f.b),sub(a.f.m,b.f.m));if(cmp(x,lo)>0&&cmp(x,hi)<0)localCuts.set(key(x),x);}
        const sorted=[...localCuts.values()].sort(cmp);if(sorted.length>maxCells)throw Error('ribbon-cell-limit');
        const at=(env,x)=>{let lo=0,hi=env.length;while(lo<hi){tick();const k=(lo+hi)>>1,c=env[k];if(cmp(x,c.lo)<=0)hi=k;else if(cmp(x,c.hi)>=0)lo=k+1;else return c.f;}return null;};
        const evidence=(f,a,b)=>f?{ids:f.ids.filter(id=>id!=='__scope__'),kinds:[...new Set(f.ids.map(id=>byId.get(id).kind))].sort(),distanceRange:[number(min(value(f,a),value(f,b))),number(max(value(f,a),value(f,b)))]}:null;
        const cells=[];
        for(let i=1;i<sorted.length;i++){
          tick();const a=sorted[i-1],b=sorted[i],x=mid(a,b),first=at(all,x),candidate=at(room,x),barrier=at(structure,x),boundary=at(limit,x);
          const originRegions=originCandidates.map(r=>({id:r.id,kind:r.kind,location:originLocation(r,x)})).filter(r=>r.location!=='outside').sort((a,b)=>a.id.localeCompare(b.id));
          const within=!!candidate&&!!boundary&&cmp(value(candidate,x),value(boundary,x))<0;
          const barrierWithin=!!barrier&&!!boundary&&cmp(value(barrier,x),value(boundary,x))<0;
          cells.push({range:[number(a),number(b)],exactRange:[key(a),key(b)],first:evidence(first,a,b),nearestRoom:within?evidence(candidate,a,b):null,nearestStructure:barrierWithin?evidence(barrier,a,b):null,originRegions,status:originRegions.length?'panel-intersects-section':first?.ids.length===1&&first.ids[0]==='__scope__'?'scope-exit':'first-boundary',roundedDegenerate:number(a)>=number(b)});
        }
        sides.push({sign:side?1:-1,cells});
      }
      return {...base,status:'ribbon',segment:segment.map(p=>p.slice()),along:u,normal,width,scope,sides,operations,arithmetic:'exact-rational-on-rounded-projection',sectionOnly:true};
    }catch(e){return fail(String(e.message||e));}
  }
  return {inspect};
})();
if(typeof module!=='undefined')module.exports=KeoSectionRibbon;
