/* Local Viewer preview only. No published assets, core formulas or model files are changed. */
(function installKeoPreview(lib, fixtures) {
  window.KeoLocalPreview?.remove?.();
  const root=document.createElement('div');root.id='keo-local-preview';
  root.innerHTML=`<style>
  #keo-local-preview{font:14px/1.5 system-ui,sans-serif;color:#172b36;position:fixed;right:22px;top:125px;z-index:99999}
  #keo-local-preview *{box-sizing:border-box}#keo-local-preview button,#keo-local-preview select{font:inherit;cursor:pointer}
  #keo-local-preview button{border:1px solid #cbd8dd;border-radius:9px;padding:9px 13px;background:white;color:#193e4a}
  #keo-local-preview .close{opacity:1;float:none;text-shadow:none;color:#193e4a}
  #keo-local-preview .launch{background:#14675e;color:white;border:0;box-shadow:0 4px 18px #0003;float:right;font-weight:650}
  #keo-local-preview .panel{clear:both;margin-top:50px;width:min(470px,calc(100vw - 36px));max-height:calc(100vh - 195px);overflow:auto;background:#fff;border:1px solid #d9e3e5;border-radius:15px;box-shadow:0 12px 40px #102c3033;padding:20px}
  #keo-local-preview [hidden]{display:none!important}#keo-local-preview h2{font-size:21px;margin:0}#keo-local-preview h3{font-size:16px;margin:14px 0 8px}
  #keo-local-preview p{margin:9px 0}#keo-local-preview .muted{color:#637780;font-size:12px}#keo-local-preview .head{display:flex;justify-content:space-between;gap:10px}
  #keo-local-preview .tabs{display:flex;gap:8px;margin:16px 0}#keo-local-preview [aria-pressed=true]{background:#e2f2ed;border-color:#6caaa0;color:#12564b}
  #keo-local-preview select{width:100%;padding:10px;border:1px solid #cbd8dd;border-radius:8px;background:white}
  #keo-local-preview .stats{display:flex;gap:8px;margin:12px 0}#keo-local-preview .stat{flex:1;border-radius:9px;background:#f1f6f7;padding:10px;font-size:12px}#keo-local-preview .stat b{display:block;font-size:23px}
  #keo-local-preview .notice{background:#fff7e8;border:1px solid #efd7ab;padding:10px 12px;border-radius:9px;font-size:12px}
  #keo-local-preview svg{width:100%;height:220px;display:block;border-radius:10px;background:#f5f8fa;margin:12px 0}
  #keo-local-preview .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}#keo-local-preview .result{font-size:30px;font-weight:700;color:#14675e}
  #keo-local-preview .plan{position:fixed;left:18px;right:510px;top:175px;bottom:20px;background:white;border:1px solid #d9e3e5;border-radius:15px;padding:18px;box-shadow:0 12px 40px #102c3022;display:flex;flex-direction:column;gap:8px;overflow:hidden}
  #keo-local-preview .plan svg{height:100%;min-height:180px;margin:0;touch-action:none;cursor:grab;background:#f7f9fa}
  #keo-local-preview .plan .canvas{min-height:150px;flex:1;overflow:hidden;border-radius:10px}
  #keo-local-preview .legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11px}#keo-local-preview .dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px}
  #keo-local-preview .filters{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap}#keo-local-preview .filters button{padding:5px 9px;font-size:12px}
  #keo-local-preview input[type=search]{width:100%;border:1px solid #cbd8dd;border-radius:8px;padding:9px;font:inherit}
  #keo-local-preview details{border-top:1px solid #e3e9eb;margin-top:12px;padding-top:10px}#keo-local-preview summary{font-weight:600;cursor:pointer}
  #keo-local-preview table{width:100%;border-collapse:collapse;font-size:12px;margin:9px 0}#keo-local-preview td,#keo-local-preview th{padding:6px 5px;border-bottom:1px solid #e6ecee;text-align:left;vertical-align:top;overflow-wrap:anywhere}
  #keo-local-preview .pill{display:inline-block;background:#eceff2;color:#52616c;border-radius:5px;padding:3px 7px;font-size:11px}
  #keo-local-preview .detail-contour svg{height:150px}#keo-local-preview .missing{max-height:70px;overflow:auto;font-size:11px}
  #keo-local-preview .missing button{padding:2px 6px;margin:2px;font-size:11px}#keo-local-preview .small{font-size:12px}
  #keo-local-preview .sample-report{overflow:auto}#keo-local-preview .sample-report svg{height:auto}#keo-local-preview .report-formula{background:#f2f6f8;padding:10px;overflow:auto}
  @media(max-width:900px){#keo-local-preview .plan{right:420px}#keo-local-preview .panel{width:380px}}
  </style>
  <button class="launch" aria-expanded="false">КЕО · посмотреть тест</button>
  <section class="panel" aria-label="Локальный тест КЕО" hidden>
    <div class="head"><div><h2>КЕО по модели</h2><div class="muted">Локальный тест · без публикации</div></div><button class="close" aria-label="Закрыть панель КЕО">✕</button></div>
    <div class="tabs"><button data-tab="model" aria-pressed="true">Помещения IFC</button><button data-tab="apertures" aria-pressed="false">Проёмы</button><button data-tab="sample" aria-pressed="false">Пример расчёта</button></div>
    <div class="body"></div>
    <div class="muted" style="margin-top:16px">Тестовая панель действует до обновления страницы.</div>
  </section><section class="plan" aria-label="План помещений IFC" hidden></section>`;
  document.body.append(root);
  const $=s=>root.querySelector(s),body=$('.body');
  const audit=window.KeoNativeSectionAudit,rooms=(audit?.rows||[]).filter(r=>r.category==='Rooms').slice().sort((a,b)=>String(a.number).localeCompare(String(b.number),'ru',{numeric:true}));
  let active='model',roomId=rooms[0]?.id,sample='four',current;
  let query='',filter='all',level=rooms.find(r=>r.id===roomId)?.level,viewMode='plan',zoomBox=null;
  const viewer=window.NOP_VIEWER,boundModel=viewer?.model,unitScale=boundModel?.getUnitScale(),overlayName='keo-native-preview-overlay',cutName='keo-native-preview-cut';
  let viewSnapshot=null,selectionSnapshot=null,overlayMeshes=[],overlayLabels=null,overlayActive=false,disposed=false;
  const openingAudit=window.KeoNativeOpeningAudit;
  const relationAudit=window.KeoIfcRelationAudit;
  const relationMap=new Map((relationAudit?.candidates||[]).map(c=>[c.guid,c]));
  const apertureRows=(window.KeoNativeApertureAudit?.rows||[]).map(r=>({...r,face:r.result.patches.filter(p=>p.status==='planar-contour').slice().sort((a,b)=>b.area-a.area)[0]}));
  const sourceHash=relationAudit?.source?.sha256,modelUrn=boundModel?.getData()?.urn;
  const modelKey=typeof sourceHash==='string'&&/^[a-f\d]{64}$/i.test(sourceHash)&&typeof modelUrn==='string'&&modelUrn?sourceHash+'|'+modelUrn:null;
  const optics=window.KeoNativeOpticsSettings?.modelKey===modelKey?window.KeoNativeOpticsSettings:{version:1,modelKey,common:{},types:{},elements:{}};
  if(modelKey)window.KeoNativeOpticsSettings=optics;
  let apertureGroup='upper',apertureId=null,opticsScope='type',prismRoomGuid=null;
  const kindOf=r=>r.ifcClass==='IfcWindow'?(r.face?.inclinationDeg<45?'upper':'window'):r.ifcClass==='IfcPlate'?'panel':'door';
  const levels=[...new Set(rooms.map(r=>r.level))].sort();
  const reasonText={'open-or-branching-section':'Сечение не образует замкнутые контуры: есть разрывы или ветвления.','no-height-for-diagnostic-cut':'Для сечения на выбранной высоте не хватает геометрии по высоте.','missing-native-geometry':'Не получена треугольная геометрия IfcSpace.','self-intersecting-section':'Контур пересекает сам себя.','intersecting-contours':'Контуры пересекаются.','crossing-or-touching-contours':'Контуры пересекаются или касаются; алгоритм не может однозначно отделить внутреннюю область от отверстий.','cut-coincides-with-surface':'Плоскость сечения совпала с поверхностью геометрии. На этой отметке однозначный замкнутый контур не получен.','missing-or-duplicate-guid':'Отсутствует уникальный IFC GlobalId.'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:2}):'—';
  function contour(loops){
    const p=loops.flat();if(!p.length)return '<p>Замкнутый контур пока не получен.</p>';
    const lo=[Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1]))],hi=[Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];
    const scale=Math.min(360/Math.max(hi[0]-lo[0],.001),170/Math.max(hi[1]-lo[1],.001));
    const x=v=>210+(v-(lo[0]+hi[0])/2)*scale,y=v=>110-(v-(lo[1]+hi[1])/2)*scale;
    return `<svg viewBox="0 0 420 220" role="img" aria-label="Контур сечения помещения из IFC"><path d="${loops.map(l=>'M'+l.map(p=>`${x(p[0])},${y(p[1])}`).join('L')+'Z').join(' ')}" fill="#dbe1e5" fill-rule="evenodd" stroke="#647785" stroke-width="2"/></svg>`;
  }
  function download(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function matching(){const q=query.trim().toLocaleLowerCase('ru');return rooms.filter(r=>(!q||`${r.number} ${r.name} ${r.level}`.toLocaleLowerCase('ru').includes(q))&&(filter!=='clubs'||/^кружков/i.test(r.name||''))&&(filter!=='missing'||r.status!=='closed-section'));}
  function choose(id){const r=rooms.find(r=>r.id===id);if(!r)return;roomId=id;if(level!==r.level){level=r.level;zoomBox=null;}model();if(overlayActive)showViewer(r);}
  function bounds(rs){const ps=rs.flatMap(r=>r.loops||[]).flat();return ps.length?{x0:Math.min(...ps.map(p=>p[0])),y0:Math.min(...ps.map(p=>p[1])),x1:Math.max(...ps.map(p=>p[0])),y1:Math.max(...ps.map(p=>p[1]))}:null;}
  const labelPoints=new Map();
  function labelPoint(r){if(labelPoints.has(r.id))return labelPoints.get(r.id);const b=bounds([r]);if(!b)return null;let best=null;
    // Interior grid is used only to place a text label, never as a KEO calculation point.
    for(let j=0;j<15;j++)for(let i=0;i<15;i++){const p=[b.x0+(i+.5)*(b.x1-b.x0)/15,b.y0+(j+.5)*(b.y1-b.y0)/15];if(lib.NativeSpaces.locate(r.loops,p)!=='inside')continue;const d=(p[0]-(b.x0+b.x1)/2)**2+(p[1]-(b.y0+b.y1)/2)**2;if(!best||d<best.d)best={p,d};}
    const p=best?.p||r.loops[0][0];labelPoints.set(r.id,p);return p;}
  function plan(){
    const box=$('.plan');box.hidden=active!=='model'||viewMode!=='plan'||$('.panel').hidden;if(box.hidden)return;
    const rs=rooms.filter(r=>r.level===level),valid=rs.filter(r=>r.status==='closed-section'),missing=rs.filter(r=>r.status!=='closed-section'),b=bounds(valid);
    box.innerHTML=`<div class="head"><div><h2>План ${esc(level)}</h2><div class="muted">${valid.length} контуров · ${missing.length} без контура · КЕО не рассчитан</div></div><button class="to-viewer">Срез в Viewer</button></div><div class="filters">${levels.map(l=>`<button data-level="${esc(l)}" aria-pressed="${l===level}">${esc(l)}</button>`).join('')}<button class="fit-plan">Весь этаж</button><button class="zoom-room">К помещению</button><button class="zoom-in" aria-label="Увеличить план">＋</button><button class="zoom-out" aria-label="Уменьшить план">−</button></div><div class="legend"><span><i class="dot" style="background:#2e9d5b"></i>Проходит</span><span><i class="dot" style="background:#d9443a"></i>Не проходит</span><span><i class="dot" style="background:#9ca7b1"></i>Уточнить / вне расчёта</span></div><div class="canvas"></div><div class="muted">Клик по контуру — карточка; колесо — масштаб, перетаскивание — сдвиг. Метка «— %» означает отсутствие расчёта, а не нулевой КЕО.</div>${missing.length?`<div class="missing">Не скрыты из списка, но пока без контура: ${missing.map(r=>`<button data-room="${r.id}" title="${esc(r.name)}">${esc(r.number)}</button>`).join('')}</div>`:''}`;
    box.querySelectorAll('[data-level]').forEach(btn=>btn.onclick=()=>{level=btn.dataset.level;zoomBox=null;plan();if(overlayActive)showViewer();});box.querySelectorAll('[data-room]').forEach(btn=>btn.onclick=()=>choose(Number(btn.dataset.room)));
    $('.to-viewer').onclick=()=>showViewer();if(!b)return;
    const sx=740/Math.max(b.x1-b.x0,.1),sy=530/Math.max(b.y1-b.y0,.1),s=Math.min(sx,sy),tx=x=>400+(x-(b.x0+b.x1)/2)*s,ty=y=>300-(y-(b.y0+b.y1)/2)*s;
    const matchIds=new Set(matching().map(r=>r.id));
    $('.canvas').innerHTML=`<svg viewBox="${zoomBox||'0 0 800 600'}" role="img" aria-label="План ${esc(level)} с контурами и статусами помещений">${valid.map(r=>{const p=labelPoint(r),selected=r.id===roomId;return `<g data-room="${r.id}" role="button" tabindex="0" aria-label="${esc(r.number+' '+r.name)}" style="cursor:pointer;opacity:${matchIds.has(r.id)?1:.22}"><title>${esc(r.number+' · '+r.name)} — КЕО не рассчитан</title><path d="${r.loops.map(l=>'M'+l.map(p=>`${tx(p[0])},${ty(p[1])}`).join('L')+'Z').join(' ')}" fill="${selected?'#9cb4c5':'#d8dee3'}" fill-rule="evenodd" stroke="${selected?'#205c8a':'#8999a4'}" stroke-width="${selected?2.5:.8}" vector-effect="non-scaling-stroke"/>${p?`<text x="${tx(p[0])}" y="${ty(p[1])}" text-anchor="middle" fill="#31444f" font-size="${selected?8:6}" font-weight="${selected?700:500}" pointer-events="none">${esc(r.number)}<tspan x="${tx(p[0])}" dy="7">— %</tspan></text>`:''}</g>`}).join('')}</svg>`;
    const svg=$('.canvas svg');let drag=null,moved=false;const vb=()=>svg.viewBox.baseVal;
    const set=(x,y,w,h)=>{zoomBox=[x,y,w,h].join(' ');svg.setAttribute('viewBox',zoomBox);};
    const zoom=(factor,cx=.5,cy=.5)=>{const a=vb(),w=Math.min(2400,Math.max(50,a.width*factor)),h=w*.75;set(a.x+(a.width-w)*cx,a.y+(a.height-h)*cy,w,h);};
    svg.onwheel=e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoom(e.deltaY>0?1.15:1/1.15,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);};
    svg.onpointerdown=e=>{if(e.button!==0)return;const a=vb();drag={x:e.clientX,y:e.clientY,bx:a.x,by:a.y,w:a.width,h:a.height};moved=false;svg.setPointerCapture(e.pointerId);};
    svg.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;if(moved){const r=svg.getBoundingClientRect();set(drag.bx-dx*drag.w/r.width,drag.by-dy*drag.h/r.height,drag.w,drag.h);}};
    svg.onpointerup=e=>{if(!moved){const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-room]');if(hit)choose(Number(hit.dataset.room));}drag=null;};
    svg.onpointercancel=()=>{drag=null;};svg.querySelectorAll('[data-room]').forEach(g=>g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(Number(g.dataset.room));}});
    $('.fit-plan').onclick=()=>{zoomBox=null;plan();};$('.zoom-in').onclick=()=>zoom(.7);$('.zoom-out').onclick=()=>zoom(1/.7);
    $('.zoom-room').onclick=()=>{const rb=bounds([rooms.find(r=>r.id===roomId)]);if(!rb)return;const w=Math.max((rb.x1-rb.x0)*s*1.8,(rb.y1-rb.y0)*s*1.8/ .75,60);set(tx((rb.x0+rb.x1)/2)-w/2,ty((rb.y0+rb.y1)/2)-w*.375,w,w*.75);};
  }
  function model(){
    const r=rooms.find(r=>r.id===roomId),closed=rooms.filter(r=>r.status==='closed-section').length;if(!r){body.textContent='Нет результатов геометрии для этой модели.';return;}
    const related=(openingAudit?.rows||[]).flatMap(o=>(o.result?.directions||[]).filter(d=>d.space?.ids?.includes(r.guid)).map(d=>({fragment:o.fragment,entity:o.entity?.IfcClass,status:d.status,distance:d.space.distance})));
    current={kind:'IFC geometry diagnostic, not calculator input',normativeVerified:false,sourceAccuracyVerified:false,room:r,openingProbes:related,keo:null,pass:null};
    const ok=r.status==='closed-section',reason=reasonText[r.reason]||('Алгоритм сечения остановлен: '+(r.reason||'неизвестная причина'));
    const area=r.propertyArea?.unit?.includes('squareMeters')?r.propertyArea.value:null;
    body.innerHTML=`<div class="muted">Текущая IFC-модель · геометрическая диагностика</div><div class="stats"><div class="stat"><b>${rooms.length}</b>все помещения</div><div class="stat"><b>${closed}</b>с контуром</div><div class="stat"><b>${rooms.length-closed}</b>без контура</div></div>
    <label for="keo-room-search">Поиск по номеру или названию</label><input id="keo-room-search" type="search" placeholder="Название или номер помещения" value="${esc(query)}"><div class="filters"><button data-filter="all" aria-pressed="${filter==='all'}">Все</button><button data-filter="clubs" aria-pressed="${filter==='clubs'}">Кружковые · ${rooms.filter(r=>/^кружков/i.test(r.name||'')).length}</button><button data-filter="missing" aria-pressed="${filter==='missing'}">Без контура · ${rooms.length-closed}</button></div><div class="muted match-count"></div><select id="keo-room-choice" aria-label="Помещение"></select>
    <div class="actions"><button class="open-plan">План IFC</button><button class="show-room">Срез в Viewer</button><button class="restore-view">Вернуть 3D</button></div>
    <h3>${esc(r.number)} · ${esc(r.name)}</h3><span class="pill">${esc(r.level)} · ${ok?'Контур есть · КЕО требует уточнения':'Контур требует разбора'}</span><div class="detail-contour">${contour(r.loops||[])}</div>
    <table><tr><td>КЕО / норма</td><td><b>— % / — %</b></td></tr><tr><td>Площадь сечения / IFC</td><td>${fmt(r.sectionArea)} / ${fmt(area)} м²</td></tr><tr><td>Отметка сечения</td><td>${fmt(r.cutZ)} м · на 1 м выше низа геометрии</td></tr><tr><td>Границы по высоте</td><td>${fmt(r.minZ)}…${fmt(r.maxZ)} м</td></tr><tr><td>Треугольники / контуры</td><td>${r.triangleCount} / ${(r.loops||[]).length}</td></tr></table>
    <p class="notice"><b>${ok?'Почему серое?':'Почему нет контура?'}</b> ${ok?'Сечение получено из собственного IfcSpace. Это ещё не доказывает принадлежность окон и фонарей, корректность расчётных точек и исходных коэффициентов. Нормативный вывод пока не сделан.':esc(reason)} Отсутствие расчёта не означает КЕО = 0.</p>
    <details open><summary>Ход проверки помещения</summary><table><tr><td>Идентичность</td><td>IfcSpace → GlobalId → собственная геометрия. Название и совпадение площадей не используются для поиска контура.</td></tr><tr><td>Сечение</td><td>${ok?'Замкнутые контуры получены. Отверстия сохранены.':'Не готово: '+esc(reason)}</td></tr><tr><td>Окна и фонари</td><td>Принадлежность не подтверждена. Диагностических пересечений с поверхностью комнаты: ${related.length}; они не являются количеством окон.</td></tr><tr><td>Расчётные точки</td><td>Не назначены. Маркер названия на плане — только подпись, не расчётная точка.</td></tr><tr><td>Норма и коэффициенты</td><td>Сочи указан пользователем. Назначение по нормам, север, оптика, отражение и затенение ещё не подтверждены для этого помещения.</td></tr><tr><td>Расчёт КЕО</td><td>Не запускался с подтверждёнными исходными этого IfcSpace.</td></tr></table></details>
    <details><summary>Происхождение данных и ограничения</summary><p class="small">Диагностическое горизонтальное сечение получено алгоритмом пересечения треугольников IFC с плоскостью. Точность исходного экспорта и нормативная пригодность этим не подтверждены. Геометрия не подбирается нейросетью.</p><p class="small">Viewer ID: ${r.id}<br>IFC GlobalId: ${esc(r.guid)}<br>Код геометрии: ${esc(r.status)}${r.reason?' / '+esc(r.reason):''}</p><p class="small">В IFC также есть ${(audit?.rows||[]).filter(r=>r.category==='Areas').length} объектов Areas. Они не подменяют помещения Rooms; все ${rooms.length} Rooms доступны в списке, в том числе без контура.</p></details>
    <details><summary>Диагностика световых проёмов</summary><p class="small">Пробные пересечения проверяют геометрию, но не подтверждают освещение через десятки метров. Прозрачный материал Viewer не задаёт светопропускание. Принадлежность, внешняя сторона и непрозрачные преграды должны проверяться отдельно.</p>${related.length?`<table><tr><th>Фрагмент</th><th>IFC-класс</th><th>Проба</th><th>Расстояние, м</th></tr>${related.slice(0,20).map(p=>`<tr><td>${p.fragment}</td><td>${esc(p.entity)}</td><td>${esc(p.status)}</td><td>${fmt(p.distance)}</td></tr>`).join('')}</table>${related.length>20?'<p class="muted">Первые 20 строк; полный список — в диагностическом JSON.</p>':''}`:'<p class="small">Нет диагностических пересечений. Это не доказывает отсутствие окон.</p>'}</details>
    <div class="actions"><button class="json">Диагностика помещения · JSON</button><button disabled title="Сначала нужны подтверждённые исходные помещения">JSON для калькулятора</button></div><p class="muted">Диагностика — отдельный формат. Для реального помещения файл калькулятора пока недоступен; рабочий экспорт можно проверить во вкладке «Пример расчёта».</p>`;
    const updateChoices=()=>{const list=matching();$('.match-count').textContent=`Найдено ${list.length} из ${rooms.length} · поиск по всем этажам`;
      $('#keo-room-choice').innerHTML=`${!list.some(o=>o.id===roomId)?'<option value="">Выберите помещение из найденных</option>':''}`+list.map(o=>`<option value="${o.id}" ${o.id===roomId?'selected':''}>${esc(o.number)} · ${esc(o.name)} · ${esc(o.level)}${o.status==='closed-section'?'':' · без контура'}</option>`).join('');plan();};
    $('#keo-room-search').oninput=e=>{query=e.target.value;updateChoices();};$('#keo-room-choice').onchange=e=>{if(e.target.value)choose(Number(e.target.value));};
    root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;query='';const list=matching();if(list.length&&!list.some(r=>r.id===roomId))roomId=list[0].id;level=rooms.find(r=>r.id===roomId)?.level;zoomBox=null;model();if(overlayActive)showViewer();});
    $('.open-plan').onclick=()=>{viewMode='plan';plan();};$('.show-room').onclick=()=>showViewer(r);$('.restore-view').onclick=()=>{restoreView();viewMode='viewer';plan();};$('.json').onclick=()=>download(current,'keo-ifc-diagnostic-'+String(r.number).replace(/[^\w.-]/g,'_')+'.json');updateChoices();
  }
  function clearOverlay(){
    if(overlayLabels){overlayLabels.remove();overlayLabels=null;}viewer?.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT,placeLabels);
    if(viewer?.overlays.hasScene(overlayName))viewer.overlays.removeScene(overlayName);
    overlayMeshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});overlayMeshes=[];overlayActive=false;
  }
  function restoreView(){clearOverlay();if(!viewSnapshot)return;try{viewer.impl.setCutPlaneSet(cutName,undefined);if(viewer.model===boundModel){viewer.restoreState(viewSnapshot,{viewport:true},true);if(selectionSnapshot)viewer.select(selectionSnapshot,boundModel);}}finally{viewSnapshot=null;selectionSnapshot=null;}}
  function placeLabels(){if(!overlayLabels||viewer.model!==boundModel)return;overlayLabels.querySelectorAll('button').forEach(b=>{const r=rooms.find(r=>r.id===Number(b.dataset.id)),p=labelPoint(r);if(!p)return;const a=viewer.worldToClient(new THREE.Vector3(p[0]/unitScale,p[1]/unitScale,(r.cutZ-.03)/unitScale));b.style.transform=`translate(${a.x}px,${a.y}px) translate(-50%,-50%)`;});}
  function drawOverlay(){
    clearOverlay();if(viewer.model!==boundModel)throw Error('Модель изменилась: нужен новый анализ.');
    viewer.overlays.addScene(overlayName);const rs=rooms.filter(r=>r.level===level&&r.status==='closed-section');
    for(const r of rs){
      const entries=r.loops.map((loop,i)=>({loop,i,containers:r.loops.map((other,j)=>j!==i&&lib.NativeSpaces.locate([other],loop[0])==='inside'?j:-1).filter(j=>j>=0)}));
      for(const outer of entries.filter(e=>e.containers.length%2===0)){
        const shape=new THREE.Shape(outer.loop.map(p=>new THREE.Vector2(p[0]/unitScale,p[1]/unitScale)));
        entries.filter(e=>e.containers.length===outer.containers.length+1&&e.containers.includes(outer.i)).forEach(h=>shape.holes.push(new THREE.Path(h.loop.map(p=>new THREE.Vector2(p[0]/unitScale,p[1]/unitScale)))));
        const geometry=new THREE.ShapeGeometry(shape),material=new THREE.MeshBasicMaterial({color:r.id===roomId?0x507f9f:0x9ca7b1,transparent:true,opacity:r.id===roomId?.75:.45,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
        const mesh=new THREE.Mesh(geometry,material);mesh.position.z=(r.cutZ-.03)/unitScale;mesh.renderOrder=12;viewer.overlays.addMesh(mesh,overlayName);overlayMeshes.push(mesh);
      }
    }
    overlayLabels=document.createElement('div');overlayLabels.id='keo-native-preview-labels';overlayLabels.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden';
    const visibleIds=new Set(matching().map(r=>r.id));
    for(const r of rs.filter(r=>visibleIds.has(r.id))){const b=document.createElement('button');b.dataset.id=r.id;b.textContent=r.number+' · — %';b.title=r.name+' — КЕО не рассчитан';b.style.cssText='position:absolute;left:0;top:0;pointer-events:auto;border:1px solid #fff;border-radius:3px;padding:1px 3px;font:10px system-ui;color:white;background:#697b88;cursor:pointer';b.onclick=()=>choose(r.id);overlayLabels.append(b);}
    viewer.container.append(overlayLabels);overlayActive=true;viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT,placeLabels);placeLabels();viewer.impl.invalidate(true,true,true);
  }
  function showViewer(room){
    try{if(viewer.model!==boundModel)throw Error('Открыта другая модель. Выполните новый анализ.');if(!viewSnapshot)viewSnapshot=viewer.getState({viewport:true});
      const rs=rooms.filter(r=>r.level===level&&r.status==='closed-section'),b=bounds(room&&room.loops?.length?[room]:rs);if(!b)throw Error('Нет геометрии для вида.');
      const heights=rs.map(r=>r.minZ).sort((a,b)=>a-b),z=room?.cutZ??heights[Math.floor(heights.length/2)]+1;
      viewer.impl.setCutPlaneSet(cutName,[new THREE.Vector4(0,0,1,-z/unitScale)]);
      const bb=new THREE.Box3(new THREE.Vector3(b.x0/unitScale,b.y0/unitScale,(z-.5)/unitScale),new THREE.Vector3(b.x1/unitScale,b.y1/unitScale,z/unitScale));
      const c=bb.getCenter(new THREE.Vector3()),size=bb.getSize(new THREE.Vector3());viewer.navigation.setView(new THREE.Vector3(c.x,c.y,c.z+Math.max(size.x,size.y)*1.3),c);viewer.navigation.setCameraUpVector(new THREE.Vector3(0,1,0));viewer.navigation.fitBounds(false,bb);
      viewMode='viewer';plan();drawOverlay();
    }catch(e){body.insertAdjacentHTML('afterbegin',`<p class="notice">${esc(e.message)}</p>`);}
  }
  function reportHTML(blocks){
    const rich=s=>lib.Report.richHTML(String(s??''));
    return blocks.map(b=>{
      if(['h1','h2','h3'].includes(b.type))return `<h3>${esc(b.text)}</h3>`;
      if(b.type==='p')return `<p class="small">${esc(b.text)}</p>`;
      if(b.type==='formula')return `<div class="report-formula">${b.lines.map(rich).join('<br>')}</div><div class="muted">${esc(b.src)}</div>`;
      if(b.type==='kv')return `<h4>${esc(b.title)}</h4><table>${b.rows.map(row=>'<tr>'+row.map(c=>'<td>'+rich(c)+'</td>').join('')+'</tr>').join('')}</table>`;
      if(b.type==='table')return `<h4>${esc(b.title)}</h4><table><tr>${b.cols.map(c=>'<th>'+rich(c.h)+'</th>').join('')}</tr>${b.rows.map(row=>'<tr>'+(Array.isArray(row)?row:row.cells).map(c=>'<td>'+rich(c)+'</td>').join('')+'</tr>').join('')}</table><p class="muted">${esc(b.note)}</p>`;
      if(b.type==='scheme')return b.schemes.map(s=>lib.Schemes.toSVG(s)).join('');
      if(b.type==='dan')return `<details><summary>Графики Данилюка</summary>${reportHTML(b.blocks)}</details>`;
      if(b.type==='verdict')return `<p class="notice">Только для контрольного примера: ${rich(b.left)}; ${b.ok?'проходит':'не проходит'}.</p>`;
      return '';
    }).join('');
  }
  function sampleView(){
    $('.plan').hidden=true;
    const f=fixtures[sample],r=lib.NativeSide.prepare(f,lib);current={kind:'synthetic control example, not the IFC model',input:f,result:r};
    if(r.status!=='preview'){body.textContent='Пример отклонён: '+r.reason;return;}
    const v=r.inputs,scale=Math.min(300/v.dp,155/v.bp),ox=60,oy=28,x=n=>ox+n*scale,y=n=>oy+n*scale;
    const windows=f.openings.map(o=>`<line x1="${ox}" y1="${y(o.inner[0][1])}" x2="${ox}" y2="${y(o.inner[1][1])}" stroke="#229dd0" stroke-width="7"/>`).join('');
    body.innerHTML=`<p class="notice"><b>Синтетический контрольный пример.</b> Значение ниже относится к тестовой комнате, а не к детскому саду в Viewer.</p>
    <label for="keo-sample-choice">Геометрия примера</label><select id="keo-sample-choice"><option value="four" ${sample==='four'?'selected':''}>Прямоугольная комната · 4 окна</option><option value="one" ${sample==='one'?'selected':''}>Прямоугольная комната · 1 окно</option></select>
    <svg viewBox="0 0 420 220" role="img" aria-label="План тестовой комнаты: окна синим, расчётная точка красным"><rect x="${ox}" y="${oy}" width="${v.dp*scale}" height="${v.bp*scale}" fill="#e1eee8" stroke="#568174" stroke-width="2"/>${windows}<circle cx="${x(r.point[0])}" cy="${y(r.point[1])}" r="5" fill="#bd4940"/><text x="${x(r.point[0])+9}" y="${y(r.point[1])-8}" fill="#943830" font-size="12">РТ</text><text x="60" y="208" font-size="12" fill="#536770">План · ${fmt(v.dp)} × ${fmt(v.bp)} м · высота ${fmt(v.H)} м</text></svg>
    <div class="muted">Синим — окна; красным — расчётная точка</div><h3>Результат контрольного примера</h3><div class="result">КЕО ${fmt(r.calculation.res.eFinal)} %</div>
    <p>Геометрия → параметры → существующий калькулятор.</p><div class="muted">Формулы калькулятора не изменены. Группа светового климата: ${esc(r.state.group)} (задана в примере). Фонари и внутренние препятствия в примере отсутствуют. Этот тест не подтверждает нормативную корректность всей IFC-модели.</div>
    <div class="actions"><button class="calc-json">JSON для калькулятора</button><button class="json">Диагностика теста · JSON</button></div><p class="muted">Для импорта в калькулятор скачайте «JSON для калькулятора» и выберите файл через «Открыть». Диагностический пакет калькулятор не принимает.</p><details><summary>Полный расчёт: формулы, коэффициенты, схемы</summary><div class="sample-report">${lib.Report&&lib.Schemes?reportHTML(lib.KEO.buildModel(r.state,r.calculation)):'Подробный отчёт не загружен.'}</div></details>`;
    $('#keo-sample-choice').onchange=e=>{sample=e.target.value;sampleView();};$('.json').onclick=()=>download(current,'keo-synthetic-diagnostic-'+sample+'.json');$('.calc-json').onclick=()=>download(r.state,'keo-calculator-synthetic-'+sample+'.json');
  }
  function prismData(row){
    const a=window.KeoNativePrismAudit,m=boundModel;
    const now={urn:m?.getData()?.urn,unit:m?.getUnitScale(),offset:m?.getData()?.globalOffset,placement:m?.getData()?.placementTransform?.elements,world:m?.getModelTransform?.()?.elements,fragments:m?.getFragmentList()?.getCount()};
    if(!a||a.busy||a.errors?.length||viewer.model!==m||Object.keys(now).some(k=>JSON.stringify(a.source?.[k])!==JSON.stringify(now[k])))return null;
    return a.rows.find(r=>r.fragment===row.fragment)||null;
  }
  function prismHTML(data){
    if(!data)return '<p class="muted">Диагностика вертикальной проекции для этого фрагмента не выполнена либо устарела.</p>';
    const tests=data.tests||[],q=tests.find(t=>t.spaceGuid===prismRoomGuid)||tests[tests.length-1];
    if(!q)return '<p class="notice">Нет проверенной пары с помещением. Частичное пересечение проекции и отсутствие контура требуют отдельного разбора; это не отсутствие света.</p>';
    prismRoomGuid=q.spaceGuid;
    const c=q.coverage,unknown=q.status==='unavailable',reason=q.reason==='nonconvex-or-crossing-footprint'?'Контур не выпуклый либо пересекает себя: этот диагностический алгоритм его пока не поддерживает.':q.reason==='degenerate-source-triangles'?'Внутри проверяемого объёма есть вырожденные треугольники.':q.reason;
    return `<h3>Что находится под проёмом</h3><p class="small">Проверяется весь объём вертикальной проекции от сечения помещения до грани проёма. Это геометрическая диагностика, не расчёт КЕО.</p>
      <label for="keo-prism-room">Помещение под проекцией · ${tests.length} вариантов</label><select id="keo-prism-room">${tests.map(t=>`<option value="${esc(t.spaceGuid)}" ${t===q?'selected':''}>${esc(t.number)} · ${esc(t.level)}</option>`).join('')}</select>
      <p class="notice">${unknown?esc(reason||'Геометрия требует уточнения.'):q.status==='intersected'?'Найдены пересекающие поверхности. Их материалы ещё не подтверждены; среди геометрии могут быть воздушные слои.':'Пересечения поверхностей не обнаружены либо есть только касание. Это не подтверждает свободный путь света.'}</p>
      <table><tr><td>Диапазон высот</td><td>${fmt(q.zMin)}–${fmt(q.zMax)} м</td></tr><tr><td>Фрагменты с пересечением</td><td>${q.hits?.filter(h=>h.interiorTriangles).length??'—'}</td></tr><tr><td>Площадь проекции</td><td>${fmt(c?.sourceArea)} м²</td></tr><tr><td>Не перекрыто проекциями поверхностей</td><td>${fmt(c?.remainingArea)} м²</td></tr></table>
      ${c?.status==='computed'?projectionDiagram(data.footprintLoops,c.remainingCells):`<p class="small">Площадь не определена: ${esc(reason||c?.reason||'нет геометрического результата')}.</p>`}
      <p class="muted">Серый — исходная проекция, синий — её остаток. Площадь в м² не является КЕО или долей прошедшего света. Проверены только стены, плиты и крыши; наклонные направления света, материалы и границы шахты ещё не определены.</p>
      <div class="actions"><button class="show-prism" ${q.hits?.length?'':'disabled'}>Показать пересечения</button><button class="restore-prism">Вернуть вид</button></div>
      <details><summary>Пересечённые элементы · ${q.hits?.length||0}</summary><table>${(q.hits||[]).map(h=>`<tr><td>${esc(h.ifcClass)} · фр. ${esc(h.id)}<br><span class="muted">Материал не проверен</span></td><td>${h.zRange?.map(fmt).join('–')||'Касание / неопределённость'} м</td></tr>`).join('')}</table></details>`;
  }
  function projectionDiagram(loops,cells){
    const ps=loops.flat(),lo=[0,1].map(k=>Math.min(...ps.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...ps.map(p=>p[k]))),s=Math.min(360/Math.max(hi[0]-lo[0],.001),170/Math.max(hi[1]-lo[1],.001));
    const path=ls=>ls.map(l=>'M'+l.map(p=>`${210+(p[0]-(lo[0]+hi[0])/2)*s},${110-(p[1]-(lo[1]+hi[1])/2)*s}`).join('L')+'Z').join(' ');
    return `<svg viewBox="0 0 420 220" role="img" aria-label="Вертикальная проекция проёма и остаток после пересечения геометрии"><path d="${path(loops)}" fill="#b6c0c6" stroke="#637780"/><path d="${path(cells||[])}" fill="#399aca" stroke="none"/></svg>`;
  }
  function showPrism(data){
    const q=data?.tests.find(t=>t.spaceGuid===prismRoomGuid);if(!q)return;
    if(viewer.model!==boundModel)throw Error('Модель изменилась.');
    restoreView();viewSnapshot=viewer.getState({viewport:true});selectionSnapshot=viewer.getSelection().slice();
    const ps=data.footprintLoops.flat(),lo=[Math.min(...ps.map(p=>p[0]))-1,Math.min(...ps.map(p=>p[1]))-1,q.zMin-.2],hi=[Math.max(...ps.map(p=>p[0]))+1,Math.max(...ps.map(p=>p[1]))+1,q.zMax+.5];
    viewer.impl.setCutPlaneSet(cutName,[new THREE.Vector4(-1,0,0,lo[0]/unitScale),new THREE.Vector4(1,0,0,-hi[0]/unitScale),new THREE.Vector4(0,-1,0,lo[1]/unitScale),new THREE.Vector4(0,1,0,-hi[1]/unitScale),new THREE.Vector4(0,0,-1,lo[2]/unitScale),new THREE.Vector4(0,0,1,-hi[2]/unitScale)]);
    const bb=new THREE.Box3(new THREE.Vector3(...lo.map(v=>v/unitScale)),new THREE.Vector3(...hi.map(v=>v/unitScale))),c=bb.getCenter(new THREE.Vector3()),d=bb.getSize(new THREE.Vector3()).length();
    viewer.select([...new Set((q.hits||[]).map(h=>h.dbId))],boundModel);viewer.navigation.setView(new THREE.Vector3(c.x+d,c.y-d,c.z+d*.35),c);viewer.navigation.setCameraUpVector(new THREE.Vector3(0,0,1));viewer.navigation.fitBounds(true,bb);
    // Leave room for our own panel without changing the Viewer's DOM or model.
    const nav=viewer.navigation,pos=nav.getPosition().clone(),target=nav.getTarget().clone(),cam=nav.getCamera(),right=target.clone().sub(pos).cross(nav.getCameraUpVector()).normalize();
    const shift=right.multiplyScalar(pos.distanceTo(target)*Math.tan(cam.fov*Math.PI/360)*cam.aspect*.42);
    if([shift.x,shift.y,shift.z].every(Number.isFinite))nav.setView(pos.add(shift),target.add(shift));
    viewer.impl.invalidate(true,true,true);
  }
  function apertureView(){
    $('.plan').hidden=true;
    if(!lib.Optics||!apertureRows.length||!relationAudit||!modelKey){body.innerHTML='<p class="notice">Новый аудит проёмов с идентификаторами исходного файла и модели ещё не загружен в эту вкладку.</p>';return;}
    const groups={upper:'Верхние',panel:'Панели',window:'Окна',door:'Двери'};
    const list=apertureRows.filter(r=>kindOf(r)===apertureGroup);
    let row=list.find(r=>r.fragment===apertureId)||list[0];if(!row){body.textContent='В этой группе нет полученной геометрии.';return;}
    apertureId=row.fragment;const c=relationMap.get(row.guid),face=row.face;
    const type=c?.declaredType,typeGuid=type?.guid,ctx={modelKey,typeGuid,elementGuid:row.guid};
    if(opticsScope==='type'&&!typeGuid)opticsScope='element';
    const resolved=lib.Optics.resolve(optics,ctx,lib.DATA),direct=c?.directSpaces||[],container=c?.containerSpaces||[];
    const roomName=guid=>{const r=rooms.find(r=>r.guid===guid);return r?r.number+' · '+r.name:guid;};
    const holder=opticsScope==='common'?optics.common:opticsScope==='type'?(optics.types[typeGuid]||{}):(optics.elements[row.guid]||{});
    const prism=prismData(row);
    current={kind:'aperture geometry and explicit optics diagnostic',row,ifc:c,optics:resolved,modelKey,prism,prismScope:window.KeoNativePrismAudit?.limits,keo:null,pass:null};
    body.innerHTML=`<p class="notice"><b>Контуры получены алгоритмом.</b> Это кандидаты в световые проёмы: прозрачность рендера и IFC-класс не подтверждают физическое светопропускание.</p>
      <div class="filters">${Object.entries(groups).map(([k,v])=>`<button data-aperture-group="${k}" aria-pressed="${k===apertureGroup}">${v} · ${apertureRows.filter(r=>kindOf(r)===k).length}</button>`).join('')}</div>
      <label for="keo-aperture-choice">Элемент и фрагмент</label><select id="keo-aperture-choice">${list.map(r=>`<option value="${r.fragment}" ${r.fragment===apertureId?'selected':''}>${esc(relationMap.get(r.guid)?.declaredType?.name||relationMap.get(r.guid)?.name||r.ifcClass)} · фр. ${r.fragment}</option>`).join('')}</select>
      <h3>${esc(groups[apertureGroup])} · контур грани</h3>${face?contour(face.loops):'<p>Замкнутая плоская грань не получена.</p>'}
      <div class="muted">Контур в собственной плоскости грани. Показана крупнейшая грань фрагмента; обратная сторона и торцы не суммируются как отдельные окна.</div>
      <table><tr><td>Площадь грани</td><td>${fmt(face?.area)} м²</td></tr><tr><td>Наклон к горизонтали</td><td>${fmt(face?.inclinationDeg)}°</td></tr><tr><td>Плоские участки фрагмента</td><td>${row.result.patchCount??row.result.patches.length}</td></tr><tr><td>Тип IFC</td><td>${esc(type?.name||'Не указан')}</td></tr><tr><td>Связи с помещениями</td><td>${direct.length} прямых · ${container.length} через всю сборку</td></tr></table>
      <div class="actions"><button class="show-aperture">Показать в Viewer</button><button class="aperture-json">Диагностика · JSON</button></div>
      ${prismHTML(prism)}
      <details><summary>Связи IFC и ограничения</summary><p class="small">${direct.length?'Записаны связи с: '+direct.map(roomName).map(esc).join('; '):'Прямой связи с помещением в IFC нет.'}</p>${container.length?`<p class="small">Вся сборка граничит с: ${container.map(roomName).map(esc).join('; ')}. Эти связи не назначают данную панель всем перечисленным помещениям.</p>`:''}<p class="small">${c?.external===false?'В IFC указан IsExternal=false. Одного этого поля недостаточно для решения о наружной стороне. ':''}Принадлежность, наружная сторона, шахта и путь через ограждения требуют геометрической проверки. GUID сопоставлен с Viewer; совпадение ревизии исходного файла и конвертации отдельно не подтверждено.</p><p class="muted">Плоскость: допуск ${fmt(row.result.planarityTolerance*1000)} мм; это настройка диагностики, не подтверждённая точность IFC. Верхняя группа определяется наклоном крупнейшей грани менее 45°, только для просмотра, не для выбора формулы СП.</p></details>
      <h3>Остекление и переплёт</h3><label for="keo-optics-scope">Применить выбор</label><select id="keo-optics-scope"><option value="type" ${opticsScope==='type'?'selected':''} ${!typeGuid?'disabled':''}>К этому типу IFC${!typeGuid?' — тип не найден':''}</option><option value="element" ${opticsScope==='element'?'selected':''}>К этому элементу</option><option value="common" ${opticsScope==='common'?'selected':''}>Общие параметры модели</option></select>
      ${['t1','t2'].map(f=>`<label for="keo-optics-${f}">${f==='t1'?'Остекление · τ₁':'Переплёт · τ₂'}</label><select id="keo-optics-${f}"><option value="">${opticsScope==='common'?'Не задано':'По общим параметрам'}</option>${lib.DATA[f==='t1'?'tau1':'tau2'].map((t,i)=>`<option value="${i}" ${holder[f]?.index===i?'selected':''}>${esc(t.t)} · ${fmt(t.v)}${t.r?' (табл.: '+esc(t.r)+')':''}</option>`).join('')}</select>`).join('')}
      <p class="small">Применяется τ₁: <b>${fmt(resolved.values.t1)}</b>; τ₂: <b>${fmt(resolved.values.t2)}</b>. ${resolved.status==='specified'?'Выбрано пользователем по таблицам.':'Задайте недостающие параметры.'}</p>
      <p class="muted">СП 367.1325800.2025, п. Б.2.7, таблицы Б.13–Б.15. Используются неизменённые значения ручного калькулятора. Для строки с диапазоном рядом явно показано принятое значение. Выбор не подтверждает материал изделия; τ₃, τ₄, τ₅ и другие исходные требуют отдельного определения.</p>
      <p class="notice">Для бокового расчёта по Б.2.7 требуется наружный обмер коробки переплёта. Контур самого стекла показан для проверки геометрии; подставлять его вместо коробки вместе с τ₂ нельзя.</p>
      <button class="optics-json">Скачать настройки остекления</button><p class="muted">Настройки действуют в текущем сеансе и выгружаются отдельно. Пока это подготовка исходных, КЕО модели не рассчитан.</p>`;
    root.querySelectorAll('[data-aperture-group]').forEach(b=>b.onclick=()=>{apertureGroup=b.dataset.apertureGroup;apertureId=null;apertureView();});
    $('#keo-aperture-choice').onchange=e=>{apertureId=Number(e.target.value);apertureView();};
    $('#keo-optics-scope').onchange=e=>{opticsScope=e.target.value;apertureView();};
    for(const f of ['t1','t2'])$('#keo-optics-'+f).onchange=e=>{const dest=opticsScope==='common'?optics.common:opticsScope==='type'?(optics.types[typeGuid]??={}):(optics.elements[row.guid]??={});if(e.target.value==='')delete dest[f];else dest[f]=lib.Optics.select(f,Number(e.target.value),lib.DATA);apertureView();};
    $('.show-aperture').onclick=()=>{restoreView();viewer.select(row.dbId,viewer.model);viewer.fitToView([row.dbId],viewer.model);};
    if($('#keo-prism-room'))$('#keo-prism-room').onchange=e=>{prismRoomGuid=e.target.value;apertureView();};
    if($('.show-prism'))$('.show-prism').onclick=()=>{try{showPrism(prismData(row));}catch(e){body.insertAdjacentHTML('afterbegin',`<p class="notice">${esc(e.message)}</p>`);}};
    if($('.restore-prism'))$('.restore-prism').onclick=restoreView;
    $('.aperture-json').onclick=()=>download(current,'keo-aperture-diagnostic-'+row.fragment+'.json');
    $('.optics-json').onclick=()=>download(optics,'keo-model-optics.json');
  }
  function render(){root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===active)));active==='model'?model():active==='apertures'?apertureView():sampleView();}
  function open(value){$('.panel').hidden=!value;$('.launch').setAttribute('aria-expanded',String(value));if(value)render();else{ $('.plan').hidden=true;restoreView();}}
  $('.launch').onclick=()=>open($('.panel').hidden);$('.close').onclick=()=>open(false);
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{active=b.dataset.tab;render();});
  window.KeoLocalPreview={remove:()=>{disposed=true;clearInterval(staleTimer);restoreView();root.remove();},getReport:()=>current,version:4};
  const staleTimer=setInterval(()=>{if(disposed||viewer.model===boundModel)return;clearInterval(staleTimer);clearOverlay();root.querySelectorAll('button,select,input').forEach(el=>el.disabled=true);$('.plan').hidden=true;body.innerHTML='<p class="notice">Модель изменилась. Эти результаты больше не относятся к открытому виду; нужен новый анализ.</p>';},1000);
  return {installed:true,rooms:rooms.length};
})
