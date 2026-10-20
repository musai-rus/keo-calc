/* Read-only visual study of the selected rooms; no KEO values are invented. */
(()=>{
  const audit=window.KeoRoomInputAudit;if(!audit||audit.busy||audit.errors.length)throw Error('room-input-audit-unavailable');
  const drafts=window.KeoCellCalculatorDrafts||[],heightAudit=window.KeoRoomHeightAudit;
  const heights=JSON.stringify(heightAudit?.source)===JSON.stringify(audit.source)?heightAudit.rooms:[];
  const draftFor=r=>drafts.find(d=>d.state._bimDraft.roomGuid===r.guid&&JSON.stringify(d.state._bimDraft.source)===JSON.stringify(audit.source));
  window.KeoRoomCellPanel?.remove();
  const root=document.createElement('section');root.id='keo-room-cell-study';
  const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const rooms=audit.rooms,b=audit.studyBounds,scale=Math.min(690/(b.hi[0]-b.lo[0]),430/(b.hi[1]-b.lo[1]));
  const xy=p=>[(p[0]-b.lo[0])*scale+22,(b.hi[1]-p[1])*scale+22];
  const path=loops=>loops.map(l=>'M'+l.map(p=>xy(p).map(n=>n.toFixed(2)).join(',')).join('L')+'Z').join('');
  const svgWidth=(b.hi[0]-b.lo[0])*scale+44,svgHeight=(b.hi[1]-b.lo[1])*scale+44;
  const paths=(audit.neighbourSections||[]).filter(r=>r.level===rooms[0].level).map(r=>`<path d="${path(r.loops)}" fill="#e9edef" fill-rule="evenodd" stroke="#a6b2b8"/>`).join('');
  const colours=['#d5eae5','#dfebf8','#f5e5cd'];
  const selected=rooms.map((r,i)=>{const p=xy(r.bounds.lo.map((x,k)=>(x+r.bounds.hi[k])/2));return `<path d="${path(r.section.loops||[])}" fill="${colours[i%3]}" fill-rule="evenodd" stroke="#375765" stroke-width="1.6"/><text x="${p[0]}" y="${p[1]}" text-anchor="middle" font-size="13">${esc(r.number)} · ${esc(r.name)}</text>`;}).join('');
  const candidates=audit.candidates.map(r=>{const face=r.result.patches.filter(p=>p.status==='planar-contour').sort((a,b)=>b.area-a.area)[0];if(!face)return '';return `<path d="${path(face.worldLoops)}" fill="none" stroke="#9e4c9d" stroke-width="3"><title>Фрагмент ${r.fragment}; ${esc(r.ancestors[0]?.name)}</title></path>`;}).join('');
  root.innerHTML=`<style>#keo-room-cell-study{position:fixed;z-index:100001;left:16px;top:125px;width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 155px);overflow:auto;background:white;border:1px solid #b9c9cf;border-radius:14px;box-shadow:0 8px 30px #0003;padding:16px;color:#243d49;font:14px/1.5 system-ui}#keo-room-cell-study button{float:right;border:1px solid #cbd8dd;background:white;border-radius:8px;padding:5px 10px;cursor:pointer}#keo-room-cell-study h2{font-size:20px;margin:0 0 6px}#keo-room-cell-study svg{width:100%;height:auto;max-height:470px}#keo-room-cell-study table{width:100%;border-collapse:collapse;font-size:13px}#keo-room-cell-study td,#keo-room-cell-study th{border-bottom:1px solid #e4e9eb;padding:7px;text-align:left}#keo-room-cell-study .note{font-size:12px;color:#58717b}</style>
  <button aria-label="Закрыть обзор ячейки">✕</button><h2>Ячейка · проверка исходных</h2><p class="note">Фиолетовым — кандидаты остекления; это ещё не подтверждённые наружные проёмы. Цвет помещений обозначает выбор, а не результат КЕО.</p>
  <svg viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="Сечения выбранной групповой ячейки и кандидаты остекления">${paths}${selected}${candidates}</svg>
  <table><tr><th>Помещение</th><th>Сечение</th><th>Высота над пробой</th><th>КЕО</th><th>Исходные</th></tr>${rooms.map(r=>{const h=heights.find(x=>x.id===r.id),d=draftFor(r);return `<tr><td>${esc(r.number)} · ${esc(r.name)}</td><td>${r.section.area?.toFixed(2)??'—'} м²</td><td>${h?.localHeight?.toFixed(2)??'—'} м</td><td>Недостаточно данных</td><td>${d?`<button data-draft="${r.id}" style="float:none">JSON · черновик</button>`:'—'}</td></tr>`;}).join('')}</table>
  <p>Принято для предварительного сценария: τ₁ = ${esc(audit.selection.optics?.t1??'—')}, τ₂ = ${esc(audit.selection.optics?.t2??'—')}. Регион: ${esc(drafts[0]?.state.region||'не задан')}.</p>
  <details><summary>Что мешает получить расчётный процент</summary><ol><li>Нужно восстановить наружные границы рам, сопоставить проёмы с помещениями и отделить внутреннее остекление.</li><li>Нужно построить характерный разрез и обоснованную схему непрямоугольного помещения: dп, bп, расчётную точку.</li><li>Нужно представить затеняющие конструкции параметрами существующего калькулятора.</li></ol><p>Высота над пробой — локальное пересечение с поверхностями пола и потолка, а не подтверждение единой высоты комнаты. Цвета на плане не обозначают соответствие норме.</p></details>
  <p class="note">JSON — черновик штатных исходных калькулятора. В нём уже есть назначение, регион и выбранные коэффициенты; размеры и проёмы пока не заполнены. После «Открыть» ожидается «Проверьте исходные данные». Это не готовый расчёт и не диагностический отчёт. Начальные настройки среды, отражения и солнцезащиты ещё требуют проверки.</p>`;
  root.querySelector('button').onclick=()=>root.remove();
  root.querySelectorAll('[data-draft]').forEach(button=>button.onclick=()=>{
    const room=rooms.find(r=>r.id===+button.dataset.draft),draft=draftFor(room),m=NOP_VIEWER.model,C=KeoNativeGeom.ctx(NOP_VIEWER);
    const now={urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()};
    if(!draft||JSON.stringify(now)!==JSON.stringify(audit.source.viewerSnapshot)){button.textContent='Снимок устарел';return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft.state,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=('КЕО_пом_'+(room.number||room.id)+'_ЧЕРНОВИК.json').replace(/[<>:"/\\|?*]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.body.append(root);window.KeoRoomCellPanel={remove:()=>root.remove()};
})();
