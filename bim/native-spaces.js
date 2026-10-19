/* Deterministic horizontal sections of native space meshes.
   Pure geometry: no Viewer, network, AI, room names or area matching.
   Coordinates describe the supplied decoded mesh, not exporter accuracy.
   Research adapter; deliberately not a normative acceptance certificate. */
const BimNativeSpaces = (() => {
  const finite = Number.isFinite;
  const key = p => JSON.stringify(p.map(x => x === 0 ? 0 : x));
  const compare = (a,b) => a[0]-b[0] || a[1]-b[1] || (a[2]||0)-(b[2]||0);
  const same = (a,b) => a.length===b.length && a.every((x,i)=>x===b[i]);
  function turn(a,b,c) {
    const u=(b[0]-a[0])*(c[1]-a[1]),v=(b[1]-a[1])*(c[0]-a[0]),d=u-v;
    // Conservative floating arithmetic ambiguity; never weld by an invented
    // model-space tolerance. The input mesh itself remains unverified.
    const error=16*Number.EPSILON*(Math.abs(u)+Math.abs(v));
    return Math.abs(d)>error ? Math.sign(d) : 0;
  }
  const boxesMeet=(a,b,c,d)=>Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0])) && Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));
  function segmentContact(a,b,c,d) {
    if(!boxesMeet(a,b,c,d))return false;
    const p=turn(a,b,c),q=turn(a,b,d),r=turn(c,d,a),s=turn(c,d,b);
    return (!p||!q||p!==q) && (!r||!s||r!==s);
  }
  function signedArea(points) {
    const o=points[0];let twice=0;
    for(let i=1;i+1<points.length;i++)twice+=(points[i][0]-o[0])*(points[i+1][1]-o[1])-(points[i][1]-o[1])*(points[i+1][0]-o[0]);
    return twice/2;
  }
  function locate(loops,p) {
    if(!Array.isArray(p)||p.length!==2||!p.every(finite))return 'unavailable';
    let inside=false;
    for(const loop of loops)for(let i=0;i<loop.length;i++){
      const a=loop[i],b=loop[(i+1)%loop.length];
      if(boxesMeet(a,b,p,p)&&!turn(a,b,p))return 'boundary';
      if((a[1]>p[1])!==(b[1]>p[1])){
        const x=a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]);
        if(!finite(x))return 'unavailable';
        if(x>p[0])inside=!inside;
      }
    }
    return inside?'inside':'outside';
  }
  function section({triangles,unitScale,z,maxSegments=20000}={}) {
    const base={reference:'supplied-decoded-mesh',sourceAccuracyVerified:false,normativeVerified:false};
    const fail=(reason,details={})=>({...base,status:'unavailable',reason,loops:[],segments:[],...details});
    if(!Array.isArray(triangles)||!triangles.length)return fail('missing-native-geometry');
    if(!finite(unitScale)||unitScale<=0||!finite(z))return fail('unknown-units-or-cut');
    if(!Number.isSafeInteger(maxSegments)||maxSegments<3)return fail('invalid-resource-limit');
    const edges=new Map();let coplanar=0,duplicates=0;
    for(const tri of triangles){
      if(!Array.isArray(tri)||tri.length!==3||tri.some(p=>!Array.isArray(p)||p.length!==3||!p.every(finite)))return fail('invalid-triangle');
      const ps=tri.map(p=>p.map(x=>x*unitScale));if(ps.some(p=>!p.every(finite)))return fail('nonfinite-scaled-coordinate');
      if(ps.every(p=>p[2]===z)){coplanar++;continue;}
      const hits=[];
      for(let i=0;i<3;i++){
        let a=ps[i],b=ps[(i+1)%3];
        if((a[2]>z)===(b[2]>z))continue;
        // Canonical endpoint order gives adjacent triangles the same point,
        // independently of triangle winding or traversal order.
        if(compare(a,b)>0)[a,b]=[b,a];
        const t=(z-a[2])/(b[2]-a[2]);
        const p=t===0?a.slice(0,2):t===1?b.slice(0,2):[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
        if(!p.every(finite))return fail('nonfinite-intersection');
        if(!hits.some(q=>same(p,q)))hits.push(p);
      }
      if(hits.length<2)continue;
      if(hits.length!==2)return fail('ambiguous-triangle-section');
      hits.sort(compare);const k=key(hits[0])+'|'+key(hits[1]);
      if(edges.has(k))duplicates++;else edges.set(k,hits);
      if(edges.size>maxSegments)return fail('section-resource-limit');
    }
    if(coplanar)return fail('cut-coincides-with-surface',{coplanarTriangles:coplanar});
    if(duplicates)return fail('overlapping-section-segments',{duplicateSegments:duplicates});
    if(edges.size<3)return fail('empty-or-degenerate-section');
    const ordered=[...edges.values()].sort((a,b)=>compare(a[0],b[0])||compare(a[1],b[1]));
    const nodes=new Map();
    const node=p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{point:p,edges:[]});return k;};
    const graph=ordered.map(([a,b],i)=>{const ka=node(a),kb=node(b);nodes.get(ka).edges.push(i);nodes.get(kb).edges.push(i);return [ka,kb];});
    const badNodes=[...nodes.values()].filter(n=>n.edges.length!==2);
    if(badNodes.length)return fail('open-or-branching-section',{invalidVertices:badNodes.map(n=>({point:n.point,degree:n.edges.length}))});
    const loops=[],used=new Set();
    for(let start=0;start<graph.length;start++){
      if(used.has(start))continue;
      const first=graph[start][0],points=[];let current=first,edge=start;
      do{
        if(used.has(edge))return fail('invalid-section-cycle');
        used.add(edge);points.push(nodes.get(current).point);
        current=graph[edge][0]===current?graph[edge][1]:graph[edge][0];
        edge=nodes.get(current).edges.find(i=>i!==edge);
      }while(current!==first);
      if(points.length<3||!finite(signedArea(points))||signedArea(points)===0)return fail('degenerate-section-cycle');
      loops.push(points);
    }
    // Reject crossing, touching and numerically ambiguous nonadjacent edges.
    let pairChecks=0;
    for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
      // Edges are ordered by their left endpoint. Bound pathological inputs
      // instead of letting a complex invalid mesh freeze the browser.
      if(ordered[j][0][0]>Math.max(ordered[i][0][0],ordered[i][1][0]))break;
      if(++pairChecks>2000000)return fail('intersection-resource-limit');
      if(graph[i].some(k=>graph[j].includes(k)))continue;
      if(segmentContact(...ordered[i],...ordered[j]))return fail('crossing-or-touching-contours');
    }
    const contours=loops.map((points,i)=>{
      const depth=loops.filter((other,j)=>j!==i&&locate([other],points[0])==='inside').length;
      return {points,depth,hole:depth%2===1,area:Math.abs(signedArea(points))};
    });
    const area=contours.reduce((sum,c)=>sum+(c.hole?-c.area:c.area),0);
    if(!(area>0&&finite(area)))return fail('invalid-section-area');
    return {...base,status:'closed-section',loops,contours,segments:ordered.map(([a,b])=>[...a,...b]),area,cutMeters:z,triangleCount:triangles.length};
  }
  return {section,locate};
})();
if(typeof module!=='undefined')module.exports=BimNativeSpaces;
