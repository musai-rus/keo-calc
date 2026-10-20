/* Local research UI only. Geometry colours never represent a KEO verdict. */
(()=>{
  const snapshots=window.KeoRibbonSectionSnapshots,levels=window.KeoRibbonAdjacencyLevels;
  if(!Array.isArray(snapshots)||!Array.isArray(levels)||!levels.length)throw Error('ribbon-levels-required');
  const v=NOP_VIEWER,m=v.model,source=levels[0].source;
  const fresh=()=>{
    const C=KeoNativeGeom.ctx(v),now={urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()};
    return v.model===m&&JSON.stringify(now)===JSON.stringify(source.viewerSnapshot);
  };
  if(!fresh()||levels.some(l=>JSON.stringify(l.source)!==JSON.stringify(source)))throw Error('ribbon-source-mismatch');
  const capture=l=>snapshots.find(a=>a.version===2&&!a.busy&&!a.errors.length&&a.z===l.z&&a.completedAt===l.sectionCapturedAt&&JSON.stringify(a.source)===JSON.stringify(source));
  if(levels.some(l=>!capture(l)))throw Error('ribbon-section-capture-mismatch');
  window.KeoRibbonPanel?.remove();
  const root=document.createElement('section');root.id='keo-ribbon-study';
  const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const num=x=>Number(x).toLocaleString('ru-RU',{minimumFractionDigits:3,maximumFractionDigits:5});
  root.innerHTML=`<style>
    #keo-ribbon-study{position:fixed;z-index:100003;left:20px;top:115px;width:min(790px,calc(100vw - 40px));max-height:calc(100vh - 140px);overflow:auto;box-sizing:border-box;background:#fff;border:1px solid #b6c6d3;border-radius:14px;padding:18px;color:#21384c;font:14px/1.45 system-ui;box-shadow:0 8px 30px #0003}
    #keo-ribbon-study h2{font-size:21px;margin:0 0 6px}#keo-ribbon-study p{margin:8px 0}#keo-ribbon-study .note{color:#5e7182;font-size:12px}#keo-ribbon-study .controls{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}#keo-ribbon-study select{display:block;padding:7px;max-width:100%;border:1px solid #c4d0dc;border-radius:7px;background:white;color:inherit}
    #keo-ribbon-study button{float:right;border:1px solid #c4d0dc;border-radius:7px;background:white;padding:5px 10px;cursor:pointer}#keo-ribbon-study svg{display:block;width:100%;height:auto;max-height:390px;background:#f8fafc;border-radius:8px}#keo-ribbon-study table{width:100%;border-collapse:collapse;font-size:12px}#keo-ribbon-study th,#keo-ribbon-study td{border-bottom:1px solid #e3e8ee;padding:6px;text-align:left}#keo-ribbon-study .bar{display:flex;height:24px;border:1px solid #d1dbe4;margin:5px 0 9px;overflow:hidden;border-radius:4px}#keo-ribbon-study .legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px}#keo-ribbon-study .swatch{display:inline-block;width:10px;height:10px;margin-right:4px}#keo-ribbon-study details{margin:10px 0}
  </style><button aria-label="Закрыть привязку витража">✕</button><h2>Витраж → помещения</h2><p class="note">Проверка непрерывных участков на выбранной высоте. Цвет показывает первую встреченную границу, а не соответствие КЕО.</p><div class="controls"><label>Отметка сечения, м<select aria-label="Отметка сечения"></select></label><label>Панель витража<select aria-label="Панель витража"></select></label></div><div data-view></div>`;
  const levelSelect=root.querySelectorAll('select')[0],panelSelect=root.querySelectorAll('select')[1],view=root.querySelector('[data-view]');
  levelSelect.innerHTML=levels.map((l,i)=>`<option value="${i}">${num(l.z)}</option>`).join('');
  const colours=['#367dc4','#8564bc','#28898b','#b56691','#698236','#a67b35'];
  function draw(){
    if(!fresh()){view.textContent='Модель изменилась. Нужны новые сечения.';return;}
    const l=levels[+levelSelect.value],a=capture(l),r=l.ribbons.find(r=>String(r.fragment)===panelSelect.value);
    if(!r){view.textContent='Нет результата для выбранной панели.';return;}
    const roomById=new Map(a.rooms.map((r,i)=>['room:'+r.id,{...r,colour:colours[i%colours.length]}]));
    const structureById=new Map(a.structures.map(r=>['fragment:'+r.fragment,r]));
    const title=id=>{const room=roomById.get(id),structure=structureById.get(id);return room?`${room.number||'—'} · ${room.name||'Помещение'}`:structure?`${structure.owner.IfcClass} · ${structure.owner.name||structure.fragment}`:id;};
    if(r.status!=='ribbon'){view.innerHTML=`<p>Сечение панели не обработано: ${esc(r.reason)}.</p><p class="note">Часть панели вне захваченной области либо её геометрия не поддержана. Принадлежность не назначается.</p>`;return;}
    const colour=c=>c.status==='panel-intersects-section'||c.first?.kinds.includes('uncertain')?'#d29540':c.status==='scope-exit'?'#c8d0d8':c.first?.ids.length===1&&roomById.has(c.first.ids[0])?roomById.get(c.first.ids[0]).colour:'#77828c';
    const label=c=>c.status==='panel-intersects-section'?'Панель пересекает сечение':c.status==='scope-exit'?'Выход из области проверки':c.first?.kinds.includes('uncertain')?'Геометрия требует уточнения':c.first?.ids.map(title).join(' + ')||'Нет границы';
    const b=a.scope,s=Math.min(720/(b.hi[0]-b.lo[0]),340/(b.hi[1]-b.lo[1]));
    const xy=p=>[(p[0]-b.lo[0])*s+12,(b.hi[1]-p[1])*s+12];
    const path=loops=>loops.map(loop=>'M'+loop.map(p=>xy(p).join(',')).join('L')+'Z').join('');
    const point=(t,d=0)=>r.segment[0].map((x,k)=>x+r.along[k]*t+r.normal[k]*d);
    const line=(p,q,colour,width=2)=>{p=xy(p);q=xy(q);return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${colour}" stroke-width="${width}"/>`;};
    const rooms=a.rooms.filter(x=>x.section.status==='closed-section').map(x=>{const c=roomById.get('room:'+x.id).colour,p=xy(x.bounds.lo.map((v,k)=>(v+x.bounds.hi[k])/2));return `<path d="${path(x.section.loops)}" fill="${c}" fill-opacity=".10" fill-rule="evenodd" stroke="${c}" stroke-width="1"/><text x="${p[0]}" y="${p[1]}" text-anchor="middle" font-size="12" fill="${c}">${esc(x.number)}</text>`;}).join('');
    const parts=a.structures.filter(x=>x.section.status==='closed-section').map(x=>`<path d="${path(x.section.loops)}" fill="#74808a" fill-opacity=".10" fill-rule="evenodd" stroke="#78858f" stroke-opacity=".35" stroke-width=".5"/>`).join('');
    const paneLines=l.ribbons.filter(x=>x.status==='ribbon').map(x=>line(...x.segment,'#9eb4c8',2)).join('');
    const sideNames=['А','Б'];
    const strips=r.sides.map((side,i)=>side.cells.map(c=>line(point(c.range[0],side.sign*.15),point(c.range[1],side.sign*.15),colour(c),4)).join('')+(()=>{const p=xy(point(r.width/2,side.sign*.7));return `<text x="${p[0]}" y="${p[1]}" font-size="14" font-weight="bold">${sideNames[i]}</text>`;})()).join('');
    const grouped=side=>{
      const out=[];for(const c of side.cells){const key=JSON.stringify([c.status,c.first?.ids,c.first?.kinds,c.originRegions]);const last=out.at(-1);if(last?.key===key&&last.exactEnd===c.exactRange[0]){last.end=c.range[1];last.exactEnd=c.exactRange[1];last.count++;}else out.push({key,start:c.range[0],end:c.range[1],exactEnd:c.exactRange[1],cell:c,count:1});}return out;
    };
    const summaries=r.sides.map((side,i)=>{
      const groups=grouped(side),bar=groups.map(g=>`<span style="width:${100*(g.end-g.start)/r.width}%;background:${colour(g.cell)}" title="${esc(label(g.cell))} · ${num(g.end-g.start)} м"></span>`).join('');
      const rows=groups.map(g=>`<tr><td>${num(g.start)}–${num(g.end)}</td><td>${num(g.end-g.start)}</td><td><span class="swatch" style="background:${colour(g.cell)}"></span>${esc(label(g.cell))}</td></tr>`).join('');
      return `<p><b>Сторона ${sideNames[i]}</b> · от начала панели к её концу</p><div class="bar">${bar}</div><table><tr><th>Участок, м</th><th>Длина, м</th><th>Первая граница</th></tr>${rows}</table>`;
    }).join('');
    view.innerHTML=`<svg viewBox="0 0 ${(b.hi[0]-b.lo[0])*s+24} ${(b.hi[1]-b.lo[1])*s+24}" role="img" aria-label="План сечения и участки панели по помещениям">${rooms}${parts}${paneLines}${line(...r.segment,'#193448',2)}${strips}</svg><p>Панель ${esc(r.fragment)} · длина ${num(r.width)} м · отметка ${num(a.z)} м</p><div class="legend"><span>Цветные участки — помещения</span><span>Серые — конструкции или край области</span><span>Охра — пересечение / неопределённость</span></div>${summaries}<details><summary>Как читать эту проверку</summary><p>Алгоритм сравнивает ближайшие границы по обе стороны всей длины панели, включая узкие участки. Сетка пробных лучей и назначение по центру панели не используются.</p><p>Это только горизонтальное сечение. Выход из области проверки не означает открытое небо; встреченная конструкция ещё не признана непрозрачной. Собственные детали витража рассматриваются отдельно при обмере рамы и выборе τ₂.</p><p>Полученные участки пока не перенесены в ширины окон bо. Нужны привязка по всей высоте, наружный обмер и проверка расчётной схемы. Численный КЕО здесь не рассчитывается.</p><p class="note">Числа в таблице округлены для чтения; исходные границы и узкие интервалы сохранены. Замкнутых сечений помещений: ${a.rooms.filter(r=>r.section.status==='closed-section').length}; конструкций: ${a.structures.filter(r=>r.section.status==='closed-section').length}; неоднозначных сечений конструкций: ${a.structures.filter(r=>r.section.status!=='closed-section').length}. Полнота области и физические свойства ещё не подтверждены.</p></details>`;
  }
  function fillPanels(){
    const previous=panelSelect.value,l=levels[+levelSelect.value];
    panelSelect.innerHTML=l.ribbons.map(r=>`<option value="${r.fragment}">Панель ${r.fragment}${r.status==='ribbon'?'':' · нужна проверка'}</option>`).join('');
    if(l.ribbons.some(r=>String(r.fragment)===previous))panelSelect.value=previous;
    else{const split=l.ribbons.find(r=>r.sides?.some(s=>new Set(s.cells.filter(c=>c.status==='first-boundary'&&c.first?.kinds.length===1&&c.first.kinds[0]==='room').flatMap(c=>c.first.ids)).size>1));if(split)panelSelect.value=String(split.fragment);}
    draw();
  }
  levelSelect.onchange=fillPanels;panelSelect.onchange=draw;root.querySelector('button').onclick=()=>root.remove();
  document.body.append(root);window.KeoRibbonPanel={remove:()=>root.remove()};fillPanels();
})();
