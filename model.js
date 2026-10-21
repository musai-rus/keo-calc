/* Состояние → входные данные расчёта → результат → модель отчёта. Без DOM. */
const KEO = (function () {
  const f = Report.f, R = Engine;
  const round2 = x => Math.round(x * 100 + 1e-9) / 100;
  const ORIENTS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  const ORIENT_NAME = { 'С': 'север', 'СВ': 'северо-восток', 'В': 'восток', 'ЮВ': 'юго-восток', 'Ю': 'юг', 'ЮЗ': 'юго-запад', 'З': 'запад', 'СЗ': 'северо-запад' };
  const RT_TEXT = {
    center: 'в центре помещения',
    far1: 'на расстоянии 1 м от стены, наиболее удалённой от световых проёмов',
    'far1.2': 'на расстоянии 1,2 м от стены, наиболее удалённой от световых проёмов',
    manual: 'задано вручную',
    unknown: 'недостаточно данных — задайте точку явно'
  };
  const RT_REF = { center: 'п. 5.3 ж) СП 52.13330.2016', far1: 'п. 5.3 а), в), д) СП 52.13330.2016', 'far1.2': 'п. 5.3 г) СП 52.13330.2016', manual: '—' };
  const K_TITLES = { none: 'Нет', balcony: 'Балкон над/перед окном (табл. Б.17)', loggia: 'Лоджия (табл. Б.18)', canopy: 'Горизонтальный козырёк (табл. Б.19)', screen: 'Вертикальный экран (табл. Б.20)', manual: 'Задать K вручную' };

  function defaultWindow(s) { return { hpd: 0.8, ho: 1.8, bo: 1.5, s: s || 0, t2m: 'wall', t2o: null, tau0m: 'wall', tau0o: null, tau0b: '', Km: 'wall', Ko: null, Kb: '' }; }
  function defaultWall(orient) {
    return { orient: orient || 'Ю', dp: 6.0, bp: 6.0, H: 3.0, dst: 0.5, lt: 3.0, ds: 0, t1: 0, t1c: null, t2: 0, t4: 0, t5: 1, kType: 'none', kDepth: 1.5, kManual: null, kBasis: '', windows: [defaultWindow(-1.4), defaultWindow(1.4)], buildings: [] };
  }
  function defaultType() { return { name: 'Фонарь 1', shape: 'round', av: 1.5, bv: 1.5, an: 1.5, bn: 1.5, dv: 1.5, dn: 1.5, hsf: 1.0, refl: 'diffuse', rhoW: 0.7, t1: 0.48, t2: 0.75, t3: 1, t4: 1, net: false, tilt: 0, lanterns: [{ x: 3, y: 3 }] }; }

  const B2_KINDS = [['rect', 'Прямоугольный (П-образный)'], ['trap', 'Трапециевидный'], ['A', 'А-образный'], ['shedV', 'Шед с вертикальным остеклением'], ['shedI', 'Шед с наклонным остеклением'], ['plane', 'Проём в плоскости покрытия']];
  const CN_ROWS = [['С-Ю', 'Прямоуг./трапец.: остекление на С и Ю'], ['СВ-ЮЗ', 'Прямоуг./трапец.: на СВ–ЮЗ или ЮВ–СЗ'], ['В-З', 'Прямоуг./трапец.: на В и З'], ['shed', 'Шед, остекление на С'], ['zenith', 'Горизонтальные (как зенитные)']];
  const cnRowDefault = kind => kind === 'plane' ? 'zenith' : (kind === 'shedV' || kind === 'shedI') ? 'shed' : 'С-Ю';
  function defaultB2Type() { return { name: 'Фонарь 1', kind: 'rect', b: 3, hst: 0.6, ho: 1.8, beta: 60, face: 'R', ystart: 0, ylen: null, pieces: 1, pitch: 0, t1: 0.8, t2: 0.9, t3: 1, t4: 1, net: false, CNrow: 'С-Ю', xs: [4] }; }

  function defaultState() {
    return {
      v: 1, mode: 'side',
      meta: { code: '', object: '', room: '', author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 },
      region: 'г. Москва', group: 1, groupManual: false,
      bType: 'Административные здания, здания государственных учреждений, проектные и научные организации', roomId: 'A1',
      lightSys: 'ЕО', normManual: null, hpManual: null, rtManual: null,
      env: 'normal', glassMult: 1, rho: 0.55, rhoMode: 'default', rhoBasis: '', rhoGeo: 'auto',
      rhoSurf: { floor: { S: null, rho: null, src: '' }, walls: { S: null, rho: null, src: '' }, ceil: { S: null, rho: null, src: '' }, win: { S: null, rho: null, src: '' } }, rhoRows: [],
      rhoCalc: { on: false, s: [] },
      dan: { wall: 0, win: 0, sec: 0 },
      side: { walls: [defaultWall('Ю')] },
      top: { sys: 'shaft', L: 8, B: 6, H: 4.2, spans: 1, l1: null, y0: null, nPts: 0, nPtsBasis: '', coordOrigin: 'corner', types: [defaultType()], b2: [defaultB2Type()] },
      comb: { wallSide: 'x0' }
    };
  }

  function room(st) { return DATA.rooms.find(r => r.id === st.roomId) || null; }
  function groupOf(st) { if (st.groupManual) return st.group; const r = DATA.regions.find(x => x.name === st.region); return r ? r.g : st.group; }
  function normOf(st) {
    const r = room(st); const isTop = st.mode !== 'side';
    const col = isTop ? (st.lightSys === 'ЕО' ? 'eTopN' : 'eTopC') : (st.lightSys === 'ЕО' ? 'eSideN' : 'eSideC');
    const v = st.normManual !== null && st.normManual !== '' && !isNaN(st.normManual) ? +st.normManual : (r ? r[col] : null);
    const colName = (isTop ? 'при верхнем или комбинированном' : 'при боковом') + ' ' + (st.lightSys === 'ЕО' ? 'естественном' : 'совмещённом') + ' освещении';
    return { v, manual: st.normManual !== null && st.normManual !== '', colName, room: r, src: r ? `СП 367.1325800.2025, табл. А.1, п. ${r.n} (= СП 52.13330.2016, табл. Л.1)` : '—' };
  }
  // Справочное сопоставление норм не меняет систему освещения и не оценивает
  // допустимость перехода на СО. Ручная норма относится только к выбранной системе.
  function normComparison(st) {
    const r = room(st), isTop = st.mode !== 'side';
    const rows = ['ЕО', 'СО'].map(system => {
      const selected = system === st.lightSys;
      const n = normOf({ ...st, lightSys: system, normManual: null });
      const effective = selected ? normOf(st) : n;
      return { system, label: system === 'ЕО' ? 'Естественное освещение' : 'Совмещённое освещение',
        selected, tableValue: n.v ?? null, value: effective.v ?? null,
        manual: selected && effective.manual, src: n.src, colName: n.colName };
    });
    return { rows, room: r, mode: isTop ? 'верхнее или комбинированное' : 'боковое',
      note: 'Нормы ЕО и СО приведены для справки. Вывод относится только к выбранной системе освещения и проверяемым показателям КЕО. Сравнение с нормой СО не подтверждает допустимость перехода на совмещённое освещение и выполнение требований к искусственному освещению.' };
  }
  function hpOf(st) { const r = room(st); if (st.hpManual !== null && st.hpManual !== '' && !isNaN(st.hpManual)) return +st.hpManual; return r && r.h !== null ? r.h : 0.8; }
  const SIDE_POINT_MISSING = 'Недостаточно данных для выбора расчётной точки: несколько записей стен не подтверждают число физических световых сторон. Румб не задаёт плоскость стены. Проверьте геометрию и явно задайте положение точки.';
  function rtOf(st) {
    if (st.rtManual) return Object.hasOwn(RT_REF, st.rtManual) ? st.rtManual : 'unknown';
    // No plane/normal/room/precision contract exists in the manual wall records.
    // Equal climate sectors cannot establish one physical facade.
    if (st.mode === 'side' && st.side.walls.length > 1) return 'unknown';
    const r = room(st); return r ? r.rt : 'center';
  }
  function ltAuto(rule, dp) { return rule === 'far1' ? dp - 1 : rule === 'far1.2' ? dp - 1.2 : rule === 'center' ? dp / 2 : NaN; }
  function mfOf(st, angleIdx) { return R.MF(st.env, angleIdx, st.glassMult).v; }
  function tau1Wall(w) { const c = coefCheck(w.t1c, 't1c'); return c.st === 'ok' ? c.v : DATA.tau1[w.t1].v; }

  /* ---------- ручные коэффициенты: явное состояние присутствия ----------
     Ввод → { st: 'empty' | 'ok' | 'invalid', v, msg }. Пустое поле, null и undefined — «не задано»;
     «0,36» и «0.36» — одно число; нечисловая строка, ±∞ — ошибка (не молчаливый возврат к общему значению).
     Допустимость нуля и диапазон — по полю (COEF_RULES); недопустимое значение вызывает ошибку исходных данных. */
  const COEF_RULES = {
    t1c: { name: 'τ1 по паспорту', lo: 0, hi: 1, zero: false },
    t2: { name: 'τ2 проёма', lo: 0, hi: 1, zero: false },
    tau0: { name: 'τо проёма', lo: 0, hi: 1, zero: false },
    K: { name: 'K', lo: 0, hi: 1, zero: false }
  };
  function readNum(v) {
    if (v === null || v === undefined) return { st: 'empty' };
    if (typeof v === 'number') return Number.isFinite(v) ? { st: 'num', v } : { st: 'invalid', raw: v };
    const s = String(v).replace(/\s/g, '').replace(',', '.');
    if (s === '') return { st: 'empty' };
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { st: 'invalid', raw: v };
    const x = Number(s); return Number.isFinite(x) ? { st: 'num', v: x } : { st: 'invalid', raw: v };
  }
  function coefCheck(v, key) {
    const R0 = COEF_RULES[key], r = readNum(v);
    if (r.st === 'empty') return { st: 'empty' };
    if (r.st === 'invalid') return { st: 'invalid', msg: `${R0.name}: «${r.raw}» — не число` };
    if (r.v === 0 && !R0.zero) return { st: 'invalid', v: 0, msg: `${R0.name}: ноль недопустим (проём без пропускания удалите из расчёта)` };
    if (r.v < R0.lo || r.v > R0.hi) return { st: 'invalid', v: r.v, msg: `${R0.name} = ${f(r.v, 3)} — вне диапазона ${f(R0.lo, 0)}…${f(R0.hi, 0)}` };
    return { st: 'ok', v: r.v };
  }
  // режим исключения проёма: явный t2m/tau0m/Km; в файлах прежних версий режима нет —
  // тогда «вручную», если значение задано и не ноль (так работала прежняя проверка истинности), иначе «по общим»
  const OVR = { t2: ['t2m', 't2o'], tau0: ['tau0m', 'tau0o', 'tau0b'], K: ['Km', 'Ko', 'Kb'] };
  function winMode(x, key) {
    const m = x[OVR[key][0]]; if (m === 'manual' || m === 'wall') return m;
    const r = readNum(x[OVR[key][1]]); return r.st === 'num' && r.v !== 0 ? 'manual' : 'wall';
  }
  // приведение старого файла к явным режимам (значения не меняются); возвращает замечания о неоднозначных данных
  function migrateWindows(st) {
    const notes = [];
    (st.side && st.side.walls || []).forEach((w, wi) => (w.windows || []).forEach((x, i) => Object.keys(OVR).forEach(k => {
      const [mk, vk] = OVR[k]; if (x[mk] === 'manual' || x[mk] === 'wall') return;
      const r = readNum(x[vk]); x[mk] = winMode(x, k);
      if (r.st === 'num' && r.v === 0) notes.push(`Стена ${wi + 1}, проём ${i + 1}: в файле ${COEF_RULES[k].name} = 0 — прежняя версия его не применяла; оставлено «по общим параметрам», значение сохранено`);
      if (r.st === 'invalid') notes.push(`Стена ${wi + 1}, проём ${i + 1}: в файле ${COEF_RULES[k].name} = «${r.raw}» — не число; оставлено «по общим параметрам»`);
    })));
    return notes;
  }

  // общие для стены коэффициенты: τ1, τ2, τ4, τ5 и вычисленные τо и K («по общим параметрам стены»)
  function wallCoef(st, W, dpK) {
    const rule = rtOf(st), kPos = rule === 'center' ? 'center' : 'wall1';
    const t1c = coefCheck(W.t1c, 't1c');
    const t1 = { v: t1c.st === 'ok' ? t1c.v : DATA.tau1[W.t1].v, src: t1c.st === 'ok' ? 'по данным производителя' : `${DATA.tau1[W.t1].t} (${DATA.tau1[W.t1].r}); табл. Б.13/Б.14 — принято нижнее значение` };
    const t2 = { v: DATA.tau2[W.t2].v, src: `${DATA.tau2[W.t2].t}; табл. Б.15` };
    const t4 = { v: DATA.tau4[W.t4].v, src: `${DATA.tau4[W.t4].t}; табл. Б.16` };
    const t5 = { v: +W.t5 || 1 };
    const tau0 = t1.v * t2.v * 1 * t4.v * t5.v;
    const K = kOf(W, dpK, kPos);
    return { t1, t2, t4, t5, tau0, K, kPos, err: [t1c.st === 'invalid' ? t1c.msg : null, ...K.err].filter(Boolean) };
  }
  const posText = p => p === 'center' ? 'расчётная точка в центре помещения' : 'расчётная точка в 1 м от стены, наиболее удалённой от проёмов';
  const howText = (h, el) => {
    const a = h.el === 'node' && h.depth === 'node' ? 'значение в узле таблицы' : [h.el === 'interp' ? 'интерполяция по выносу' : h.el === 'extrap' ? `экстраполяция по выносу (табл.: ${f(h.elRange[0], 1)}…${f(h.elRange[1], 1)} м)` : null, h.depth === 'interp' ? 'интерполяция по глубине помещения' : h.depth === 'extrap' ? `экстраполяция по глубине помещения (табл.: ${f(h.depthRange[0], 0)}…${f(h.depthRange[1], 0)} м)` : null].filter(Boolean).join(', ');
    return a + (h.clamped ? `; экстраполяция дала ${f(h.raw, 3)} — ограничено диапазоном 0…1` : '') + (h.el === 'extrap' || h.depth === 'extrap' ? ' (примечание к таблице допускает экстраполяцию)' : '');
  };
  // K стены: нет элемента / таблица Б.17–Б.20 / вручную для стены
  function kOf(W, dp, kPos) {
    if (W.kType === 'manual') {
      const c = coefCheck(W.kManual, 'K');
      if (c.st !== 'ok') return { v: NaN, mode: 'manual', src: 'задано вручную для стены', err: [`K стены: ${c.st === 'empty' ? 'режим «вручную», значение не введено' : c.msg}`] };
      return { v: c.v, mode: 'manual', tab: null, src: `задано вручную для стены: ${W.kBasis ? W.kBasis : 'основание не указано'}`, err: [] };
    }
    if (!W.kType || W.kType === 'none') return { v: 1, mode: 'none', tab: null, src: 'K = 1,00; затеняющие элементы отсутствуют', err: [] };
    const depth = readNum(W.kDepth);
    if (depth.st !== 'num' || !(depth.v > 0)) return { v: NaN, mode: 'table', src: '', err: ['K: укажите вынос затеняющего элемента больше нуля'] };
    const k = R.KLookup(W.kType, dp, depth.v, kPos);
    return { v: k.v, mode: 'table', tab: k.tab, info: k, src: `СП 367.1325800.2025, табл. ${k.tab} (${k.title.toLowerCase()}): вынос ${f(depth.v)} м; глубина помещения ${f(dp)} м; ${posText(kPos)}; ${howText(k.how)}`, err: [] };
  }
  // эффективные коэффициенты проёма — единственный источник для ядра, формы и отчёта
  function winCoef(gen, x, i) {
    const err = [], warn = [], n = i + 1;
    const m = { t2: winMode(x, 't2'), tau0: winMode(x, 'tau0'), K: winMode(x, 'K') };
    const msg = (key, c) => `Проём ${n}: ${c.st === 'empty' ? `${COEF_RULES[key].name} — режим «вручную», значение не введено` : c.msg}`;
    const man = key => { const c = coefCheck(x[OVR[key][1]], key); if (c.st !== 'ok') err.push(msg(key, c)); return c.v; };
    const basis = key => { const b = OVR[key][2] && x[OVR[key][2]]; return b ? String(b) : 'основание не указано'; };
    let t2 = { v: gen.t2.v, src: 'общий для стены', mode: 'wall' };
    // при ручном τо τ2 проёма не участвует в расчёте: его ошибка не блокирует результат, а выводится предупреждением
    if (m.t2 === 'manual' && m.tau0 === 'manual') { const c = coefCheck(x[OVR.t2[1]], 't2'); if (c.st !== 'ok') warn.push(`${msg('t2', c)} — не используется (τо задано вручную), в расчёт не входит`); t2 = { v: c.st === 'ok' ? c.v : NaN, src: 'задан для проёма', mode: 'manual' }; }
    else if (m.t2 === 'manual') { const v = man('t2'); t2 = { v, src: 'задан для проёма', mode: 'manual' }; }
    let tau0;
    if (m.tau0 === 'manual') { const v = man('tau0'); tau0 = { v, mode: 'manual', src: `задано вручную для проёма ${n}: ${basis('tau0')}; τ1…τ5 не используются` }; t2.used = false; }
    else { const v = gen.t1.v * t2.v * 1 * gen.t4.v * gen.t5.v; tau0 = { v, mode: 'wall', src: `τо = τ1·τ2·τ3·τ4·τ5 = ${f(gen.t1.v)}·${f(t2.v)}·1,00·${f(gen.t4.v)}·${f(gen.t5.v)} (формула (Б.8) СП 367)${m.t2 === 'manual' ? `; τ2 — заданный для проёма ${n}` : ''}` }; t2.used = true; }
    let K;
    if (m.K === 'manual') { const v = man('K'); K = { v, mode: 'manual', src: `задано вручную для проёма ${n}: ${basis('K')}` }; }
    else K = { v: gen.K.v, mode: gen.K.mode, src: gen.K.src, tab: gen.K.tab };
    return { t1: gen.t1.v, t2, t4: gen.t4.v, t5: gen.t5.v, tau0, K, modes: m, err, warn };
  }
  /* ---------- средневзвешенный коэффициент отражения ρср ----------
     Режимы: default — 0,55 (примечание 2 к табл. Б.6/Б.7: коэффициенты отражения неизвестны);
     surf — по поверхностям, формула (3.6) п. 3.13; состав — по примечанию 2 к табл. Б.6/Б.7 (боковой: пол, стены, потолок, окна),
     для r2 верхнего света — табл. Б.21 (пол, стены, потолок); manual — одно значение и основание пользователя;
     legacy — файл прежней версии: число сохранено, источник не подтверждён.
     Применяемое значение округляется до сотых (как прочие аргументы таблиц r0 и r2), точное — выводится рядом. */
  const RHO_ROWS = [['floor', 'Пол'], ['walls', 'Стены (непрозрачные, без окон)'], ['ceil', 'Потолок'], ['win', 'Окна']];
  function rhoMode(st) {
    if (['default', 'surf', 'manual', 'legacy'].includes(st.rhoMode)) return st.rhoMode;
    // прежний формат (нет rhoMode): происхождение числа неизвестно (0,55 могло быть введено вручную или получено расчётом) —
    // число сохраняется, источник не подтверждён, пока пользователь не выберет режим
    return 'legacy';
  }
  // переключение источника ρср; при переходе в «вручную» применённое значение прежнего режима переносится в поле
  function setRhoMode(st, v) {
    // значение берётся по режиму ДО переключения (иначе проверка видит уже «вручную» и переносить нечего)
    if (v === 'manual' && st.rhoMode !== 'manual') { const rh = rhoOf(st); if (!rh.err.length && Number.isFinite(rh.v)) st.rho = rh.v; }
    st.rhoMode = v;
    return st;
  }
  // оболочка комнаты (один раз на помещение) по подтверждённой геометрии прямоугольной комнаты с плоским потолком
  function roomShell(st) {
    const err = [], warn = [];
    if (st.mode === 'side') {
      const W = st.side.walls, a = +W[0].dp, b = +W[0].bp, H = +W[0].H;
      W.slice(1).forEach((w, i) => {
        const same = Math.abs(+w.H - H) < 0.005 && ((Math.abs(+w.dp - a) < 0.005 && Math.abs(+w.bp - b) < 0.005) || (Math.abs(+w.dp - b) < 0.005 && Math.abs(+w.bp - a) < 0.005));
        if (!same) err.push(`ρср по поверхностям: габариты стены ${i + 2} (${f(w.dp)} × ${f(w.bp)} × ${f(w.H)} м) не согласуются со стеной 1 (${f(a)} × ${f(b)} × ${f(H)} м) — оболочку комнаты нельзя определить однозначно. Исправьте dп, bп, H или задайте площади ручной ведомостью.`);
      });
      return { a, b, H, walls: W.map(w => ({ len: +w.bp, H: +w.H, windows: w.windows })), err, warn };
    }
    const T = st.top;
    return { a: +T.L, b: +T.B, H: +T.H, walls: st.mode === 'comb' ? [{ len: +T.B, H: +T.H, windows: st.side.walls[0].windows }] : [], err, warn };
  }
  function windowsArea(shell) {
    const err = []; let S = 0;
    shell.walls.forEach((w, wi) => {
      const pre = shell.walls.length > 1 ? `стена ${wi + 1}, ` : '';
      const box = w.windows.map((x, i) => ({ i, y0: +x.s - +x.bo / 2, y1: +x.s + +x.bo / 2, z0: +x.hpd, z1: +x.hpd + +x.ho }));
      box.forEach(o => {
        if (!(o.y1 > o.y0 && o.z1 > o.z0)) return;
        S += (o.y1 - o.y0) * (o.z1 - o.z0);
        if (o.y0 < -w.len / 2 - 0.005 || o.y1 > w.len / 2 + 0.005 || o.z0 < -0.005 || o.z1 > w.H + 0.005) err.push(`ρср по поверхностям: ${pre}проём ${o.i + 1} выходит за пределы стены ${f(w.len)} × ${f(w.H)} м — площадь стен определить нельзя`);
      });
    });
    return { S, err };
  }
  // перекрытие проёмов на развёртке стены — ошибка исходных данных при любом источнике ρср:
  // свет через общий участок (и его площадь в ρср) был бы учтён дважды
  function windowOverlaps(windows) {
    const box = windows.map((x, i) => ({ i, y0: +x.s - +x.bo / 2, y1: +x.s + +x.bo / 2, z0: +x.hpd, z1: +x.hpd + +x.ho })), out = [];
    for (let p = 0; p < box.length; p++) for (let q = p + 1; q < box.length; q++) {
      const A = box[p], B = box[q];
      if (Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.005 && Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0) > 0.005) out.push(`Проёмы ${A.i + 1} и ${B.i + 1} перекрываются — свет и площадь окон были бы учтены дважды; проверьте s, bо, hпд, hо`);
    }
    return out;
  }
  function rhoOf(st) {
    const mode = rhoMode(st), top = st.mode === 'top', err = [], warn = [];
    const tabRef = st.mode === 'side' ? 'примечание 2 к табл. Б.6 (точка на УРП) / Б.7 (точка на полу)' : st.mode === 'top' ? 'табл. Б.21 (r2: пол, стены, потолок)' : 'примечание 2 к табл. Б.6/Б.7 и табл. Б.21';
    if (mode === 'default') return { v: 0.55, exact: 0.55, mode, label: `0,55 — коэффициенты отражения отделки неизвестны: для жилых и общественных зданий ρср = 0,55 (СП 367.1325800.2025, примечание 2 к табл. Б.6/Б.7)`, err, warn };
    if (mode === 'manual') {
      const r = readNum(st.rho);
      if (r.st !== 'num' || !(r.v > 0 && r.v < 1)) err.push(`ρср: ${r.st === 'empty' ? 'режим «вручную», значение не введено' : r.st === 'invalid' ? `«${r.raw}» — не число` : `${f(r.v)} — должно быть больше 0 и меньше 1`}`);
      return { v: r.v, exact: r.v, mode, label: `задано вручную: ${st.rhoBasis ? st.rhoBasis : 'основание не указано'}`, err, warn };
    }
    if (mode === 'legacy') {
      const rc = st.rhoCalc, ok = rc && rc.on && rc.s && Math.abs(rc.s.reduce((a, x) => a + (+x[0] || 0) * (+x[1] || 0), 0) / (rc.s.reduce((a, x) => a + (+x[0] || 0), 0) || 1) - +st.rho) < 0.0005;
      const r = readNum(st.rho); if (r.st !== 'num' || !(r.v > 0 && r.v < 1)) err.push('ρср: в файле нет корректного значения — выберите режим');
      return { v: r.v, exact: r.v, mode, label: ok ? `источник не подтверждён: файл прежней версии, ρср = ${f(r.v, 3)} совпадает с помощником (площади ${rc.s.map(x => f(x[0], 1)).join(' / ')} м² и ρ ${rc.s.map(x => f(x[1])).join(' / ')} — происхождение площадей и коэффициентов не подтверждено)` : 'источник не подтверждён (файл прежней версии); выберите режим ρср', err, warn };
    }
    // surf
    const rows = [];
    const rs = st.rhoSurf || {};
    if (st.rhoGeo === 'manual') {
      (st.rhoRows || []).forEach((x, i) => rows.push({ key: 'r' + i, name: x.name || `Поверхность ${i + 1}`, S: readNum(x.S), Sauto: null, man: true, rho: readNum(x.rho), src: x.src || '' }));
      if (!rows.length) err.push('ρср по поверхностям: ведомость площадей пуста');
    } else {
      const sh = roomShell(st); sh.err.forEach(e => err.push(e));
      if (!(sh.a > 0 && sh.b > 0 && sh.H > 0)) err.push('ρср по поверхностям: нужны размеры помещения больше нуля');
      const wa = windowsArea(sh); wa.err.forEach(e => err.push(e));
      const keys = top ? RHO_ROWS.slice(0, 3) : RHO_ROWS;
      const man = k => readNum(rs[k] && rs[k].S);
      const Swin = man('win').st === 'num' ? man('win').v : wa.S;
      const auto = { floor: sh.a * sh.b, ceil: sh.a * sh.b, win: wa.S, walls: 2 * (sh.a + sh.b) * sh.H - (top ? 0 : Swin) };
      const how = { floor: `a × b = ${f(sh.a)} × ${f(sh.b)}`, ceil: `a × b = ${f(sh.a)} × ${f(sh.b)} (плоский потолок)`, win: 'Σ bо × hо по проёмам (наружный обмер коробки, п. Б.2.7)', walls: top ? `2·(a + b)·H = 2·(${f(sh.a)} + ${f(sh.b)})·${f(sh.H)}` : `2·(a + b)·H − Sок = 2·(${f(sh.a)} + ${f(sh.b)})·${f(sh.H)} − ${f(Swin)}` };
      keys.forEach(([k, name]) => { const m = man(k); rows.push({ key: k, name: top && k === 'walls' ? 'Стены' : name, S: m.st === 'empty' ? { st: 'num', v: auto[k] } : m, Sauto: auto[k], man: m.st !== 'empty', how: how[k], rho: readNum(rs[k] && rs[k].rho), src: (rs[k] && rs[k].src) || '' }); });
      if (rows.some(x => x.man)) warn.push('ρср: часть площадей задана вручную — при изменении размеров помещения они не пересчитываются.');
    }
    rows.forEach(x => {
      if (x.S.st !== 'num') err.push(`ρср: ${x.name} — площадь ${x.S.st === 'invalid' ? `«${x.S.raw}» не число` : 'не задана'}`);
      else if (x.S.v < 0) err.push(`ρср: ${x.name} — отрицательная площадь ${f(x.S.v)} м²${x.key === 'walls' && !x.man ? ' (окна больше площади стен — проверьте размеры)' : ''}`);
      if (x.rho.st !== 'num') err.push(`ρср: ${x.name} — укажите коэффициент отражения ρ${x.rho.st === 'invalid' ? ` («${x.rho.raw}» не число)` : ''}`);
      else if (!(x.rho.v >= 0 && x.rho.v < 1)) err.push(`ρср: ${x.name} — ρ = ${f(x.rho.v)} вне диапазона 0…1`);
    });
    const sS = rows.reduce((a, x) => a + (x.S.st === 'num' ? x.S.v : 0), 0);
    if (!err.length && !(sS > 0)) err.push('ρср: сумма площадей равна нулю — ρср не определяется');
    const exact = err.length ? NaN : rows.reduce((a, x) => a + x.S.v * x.rho.v, 0) / sS;
    const v = err.length ? NaN : round2(exact);
    return { v, exact, mode, rows, sumS: sS, geo: st.rhoGeo === 'manual' ? 'manual' : 'auto', label: `по поверхностям: формула (3.6), п. 3.13 СП 367; состав — ${tabRef}; ρср = ${f(exact, 4)}, принято ${f(v)} (округление до сотых)`, err, warn };
  }

  // загрузка сохранённого состояния (в т. ч. прежних версий): недостающие поля — по умолчанию, но ρ и режимы
  // исключений восстанавливаются из самих данных, а не подменяются значениями по умолчанию; notes — что пришлось истолковать
  function migrate(o) {
    const d = defaultState();
    const st = { ...d, ...o, meta: { ...d.meta, ...o.meta }, top: { ...d.top, ...o.top, b2: (o.top && o.top.b2) || d.top.b2, sys: (o.top && o.top.sys) || 'shaft' }, side: { ...d.side, ...o.side }, comb: { ...d.comb, ...o.comb }, rhoCalc: { ...d.rhoCalc, ...o.rhoCalc }, rhoSurf: { ...d.rhoSurf, ...(o.rhoSurf || {}) }, dan: { ...d.dan, ...(o.dan || {}) } };
    const notes = [];
    // coordOrigin changes the input display only. JSON always stores corner coordinates.
    st.top.coordOrigin = o.top?.coordOrigin === 'center' ? 'center' : 'corner';
    if (st.mode !== 'side' && +st.top.L <= 4 && !st.top.nPtsBasis) notes.push('Число точек для L ≤ 4 м требует явного выбора и обоснования; исходные координаты сохранены.');
    if (!o.rhoMode) {
      st.rhoMode = rhoMode(o);
      if (o.rho === undefined || o.rho === null || o.rho === '') { st.rho = null; notes.push('ρср: в файле прежней версии значения нет — выберите режим'); }
      else notes.push(`ρср = ${f(+o.rho, 3)} из файла прежней версии — источник не подтверждён; значение сохранено`);
    }
    st.side.walls.forEach(w => { if (w.kManual === undefined) w.kManual = null; if (w.kBasis === undefined) w.kBasis = ''; w.windows.forEach(x => { if (x.tau0b === undefined) x.tau0b = ''; if (x.Kb === undefined) x.Kb = ''; }); });
    migrateWindows(st).forEach(n => notes.push(n));
    return { st, notes };
  }

  const MODE_TXT = { wall: 'по общим параметрам стены', manual: 'вручную', none: 'по общим параметрам стены', table: 'по общим параметрам стены' };

  /* ---------- входные данные для движка ---------- */
  function sideInput(st, overrides) {
    const g = groupOf(st), hp = hpOf(st), rule = rtOf(st);
    if (st.mode === 'side' && rule === 'unknown') throw new Error(SIDE_POINT_MISSING);
    const walls = st.side.walls.map(w => {
      const lt = rule === 'manual' ? +w.lt : ltAuto(rule, +w.dp);
      const o = { orient: w.orient, bp: +w.bp, dp: +w.dp, H: +w.H, lt, ds: +w.ds || 0, dst: +w.dst, kPos: rule === 'center' ? 'center' : 'wall1', MF: mfOf(st, 3), ...(overrides || {}) };
      const gen = wallCoef(st, w, o.dp);
      o.windows = w.windows.map((x, i) => {
        const c = winCoef(gen, x, i);
        return { hpd: +x.hpd, ho: +x.ho, bo: +x.bo, s: +x.s, t1: c.t1, t2: c.t2.v, t4: c.t4, t5: c.t5, tau0: c.tau0.v, K: c.K.v, kType: w.kType, kDepth: +w.kDepth, tau0src: c.tau0.src, Ksrc: c.K.src, coef: c };
      });
      o.buildings = w.buildings.map(b => ({ l: +b.l, Hp: +b.Hp, a: +b.a, off: +b.off || 0, rhoF: +b.rhoF }));
      o.gen = gen;
      return o;
    });
    return { group: g, rho: rhoOf(st).v, hp, MF: mfOf(st, 3), walls };
  }
  // ошибки ручных коэффициентов (до выдачи результата)
  function coefErrors(st, warn) {
    const walls = st.mode === 'comb' ? st.side.walls.slice(0, 1) : st.side.walls, err = [];
    const dp = w => st.mode === 'comb' ? +st.top.L : +w.dp;
    walls.forEach((w, wi) => {
      const pre = walls.length > 1 ? `Стена ${wi + 1}. ` : '';
      const gen = wallCoef(st, w, dp(w));
      gen.err.forEach(e => err.push(pre + e));
      w.windows.forEach((x, i) => { const c = winCoef(gen, x, i); c.err.forEach(e => err.push(pre + e)); if (warn) c.warn.forEach(e => warn.push(pre + e)); });
    });
    return err;
  }
  function lanternCoord(st, value, axis, toStored = false) {
    const n = readNum(value);
    if (n.st !== 'num') return value; // Empty/invalid input must not become a coordinate of zero.
    if (st.top.coordOrigin !== 'center') return n.v;
    const dim = readNum(axis === 'x' ? st.top.L : st.top.B);
    if (dim.st !== 'num' || dim.v <= 0) return null;
    return n.v + (toStored ? 1 : -1) * dim.v / 2;
  }
  function topPointPolicy(st) {
    const T = st.top, L = +T.L, raw = readNum(T.nPts), err = [];
    const auto = raw.st === 'num' && raw.v === 0;
    const N = auto ? (L > 4 ? 5 : 0) : raw.v;
    if (!(Number.isFinite(L) && L > 2)) err.push('Для точек с отступом 1 м от обеих стен длина L должна быть больше 2 м; для меньшего помещения нужна отдельная схема расчёта.');
    else if (auto && L <= 4) err.push('При L ≤ 4 м выберите число точек и укажите обоснование: п. 8.5.2 СП 367 не задаёт правило «3 точки».');
    else if (!Number.isInteger(N) || N < 3 || N > 101) err.push('Число расчётных точек: укажите целое число от 3 до 101.');
    else if (L > 4 && N < 5) err.push('При L > 4 м требуется не менее пяти расчётных точек (п. 8.5.2 СП 367).');
    if (L > 2 && L <= 4 && !auto && !String(T.nPtsBasis || '').trim()) err.push('Укажите обоснование выбранного числа точек для L ≤ 4 м.');
    const note = L > 4 ? `${auto ? 'Авто: 5 точек' : 'Число точек задано вручную'}; минимум 5 при L > 4 м (п. 8.5.2 СП 367).` : `Число точек задано пользователем для L ≤ 4 м, не является правилом «3 точки по СП». Обоснование: ${T.nPtsBasis || 'не указано'}.`;
    return { N, err, note };
  }
  function topPoints(st) {
    const T = st.top, L = +T.L, B = +T.B, y = readNum(T.y0), y0 = y.st === 'empty' ? B / 2 : y.v;
    const policy = topPointPolicy(st); if (policy.err.length) return [];
    return Array.from({ length: policy.N }, (_, j) => ({ x: 1 + (L - 2) * j / (policy.N - 1), y: y0 }));
  }
  function topInput(st) {
    const T = st.top, g = groupOf(st);
    return {
      group: g, rho: rhoOf(st).v, H: +T.H, hurp: hpOf(st), spans: +T.spans || 1, l1: T.l1 ? +T.l1 : +T.B,
      points: topPoints(st), coordOrigin: T.coordOrigin || 'corner',
      types: T.types.map(t => ({
        name: t.name, shape: t.shape, av: +t.av, bv: +t.bv, an: +t.an, bn: +t.bn, dv: +t.dv, dn: +t.dn, hsf: +t.hsf, refl: t.refl, rhoW: +t.rhoW,
        t1: +t.t1, t2: +t.t2, t3: +t.t3, t4: +t.t4, t5: t.net ? 0.9 : 1, MF: mfOf(st, +t.tilt || 0), Kc: t.KcManual ? +t.KcManual : undefined,
        lanterns: t.lanterns.map(l => ({ x: readNum(l.x).v, y: readNum(l.y).v }))
      }))
    };
  }

  function b2Input(st) {
    const T = st.top, g = groupOf(st), B = +T.B, L = +T.L, spans = +T.spans || 1;
    return {
      group: g, rho: rhoOf(st).v, L, W: B, Hk: +T.H, hurp: hpOf(st), spans, l1: T.l1 ? +T.l1 : L / spans,
      y0: readNum(T.y0).st === 'empty' ? B / 2 : readNum(T.y0).v, points: topPoints(st),
      types: (T.b2 || []).map(t => {
        const tt = { name: t.name, kind: t.kind, b: +t.b, hst: +t.hst || 0, ho: t.kind === 'A' ? (+t.b / 2) * Math.tan(+t.beta * Math.PI / 180) : +t.ho, beta: +t.beta, face: t.face || 'R',
          ystart: +t.ystart || 0, ylen: t.ylen ? +t.ylen : B - (+t.ystart || 0), pieces: Math.max(1, Math.round(+t.pieces || 1)), pitch: +t.pitch || 0,
          t1: +t.t1, t2: +t.t2, t3: +t.t3 || 1, t4: +t.t4 || 1, t5: t.net ? 0.9 : 1, CNrow: t.CNrow || cnRowDefault(t.kind), xs: t.xs.map(Number) };
        tt.MF = mfOf(st, R.tiltIdx(tt)); return tt;
      })
    };
  }
  const isB2 = st => st.mode !== 'side' && st.top.sys === 'b2';

  /* ---------- проверки ---------- */
  function lanternOverlaps(types) {
    // Проверяем реальные контуры отверстий на плане, а не их габаритные прямоугольники.
    // Касание допустимо для этой проверки; конструктивные зазоры она не назначает.
    const eps = 1e-9, all = [], errors = [];
    const opening = (t, upper) => {
      const round = t.shape === 'round';
      const hx = +(round ? (upper ? t.dv : t.dn) : (upper ? t.av : t.an)) / 2;
      const hy = round ? hx : +(upper ? t.bv : t.bn) / 2;
      return Number.isFinite(hx) && Number.isFinite(hy) && hx > 0 && hy > 0 ? { round, hx, hy } : null;
    };
    types.forEach((t, ti) => t.lanterns.forEach((l, li) => {
      const x = readNum(l.x), y = readNum(l.y);
      if (x.st === 'num' && y.st === 'num') all.push({ x: x.v, y: y.v, id: `${ti + 1}.${li + 1}`, upper: opening(t, true), lower: opening(t, false) });
    }));
    const intersects = (a, b, dx, dy) => {
      if (!a || !b) return false; // Ошибки размеров сообщаются отдельно.
      if (a.round && b.round) return Math.hypot(dx, dy) < a.hx + b.hx - eps;
      if (!a.round && !b.round) return dx < a.hx + b.hx - eps && dy < a.hy + b.hy - eps;
      const circle = a.round ? a : b, rect = a.round ? b : a;
      return Math.hypot(Math.max(0, dx - rect.hx), Math.max(0, dy - rect.hy)) < circle.hx - eps;
    };
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), levels = [];
      if (intersects(a.upper, b.upper, dx, dy)) levels.push('верхние');
      if (intersects(a.lower, b.lower, dx, dy)) levels.push('нижние');
      if (levels.length) errors.push(`Фонари ${a.id} и ${b.id} (тип.номер): перекрываются ${levels.join(' и ')} отверстия на плане — проверьте координаты и размеры; расчёт отдельных фонарей для такой схемы недопустим.`);
    }
    return errors;
  }
  function validate(st) {
    const err = [], warn = [];
    if (st.mode === 'side' && rtOf(st) === 'unknown') err.push(SIDE_POINT_MISSING);
    const pos = (v, n) => { if (!(+v > 0)) err.push(`${n}: нужно положительное число`); };
    const rh = rhoOf(st); rh.err.forEach(e => err.push(e)); rh.warn.forEach(e => warn.push(e));
    if (rh.mode === 'legacy') warn.push('ρср: источник не подтверждён (файл прежней версии) — выберите режим «0,55», «По поверхностям» или «Вручную».');
    if (st.mode !== 'top') { coefErrors(st, warn).forEach(e => err.push(e)); migrateWindows(JSON.parse(JSON.stringify({ side: st.side }))).forEach(n => warn.push(n)); }
    if (st.mode !== 'top') {
      const walls = st.mode === 'comb' ? st.side.walls.slice(0, 1) : st.side.walls;
      walls.forEach((w, wi) => {
        const pre = walls.length > 1 ? `Стена ${wi + 1}. ` : '';
        if (!ORIENTS.includes(w.orient)) err.push(pre + 'Неизвестная климатическая ориентация стены — выберите румб.');
        if (st.mode === 'side') { pos(w.dp, pre + 'Глубина помещения dп'); pos(w.bp, pre + 'Ширина помещения bп'); }
        windowOverlaps(w.windows).forEach(e => err.push(pre + e));
        if (!(+w.dst >= 0)) err.push(pre + 'Толщина стены Δст должна быть ≥ 0');
        if (!w.windows.length) err.push(pre + 'Добавьте хотя бы один световой проём');
        w.windows.forEach((x, i) => { if (!(+x.ho > 0 && +x.bo > 0 && +x.hpd >= 0)) err.push(`${pre}Окно ${i + 1}: проверьте hпд, hо, bо`); });
        if (st.mode === 'side') {
          w.windows.forEach((x, i) => { if (Math.abs(+x.s) + x.bo / 2 > w.bp / 2 + 0.02) warn.push(`${pre}Окно ${i + 1} выходит за пределы ширины помещения bп — проверьте смещение s.`); });
          const rule = rtOf(st), lt = rule === 'manual' ? +w.lt : ltAuto(rule, +w.dp);
          if (rule !== 'unknown' && (!(lt > 0) || lt >= +w.dp + 1e-9)) err.push(pre + 'Расчётная точка должна лежать внутри помещения: 0 < lт < dп');
        }
        w.buildings.forEach((b, i) => { if (!(+b.l > 0 && +b.Hp > 0 && +b.a > 0)) err.push(`${pre}Здание ${i + 1}: укажите l, Hр и a больше нуля`); });
      });
    }
    if (st.mode !== 'side') {
      const T = st.top; pos(T.L, 'Длина помещения L'); pos(T.B, 'Ширина помещения B'); pos(T.H, 'Высота помещения H');
      const policy = topPointPolicy(st); err.push(...policy.err);
      if (+T.L <= 4 && !policy.err.length) warn.push(policy.note);
      const y = readNum(T.y0), y0 = y.st === 'empty' ? +T.B / 2 : y.v;
      if (!Number.isFinite(+T.B) || !Number.isFinite(y0) || y0 < 0 || y0 > +T.B) err.push('Линия характерного разреза y0 должна находиться внутри помещения (0…B).');
      if (+T.H <= hpOf(st)) err.push('Высота помещения H должна быть больше высоты рабочей поверхности');
      if (T.sys === 'b2') {
        (T.b2 || []).forEach((t, i) => {
          const pre = `Фонарь «${t.name || i + 1}»: `;
          if (!t.xs.length) err.push(pre + 'укажите положение хотя бы одного фонаря на разрезе');
          pos(t.b, pre + 'ширина проёма b'); if (t.kind !== 'A') pos(t.ho, pre + 'высота остекления hо');
          if (['trap', 'A', 'shedI'].includes(t.kind) && !(+t.beta > 0 && +t.beta < 90)) err.push(pre + 'угол наклона остекления β должен быть от 0 до 90°');
          if (t.kind === 'trap' && +t.ho / Math.tan(+t.beta * Math.PI / 180) >= +t.b / 2) err.push(pre + 'при таком β и hо скаты трапеции сходятся — уменьшите hо или увеличьте β (или выберите А-образный)');
          if (t.kind === 'shedI' && +t.ho / Math.tan(+t.beta * Math.PI / 180) >= +t.b) err.push(pre + 'наклонное остекление шеда шире проёма — проверьте b, hо, β');
          t.xs.forEach((x, k) => { if (+x - t.b / 2 < -1e-6 || +x + t.b / 2 > +T.L + 1e-6) err.push(`${pre}фонарь ${k + 1} выходит за пределы помещения по разрезу`); });
          const ylen = t.ylen ? +t.ylen : +T.B - (+t.ystart || 0), n = Math.max(1, Math.round(+t.pieces || 1));
          if (!(ylen > 0)) err.push(pre + 'длина фонаря вдоль оси должна быть больше нуля');
          if ((+t.ystart || 0) + (n - 1) * (+t.pitch || 0) + ylen > +T.B + 1e-6) warn.push(pre + 'фонарь по длине выходит за пределы помещения B — проверьте начало, длину и шаг.');
          if (n > 1 && +t.pitch < ylen) err.push(pre + 'шаг штучных проёмов меньше их длины');
        });
        const all = []; (T.b2 || []).forEach(t => t.xs.forEach(x => all.push([+x - t.b / 2, +x + t.b / 2])));
        all.sort((a, b) => a[0] - b[0]); for (let i = 1; i < all.length; i++) if (all[i][0] < all[i - 1][1] - 1e-6) { err.push('Фонари перекрываются на разрезе — проверьте координаты осей'); break; }
      } else T.types.forEach((t, i) => {
        if (!t.lanterns.length) err.push(`Тип фонаря ${i + 1}: добавьте хотя бы один фонарь`);
        t.lanterns.forEach((l, j) => ['x', 'y'].forEach(axis => { if (readNum(l[axis]).st !== 'num') err.push(`Тип ${i + 1}, фонарь ${j + 1}: укажите числовую координату ${axis}`); }));
        pos(t.hsf, `Тип ${i + 1}: высота шахты hс.ф`);
        if (t.shape === 'round') { pos(t.dv, `Тип ${i + 1}: диаметр верхнего отверстия`); pos(t.dn, `Тип ${i + 1}: диаметр нижнего отверстия`); }
        else { ['av', 'bv', 'an', 'bn'].forEach(k => pos(t[k], `Тип ${i + 1}: размеры отверстий`)); }
      });
      if (T.sys !== 'b2') err.push(...lanternOverlaps(T.types));
    }
    return { err: [...new Set(err)], warn };
  }

  /* ---------- расчёт ---------- */
  function compute(st) {
    const v = validate(st); if (v.err.length) return { ok: false, ...v, ...(st.mode === 'side' && rtOf(st) === 'unknown' ? {pointChoice:{status:'insufficient-data',reason:'unverified-wall-classification'}} : {}) };
    const norm = normOf(st), g = groupOf(st), warn = [...v.warn];
    let res;
    if (st.mode === 'side') {
      res = R.side(sideInput(st));
      res.walls.forEach((w, i) => {
        const pre = res.walls.length > 1 ? `Стена ${i + 1}: ` : '';
        w.r0info.notes.forEach(n => warn.push(pre + 'r0 — ' + n));
        w.blds.forEach((b, j) => [...b.bfNotes, ...b.kzd0Notes].forEach(n => warn.push(`${pre}здание ${j + 1} — ${n}`)));
        const hu = st.side.walls[i]; const top = Math.max(...hu.windows.map(x => +x.hpd + +x.ho));
        if (+hu.dp / (top - (w.onFloor ? 0.8 : st.hpManual ?? hpOf(st))) > 8) warn.push(pre + 'Отношение глубины помещения к высоте верхней грани проёма над УРП больше 8 — боковое освещение не рекомендуется (п. 6.4 СП 367).');
        if (norm.room && norm.room.g === 'Жилые здания' && +hu.dp / top > 2.5) warn.push(pre + 'Для жилых помещений dп/h02 не должно превышать 2,5 (п. 9.1.1 СП 367).');
      });
      res.eFinal = res.eR;
    } else if (st.mode === 'top' && isB2(st)) {
      res = R.lanternsB2(b2Input(st));
      res.types.forEach(T => T.r2info.notes.forEach(n => warn.push(`«${T.t.name}»: r2 — ${n}`)));
      res.eFinal = res.eAvgR;
    } else if (st.mode === 'top') {
      res = R.top(topInput(st));
      res.types.forEach((T, i) => T.kc.notes.forEach(n => warn.push(`Тип ${i + 1}: Kс — ${n}`)));
      res.r2info.notes.forEach(n => warn.push('r2 — ' + n));
      res.eFinal = res.eAvgR;
    } else {
      const b2 = isB2(st), ti = b2 ? b2Input(st) : topInput(st); const T = st.top;
      const w0 = st.side.walls[0];
      const si = sideInput(st, { dp: +T.L, bp: +T.B });
      si.walls = si.walls.slice(0, 1);
      res = R.combined({ topKind: b2 ? 'b2' : 'shaft', top: ti, side: si, sideMap: { axis: 'x', wallAt: st.comb.wallSide === 'xL' ? +T.L : 0, axisCoord: ti.points[0].y } });
      if (!b2) res.top.types.forEach((Tt, i) => Tt.kc.notes.forEach(n => warn.push(`Тип ${i + 1}: Kс — ${n}`)));
      res.eFinal = res.eAvgR;
      void w0;
    }
    if (st.mode !== 'side' && !isB2(st)) {
      const T = st.top; const area = T.types.reduce((s, t) => s + t.lanterns.length * (t.shape === 'round' ? Math.PI * t.dv * t.dv / 4 : t.av * t.bv), 0);
      if (area / (T.L * T.B) > 0.2) warn.push(`Суммарная площадь фонарей ${f(100 * area / (T.L * T.B), 1)} % площади пола — больше 20 % (п. 9.4.3 СП 367).`);
    }
    const uniOk = st.mode === 'side' ? true : (res.uni >= 1 / 3 - 1e-9);
    const normOk = norm.v === null || norm.v === undefined ? null : res.eFinal >= norm.v - 1e-9;
    return { ok: true, res, norm, group: g, warn: [...new Set(warn)], uniOk, pass: normOk === null ? null : (normOk && uniOk), normOk };
  }

  /* ---------- модель отчёта ---------- */
  function buildModel(st, C) {
    if (!C || !C.ok) return [];
    const M = []; const r = C.res, n = C.norm, g = C.group;
    const modeName = { side: 'боковое естественное освещение', top: isB2(st) ? 'верхнее освещение (фонари-надстройки, проёмы в покрытии)' : 'верхнее освещение (зенитные / шахтные фонари)', comb: 'комбинированное освещение (верхнее + боковое)' }[st.mode];
    const roomTitle = [st.meta.room, n.room ? n.room.name : ''].filter(Boolean).join('. ');
    M.push({ type: 'h1', text: 'Расчёт коэффициента естественной освещённости', sub: [st.meta.object, roomTitle].filter(Boolean).join(' · ') });
    const eLbl = st.mode === 'side' ? 'e_{р}^{б}' : 'e_{ср}';
    if (C.pass !== null) M.push({ type: 'verdict', ok: !!C.pass, left: `${st.mode === 'side' ? 'Расчётный КЕО' : 'Среднее значение КЕО'} ${eLbl} = ${f(r.eFinal)} %;   нормируемый e_{н} = ${n.v === null ? '—' : f(n.v)} %`, left2: st.mode === 'side' ? `Условие: e_{р} ≥ e_{н} — ${C.normOk ? 'выполняется' : 'не выполняется'}` : `Равномерность e_{min} : e_{ср} = 1 : ${f(r.uniInv)} (норма не более 1 : 3) — ${C.uniOk ? 'выполняется' : 'не выполняется'}` });

    else M.push({ type: 'p', text: `Расчётный КЕО = ${f(r.eFinal)} %. Для выбранной системы норма КЕО не задана; вывод о соответствии не формируется.` });

    // 1. исходные
    M.push({ type: 'h2', text: '1. Нормативные требования' });
    const rt = rtOf(st), rh = rhoOf(st);
    M.push({ type: 'kv', rows: [
      ['Место строительства', '', st.groupManual ? '—' : st.region, `Группа административного района N = ${g} (СП 52.13330.2016, прил. Е)`],
      ['Назначение помещения', '', n.room ? `п. ${n.room.n}` : '—', n.room ? `${n.room.name} (${n.room.g})` : 'задано вручную'],
      ['Система освещения', '', st.lightSys === 'ЕО' ? 'естественное' : 'совмещённое', modeName],
      ['Нормируемое значение КЕО', 'e_{н}', n.v === null ? 'не нормир.' : f(n.v) + ' %', n.manual ? 'задано вручную' : `${n.src}; графа «${n.colName}»`],
      ['Высота расчётной поверхности', 'hр', f(hpOf(st)) + ' м', st.hpManual !== null && st.hpManual !== '' ? 'задано вручную' : 'плоскость нормирования по табл. А.1'],
      ...(st.mode === 'side' ? [['Положение расчётной точки', '', '', `${RT_TEXT[rt]} (${RT_REF[rt]})`]] : [['Расчётные точки', 'N', String(r.e ? r.e.length : ''), 'на пересечении характерного разреза и УРП, первая и последняя — в 1 м от стен (п. 5.5 СП 52.13330.2016). ' + topPointPolicy(st).note]]),
      ['Средневзвешенный коэффициент отражения', 'ρ_{ср}', f(rh.v), rh.label + (st.mode === 'comb' ? '. В комбинированном режиме одно ρср применено и к r0 (табл. Б.6/Б.7: пол, стены, потолок, окна), и к r2 (табл. Б.21: пол, стены, потолок)' : '')]
    ] });
    const nc = normComparison(st);
    M.push({ type: 'table', title: `Нормы КЕО: ЕО и СО (${nc.mode} освещение)`,
      cols: [{ h: 'Система', w: 40 }, { h: 'По таблице А.1, %', w: 24, a: 'center' }, { h: 'Применение', w: 66 }],
      rows: nc.rows.map(x => [x.system + ' — ' + x.label, x.tableValue === null ? 'не задана' : f(x.tableValue),
        x.selected ? (x.manual ? `Выбрана; ручная норма ${f(x.value)} % вместо табличной` : 'Выбрана для проверки') : 'Справочно; не используется в вердикте']),
      note: `${nc.rows[0].src}. ${nc.note}` });
    if (rh.mode === 'surf') rhoTable(M, st, rh);

    if (st.mode === 'side') sideModel(M, st, C, r);
    else if (st.mode === 'top' && isB2(st)) b2Model(M, st, C, r);
    else if (st.mode === 'top') topModel(M, st, C, r);
    else combModel(M, st, C, r);

    // заключение
    M.push({ type: 'h2', text: 'Заключение' });
    const concl = C.pass === null
      ? `Расчётный КЕО = ${f(r.eFinal)} %. Норма КЕО для выбранной системы не задана. Соответствие не оценивалось; отсутствие нормы не означает соответствие.`
      : st.mode === 'side'
      ? `Расчётное значение КЕО в расчётной точке eр = ${f(r.eFinal)} % ${C.normOk ? '≥' : '<'} нормируемого eн = ${n.v === null ? '—' : f(n.v)} %. Проверка КЕО для выбранной системы ${st.lightSys} по СП 52.13330.2016 и СП 367.1325800.2025: требования ${C.pass ? 'выполняются' : 'не выполняются'}.`
      : `Среднее значение КЕО eср = ${f(r.eFinal)} % ${C.normOk ? '≥' : '<'} нормируемого eн = ${n.v === null ? '—' : f(n.v)} %; равномерность 1 : ${f(r.uniInv)} ${C.uniOk ? '(не более 1 : 3)' : '(хуже 1 : 3)'}. Проверка среднего КЕО и равномерности для выбранной системы ${st.lightSys}: требования ${C.pass ? 'выполняются' : 'не выполняются'}.`;
    M.push({ type: 'p', text: concl });
    M.push({ type: 'p', small: true, text: `Выбрана система: ${st.lightSys === 'ЕО' ? 'ЕО — естественное освещение' : 'СО — совмещённое освещение'}. ${nc.note}` });
    if (C.warn.length) { M.push({ type: 'h3', text: 'Замечания' }); C.warn.forEach(w => M.push({ type: 'p', text: '• ' + w, small: true })); }
    M.push({ type: 'p', small: true, text: 'Нормативная база: СП 367.1325800.2025 «Здания жилые и общественные. Правила проектирования естественного и совмещённого освещения»; СП 52.13330.2016 «Естественное и искусственное освещение» (с изм. 1, 2). Расчёт выполнен без учёта мебели и оборудования, при 100 % использовании светопрозрачных заполнений (п. 5.9 СП 52.13330.2016). Значения КЕО округлены до сотых (п. Б.2.12 СП 367).' });
    return M;
  }

  function rhoTable(M, st, rh) {
    const rows = rh.rows.map(x => [x.name, f(x.S.v), x.man ? (rh.geo === 'manual' ? 'ведомость (вручную)' : `вручную${x.key === 'walls' ? ' — без окон' : ''}; авто было бы ${f(x.Sauto)}`) : `авто: ${x.how}`, f(x.rho.v), x.src || 'не указан', f(x.S.v * x.rho.v, 3)]);
    rows.push(['Итого', f(rh.sumS), '', '', '', f(rh.exact * rh.sumS, 3)]);
    M.push({ type: 'table', title: 'Средневзвешенный коэффициент отражения ρср по поверхностям помещения', cols: [{ h: 'Поверхность', w: 24 }, { h: 'S, м²', w: 10, a: 'center' }, { h: 'Площадь: источник', w: 34 }, { h: 'ρ', w: 8, a: 'center' }, { h: 'ρ: источник', w: 26 }, { h: 'ρ·S', w: 10, a: 'center' }], rows,
      note: `ρср = Σ ρi·Si / Σ Si = ${f(rh.exact * rh.sumS, 3)} / ${f(rh.sumS)} = ${f(rh.exact, 4)} → принято ${f(rh.v)} (округление до сотых, как прочие аргументы табл. Б.6/Б.7 и Б.21). Формула (3.6), п. 3.13 СП 367.1325800.2025 — общее определение; состав поверхностей при боковом освещении — примечание 2 к табл. Б.6/Б.7 (пол, стены, потолок, окна; коэффициенты — по данным измерений), для r2 верхнего света — табл. Б.21 (пол, стены, потолок). ${rh.geo === 'manual' ? 'Площади — по ручной ведомости (сложный контур, наклонный потолок, ниши): автоматический расчёт не применяется.' : 'Площади — для прямоугольного помещения с плоским потолком; площадь окон — по наружному обмеру коробки (п. Б.2.7), приближение для внутренней поверхности.'}` });
  }

  function sideModel(M, st, C, r) {
    r.walls.forEach((w, wi) => {
      const W = st.side.walls[wi], inp = w.inp;
      const pre = r.walls.length > 1 ? `Стена ${wi + 1} (${ORIENT_NAME[w.orient]}). ` : '';
      M.push({ type: 'h2', text: `${2 + wi * 3}. ${pre}Исходные данные` });
      M.push({ type: 'kv', rows: [
        ['Глубина помещения', 'dп', f(inp.dp) + ' м', 'от внутренней грани стены со светопроёмами'],
        ['Ширина помещения', 'bп', f(inp.bp) + ' м', ''],
        ['Расстояние до расчётной точки', 'lт', f(inp.lt) + ' м', 'от внутренней поверхности наружной стены'],
        ['Смещение точки от оси помещения', 'Δs', f(inp.ds) + ' м', ''],
        ['Толщина наружной стены', 'Δ_{ст}', f(inp.dst) + ' м', ''],
        ['Ориентация светопроёмов', '', ORIENT_NAME[w.orient], ''],
        ['Суммарная ширина проёмов с простенками', 'b_{с.п}', f(w.bsp) + ' м', '']
      ] });
      M.push({ type: 'table', title: 'Параметры светопроёмов', cols: [{ h: '№', w: 7, a: 'center' }, { h: 'hпд, м', w: 13, a: 'center' }, { h: 'hо, м', w: 13, a: 'center' }, { h: 'bо, м', w: 13, a: 'center' }, { h: 's, м', w: 13, a: 'center' }, { h: 'τ1', w: 11, a: 'center' }, { h: 'τ2', w: 11, a: 'center' }, { h: 'τ4', w: 11, a: 'center' }, { h: 'τ5', w: 11, a: 'center' }, { h: 'τо', w: 13, a: 'center' }, { h: 'K', w: 12, a: 'center' }],
        rows: w.wins.map((x, i) => { const c = x.w.coef, um = c && c.tau0.mode === 'manual'; return [i + 1, f(x.w.hpd), f(x.w.ho), f(x.w.bo), f(x.w.s), um ? '—' : f(x.w.t1), um ? '—' : f(x.w.t2) + (c && c.t2.mode === 'manual' ? '*' : ''), um ? '—' : f(x.w.t4), um ? '—' : f(x.w.t5 || 1), f(x.tau0, 4) + (um ? '*' : ''), f(x.K) + (c && c.K.mode === 'manual' && c.modes.K === 'manual' ? '*' : '')]; }),
        note: 's — смещение оси проёма от оси помещения (вправо — плюс, если смотреть из помещения на окно); hпд — высота подоконника от пола; hо — высота проёма. * — значение задано для проёма вручную (исключение из общих параметров стены); «—» — множитель не используется, т. к. τо проёма задан вручную. Происхождение каждого значения — в таблице «Происхождение τо и K».' });
      if (wi === 0) M.push({ type: 'scheme', schemes: [Schemes.sideSection(inp, w), Schemes.sidePlan(inp, w)], caption: 'Схема расчётного помещения: разрез по характерной плоскости и план (жёлтым — видимый из точки А участок неба). Масштаб условный.' });

      M.push({ type: 'h2', text: `${3 + wi * 3}. ${pre}Коэффициенты` });
      const t0 = w.wins[0], gen = inp.gen;
      const anyExc = w.wins.some(x => x.w.coef && (x.w.coef.modes.tau0 === 'manual' || x.w.coef.modes.K === 'manual' || x.w.coef.modes.t2 === 'manual'));
      M.push({ type: 'kv', rows: [
        ['Коэффициент светового климата', 'C_{N}', f(w.CN), `СП 52.13330.2016, табл. 5.1: группа ${C.group}, ориентация ${w.orient} (строка «${w.CNrow}»)`],
        ['Коэффициент эксплуатации', 'MF', f(w.MF), `СП 367, табл. 5.1: ${st.env === 'normal' ? 'нормальные условия среды' : 'пыльные, жаркие и сырые помещения'}, вертикальное остекление 76°–90°${st.glassMult !== 1 ? `, × ${f(st.glassMult)}` : ''}`],
        ['Светопропускание материала', 'τ_{1}', f(gen.t1.v), gen.t1.src],
        ['Потери в переплётах', 'τ_{2}', f(gen.t2.v), gen.t2.src + (w.wins.some(x => x.w.coef && x.w.coef.modes.t2 === 'manual') ? '; для отдельных проёмов τ2 задан вручную — см. таблицы ниже' : '')],
        ['Потери в несущих конструкциях', 'τ_{3}', '1,00', 'при боковом освещении (п. Б.2.7)'],
        ['Потери в солнцезащитных устройствах', 'τ_{4}', f(gen.t4.v), gen.t4.src],
        ['Общий коэффициент пропускания — по общим параметрам стены', 'τ_{о}', f(gen.tau0, 4), `τо = τ1·τ2·τ3·τ4·τ5 = ${f(gen.t1.v)}·${f(gen.t2.v)}·1,00·${f(gen.t4.v)}·${f(gen.t5.v)} (формула (Б.8) СП 367)`],
        ['Потери в элементах фасада — по общим параметрам стены', 'K', f(gen.K.v), gen.K.src],
        ['Применено в расчёте', 'τ_{о}, K', anyExc ? 'по проёмам' : `${f(t0.tau0, 4)}; ${f(t0.K)}`, anyExc ? 'для части проёмов заданы исключения — см. «Происхождение τо и K по проёмам»' : 'все проёмы — по общим параметрам стены'],
        ['Высота верха окна над УРП', 'h_{01}', f(w.h01) + ' м', w.onFloor ? 'h01 = hв.о − 0,8 (для точки на полу — от условной рабочей поверхности, заголовок табл. Б.7)' : 'h01 = hв.о − hр'],
        ['Отражённый свет помещения', 'r_{0}', f(w.r0, 4), `табл. ${w.r0info.table}: dп/h01 = ${f(w.dh)}; lт/dп = ${f(w.ld)}; bп/dп = ${f(w.bd)}; ρср = ${f(rhoOf(st).v)}; линейная интерполяция${w.r0info.notes.length ? '. ' + w.r0info.notes.join('; ') : ''}`]
      ] });

      M.push({ type: 'table', title: 'Происхождение τо и K по проёмам (применённые значения)', cols: [{ h: '№', w: 6, a: 'center' }, { h: 'τо', w: 10, a: 'center' }, { h: 'Источник τо', w: 52 }, { h: 'K', w: 8, a: 'center' }, { h: 'Источник K', w: 52 }],
        rows: w.wins.map((x, i) => [i + 1, f(x.tau0, 4), x.w.tau0src || 'τо = τ1·τ2·τ3·τ4·τ5 (Б.8)', f(x.K), x.w.Ksrc || '—']),
        note: 'Приоритет: значение, заданное для проёма вручную, заменяет общее (не умножается на него); ручной τо заменяет всё произведение τ1…τ5; τ2 проёма участвует только при автоматическом τо. Проёмы без исключений следуют общим параметрам стены.' });
      M.push({ type: 'h2', text: `${4 + wi * 3}. ${pre}Геометрический КЕО` });
      M.push({ type: 'p', text: 'Число лучей по графикам I и II А.М. Данилюка (рис. 8.8, 8.10 СП 367) определено аналитически — по формулам, по которым построены графики: n1 = 50·(cos θн − cos θв), где θн, θв — углы возвышения нижней и верхней границ видимого участка в разрезе; n2 = (100/π)·[ψ + ½·sin 2ψ] между границами участка в плане, где tg ψ = y / R, R — расстояние от точки до середины участка C. Число лучей округлено до десятых долей луча, как при подсчёте по графику. Угол γ — угловая высота середины участка неба. q(γ) — по формуле (3.2).', small: true });
      M.push({ type: 'formula', lines: ['ε_{б} = 0,01·n_{1}·n_{2}  (Б.11);    q(γ) = 0,429·[1 + 4·exp(−0,7 / sin γ)]  (3.2)'] });
      const rows = [];
      w.wins.forEach((x, i) => x.sectors.forEach((s, k) => {
        rows.push([`${i + 1}`, s.type === 'sky' ? `небо ${k + 1}` : `здание ${s.bld + 1}`, f(s.n1, 1), f(s.n2, 1), f(s.eps, 4), f(s.gamma) + '°', s.type === 'sky' ? f(s.q, 4) : '—', s.type === 'sky' ? f(s.eps * s.q, 4) : f(s.eps * w.blds[s.bld].bfv * w.blds[s.bld].kzd, 4)]);
      }));
      if (!rows.length) rows.push(['—', 'из точки А небо через проёмы не видно', '', '', '', '', '', '0']);
      M.push({ type: 'table', title: 'Участки неба и противостоящих зданий, видимые из расчётной точки', cols: [{ h: 'Проём', w: 10, a: 'center' }, { h: 'Участок', w: 18, a: 'center' }, { h: 'n1', w: 11, a: 'center' }, { h: 'n2', w: 11, a: 'center' }, { h: 'ε, %', w: 14, a: 'center' }, { h: 'γ', w: 13, a: 'center' }, { h: 'q(γ)', w: 13, a: 'center' }, { h: 'ε·q  или  εзд·bф·Kзд', w: 22, a: 'center' }], rows });
      if (w.blds.length) {
        M.push({ type: 'table', title: 'Противостоящие здания (схема № 1, рис. Б.4)', cols: [{ h: '№', w: 7, a: 'center' }, { h: 'l, м', w: 11, a: 'center' }, { h: 'Hр, м', w: 11, a: 'center' }, { h: 'a, м', w: 11, a: 'center' }, { h: 'ρф', w: 10, a: 'center' }, { h: 'l/a', w: 10, a: 'center' }, { h: 'a/Hр', w: 10, a: 'center' }, { h: 'bф', w: 10, a: 'center' }, { h: 'z1', w: 10, a: 'center' }, { h: 'z2', w: 10, a: 'center' }, { h: 'Kзд0', w: 11, a: 'center' }, { h: 'Kзд', w: 11, a: 'center' }],
          rows: w.blds.map((b, i) => [i + 1, f(b.l), f(b.Hp), f(b.a), f(b.rhoF), f(b.la), f(b.aH), f(b.bfv), f(b.z1), f(b.z2), f(b.kzd0v), f(b.kzd, 3)]),
          note: `bф — табл. Б.1; z1 = a·(lт + Δст) / ((l + lт + Δст)·bс.п), z2 = Hр·(lт + Δст) / ((l + lт + Δст)·(hо + hпд)) — рис. Б.4; Kзд0 — табл. Б.8 при (lт + Δст)/dп = ${f(w.ldOut)}; Kзд = 1 + (Kзд0 − 1)·Σεзд / (Σεб + Σεзд) (Б.7), Σεб = ${f(w.sumEb, 4)}, Σεзд = ${f(w.sumEzd, 4)}.` });
      }
      if (wi === danSel(st, r).wall) { const db = danBlocks(st, C); if (db) M.push(db); }
      M.push({ type: 'h3', text: 'Расчётное значение КЕО — формула (Б.1)' });
      M.push({ type: 'formula', lines: ['e_{р}^{б} = C_{N}·[Σ ε_{б}·q(γ) + Σ ε_{зд}·b_{ф}·K_{зд}]·r_{0}·τ_{о}·K·MF'], src: 'СП 367.1325800.2025, прил. Б, формула (Б.1). Для проёмов с разными τо и K расчёт выполнен по каждому проёму, результаты суммированы.' });
      const lines = w.wins.map((x, i) => `проём ${i + 1}: ${f(w.CN)}·(${f(x.sumSky, 4)} + ${f(x.sumBld, 4)})·${f(w.r0, 4)}·${f(x.tau0, 4)}·${f(x.K)}·${f(w.MF)} = ${f(x.e, 4)} %`);
      lines.push(`e_{р}^{б} = ${w.wins.map(x => f(x.e, 4)).join(' + ')} = ${f(w.e, 4)} %`);
      M.push({ type: 'formula', lines });
    });
    if (r.walls.length > 1) M.push({ type: 'formula', lines: [`e_{р} = ${r.walls.map(w => f(w.e, 4)).join(' + ')} = ${f(r.e, 4)} ≈ ${f(r.eR)} %`], src: 'Световые проёмы различной ориентации: КЕО от каждой стены рассчитан отдельно и просуммирован (п. 8.4.1, примечание, СП 367).' });
    else M.push({ type: 'formula', lines: [`e_{р} = ${f(r.e, 4)} ≈ ${f(r.eR)} %`] });
  }

  /* ---------- проверка по графикам Данилюка: выбранные стена / проём / участок ---------- */
  function danSel(st, r) {
    const d = st.dan || {}, wi = Math.min(Math.max(0, +d.wall || 0), r.walls.length - 1), w = r.walls[wi];
    const ki = Math.min(Math.max(0, +d.win || 0), w.wins.length - 1), n = w.wins[ki].sectors.length;
    return { wall: wi, win: ki, sec: n ? Math.min(Math.max(0, +d.sec || 0), n - 1) : 0 };
  }
  function danCheck(st, C) {
    if (!C || !C.ok || st.mode !== 'side') return null;
    const r = C.res, sel = danSel(st, r), w = r.walls[sel.wall], raw = w.inp, x = w.wins[sel.win];
    const d = Schemes.DAN.sectors(raw, raw.windows[sel.win], raw.buildings), e = d.edges, dg = a => a * 180 / Math.PI;
    const same = d.list.length === x.sectors.length;
    const nm = (s, k) => s.type === 'sky' ? `небо ${k + 1}` : `здание ${s.bld + 1}`;
    const geo = d.list.map((s, k) => { const c = x.sectors[k] || {};
      return { k, cells: [nm(s, k), `${f(dg(s.ta), 2)}…${f(dg(s.tb), 2)}`, `${f(s.r1a, 1)} / ${f(s.r1b, 1)}`, f(s.n1g, 1), f(c.n1raw, 3), f(c.n1, 1), f(s.R, 3), `${f(s.ya, 3)}…${f(s.yb, 3)}`, `${f(s.r2a, 1)} / ${f(s.r2b, 1)}`, f(s.n2g, 1), f(c.n2raw, 3), f(c.n2, 1)] }; });
    const val = x.sectors.map((c, k) => { const bl = c.type === 'bld' ? w.blds[c.bld] : null, eq = bl ? c.eps * bl.bfv * bl.kzd : c.eps * c.q;
      return { k, cells: [nm(c, k), f(c.eps, 4), f(c.gamma, 2), bl ? '—' : f(c.q, 4), bl ? `${f(c.eps, 4)}·${f(bl.bfv)}·${f(bl.kzd, 3)} = ${f(eq, 4)}` : f(eq, 4), f(w.CN * eq * w.r0 * x.tau0 * x.K * w.MF, 4)] }; });
    const dev = { n1: 0, n2: 0, raw: 0 };
    d.list.forEach((s, k) => { const c = x.sectors[k]; if (!c) return; dev.n1 = Math.max(dev.n1, Math.abs(s.n1g - c.n1)); dev.n2 = Math.max(dev.n2, Math.abs(s.n2g - c.n2)); dev.raw = Math.max(dev.raw, Math.abs(s.n1a - c.n1raw), Math.abs(s.n2a - c.n2raw)); });
    const eTxt = `Ограничивающие рёбра проёма ${sel.win + 1}: снизу — ${e.lo.n}${e.lo.n.startsWith('горизонт') ? '' : ' (подоконник)'}, θн = ${f(dg(e.lo.a), 2)}°; сверху — ${e.hi.n} (перемычка), θв = ${f(dg(e.hi.a), 2)}°; в плане слева — ${e.L.n}, справа — ${e.R.n} (откосы). Расстояние от А до наружной грани D = lт + Δст = ${f(e.D, 3)} м.`;
    return { sel, w, x, raw, d, same, geo, val, dev, eTxt, scheme: Schemes.danScheme(raw, sel.win, d, sel.sec), title: `${r.walls.length > 1 ? `стена ${sel.wall + 1}, ` : ''}проём ${sel.win + 1}${d.list[sel.sec] ? ', участок ' + nm(d.list[sel.sec], sel.sec) : ''}` };
  }
  const DAN_GEO_COLS = [{ h: 'Участок', w: 11 }, { h: 'θн…θв, °', w: 14, a: 'center' }, { h: 'Отсчёт гр. I у θн / θв', w: 12, a: 'center' }, { h: 'n1 по графику', w: 8, a: 'center' }, { h: 'n1 аналит. до округл.', w: 10, a: 'center' }, { h: 'n1 в расчёте', w: 8, a: 'center' }, { h: 'R, м', w: 8, a: 'center' }, { h: 'y1…y2 на грани, м', w: 14, a: 'center' }, { h: 'Отсчёт гр. II у y1 / y2', w: 12, a: 'center' }, { h: 'n2 по графику', w: 8, a: 'center' }, { h: 'n2 аналит. до округл.', w: 10, a: 'center' }, { h: 'n2 в расчёте', w: 8, a: 'center' }];
  const DAN_VAL_COLS = [{ h: 'Участок', w: 12 }, { h: 'ε = 0,01·n1·n2, %', w: 14, a: 'center' }, { h: 'γ, °', w: 9, a: 'center' }, { h: 'q(γ) (3.2)', w: 10, a: 'center' }, { h: 'ε·q  или  εзд·bф·Kзд', w: 26, a: 'center' }, { h: 'Вклад в e, %', w: 12, a: 'center' }];
  function danNote(dc) {
    return `Метод расчёта — аналитический: n1 = 50·(cos θн − cos θв), n2 = (100/π)·[ψ + ½·sin 2ψ], tg ψ = y/R — формулы, по которым построены графики I и II (рис. 8.8, 8.10 СП 367), с округлением до 0,1 луча. Проверка независима от ядра: видимая область построена заново по рёбрам проёма, число лучей считано с графиков, построенных по их определению (луч k графика I — 50·(1 − cos θk) = k, графика II — (100/π)·(ψk + ½·sin 2ψk) = k), с отсчётом каждой границы по ближайшей пунктирной линии десятых долей (n = разность отсчётов). Это проверяет построение видимой области (рёбра, плоскость C, радиус R) и считывание; соответствие самих печатных графиков формулам здесь не проверяется — для этого нужна оцифровка рис. 8.8/8.10. Максимальное расхождение отсчёта с расчётом: n1 — ${f(dc.dev.n1, 1)}, n2 — ${f(dc.dev.n2, 1)} луча (погрешность считывания ±0,1 у каждой границы); аналитика проверки и ядра до округления — ${dc.dev.raw < 1e-6 ? 'совпадает' : 'различается на ' + f(dc.dev.raw, 4)}${dc.same ? '' : '; ЧИСЛО УЧАСТКОВ РАЗЛИЧАЕТСЯ — проверьте исходные данные'}. Вклад = CN·(ε·q)·r0·τо·K·MF; τо = ${f(dc.x.tau0, 4)} (${dc.x.w.tau0src}); K = ${f(dc.x.K)} (${dc.x.w.Ksrc}). Затеняющие элементы фасада лучи не обрезают — их влияние учтено K (п. 8.4.2); противостоящие здания выделены отдельными участками. Графики применимы к прямоугольным проёмам.`;
  }
  function danBlocks(st, C) {
    const dc = danCheck(st, C); if (!dc) return null;
    const sb = dc.scheme.box, ratio = (sb[3] - sb[1]) / (sb[2] - sb[0]);
    return { type: 'dan', dc, blocks: [
      { type: 'h3', text: `Проверка по графикам Данилюка I и II: ${dc.title}` },
      { type: 'p', small: true, text: dc.eTxt },
      { type: 'scheme', h: Math.min(175, Math.max(70, 171 * ratio)), schemes: [dc.scheme], caption: 'Разрез и план в одном масштабе. Разрез: полюс графика I в расчётной точке А, лучи — сплошные линии (подписаны 0, 10…50; показана часть графика до высоты проёма), красные — граничные лучи выбранного участка через ограничивающие рёбра, пунктирная дуга — полуокружность через середину участка C (радиус R). План: полюс P графика II на оси через А на расстоянии R от наружной грани (горизонталь R совпадает с гранью), подписи — номера лучей; тонкие линии из А — истинные лучи через откосы. Выделен выбранный участок; серым — фасады противостоящих зданий.' },
      { type: 'table', title: 'Считывание с графиков и сравнение с расчётом (числа лучей)', size: 6.4, cols: DAN_GEO_COLS, rows: dc.geo.map(g => g.cells) },
      { type: 'table', title: `Вклад участков проёма ${dc.sel.win + 1} (значения расчёта)`, size: 6.8, cols: DAN_VAL_COLS, rows: dc.val.map(v => v.cells), note: danNote(dc) }
    ] };
  }

  function topTypesModel(M, st, r, num) {
    r.types.forEach((T, ti) => {
      const t = T.t, nm = r.types.length > 1 ? ` — тип ${ti + 1} «${t.name}»` : '';
      M.push({ type: 'h3', text: `Фонари${nm}` });
      M.push({ type: 'kv', rows: [
        ['Тип, форма в плане', '', t.shape === 'round' ? 'шахтный, круглый' : 'шахтный, прямоугольный', `${t.lanterns.length} шт.`],
        [t.shape === 'round' ? 'Диаметр верхнего / нижнего отверстия' : 'Верхнее отверстие aф.в × bф.в', '', t.shape === 'round' ? `${f(t.dv)} / ${f(t.dn)} м` : `${f(t.av)} × ${f(t.bv)} м`, ''],
        ...(t.shape === 'round' ? [] : [['Нижнее отверстие aф.н × bф.н', '', `${f(t.an)} × ${f(t.bn)} м`, '']]),
        ['Высота светопроводной шахты', 'h_{с.ф}', f(t.hsf) + ' м', ''],
        ['Площадь верхнего отверстия', 'A_{ф.в}', f(T.idx.Av, 3) + ' м²', ''],
        ['Индекс фонаря', 'i_{ф}', f(T.idx.i, 3), `${T.idx.formula} = ${T.idx.subst}; формула ${T.idx.eq} СП 367`],
        ['Коэффициент светопередачи', 'K_{с}', f(T.kc.v, 3), t.Kc !== undefined ? 'задан вручную' : `рис. ${T.kc.fig} СП 367 (${t.refl === 'diffuse' ? 'диффузное' : 'направленное'} отражение стенок, ρ = ${f(t.rhoW)})${T.kc.notes.length ? '. ' + T.kc.notes.join('; ') : ''}`],
        ['Показатель степени', 'm', f(T.m, 3), 'm = 2 + 2/Kс'],
        ['Общий коэффициент пропускания', 'τ_{о}', f(T.tau0, 4), `τо = τ1·τ2·τ3·τ4·τ5 = ${f(t.t1)}·${f(t.t2)}·${f(t.t3)}·${f(t.t4)}·${f(t.t5)} (Б.8)`],
        ['Коэффициент эксплуатации', 'MF', f(T.MF), `СП 367, табл. 5.1: ${st.env === 'normal' ? 'нормальные условия' : 'пыльные, жаркие, сырые'}, наклон остекления ${DATA.MF.angles[+st.top.types[ti].tilt || 0]}`]
      ] });
      const rows = [];
      M.push({ type: 'table', title: `Координаты центров фонарей${nm} — ${st.top.coordOrigin === 'center' ? 'от центра помещения' : 'от угла помещения'}`, size: 8,
        cols: [{ h: '№ фонаря', w: 1 }, { h: 'x, м', w: 1 }, { h: 'y, м', w: 1 }],
        rows: t.lanterns.map((l, i) => [i + 1, f(lanternCoord(st, l.x, 'x'), 3), f(lanternCoord(st, l.y, 'y'), 3)]),
        note: `Прямоугольное помещение: x вправо вдоль L, y вверх вдоль B на плане. ${st.top.coordOrigin === 'center' ? 'Начало — центр; x от угла = x от центра + L/2, y от угла = y от центра + B/2.' : 'Начало — нижний левый угол на плане.'} Линия характерного разреза y0 = ${f(topPoints(st)[0].y, 3)} м от стены y = 0.` });
      T.pts.forEach((p, j) => p.rows.forEach((x, k) => rows.push({ cells: [k === 0 ? `РТ${j + 1}` : '', x.li + 1, f(x.lf), f(x.lfh), f(x.a), f(x.q, 3), f(x.cm, 4), f(x.qc, 4), k === 0 ? f(p.S, 4) : '', k === 0 ? f(p.eps) : '', k === 0 ? f(p.sPr) : '', k === 0 ? f(p.e) : ''], fill: j % 2 ? '#f7f8f9' : null })));
      M.push({ type: 'table', title: `Параметры и КЕО в расчётных точках${nm}`, size: 6.8, cols: [{ h: 'РТ', w: 9, a: 'center' }, { h: '№ ф.', w: 7, a: 'center' }, { h: 'lф, м', w: 10, a: 'center' }, { h: 'lф/hр', w: 10, a: 'center' }, { h: 'α, °', w: 10, a: 'center' }, { h: 'q(α)', w: 10, a: 'center' }, { h: 'cos^m α', w: 11, a: 'center' }, { h: 'q·cos^m α', w: 12, a: 'center' }, { h: 'Σ', w: 11, a: 'center' }, { h: 'ε, %', w: 10, a: 'center' }, { h: 'σпр, %', w: 11, a: 'center' }, { h: 'eв, %', w: 11, a: 'center' }], rows,
        note: `α = arctg(lф / hр); q(α) = q(γ = 90° − α) по (3.2); εj = 100·Aф.в·Σ q(α)·cos^m α / (π·hр²) (8.4) = ${f(T.coef, 3)}·Σ; εср = ${f(T.epsAvg, 3)} (8.5); σпр = εj·τо·MF·CN (8.6); σотр = εср·(r2 − 1)·τо·MF·CN = ${f(T.epsAvg, 3)}·(${f(r.r2, 3)} − 1)·${f(T.tau0, 4)}·${f(T.MF)}·${f(r.CN)} = ${f(T.sOtr, 3)} % (8.7); eв = σпр + σотр (8.8).` });
    });
  }

  function topModel(M, st, C, r) {
    const T = st.top, inp = topInput(st), pts = inp.points;
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Размеры помещения (по разрезу × поперёк)', 'L × B', `${f(T.L)} × ${f(T.B)} м`, 'расчётные точки — вдоль L'],
      ['Высота помещения в свету', 'H', f(T.H) + ' м', 'нижнее отверстие шахты — на уровне потолка (п. 9.4.2)'],
      ['Расчётная высота от УРП до нижнего отверстия', 'h_{р}', f(r.hr) + ' м', `hр = H − hурп = ${f(T.H)} − ${f(inp.hurp)}`],
      ['Число пролётов / ширина пролёта', 'l_{1}', `${inp.spans} / ${f(inp.l1)} м`, ''],
      ['Коэффициент светового климата', 'C_{N}', f(r.CN), `СП 52.13330.2016, табл. 5.1, «В зенитных фонарях», группа ${C.group}`],
      ['Отражённый свет помещения', 'r_{2}', f(r.r2, 3), `табл. Б.21: hр/l1 = ${f(r.hl)}, ρср = ${f(rhoOf(st).v)}, пролётов ${inp.spans}${r.r2info.notes.length ? '. ' + r.r2info.notes.join('; ') : ''}`]
    ] });
    M.push({ type: 'scheme', h: 70, schemes: [Schemes.topPlan({ ...inp, L: +T.L, B: +T.B, y0: pts[0].y, types: inp.types }, pts), Schemes.topSection({ ...inp, L: +T.L, types: inp.types }, pts)], caption: 'Схема расположения фонарей и расчётных точек. Масштаб условный.' });
    M.push({ type: 'h2', text: '3. Расчёт КЕО в точках — формула (Б.3)' });
    M.push({ type: 'formula', lines: ['e_{р}^{в} = C_{N}·τ_{о}·MF·[100·A_{ф.в}·Σ q(α_{i})·cos^{(2+2/Kс)} α_{i} / (π·h_{р}^{2}) + ε_{ср}·(r_{2} − 1)]'], src: 'СП 367.1325800.2025, прил. Б, формула (Б.3); порядок расчёта — п. 8.5.1, формулы (8.4)–(8.8). При нескольких типах фонарей КЕО в точке — сумма от каждого типа.' });
    topTypesModel(M, st, r);
    avgModel(M, r, 'в');
  }
  function avgModel(M, r, sup) {
    M.push({ type: 'h2', text: 'Среднее значение КЕО и равномерность' });
    const N = r.e.length, mid = r.e.slice(1, -1).map(v => f(v)).join(' + ');
    M.push({ type: 'formula', lines: [
      'e_{ср} = 1/(N − 1)·[(e_{1} + e_{N})/2 + Σ e_{j}],  j = 2…N−1   (Б.10)',
      `e_{ср} = 1/(${N} − 1)·[(${f(r.e[0])} + ${f(r.e[N - 1])})/2${mid ? ' + ' + mid : ''}] = ${f(r.eAvg, 3)} ≈ ${f(r.eAvgR)} %`,
      `e_{min} : e_{ср} = ${f(r.eMin)} : ${f(r.eAvg)} = 1 : ${f(r.uniInv)}  (норма — не более 1 : 3, п. 5.13 СП 52.13330.2016)`
    ] });
    void sup;
  }
  function combModel(M, st, C, r) {
    if (isB2(st)) return combModelB2(M, st, C, r);
    const T = st.top, inp = topInput(st), pts = inp.points, W = st.side.walls[0];
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Размеры помещения', 'L × B', `${f(T.L)} × ${f(T.B)} м`, `окна — в стене ${st.comb.wallSide === 'xL' ? 'x = L' : 'x = 0'}, точки — вдоль L`],
      ['Высота помещения в свету', 'H', f(T.H) + ' м', ''],
      ['Расчётная высота до нижнего отверстия фонаря', 'h_{р}', f(r.top.hr) + ' м', ''],
      ['C_{N} (фонари / окна)', 'C_{N}', `${f(r.top.CN)} / ${f(r.side[0].walls[0].CN)}`, `табл. 5.1 СП 52, группа ${C.group}, окна — ${ORIENT_NAME[W.orient]}`],
      ['r_{2}', 'r_{2}', f(r.top.r2, 3), 'табл. Б.21']
    ] });
    M.push({ type: 'scheme', h: 70, schemes: [Schemes.topPlan({ ...inp, L: +T.L, B: +T.B, y0: pts[0].y, types: inp.types, sideWall: st.comb.wallSide }, pts), Schemes.topSection({ ...inp, L: +T.L, types: inp.types }, pts)], caption: 'Схема расположения фонарей, светопроёмов (стена выделена) и расчётных точек.' });
    M.push({ type: 'h2', text: '3. Верхнее освещение — формула (Б.3)' });
    topTypesModel(M, st, r.top);
    combSideModel(M, st, C, r, 4);
  }
  function combSideModel(M, st, C, r, num) {
    M.push({ type: 'h2', text: `${num}. Боковое освещение в тех же точках — формула (Б.1)` });
    M.push({ type: 'table', title: 'Боковой КЕО по точкам', cols: [{ h: 'РТ', w: 10, a: 'center' }, { h: 'lт, м', w: 12, a: 'center' }, { h: 'Σε·q', w: 14, a: 'center' }, { h: 'Σεзд·bф·Kзд', w: 16, a: 'center' }, { h: 'r0', w: 12, a: 'center' }, { h: 'τо', w: 12, a: 'center' }, { h: 'K', w: 10, a: 'center' }, { h: 'eб, %', w: 12, a: 'center' }],
      rows: r.side.map((s, j) => { const w = s.walls[0]; return [`РТ${j + 1}`, f(w.inp.lt), f(w.wins.reduce((a, x) => a + x.sumSky, 0), 4), f(w.wins.reduce((a, x) => a + x.sumBld, 0), 4), f(w.r0, 3), w.wins.every(x => x.tau0 === w.wins[0].tau0) ? f(w.wins[0].tau0, 4) : 'по проёмам', w.wins.every(x => x.K === w.wins[0].K) ? f(w.wins[0].K) : 'по проёмам', f(w.e)]; }),
      note: `CN = ${f(r.side[0].walls[0].CN)}, MF = ${f(r.side[0].walls[0].MF)}; r0 — табл. ${r.side[0].walls[0].r0info.table} для каждой точки; n1, n2 — аналитически (графики Данилюка). τо и K по проёмам: ${r.side[0].walls[0].wins.map((x, i) => `проём ${i + 1} — τо ${f(x.tau0, 4)} (${x.w.tau0src}), K ${f(x.K)} (${x.w.Ksrc})`).join('; ')}.` });
    M.push({ type: 'h2', text: `${num + 1}. Комбинированное освещение — формула (Б.4)` });
    M.push({ type: 'table', title: 'e_к = e_в + e_б', cols: [{ h: 'РТ', w: 12, a: 'center' }, { h: 'eв, %', w: 14, a: 'center' }, { h: 'eб, %', w: 14, a: 'center' }, { h: 'eк, %', w: 14, a: 'center' }], rows: r.e.map((v, j) => [`РТ${j + 1}`, f(r.top.e[j]), f(r.side[j].e), f(v)]) });
    avgModel(M, r, 'к');
  }

  /* ---------- отчёт: надстройки (Б.2) ---------- */
  const SIDE_NAME = { L: 'левое', R: 'правое', H: 'в покрытии' };
  function b2Kv(M, st, C, r, inp) {
    r.types.forEach((T, ti) => {
      const t = T.t, nm = r.types.length > 1 ? ` «${t.name}»` : '';
      const ys = T.ys.map(([a, b]) => `${f(a + inp.y0)}…${f(b + inp.y0)}`).join('; ');
      M.push({ type: 'h3', text: `Фонари${nm}: ${R.KIND_NAME[t.kind]}` });
      M.push({ type: 'kv', rows: [
        ['Оси фонарей на разрезе (от стены x = 0)', 'x', t.xs.map(x => f(x)).join('; ') + ' м', `${t.xs.length} шт.`],
        ['Ширина проёма в покрытии', 'b', f(t.b) + ' м', ''],
        ['Высота борта (низ остекления над проёмом)', 'h_{ст}', f(t.hst) + ' м', `низ остекления на отметке ${f(inp.Hk + t.hst)} м от пола`],
        ...(t.kind === 'plane' ? [] : [['Высота остекления (по вертикали)', 'h_{о}', f(t.ho) + ' м', t.kind === 'A' ? 'для А-образного hо = (b/2)·tg β' : '']]),
        ...(['trap', 'A', 'shedI'].includes(t.kind) ? [['Наклон остекления к горизонту', 'β', f(t.beta, 0) + '°', '']] : []),
        ['Протяжённость вдоль оси (от торцевой стены)', 'y', ys + ' м', t.pieces > 1 ? `${t.pieces} проёма с шагом ${f(t.pitch)} м` : 'сплошной (ленточный)'],
        ['Коэффициент типа фонаря', 'k_{ф}', f(T.kf), 'табл. Б.22 СП 367'],
        ['Коэффициент светового климата', 'C_{N}', f(T.CN), `СП 52.13330.2016, табл. 5.1: ${CN_ROWS.find(x => x[0] === t.CNrow)[1]}, группа ${C.group}`],
        ['Общий коэффициент пропускания', 'τ_{о}', f(T.tau0, 4), `τо = τ1·τ2·τ3·τ4·τ5 = ${f(t.t1)}·${f(t.t2)}·${f(t.t3)}·${f(t.t4)}·${f(t.t5)} (Б.8); τ3 — фермы, τ5 = 0,9 — сетка (табл. Б.16, п. Б.2.7)`],
        ['Коэффициент эксплуатации', 'MF', f(T.MF), `табл. 5.1 СП 367: ${st.env === 'normal' ? 'нормальные условия' : 'пыльные, жаркие, сырые'}, наклон остекления ${DATA.MF.angles[R.tiltIdx(t)]}${st.glassMult !== 1 ? `, × ${f(st.glassMult)}` : ''}`],
        ['Высота низа остекления над УРП', 'h_{ф}', f(T.hf) + ' м', ''],
        ['Отражённый свет помещения', 'r_{2}', f(T.r2, 3), `табл. Б.21: hф/l1 = ${f(T.hl)}, ρср = ${f(rhoOf(st).v)}, пролётов ${inp.spans}, l1 = ${f(inp.l1)} м${T.r2info.notes.length ? '. ' + T.r2info.notes.join('; ') : ''}`]
      ] });
    });
  }
  function b2Sectors(M, r) {
    M.push({ type: 'p', small: true, text: 'Число лучей по графикам I и II А.М. Данилюка определено аналитически: в поперечном разрезе построены лучи из расчётной точки через каждое остекление с учётом борта, покрытия фонаря и соседних фонарей (луч, упирающийся после остекления в другой фонарь, не учитывается); φ — углы видимого участка от горизонта (справа), n1 = 50·|cos φн − cos φв|. C — середина видимого участка остекления, R — расстояние до неё; n2 = (100/π)·[ψ + ½·sin 2ψ] между торцами фонаря, tg ψ = y / R (график II, горизонталь № R). γ — угол возвышения точки C. Число лучей округлено до десятых.' });
    M.push({ type: 'formula', lines: ['ε_{вi} = 0,01·n_{1}·n_{2}  (Б.13);    q(γ) = 0,429·[1 + 4·exp(−0,7 / sin γ)]  (3.2)'] });
    r.types.forEach((T, ti) => {
      const rows = [];
      T.pts.forEach((p, j) => {
        if (!p.sectors.length) rows.push({ cells: [`РТ${j + 1}`, '—', 'небо через фонари не видно', '', '', '', '', '', '', '', '0'], fill: j % 2 ? '#f7f8f9' : null });
        p.sectors.forEach((x, k) => rows.push({ cells: [k === 0 ? `РТ${j + 1}` : '', x.inst + 1, SIDE_NAME[x.side], `${f(x.phiA, 1)}…${f(x.phiB, 1)}`, f(x.n1, 1), f(x.n2, 1), f(x.gamma, 1), f(x.q, 3), f(x.eps, 4), f(x.eq, 4), k === 0 ? f(p.S, 4) : ''], fill: j % 2 ? '#f7f8f9' : null }));
      });
      M.push({ type: 'table', title: `Участки неба, видимые через фонари${r.types.length > 1 ? ` «${T.t.name}»` : ''}`, size: 6.8, cols: [{ h: 'РТ', w: 9, a: 'center' }, { h: '№ ф.', w: 7, a: 'center' }, { h: 'Остекл.', w: 12, a: 'center' }, { h: 'φ, °', w: 15, a: 'center' }, { h: 'n1', w: 9, a: 'center' }, { h: 'n2', w: 9, a: 'center' }, { h: 'γ, °', w: 9, a: 'center' }, { h: 'q(γ)', w: 10, a: 'center' }, { h: 'εв, %', w: 11, a: 'center' }, { h: 'εв·q', w: 11, a: 'center' }, { h: 'Σ εв·q', w: 12, a: 'center' }], rows });
    });
  }
  function b2Points(M, st, r) {
    M.push({ type: 'formula', lines: ['e_{р}^{в} = C_{N}·[Σ ε_{вi}·q(γ_{i}) + ε_{ср}·(r_{2}·k_{ф} − 1)]·τ_{о}·MF   (Б.2)'], src: 'СП 367.1325800.2025, прил. Б, формула (Б.2); порядок — п. 8.5.1. εср — среднее по расчётным точкам значений εв = 0,01·Σ(n1·q(γ)·n2) (п. 8.5.1 г), е); формула (Б.9)). При нескольких типах фонарей КЕО в точке — сумма по типам.' });
    r.types.forEach(T => {
      const N = T.pts.length;
      M.push({ type: 'formula', lines: [
        `${r.types.length > 1 ? '«' + T.t.name + '»: ' : ''}ε_{ср} = (${T.pts.map(p => f(p.S, 3)).join(' + ')}) / ${N} = ${f(T.epsAvg, 4)}`,
        `отражённая составляющая: C_{N}·ε_{ср}·(r_{2}·k_{ф} − 1)·τ_{о}·MF = ${f(T.CN)}·${f(T.epsAvg, 4)}·(${f(T.r2, 3)}·${f(T.kf)} − 1)·${f(T.tau0, 4)}·${f(T.MF)} = ${f(T.sOtr, 3)} %`
      ] });
    });
    const rows = r.e.map((v, j) => [`РТ${j + 1}`, f(r.inp.points[j].x), ...r.types.map(T => f(T.pts[j].S, 4)), f(r.types.reduce((s, T) => s + T.pts[j].sPr, 0), 3), f(r.types.reduce((s, T) => s + T.sOtr, 0), 3), f(v)]);
    M.push({ type: 'table', title: 'КЕО в расчётных точках при верхнем освещении', cols: [{ h: 'РТ', w: 10, a: 'center' }, { h: 'x, м', w: 11, a: 'center' }, ...r.types.map(T => ({ h: r.types.length > 1 ? `Σεq «${T.t.name}»` : 'Σ εв·q', w: 14, a: 'center' })), { h: 'прямая, %', w: 14, a: 'center' }, { h: 'отражённая, %', w: 15, a: 'center' }, { h: 'eв, %', w: 12, a: 'center' }], rows,
      note: 'прямая = CN·Σεв·q·τо·MF; отражённая = CN·εср·(r2·kф − 1)·τо·MF; eв = прямая + отражённая.' });
  }
  function b2SchemeBlock(M, st, r, inp, sideWall) {
    const pts = inp.points, mid = Math.floor(pts.length / 2);
    M.push({ type: 'scheme', h: 72, weights: [2.2, 1], schemes: [Schemes.b2Sect(inp, r, mid, sideWall), Schemes.b2Plan(inp, sideWall)], caption: `Поперечный разрез (видимые участки неба показаны из РТ${mid + 1}) и план с фонарями и линией расчётных точек. Масштаб условный.` });
  }
  function b2Model(M, st, C, r) {
    const T = st.top, inp = r.inp;
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Длина помещения по разрезу (поперёк фонарей)', 'L', f(T.L) + ' м', 'расчётные точки — вдоль L'],
      ['Длина помещения вдоль фонарей', 'B', f(T.B) + ' м', `линия разреза на y = ${f(inp.y0)} м`],
      ['Высота до низа проёмов в покрытии', 'H', f(T.H) + ' м', 'от пола'],
      ['Высота УРП', 'h_{урп}', f(inp.hurp) + ' м', ''],
      ['Число пролётов / ширина пролёта', 'l_{1}', `${inp.spans} / ${f(inp.l1)} м`, 'для табл. Б.21']
    ] });
    b2SchemeBlock(M, st, r, inp);
    b2Kv(M, st, C, r, inp);
    M.push({ type: 'h2', text: '3. Геометрический КЕО в расчётных точках' });
    b2Sectors(M, r);
    M.push({ type: 'h2', text: '4. КЕО в точках — формула (Б.2)' });
    b2Points(M, st, r);
    avgModel(M, r, 'в');
  }
  function combModelB2(M, st, C, r) {
    const T = st.top, inp = r.top.inp, W = st.side.walls[0];
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Длина по разрезу × вдоль фонарей', 'L × B', `${f(T.L)} × ${f(T.B)} м`, `окна — в стене ${st.comb.wallSide === 'xL' ? 'x = L' : 'x = 0'}, точки — вдоль L`],
      ['Высота до низа проёмов в покрытии', 'H', f(T.H) + ' м', ''],
      ['C_{N} окон', 'C_{N}', f(r.side[0].walls[0].CN), `табл. 5.1 СП 52, группа ${C.group}, ${ORIENT_NAME[W.orient]}`]
    ] });
    b2SchemeBlock(M, st, r.top, inp, st.comb.wallSide);
    b2Kv(M, st, C, r.top, inp);
    M.push({ type: 'h2', text: '3. Верхнее освещение — формула (Б.2)' });
    b2Sectors(M, r.top);
    b2Points(M, st, r.top);
    combSideModel(M, st, C, r, 4);
  }

  return { lanternCoord, topPointPolicy, danCheck, danBlocks, danSel, DAN_GEO_COLS, DAN_VAL_COLS, migrate, setRhoMode, readNum, coefCheck, COEF_RULES, winCoef, wallCoef, winMode, migrateWindows, rhoOf, rhoMode, roomShell, windowsArea, windowOverlaps, RHO_ROWS, B2_KINDS, CN_ROWS, cnRowDefault, defaultB2Type, b2Input, isB2, defaultState, defaultWall, defaultWindow, defaultType, compute, buildModel, normOf, normComparison, hpOf, rtOf, ltAuto, groupOf, room, topPoints, sideInput, topInput, ORIENTS, ORIENT_NAME, RT_TEXT, RT_REF, K_TITLES, mfOf, tau1Wall, round2 };
})();
if (typeof module !== 'undefined') module.exports = KEO;
