'use strict';

// Presence checks only: numeric/formula validation remains in KEO.compute.
// Inactive mode geometry is not a required BIM input. This is NOT evidence approval.
function missingInputs(st) {
  const missing = [];
  function need(obj, keys, prefix, nullable = []) {
    for (const key of keys) if (!Object.hasOwn(obj || {}, key) ||
      (!nullable.includes(key) && (obj[key] === null || obj[key] === '')))
      missing.push(prefix + key);
  }
  function array(value, path, visit, nonempty = true) {
    if (!Array.isArray(value) || (nonempty && !value.length)) missing.push(path);
    else value.forEach((v, i) => visit(v, `${path}[${i}].`));
  }
  if (!st || st.v !== 1 || !['side', 'top', 'comb'].includes(st.mode)) return ['state.v/mode'];
  need(st, ['groupManual', 'roomId', 'lightSys', 'normManual', 'hpManual', 'rtManual', 'env', 'glassMult', 'rhoMode'], '', ['normManual', 'hpManual', 'rtManual']);
  need(st, [st.groupManual ? 'group' : 'region'], '');
  if (st.rhoMode === 'manual' || st.rhoMode === 'legacy') need(st, ['rho', 'rhoBasis'], '');
  if (st.rhoMode === 'surf') need(st, ['rhoGeo', 'rhoSurf', 'rhoRows'], '');
  // The manual import schema retains both containers, but inactive geometry may be empty.
  need(st, ['side', 'top'], '');
  if (st.mode !== 'top') array(st.side?.walls, 'side.walls', (w, p) => {
    if (st.mode === 'side') need(w, ['dp', 'bp'], p);
    need(w, ['orient', 'dst', 'ds', 't1', 't1c', 't2', 't4', 't5', 'kType'], p, ['t1c']);
    if (st.rtManual === 'manual') need(w, ['lt'], p);
    if (w.kType === 'manual') need(w, ['kManual', 'kBasis'], p);
    else if (w.kType !== 'none') need(w, ['kDepth'], p);
    if (st.rhoMode === 'surf' && st.rhoGeo === 'auto') need(w, ['H'], p);
    array(w.windows, p + 'windows', (x, q) => {
      need(x, ['hpd', 'ho', 'bo', 's', 't2m', 'tau0m', 'Km'], q);
      if (x.tau0m === 'manual') need(x, ['tau0o', 'tau0b'], q);
      else if (x.t2m === 'manual') need(x, ['t2o'], q);
      if (x.Km === 'manual') need(x, ['Ko', 'Kb'], q);
    });
    array(w.buildings, p + 'buildings', (b, q) => need(b, ['l', 'Hp', 'a', 'off', 'rhoF'], q), false);
  });
  if (st.mode !== 'side') {
    const t = st.top;
    need(t, ['sys', 'L', 'B', 'H', 'spans', 'l1', 'y0', 'nPts', 'nPtsBasis'], 'top.', ['l1', 'y0', 'nPtsBasis']);
    if (!['shaft', 'b2'].includes(t?.sys)) missing.push('top.sys');
    if (t?.sys === 'b2') array(t.b2, 'top.b2', (x, p) => {
      need(x, ['kind', 'b', 'hst', 'ystart', 'ylen', 'pieces', 'pitch', 't1', 't2', 't3', 't4', 'net', 'CNrow'], p, ['ylen']);
      if (x.kind !== 'A') need(x, ['ho'], p);
      if (['trap', 'A', 'shedI'].includes(x.kind)) need(x, ['beta'], p);
      if (['shedV', 'shedI'].includes(x.kind)) need(x, ['face'], p);
      array(x.xs, p + 'xs', () => {});
    });
    else array(t?.types, 'top.types', (x, p) => {
      need(x, ['shape', 'hsf', 'refl', 'rhoW', 't1', 't2', 't3', 't4', 'net', 'tilt'], p);
      if (!['round', 'rect'].includes(x.shape)) missing.push(p + 'shape');
      need(x, x.shape === 'round' ? ['dv', 'dn'] : ['av', 'bv', 'an', 'bn'], p);
      array(x.lanterns, p + 'lanterns', (l, q) => need(l, ['x', 'y'], q));
    });
  }
  if (st.mode === 'comb') need(st.comb, ['wallSide'], 'comb.');
  return [...new Set(missing)];
}
module.exports = { missingInputs };
