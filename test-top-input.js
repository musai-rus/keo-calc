/* Регрессии ввода верхнего света: координаты, сохранение, точки и отчёт. */
const fs = require('fs'), assert = require('assert');
const src = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { KEO, Schemes } = new Function(src + '\nreturn {KEO, Schemes};')();
const copy = s => JSON.parse(JSON.stringify(s));
const near = (a, b) => assert(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
let count = 0;
function test(name, fn) { fn(); count++; console.log('OK ' + name); }
function sample() {
  const s = KEO.defaultState(); s.mode = 'top';
  Object.assign(s.top, { L: 14.39, B: 8.72, H: 4.2, y0: 4.1 });
  s.top.types = [{ ...KEO.defaultType(), lanterns: [{ x: 3.237, y: 4.125 }, { x: 10.625, y: 5.371 }] }, { ...KEO.defaultType(), shape: 'rect', lanterns: [{ x: 7.12, y: 2.15 }] }];
  return s;
}
test('Старый JSON: координаты от угла и результаты сохранены', () => {
  const s = sample(); delete s.top.coordOrigin; delete s.top.nPtsBasis;
  const r = KEO.compute(s), m = KEO.migrate(copy(s)).st;
  assert.equal(m.top.coordOrigin, 'corner'); assert.deepEqual(m.top.types, s.top.types);
  assert.deepEqual(KEO.compute(m).res.e, r.res.e);
});
test('100 переключений не сдвигают геометрию и КЕО; обе формы и несколько типов', () => {
  const s = sample(), original = copy(s.top.types), before = KEO.compute(s);
  for (let i = 0; i < 100; i++) {
    s.top.coordOrigin = i % 2 ? 'corner' : 'center';
    s.top.types.forEach(t => t.lanterns.forEach(l => ['x', 'y'].forEach(axis => {
      const shown = KEO.lanternCoord(s, l[axis], axis);
      near(KEO.lanternCoord(s, shown, axis, true), l[axis]);
    })));
    assert.deepEqual(s.top.types, original); assert.deepEqual(KEO.compute(s).res.e, before.res.e);
  }
});
test('Центр: отрицательные координаты, ноль, дробь с запятой и JSON round-trip', () => {
  const s = sample(); s.top.coordOrigin = 'center';
  near(KEO.lanternCoord(s, '-2,5', 'x', true), 4.695);
  near(KEO.lanternCoord(s, 0, 'y', true), 4.36);
  s.top.types[0].lanterns[0] = { x: KEO.lanternCoord(s, '-2,5', 'x', true), y: KEO.lanternCoord(s, 0, 'y', true) };
  const m = KEO.migrate(copy(s)).st;
  assert.equal(m.top.coordOrigin, 'center'); assert.deepEqual(KEO.compute(m).res.e, KEO.compute(s).res.e);
});
test('Изменение размеров в режиме центра не перемещает фонари от стен', () => {
  const s = sample(); s.top.coordOrigin = 'center'; const l = s.top.types[0].lanterns[0], x = l.x;
  s.top.L = 20; near(KEO.lanternCoord(s, l.x, 'x'), x - 10); assert.equal(l.x, x);
});
test('Пустая/нечисловая координата не превращается в ноль', () => {
  for (const v of [null, '', 'ошибка', Infinity, NaN]) {
    const s = sample(); s.top.coordOrigin = 'center';
    s.top.types[0].lanterns[0].x = KEO.lanternCoord(s, v, 'x', true);
    assert.equal(KEO.compute(s).ok, false);
  }
});
test('PDF/разбор: система координат и введённые значения', () => {
  const s = sample(); s.top.coordOrigin = 'center'; const c = KEO.compute(s);
  const text = JSON.stringify(KEO.buildModel(s, c));
  assert(text.includes('от центра помещения')); assert(text.includes('x от угла = x от центра + L/2'));
  const scheme = Schemes.topPlan({ ...KEO.topInput(s), L: +s.top.L, B: +s.top.B, y0: +s.top.y0 }, KEO.topPoints(s));
  assert(scheme.it.some(e => e.s === '+x')); assert(scheme.it.some(e => e.s === '+y'));
});
test('L>4: авто 5, ручное увеличение; 3 и некорректное число блокируются', () => {
  const s = sample(); let pts = KEO.topPoints(s); assert.equal(pts.length, 5); assert.equal(pts[0].x, 1); near(pts[4].x, s.top.L - 1);
  s.top.nPts = 9; assert.equal(KEO.compute(s).res.e.length, 9);
  for (const n of [3, 1, -1, 3.5, '', null, Infinity, 102]) { s.top.nPts = n; assert.equal(KEO.compute(s).ok, false); assert.deepEqual(KEO.topPoints(s), []); }
});
test('Граница 4 м и короткий разрез: без скрытого авто-3, с явным обоснованием', () => {
  for (const L of [3.99, 4]) {
    const s = sample(); s.top.L = L; assert.equal(KEO.compute(s).ok, false);
    s.top.nPts = 3; assert.equal(KEO.compute(s).ok, false);
    s.top.nPtsBasis = 'Контрольный пример: принято проектировщиком'; const c = KEO.compute(s); assert(c.ok);
    assert.equal(c.res.e.length, 3); assert(c.warn.some(w => w.includes('не является правилом')));
    assert(JSON.stringify(KEO.buildModel(s, c)).includes(s.top.nPtsBasis));
  }
  const s = sample(); s.top.L = 4.001; assert.equal(KEO.topPoints(s).length, 5);
});
test('L≤2: совпадающие точки не создаются даже при ручном выборе', () => {
  for (const L of [0, 1.5, 2]) { const s = sample(); Object.assign(s.top, { L, nPts: 5, nPtsBasis: 'пример' }); assert.equal(KEO.compute(s).ok, false); assert.deepEqual(KEO.topPoints(s), []); }
});
test('Политика точек общая для Б.2 и комбинированного режима', () => {
  for (const mode of ['top', 'comb']) for (const sys of ['shaft', 'b2']) {
    const s = sample(); s.mode = mode; s.top.sys = sys; s.top.nPts = 3;
    assert(KEO.compute(s).err.some(e => e.includes('не менее пяти')));
  }
});
test('Линия разреза вне помещения или нечисловая блокируется', () => {
  for (const y0 of [-0.1, 10, Infinity, 'abc']) { const s = sample(); s.top.y0 = y0; assert.equal(KEO.compute(s).ok, false); }
  const s = sample(); s.top.y0 = '1,5'; assert(KEO.compute(s).ok);
  assert(KEO.topPoints(s).every(p => p.y === 1.5)); assert.equal(KEO.b2Input(s).y0, 1.5);
});
function withLanterns(types) {
  const s = KEO.defaultState(); s.mode = 'top'; s.top.types = types; return s;
}
const round = (x, y, d = 1.5) => ({ ...KEO.defaultType(), dv: d, dn: d, lanterns: [{ x, y }] });
const rect = (x, y, a = 2, b = 2) => ({ ...KEO.defaultType(), shape: 'rect', av: a, an: a, bv: b, bn: b, lanterns: [{ x, y }] });
const overlapErrors = s => KEO.compute(s).err?.filter(e => e.includes('перекрываются') && e.includes('отверстия')) || [];
test('Ошибочный PDF: круги Ø1,5 с шагом 1 м блокируют верхний/комбинированный расчёт', () => {
  for (const mode of ['top', 'comb']) for (const coordOrigin of ['corner', 'center']) {
    const s = withLanterns([{ ...round(1.5, 3), lanterns: [{ x: 1.5, y: 3 }, { x: 2.5, y: 3 }] }]);
    s.mode = mode; s.top.coordOrigin = coordOrigin;
    const c = KEO.compute(s); assert.equal(c.ok, false); assert.equal(c.res, undefined);
    assert(overlapErrors(s)[0].includes('1.1 и 1.2')); assert(overlapErrors(s)[0].includes('верхние и нижние'));
  }
});
test('Круги: диагональный зазор и касание разрешены, малое пересечение и вложение блокируются', () => {
  assert(KEO.compute(withLanterns([round(2, 2, 2), round(3.5, 3.5, 2)])).ok); // Габаритные прямоугольники пересекаются.
  assert(KEO.compute(withLanterns([round(2, 2, 2), round(4, 2, 2)])).ok);
  assert.equal(overlapErrors(withLanterns([round(2, 2, 2), round(3.99999, 2, 2)])).length, 1);
  assert.equal(overlapErrors(withLanterns([round(3, 3, 3), round(3, 3, 1)])).length, 1);
});
test('Прямоугольники: нужны пересечения по обеим осям; ребро/угол и зазор разрешены', () => {
  for (const xy of [[5, 3], [5, 5], [3.5, 5.1]]) assert(KEO.compute(withLanterns([rect(3, 3), rect(...xy)])).ok);
  assert.equal(overlapErrors(withLanterns([rect(3, 3), rect(4.9, 4.9)])).length, 1);
  assert.equal(overlapErrors(withLanterns([rect(3, 3, 4, 4), rect(3, 3, 1, 1)])).length, 1);
});
test('Круг/прямоугольник: точный контур у угла, касание, пересечение и вложение; любой порядок типов', () => {
  for (const reverse of [false, true]) for (const [x, y, overlaps] of [[4.9, 4.9, false], [4.6, 4.8, false], [4.59, 4.79, true], [3, 3, true]]) {
    const types = [rect(3, 3), round(x, y, 2)]; if (reverse) types.reverse();
    const s = withLanterns(types); assert.equal(overlapErrors(s).length, overlaps ? 1 : 0);
    assert.equal(KEO.compute(s).ok, !overlaps);
  }
});
test('Проверяются отдельно верхние и нижние отверстия шахт', () => {
  for (const level of ['upper', 'lower']) {
    const types = [round(2, 3, 1), round(4, 3, 1)];
    types.forEach(t => { t[level === 'upper' ? 'dv' : 'dn'] = 3; });
    const message = overlapErrors(withLanterns(types))[0];
    assert(message.includes(level === 'upper' ? 'верхние отверстия' : 'нижние отверстия'));
  }
  const types = [rect(2, 3, 1, 1), rect(4, 3, 1, 1)];
  types.forEach(t => { t.an = 3; }); assert(overlapErrors(withLanterns(types))[0].includes('нижние отверстия'));
});
test('Старый JSON с дублирующим фонарём другого типа не выдаёт результат', () => {
  const s = withLanterns([round(3, 3), rect(3, 3)]); delete s.top.coordOrigin;
  const loaded = KEO.migrate(copy(s)).st;
  assert(overlapErrors(loaded)[0].includes('1.1 и 2.1')); assert.equal(KEO.compute(loaded).ok, false);
});
test('Исправленный короткий пример: два Ø1,5 с шагом 2 м, отчёт формируется', () => {
  const s = withLanterns([round(1, 3), round(3, 3)]);
  Object.assign(s.top, { L: 4, nPts: 3, nPtsBasis: 'Тестовый пример: принято проектировщиком', coordOrigin: 'center' });
  const c = KEO.compute(s); assert(c.ok); assert(KEO.buildModel(s, c).length > 0);
});
console.log(`${count}/${count} групп проверок пройдено`);
