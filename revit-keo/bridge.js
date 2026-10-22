/* КЕО для Revit: read-only диагностический адаптер и replay через НЕИЗМЕНЁННЫЙ KEO.
 * Это не определитель физической геометрии и не источник нормативных статусов.
 * UMD: Node unit tests и будущая встраиваемая локальная панель WebView2.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KeoRevitBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'keo-room-evidence/0.1';
  const CANDIDATE = 'keo-revit-input-preview/0.1';

  function diagnostic(code, detail) { return { code, detail }; }
  function validString(x) { return typeof x === 'string' && x.trim().length > 0; }
  function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  // Do not infer identity by room number/name/area. A raw capture is NOT a verified seed.
  function inspectRawCapture(data) {
    const issues = [];
    if (!isObject(data) || data.schema !== SCHEMA || data.profile !== 'horizontal-line-plan/0.1')
      issues.push(diagnostic('unknown-capture-schema', 'Нужен нативный снимок keo-room-evidence/0.1'));
    const scope = isObject(data?.scope) ? data.scope : null;
    if (!scope || !Array.isArray(scope.rooms) || !scope.rooms.length)
      issues.push(diagnostic('no-room-scope', 'В снимке нет явно выбранных Revit Rooms'));
    if (!validString(data?.sourceSnapshot?.sha256) || !/^[a-f0-9]{64}$/.test(data.sourceSnapshot.sha256))
      issues.push(diagnostic('no-source-fingerprint', 'Не подтверждён SHA-256 исходного RVT'));
    const selected = [];
    const ids = new Set();
    if (scope && Array.isArray(scope.rooms)) for (const item of scope.rooms) {
      const ref = item?.ref;
      const id = ref?.uniqueId;
      const documentKey = ref?.documentKey;
      if (!validString(id) || !validString(documentKey)) {
        issues.push(diagnostic('room-missing-identity', 'Room без source documentKey / UniqueId'));
        continue;
      }
      const key = documentKey + ':' + id;
      if (ids.has(key)) issues.push(diagnostic('duplicate-room-identity', key));
      else { ids.add(key); selected.push({ key, documentKey, uniqueId: id }); }
    }
    // Execution flags are only claims inside received JSON, not independent verification.
    issues.push(diagnostic('geometry-not-accepted', 'Нативный план Room не доказывает геометрию остекления, шахт, 3D-затенения и расчётных точек'));
    issues.push(diagnostic('norm-not-accepted', 'Назначение, климат, применимая схема СП и коэффициенты не подтверждены'));
    return {
      schema: 'keo-revit-diagnostic/0.1',
      sourceSchema: data?.schema ?? null,
      rooms: selected.map(room => ({ ...room, status: 'PENDING', color: 'gray' })),
      status: 'PENDING', color: 'gray',
      // Minimal ID checks only; NOT validation of the full Room evidence contract.
      minimalIdentityOk: !issues.some(x => !['geometry-not-accepted', 'norm-not-accepted'].includes(x.code)),
      issues
    };
  }

  // Explicit test of compatibility with the actual manual calculator. This is a
  // PREVIEW generated from already entered state, not a BIM-generated/approved input.
  function replayCandidate(KEO, envelope) {
    const errors = [];
    if (!isObject(envelope) || envelope.schema !== CANDIDATE)
      errors.push(diagnostic('preview-schema', 'Нет схемы предварительного входа Revit'));
    if (!validString(envelope?.room?.uniqueId) || !validString(envelope?.room?.documentKey))
      errors.push(diagnostic('room-identity', 'Вход требует исходные documentKey + Room.UniqueId'));
    if (!isObject(envelope?.state) || envelope.state.v !== 1 ||
        !isObject(envelope.state.side) || !isObject(envelope.state.top))
      errors.push(diagnostic('manual-json-contract', 'Нужен существующий state v:1, side и top'));
    if (!KEO || typeof KEO.migrate !== 'function' || typeof KEO.compute !== 'function')
      errors.push(diagnostic('core-unavailable', 'Оригинальное ядро KEO недоступно'));
    if (errors.length) return { status: 'PENDING', color: 'gray', errors, previewImportJson: null };

    const original = JSON.parse(JSON.stringify(envelope.state));
    const migration = KEO.migrate(original);
    if (!isObject(migration?.st)) return { status: 'PENDING', color: 'gray',
      errors: [diagnostic('migration-failed', 'Миграция калькулятора не вернула state')], previewImportJson: null };
    const first = KEO.compute(migration.st);
    if (!first.ok) return { status: 'PENDING', color: 'gray',
      errors: [diagnostic('core-validation', (first.err || []).join('; ') || 'Неприменимый вход ядра')], previewImportJson: null };
    const json = JSON.stringify(migration.st, null, 2);
    const parsed = JSON.parse(json);
    const second = KEO.compute(parsed);
    if (!second.ok || JSON.stringify(first.res) !== JSON.stringify(second.res) ||
        JSON.stringify(first.norm) !== JSON.stringify(second.norm) || first.pass !== second.pass)
      return { status: 'PENDING', color: 'gray', errors: [diagnostic('core-replay-mismatch',
        'Повторный расчёт после JSON не совпадает с исходным')], previewImportJson: null };
    return {
      status: 'PENDING', color: 'gray',
      errors: [],
      issues: [diagnostic('manual-preview-only', 'Совместимый JSON проверен численно, но не доказано происхождение геометрии из Revit')],
      // Only for controlled test; user must see the diagnostic-only label in UI.
      previewImportJson: json,
      coreReplay: { ok: true, norm: first.norm, pass: first.pass, eFinal: first.res?.eFinal ?? null },
      migrationNotes: migration.notes || []
    };
  }

  return Object.freeze({ SCHEMA, CANDIDATE, inspectRawCapture, replayCandidate });
});
