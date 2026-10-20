/* Read-only visual study of the selected rooms; no KEO values are invented. */
(()=>{
  const audit=window.KeoRoomInputAudit;if(!audit||audit.busy||audit.errors.length)throw Error('room-input-audit-unavailable');
  const drafts=window.KeoCellCalculatorDrafts||[],heightAudit=window.KeoRoomHeightAudit;
  const heights=JSON.stringify(heightAudit?.source)===JSON.stringify(audit.source)?heightAudit.rooms:[];
  const profileAudit=window.KeoCurtainElevationAudit;
  const profiles=profileAudit&&JSON.stringify(profileAudit.source)===JSON.stringify(audit.source)&&profileAudit.capturedAt===window.KeoCellAssemblyCapture?.completedAt?profileAudit:null;
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
  ${profiles?'<details open><summary>Геометрия витражей и наружный обмер рам</summary><label>Выбрать сборку <select data-profile-select></select></label><div data-profile-view></div></details>':''}
  <details><summary>Что мешает получить расчётный процент</summary><ol><li>Нужно восстановить наружные границы рам, сопоставить проёмы с помещениями и отделить внутреннее остекление.</li><li>Нужно построить характерный разрез и обоснованную схему непрямоугольного помещения: dп, bп, расчётную точку.</li><li>Нужно представить затеняющие конструкции параметрами существующего калькулятора.</li></ol><p>Высота над пробой — локальное пересечение с поверхностями пола и потолка, а не подтверждение единой высоты комнаты. Цвета на плане не обозначают соответствие норме.</p></details>
  <p class="note">JSON — черновик штатных исходных калькулятора. В нём уже есть назначение, регион и выбранные коэффициенты; размеры и проёмы пока не заполнены. После «Открыть» ожидается «Проверьте исходные данные». Это не готовый расчёт и не диагностический отчёт. Начальные настройки среды, отражения и солнцезащиты ещё требуют проверки.</p>`;
  root.querySelector('button').onclick=()=>root.remove();
  if(profiles){
    const select=root.querySelector('[data-profile-select]'),view=root.querySelector('[data-profile-view]');
    const available=profiles.assemblies.filter(a=>a.status==='profile');
    select.innerHTML=available.map((a,i)=>`<option value="${a.root.id}">Сборка ${i+1} · ${a.parts.length} деталей</option>`).join('');
    const measured=profiles.windows.find(w=>w.status==='framed-rectangle-candidate');if(measured)select.value=String(measured.assemblyId);
    const draw=()=>{
      const a=available.find(a=>a.root.id===+select.value);if(!a){view.textContent='Нет пригодного профиля';return;}
      const windows=profiles.windows.filter(w=>w.assemblyId===a.root.id),points=a.parts.flatMap(p=>p.silhouette.loops.flat());
      const lo=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...points.map(p=>p[k]))),s=Math.min(650/(hi[0]-lo[0]),250/(hi[1]-lo[1]));
      const xy=p=>[(p[0]-lo[0])*s+15,(hi[1]-p[1])*s+15];
      const path=loops=>loops.map(l=>'M'+l.map(p=>xy(p).join(',')).join('L')+'Z').join('');
      const ringIds=new Set(windows.filter(w=>w.status==='framed-rectangle-candidate').map(w=>w.framePart));
      const badIds=new Set(windows.filter(w=>w.status!=='framed-rectangle-candidate').flatMap(w=>w.parts));
      const drawPart=p=>`<path d="${path(p.silhouette.loops)}" fill-rule="evenodd" fill="${badIds.has(p.id)?'#cf8c43':ringIds.has(p.id)||p.ancestors[0]?.IfcClass==='IfcMember'?'#68737c':'#83b6d7'}" stroke="#344c5d" stroke-width=".5"><title>${esc(p.name)}</title></path>`;
      const mm=x=>Math.round(x*1000);
      const intent=window.KeoCellDoorDesignIntent,decisions=JSON.stringify(intent?.source)===JSON.stringify(audit.source)?intent.decisions||[]:[];
      const row=w=>{
        const open=w.openBottomFrame?.status==='open-bottom-frame-candidate'?w.openBottomFrame:null,outer=w.outer||open?.outer;
        const glazed=decisions.some(d=>d.type==='glazed-door'&&d.doorGuids?.includes(w.root.GlobalId));
        return `<tr><td>${w.root.IfcClass==='IfcWindow'?'Окно':'Дверь'} · ${w.root.id}</td><td>${outer?`${open?'П-коробка · ':''}${mm(outer.width)} × ${mm(outer.height)} мм`:'Не подтверждён'}</td><td>${w.infill?`${mm(w.infill.width)} × ${mm(w.infill.height)} мм`:glazed?'Остеклённая дверь — подтверждено автором; полотно в IFC не подтверждено':'Нужна проверка геометрии'}</td></tr>`;
      };
      view.innerHTML=`<svg viewBox="0 0 ${(hi[0]-lo[0])*s+30} ${(hi[1]-lo[1])*s+30}" style="max-height:290px" role="img" aria-label="Проекция частей выбранного витража">${a.parts.filter(p=>!ringIds.has(p.id)&&p.ancestors[0]?.IfcClass!=='IfcMember').map(drawPart).join('')}${a.parts.filter(p=>ringIds.has(p.id)||p.ancestors[0]?.IfcClass==='IfcMember').map(drawPart).join('')}</svg><p class="note">Ортогональная проекция, не развёртка кривого фасада. Серым — элементы рам, синим — остальные панели, охрой — неразобранные оконные и дверные узлы. Цвет не подтверждает материал и светопропускание.</p>${windows.length?`<table><tr><th>Вложенный узел</th><th>Обмер элемента</th><th>Заполнение</th></tr>${windows.map(row).join('')}</table>`:'<p>В этой сборке нет отдельно выделенных вложенных оконных или дверных рам. Наружный обмер целого витража ещё проверяется.</p>'}<p class="note">Размеры найденной рамы получены из её контура. Для П-коробки обмер относится к выделенной детали; соседние детали и недостающее полотно требуют разбора. Размеры ещё не доказывают принадлежность помещению, прозрачность заполнения или соответствие свойствам IFC; в расчётный JSON автоматически не перенесены.</p>`;
    };select.onchange=draw;draw();
  }
  root.querySelectorAll('[data-draft]').forEach(button=>button.onclick=()=>{
    const room=rooms.find(r=>r.id===+button.dataset.draft),draft=draftFor(room),m=NOP_VIEWER.model,C=KeoNativeGeom.ctx(NOP_VIEWER);
    const now={urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()};
    if(!draft||JSON.stringify(now)!==JSON.stringify(audit.source.viewerSnapshot)){button.textContent='Снимок устарел';return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft.state,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=('КЕО_пом_'+(room.number||room.id)+'_ЧЕРНОВИК.json').replace(/[<>:"/\\|?*]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.body.append(root);window.KeoRoomCellPanel={remove:()=>root.remove()};
})();
