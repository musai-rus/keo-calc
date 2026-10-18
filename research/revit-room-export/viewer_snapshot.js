/* Isolated read-only diagnostic. No KEO invocation, downloads, network or model changes.
   Requires existing BimViewerBinding capture/assert. Does not invent missing derivative,
   phase, option, independent control points or transform provenance. */
const RoomEvidenceViewerSnapshot = (() => {
  function matrix(value) {
    if (!value || !value.elements || value.elements.length !== 16) return null;
    const e = Array.from(value.elements);
    if (!e.every(Number.isFinite)) throw new Error('Non-finite Viewer matrix');
    return [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15].map(i => e[i]);
  }
  function capture(bindingApi, env = window) {
    const bound = bindingApi.capture(env), model = bound.m;
    const read = () => {
      const data = model.getData();
      const offset = data.globalOffset;
      return { rootUrn: bound.root, derivativeUrn: data.urn || null, viewGuid: bound.guid,
        unitScale: model.getUnitScale(),
        globalOffset: offset ? [offset.x, offset.y, offset.z] : null,
        modelTransform: matrix(model.getModelTransform?.()),
        placementTransform: matrix(data.placementTransform),
        modelToViewerTransform: matrix(model.getModelToViewerTransform?.()) };
    };
    const before = read(); bindingApi.assert(bound, env);
    const after = read();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Viewer changed during snapshot');
    const session = env.crypto.randomUUID();
    const snapshot = { schema: 'keo-viewer-binding/0.1', kind: 'current-viewer-snapshot',
      session, stable: true, loadedModelCount: 1, is2d: false,
      rootUrn: before.rootUrn, viewGuid: before.viewGuid,
      derivativeVersion: null, phase: null, option: null, units: null,
      transformDirection: null, sourceToViewer: null, controlPoints: null,
      raw: before,
      unavailable: ['immutable derivative version', 'native phase/option identity',
        'source-feet to Viewer-metres transform provenance', 'independent native control points'],
      viewerBindingVerified: false };
    return { snapshot, assertCurrent() {
      bindingApi.assert(bound, env);
      if (JSON.stringify(read()) !== JSON.stringify(before)) throw new Error('Viewer transform changed; snapshot invalid');
      return true;
    } };
  }
  return { capture };
})();
if (typeof module !== 'undefined') module.exports = RoomEvidenceViewerSnapshot;
