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
console.log(`${count}/${count} групп проверок пройдено`);
