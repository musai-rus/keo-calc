/* Temporary diagnostic elevation, never a pass/fail KEO map. */
(()=>{
  const a=window.KeoSurfaceBandAudit,capture=window.KeoRibbonVolumeAudit;
  if(!a||a.busy||a.errors.length||!a.completedAt||!capture||capture.busy||capture.errors.length||a.capturedAt!==capture.completedAt||JSON.stringify(a.source)!==JSON.stringify(capture.source))throw Error('incomplete-or-mismatched-surface-study');
  const v=NOP_VIEWER,m=v.model,source=JSON.stringify(a.source.viewerSnapshot);
  const fresh=()=>{const C=KeoNativeGeom.ctx(v);return v.model===m&&window.KeoSurfaceBandAudit===a&&window.KeoRibbonVolumeAudit===capture&&a.capturedAt===capture.completedAt&&JSON.stringify({urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()})===source;};
  if(!fresh())throw Error('surface-viewer-source-mismatch');
  window.KeoSurfaceBandPanel?.remove();
  const root=document.createElement('section');root.id='keo-surface-study';
  const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const num=(x,n=3)=>Number(x).toLocaleString('ru-RU',{maximumFractionDigits:n});
  const rooms=new Map(capture.rooms.map((r,i)=>['room:'+r.id,{...r,colour:['#367dc4','#8564bc','#28898b','#b56691','#698236','#a67b35'][i%6]}]));
  const title=id=>rooms.has(id)?`${rooms.get(id).number} · ${rooms.get(id).name}`:id.startsWith('fragment:')?'Конструкция '+id.slice(9):id;
  const category=c=>c.status==='panel-intersects-section'?'intersection':c.first?.kinds?.includes('uncertain')?'uncertain':c.status==='scope-exit'?'scope':c.first?.ids.join('|')||'unknown';
  const label=k=>k==='intersection'?'Пересечение с областью геометрии':k==='uncertain'?'Габарит неподтверждённой геометрии':k==='scope'?'Край области проверки':k==='unknown'?'Нет границы':k.split('|').map(title).join(' + ');
  const colour=k=>k==='intersection'?'#c47940':k==='uncertain'?'#dfae57':k==='scope'?'#d4dce3':rooms.get(k)?.colour||'#7e8e9c';
  root.innerHTML=`<style>
    #keo-surface-study{position:fixed;z-index:100005;left:20px;top:105px;width:min(790px,calc(100vw - 40px));max-height:calc(100vh - 125px);overflow:auto;box-sizing:border-box;background:white;border:1px solid #bacbd7;border-radius:14px;padding:18px;color:#21384c;font:14px/1.45 system-ui;box-shadow:0 8px 30px #0003}
    #keo-surface-study h2{font-size:21px;margin:0 0 6px}#keo-surface-study p{margin:8px 0}#keo-surface-study .note{font-size:12px;color:#576b7c}#keo-surface-study select,#keo-surface-study button{padding:7px;border:1px solid #c4d0dc;border-radius:7px;background:white;color:inherit}#keo-surface-study button{float:right;cursor:pointer}#keo-surface-study svg{display:block;width:100%;background:#f7fafc;border-radius:8px;margin:12px 0}#keo-surface-study table{width:100%;border-collapse:collapse;font-size:12px}#keo-surface-study th,#keo-surface-study td{padding:5px;border-bottom:1px solid #e3e8ee;text-align:left}#keo-surface-study .swatch{display:inline-block;width:10px;height:10px;margin-right:5px}#keo-surface-study details{margin-top:14px}
  </style><button aria-label="Закрыть проверку всей высоты">✕</button><h2>Витраж → помещения · вся высота</h2><p class="note">Алгоритмическая проверка границ. Численный КЕО ещё не рассчитан.</p><label>Панель витража <select aria-label="Панель всей высоты">${a.results.map((r,i)=>`<option value="${i}">${esc(r.fragment)}</option>`).join('')}</select></label><div data-surface-view></div>`;
  const select=root.querySelector('select'),view=root.querySelector('[data-surface-view]');
  function draw(){
    if(!fresh()){view.textContent='Снимок модели изменился. Нужно повторить проверку.';return;}
    const r=a.results[+select.value];if(r.status!=='surface-bands'){view.textContent='Не обработано: '+r.reason;return;}
    const h=r.zRange[1]-r.zRange[0],scale=260/h,w=r.width*scale,offsets=[100,425],top=35;
    const totals=[new Map(),new Map()];let shapes='';
    r.bands.forEach(b=>r.ribbons[b.ribbonIndex].sides.forEach((side,i)=>side.cells.forEach(c=>{
      const k=category(c),width=c.range[1]-c.range[0],height=b.zRange[1]-b.zRange[0];totals[i].set(k,(totals[i].get(k)||0)+width*height);
      shapes+=`<rect x="${offsets[i]+c.range[0]*scale}" y="${top+(r.zRange[1]-b.zRange[1])*scale}" width="${width*scale}" height="${height*scale}" fill="${colour(k)}"><title>${esc(label(k))}; z ${num(b.zRange[0],9)}–${num(b.zRange[1],9)}; u ${num(c.range[0],9)}–${num(c.range[1],9)}</title></rect>`;
    })));
    const frames=offsets.map((x,i)=>`<rect x="${x}" y="${top}" width="${w}" height="260" fill="none" stroke="#304c61"/><text x="${x+w/2}" y="20" text-anchor="middle" font-size="13">Сторона ${i?'Б':'А'}</text><text x="${x+w/2}" y="316" text-anchor="middle" font-size="12">${num(r.width)} м</text>`).join('');
    const tables=totals.map((t,i)=>`<p><b>Сторона ${i?'Б':'А'} · ближайшая граница</b></p><table><tr><th>Что обнаружено</th><th>Площадь проекции, м²</th></tr>${[...t].sort((a,b)=>b[1]-a[1]).map(([k,area])=>`<tr><td><span class="swatch" style="background:${colour(k)}"></span>${esc(label(k))}</td><td>${area>0&&area<1e-6?'менее 0,000001':num(area,6)}</td></tr>`).join('')}</table>`).join('');
    view.innerHTML=`<p>Ширина ${num(r.width)} м · высота ${num(h)} м · ${r.bands.length} интервалов по изменениям геометрии</p><svg viewBox="0 0 750 330" role="img" aria-label="Разбиение поверхности витража по всей высоте"><text x="8" y="${top+5}" font-size="12">${num(r.zRange[1])} м</text><text x="8" y="${top+260}" font-size="12">${num(r.zRange[0])} м</text>${shapes}${frames}</svg><p class="note">Цветные участки — границы помещений. Охра — область неопределённости, а не доказанная преграда. Серый край проверки не означает открытое небо.</p>${tables}<details><summary>Что доказано и что ещё нужно</summary><p>Между отмеченными высотами проверены целые вертикальные грани, а не отдельные пробные лучи. Неподдержанные поверхности представлены габаритами неопределённости. Это консервативная диагностика: она может скрывать фактически свободные участки.</p><p>Горизонтальные плоскости на границах интервалов, физические свойства конструкций, полнота области и точность экспорта отдельно не подтверждены. Мелкие интервалы сохранены, даже если они неразличимы на экране.</p><p>Площади в таблице не являются площадью окон для КЕО. Нужны наружные обмеры, расчётная схема помещения, откосы и затенение. τ₁/τ₂ и все формулы остаются в существующем калькуляторе.</p><p>Закройте это окно, чтобы вернуться к планам отдельных сечений.</p></details>`;
  }
  select.addEventListener('change',draw);root.querySelector('button').addEventListener('click',()=>root.remove());document.body.appendChild(root);draw();
  window.KeoSurfaceBandPanel={remove:()=>root.remove()};
})();
