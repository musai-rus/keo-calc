/* Outward-rounded intervals for the decoded mesh. No exporter accuracy is inferred. */
const BimPrecision = (() => {
  const buf=new ArrayBuffer(8),dv=new DataView(buf),finite=Number.isFinite;
  function next(x,up) {
    if(Number.isNaN(x)||x===(up?Infinity:-Infinity))return x;
    if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;
    dv.setFloat64(0,x);let b=dv.getBigUint64(0);b+=(x>0)===up?1n:-1n;dv.setBigUint64(0,b);return dv.getFloat64(0);
  }
  const box=x=>[x,x],valid=a=>Array.isArray(a)&&a.length===2&&a.every(finite)&&a[0]<=a[1];
  const outward=(a,b)=>[next(a,false),next(b,true)];
  const add=(a,b)=>outward(a[0]+b[0],a[1]+b[1]);
  const sub=(a,b)=>outward(a[0]-b[1],a[1]-b[0]);
  function mul(a,b){const q=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return outward(Math.min(...q),Math.max(...q));}
  function div(a,b){if(b[0]<=0&&b[1]>=0)return null;return mul(a,outward(1/b[1],1/b[0]));}
  function transform(p,m,S=1){return [0,1,2].map(k=>mul(add(add(add(mul(box(m[k]),p[0]),mul(box(m[k+4]),p[1])),mul(box(m[k+8]),p[2])),box(m[k+12])),box(S)));}
  // This describes a decoder cell, not an assumed encoder rounding rule.
  // A supplied rounding rule asserts an unsaturated, in-range quantizer.
  function decodeCell(code,format,rule) {
    if(format==='unorm16-centered'&&Number.isInteger(code)&&code>=0&&code<=65535){
      const value=code/65535-.5,arithmetic=sub(div(box(code),box(65535)),box(.5));
      if(!['nearest','directed'].includes(rule))return {value,arithmetic,input:null,step:1/65535};
      const radius=(rule==='nearest'?.5:1)/65535;
      return {value,arithmetic,input:outward(Math.max(-.5,value-radius),Math.min(.5,value+radius)),step:1/65535};
    }
    if(format==='float32'&&finite(code)&&Math.fround(code)===code){
      if(rule==='exact')return {value:code,arithmetic:box(code),input:box(code)};
      // Float32's adjacent spacing changes at powers of two and near zero.
      const b=new ArrayBuffer(4),v=new DataView(b);v.setFloat32(0,code);const bits=v.getUint32(0);
      const adjacent=up=>{if(code===0)return up?2**-149:-(2**-149);v.setUint32(0,bits+((code>0)===up?1:-1));return v.getFloat32(0);};
      if(!['nearest','directed'].includes(rule))return {value:code,arithmetic:box(code),input:null};
      const lo=adjacent(false),hi=adjacent(true),f=rule==='nearest'?.5:1;
      if(!finite(lo)||!finite(hi))return {value:code,arithmetic:box(code),input:null};
      return {value:code,arithmetic:box(code),input:outward(code-(code-lo)*f,code+(hi-code)*f)};
    }
    return {value:null,arithmetic:null,input:null};
  }
  function vertex(g,e,index,decoded) {
    const a=g.vblayout?.position||g.attributes?.position,raw=g.vb||a?.array;
    let cells,format='unknown';
    if(a&&raw&&a.bytesPerItem===2&&a.itemSize===4&&a.normalized&&g.vb&&!(a.offset||a.itemOffset)){
      const u=new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2),i=index*g.vbstride*2;
      format='unorm16-centered';cells=[0,1,2].map(k=>decodeCell(u[i+k],format));
    } else if(a&&raw instanceof Float32Array&&(!a.bytesPerItem||a.bytesPerItem===4)&&!a.normalized&&a.itemSize===3){
      const i=index*(g.vb?g.vbstride:3)+(a.offset||0);format='float32';cells=[0,1,2].map(k=>decodeCell(raw[i+k],format));
    }
    const matches=cells?.every((c,k)=>c.value===decoded[k]&&valid(c.arithmetic));
    const computed=matches&&e.length===16&&Array.from(e).every(finite)&&e[3]===0&&e[7]===0&&e[11]===0&&e[15]===1?transform(cells.map(c=>c.arithmetic),e):null;
    const bounds=computed?.every(valid)?computed:null;
    return {bounds,provenance:{decoder:matches?format:'unverified',decoderVerified:!!matches,decoderFormula:format==='unorm16-centered'?'uint16/65535 - 0.5':'stored binary32',reference:'decoded-mesh',matrix:Array.from(e),matrixReference:'runtime coefficients treated as exact; exporter transform accuracy unknown',encodingRule:'unknown',reconstruction:'unknown'}};
  }
  function intersection(a,b,zM,S) {
    if(!a?.bounds?.every(valid)||!b?.bounds?.every(valid)||!finite(S)||!(S>0))return {bounds:null,reason:'unknown-coordinate-precision'};
    const z=div(box(zM),box(S)),da=sub(a.bounds[2],z),db=sub(b.bounds[2],z);
    if((da[0]<=0&&da[1]>=0)||(db[0]<=0&&db[1]>=0))return {bounds:null,reason:'slice-vertex-sign-uncertain'};
    const t=div(da,sub(da,db));if(!t)return {bounds:null,reason:'slice-denominator-contains-zero'};
    const bounds=[0,1].map(k=>mul(add(a.bounds[k],mul(t,sub(b.bounds[k],a.bounds[k]))),box(S)));
    return bounds.every(valid)?{bounds,reason:''}:{bounds:null,reason:'nonfinite-slice-bound'};
  }
  function combine(collections) {
    const entries=[],reasons=new Set();let reconstruction='exact',complete=true;
    for(const ss of collections){const p=ss.precision;
      if(!p||p.entries?.length!==ss.length){complete=false;reconstruction='unknown';reasons.add('missing-collection-provenance');entries.push(...ss.map(()=>({bounds:null,provenance:{reason:'missing-collection-provenance'}})));continue;}
      entries.push(...p.entries);if(p.reconstruction!=='exact')reconstruction=p.reconstruction==='unknown'?'unknown':reconstruction==='unknown'?'unknown':'bounded';
      if(p.complete!==true)complete=false;for(const r of p.reasons||[])reasons.add(r);
    }
    return {v:1,reference:'source-model',reconstruction,complete,entries,reasons:[...reasons].sort()};
  }
  return {next,box,valid,add,sub,mul,div,transform,decodeCell,vertex,intersection,combine};
})();
