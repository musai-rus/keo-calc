/* Viewer selection is a safety boundary. Never search globals for a replacement
   or infer model identity from file names. Unsupported/ambiguous hosts stop. */
const BimViewerBinding = (function () {
  const fail = message => { throw new Error(message); };
  const changed = () => fail('Модель изменилась — запустите анализ заново.');
  function visible(el, env) {
    if (!el || el.ownerDocument !== env.document || el.isConnected !== true) return false;
    const rect = el.getBoundingClientRect();
    if (![rect.width, rect.height, rect.left, rect.top, env.innerWidth, env.innerHeight].every(Number.isFinite) || !(rect.width > 0 && rect.height > 0)) return false;
    if (rect.left >= env.innerWidth || rect.top >= env.innerHeight || rect.left + rect.width <= 0 || rect.top + rect.height <= 0) return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const s = env.getComputedStyle(p);
      if (p.hidden || s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0) return false;
    }
    return true;
  }
  function identity(m) {
    const data = m.getData(), node = m.getDocumentNode();
    return { urn: data && data.urn || null, root: node?.getRootNode()?.urn() || null, guid: node?.data?.guid || null };
  }
  // Same object/URN can acquire a different placement after analysis. Keep
  // values, not Matrix4 references: Viewer mutates existing matrices in place.
  function spatialContext(m) {
    const d=m.getData() || {};
    const matrix=value=>{
      if (value===null || value===undefined) return null;
      const a=Array.from(value.elements || []);
      if (a.length!==16 || !a.every(Number.isFinite)) fail('Не удалось проверить преобразование модели Viewer.');
      return a;
    };
    const offset=d.globalOffset;
    const xyz=offset===null || offset===undefined ? null : [offset.x,offset.y,offset.z];
    if (xyz && !xyz.every(Number.isFinite)) fail('Не удалось проверить смещение модели Viewer.');
    const scale=m.getUnitScale?.() ?? null;
    if (scale!==null && !(Number.isFinite(scale) && scale>0)) fail('Не удалось проверить единицы модели Viewer.');
    return JSON.stringify({world:matrix(m.getModelToViewerTransform?.()),runtime:matrix(m.getModelTransform?.()),placement:matrix(m.getPlacementTransform?.()),dataPlacement:matrix(d.placementTransform),withOffset:matrix(d.placementWithOffset),offset:xyz,scale});
  }
  function route(env) {
    const loc = env.location;
    if (!loc) return { token: '', urn: null };
    const token = loc.href;
    // This is the Autodesk Viewer document route, not a general share-link decoder.
    const m = loc.hostname === 'viewer.autodesk.com' && loc.pathname.match(/^\/id\/([^/]+)\/?$/);
    if (loc.hostname === 'viewer.autodesk.com' && !m) fail('На странице Autodesk не подтверждён документ модели. Откройте одну 3D-модель и повторите запуск.');
    let urn = null;
    if (m) { try { urn = decodeURIComponent(m[1]); } catch (_) { fail('Не удалось проверить идентификатор страницы Viewer.'); } }
    return { token, urn };
  }
  function capture(env = window) {
    const v = env.NOP_VIEWER, doc = env.document;
    if (!v || !v.model) fail('Откройте 3D-вид модели и дождитесь загрузки Viewer.');
    const canvas = v.canvas, container = v.container;
    if (!visible(canvas, env) || !visible(container, env) || !container.contains(canvas)) fail('Активный Viewer не подтверждён: canvas отключён или скрыт. Перезагрузите страницу и откройте одну 3D-модель.');
    const hosts = [...doc.querySelectorAll('.adsk-viewing-viewer')].filter(el => visible(el, env));
    if (hosts.length !== 1 || hosts[0] !== container) fail('Неоднозначный Viewer: откройте одну видимую 3D-модель и повторите запуск.');
    if (typeof v.getAllModels !== 'function' || typeof v.getVisibleModels !== 'function') fail('Viewer не предоставляет проверку состава загруженных моделей. Расчёт остановлен.');
    const all = v.getAllModels(), shown = v.getVisibleModels(), m = v.model;
    if (!Array.isArray(all) || !Array.isArray(shown) || all.length !== 1 || shown.length !== 1 || all[0] !== m || shown[0] !== m) fail('В Viewer несколько моделей или активная модель не видна. Откройте одну 3D-модель.');
    if (m.is2d() !== false) fail('Откройте 3D-вид модели');
    const fragments = m.getFragmentList();
    if (typeof v.isLoadDone !== 'function' || v.isLoadDone({ geometry: true, propDb: true }) !== true || !m.getInstanceTree() || !(fragments?.getCount() > 0) || !m.getPropertyDb()) fail('Модель ещё не готова: дождитесь загрузки геометрии и базы свойств, затем повторите запуск.');
    const id = identity(m), page = route(env);
    if (page.urn && (!id.root || page.urn !== id.root)) fail('Модель Viewer не соответствует странице. Перезагрузите страницу и повторите запуск.');
    return { v, m, canvas, container, doc, ...id, page: page.token, spatial:spatialContext(m) };
  }
  function assert(binding, env = window) {
    if (!binding) changed();
    const now = capture(env);
    for (const k of ['v', 'm', 'canvas', 'container', 'doc', 'urn', 'root', 'guid', 'page', 'spatial']) if (now[k] !== binding[k]) changed();
    return true;
  }
  return { capture, assert };
})();
if (typeof module !== 'undefined') module.exports = BimViewerBinding;
