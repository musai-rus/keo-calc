/* Research: source boundaries certify a rectangle; raster cells are never filled. */
const BimRectangles = (function () {
  const finite=Number.isFinite;
  const normalized=s=>s[0]<s[2]||s[0]===s[2]&&s[1]<=s[3]?s.slice():[s[2],s[3],s[0],s[1]];
  const sorted=ss=>ss.map(normalized).sort((a,b)=>{for(let k=0;k<4;k++)if(a[k]!==b[k])return a[k]-b[k];return 0});
  function nominal({segments,runs,grid,containsPoint,paintSegments}) {
    const fail=error=>({error,frame:null});
    if(!Array.isArray(segments)||!segments.length||segments.some(s=>!Array.isArray(s)||s.length!==4||!s.every(finite))||!Array.isArray(runs)||!runs.length||!grid||typeof containsPoint!=='function'||typeof paintSegments!=='function') return fail('Нет исходных отрезков для подтверждения прямоугольника.');
    const {cell,minx,miny,W,H}=grid;
    if(![cell,minx,miny,W,H].every(finite)||!(cell>0)) return fail('Нет согласованной сетки исходного среза.');
    const centers=runs.flatMap(q=>[[q[0]+cell/2,q[2]+cell/2],[q[1]-cell/2,q[2]+cell/2],[q[1]-cell/2,q[3]-cell/2],[q[0]+cell/2,q[3]-cell/2]]);
    const xs=centers.map(p=>p[0]),ys=centers.map(p=>p[1]),bb=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    // Search radius only selects source segments. It does not allow gaps,
    // erase obstacles, or change a Room matching tolerance.
    const search=4*cell,eps=128*Number.EPSILON*Math.max(1,...bb.map(Math.abs));
    const ss=sorted(segments.filter(s=>Math.max(s[0],s[2])>=bb[0]-search&&Math.min(s[0],s[2])<=bb[2]+search&&Math.max(s[1],s[3])>=bb[1]-search&&Math.min(s[1],s[3])<=bb[3]+search));
    const angles=[];
    for(const s of ss)if(Math.hypot(s[2]-s[0],s[3]-s[1])>eps){const a=((Math.atan2(s[3]-s[1],s[2]-s[0])+Math.PI/4)%(Math.PI/2)+Math.PI/2)%(Math.PI/2)-Math.PI/4;if(!angles.some(b=>Math.abs(a-b)<eps))angles.push(a)}
    angles.sort((a,b)=>a-b);
    const accepted=[];
    for(const angle of angles) {
      const u=[Math.cos(angle),Math.sin(angle)],v=[-u[1],u[0]],local=p=>[p[0]*u[0]+p[1]*u[1],p[0]*v[0]+p[1]*v[1]],world=p=>[p[0]*u[0]+p[1]*v[0],p[0]*u[1]+p[1]*v[1]];
      const cs=centers.map(local),lo=[Math.min(...cs.map(p=>p[0])),Math.min(...cs.map(p=>p[1]))],hi=[Math.max(...cs.map(p=>p[0])),Math.max(...cs.map(p=>p[1]))];
      const lines=ss.map(s=>[local(s.slice(0,2)),local(s.slice(2))]);
      const planes=[[],[]];for(const [a,b]of lines)for(let k=0;k<2;k++)if(Math.abs(a[k]-b[k])<=eps&&Math.abs(a[1-k]-b[1-k])>eps)planes[k].push((a[k]+b[k])/2);
      const low=planes.map((ps,k)=>Math.max(-Infinity,...ps.filter(x=>x<lo[k]))),high=planes.map((ps,k)=>Math.min(Infinity,...ps.filter(x=>x>hi[k])));
      if(!low.concat(high).every(finite)||low.some((x,k)=>!(high[k]>x)))continue;
      const corners=[[low[0],low[1]],[high[0],low[1]],[high[0],high[1]],[low[0],high[1]]].map(world);
      if(corners.some(p=>p[0]<bb[0]-search||p[0]>bb[2]+search||p[1]<bb[1]-search||p[1]>bb[3]+search))continue;
      const sides=[[],[],[],[]];let obstacle=false;
      const relevant=[];
      for(let j=0;j<lines.length;j++) {
        const [a,b]=lines[j];let t0=0,t1=1;
        for(let k=0;k<2;k++){const d=b[k]-a[k];if(Math.abs(d)<=eps){if(a[k]<low[k]-eps||a[k]>high[k]+eps){t0=1;t1=0;break}}else{const p=(low[k]-a[k])/d,q=(high[k]-a[k])/d;t0=Math.max(t0,Math.min(p,q));t1=Math.min(t1,Math.max(p,q))}}
        if(t1<t0)continue;
        const p=a.map((x,k)=>x+(b[k]-x)*t0),q=a.map((x,k)=>x+(b[k]-x)*t1);
        const on=[];for(let k=0;k<2;k++)for(let side=0;side<2;side++){const pos=side?high[k]:low[k];if(Math.abs(p[k]-pos)<=eps&&Math.abs(q[k]-pos)<=eps)on.push(k*2+side)}
        if(!on.length){obstacle=true;break}
        if(Math.hypot(p[0]-q[0],p[1]-q[1])>eps){for(const side of on){const k=1-Math.floor(side/2);sides[side].push([Math.min(p[k],q[k]),Math.max(p[k],q[k])])}relevant.push(ss[j])}
      }
      if(obstacle)continue;
      const covered=sides.every((ivs,side)=>{const k=1-Math.floor(side/2);let end=low[k];for(const [a,b]of ivs.sort((a,b)=>a[0]-b[0])){if(a>end+eps)return false;end=Math.max(end,b)}return end>=high[k]-eps});
      if(!covered)continue;
      const bx=corners.map(p=>p[0]),by=corners.map(p=>p[1]);
      const i0=Math.floor((Math.min(...bx)-minx)/cell)-1,i1=Math.ceil((Math.max(...bx)-minx)/cell)+1,j0=Math.floor((Math.min(...by)-miny)/cell)-1,j1=Math.ceil((Math.max(...by)-miny)/cell)+1;
      if(i0<0||j0<0||i1>=W||j1>=H)continue;
      // Preserve original segment subdivision and G.raster's exact sampling.
      // All source segments participate, including nearby outer wall skins.
      const blocked=new Set();
      paintSegments(segments,cell,minx,miny,(i,j)=>{if(i>=i0&&i<=i1&&j>=j0&&j<=j1)blocked.add(i+','+j)});
      let equal=true;
      for(let j=j0;j<=j1&&equal;j++)for(let i=i0;i<=i1;i++){const p=[minx+(i+.5)*cell,miny+(j+.5)*cell],q=local(p),expected=q.every((x,k)=>x>low[k]&&x<high[k])&&!blocked.has(i+','+j);if(expected!==containsPoint(p)){equal=false;break}}
      if(!equal)continue;
      let U=u,V=v,x0=low[0],y0=low[1],L=high[0]-low[0],B=high[1]-low[1];
      if(B>L){[U,V]=[V,[-U[0],-U[1]]];[x0,y0]=[low[1],-high[0]];[L,B]=[B,L]}
      if(U[0]<0){U=U.map(x=>-x);V=V.map(x=>-x);x0=-x0-L;y0=-y0-B}
      const O=[U[0]*x0+V[0]*y0,U[1]*x0+V[1]*y0];
      const frame={O,u:U,v:V,L,B,toLocal:p=>[(p[0]-O[0])*U[0]+(p[1]-O[1])*U[1],(p[0]-O[0])*V[0]+(p[1]-O[1])*V[1]],toWorld:p=>[O[0]+p[0]*U[0]+p[1]*V[0],O[1]+p[0]*U[1]+p[1]*V[1]]};
      accepted.push({frame,source:{kind:'slice-segments',segments:sorted(relevant),candidateSearchEpsilon:eps},lengthRange:{min:L-8*eps,max:L+8*eps,radius:8*eps}});
    }
    if(!accepted.length)return fail('Исходные границы не подтверждают прямоугольник без внутренних препятствий с той же полной маской.');
    const first=accepted[0];
    if(accepted.some(c=>Math.abs(c.frame.L-first.frame.L)>8*eps||Math.abs(c.frame.B-first.frame.B)>8*eps||Math.hypot(c.frame.O[0]-first.frame.O[0],c.frame.O[1]-first.frame.O[1])>8*eps))return fail('Исходные границы дают неоднозначную прямоугольную схему.');
    return {...first,error:''};
  }
  // An exact dyadic predicate closes the floating-point epsilon loophole.
  // Every finite JS number is an integer / 2^1074. No tolerance is used here.
  function integer(x){const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,x);const b=d.getBigUint64(0),exp=Number((b>>52n)&2047n),mant=(b&((1n<<52n)-1n))+(exp?1n<<52n:0n);return (b>>63n?-1n:1n)*(mant<<BigInt(exp?exp-1:0));}
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],minus=(a,b)=>a.map((x,k)=>x-b[k]);
  const frac=(n,d)=>d<0n?[-n,-d]:[n,d],cmp=(a,b)=>a[0]*b[1]-b[0]*a[1];
  function exactRectangle(segments,relevant) {
    const rs=relevant.map(s=>[[integer(s[0]),integer(s[1])],[integer(s[2]),integer(s[3])]]),axis=rs.map(([a,b])=>minus(b,a)).find(d=>d.some(x=>x!==0n));
    if(!axis)return false;const normal=[-axis[1],axis[0]],local=p=>[dot(p,axis),dot(p,normal)],lines=rs.map(s=>s.map(local));
    const low=[0,1].map(k=>lines.flat().reduce((m,p)=>p[k]<m?p[k]:m,lines[0][0][k])),high=[0,1].map(k=>lines.flat().reduce((m,p)=>p[k]>m?p[k]:m,lines[0][0][k]));
    if(low.some((x,k)=>high[k]<=x))return false;
    const sides=[[],[],[],[]];
    for(const [a,b]of lines){let found=false;for(let k=0;k<2;k++)for(let side=0;side<2;side++){const pos=side?high[k]:low[k];if(a[k]===pos&&b[k]===pos){const j=1-k;sides[k*2+side].push(a[j]<b[j]?[a[j],b[j]]:[b[j],a[j]]);found=true;}}if(!found)return false;}
    if(!sides.every((ss,i)=>{const k=1-Math.floor(i/2);let end=low[k];for(const [a,b]of ss.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)){if(a>end)return false;if(b>end)end=b;}return end===high[k];}))return false;
    // Exclude every original source segment, including points and epsilon-sized
    // features omitted by the nominal fit. Rational open clipping is exact.
    for(const s of segments){const a=local([integer(s[0]),integer(s[1])]),b=local([integer(s[2]),integer(s[3])]);
      if([a,b].some(p=>p.every((x,k)=>x>low[k]&&x<high[k])))return false;
      let left=[0n,1n],right=[1n,1n],possible=true;
      for(let k=0;k<2;k++){const d=b[k]-a[k];if(d===0n){if(a[k]<=low[k]||a[k]>=high[k]){possible=false;break;}}else{let p=frac(low[k]-a[k],d),q=frac(high[k]-a[k],d);if(cmp(p,q)>0n)[p,q]=[q,p];if(cmp(p,left)>0n)left=p;if(cmp(q,right)<0n)right=q;}}
      if(possible&&cmp(left,right)<0n)return false;
    }
    return {span:high.map((x,k)=>x-low[k]),norm:dot(axis,axis)};
  }
  function exactLengthRange(certificate) {
    if(typeof BimPrecision==='undefined'||!certificate||typeof certificate.norm!=='bigint'||certificate.norm<=0n||!Array.isArray(certificate.span)||certificate.span.length!==2||certificate.span.some(x=>typeof x!=='bigint'||x<0n))return null;
    const span=certificate.span.reduce((a,b)=>a>b?a:b);if(span===0n)return null;
    const squared=span*span,dv=new DataView(new ArrayBuffer(8)),value=bits=>{dv.setBigUint64(0,bits);return dv.getFloat64(0);};
    const compare=bits=>{const q=integer(value(bits));return q*q*certificate.norm-squared;};
    // Positive finite binary64 bit patterns have exactly the same order as
    // their values. Bisect that entire finite set; no fitted guess or step cap.
    let low=0n,high=0x7fefffffffffffffn;
    if(compare(high)<0n)return null; // The exact length exceeds finite binary64.
    while(high-low>1n){const mid=(low+high)>>1n,c=compare(mid);if(c===0n){const x=value(mid);return {min:x,max:x,radius:0,method:'exact integer square comparison'};}if(c<0n)low=mid;else high=mid;}
    const min=value(low),max=value(high);
    if(compare(high)===0n)return {min:max,max,radius:0,method:'exact integer square comparison'};
    return {min,max,radius:BimPrecision.next(max-min,true),method:'exact integer square comparison'};
  }
  function hull(points){const ps=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const half=xs=>{const h=[];for(const p of xs){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h;};return half(ps).slice(0,-1).concat(half(ps.slice().reverse()).slice(0,-1));}
  function provenanceSummary(p) {
    if(!p)return null;
    const es=Array.isArray(p.entries)?p.entries.filter(e=>e&&typeof e==='object'):[],vertices=es.flatMap(e=>Array.isArray(e.provenance?.vertices)?e.provenance.vertices.filter(Boolean):[]);
    const known=es.filter(e=>Array.isArray(e.bounds)&&e.bounds.length===4&&e.bounds.every(b=>Array.isArray(b)&&b.length===2&&b.every(finite)&&b[0]<=b[1]));
    return {v:p.v,reference:p.reference,reconstruction:p.reconstruction,complete:p.complete,reasons:p.reasons,segmentCount:es.length,
      decoders:[...new Set(vertices.map(v=>v.decoder).filter(Boolean))].sort(),decoderFormulas:[...new Set(vertices.map(v=>v.decoderFormula).filter(Boolean))].sort(),
      computationalBoundsKnown:known.length,computationalBoundsReference:'decoded positions and runtime transform/unit coefficients; excludes exporter reconstruction',
      unitScales:[...new Set(es.map(e=>e.provenance?.unitScale).filter(finite))],cutHeights:[...new Set(es.map(e=>e.provenance?.zM).filter(finite))],
      maxKnownCoordinateIntervalWidth:[0,1,2,3].map(k=>known.length?known.reduce((m,e)=>Math.max(m,e.bounds[k][1]-e.bounds[k][0]),0):null)};
  }
  function certify(args={}) {
    const p=args.precision,proof={state:'insufficient',reference:'source-model slice; rectangle containing all mask centers',reason:'unknown-precision',provenance:provenanceSummary(p)};
    const refuse=reason=>({error:reason,frame:null,source:undefined,lengthRange:null,geometryProof:proof});
    if(!args.grid||!Array.isArray(args.runs)||!args.runs.length||!Array.isArray(args.segments)||args.segments.some(s=>!Array.isArray(s)||s.length!==4||!s.every(finite))||!p||p.v!==1||p.complete!==true||!['exact','bounded'].includes(p.reconstruction)||!Array.isArray(p.entries)||p.entries.length!==args.segments.length||p.entries.some((e,i)=>!e||!e.provenance||!Array.isArray(e.bounds)||e.bounds.length!==4||e.bounds.some((b,k)=>!Array.isArray(b)||b.length!==2||!b.every(finite)||b[0]>args.segments[i][k]||b[1]<args.segments[i][k])))return refuse('Недостаточно данных: точность исходных границ или полнота среза неизвестна.');
    const h=args.grid.cell/2,centers=args.runs.flatMap(q=>[[q[0]+h,q[2]+h],[q[1]-h,q[2]+h],[q[1]-h,q[3]-h],[q[0]+h,q[3]-h]]),ch=hull(centers);
    // A rectangle containing all mask centers contains their convex hull.
    // A source point strictly inside it is an obstacle for every such rectangle.
    if(typeof BimPrecision!=='undefined'&&ch.length>=3){const P=BimPrecision;for(let i=0;i<p.entries.length;i++)for(const offset of [0,2]){const b=p.entries[i].bounds,point=[b[offset],b[offset+1]];
      const inside=ch.every((a,j)=>{const q=ch[(j+1)%ch.length],x=P.sub([q[0],q[0]],[a[0],a[0]]),y=P.sub([q[1],q[1]],[a[1],a[1]]),cross=P.sub(P.mul(x,P.sub(point[1],[a[1],a[1]])),P.mul(y,P.sub(point[0],[a[0],a[0]])));return cross[0]>0;});
      if(inside){proof.state='contradicted';proof.reason='source-obstacle-inside-center-hull';proof.witness={segment:i,endpoint:offset/2,bounds:point};return refuse('Противоречие: исходная преграда достоверно находится внутри выпуклой оболочки маски.');}
    }}
    if(p.reconstruction!=='exact'||p.entries.some((e,i)=>e.bounds.some((b,k)=>b[0]!==args.segments[i][k]||b[1]!==args.segments[i][k]))){proof.reason='nonzero-input-uncertainty';return refuse('Недостаточно данных: ненулевая погрешность совместима с прямоугольником, но не доказывает его.');}
    const fit=nominal(args);
    if(fit.error){proof.reason='no-complete-rectangle-certificate';return refuse(fit.error);}
    const certificate=exactRectangle(args.segments,fit.source.segments);
    if(!certificate){proof.reason='floating-fit-not-exact-proof';return refuse('Недостаточно данных: приблизительное совпадение сторон не является точным доказательством прямоугольника.');}
    const lengthRange=exactLengthRange(certificate);
    if(!lengthRange){proof.reason='length-interval-not-certified';return refuse('Недостаточно данных: не удалось доказать границы длины.');}
    const small=certificate.span.reduce((a,b)=>a<b?a:b),widthRange=exactLengthRange({...certificate,span:[small,small]});
    if(!widthRange){proof.reason='width-interval-not-certified';return refuse('Недостаточно данных: не удалось доказать границы ширины.');}
    const perimeterInterval=BimPrecision.mul([2,2],BimPrecision.add([lengthRange.min,lengthRange.max],[widthRange.min,widthRange.max]));
    const perimeterRange=perimeterInterval.every(finite)&&perimeterInterval[0]>0&&perimeterInterval[0]<=perimeterInterval[1]?{min:perimeterInterval[0],max:perimeterInterval[1]}:null;
    if(!perimeterRange){proof.reason='perimeter-interval-not-certified';return refuse('Недостаточно данных: не удалось доказать границы периметра.');}
    proof.state='confirmed';proof.reason='exact-dyadic-rectangle-and-full-raster';
    return {...fit,lengthRange,widthRange,perimeterRange,geometryProof:proof,source:{...fit.source,proof:'exact-dyadic-predicates',inputPrecision:args.precision}};
  }
  function certifyRegionPerimeters(R,segments,precision,paintSegments) {
    const status={confirmed:0,contradicted:0,insufficient:0,reason:''};
    if(!R||!Array.isArray(R.regs))return {...status,reason:'invalid-R-grid'};
    R.regs.forEach(r=>{if(r)delete r.perimeterEvidence;});
    // Most Viewer exports have unknown reconstruction precision. Do not scan
    // their full raster or substitute an inferred perimeter in that case.
    if(!precision||precision.v!==1||precision.reconstruction!=='exact'||precision.complete!==true)return R.perimeterStatus={...status,reason:'unknown-R-source-precision'};
    if(!Array.isArray(segments)||!segments.length||!Array.isArray(precision.entries)||precision.entries.length!==segments.length||segments.some((s,i)=>!Array.isArray(s)||s.length!==4||!s.every(finite)||!precision.entries[i]?.provenance||!Array.isArray(precision.entries[i].bounds)||precision.entries[i].bounds.length!==4||precision.entries[i].bounds.some((b,k)=>!Array.isArray(b)||b.length!==2||b[0]!==s[k]||b[1]!==s[k])))return R.perimeterStatus={...status,reason:'invalid-R-source-precision'};
    const {W,H,cell,minx,miny,lab}=R;
    if(!Number.isSafeInteger(W)||!Number.isSafeInteger(H)||W<=0||H<=0||!Number.isSafeInteger(W*H)||!lab||lab.length!==W*H||![cell,minx,miny].every(finite)||cell<=0||typeof paintSegments!=='function')return R.perimeterStatus={...status,reason:'invalid-R-grid'};
    const targets=R.regs.filter(r=>r&&!r.border&&r.areaC>=.8),runs=new Map(targets.map(r=>[r.id,[]]));
    for(let j=0;j<H;j++){let current=0,start=0;for(let i=0;i<=W;i++){const id=i<W?lab[j*W+i]:0;if(id!==current){if(runs.has(current))runs.get(current).push([minx+start*cell,minx+i*cell,miny+j*cell,miny+(j+1)*cell]);current=id;start=i;}}}
    for(const r of targets){
      const containsPoint=p=>{const i=Math.floor((p[0]-minx)/cell),j=Math.floor((p[1]-miny)/cell);return i>=0&&i<W&&j>=0&&j<H&&lab[j*W+i]===r.id;};
      const proof=certify({segments,runs:runs.get(r.id),grid:R,containsPoint,paintSegments,precision}),state=proof.geometryProof.state;
      status[state]++;r.perimeterEvidence={source:'R-slice-boundary',region:r.id,rasterPerimeter:r.per,state,reason:proof.geometryProof.reason,...(state==='confirmed'?{range:proof.perimeterRange}: {})};
    }
    return R.perimeterStatus=status;
  }
  return {certify,certifyRegionPerimeters,nominalDiagnostics:nominal,exactRectangle,exactLengthRange};
})();
