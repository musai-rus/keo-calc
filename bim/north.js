/* Orientation in the loaded Viewer world XY plane. Geometry is already placed. */
const BimNorth = (function () {
  const modeOf = raw => String(raw ?? '').trim() === '' ? 'auto' : 'manual';
  const wrap = angle => { const a=angle%360; return a<0 ? a+360 : a===0 ? 0 : a; };
  function planarAngle(a, stride) {
    if (!a || a.length < (stride === 3 ? 9 : 16) || !Array.from(a).every(Number.isFinite)) return null;
    const x=[a[0],a[1],a[2]], y=[a[stride],a[stride+1],a[stride+2]], z=[a[2*stride],a[2*stride+1],a[2*stride+2]];
    const sx=Math.hypot(...x),sy=Math.hypot(...y),sz=Math.hypot(...z),tol=1e-7;
    if (!(sx>0 && sy>0 && sz>0) || Math.abs(x[2])>tol*sx || Math.abs(y[2])>tol*sy || Math.hypot(z[0],z[1])>tol*sz || z[2]<=0 || Math.abs(sx-sy)>tol*sx || Math.abs(x[0]*y[0]+x[1]*y[1])>tol*sx*sy || x[0]*y[1]-x[1]*y[0]<=0) return null;
    if (stride===4 && (Math.abs(a[3])>tol || Math.abs(a[7])>tol || Math.abs(a[11])>tol || Math.abs(a[15]-1)>tol)) return null;
    return Math.atan2(x[1],x[0])*180/Math.PI;
  }
  function resolve(T, raw, mode=modeOf(raw), world=null) {
    const unknown=reason=>({rot:null,source:'unknown',unknown:true,src:reason+' Задайте север вручную в осях Viewer.'});
    if (!['auto','manual'].includes(mode)) throw new Error('Выберите источник севера: из модели или вручную.');
    if (mode==='manual') {
      const text=String(raw??'').trim();
      if (!text) return unknown('Ручной угол севера не задан.');
      const angle=Number(text.replace(',','.'));
      if (!['string','number'].includes(typeof raw) || !Number.isFinite(angle)) throw new Error('Поправка на север должна быть конечным числом градусов.');
      return {rot:wrap(angle),input:angle,source:'manual',src:'задан вручную относительно +Y Viewer: '+angle+'° по часовой'};
    }
    const ref=planarAngle(T,3),placement=world===null?0:planarAngle(world,4);
    if (ref===null) return unknown('Надёжный истинный север из refPointTransformation не получен.');
    if (placement===null) return unknown('Преобразование модели в Viewer не подтверждает плоский поворот.');
    // world = P * internal, shared = T * internal. Azimuth correction = angle(P) - angle(T).
    // Link transforms are already in world vertices; do not apply them again.
    const rot=placement-ref;
    return {rot,source:'model',refAngle:ref,placementAngle:placement,src:'истинный север Revit: поправка '+rot.toFixed(1).replace('.',',')+'° в осях Viewer (refPointTransformation с учётом размещения модели)'};
  }
  return {resolve,modeOf,planarAngle};
})();
