/* A deliberately incomplete v1 file for the unchanged calculator's Open action.
   No geometry, point, aperture, K or result is invented. A draft is NOT a
   completed real-room transfer or a calculation-ready export. */
const KeoCalculatorInputDraft=(()=>{
  function create(input,{KEO,DATA}){
    if(!input?.room?.guid||!input.room.name||!input.source?.viewerSnapshot)throw Error('identified-room-required');
    const norm=DATA.rooms.find(r=>r.id===input.normId),region=DATA.regions.find(r=>r.name===input.region);
    if(!norm||!region)throw Error('explicit-room-purpose-and-region-required');
    if(!KEO.ORIENTS.includes(input.facadeOrientation?.value)||!input.facadeOrientation?.basis)throw Error('candidate-facade-orientation-required');
    for(const key of ['t1','t2']){
      const choice=input.optics?.[key],table=DATA[key==='t1'?'tau1':'tau2'];
      if(!choice||!Number.isSafeInteger(choice.index)||table[choice.index]?.v!==choice.value||!input.optics.basis)throw Error('explicit-optical-scenario-required');
    }
    const s=KEO.defaultState(),w=KEO.defaultWall();
    Object.assign(s,{region:region.name,group:region.g,groupManual:false,bType:norm.g,roomId:norm.id,mode:'side',rtManual:'unknown'});
    if(typeof s.bType!=='string'||!s.bType)throw Error('missing-building-type');
    s.meta.room='ЧЕРНОВИК · '+[input.room.number,input.room.name].filter(Boolean).join(' ');
    s.meta.object='КЕО по модели — исходные не завершены; расчёта нет';
    Object.assign(w,{orient:input.facadeOrientation.value,dp:null,bp:null,H:null,dst:null,lt:null,ds:null,windows:[],buildings:[],t1:input.optics.t1.index,t1c:null,t2:input.optics.t2.index,kType:'manual',kDepth:null,kManual:null,kBasis:'Затеняющие конструкции ещё не представлены расчётной схемой'});
    s.side.walls=[w];
    Object.assign(s.top,{L:null,B:null,H:null,l1:null,y0:null,nPts:0,types:[],b2:[]});
    const copy=x=>JSON.parse(JSON.stringify(x));
    s._bimDraft={version:1,status:'incomplete-inputs',roomGuid:input.room.guid,source:copy(input.source),facadeOrientation:copy(input.facadeOrientation),optics:{...copy(input.optics),physicalMaterialVerified:false},
      unresolved:['characteristic-section-and-point','equivalent-room-dimensions','outer-frame-apertures-and-room-association','facade-orientation','shading-and-exterior-context','review-form-defaults-before-calculation'],
      note:'Табличные строки соответствуют принятому числовому сценарию; тип фактического стеклопакета не подтверждён. Остальные начальные настройки формы (среда, отражение, солнцезащита) ещё требуют проверки. Этот файл проверяет импорт, а не готовность расчёта.',normativeVerified:false};
    const check=KEO.compute(s);if(check.ok||Object.hasOwn(check,'res')||Object.hasOwn(check,'pass'))throw Error('incomplete-draft-must-not-calculate');
    return {state:s,errors:check.err,status:'incomplete-inputs',calculation:null};
  }
  return {create};
})();
if(typeof module!=='undefined')module.exports=KeoCalculatorInputDraft;
