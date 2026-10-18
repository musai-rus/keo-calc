/* Source for the public installation button. No prior console setup required. */
(async () => {
  const key = Symbol.for('keo-bim:loader');
  const previous = window[key];
  if (previous) previous.controller.abort();
  const request = {controller:new AbortController()};
  window[key] = request;
  try {
    const response = await fetch('https://musai-rus.github.io/keo-calc/keo-bim.js?' + Date.now(), {signal:request.controller.signal,cache:'no-store'});
    if (window[key] !== request) return;
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const code = await response.text();
    if (window[key] !== request) return;
    const oldApp = window.KeoBim;
    (0,eval)(code);
    const app = window.KeoBim;
    if (!app || app === oldApp || typeof app.run !== 'function') throw new Error('загруженный файл не создал новую версию КЕО');
    await app.run();
  } catch (error) {
    if (window[key] === request) alert('КЕО: запуск не выполнен. ' + (error?.message || String(error)));
  } finally {
    if (window[key] === request) delete window[key];
  }
})();
