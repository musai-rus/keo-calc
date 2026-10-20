/* Area remaining after a union of convex projected triangle polygons.
   Continuous polygon subtraction, no grid, centre ray or opacity inference.
   Input footprint must be a simple convex polygon without holes. */
const BimProjectedArea=(()=>{
  const EPS=256*Number.EPSILON;
  const signedArea=p=>{let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
  const valid=p=>Array.isArray(p)&&p.length>=3&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite));
  function remainder({footprint,cutters,maxCells=4096,maxOperations=5000000}={}){
    const base={reference:'orthographic-projected-surface-union',normativeVerified:false,ownershipVerified:false};
    const fail=reason=>({...base,status:'unavailable',reason});
    if(!valid(footprint)||!Array.isArray(cutters)||cutters.some(p=>!valid(p))||!Number.isSafeInteger(maxCells)||maxCells<1||!Number.isSafeInteger(maxOperations)||maxOperations<1)return fail('invalid-projected-area-input');
    if(footprint.length>2048||cutters.length>200000)return fail('projected-area-resource-limit');
    const origin=footprint[0],local=p=>p.map(v=>[v[0]-origin[0],v[1]-origin[1]]),fp=local(footprint);
    let extent=1;for(const p of fp)extent=Math.max(extent,Math.abs(p[0]),Math.abs(p[1]));
    const error=EPS*extent,areaError=EPS*extent*extent,sourceArea=Math.abs(signedArea(fp));
    for(let i=0;i<fp.length;i++)for(let j=0;j<i;j++)if(Math.hypot(fp[i][0]-fp[j][0],fp[i][1]-fp[j][1])<=error)return fail('duplicate-or-unstable-footprint-vertex');
    if(!Number.isFinite(sourceArea)||sourceArea<=areaError)return fail('degenerate-footprint');
    function planes(poly){
      const sign=Math.sign(signedArea(poly)),out=[];
      for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;const n=[-dy*sign/len,dx*sign/len],c=-n[0]*a[0]-n[1]*a[1];if(poly.some(p=>n[0]*p[0]+n[1]*p[1]+c < -error))return null;out.push({n,c});}return out;
    }
    if(!planes(fp))return fail('nonconvex-footprint');
    let cells=[fp],operations=0,discardedAreaBound=0,processed=0;
    const clip=(poly,n,c,side)=>{
      const out=[];for(let i=0;i<poly.length;i++){
        if(++operations>maxOperations)throw Error('projected-area-resource-limit');
        const a=poly[i],b=poly[(i+1)%poly.length],da=side*(n[0]*a[0]+n[1]*a[1]+c),db=side*(n[0]*b[0]+n[1]*b[1]+c),ia=da>=0,ib=db>=0;
        if(ia)out.push(a);if(ia!==ib){const f=da/(da-db);out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);}
      }return out;
    };
    try{
      for(const raw of cutters){
        const cutter=local(raw),ca=Math.abs(signedArea(cutter));if(!Number.isFinite(ca))return fail('projected-area-overflow');
        if(ca<=areaError){discardedAreaBound+=ca+areaError;continue;}
        const sides=planes(cutter);if(!sides)return fail('nonconvex-cutter');
        const next=[];
        for(const cell of cells){
          let rest=cell;
          for(const {n,c} of sides){
            if(rest.length<3)break;
            const outside=clip(rest,n,c,-1),a=Math.abs(signedArea(outside));
            if(a>areaError){next.push(outside);if(next.length>maxCells)throw Error('projected-area-cell-limit');}else discardedAreaBound+=a+areaError;
            rest=clip(rest,n,c,1);
          }
        }
        cells=next;processed++;if(!cells.length)break;
      }
    }catch(e){return fail(e.message);}
    const remainingArea=cells.reduce((s,p)=>s+Math.abs(signedArea(p)),0);
    // A numerical diagnostic bound, NOT a proven export/coordinate error bound.
    const numericalAreaAllowance=discardedAreaBound+areaError*(operations+1);
    if(!Number.isFinite(remainingArea)||remainingArea>sourceArea+numericalAreaAllowance)return fail('inconsistent-projected-area');
    return {...base,status:'computed',sourceArea,remainingArea,coveredArea:sourceArea-remainingArea,numericalAreaAllowance,processedCutters:processed,operations,cellCount:cells.length,
      remainingCells:cells.map(p=>p.map(v=>[v[0]+origin[0],v[1]+origin[1]]))};
  }
  return {remainder};
})();
if(typeof module!=='undefined')module.exports=BimProjectedArea;
