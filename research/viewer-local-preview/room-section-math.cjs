/* Diagnostic geometry of prevalidated closed, nonintersecting loops in metres.
   This helper does not validate arbitrary polygon topology. A centroid/line interval is not a normative
   calculation point, a physical opening or a substitute rectangular room. */
const N=require('../../bim/native-spaces');
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const vec=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function valid(loops){return Array.isArray(loops)&&loops.length&&loops.every(l=>Array.isArray(l)&&l.length>=3&&l.every(vec));}
function centroid(loops){
  if(!valid(loops))throw Error('invalid-loops');
  const origin=loops[0][0];let area=0,x=0,y=0;
  for(const l of loops){
    let c=0,cx=0,cy=0;
    for(let j=0;j<l.length;j++){
      const p=sub(l[j],origin),q=sub(l[(j+1)%l.length],origin),v=cross(p,q);
      c+=v;cx+=(p[0]+q[0])*v;cy+=(p[1]+q[1])*v;
    }
    if(!Number.isFinite(c)||c===0)throw Error('degenerate-loop');
    const location=N.locate(loops.filter(o=>o!==l),l[0]);
    if(!['inside','outside'].includes(location))throw Error('touching-or-invalid-loops');
    const sign=location==='inside'?-1:1;
    area+=sign*Math.abs(c);x+=sign*cx*Math.sign(c);y+=sign*cy*Math.sign(c);
  }
  const point=[origin[0]+x/(3*area),origin[1]+y/(3*area)];
  if(!(area>0)||!vec(point))throw Error('invalid-area-or-centroid');
  return {point,area:area/2,location:N.locate(loops,point),normativeVerified:false};
}
function lineIntervals(loops,origin,direction){
  if(!valid(loops)||!vec(origin)||!vec(direction)||!Math.hypot(...direction))throw Error('invalid-line-input');
  const norm=Math.hypot(...direction);if(!Number.isFinite(norm))throw Error('direction-overflow');
  const d=direction.map(x=>x/norm),hits=[],boundary=[];
  for(const l of loops)for(let j=0;j<l.length;j++){
    const p=l[j],q=l[(j+1)%l.length],s=sub(q,p),v=sub(p,origin),den=cross(d,s);
    if(den===0){
      if(cross(v,d)===0){const a=v[0]*d[0]+v[1]*d[1],b=(q[0]-origin[0])*d[0]+(q[1]-origin[1])*d[1];boundary.push([Math.min(a,b),Math.max(a,b)]);hits.push(a,b);}
      continue;
    }
    const u=cross(v,d)/den,t=cross(v,s)/den;
    if(u>=0&&u<=1)hits.push(t);
  }
  if(hits.some(t=>!Number.isFinite(t)))throw Error('intersection-overflow');
  const cuts=[...new Set(hits)].sort((a,b)=>a-b),inside=[];
  for(let i=1;i<cuts.length;i++){
    const lo=cuts[i-1],hi=cuts[i],mid=lo+(hi-lo)/2;
    if(!(mid>lo&&mid<hi))continue;
    const location=N.locate(loops,[origin[0]+mid*d[0],origin[1]+mid*d[1]]);
    if(location==='inside')inside.push([lo,hi]);
  }
  return {inside,boundary,direction:d,origin,status:boundary.length?'boundary-overlap':'intervals',sourceAccuracyVerified:false,normativeVerified:false};
}
module.exports={centroid,lineIntervals};
