/* Union of independently closed planar material regions (even/odd loops).
   Exact rational predicates/intersections on supplied binary64 coordinates.
   No grid, snapping, tolerance welding, deletion of small loops or AI.
   Output coordinates are rounded for display; source accuracy is not proven.
   Point-touching output boundaries are deliberately rejected, not healed. */
const BimNativeSectionUnion=(()=>{
  const abs=n=>n<0n?-n:n;
  function gcd(a,b){a=abs(a);b=abs(b);while(b){const t=a%b;a=b;b=t;}return a;}
  function q(n,d=1n){if(!d)throw Error('zero-rational-denominator');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return [n/g,d/g];}
  const add=(a,b)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
  const sub=(a,b)=>q(a[0]*b[1]-b[0]*a[1],a[1]*b[1]);
  const mul=(a,b)=>q(a[0]*b[0],a[1]*b[1]);
  const div=(a,b)=>q(a[0]*b[1],a[1]*b[0]);
  const cmp=(a,b)=>{const d=a[0]*b[1]-b[0]*a[1];return d>0n?1:d<0n?-1:0;};
  const zero=[0n,1n],one=[1n,1n],half=[1n,2n];
  const vec=(a,b)=>[sub(a[0],b[0]),sub(a[1],b[1])];
  const cross=(a,b)=>sub(mul(a[0],b[1]),mul(a[1],b[0]));
  const orient=(a,b,c)=>cmp(cross(vec(b,a),vec(c,a)),zero);
  const pc=(a,b)=>cmp(a[0],b[0])||cmp(a[1],b[1]);
  const pk=p=>p.map(c=>c.join('/')).join(',');
  const same=(a,b)=>pc(a,b)===0;
  const between=(a,b,p)=>cmp(p,a)*cmp(p,b)<=0;
  const on=(a,b,p)=>!orient(a,b,p)&&between(a[0],b[0],p[0])&&between(a[1],b[1],p[1]);
  function binary(x){
    const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x);
    const bits=b.getBigUint64(0),sign=(bits>>63n)?-1n:1n,e=Number((bits>>52n)&2047n),f=bits&((1n<<52n)-1n);
    const m=sign*(e?f+(1n<<52n):f),power=e?e-1075:-1074;
    return power>=0?q(m<<BigInt(power)):q(m,1n<<BigInt(-power));
  }
  function number(a){
    if(!a[0])return 0;
    const n=abs(a[0]),ns=Math.max(0,n.toString(2).length-53),ds=Math.max(0,a[1].toString(2).length-53);
    return (a[0]<0n?-1:1)*Number(n>>BigInt(ns))/Number(a[1]>>BigInt(ds))*2**(ns-ds);
  }
  function area(loop){let a=zero;for(let i=1;i+1<loop.length;i++)a=add(a,cross(vec(loop[i],loop[0]),vec(loop[i+1],loop[0])));return mul(a,half);}
  function locate(loops,p){
    let inside=false;
    for(const l of loops)for(let i=0;i<l.length;i++){
      const a=l[i],b=l[(i+1)%l.length];if(on(a,b,p))return 'boundary';
      if((cmp(a[1],p[1])>0)!==(cmp(b[1],p[1])>0)){
        const side=orient(a,b,p);if(side*(cmp(b[1],a[1]))>0)inside=!inside;
      }
    }return inside?'inside':'outside';
  }
  function meet(a,b,c,d){
    const r=vec(b,a),s=vec(d,c),den=cross(r,s),ca=vec(c,a);
    if(cmp(den,zero)){
      const t=div(cross(ca,s),den),u=div(cross(ca,r),den);
      if(cmp(t,zero)<0||cmp(t,one)>0||cmp(u,zero)<0||cmp(u,one)>0)return [];
      return [[add(a[0],mul(t,r[0])),add(a[1],mul(t,r[1]))]];
    }
    if(cmp(cross(ca,r),zero))return [];
    const points=[a,b,c,d].filter(p=>on(a,b,p)&&on(c,d,p));return [...new Map(points.map(p=>[pk(p),p])).values()];
  }
  function union({regions,maxSegments=4096,maxOperations=2000000}={}){
    const base={reference:'union-of-supplied-planar-regions',coordinateArithmetic:'exact-binary-rational; rounded-output',sourceAccuracyVerified:false,normativeVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason,loops:[]});
    const valid=l=>Array.isArray(l)&&l.length>=3&&l.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
    if(!Array.isArray(regions)||!regions.length||regions.some(r=>!Array.isArray(r)||!r.length||r.some(l=>!valid(l)))||!Number.isSafeInteger(maxSegments)||maxSegments<3||!Number.isSafeInteger(maxOperations)||maxOperations<1)return fail('invalid-section-union-input');
    if(regions.reduce((n,r)=>n+r.reduce((s,l)=>s+l.length,0),0)>maxSegments)return fail('section-union-segment-limit');
    let operations=0;const tick=()=>{if(++operations>maxOperations)throw Error('section-union-operation-limit');};
    try{
      const groups=regions.map(r=>r.map(l=>l.map(p=>p.map(binary)))),segments=[];
      for(let g=0;g<groups.length;g++)for(let k=0;k<groups[g].length;k++){
        const l=groups[g][k];if(!cmp(area(l),zero))return fail('degenerate-input-loop');
        // Depth fixes winding of both external and internal boundaries.
        const locations=groups[g].map((other,j)=>j===k?'outside':locate([other],l[0]));
        if(locations.includes('boundary'))return fail('contact-within-input-region');
        const depth=locations.filter(v=>v==='inside').length;
        if((cmp(area(l),zero)>0)!==(depth%2===0))l.reverse();
        for(let i=0;i<l.length;i++){
          const a=l[i],b=l[(i+1)%l.length];if(same(a,b))return fail('duplicate-input-vertex');
          const original=[a,b].map(p=>p.map(number));
          segments.push({a,b,g,k,i,n:l.length,points:new Map([[pk(a),a],[pk(b),b]]),box:[Math.min(original[0][0],original[1][0]),Math.max(original[0][0],original[1][0]),Math.min(original[0][1],original[1][1]),Math.max(original[0][1],original[1][1])]});
        }
      }
      segments.sort((a,b)=>a.box[0]-b.box[0]);
      for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
        tick();const a=segments[i],b=segments[j];if(b.box[0]>a.box[1])break;
        if(b.box[2]>a.box[3]||a.box[2]>b.box[3])continue;
        const points=meet(a.a,a.b,b.a,b.b);if(!points.length)continue;
        const adjacent=a.g===b.g&&a.k===b.k&&(Math.abs(a.i-b.i)===1||Math.abs(a.i-b.i)===a.n-1);
        if(a.g===b.g&&!(adjacent&&points.length===1&&(same(points[0],a.a)||same(points[0],a.b))&&(same(points[0],b.a)||same(points[0],b.b))))return fail('contact-within-input-region');
        for(const p of points){a.points.set(pk(p),p);b.points.set(pk(p),p);}
      }
      const atoms=new Map();
      for(const s of segments){
        const ps=[...s.points.values()].sort(pc),forward=pc(s.a,s.b)<0;
        for(let i=1;i<ps.length;i++){
          tick();const a=ps[i-1],b=ps[i],id=pk(a)+'|'+pk(b);
          if(!atoms.has(id))atoms.set(id,{a,b,owners:new Map()});const atom=atoms.get(id);
          if(atom.owners.has(s.g))return fail('duplicate-boundary-within-region');atom.owners.set(s.g,forward);
        }
      }
      const boundary=[];
      for(const atom of atoms.values()){
        let left=false,right=false;const mid=atom.a.map((v,i)=>mul(add(v,atom.b[i]),half));
        for(let g=0;g<groups.length;g++){
          // Bound point-in-polygon work, not only pair construction.
          for(const l of groups[g]){operations+=l.length;if(operations>maxOperations)throw Error('section-union-operation-limit');}
          if(atom.owners.has(g)){if(atom.owners.get(g))left=true;else right=true;}
          else{const loc=locate(groups[g],mid);if(loc==='boundary')return fail('unresolved-coincident-boundary');if(loc==='inside')left=right=true;}
          if(left&&right)break;
        }
        if(left!==right)boundary.push(left?[atom.a,atom.b]:[atom.b,atom.a]);
      }
      const nodes=new Map();
      for(let i=0;i<boundary.length;i++)for(let end=0;end<2;end++){
        const p=boundary[i][end],id=pk(p);if(!nodes.has(id))nodes.set(id,{p,in:[],out:[]});nodes.get(id)[end?'in':'out'].push(i);
      }
      if(!boundary.length||[...nodes.values()].some(n=>n.in.length!==1||n.out.length!==1))return fail('point-contact-or-open-union-boundary');
      const exact=[],used=new Set();
      for(let i=0;i<boundary.length;i++)if(!used.has(i)){
        let next=i;const loop=[];
        do{if(used.has(next))return fail('invalid-union-cycle');used.add(next);loop.push(boundary[next][0]);next=nodes.get(pk(boundary[next][1])).out[0];}while(next!==i);
        if(loop.length<3||!cmp(area(loop),zero))return fail('degenerate-union-boundary');exact.push(loop);
      }
      const rounded=new Map(),loops=exact.map(l=>l.map(p=>{
        const out=p.map(number),key=JSON.stringify(out),original=pk(p);
        if(out.some(x=>!Number.isFinite(x))||(rounded.has(key)&&rounded.get(key)!==original))throw Error('union-output-rounding-collapse');rounded.set(key,original);return out;
      }));
      // Rounding for downstream consumers must not turn separated boundaries
      // into crossing/touching ones or reverse a small feature's orientation.
      const roundLoops=loops.map(l=>l.map(p=>p.map(binary))),roundEdges=[];
      for(let k=0;k<roundLoops.length;k++){
        const l=roundLoops[k];if(cmp(area(l),zero)!==cmp(area(exact[k]),zero))return fail('union-output-rounding-orientation');
        for(let i=0;i<l.length;i++){const a=loops[k][i],b=loops[k][(i+1)%l.length];roundEdges.push({a:l[i],b:l[(i+1)%l.length],k,i,n:l.length,box:[Math.min(a[0],b[0]),Math.max(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[1],b[1])]});}
      }
      roundEdges.sort((a,b)=>a.box[0]-b.box[0]);
      for(let i=0;i<roundEdges.length;i++)for(let j=i+1;j<roundEdges.length;j++){
        tick();const a=roundEdges[i],b=roundEdges[j];if(b.box[0]>a.box[1])break;if(a.box[2]>b.box[3]||b.box[2]>a.box[3])continue;
        const points=meet(a.a,a.b,b.a,b.b),adjacent=a.k===b.k&&(Math.abs(a.i-b.i)===1||Math.abs(a.i-b.i)===a.n-1);
        if(points.length&&!(adjacent&&points.length===1&&(same(points[0],a.a)||same(points[0],a.b))&&(same(points[0],b.a)||same(points[0],b.b))))return fail('union-output-rounding-contact');
      }
      const contours=exact.map((l,i)=>({points:loops[i],hole:cmp(area(l),zero)<0,area:Math.abs(number(area(l)))}));
      const sum=number(exact.reduce((s,l)=>add(s,area(l)),zero));if(!(sum>0&&Number.isFinite(sum)))return fail('invalid-union-area');
      return {...base,status:'closed-union',loops,contours,area:sum,operations,inputRegions:regions.length,inputSegments:segments.length};
    }catch(e){return fail(e.message);}
  }
  return {union};
})();
if(typeof module!=='undefined')module.exports=BimNativeSectionUnion;
