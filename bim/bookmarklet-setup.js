/* Installation page only. Embed the selection in the dragged link itself. */
(() => {
  const loader = /* KEO_LOADER */ null;
  const region = document.getElementById('bookmark-region');
  const button = document.querySelector('a.bm');
  const summary = document.getElementById('bookmark-summary');
  function update() {
    const selected = [...region.options].find(o => o.value === region.value);
    const name = selected?.value || '';
    const options = name ? {region:name} : {};
    button.setAttribute('href', 'javascript:' + loader + '(' + JSON.stringify(options) + ');');
    button.textContent = 'КЕО по модели' + (name ? ' — ' + name : '');
    summary.textContent = name
      ? 'В кнопке сохранён регион: ' + selected.textContent + '. При запуске он заменит прежний выбор региона этой модели.'
      : 'Регион в кнопку не записан. Выберите его в Viewer; сохранённый выбор модели будет использован повторно.';
  }
  region.addEventListener('change', update);
  update();
})();
