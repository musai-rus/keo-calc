/* Research helper: VBR/Viewer selection IDs of a PDF are not property-db IDs.
   Identity only. This module does not infer Room boundaries or seed points. */
const BimPdfIdentity = (function () {
  function fail(code) { const e = new Error('PDF identity: ' + code); e.code = code; throw e; }
  const positive = n => Number.isSafeInteger(n) && n > 0;
  function snapshot(model) {
    if (!model || model.is2d?.() !== true || model.isPdf?.() !== true) fail('not-pdf-sheet');
    const node = model.getDocumentNode?.(), rootUrn = node?.getRootNode?.()?.urn?.(), viewGuid = node?.data?.guid;
    if (typeof rootUrn !== 'string' || !rootUrn.trim() || typeof viewGuid !== 'string' || !viewGuid.trim()) fail('missing-source-identity');
    return { rootUrn, viewGuid };
  }
  function map(model, rawId) {
    const source = snapshot(model);
    if (!positive(rawId)) fail('invalid-raw-id');
    if (model.isIdRemapValid?.() !== true || typeof model.remapDbIdFor2D !== 'function' || typeof model.reverseMapDbIdFor2D !== 'function') fail('remap-unavailable');
    const dbId = model.remapDbIdFor2D(rawId);
    if (!positive(dbId) || model.reverseMapDbIdFor2D(dbId) !== rawId) fail('invalid-remap-roundtrip');
    return { ...source, rawId, dbId };
  }
  async function read(model, rawId) {
    const before = map(model, rawId);
    if (typeof model.getProperties !== 'function') fail('properties-unavailable');
    const properties = await new Promise((resolve, reject) => model.getProperties(before.dbId, resolve, reject));
    const after = map(model, rawId);
    if (Object.keys(before).some(k => before[k] !== after[k])) fail('source-or-remap-changed');
    if (properties?.dbId !== before.dbId || typeof properties.externalId !== 'string' || !properties.externalId.trim()) fail('property-identity-mismatch');
    return { ...before, externalId: properties.externalId, name: properties.name, properties: properties.properties,
      geometryAccepted: false, seedAccepted: false };
  }
  return { map, read };
})();
if (typeof module !== 'undefined') module.exports = BimPdfIdentity;
