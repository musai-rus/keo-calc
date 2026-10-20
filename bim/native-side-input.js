/* Native mesh -> the existing calculator state. Controlled preview for one
   rectangular room and rectangular, unsplayed openings in one facade.
   Does not discover/verify aperture ownership, source precision, materials,
   north, external shading or the absence of further openings/skylights.
   No model names, AI, room-area matching or alternative KEO formula. */
const BimNativeSideInput = (() => {
  const vec=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const evidence={geometryVerified:false,sourceAccuracyVerified:false,normativeVerified:false,reference:'supplied-mesh-and-explicit-opening-boundaries'};
  function prepare(input,lib) {
    const fail=(reason,at)=>{throw {nativeSideFailure:true,reason,at};};
    try {
      const {KEO,NativeSpaces,DATA}=lib||{},I=input||{},room=I.room,F=I.facade;
      if(!KEO||!NativeSpaces||!DATA)fail('missing-calculator-or-geometry-module');
      if(!Number.isFinite(I.unitScale)||I.unitScale<=0)fail('unknown-units');
      if(!room||typeof room.id!=='string'||!room.id||!Array.isArray(room.triangles)||!room.triangles.length)fail('missing-native-room');
      if(room.triangles.length>200000)fail('room-resource-limit');
      if(!F||!vec(F.origin)||!vec(F.along)||!vec(F.inward)||!vec(F.outerOrigin))fail('missing-facade-frame');
      const axisError=128*Number.EPSILON;
      if(Math.abs(F.along[2])>axisError||Math.abs(F.inward[2])>axisError||Math.abs(dot(F.along,F.inward))>axisError||Math.abs(Math.hypot(...F.along)-1)>axisError||Math.abs(Math.hypot(...F.inward)-1)>axisError)fail('non-horizontal-or-non-orthonormal-frame');
      const O=F.origin.map(x=>x*I.unitScale);
      const local=p=>{if(!vec(p))fail('invalid-coordinate');const d=sub(p.map(x=>x*I.unitScale),O);const q=[dot(d,F.inward),dot(d,F.along),d[2]];if(!q.every(Number.isFinite))fail('coordinate-overflow');return q;};
      const world=p=>[0,1,2].map(k=>O[k]+p[0]*F.inward[k]+p[1]*F.along[k]+(k===2?p[2]:0));
      const triangles=room.triangles.map(t=>{if(!Array.isArray(t)||t.length!==3)fail('invalid-triangle');return t.map(local);});
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(const t of triangles)for(const p of t)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
      // Arithmetic envelope only. It does not assert exporter accuracy.
      const error=axisError*Math.max(1,...O.map(Math.abs),...lo.map(Math.abs),...hi.map(Math.abs));
      const near=(a,b)=>Math.abs(a-b)<=error;
      const dims=sub(hi,lo),[dp,bp,H]=dims;
      if(dims.some(x=>!Number.isFinite(x)||x<=error)||!near(lo[0],0))fail('facade-not-on-room-boundary');
      const outer=local(F.outerOrigin),dst=-outer[0];if(!Number.isFinite(dst)||dst<=error)fail('missing-positive-opening-depth');
      const section=NativeSpaces.section({triangles,unitScale:1,z:(lo[2]+hi[2])/2});
      if(section.status!=='closed-section'||section.loops.length!==1)fail('unsupported-room-section',section.reason);
      for(const loop of section.loops)for(let j=0;j<loop.length;j++){
        const a=loop[j],b=loop[(j+1)%loop.length];
        if(!(near(a[0],b[0])&&(near(a[0],lo[0])||near(a[0],hi[0]))||near(a[1],b[1])&&(near(a[1],lo[1])||near(a[1],hi[1]))))fail('nonrectangular-room');
      }
      if(Math.abs(section.area-dp*bp)>error*2*(dp+bp))fail('nonrectangular-room-area');
      // Reject slopes and missing faces; this nominal shell check is not a
      // general mesh-manifold or source-precision certificate.
      const faceAreas=[0,0,0,0,0,0],expected=[bp*H,bp*H,dp*H,dp*H,dp*bp,dp*bp];
      for(const t of triangles){
        const area=Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))/2;
        if(!Number.isFinite(area)||area<=0)fail('degenerate-room-triangle');
        let face=-1;for(let k=0;k<3;k++)for(let b=0;b<2;b++)if(t.every(p=>near(p[k],b?hi[k]:lo[k])))face=2*k+b;
        if(face<0)fail('non-prismatic-room');faceAreas[face]+=area;
      }
      if(faceAreas.some((a,i)=>Math.abs(a-expected[i])>error*8*(dp+bp+H)))fail('incomplete-or-overlapping-room-shell');
      if(!Array.isArray(I.openings)||!I.openings.length||I.openings.length>512)fail('missing-or-excess-openings');
      const seen=new Set(),rectangles=[];
      function rectangle(raw,plane,id){
        if(!Array.isArray(raw)||raw.length!==4)fail('nonrectangular-opening',id);
        const p=raw.map(local),y=p.map(q=>q[1]),z=p.map(q=>q[2]),r=[Math.min(...y),Math.min(...z),Math.max(...y),Math.max(...z)];
        if(p.some(q=>!near(q[0],plane))||r[2]-r[0]<=error||r[3]-r[1]<=error)fail('invalid-opening-plane-or-size',id);
        const corners=new Set();
        for(let j=0;j<4;j++){
          const a=p[j],b=p[(j+1)%4],iy=near(a[1],r[0])?0:near(a[1],r[2])?1:-1,iz=near(a[2],r[1])?0:near(a[2],r[3])?1:-1;
          if(iy<0||iz<0||!(near(a[1],b[1])!==near(a[2],b[2])))fail('nonrectangular-opening',id);corners.add(iy+2*iz);
        }
        if(corners.size!==4)fail('duplicate-opening-corner',id);return r;
      }
      const windows=I.openings.map(o=>{
        if(typeof o.id!=='string'||!o.id||seen.has(o.id))fail('missing-or-duplicate-opening-id');seen.add(o.id);
        const r=rectangle(o.inner,0,o.id),s=rectangle(o.outer,-dst,o.id);
        if(r.some((x,i)=>!near(x,s[i])))fail('splayed-opening-not-supported',o.id);
        if(r[0]<lo[1]-error||r[2]>hi[1]+error||r[1]<lo[2]-error||r[3]>hi[2]+error)fail('opening-outside-room',o.id);
        for(const prev of rectangles)if(Math.min(r[2],prev.r[2])>Math.max(r[0],prev.r[0])&&Math.min(r[3],prev.r[3])>Math.max(r[1],prev.r[1]))fail('overlapping-openings',o.id);
        rectangles.push({id:o.id,r});
        const w={...KEO.defaultWindow(),hpd:r[1]-lo[2],ho:r[3]-r[1],bo:r[2]-r[0],s:(r[0]+r[2]-lo[1]-hi[1])/2};
        // Explicit optical overrides only; geometry cannot be overwritten.
        for(const k of ['t2m','t2o','tau0m','tau0o','tau0b','Km','Ko','Kb'])if(Object.hasOwn(o.coefficients||{},k))w[k]=o.coefficients[k];
        return w;
      });
      // The caller supplies the existing calculator's semantic/material/north/
      // shading choices. Never silently start from default Moscow or glass.
      if(!I.template||I.template.mode!=='side'||!Array.isArray(I.template.side?.walls)||I.template.side.walls.length!==1)fail('missing-single-facade-calculator-template');
      const state=JSON.parse(JSON.stringify(I.template,(k,v)=>{if(typeof v==='number'&&!Number.isFinite(v)||['function','symbol','bigint'].includes(typeof v))fail('invalid-template-value',k);return v;})),wall=state.side.walls[0];
      if(!KEO.room(state))fail('unknown-room-purpose');
      if(state.groupManual){if(!Number.isInteger(state.group)||state.group<1||state.group>5)fail('unknown-climate-group');}
      else if(!DATA.regions.some(r=>r.name===state.region))fail('unknown-region');
      if(!KEO.ORIENTS.includes(wall.orient))fail('unknown-facade-orientation');
      Object.assign(wall,{dp,bp,H,dst,ds:0,windows});
      const rule=KEO.rtOf(state);
      if(!['center','far1','far1.2'].includes(rule))fail('unsupported-or-unconfirmed-point-rule',rule);
      wall.lt=KEO.ltAuto(rule,dp);
      if(!(wall.lt>error&&wall.lt<dp-error))fail('point-outside-room');
      const hp=KEO.hpOf(state);if(!Number.isFinite(hp)||hp<0||hp>=H)fail('invalid-working-plane');
      const point=world([wall.lt,(lo[1]+hi[1])/2,lo[2]+hp]);
      const validation=KEO.compute(state);
      if(!validation.ok)return {status:'rejected',reason:'calculator-rejected-input',errors:validation.err,...evidence};
      return {status:'preview',state,calculation:validation,roomId:room.id,openingIds:I.openings.map(o=>o.id),point,
        inputs:{dp,bp,H,dst,lt:wall.lt,hp,windows:windows.map(({bo,ho,hpd,s})=>({bo,ho,hpd,s}))},
        sources:{geometry:'supplied room mesh and paired opening rectangles',pointRule:KEO.RT_REF[rule],context:'explicit calculator template: region, purpose, orientation, optics, reflection, shading'},
        limits:['one rectangular prism','one side-light facade; complete opening set must be checked separately','no skylights or internal occluders represented','source truth, exterior adjacency and optical settings need independent verification'],...evidence};
    }catch(e){if(e?.nativeSideFailure)return {status:'rejected',reason:e.reason,at:e.at,...evidence};throw e;}
  }
  return {prepare};
})();
if(typeof module!=='undefined')module.exports=BimNativeSideInput;
