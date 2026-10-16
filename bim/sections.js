/* Explicit short rectangular sections. No normative defaults or room matching. */
const BimSections = (function () {
  const VERSION = 1;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function convexHull(points) {
    const ps=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const hull = [];
    for (const p of ps) { while(hull.length>1 && cross(hull.at(-2),hull.at(-1),p)<=0) hull.pop(); hull.push(p); }
    const lower = hull.length;
    for (let j=ps.length-2;j>=0;j--) { const p=ps[j]; while(hull.length>lower && cross(hull.at(-2),hull.at(-1),p)<=0) hull.pop(); hull.push(p); }
    hull.pop();return hull;
  }
  function rectangle(runs) {
    const hull=convexHull(runs.flatMap(q=>[[q[0],q[2]],[q[1],q[2]],[q[1],q[3]],[q[0],q[3]]]));
    if(hull.length<4) return null;let best;
    for(let j=0;j<hull.length;j++) {
      const a=hull[j],b=hull[(j+1)%hull.length]; let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
      const measure = ang => { const u=[Math.cos(ang),Math.sin(ang)],v=[-u[1],u[0]],xs=hull.map(p=>p[0]*u[0]+p[1]*u[1]),ys=hull.map(p=>p[0]*v[0]+p[1]*v[1]); return {u,v,x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}; };
      let f=measure(angle); if(f.y1-f.y0>f.x1-f.x0+1e-9) angle+=Math.PI/2;
      angle=((angle+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2; f=measure(angle);
      const L=f.x1-f.x0,B=f.y1-f.y0,area=L*B;
      if(!best || area<best.area-1e-9 || Math.abs(area-best.area)<=1e-9 && Math.abs(angle)<Math.abs(best.angle)) best={...f,L,B,area,angle};
    }
    if(!best || !(best.L>0 && best.B>0)) return null;
    const {u,v,x0,y0,L,B}=best,O=[u[0]*x0+v[0]*y0,u[1]*x0+v[1]*y0];
    return {O,u,v,L,B,toLocal:p=>[(p[0]-O[0])*u[0]+(p[1]-O[1])*u[1],(p[0]-O[0])*v[0]+(p[1]-O[1])*v[1]],toWorld:p=>[O[0]+p[0]*u[0]+p[1]*v[0],O[1]+p[0]*u[1]+p[1]*v[1]]};
  }
  function lengthBounds(centers,cell) {
    if(centers.length<3) return null;
    let diameter=0,width=Infinity;
    for(let i=0;i<centers.length;i++) {
      for(let j=i+1;j<centers.length;j++) diameter=Math.max(diameter,Math.hypot(centers[i][0]-centers[j][0],centers[i][1]-centers[j][1]));
      const a=centers[i],b=centers[(i+1)%centers.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const projections=centers.map(p=>((b[0]-a[0])*p[1]-(b[1]-a[1])*p[0])/len);
      width=Math.min(width,Math.max(...projections)-Math.min(...projections));
    }
    // G.raster blocks a cell at most hypot(.8,.5)*cell from a wall
    // sample (floor(x), floor(x+.3), and the analogous y offset).
    // Erode the exact rectangle by this radius + grid covering radius.
    // Snapping that inner rectangle to grid centers covers every exact
    // point within radius r; this also covers center-sampled masks.
    const wallRadius=Math.hypot(.8,.5)*cell,coverRadius=cell/Math.SQRT2,inset=wallRadius+coverRadius;
    if(width<2*inset) return null;
    const radius=Math.SQRT2*inset+coverRadius;
    // For an exact rectangle, diagonal D and minimum width B satisfy
    // L²=D²-B². Both D and B increase by at most 2r from the center hull.
    // These bounds do not assume that the fitted raster axes are exact.
    return {min:Math.sqrt(Math.max(0,diameter**2-(width+2*radius)**2)),max:Math.sqrt((diameter+2*radius)**2-width**2),radius};
  }
  // Exact serialization is intentional: no digest collisions or area-only reuse.
  function context({scope,runs,cell,cut,grid,containsPoint,openings=[],lanterns=[]}) {
    const sorted=(runs||[]).map(q=>q.slice()).sort((a,b)=>a[2]-b[2]||a[0]-b[0]||a[3]-b[3]||a[1]-b[1]);
    const clean=sorted.length && sorted.every(q=>q.length===4 && q.every(finite) && q[1]>q[0] && q[3]>q[2]);
    const frame=clean?rectangle(sorted):null;
    const snapshot = xs => xs.map(o=>Object.fromEntries(['id','c','t','n','nin','w','d','z0','z1','av','bv','dTop','dBot','H','hsf','tilt','round','shaded'].map(k=>[k,o[k]]))).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const signature=JSON.stringify({v:VERSION,scope,cell,cut,runs:sorted,openings:snapshot(openings),lanterns:snapshot(lanterns)});
    let error='',lengthRange=null;
    if(!scope || !scope.model || !scope.view || !scope.version) error='Нет устойчивой идентичности версии модели: ручной разрез не сохраняется.';
    else if(!frame || !finite(cell) || cell<=0 || !grid || ![grid.minx,grid.miny,grid.W,grid.H].every(finite) || typeof containsPoint!=='function') error='Нет полной маски пространства для проверки прямоугольной схемы.';
    else {
      // Only the raster boundary band is uncertain (one cell diagonal).
      // Every deeper cell must belong to this space: holes/notches are not filled.
      const margin=Math.SQRT2*cell;
      const centers=convexHull(sorted.flatMap(q=>[[q[0]+cell/2,q[2]+cell/2],[q[1]-cell/2,q[2]+cell/2],[q[1]-cell/2,q[3]-cell/2],[q[0]+cell/2,q[3]-cell/2]]));
      lengthRange=lengthBounds(centers,cell);
      const xs=sorted.flatMap(q=>[q[0],q[1]]),ys=sorted.flatMap(q=>[q[2],q[3]]);
      const x0=Math.max(0,Math.floor((Math.min(...xs)-grid.minx)/cell)),x1=Math.min(grid.W-1,Math.ceil((Math.max(...xs)-grid.minx)/cell));
      const y0=Math.max(0,Math.floor((Math.min(...ys)-grid.miny)/cell)),y1=Math.min(grid.H-1,Math.ceil((Math.max(...ys)-grid.miny)/cell));
      for(let y=y0;y<=y1 && !error;y++) for(let x=x0;x<=x1;x++) {
        const p=[grid.minx+(x+.5)*cell,grid.miny+(y+.5)*cell],q=frame.toLocal(p);
        // Missing cells inside the filled-center hull are real concavities or
        // holes, even in the raster boundary band. Never bridge them.
        const inHull=centers.every((a,j)=>cross(a,centers[(j+1)%centers.length],p)>=-1e-9);
        if((inHull || q[0]>margin && q[0]<frame.L-margin && q[1]>margin && q[1]<frame.B-margin) && !containsPoint(p)) { error='Полная маска не подтверждает прямоугольную схему: есть внутренний разрыв, отверстие или сложный контур.'; break; }
      }
      if(!error && !(+frame.L.toFixed(2)>2 && frame.L<=4+1e-9)) error=+frame.L.toFixed(2)<=2?'L ≤ 2 м: нужна отдельная схема расчёта.':'Ручная настройка доступна только для коротких прямоугольных разрезов 2 < L ≤ 4 м.';
      if(!error && (!lengthRange || !(lengthRange.min>2 && lengthRange.max<=4))) error='Растр не подтверждает, что весь диапазон возможной длины лежит в 2 < L ≤ 4 м. Нужны точные границы или отдельная схема расчёта.';
    }
    return {scope,signature,frame,runs:sorted,cell,containsPoint,error,lengthRange};
  }
  function validateRecords(records) {
    if(!records || typeof records!=='object' || Array.isArray(records)) throw Error('Неверный формат ручных разрезов.');
    for(const r of Object.values(records)) {
      if(!r || typeof r!=='object' || !Number.isInteger(r.v) || !r.scope || typeof r.scope!=='object' || typeof r.signature!=='string' || r.signature.length>2000000 || !r.params || !finite(r.params.y0) || !Number.isInteger(r.params.nPts) || typeof r.params.nPtsBasis!=='string' || r.params.nPtsBasis.length>4000 || typeof r.params.confirmed!=='boolean') throw Error('Неверный формат ручного разреза.');
    }
    return records;
  }
  function preview(ctx, params, KEO) {
    const errors=ctx.error?[ctx.error]:[],fr=ctx.frame;
    if(!fr) return {errors,points:[]};
    if(!params || !finite(params.y0) || !Number.isInteger(params.nPts) || typeof params.nPtsBasis!=='string' || !params.nPtsBasis.trim() || params.nPtsBasis.length>4000) errors.push('Укажите конечный y0, целое число РТ и непустое обоснование (до 4000 знаков).');
    if(params?.confirmed!==true) errors.push('Подтвердите прямоугольную схему по проекту; маска сама по себе не обосновывает отражённую составляющую.');
    const st=KEO.defaultState();st.top={...st.top,L:+fr.L.toFixed(2),B:+fr.B.toFixed(2),y0:params?.y0,nPts:params?.nPts,nPtsBasis:params?.nPtsBasis};
    errors.push(...KEO.topPointPolicy(st).err);
    if(!finite(params?.y0) || params.y0<=Math.SQRT2*ctx.cell || params.y0>=fr.B-Math.SQRT2*ctx.cell) errors.push('Разрез должен проходить внутри помещения, вне полосы погрешности границы растра.');
    const points=finite(params?.y0)?KEO.topPoints(st).filter(p=>finite(p.x)&&finite(p.y)).map(p=>fr.toWorld([p.x,p.y])):[];
    if(typeof ctx.containsPoint==='function' && points.some(p=>!ctx.containsPoint(p))) errors.push('Расчётная точка вне полной маски пространства.');
    if(!errors.length) for(let x=Math.SQRT2*ctx.cell;x<fr.L-Math.SQRT2*ctx.cell;x+=ctx.cell/2) if(!ctx.containsPoint(fr.toWorld([x,params.y0]))) {errors.push('Разрез пересекает разрыв или стену внутри пространства.');break;}
    return {errors:[...new Set(errors)],points,stateTop:st.top};
  }
  function resolve(ctx,record,KEO) {
    if(!record) return {mode:'auto',errors:[],points:[]};
    try{validateRecords({record});}catch(e){return {mode:'stale',errors:[e.message],points:[]};}
    if(record.v!==VERSION || JSON.stringify(record.scope)!==JSON.stringify(ctx.scope) || record.signature!==ctx.signature) return {mode:'stale',errors:['Сохранённый разрез устарел: версия модели, состав или геометрия изменились. Подтвердите параметры заново или верните авто.'],points:[]};
    return {mode:'manual',...preview(ctx,record.params,KEO)};
  }
  function record(ctx,params,KEO) {
    const p=preview(ctx,params,KEO);if(p.errors.length) throw Error(p.errors.join(' '));
    return {v:VERSION,scope:ctx.scope,signature:ctx.signature,params:{...params,nPtsBasis:params.nPtsBasis.trim()}};
  }
  return {context,preview,resolve,record,validateRecords};
})();
