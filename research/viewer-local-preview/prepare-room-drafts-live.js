/* Caller supplies purpose and candidate-facade direction for each selected
   room. Deliberately no project IDs, fuzzy name classification or AI here. */
(()=>{
  const a=window.KeoRoomInputAudit,cfg=window.KeoRoomDraftSelection,m=NOP_VIEWER.model,C=KeoNativeGeom.ctx(NOP_VIEWER);
  if(!a||a.busy||a.errors.length||!cfg?.rooms)throw Error('room-study-and-selection-required');
  const now={urn:m.getData().urn,unit:m.getUnitScale(),offset:m.getData().globalOffset,placement:m.getData().placementTransform?.elements,world:m.getModelTransform?.()?.elements,fragments:C.fl.getCount()};
  if(JSON.stringify(now)!==JSON.stringify(a.source.viewerSnapshot))throw Error('room-snapshot-mismatch');
  const drafts=a.rooms.map(room=>{
    const selection=cfg.rooms.find(r=>r.id===room.id);if(!selection)throw Error('room-context-missing');
    return window.KeoCalculatorInputDraft.create({room,normId:selection.normId,facadeOrientation:selection.facadeOrientation,region:cfg.region,optics:cfg.optics,source:a.source},KeoPreviewLib);
  });
  window.KeoCellCalculatorDrafts=drafts;return drafts.map(d=>({room:d.state.meta.room,status:d.status}));
})();
