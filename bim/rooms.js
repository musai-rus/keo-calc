/* Геометрия Room: идентичность задаётся источником, площадь не используется для поиска. */
const BimRooms = (() => {
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function segments(loops) {
    if (!Array.isArray(loops) || !loops.length) throw new Error('Нет контуров Room');
    return loops.flatMap(loop => {
      if (!Array.isArray(loop) || loop.length < 3 || loop.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite))) throw new Error('Некорректный контур Room');
      return loop.map((p, i) => [...p, ...loop[(i + 1) % loop.length]]).filter(s => Math.hypot(s[2]-s[0], s[3]-s[1]) > 1e-7);
    });
  }
  function closed(segs) {
    if (segs.length < 3 || segs.some(s => s.length !== 4 || !s.every(finite))) return false;
    const ends = new Map(), key = (x,y) => Math.round(x*1000)+','+Math.round(y*1000);
    for (const s of segs) for (const k of [key(s[0],s[1]),key(s[2],s[3])]) ends.set(k,(ends.get(k)||0)+1);
    if(![...ends.values()].every(n => n === 2))return false;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){
      const a=segs[i].slice(0,2),b=segs[i].slice(2),c=segs[j].slice(0,2),d=segs[j].slice(2);
      if(cross(a,b,c)*cross(a,b,d)<-1e-12&&cross(c,d,a)*cross(c,d,b)<-1e-12)return false;
    }
    return true;
  }
  function inside(segs, x, y) {
    let yes = false;
    for (const [ax,ay,bx,by] of segs) if ((ay>y)!==(by>y) && x < ax+(y-ay)*(bx-ax)/(by-ay)) yes = !yes;
    return yes;
  }
  function section(segs,A,t) {
    if(!inside(segs,...A))return null;
    let positive=Infinity,negative=Infinity;
    for(const [x,y,X,Y] of segs){
      const dx=X-x,dy=Y-y,det=t[0]*dy-t[1]*dx;
      if(Math.abs(det)<1e-10)continue;
      const ax=x-A[0],ay=y-A[1],u=(ax*dy-ay*dx)/det,v=(ax*t[1]-ay*t[0])/det;
      if(v < -1e-8 || v > 1+1e-8)continue;
      if(u>=0)positive=Math.min(positive,u);else negative=Math.min(negative,-u);
    }
    return Number.isFinite(positive+negative)?[positive,negative]:null;
  }
  function footprint(R,lab,polygon) {
    const segs=segments([polygon]),owners=new Set();let missing=false,count=0;
    const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
    const i0=Math.floor((Math.min(...xs)-R.minx)/R.cell),i1=Math.ceil((Math.max(...xs)-R.minx)/R.cell);
    const j0=Math.floor((Math.min(...ys)-R.miny)/R.cell),j1=Math.ceil((Math.max(...ys)-R.miny)/R.cell);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)if(inside(segs,R.minx+(i+.5)*R.cell,R.miny+(j+.5)*R.cell)){
      count++;const id=i>=0&&j>=0&&i<R.W&&j<R.H?lab[j*R.W+i]:-1;
      if(id<0)missing=true;else owners.add(id);
    }
    return {owners:[...owners],space:count&&!missing&&owners.size===1?[...owners][0]:-1};
  }
  function importData(data, model, rooms) {
    if (data.version !== 1 || data.model !== model || data.coordinates !== 'viewer-metres' || !Array.isArray(data.rooms)) throw new Error('Файл границ не соответствует модели или системе координат');
    const byId = new Map(rooms.filter(r=>r.externalId).map(r=>[r.externalId,r])), out = new Map();
    for (const entry of data.rooms) {
      const rm = byId.get(entry.externalId);
      if (!rm || out.has(rm.key) || entry.level !== rm.level) throw new Error('Room не найден, повторяется или указан другой уровень: '+entry.externalId);
      const segs = segments(entry.loops);
      if (!closed(segs)) throw new Error('Контур Room не замкнут: '+entry.externalId);
      out.set(rm.key, { segments:segs, source:'границы Room из файла' });
    }
    return out;
  }
  function raster(Rp, rooms, excluded) {
    rooms.forEach(r=>{delete r.reg;delete r.geometryError;});
    const R = {...Rp, lab:new Int32Array(Rp.lab.length), regs:[null], ext:new Set()}, owner = new Int32Array(Rp.lab.length).fill(-1);
    const conflicts = new Set(), valid = rooms.filter(r=>r.geometry && closed(r.geometry.segments));
    valid.forEach((rm,k)=>{
      const segs=rm.geometry.segments;
      const xs=segs.flatMap(s=>[s[0],s[2]]),ys=segs.flatMap(s=>[s[1],s[3]]);
      const x0=Math.max(0,Math.floor((Math.min(...xs)-R.minx)/R.cell)),x1=Math.min(R.W-1,Math.ceil((Math.max(...xs)-R.minx)/R.cell));
      const y0=Math.max(0,Math.floor((Math.min(...ys)-R.miny)/R.cell)),y1=Math.min(R.H-1,Math.ceil((Math.max(...ys)-R.miny)/R.cell));
      for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)if(inside(segs,R.minx+(i+.5)*R.cell,R.miny+(j+.5)*R.cell)) {
        const p=j*R.W+i;
        if(owner[p]>=0){conflicts.add(owner[p]);conflicts.add(k);}else owner[p]=k;
      }
    });
    const spaces=[], indexes=new Map();
    valid.forEach((rm,k)=>{
      delete rm.reg;
      if(conflicts.has(k)){rm.geometryError='Перекрываются контуры Room';return;}
      if(excluded(rm))return;
      const id=R.regs.length; indexes.set(k,id);rm.reg=id;
      R.regs.push({id,room:rm,areaC:0,areaV:0,cells:0,cx:0,cy:0,border:false});
      spaces.push({key:rm.key,rooms:[rm],regIds:[id],grow:[],merged:false,manual:false,links:[],auxNb:[],balance:[],byUser:[],unknown:[],neighbours:[],excludedNeighbours:[],roomGeometry:true});
    });
    const lab=new Int32Array(R.lab.length).fill(-1);
    for(let p=0;p<owner.length;p++){
      const id=indexes.get(owner[p]);if(!id)continue;
      R.lab[p]=id;lab[p]=id-1;const rg=R.regs[id];rg.cells++;rg.cx+=R.minx+(p%R.W+.5)*R.cell;rg.cy+=R.miny+(Math.floor(p/R.W)+.5)*R.cell;
    }
    R.regs.forEach(r=>{if(r){r.areaC=r.areaV=r.cells*R.cell*R.cell;r.cx/=r.cells||1;r.cy/=r.cells||1;}});
    return {R,lab,spaces,unknown:[],unplaced:rooms.filter(r=>!r.reg&&!excluded(r))};
  }
  return {segments,closed,inside,section,footprint,importData,raster};
})();
if(typeof module!=='undefined')module.exports=BimRooms;
