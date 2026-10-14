/* Проверки модели (форма → ядро → отчёт): источники K, приоритет ручных τо/K, площади и ρср, схемы Данилюка.
   Запуск: node test-model.js  — все проверки должны пройти. */
const fs = require('fs'), path = require('path');
global.window = global;
const src = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { KEO, Engine, Schemes, DATA } = new Function(src + '\nreturn { KEO, Engine, Schemes, DATA };')();

let fails = 0, total = 0;
const ok = (name, cond, info) => { total++; if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${info !== undefined ? ' — ' + info : ''}`); };
const near = (name, got, exp, tol) => ok(name, Math.abs(got - exp) <= tol, `получено ${got}, эталон ${exp} (±${tol})`);
const clone = o => JSON.parse(JSON.stringify(o));

// базовое состояние: одна стена, два окна; общие τо = τ1·τ2 = 0,48·0,75 = 0,36, K стены = 0,72 (вручную)
function base() {
  const st = KEO.defaultState();
  Object.assign(st, { groupManual: true, group: 5, roomId: 'A1', rtManual: 'center' });
  const w = st.side.walls[0];
  Object.assign(w, { orient: 'В', dp: 6, bp: 3.4, H: 3.3, dst: 0.4, t1: 0, t1c: 0.48, t2: 5, t4: 0, kType: 'manual', kManual: 0.72, kBasis: 'для проверки' });
  w.windows = [KEO.defaultWindow(-0.9), KEO.defaultWindow(0.9)].map(x => ({ ...x, hpd: 0.8, ho: 1.8, bo: 1.5 }));
  return st;
}
const wins = st => { const C = KEO.compute(st); return C.ok ? C.res.walls[0].wins : null; };
const errs = st => { const C = KEO.compute(st); return C.ok ? [] : C.err; };

console.log('\n=== П.1. Источник K ===');
{
  const exp = { balcony: 'Б.17', loggia: 'Б.18', canopy: 'Б.19', screen: 'Б.20' };
  Object.entries(exp).forEach(([t, tab]) => {
    const st = base(); Object.assign(st.side.walls[0], { kType: t, kDepth: 1.2 });
    const g = KEO.wallCoef(st, st.side.walls[0], 6);
    ok(`${t}: ссылка «СП 367.1325800.2025, табл. ${tab}»`, g.K.src.startsWith(`СП 367.1325800.2025, табл. ${tab} (`), g.K.src);
    ok(`${t}: в ссылке вынос, глубина, положение точки, способ`, /вынос 1,20 м; глубина помещения 6,00 м; расчётная точка в центре помещения; интерполяция по выносу/.test(g.K.src));
    const w = wins(st);
    ok(`${t}: отчёт — тот же источник, что в форме`, w[0].w.Ksrc === g.K.src && w[0].K === g.K.v);
  });
  const st = base(); Object.assign(st.side.walls[0], { kType: 'balcony', kDepth: 4 });
  ok('экстраполяция по выносу названа явно', /экстраполяция по выносу \(табл\.: 0,5…3,0 м\)/.test(KEO.wallCoef(st, st.side.walls[0], 6).K.src));
  st.side.walls[0].kDepth = 1.5; ok('узел таблицы назван явно', /значение в узле таблицы/.test(KEO.wallCoef(st, st.side.walls[0], 6).K.src));
  st.side.walls[0].kType = 'none';
  const g0 = KEO.wallCoef(st, st.side.walls[0], 6);
  ok('нет элемента: «K = 1,00; затеняющие элементы отсутствуют», без ссылки на таблицу', g0.K.v === 1 && g0.K.src === 'K = 1,00; затеняющие элементы отсутствуют');
  const s2 = base(); s2.side.walls[0].kType = 'balcony'; s2.side.walls[0].windows[0].Km = 'manual'; s2.side.walls[0].windows[0].Ko = 0.5; s2.side.walls[0].windows[0].Kb = 'моделирование';
  const w2 = wins(s2);
  ok('ручной K проёма не подписан как табличный', w2[0].w.Ksrc === 'задано вручную для проёма 1: моделирование' && !/табл/.test(w2[0].w.Ksrc));
  ok('второй проём — табличный K стены', /табл\. Б\.17/.test(w2[1].w.Ksrc));
  const M = KEO.buildModel(s2, KEO.compute(s2)), T = M.find(b => b.type === 'table' && /Происхождение/.test(b.title));
  ok('PDF/разбор: таблица происхождения совпадает с ядром', T.rows[0][3] === '0,50' && T.rows[0][4] === w2[0].w.Ksrc && T.rows[1][4] === w2[1].w.Ksrc);
  // значения таблиц K не изменились: сверка с прежней версией функции (по данным DATA.K)
  let maxd = 0; ['balcony', 'loggia', 'canopy', 'screen'].forEach(t => [2.5, 3, 4.2, 6, 7].forEach(d => [0.3, 0.5, 1.7, 3, 3.6].forEach(e => ['center', 'wall1'].forEach(p => {
    const T2 = DATA.K[t], k = p === 'wall1' ? 'wall1' : 'center';
    const by = DATA.K.depths.map((_, di) => Engine.interp(T2.el, T2[k][di], e, 'extrap').v), v = Math.min(1, Math.max(0, Engine.interp(DATA.K.depths, by, d, 'extrap').v));
    maxd = Math.max(maxd, Math.abs(v - Engine.KLookup(t, d, e, p).v));
  }))));
  ok('табличные значения K не изменены (200 сочетаний)', maxd === 0, `max Δ = ${maxd}`);
}

console.log('\n=== П.3/5/6. Приоритет ручных τо и K ===');
{
  let st = base(), w = wins(st);
  near('общие τо = 0,48·0,75', w[0].tau0, 0.36, 1e-12); near('общий K стены', w[0].K, 0.72, 1e-12);
  // сценарий скриншота: общие 0,36/0,72, у окна вручную 0,36/0,70
  const x = st.side.walls[0].windows[0]; Object.assign(x, { tau0m: 'manual', tau0o: 0.36, Km: 'manual', Ko: 0.7 });
  w = wins(st);
  ok('окно 1: применены τо 0,36 и K 0,70 (не 0,504)', w[0].tau0 === 0.36 && w[0].K === 0.7 && Math.abs(w[0].K - 0.504) > 0.1);
  ok('окно 1: источник обоих — вручную', /^задано вручную для проёма 1/.test(w[0].w.tau0src) && /^задано вручную для проёма 1/.test(w[0].w.Ksrc));
  // различающиеся числа
  Object.assign(x, { tau0o: 0.30, Ko: 0.70 }); w = wins(st);
  ok('окно 1: 0,30 / 0,70', w[0].tau0 === 0.3 && w[0].K === 0.7);
  ok('окно 2 без исключений — общие 0,36 / 0,72', Math.abs(w[1].tau0 - 0.36) < 1e-12 && w[1].K === 0.72 && /^τо = τ1·τ2/.test(w[1].w.tau0src));
  st.side.walls[0].t1c = 0.6; st.side.walls[0].kManual = 0.8; w = wins(st);
  ok('изменение общих параметров не меняет окно 1', w[0].tau0 === 0.3 && w[0].K === 0.7);
  ok('… а окно 2 следует общим', Math.abs(w[1].tau0 - 0.45) < 1e-12 && w[1].K === 0.8);
  // очистка одного исключения
  Object.assign(x, { tau0m: 'wall', tau0o: null }); w = wins(st);
  ok('очистка τо окна 1 возвращает только τо', Math.abs(w[0].tau0 - 0.45) < 1e-12 && w[0].K === 0.7);
  // ручной τо и τ2
  Object.assign(x, { tau0m: 'manual', tau0o: 0.33, t2m: 'manual', t2o: 0.5 }); w = wins(st);
  ok('при ручном τо τ2 окна не меняет τо', w[0].tau0 === 0.33);
  x.t2o = 0.6; ok('… и после правки τ2', wins(st)[0].tau0 === 0.33);
  x.tau0m = 'wall'; w = wins(st);
  near('после возврата к авто τ2 окна снова участвует: 0,6·0,6', w[0].tau0, 0.36, 1e-12);
  ok('ручной τ2 окна заменяет общий только для окна 1', Math.abs(w[1].tau0 - 0.45) < 1e-12);
  // JSON экспорт/импорт
  const j = KEO.migrate(JSON.parse(JSON.stringify(st)));
  ok('JSON: режимы и значения сохранены', JSON.stringify(j.st.side) === JSON.stringify(st.side) && !j.notes.length);
  ok('JSON: тот же результат', KEO.compute(j.st).res.eFinal === KEO.compute(st).res.eFinal);
}
{
  // ввод: ноль, пусто, отрицательное, > 1, нечисловое, запятая
  const t = (v, mode = 'manual') => { const st = base(); Object.assign(st.side.walls[0].windows[0], { Km: mode, Ko: v }); return st; };
  ok('K = «0,7» (запятая) = 0,7', wins(t('0,7'))[0].K === 0.7);
  ok('K = «0.7» (точка) = 0,7', wins(t('0.7'))[0].K === 0.7);
  ok('K = 0 — ошибка (ноль недопустим)', errs(t(0)).some(e => /ноль недопустим/.test(e)));
  ok('K пусто при «вручную» — ошибка «значение не введено»', errs(t(null)).some(e => /значение не введено/.test(e)));
  ok('K = −0,2 — ошибка диапазона', errs(t(-0.2)).some(e => /вне диапазона/.test(e)));
  ok('K = 1,3 — ошибка диапазона', errs(t(1.3)).some(e => /вне диапазона/.test(e)));
  ok('K = «abc» — ошибка «не число», результата нет', errs(t('abc')).some(e => /не число/.test(e)) && !KEO.compute(t('abc')).ok);
  ok('K = «0,7x» — не число (без частичного разбора)', errs(t('0,7x')).some(e => /не число/.test(e)));
  ok('режим «по общим» с сохранённым значением: значение не применяется', wins(t(0.5, 'wall'))[0].K === 0.72);
  const s3 = base(); s3.side.walls[0].t1c = 'abc'; ok('τ1 по паспорту «abc» — ошибка', errs(s3).some(e => /τ1 по паспорту/.test(e)));
  // файлы прежних версий: режимов нет — как прежняя проверка истинности, с замечанием о нуле
  const old = clone(base()); const ow = old.side.walls[0].windows; ow.forEach(x => { delete x.t2m; delete x.tau0m; delete x.Km; });
  ow[0].t2o = 0.75; ow[1].Ko = 0;
  const m = KEO.migrate(old);
  ok('старый файл: τ2 = 0,75 → «вручную»', m.st.side.walls[0].windows[0].t2m === 'manual');
  ok('старый файл: K = 0 → «по общим» + замечание', m.st.side.walls[0].windows[1].Km === 'wall' && m.notes.some(n => /K = 0/.test(n)));
}

console.log('\n=== П.2. Площади и ρср ===');
{
  const st = base(); st.rhoMode = 'surf'; st.rhoGeo = 'auto';
  Object.assign(st.rhoSurf, { floor: { S: null, rho: 0.25, src: 'изм.' }, walls: { S: null, rho: 0.4, src: 'изм.' }, ceil: { S: null, rho: 0.7, src: 'изм.' }, win: { S: null, rho: 0.2, src: 'паспорт' } });
  st.side.walls[0].windows.forEach(x => { x.bo = 1.5; x.ho = 1.8; });
  let r = KEO.rhoOf(st); const S = Object.fromEntries(r.rows.map(x => [x.key, x.S.v]));
  near('пол 20,4', S.floor, 20.4, 1e-9); near('потолок 20,4', S.ceil, 20.4, 1e-9); near('окна 5,4', S.win, 5.4, 1e-9); near('стены 56,64', S.walls, 56.64, 1e-9); near('сумма 102,84', r.sumS, 102.84, 1e-9);
  st.side.walls[0].windows[1].bo = 1.2; r = KEO.rhoOf(st); const S2 = Object.fromEntries(r.rows.map(x => [x.key, x.S.v]));
  ok('изменение окна меняет только окна и стены', S2.floor === S.floor && S2.ceil === S.ceil && Math.abs(S2.win - 4.86) < 1e-9 && Math.abs(S2.walls - 57.18) < 1e-9);
  st.side.walls[0].windows[1].bo = 1.5;
  // вторая стена (противоположная, те же габариты) — оболочка один раз
  const s2 = clone(st); const w2 = clone(s2.side.walls[0]); w2.orient = 'З'; s2.side.walls.push(w2);
  r = KEO.rhoOf(s2);
  ok('две стены: пол/потолок не удвоены, окна обеих стен', r.rows[0].S.v === 20.4 && Math.abs(r.rows[3].S.v - 10.8) < 1e-9 && Math.abs(r.sumS - 102.84) < 1e-9);
  s2.side.walls[1].dp = 5; ok('несогласованные габариты стен — ошибка, а не молчаливый выбор', KEO.rhoOf(s2).err.some(e => /не согласуются/.test(e)));
  const s3 = clone(st); s3.side.walls[0].windows[1].s = -0.5; ok('перекрывающиеся проёмы — ошибка', KEO.rhoOf(s3).err.some(e => /перекрываются/.test(e)));
  const s4 = clone(st); s4.side.walls[0].windows[1].s = 1.2; ok('проём за пределами стены — ошибка', KEO.rhoOf(s4).err.some(e => /выходит за пределы стены/.test(e)));
  const s5 = clone(st); s5.rhoSurf.win.S = 70; ok('отрицательная площадь стен — ошибка', KEO.rhoOf(s5).err.some(e => /отрицательная площадь/.test(e)) && !KEO.compute(s5).ok);
  const s6 = clone(st); s6.rhoSurf.walls.S = 50; r = KEO.rhoOf(s6);
  ok('ручная площадь стен — без повторного вычета окон + предупреждение', r.rows[1].S.v === 50 && r.rows[1].man && r.warn.length === 1);
  // контроль ρср по ведомости
  const s7 = clone(st); s7.rhoGeo = 'manual'; s7.rhoRows = [[17.7, 0.25], [60, 0.4], [17.7, 0.7], [6, 0.2]].map(([S, rho], i) => ({ name: 'п' + i, S, rho, src: 'контроль' }));
  r = KEO.rhoOf(s7);
  near('ρср 17,7/60/17,7/6 и 0,25/0,40/0,70/0,20 = 0,4143491124', r.exact, 0.4143491124, 1e-10);
  ok('применяется 0,41 (до сотых), в подписи — точное и принятое', r.v === 0.41 && /0,4143, принято 0,41/.test(r.label));
  ok('ядро получает то же ρ', KEO.sideInput(s7).rho === 0.41);
  const s8 = clone(s7); s8.rhoRows.forEach(x => { x.S = 0; }); ok('нулевой знаменатель — ошибка', KEO.rhoOf(s8).err.some(e => /сумма площадей равна нулю/.test(e)));
  const s9 = clone(st); s9.rhoSurf.win.rho = null; ok('ρ окон не задан — ошибка (0,20 не подставляется)', KEO.rhoOf(s9).err.some(e => /Окна — укажите коэффициент/.test(e)));
  // режимы
  const d = base(); ok('по умолчанию 0,55 — примечание 2 к табл. Б.6/Б.7', KEO.rhoOf(d).v === 0.55 && /примечание 2 к табл\. Б\.6\/Б\.7/.test(KEO.rhoOf(d).label));
  d.rhoMode = 'manual'; d.rho = '0,6'; d.rhoBasis = 'измерения'; ok('вручную: значение и основание, без «по формуле»', KEO.rhoOf(d).v === 0.6 && KEO.rhoOf(d).label === 'задано вручную: измерения');
  const top = base(); top.mode = 'top'; top.rhoMode = 'surf'; Object.assign(top.rhoSurf, clone(st.rhoSurf));
  r = KEO.rhoOf(top); ok('верхний свет: пол, стены, потолок (табл. Б.21), без окон', r.rows.length === 3 && /Б\.21/.test(r.label));
  // импорт старого файла
  const o1 = clone(base()); delete o1.rhoMode; o1.rho = 0.6; o1.rhoCalc = { on: false, s: [] };
  let m = KEO.migrate(o1); ok('старый файл, ρ 0,6 без помощника: «источник не подтверждён», значение сохранено', m.st.rhoMode === 'legacy' && KEO.rhoOf(m.st).v === 0.6 && /источник не подтверждён/.test(KEO.rhoOf(m.st).label));
  const o2 = clone(base()); delete o2.rhoMode; o2.rho = 0.55; o2.rhoCalc = { on: false, s: [[30, 0.3]] };
  // 0,55 в старом файле могло быть введено вручную или получено расчётом — по числу режим не определяется (решение 14.10.2026)
  m = KEO.migrate(o2); r = KEO.rhoOf(m.st);
  ok('старый файл, 0,55 без помощника: «источник не подтверждён», 0,55 сохранено', m.st.rhoMode === 'legacy' && r.v === 0.55 && !r.err.length && /источник не подтверждён/.test(r.label) && m.notes.some(n => /источник не подтверждён/.test(n)));
  const o4 = clone(o2); delete o4.rho; m = KEO.migrate(o4);
  ok('старый файл без ρ: «источник не подтверждён», значение не выдумывается — ошибка до выбора режима', m.st.rhoMode === 'legacy' && KEO.rhoOf(m.st).err.length > 0);
  ok('новый расчёт (без файла) — по-прежнему «0,55»', KEO.defaultState().rhoMode === 'default');
  const o3 = clone(base()); delete o3.rhoMode; o3.rho = 0.414; o3.rhoCalc = { on: true, s: [[17.7, 0.25], [60, 0.4], [17.7, 0.7], [6, 0.2]] };
  m = KEO.migrate(o3); r = KEO.rhoOf(m.st);
  ok('старый файл с принятым помощником: 0,414 сохранено, площади не подменены', r.v === 0.414 && /совпадает с помощником/.test(r.label) && m.st.rhoCalc.s[0][0] === 17.7);
}

console.log('\n=== П.4. Графики Данилюка ===');
{
  // арифметика скриншота (не тест геометрии): ε = 0,01·6,6·36,9
  near('ε = 0,01·6,6·36,9 = 2,4354 %', 0.01 * 6.6 * 36.9, 2.4354, 1e-12);
  ok('γ = 16,95° (округлено): q(3.2) при γ ∈ [16,945; 16,955] = 0,5844…0,5846, ε·q = 1,4233…1,4238 — 1,4236 из таблицы согласуется (q и γ округлены для показа)', Engine.qGamma(16.945) < 0.58465 && Engine.qGamma(16.955) > 0.58455 && 2.4354 * Engine.qGamma(16.945) < 1.4236 && 2.4354 * Engine.qGamma(16.955) > 1.4236);
  const W = (hpd, ho, bo, s) => ({ ...KEO.defaultWindow(s), hpd, ho, bo });
  const mk = (p, wins, blds) => { const st = KEO.defaultState(); Object.assign(st, { groupManual: true, group: 5, roomId: 'A1', hpManual: p.hp, rtManual: 'manual' }); st.side.walls = [{ ...KEO.defaultWall('В'), dp: p.dp || 6, bp: p.bp || 6, H: 3.3, dst: p.dst, lt: p.lt, ds: p.ds || 0, t1c: 0.64, t2: 0, windows: wins, buildings: blds || [] }]; return st; };
  const check = (name, st) => {
    const C = KEO.compute(st); if (!C.ok) { ok(name + ': расчёт', false, C.err.join('; ')); return null; }
    let all = true, info = [];
    C.res.walls[0].wins.forEach((x, i) => { st.dan = { wall: 0, win: i, sec: 0 }; const d = KEO.danCheck(st, C); const good = d.same && d.dev.raw < 1e-9 && d.dev.n1 <= 0.1 + 1e-9 && d.dev.n2 <= 0.1 + 1e-9; all = all && good; info.push(`пр.${i + 1}: участков ${d.d.list.length}, Δn1 ${d.dev.n1.toFixed(1)}, Δn2 ${d.dev.n2.toFixed(1)}`); });
    ok(`${name}: независимая геометрия = ядро до округления; отсчёт по графику ±0,1`, all, info.join('; '));
    return C;
  };
  let st = mk({ hp: 0, lt: 4.05, dst: 0.72, dp: 8.1, bp: 3.06 }, [W(0.5, 2.2, 1.65, 0)]);
  let C = check('симметричное окно (АР2 прил. 1, пом. 1.003)', st);
  st.dan = { wall: 0, win: 0, sec: 0 }; let d = KEO.danCheck(st, C), g = d.d.list[0];
  ok('симметрия: отсчёты по графику II ±10,2', g.r2a === -g.r2b && g.r2b === 10.2);
  ok('эталон АР2: n1 6,1 и n2 20,5 (расчёт); по графику n2 = 20,4 — расхождение считывания 0,1', C.res.walls[0].wins[0].sectors[0].n1 === 6.1 && C.res.walls[0].wins[0].sectors[0].n2 === 20.5 && g.n2g === 20.4);
  check('смещённые точка и проём', mk({ hp: 0.8, lt: 3, dst: 0.4, ds: 0.7 }, [W(0.9, 1.8, 1.2, -1.3)]));
  C = check('толстая стена 0,9 м', mk({ hp: 0, lt: 2, dst: 0.9 }, [W(0.6, 2.0, 1.5, 1.2)]));
  st = mk({ hp: 0, lt: 2, dst: 0.9 }, [W(0.6, 2.0, 1.5, 1.2)]); d = KEO.danCheck(st, KEO.compute(st));
  ok('толстая стена: подоконник и ближний откос — внутренняя грань, перемычка и дальний откос — наружная', d.d.edges.lo.n === 'внутренняя грань' && d.d.edges.hi.n === 'наружная грань' && d.d.edges.L.n === 'внутренняя грань' && d.d.edges.R.n === 'наружная грань');
  check('несколько окон (АР2 прил. 2, пом. 1.004)', mk({ hp: 0, lt: 7, dst: 0.72, dp: 8, bp: 7.4 }, [W(0.5, 2.2, 1.65, -2.88), W(0.5, 2.2, 1.65, -1.12), W(0.5, 2.2, 1.65, 0.62), W(0.5, 2.2, 1.65, 2.38)]));
  st = mk({ hp: 1.5, lt: 3, dst: 0.4 }, [W(0.2, 0.9, 1.2, 0)]); C = KEO.compute(st); d = KEO.danCheck(st, C);
  ok('небо не видно (верх окна ниже точки): участков нет ни в ядре, ни в проверке', C.ok && C.res.walls[0].wins[0].sectors.length === 0 && d.d.list.length === 0);
  st = mk({ hp: 0.8, lt: 3, dst: 0.5 }, [W(0.8, 1.8, 1.5, 0)], [{ l: 15, Hp: 6, a: 20, off: 3, rhoF: 0.4 }]);
  C = check('противостоящее здание', st); d = KEO.danCheck(st, C);
  ok('здание и небо — отдельные участки', d.d.list.some(x => x.type === 'bld') && d.d.list.some(x => x.type === 'sky') && d.val.some(v => /·/.test(v.cells[4])));
  // п. 8.4.2: затеняющие элементы не обрезают лучи — геометрия одна при любом K
  const g0 = JSON.stringify(KEO.danCheck(st, C).d.list);
  ['balcony', 'loggia', 'canopy', 'screen'].forEach(t => { const s2 = clone(st); Object.assign(s2.side.walls[0], { kType: t, kDepth: 1.2 }); const C2 = KEO.compute(s2), d2 = KEO.danCheck(s2, C2); ok(`${t}: участки те же, K только множитель (п. 8.4.2)`, JSON.stringify(d2.d.list) === g0 && C2.res.walls[0].wins[0].K < 1); });
  // схема: подписи не выходят за рамку, PDF и разбор — тот же выбор
  const sc = d.scheme, [x0, y0, x1, y1] = sc.box;
  ok('схема: все точки и подписи внутри рамки', sc.it.every(e => (e.x === undefined || (e.x >= x0 && e.x <= x1)) && (e.y === undefined || (e.y >= y0 && e.y <= y1))));
  st.dan = { wall: 0, win: 0, sec: 1 }; const M = KEO.buildModel(st, KEO.compute(st)), db = M.find(b => b.type === 'dan');
  ok('отчёт содержит выбранный участок и те же числа', db && db.dc.sel.sec === 1 && /участок небо 2/.test(db.blocks[0].text) && db.blocks[3].rows.length === d.geo.length);
}

console.log(`\nИтог: ${total - fails}/${total} проверок пройдено`);
process.exit(fails ? 1 : 0);
