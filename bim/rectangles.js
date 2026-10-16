/* Research: source boundaries certify a rectangle; raster cells are never filled. */
const BimRectangles = (function () {
  const finite=Number.isFinite;
  const normalized=s=>s[0]<s[2]||s[0]===s[2]&&s[1]<=s[3]?s.slice():[s[2],s[3],s[0],s[1]];
  const sorted=ss=>ss.map(normalized).sort((a,b)=>{for(let k=0;k<4;k++)if(a[k]!==b[k])return a[k]-b[k];return 0});
  function certify({segments,runs,grid,containsPoint,paintSegments}) {
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
      accepted.push({frame,source:{kind:'slice-segments',segments:sorted(relevant),precision:eps},lengthRange:{min:L-8*eps,max:L+8*eps,radius:8*eps}});
    }
    if(!accepted.length)return fail('Исходные границы не подтверждают прямоугольник без внутренних препятствий с той же полной маской.');
    const first=accepted[0];
    if(accepted.some(c=>Math.abs(c.frame.L-first.frame.L)>8*eps||Math.abs(c.frame.B-first.frame.B)>8*eps||Math.hypot(c.frame.O[0]-first.frame.O[0],c.frame.O[1]-first.frame.O[1])>8*eps))return fail('Исходные границы дают неоднозначную прямоугольную схему.');
    return {...first,error:''};
  }
  return {certify};
})();
