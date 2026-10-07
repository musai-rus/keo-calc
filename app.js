/* Интерфейс калькулятора КЕО */
(function () {
  const f = Report.f, $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const LS_KEY = 'keo-draft-v1';
  let S = null; let C = null; let schemeTab = 0; let dlCap = null;

  /* ---------- примеры ---------- */
  function exampleSide() {
    const s = KEO.defaultState();
    Object.assign(s, { region: 'Краснодарский край', roomId: 'A57' }); s.bType = DATA.rooms.find(r => r.id === 'A57').g;
    s.meta = { code: '1226-30-01-АР2', object: 'ДОУ на 240 мест (пример)', room: '1.004', author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 };
    const w = s.side.walls[0]; Object.assign(w, { orient: 'В', dp: 8, bp: 7.4, H: 3.3, dst: 0.72, t1: 0, t1c: 0.64, t2: 1, t4: 0, kType: 'none' });
    w.windows = [-2.88, -1.12, 0.62, 2.38].map(x => ({ hpd: 0.5, ho: 2.2, bo: 1.65, s: x, t2o: null, tau0o: null, Ko: null }));
    w.windows[0].t2o = 0.75; w.windows[1].t2o = 0.75; w.windows[3].t2o = 0.75; w.windows[2].t2o = 0.70;
    return s;
  }
  function exampleTop() {
    const s = KEO.defaultState(); s.mode = 'top';
    Object.assign(s, { region: 'Краснодарский край', roomId: 'A57', hpManual: 0.8 }); s.bType = DATA.rooms.find(r => r.id === 'A57').g;
    s.meta = { code: '1226-30-01-АР3', object: 'ДОУ на 240 мест (пример)', room: '1.G.11.2', author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 };
    Object.assign(s.top, { L: 8, B: 7.41, H: 4.2, spans: 1, l1: null, y0: 3.71, nPts: 0 });
    s.top.types = [{ ...KEO.defaultType(), name: 'Шахта Ø 2,0', shape: 'round', dv: 2, dn: 2, hsf: 1, refl: 'diffuse', rhoW: 0.7, t1: 0.48, t2: 0.75, lanterns: [{ x: 4.0, y: 5.96 }, { x: 3.63, y: 3.29 }] }];
    s.side.walls[0] = Object.assign(KEO.defaultWall('В'), { dst: 0.3, t1c: 0.64, t2: 0, windows: [{ hpd: 0.5, ho: 2.6, bo: 1.65, s: -2.2 }, { hpd: 0.5, ho: 2.6, bo: 1.65, s: 0 }, { hpd: 0.5, ho: 2.6, bo: 1.65, s: 2.2 }].map(x => ({ ...x, t2o: null, tau0o: null, Ko: null })) });
    return s;
  }

  function exampleB2() {
    const s = KEO.defaultState(); s.mode = 'top'; s.top.sys = 'b2';
    Object.assign(s, { region: 'г. Москва', roomId: 'A68' }); s.bType = DATA.rooms.find(r => r.id === 'A68').g;
    s.meta = { code: '', object: 'Физкультурно-оздоровительный комплекс (пример)', room: '1.01', author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 };
    Object.assign(s.top, { L: 24, B: 36, H: 7, spans: 2, l1: null, y0: null, nPts: 9 });
    s.top.b2 = [Object.assign(KEO.defaultB2Type(), { name: 'П-образный 3 × 1,8', kind: 'rect', b: 3, hst: 0.6, ho: 1.8, xs: [6, 18], ystart: 3, ylen: 30, t1: 0.8, t2: 0.9, t3: 0.9, net: true, CNrow: 'С-Ю' })];
    return s;
  }

  /* ---------- доступ к состоянию по пути ---------- */
  const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  function setP(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
  const num = v => { if (v === '' || v === null || v === undefined) return ''; const x = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return isNaN(x) ? '' : x; };
  const fv = v => (v === '' || v === null || v === undefined) ? '' : String(v).replace('.', ',');

  /* ---------- элементы формы ---------- */
  function inp(path, label, sym, unit, o = {}) {
    const v = getP(S, path); const id = 'f-' + path.replace(/\./g, '-');
    return `<label class="fld ${o.cls || ''}" for="${id}"><span class="lbl">${label}${sym ? ` <i class="sym">${Report.richHTML(sym)}</i>` : ''}</span>
      <span class="inpw"><input id="${id}" data-k="${path}" data-t="num" inputmode="decimal" autocomplete="off" value="${esc(fv(v))}" placeholder="${esc(o.ph || '')}">${unit ? `<span class="unit">${unit}</span>` : ''}</span>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`;
  }
  function tinp(path, label, o = {}) {
    const v = getP(S, path); const id = 'f-' + path.replace(/\./g, '-');
    return `<label class="fld ${o.cls || ''}" for="${id}"><span class="lbl">${label}</span><span class="inpw"><input id="${id}" data-k="${path}" data-t="str" value="${esc(v)}" placeholder="${esc(o.ph || '')}"></span></label>`;
  }
  function sel(path, label, opts, o = {}) {
    const v = getP(S, path); const id = 'f-' + path.replace(/\./g, '-');
    return `<label class="fld ${o.cls || ''}" for="${id}"><span class="lbl">${label}${o.sym ? ` <i class="sym">${Report.richHTML(o.sym)}</i>` : ''}</span><span class="inpw"><select id="${id}" data-k="${path}" data-t="${o.t || 'str'}" ${o.rebuild ? 'data-rebuild="1"' : ''}>${opts.map(([val, txt]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select></span>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`;
  }
  const seg = (path, opts, o = {}) => `<div class="seg ${o.cls || ''}" role="radiogroup" aria-label="${esc(o.aria || '')}">${opts.map(([val, txt]) => `<button type="button" role="radio" aria-checked="${String(getP(S, path)) === String(val)}" data-seg="${path}" data-val="${esc(val)}" data-t="${o.t || 'str'}">${txt}</button>`).join('')}</div>`;
  const out = (key, txt = '') => `<span data-out="${key}">${txt}</span>`;
  const more = (title, body, open) => `<details class="more" ${open ? 'open' : ''}><summary>${title}</summary><div class="more-b">${body}</div></details>`;

  /* ---------- карточки ---------- */
  function cardObject() {
    const groups = [...new Set(DATA.rooms.map(r => r.g))];
    const rooms = DATA.rooms.filter(r => r.g === S.bType);
    const regOpts = DATA.regions.map(r => [r.name, `${r.name} — группа ${r.g}`]);
    return `<section class="card" id="c-object"><header class="card-h"><span class="step">1</span><div><h2>Объект и норма</h2><p>Место строительства и назначение помещения задают нормируемый КЕО и положение расчётной точки.</p></div></header>
      <div class="row">${S.groupManual ? sel('group', 'Группа района по ресурсам светового климата', [1, 2, 3, 4, 5].map(g => [g, 'Группа ' + g]), { t: 'num' }) : sel('region', 'Место строительства', regOpts, { hint: 'СП 52.13330.2016, приложение Е' })}
      <label class="chk"><input type="checkbox" data-k="groupManual" data-t="bool" data-rebuild="1" ${S.groupManual ? 'checked' : ''}> указать группу N вручную</label></div>
      <div class="row">${sel('bType', 'Тип здания', groups.map(g => [g, g]), { rebuild: true })}</div>
      <div class="row">${sel('roomId', 'Помещение', rooms.map(r => [r.id, r.name]), { rebuild: true, hint: 'СП 367.1325800.2025, таблица А.1' })}</div>
      <div class="row two"><div class="fld"><span class="lbl">Система освещения</span>${seg('lightSys', [['ЕО', 'Естественное'], ['СО', 'Совмещённое']])}</div>
      <div class="fld"><span class="lbl">Нормируемый КЕО ${out('normCol')}</span><div class="normline">${out('normVal')}</div></div></div>
      <div class="facts" data-out="facts"></div>
      ${more('Где располагается расчётная точка — п. 5.3 СП 52.13330.2016', `<ul class="sp"><li>При <b>двустороннем</b> боковом освещении — в центре помещения.</li><li>Жилые комнаты квартир — на полу в 1 м от стены, наиболее удалённой от окон (в одной комнате 1–3-комн. квартир); остальные комнаты и кухня — в центре на полу.</li><li>Общежития, гостиные и номера гостиниц — в центре на полу.</li><li>Групповые и игровые ДОО, изоляторы — на полу в 1 м от дальней от окон стены.</li><li>Учебные помещения — на УРП в 1,2 м от дальней стены.</li><li>Палаты и спальни санаториев — на полу в 1 м от дальней стены.</li><li>Кабинеты врачей, смотровые, перевязочные — в центре на УРП.</li><li>Остальные помещения — в центре на рабочей поверхности.</li><li>При верхнем и комбинированном освещении — точки по характерному разрезу, первая и последняя в 1 м от стен (п. 5.5).</li></ul>`)}
      ${more('Уточнить: своя норма, высота УРП, положение точки', `<div class="row three">${inp('normManual', 'Своё значение eн', 'e_{н}', '%', { ph: 'из таблицы' })}${inp('hpManual', 'Высота расчётной поверхности', 'h_{р}', 'м', { ph: 'по норме' })}
        ${S.mode === 'side' ? sel('rtManual', 'Положение точки', [['', 'По назначению (авто)'], ['center', 'В центре помещения'], ['far1', '1 м от дальней стены'], ['far1.2', '1,2 м от дальней стены'], ['manual', 'Задать lт вручную']], { rebuild: true }) : ''}</div>`)}
    </section>`;
  }

  function cardRoomSide() {
    const walls = S.side.walls, rule = KEO.rtOf(S);
    return `<section class="card" id="c-room"><header class="card-h"><span class="step">2</span><div><h2>Помещение и расчётная точка</h2><p>Размеры снимаются в Revit по плану и характерному разрезу через центр световых проёмов.</p></div></header>
      ${walls.map((w, wi) => `<div class="wallblock">${walls.length > 1 ? `<h3>Стена ${wi + 1} со светопроёмами</h3>` : ''}
        <div class="row three">${inp(`side.walls.${wi}.dp`, 'Глубина помещения', 'd_{п}', 'м', { hint: 'от внутренней грани стены с окнами' })}${inp(`side.walls.${wi}.bp`, 'Ширина помещения', 'b_{п}', 'м', { hint: 'вдоль стены с окнами' })}${inp(`side.walls.${wi}.H`, 'Высота помещения', 'H', 'м', { hint: 'для схемы' })}</div>
        <div class="row three">${rule === 'manual' ? inp(`side.walls.${wi}.lt`, 'До расчётной точки', 'l_{т}', 'м') : `<div class="fld"><span class="lbl">До расчётной точки <i class="sym">l<sub>т</sub></i></span><div class="calc">${out('lt' + wi)} м</div><span class="hint">${KEO.RT_TEXT[rule]}</span></div>`}
        ${inp(`side.walls.${wi}.ds`, 'Смещение точки от оси', 'Δs', 'м', { hint: 'вправо — плюс' })}
        <div class="fld"><span class="lbl">Высота точки <i class="sym">h<sub>р</sub></i></span><div class="calc">${out('hp')} м</div><span class="hint">${out('hpNote')}</span></div></div></div>`).join('')}
      <div class="row two"><div class="fld"><span class="lbl">Двустороннее / угловое освещение</span><div class="btns">${walls.length < 2 ? `<button type="button" class="btn ghost" data-act="addWall">+ Вторая стена с окнами</button>` : `<button type="button" class="btn ghost" data-act="delWall">− Убрать вторую стену</button>`}</div><span class="hint">КЕО от проёмов разной ориентации суммируется (п. 8.4.1)</span></div>
      ${rhoField()}</div>
    </section>`;
  }
  function rhoField() {
    return `<div class="fld"><span class="lbl">Средневзвешенный коэфф. отражения <i class="sym">ρ<sub>ср</sub></i></span><span class="inpw"><input id="f-rho" data-k="rho" data-t="num" inputmode="decimal" value="${fv(S.rho)}"></span><span class="hint">0,55 — для жилых и общественных (п. 5.10 СП 52)</span>
      ${more('Рассчитать ρср по отделке', `<p class="small">ρср = Σ ρi·Si / Σ Si, формула (3.6) СП 367.</p><div class="rhogrid"><span></span><span class="small">S, м²</span><span class="small">ρ</span>${['Пол', 'Стены', 'Потолок', 'Окна'].map((n, i) => `<span>${n}</span><input aria-label="${n}, площадь" data-k="rhoCalc.s.${i}.0" data-t="num" inputmode="decimal" value="${fv(S.rhoCalc.s[i][0])}"><input aria-label="${n}, коэффициент отражения" data-k="rhoCalc.s.${i}.1" data-t="num" inputmode="decimal" value="${fv(S.rhoCalc.s[i][1])}">`).join('')}</div><div class="btns"><button type="button" class="btn ghost" data-act="applyRho">Принять ρср = ${out('rhoCalc')}</button></div><p class="small">Ориентиры: побелка 0,7–0,8; светлая окраска 0,55–0,6; паркет 0,25–0,3; линолеум светлый 0,3–0,4; окна с переплётами 0,2.</p>`)}</div>`;
  }

  function cardRoomTop() {
    const T = S.top, b2 = T.sys === 'b2';
    return `<section class="card" id="c-room"><header class="card-h"><span class="step">2</span><div><h2>Помещение и расчётные точки</h2><p>${b2 ? 'Характерный разрез — поперёк фонарей (поперёк пролётов). Точки ставятся вдоль L: первая и последняя — в 1 м от стен.' : 'Точки ставятся по характерному разрезу вдоль длины L: первая и последняя — в 1 м от стен.'}</p></div></header>
      <div class="row three">${b2 ? inp('top.L', 'Длина по разрезу (поперёк фонарей)', 'L', 'м') + inp('top.B', 'Длина вдоль фонарей', 'B', 'м') + inp('top.H', 'Высота до низа проёмов в покрытии', 'H', 'м', { hint: 'от пола до плоскости проёма' }) : inp('top.L', 'Длина по разрезу', 'L', 'м') + inp('top.B', 'Ширина', 'B', 'м') + inp('top.H', 'Высота в свету', 'H', 'м', { hint: 'до низа шахт (потолка)' })}</div>
      <div class="row three">${inp('top.y0', 'Линия разреза от стены y = 0', 'y_{0}', 'м', { ph: 'B/2' })}${sel('top.nPts', 'Число расчётных точек', [[0, 'Авто (5 при L > 4 м, иначе 3)'], [3, '3'], [5, '5'], [7, '7'], [9, '9'], [11, '11']], { t: 'num', rebuild: true })}
      <div class="fld"><span class="lbl">Высота УРП <i class="sym">h<sub>урп</sub></i></span><div class="calc">${out('hp')} м</div><span class="hint">${out('hpNote')}</span></div></div>
      <div class="row three">${inp('top.spans', 'Число пролётов', '', '', { hint: '1, 2, 3 и более' })}${b2 ? inp('top.l1', 'Ширина пролёта', 'l_{1}', 'м', { ph: '= L / пролёты', hint: 'для табл. Б.21' }) : inp('top.l1', 'Ширина пролёта', 'l_{1}', 'м', { ph: '= B', hint: 'для однопролётного = ширине' })}
      ${b2 ? `<div class="fld"><span class="lbl">Высота низа остекления над УРП <i class="sym">h<sub>ф</sub></i></span><div class="calc">${out('hf')} м</div><span class="hint">hф = H + hст − hурп (для r2)</span></div>` : `<div class="fld"><span class="lbl">Расчётная высота <i class="sym">h<sub>р</sub></i></span><div class="calc">${out('hr')} м</div><span class="hint">hр = H − hурп</span></div>`}</div>
      <div class="row two">${rhoField()}<div></div></div>
    </section>`;
  }

  function cardWindows(walls) {
    return walls.map((w, wi) => {
      const pre = `side.walls.${wi}`;
      return `<div class="wallblock">${walls.length > 1 ? `<h3>Стена ${wi + 1}</h3>` : ''}
      <div class="fld"><span class="lbl">Ориентация светопроёмов</span>${seg(pre + '.orient', KEO.ORIENTS.map(o => [o, o]), { cls: 'compass', aria: 'Ориентация' })}<span class="hint">C<sub>N</sub> = ${out('cn' + wi)} — табл. 5.1 СП 52</span></div>
      <div class="row three">${inp(pre + '.dst', 'Толщина наружной стены', 'Δ_{ст}', 'м')}
      ${sel(pre + '.t1', 'Остекление', DATA.tau1.map((t, i) => [i, `${t.t} — τ1 ${t.r}`]), { t: 'num', sym: 'τ_{1}' })}${inp(pre + '.t1c', 'τ1 по паспорту изделия', 'τ_{1}', '', { ph: 'из таблицы' })}</div>
      <div class="row three">${sel(pre + '.t2', 'Переплёт', DATA.tau2.map((t, i) => [i, `${t.t} — ${f(t.v)}`]), { t: 'num', sym: 'τ_{2}' })}${sel(pre + '.t4', 'Солнцезащита', DATA.tau4.map((t, i) => [i, `${t.t} — ${f(t.v)}`]), { t: 'num', sym: 'τ_{4}' })}
      <div class="fld"><span class="lbl">Общий коэфф. пропускания <i class="sym">τ<sub>о</sub></i></span><div class="calc">${out('tau' + wi)}</div><span class="hint">τо = τ1·τ2·τ3·τ4·τ5 (Б.8)</span></div></div>
      <div class="row three">${sel(pre + '.kType', 'Затеняющий элемент фасада', Object.entries(KEO.K_TITLES), { rebuild: true, sym: 'K' })}
      ${w.kType !== 'none' ? inp(pre + '.kDepth', 'Вынос элемента', '', 'м') : '<div></div>'}<div class="fld"><span class="lbl">Коэффициент <i class="sym">K</i></span><div class="calc">${out('K' + wi)}</div><span class="hint">табл. Б.17–Б.20</span></div></div>
      <div class="tblw"><table class="grid-t"><thead><tr><th>№</th><th>Подоконник <i class="sym">h<sub>пд</sub></i>, м</th><th>Высота <i class="sym">h<sub>о</sub></i>, м</th><th>Ширина <i class="sym">b<sub>о</sub></i>, м</th><th>Смещение оси <i class="sym">s</i>, м</th><th title="Переопределить τ2, τо или K для отдельного проёма">Особые τ2 / τо / K</th><th></th></tr></thead><tbody>
      ${w.windows.map((x, i) => `<tr><td class="n">${i + 1}</td>${['hpd', 'ho', 'bo', 's'].map(k => `<td><input aria-label="Окно ${i + 1}: ${k}" data-k="${pre}.windows.${i}.${k}" data-t="num" inputmode="decimal" value="${fv(x[k])}"></td>`).join('')}
        <td class="ovr">${['t2o', 'tau0o', 'Ko'].map((k, j) => `<input aria-label="Окно ${i + 1}: ${['τ2', 'τо', 'K'][j]} вручную" placeholder="${['τ2', 'τо', 'K'][j]}" data-k="${pre}.windows.${i}.${k}" data-t="num" inputmode="decimal" value="${fv(x[k])}">`).join('')}</td>
        <td><button type="button" class="icon" data-act="delWin" data-w="${wi}" data-i="${i}" aria-label="Удалить окно ${i + 1}" ${w.windows.length < 2 ? 'disabled' : ''}>×</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="btns"><button type="button" class="btn ghost" data-act="addWin" data-w="${wi}">+ Окно</button></div>
      ${more('Расставить одинаковые окна', `<div class="row four"><label class="fld"><span class="lbl">Количество</span><span class="inpw"><input id="gen-n-${wi}" inputmode="numeric" value="${w.windows.length}"></span></label><label class="fld"><span class="lbl">Шаг осей, м</span><span class="inpw"><input id="gen-p-${wi}" inputmode="decimal" value="${fv(w.windows.length > 1 ? Math.abs(w.windows[1].s - w.windows[0].s).toFixed(2) : 2)}"></span></label><label class="fld"><span class="lbl">Смещение группы, м</span><span class="inpw"><input id="gen-o-${wi}" inputmode="decimal" value="0"></span></label><div class="fld"><span class="lbl">&nbsp;</span><button type="button" class="btn" data-act="genWin" data-w="${wi}">Расставить</button></div></div><p class="small">Размеры hпд, hо, bо берутся из первого окна; оси располагаются симметрично относительно оси помещения со смещением группы.</p>`)}
      </div>`;
    }).join('');
  }
  function cardOpeningsSide() {
    const walls = S.mode === 'comb' ? S.side.walls.slice(0, 1) : S.side.walls;
    return `<section class="card" id="c-open"><header class="card-h"><span class="step">3</span><div><h2>Световые проёмы${S.mode === 'comb' ? ' в наружной стене' : ''}</h2><p>Размеры проёмов — по коробке переплёта по наружному обмеру (п. Б.2.7). Смещение s — от оси помещения${S.mode === 'comb' ? ' (от линии расчётных точек)' : ''} до оси окна, вправо — плюс, если смотреть из помещения на окно.</p></div></header>
      ${S.mode === 'comb' ? `<div class="fld"><span class="lbl">Стена с окнами на плане</span>${seg('comb.wallSide', [['x0', 'У начала разреза (x = 0)'], ['xL', 'В конце разреза (x = L)']])}</div>` : ''}
      ${cardWindows(walls)}
    </section>`;
  }
  function cardBuildings() {
    const walls = S.mode === 'comb' ? S.side.walls.slice(0, 1) : S.side.walls;
    return `<section class="card" id="c-bld"><header class="card-h"><span class="step">4</span><div><h2>Противостоящие здания</h2><p>Схема № 1 — фасад параллелен исследуемому (рис. Б.4). Иное расположение приводится к эквивалентной условной плоскости (п. Б.3.1).</p></div></header>
      ${walls.map((w, wi) => `<div class="wallblock">${walls.length > 1 ? `<h3>Перед стеной ${wi + 1}</h3>` : ''}
        ${w.buildings.length ? `<div class="tblw"><table class="grid-t"><thead><tr><th>№</th><th>До фасада <i class="sym">l</i>, м</th><th>Высота <i class="sym">H<sub>р</sub></i>, м</th><th>Длина <i class="sym">a</i>, м</th><th>Смещение центра, м</th><th>Отражение фасада <i class="sym">ρ<sub>ф</sub></i></th><th></th></tr></thead><tbody>
        ${w.buildings.map((b, i) => `<tr><td class="n">${i + 1}</td>${['l', 'Hp', 'a', 'off', 'rhoF'].map(k => `<td><input aria-label="Здание ${i + 1}: ${k}" data-k="side.walls.${wi}.buildings.${i}.${k}" data-t="num" inputmode="decimal" value="${fv(b[k])}"></td>`).join('')}<td><button type="button" class="icon" data-act="delBld" data-w="${wi}" data-i="${i}" aria-label="Удалить здание ${i + 1}">×</button></td></tr>`).join('')}
        </tbody></table></div>` : `<p class="empty">Затенения нет — небо видно до горизонта. Добавьте здание, если оно попадает в световой угол окон.</p>`}
        <div class="btns"><button type="button" class="btn ghost" data-act="addBld" data-w="${wi}">+ Здание</button></div></div>`).join('')}
      ${more('Как задавать здание', `<ul class="sp"><li><b>l</b> — расстояние от наружной плоскости фасада исследуемого здания до фасада противостоящего.</li><li><b>Hр</b> — от уровня пола исследуемого помещения до верха парапета (затеняющих элементов) противостоящего здания.</li><li><b>a</b> — длина противостоящего фасада (или его проекции на плоскость, параллельную исследуемому фасаду).</li><li><b>Смещение</b> — центр фасада относительно расчётной точки вдоль фасада (вправо — плюс).</li><li><b>ρф</b> — средневзвешенный коэффициент отражения фасада с учётом окон (Б.5): светлая штукатурка ≈ 0,5–0,6, серый бетон ≈ 0,35–0,4, красный кирпич ≈ 0,25–0,3, тёмные фасады ≈ 0,2.</li><li>Если здание закрывает лишь часть окна по ширине, программа делит окно на участки и считает небо и фасад раздельно, как при ручном подсчёте лучей.</li></ul>`)}
    </section>`;
  }
  const sysSwitch = () => `<div class="fld"><span class="lbl">Тип верхнего света</span>${seg('top.sys', [['shaft', 'Зенитные, шахтные (Б.3)'], ['b2', 'Надстройки, проёмы в покрытии (Б.2)']], { aria: 'Тип верхнего света' })}</div>`;
  function cardB2() {
    const T = S.top;
    return `<section class="card" id="c-open"><header class="card-h"><span class="step">3</span><div><h2>Фонари-надстройки и проёмы в покрытии</h2><p>Профиль фонаря задаётся по поперечному разрезу: ширина проёма в покрытии, борт, остекление. Положение — координатой оси x от стены, с которой начинается разрез. Лучи, углы и заслонение соседними фонарями программа строит сама.</p></div></header>
      ${sysSwitch()}
      ${(T.b2 || []).map((t, ti) => { const pre = `top.b2.${ti}`, inc = ['trap', 'A', 'shedI'].includes(t.kind), shed = t.kind === 'shedV' || t.kind === 'shedI'; return `<div class="wallblock">
        <div class="row two">${tinp(pre + '.name', 'Название типа')}${sel(pre + '.kind', 'Вид фонаря', KEO.B2_KINDS, { rebuild: true, hint: 'kф — табл. Б.22: ' + out('kf' + ti) })}</div>
        <div class="b2prof">${profileSVG(t)}</div>
        <div class="row four">${inp(pre + '.b', 'Ширина проёма в покрытии', 'b', 'м')}${inp(pre + '.hst', 'Борт до низа остекления', 'h_{ст}', 'м', { hint: '0, если остекление сразу от покрытия' })}
        ${t.kind === 'A' ? '' : inp(pre + '.ho', t.kind === 'plane' ? 'Не используется' : 'Высота остекления (по вертикали)', 'h_{о}', 'м', { cls: t.kind === 'plane' ? 'off' : '' })}${inc ? inp(pre + '.beta', 'Наклон остекления к горизонту', 'β', '°') : ''}
        ${shed ? `<div class="fld"><span class="lbl">Остекление шеда смотрит</span>${seg(pre + '.face', [['L', '← к x = 0'], ['R', 'к x = L →']])}</div>` : ''}</div>
        <div class="row four">${inp(pre + '.ystart', 'Начало от торцевой стены', 'y', 'м')}${inp(pre + '.ylen', 'Длина фонаря (проёма)', '', 'м', { ph: 'до конца B' })}${inp(pre + '.pieces', 'Штук вдоль оси', '', '', { hint: '1 — ленточный' })}${inp(pre + '.pitch', 'Шаг штучных проёмов', '', 'м')}</div>
        <div class="row four">${inp(pre + '.t1', 'Светопропускание заполнения', 'τ_{1}', '', { hint: 'по паспорту; стеклопакет ≈ 0,74–0,83' })}${sel(pre + '.t2', 'Переплёт', DATA.tau2.map(x => [x.v, `${x.t} — ${f(x.v)}`]).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i), { t: 'num', sym: 'τ_{2}' })}
        ${sel(pre + '.t3', 'Несущие конструкции', DATA.tau3.map(x => [x.v, `${x.t} — ${f(x.v)}`]), { t: 'num', sym: 'τ_{3}' })}${sel(pre + '.t4', 'Солнцезащита', DATA.tau4.map(x => [x.v, `${x.t} — ${f(x.v)}`]), { t: 'num', sym: 'τ_{4}' })}</div>
        <div class="row two">${sel(pre + '.CNrow', 'Строка табл. 5.1 СП 52 для C<sub>N</sub>', KEO.CN_ROWS, { hint: 'C<sub>N</sub> = ' + out('cnb' + ti) })}<div class="fld"><span class="lbl">Пропускание и эксплуатация</span><div class="calc">${out('b2info' + ti)}</div></div></div>
        <label class="chk"><input type="checkbox" data-k="${pre}.net" data-t="bool" ${t.net ? 'checked' : ''}> защитная сетка под фонарём (τ5 = 0,9)</label>
        <div class="fld"><span class="lbl">Оси фонарей на разрезе, x от стены, м</span><div class="xs">${t.xs.map((x, k) => `<span class="xsi"><input aria-label="Ось фонаря ${k + 1}" data-k="${pre}.xs.${k}" data-t="num" inputmode="decimal" value="${fv(x)}"><button type="button" class="icon" data-act="delB2x" data-t="${ti}" data-i="${k}" aria-label="Удалить фонарь ${k + 1}" ${t.xs.length < 2 ? 'disabled' : ''}>×</button></span>`).join('')}<button type="button" class="btn ghost" data-act="addB2x" data-t="${ti}">+ Фонарь</button><button type="button" class="btn ghost" data-act="genB2x" data-t="${ti}" title="Поставить по одному фонарю в середину каждого пролёта">По одному в каждом пролёте</button></div></div>
        ${(T.b2 || []).length > 1 ? `<div class="btns"><button type="button" class="btn ghost" data-act="delB2Type" data-t="${ti}">Удалить тип</button></div>` : ''}
      </div>`; }).join('')}
      <div class="btns"><button type="button" class="btn ghost" data-act="addB2Type">+ Другой тип фонаря</button></div>
      ${more('Как считаются надстройки', `<p>По п. 8.5.1 и формуле (Б.2) СП 367. В поперечном разрезе из каждой точки строятся лучи через остекление каждого фонаря: учитываются борт, покрытие фонаря и соседние фонари (луч, который после остекления упирается в другой фонарь, не считается). По видимому участку получаем n1 = 50·|cos φн − cos φв| (график I), середину участка C и угол γ. По продольному разрезу через C — n2 (график II) с учётом длины и торцов фонаря. ε = 0,01·n1·n2, q(γ) — по (3.2).</p><p>КЕО в точке: eв = CN·[Σ εв·q(γ) + εср·(r2·kф − 1)]·τо·MF, где εср — среднее по точкам значений Σ εв·q (п. 8.5.1 е), (Б.9)); r2 — табл. Б.21 по hф/l1, kф — табл. Б.22, CN — табл. 5.1 СП 52, MF — по наклону остекления. Среднее значение — по (Б.10), равномерность — не хуже 1 : 3.</p><p>Проверка: число лучей сверено с точным интегрированием по небосводу для всех видов фонарей — расхождение менее 1 %.</p>`)}
    </section>`;
  }
  function profileSVG(t) {
    try {
      const b = +t.b || 3, sc = { kind: t.kind, b, hst: +t.hst || 0, ho: t.kind === 'A' ? (b / 2) * Math.tan((+t.beta || 45) * Math.PI / 180) : (+t.ho || 1), beta: +t.beta || 60, face: t.face || 'R' };
      const p = Engine.lanternProfile(sc, 0, 0), top = Math.max(p.top, 0.5), W = b + 2.4;
      const it = [{ t: 'rect', x: -W / 2, y: -0.25, w: W / 2 - b / 2, h: 0.25, c: 'wall' }, { t: 'rect', x: b / 2, y: -0.25, w: W / 2 - b / 2, h: 0.25, c: 'wall' }];
      p.segs.forEach(g => it.push({ t: 'line', x1: g.x1, y1: g.z1, x2: g.x2, y2: g.z2, c: g.kind === 'glass' ? 'glass' : 'opq' }));
      it.push({ t: 'dim', x1: -b / 2, y1: -0.55, x2: b / 2, y2: -0.55, s: 'b' });
      return Schemes.toSVG({ box: [-W / 2, -0.8, W / 2, top + 0.3], it }, { label: 'Профиль фонаря' });
    } catch (e) { return ''; }
  }
  function cardLanterns() {
    const T = S.top;
    if (T.sys === 'b2') return cardB2();
    return `<section class="card" id="c-open"><header class="card-h"><span class="step">3</span><div><h2>Зенитные и шахтные фонари</h2><p>Координаты центров фонарей — на плане от угла помещения: x вдоль разреза, y поперёк. Углы α программа находит сама.</p></div></header>
      ${sysSwitch()}
      ${T.types.map((t, ti) => { const pre = `top.types.${ti}`; return `<div class="wallblock">
        <div class="row two">${tinp(pre + '.name', 'Название типа')}<div class="fld"><span class="lbl">Форма в плане</span>${seg(pre + '.shape', [['round', 'Круглый'], ['rect', 'Прямоугольный']])}</div></div>
        <div class="row four">${t.shape === 'round' ? inp(pre + '.dv', 'Ø верхнего отверстия', 'd_{ф.в}', 'м') + inp(pre + '.dn', 'Ø нижнего отверстия', 'd_{ф.н}', 'м') : inp(pre + '.av', 'Верх: длина', 'a_{ф.в}', 'м') + inp(pre + '.bv', 'Верх: ширина', 'b_{ф.в}', 'м') + inp(pre + '.an', 'Низ: длина', 'a_{ф.н}', 'м') + inp(pre + '.bn', 'Низ: ширина', 'b_{ф.н}', 'м')}
        ${inp(pre + '.hsf', 'Высота шахты', 'h_{с.ф}', 'м')}</div>
        <div class="row four">${sel(pre + '.refl', 'Отражение стенок шахты', [['diffuse', 'Диффузное (рис. Б.2)'], ['directional', 'Направленное (рис. Б.3)']])}${sel(pre + '.rhoW', 'Коэфф. отражения стенок', [0.9, 0.8, 0.7, 0.6, 0.5].map(v => [v, f(v, 1)]), { t: 'num' })}
        <div class="fld"><span class="lbl">Индекс <i class="sym">i<sub>ф</sub></i> → <i class="sym">K<sub>с</sub></i></span><div class="calc">${out('kc' + ti)}</div></div>${inp(pre + '.KcManual', 'Kс вручную', 'K_{с}', '', { ph: 'по графику' })}</div>
        <div class="row four">${inp(pre + '.t1', 'Остекление верха', 'τ_{1}', '', { hint: 'по паспорту; ≈ 0,48–0,8' })}${sel(pre + '.t2', 'Переплёт', DATA.tau2.map(x => [x.v, `${x.t} — ${f(x.v)}`]).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i), { t: 'num', sym: 'τ_{2}' })}
        ${sel(pre + '.t3', 'Несущие конструкции', DATA.tau3.map(x => [x.v, `${x.t} — ${f(x.v)}`]), { t: 'num', sym: 'τ_{3}' })}${sel(pre + '.tilt', 'Наклон остекления', DATA.MF.angles.map((a, i) => [i, a]), { t: 'num', hint: 'для MF' })}</div>
        <label class="chk"><input type="checkbox" data-k="${pre}.net" data-t="bool" ${t.net ? 'checked' : ''}> защитная сетка под фонарём (τ5 = 0,9)</label>
        <div class="tblw"><table class="grid-t"><thead><tr><th>№</th><th>x, м</th><th>y, м</th><th></th></tr></thead><tbody>
        ${t.lanterns.map((l, li) => `<tr><td class="n">${li + 1}</td><td><input aria-label="Фонарь ${li + 1}: x" data-k="${pre}.lanterns.${li}.x" data-t="num" inputmode="decimal" value="${fv(l.x)}"></td><td><input aria-label="Фонарь ${li + 1}: y" data-k="${pre}.lanterns.${li}.y" data-t="num" inputmode="decimal" value="${fv(l.y)}"></td><td><button type="button" class="icon" data-act="delLan" data-t="${ti}" data-i="${li}" aria-label="Удалить фонарь ${li + 1}" ${t.lanterns.length < 2 ? 'disabled' : ''}>×</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="btns"><button type="button" class="btn ghost" data-act="addLan" data-t="${ti}">+ Фонарь</button>${T.types.length > 1 ? `<button type="button" class="btn ghost" data-act="delType" data-t="${ti}">Удалить тип</button>` : ''}</div>
        ${more('Расставить сеткой', `<div class="row four"><label class="fld"><span class="lbl">Рядов × в ряду</span><span class="inpw"><input id="g-r-${ti}" value="1" inputmode="numeric"><span class="unit">×</span><input id="g-c-${ti}" value="2" inputmode="numeric"></span></label><label class="fld"><span class="lbl">Первый: x; y, м</span><span class="inpw"><input id="g-x-${ti}" value="2" inputmode="decimal"><span class="unit">;</span><input id="g-y-${ti}" value="${fv(+(S.top.B / 2).toFixed(2))}" inputmode="decimal"></span></label><label class="fld"><span class="lbl">Шаг по x; y, м</span><span class="inpw"><input id="g-dx-${ti}" value="4" inputmode="decimal"><span class="unit">;</span><input id="g-dy-${ti}" value="3" inputmode="decimal"></span></label><div class="fld"><span class="lbl">&nbsp;</span><button type="button" class="btn" data-act="genLan" data-t="${ti}">Расставить</button></div></div>`)}
      </div>`; }).join('')}
      <div class="btns"><button type="button" class="btn ghost" data-act="addType">+ Другой тип фонаря</button></div>
      ${more('Как считается верхний свет', `<p>По п. 8.5.1 и формуле (Б.3) СП 367. Для каждой точки: α = arctg(lф / hр) — угол между лучом в центр нижнего отверстия и вертикалью; q(α) — по формуле (3.2) для угла возвышения 90° − α; геометрический КЕО εj = 100·Aф.в·Σ q(α)·cos^m α / (π·hр²), m = 2 + 2/Kс. Затем σпр = εj·τо·MF·CN, отражённая составляющая σотр = εср·(r2 − 1)·τо·MF·CN одинакова для всех точек, eв = σпр + σотр. Среднее — по (Б.10), равномерность — emin : eср, не хуже 1 : 3.</p><p>Индекс шахты: прямоугольной — (8.2) iф = 4(Aв + Aн) / (√π·hс.ф·(Pв + Pн)); круглой — (8.3) iф = (rв + rн) / (2hс.ф). Kс — по оцифрованным графикам рис. Б.2 / Б.3 с интерполяцией по iф и ρ стенок.</p>`)}
    </section>`;
  }
  function cardConditions() {
    return `<section class="card" id="c-cond"><header class="card-h"><span class="step">${S.mode === 'top' ? 4 : 5}</span><div><h2>Условия эксплуатации</h2><p>Определяют коэффициент эксплуатации MF (табл. 5.1 СП 367).</p></div></header>
      <div class="row two"><div class="fld"><span class="lbl">Воздушная среда помещения</span>${seg('env', [['normal', 'Нормальная'], ['dusty', 'Пыльная, жаркая, сырая']])}<span class="hint">«Пыльные…» — горячие цехи, душевые, прачечные</span></div>
      ${sel('glassMult', 'Материал заполнения', [[1, 'Обычное стекло'], [0.91, 'Узорчатое, матовое, стеклопластик, аэрация — × 0,91'], [1.11, 'Органическое стекло — × 1,11']], { t: 'num' })}</div>
      <p class="small">MF ${out('mf')}</p>
    </section>`;
  }
  function cardMeta() {
    return `<section class="card" id="c-meta"><header class="card-h"><span class="step">✎</span><div><h2>Оформление отчёта</h2><p>Попадает в основную надпись и заголовок PDF.</p></div></header>
      <div class="row two">${tinp('meta.code', 'Обозначение (шифр)', { ph: '1226-30-01-АР3' })}${tinp('meta.object', 'Объект', { ph: 'ДОУ на 240 мест' })}</div>
      <div class="row three">${tinp('meta.room', 'Номер помещения', { ph: '1.004' })}${tinp('meta.date', 'Дата')}${inp('meta.sheetStart', 'Первый лист', '', '', { ph: '1' })}</div>
    </section>`;
  }

  function renderForm() {
    let h = cardObject();
    if (S.mode === 'side') h += cardRoomSide() + cardOpeningsSide() + cardBuildings() + cardConditions();
    else if (S.mode === 'top') h += cardRoomTop() + cardLanterns() + cardConditions();
    else h += cardRoomTop() + cardLanterns().replace('<span class="step">3</span>', '<span class="step">3</span>') + cardOpeningsSide().replace('<span class="step">3</span>', '<span class="step">4</span>') + cardBuildings().replace('<span class="step">4</span>', '<span class="step">5</span>') + cardConditions().replace(/<span class="step">\d<\/span>/, '<span class="step">6</span>');
    h += cardMeta();
    $('#form').innerHTML = h;
    document.querySelectorAll('.modes [data-mode]').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === S.mode));
  }

  /* ---------- вывод ---------- */
  function setOut(key, html) { document.querySelectorAll(`[data-out="${key}"]`).forEach(e => { e.innerHTML = html; }); }
  function update() {
    save();
    C = KEO.compute(S);
    const n = KEO.normOf(S), g = KEO.groupOf(S), hp = KEO.hpOf(S), room = KEO.room(S);
    setOut('normCol', `<span class="muted">(${S.mode === 'side' ? 'боковое' : 'верхнее/комбинир.'})</span>`);
    setOut('normVal', n.v === null || n.v === undefined ? '<b class="big">не нормируется</b>' : `<b class="big">${f(n.v)} %</b>${n.manual ? ' <span class="muted">задано вручную</span>' : ''}`);
    setOut('facts', room ? `<span class="chip">Группа N = ${g}</span><span class="chip">Плоскость: ${room.h === 0 ? (room.water ? 'поверхность воды' : 'пол, 0,0 м') : 'УРП ' + f(room.h, 1) + ' м'}</span><span class="chip">${S.mode === 'side' ? 'Точка: ' + KEO.RT_TEXT[KEO.rtOf(S)] : 'Точки: по характерному разрезу, крайние — в 1 м от стен'}</span><span class="chip">Нормы ЕО: бок. ${room.eSideN ?? '—'} / верх. ${room.eTopN ?? '—'}; СО: ${room.eSideC ?? '—'} / ${room.eTopC ?? '—'}</span>`.replace(/(\d)\.(\d)/g, '$1,$2') : '');
    setOut('hp', f(hp)); setOut('hpNote', S.hpManual !== null && S.hpManual !== '' ? 'задано вручную' : (hp === 0 ? 'на полу (по норме)' : 'УРП по норме'));
    setOut('hr', f(+S.top.H - hp));
    const rc = S.rhoCalc.s, sw = rc.reduce((a, x) => a + (+x[0] || 0), 0);
    setOut('rhoCalc', sw ? f(rc.reduce((a, x) => a + (+x[0] || 0) * (+x[1] || 0), 0) / sw) : '—');
    setOut('mf', S.mode === 'side' ? `${f(KEO.mfOf(S, 3))} — вертикальное остекление окон (76°–90°)` : `${S.top.types.map(t => f(KEO.mfOf(S, +t.tilt || 0))).join(' / ')} — фонари${S.mode === 'comb' ? `; окна — ${f(KEO.mfOf(S, 3))}` : ''}`);
    const rule = KEO.rtOf(S);
    S.side.walls.forEach((w, wi) => {
      setOut('lt' + wi, f(rule === 'manual' ? w.lt : KEO.ltAuto(rule, +w.dp)));
      setOut('cn' + wi, f(Engine.CNwall(g, w.orient).v));
      const t = KEO.tau1Wall(w) * DATA.tau2[w.t2].v * DATA.tau4[w.t4].v; setOut('tau' + wi, f(t, 4));
      const Kv = w.kType === 'none' ? 1 : Engine.KLookup(w.kType, S.mode === 'side' ? +w.dp : +S.top.L, +w.kDepth, rule === 'center' ? 'center' : 'wall1').v;
      setOut('K' + wi, f(Kv) + (w.kType === 'none' ? '' : ` <span class="muted">(${rule === 'center' ? 'точка в центре' : '1 м от стены'})</span>`));
    });
    if (S.top.sys === 'b2') {
      const bi = KEO.b2Input(S);
      setOut('hf', (S.top.b2 || []).map(t => f(+S.top.H + (+t.hst || 0) - hp)).join(' / '));
      bi.types.forEach((t, ti) => {
        setOut('kf' + ti, f(Engine.kfOf(t)));
        const cnv = (t.CNrow === 'zenith' ? DATA.CN.zenith : t.CNrow === 'shed' ? DATA.CN.lantern.shed : DATA.CN.lantern[t.CNrow])[g - 1];
        setOut('cnb' + ti, f(cnv));
        setOut('b2info' + ti, `τо = ${f(t.t1 * t.t2 * t.t3 * t.t4 * t.t5, 4)}; MF = ${f(t.MF)} (${DATA.MF.angles[Engine.tiltIdx(t)]})`);
      });
    }
    S.top.types.forEach((t, ti) => {
      try { const idx = Engine.lanternIndex({ ...t, av: +t.av, bv: +t.bv, an: +t.an, bn: +t.bn, dv: +t.dv, dn: +t.dn, hsf: +t.hsf }); const kc = t.KcManual ? { v: +t.KcManual } : Engine.kcLookup(t.refl, idx.i, +t.rhoW); setOut('kc' + ti, `${f(idx.i, 3)} → ${f(kc.v, 3)}`); } catch (e) { setOut('kc' + ti, '—'); }
    });
    renderResult(); renderBreakdown();
  }

  function renderResult() {
    const box = $('#result');
    if (!C.ok) {
      box.innerHTML = `<div class="stamp bad-in"><div class="st-h">Не хватает данных</div><ul class="errs">${C.err.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
      $('#schemes').innerHTML = ''; return;
    }
    const r = C.res, n = C.norm, isSide = S.mode === 'side';
    const v = C.pass === null ? 'na' : C.pass ? 'ok' : 'bad';
    const e = r.eFinal;
    box.innerHTML = `<div class="stamp ${v}">
      <div class="st-row"><div class="st-c"><span class="st-l">${isSide ? 'Расчётный КЕО' : 'Средний КЕО'} <span class="sy">${isSide ? 'e<sub>р</sub>' : 'e<sub>ср</sub>'}</span></span><span class="st-v">${f(e)}<small>%</small></span></div>
      <div class="st-c"><span class="st-l">Нормируемый <span class="sy">e<sub>н</sub></span></span><span class="st-v">${n.v === null || n.v === undefined ? '—' : f(n.v)}<small>%</small></span></div></div>
      ${!isSide ? `<div class="st-row"><div class="st-c"><span class="st-l">Равномерность <span class="sy">e<sub>min</sub>:e<sub>ср</sub></span></span><span class="st-v sm">1 : ${f(r.uniInv)}</span></div><div class="st-c"><span class="st-l">Требование</span><span class="st-v sm">не хуже 1 : 3</span></div></div>` : ''}
      <div class="st-verdict">${v === 'ok' ? 'Соответствует' : v === 'bad' ? 'Не соответствует' : 'КЕО не нормируется'}</div>
      ${!isSide ? `<div class="pts">${r.e.map((x, j) => `<span><b>РТ${j + 1}</b> ${f(x)}</span>`).join('')}</div>` : (r.walls.length > 1 ? `<div class="pts">${r.walls.map((w, j) => `<span><b>Стена ${j + 1}</b> ${f(w.e)}</span>`).join('')}</div>` : '')}
    </div>
    ${C.warn.length ? `<div class="warns"><b>Обратите внимание</b><ul>${C.warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}`;
    renderSchemes();
  }
  function schemeList() {
    if (!C || !C.ok) return [];
    if (S.mode === 'side') { const w = C.res.walls[0]; return [['Разрез', Schemes.sideSection(w.inp, w)], ['План', Schemes.sidePlan(w.inp, w)]]; }
    if (KEO.isB2(S)) { const R2 = S.mode === 'comb' ? C.res.top : C.res, mid = Math.floor(R2.inp.points.length / 2); return [['Разрез', Schemes.b2Sect(R2.inp, R2, mid, S.mode === 'comb' ? S.comb.wallSide : null)], ['План', Schemes.b2Plan(R2.inp, S.mode === 'comb' ? S.comb.wallSide : null)]]; }
    const inpT = KEO.topInput(S), pts = inpT.points;
    return [['План', Schemes.topPlan({ ...inpT, L: +S.top.L, B: +S.top.B, y0: pts[0].y, sideWall: S.mode === 'comb' ? S.comb.wallSide : null }, pts)], ['Разрез', Schemes.topSection({ ...inpT, L: +S.top.L }, pts)]];
  }
  function renderSchemes() {
    const L = schemeList(); if (!L.length) return;
    schemeTab = Math.min(schemeTab, L.length - 1);
    $('#schemes').innerHTML = `<div class="tabs" role="tablist">${L.map(([t], i) => `<button type="button" role="tab" aria-selected="${i === schemeTab}" data-stab="${i}">${t}</button>`).join('')}</div><div class="svgw">${Schemes.toSVG(L[schemeTab][1], { label: L[schemeTab][0] })}</div>`;
  }

  function renderBreakdown() {
    const el = $('#breakdown');
    if (!C.ok) { el.innerHTML = '<p class="empty">Разбор появится, когда будут заполнены исходные данные.</p>'; return; }
    const M = KEO.buildModel(S, C);
    let h = '', open = false;
    const close = () => { if (open) { h += '</div></details>'; open = false; } };
    M.forEach(b => {
      if (b.type === 'h1' || b.type === 'verdict' || b.type === 'scheme') return;
      if (b.type === 'h2') { close(); h += `<details class="sec" data-sec="${esc(b.text)}"><summary><span>${esc(b.text)}</span></summary><div class="sec-b">`; open = true; return; }
      if (!open) { h += '<details class="sec"><summary><span>Раздел</span></summary><div class="sec-b">'; open = true; }
      if (b.type === 'h3') h += `<h4>${esc(b.text)}</h4>`;
      else if (b.type === 'p') h += `<p class="${b.small ? 'small' : ''}">${esc(b.text)}</p>`;
      else if (b.type === 'formula') h += `<div class="formula">${b.lines.map(l => `<div>${Report.richHTML(l)}</div>`).join('')}${b.src ? `<p class="small">${esc(b.src)}</p>` : ''}</div>`;
      else if (b.type === 'kv') h += `<div class="tblw"><table class="rep"><thead><tr><th>Параметр</th><th>Обозн.</th><th>Значение</th><th>Источник</th></tr></thead><tbody>${b.rows.map(r => `<tr><td>${esc(r[0])}</td><td class="c">${Report.richHTML(r[1])}</td><td class="c num">${esc(r[2])}</td><td class="src">${esc(r[3])}</td></tr>`).join('')}</tbody></table></div>`;
      else if (b.type === 'table') h += `${b.title ? `<p class="cap">${Report.richHTML(b.title)}</p>` : ''}<div class="tblw"><table class="rep"><thead><tr>${b.cols.map(c => `<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${(Array.isArray(r) ? r : r.cells).map((c, i) => `<td class="${b.cols[i].a === 'center' ? 'c num' : ''}">${Report.richHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${b.note ? `<p class="small">${esc(b.note)}</p>` : ''}`;
    });
    close();
    const openSecs = new Set([...el.querySelectorAll('details.sec[open]')].map(d => d.dataset.sec));
    el.innerHTML = h;
    el.querySelectorAll('details.sec').forEach(d => { if (openSecs.has(d.dataset.sec)) d.open = true; });
  }

  /* ---------- события ---------- */
  function onInput(e) {
    const t = e.target; const k = t.dataset.k; if (!k) return;
    let v = t.dataset.t === 'num' ? num(t.value) : t.dataset.t === 'bool' ? t.checked : t.value;
    if (k === 'rtManual' || k === 'normManual' || k === 'hpManual' || k.endsWith('t1c') || k.endsWith('KcManual') || k.endsWith('o') && /windows\.\d+\.(t2o|tau0o|Ko)$/.test(k) || k === 'top.l1' || k === 'top.y0') { if (v === '') v = null; }
    setP(S, k, v);
    if (k === 'bType') { const r = DATA.rooms.find(x => x.g === v); if (r) S.roomId = r.id; }
    const mk = k.match(/^top\.b2\.(\d+)\.kind$/); if (mk) { const t = S.top.b2[+mk[1]]; t.CNrow = KEO.cnRowDefault(v); if (v === 'A' && (+t.beta >= 90 || !t.beta)) t.beta = 45; if (v === 'trap' && +t.ho / Math.tan(+t.beta * Math.PI / 180) >= t.b / 2) t.beta = 70; }
    if (t.dataset.rebuild) { renderForm(); }
    update();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { S.mode = b.dataset.mode; renderForm(); update(); return; }
    if (b.dataset.seg) { let v = b.dataset.val; if (b.dataset.t === 'num') v = +v; setP(S, b.dataset.seg, v); const rebuild = /shape$|top\.sys$|\.face$/.test(b.dataset.seg); if (rebuild) renderForm(); else b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); update(); return; }
    if (b.dataset.stab !== undefined) { schemeTab = +b.dataset.stab; renderSchemes(); return; }
    const a = b.dataset.act; if (!a) return;
    const W = S.side.walls[+b.dataset.w || 0];
    const acts = {
      addWall: () => { const w2 = JSON.parse(JSON.stringify(S.side.walls[0])); w2.orient = ({ 'С': 'Ю', 'Ю': 'С', 'В': 'З', 'З': 'В', 'СВ': 'ЮЗ', 'ЮЗ': 'СВ', 'СЗ': 'ЮВ', 'ЮВ': 'СЗ' })[w2.orient]; w2.buildings = []; S.side.walls.push(w2); },
      delWall: () => { S.side.walls.splice(1); },
      addWin: () => { const last = W.windows[W.windows.length - 1]; W.windows.push({ ...last, s: +(last.s + (last.bo || 1.5) + 0.8).toFixed(2) }); },
      delWin: () => { W.windows.splice(+b.dataset.i, 1); },
      genWin: () => { const wi = +b.dataset.w || 0; const n = Math.max(1, Math.min(20, parseInt($('#gen-n-' + wi).value) || 1)), p = num($('#gen-p-' + wi).value) || 0, o = num($('#gen-o-' + wi).value) || 0; const base = W.windows[0]; W.windows = Array.from({ length: n }, (_, i) => ({ ...base, t2o: null, tau0o: null, Ko: null, s: +(o + (i - (n - 1) / 2) * p).toFixed(3) })); },
      addBld: () => { W.buildings.push({ l: 20, Hp: 15, a: 40, off: 0, rhoF: 0.4 }); },
      delBld: () => { W.buildings.splice(+b.dataset.i, 1); },
      addLan: () => { const T = S.top.types[+b.dataset.t]; const l = T.lanterns[T.lanterns.length - 1]; T.lanterns.push({ x: +(Math.min(+S.top.L - 0.5, l.x + 2)).toFixed(2), y: l.y }); },
      delLan: () => { S.top.types[+b.dataset.t].lanterns.splice(+b.dataset.i, 1); },
      addType: () => { const t = KEO.defaultType(); t.name = 'Фонарь ' + (S.top.types.length + 1); t.lanterns = [{ x: +S.top.L / 2, y: +S.top.B / 2 }]; S.top.types.push(t); },
      delType: () => { S.top.types.splice(+b.dataset.t, 1); },
      genLan: () => { const ti = +b.dataset.t; const g = id => num($(`#g-${id}-${ti}`).value) || 0; const rr = Math.max(1, Math.round(g('r'))), cc = Math.max(1, Math.round(g('c'))); const L = []; for (let i = 0; i < rr; i++) for (let j = 0; j < cc; j++) L.push({ x: +(g('x') + j * g('dx')).toFixed(3), y: +(g('y') + i * g('dy')).toFixed(3) }); S.top.types[ti].lanterns = L; },
      addB2Type: () => { const t = KEO.defaultB2Type(); t.name = 'Фонарь ' + (S.top.b2.length + 1); t.xs = [+(+S.top.L / 2).toFixed(2)]; S.top.b2.push(t); },
      delB2Type: () => { S.top.b2.splice(+b.dataset.t, 1); },
      addB2x: () => { const t = S.top.b2[+b.dataset.t]; const last = +t.xs[t.xs.length - 1] || 0; t.xs.push(+Math.min(+S.top.L - t.b / 2, last + Math.max(t.b + 1, 6)).toFixed(2)); },
      delB2x: () => { S.top.b2[+b.dataset.t].xs.splice(+b.dataset.i, 1); },
      genB2x: () => { const t = S.top.b2[+b.dataset.t], n = Math.max(1, Math.round(+S.top.spans || 1)), w = +S.top.L / n; t.xs = Array.from({ length: n }, (_, i) => +((i + 0.5) * w).toFixed(3)); },
      applyRho: () => { const rc = S.rhoCalc.s, sw = rc.reduce((a2, x) => a2 + (+x[0] || 0), 0); if (sw) { S.rho = +(rc.reduce((a2, x) => a2 + (+x[0] || 0) * (+x[1] || 0), 0) / sw).toFixed(3); S.rhoCalc.on = true; } }
    };
    if (acts[a]) { acts[a](); renderForm(); update(); }
  }

  /* ---------- файлы ---------- */
  async function getDownloads() {
    if (dlCap !== null) return dlCap;
    try { dlCap = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : false; } catch (e) { dlCap = false; }
    return dlCap || false;
  }
  async function saveFile(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const dl = await getDownloads();
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); toast('Файл передан на сохранение: ' + name); }
      catch (e) { toast(e && e.code === 'declined' ? 'Сохранение отменено' : 'Не удалось сохранить файл' + (e && e.code ? ` (${e.code})` : '')); }
      return;
    }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Скачан файл ' + name);
  }
  const safeName = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  async function downloadPDF() {
    if (!C || !C.ok) { toast('Сначала заполните исходные данные'); return; }
    const btns = document.querySelectorAll('[data-pdf]'); btns.forEach(b => { b.disabled = true; b.dataset.l = b.textContent; b.textContent = 'Формирую PDF…'; });
    try {
      const n = C.norm; const roomName = n.room ? n.room.name : '';
      const meta = { ...S.meta, stampTitle: `Расчёт КЕО${S.meta.room ? '. Пом. ' + S.meta.room : ''}${roomName ? ' — ' + roomName.split(',')[0] : ''}`.slice(0, 80), docTitle: `Расчёт КЕО ${S.meta.room || ''}`.trim(), sheetStart: +S.meta.sheetStart || 1 };
      const bytes = await Report.toPDF(KEO.buildModel(S, C), meta);
      await saveFile(safeName(`Расчёт КЕО${S.meta.room ? ' пом. ' + S.meta.room : ''}.pdf`), new Blob([bytes], { type: 'application/pdf' }), 'application/pdf');
    } catch (e) { console.error(e); toast('Ошибка формирования PDF: ' + e.message); }
    finally { btns.forEach(b => { b.disabled = false; b.textContent = b.dataset.l; }); }
  }
  function saveJSON() { saveFile(safeName(`КЕО ${S.meta.room || 'расчёт'}.json`), JSON.stringify(S, null, 1), 'application/json'); }
  function openJSON(file) {
    const rd = new FileReader();
    rd.onload = () => { try { const o = JSON.parse(rd.result); if (!o || o.v !== 1 || !o.side || !o.top) throw new Error('не тот формат'); S = fill(o); renderForm(); update(); toast('Расчёт загружен'); } catch (e) { toast('Не удалось открыть файл: ' + e.message); } };
    rd.readAsText(file);
  }
  function fill(o) { const d = KEO.defaultState(); return { ...d, ...o, meta: { ...d.meta, ...o.meta }, top: { ...d.top, ...o.top, b2: (o.top && o.top.b2) || d.top.b2, sys: (o.top && o.top.sys) || 'shaft' }, side: { ...d.side, ...o.side }, comb: { ...d.comb, ...o.comb }, rhoCalc: { ...d.rhoCalc, ...o.rhoCalc } }; }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ } }
  function load() { try { const s = localStorage.getItem(LS_KEY); if (s) { const o = JSON.parse(s); if (o && o.v === 1) return fill(o); } } catch (e) { /* нет */ } return null; }
  let tt = null; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 3500); }

  function init() {
    S = load(); const first = !S; if (!S) S = exampleSide();
    document.addEventListener('input', onInput);
    document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.k && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox')) return; });
    document.addEventListener('click', onClick);
    $('#ex-menu').addEventListener('change', e => { const v = e.target.value; e.target.value = ''; if (!v) return; $('#first-note').hidden = true; S = v === 'side' ? exampleSide() : v === 'top' ? exampleTop() : v === 'b2' ? exampleB2() : (() => { const s = exampleTop(); s.mode = 'comb'; return s; })(); if (v === 'new') { S = KEO.defaultState(); } renderForm(); update(); toast(v === 'new' ? 'Новый расчёт' : 'Загружен пример'); });
    $('#btn-save').addEventListener('click', saveJSON);
    $('#file-open').addEventListener('change', e => { if (e.target.files[0]) openJSON(e.target.files[0]); e.target.value = ''; });
    document.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', downloadPDF));
    renderForm(); update();
    if (first) $('#first-note').hidden = false;
    getDownloads();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
