/* Диагностическая геометрия плана: без изменения расчётных формул. */
const assert = require('node:assert/strict');
const Schemes = require('./schemes');
const base = { dp: 6, bp: 5, dst: 0.4, lt: 3, ds: 0.5, hp: 0.8, windows: [{ s: 0, bo: 2, hpd: 1, ho: 1.5 }], buildings: [] };
const sc = Schemes.sidePlan({ ...base, buildings: [{ l: 8, a: 6, off: 1.5 }, { l: 2, a: 2, off: -4 }] });
const fs = sc.it.filter(x => x.t === 'line' && x.c === 'bld');
assert.deepEqual(fs.map(f => [f.x1, f.y1, f.x2, f.y2]), [[-8.4, -1, -8.4, 5], [-2.4, -4.5, -2.4, -2.5]]);
assert(sc.it.some(x => x.t === 'dimv' && x.s === 'Δs = 0,50' && x.y1 === 0 && x.y2 === 0.5));
assert(sc.it.some(x => x.s === 'Центр от оси через А: 1,50 м (не Δs)'));
for (const f of fs) for (const [x, y] of [[f.x1, f.y1], [f.x2, f.y2]]) assert(x >= sc.box[0] && x <= sc.box[2] && y >= sc.box[1] && y <= sc.box[3]);
const moved = Schemes.sidePlan({ ...base, ds: 1.5, buildings: [{ l: 8, a: 6, off: 1.5 }] });
assert.equal(moved.it.find(x => x.c === 'bld').y1, 0); // off relative to A, as in sideSectors.
assert.equal(Schemes.sidePlan(base).it.filter(x => x.c === 'bld').length, 0);
assert.equal(Schemes.sidePlan({ ...base, buildings: [{ l: -1, a: 5 }, { l: 1, a: NaN }, { l: 1, a: 1, off: Infinity }] }).it.filter(x => x.c === 'bld').length, 0);
assert(Schemes.sideSection(base).it.some(x => x.s && x.s.includes('H не задана, потолок условный')));
assert(!Schemes.sideSection({ ...base, H: 3 }).it.some(x => x.s && x.s.includes('потолок условный')));
for (const input of [base, { ...base, buildings: [{ l: 100, a: 80, off: -70 }] }]) {
  const svg = Schemes.toSVG(Schemes.sidePlan(input));
  assert(!/NaN|Infinity/.test(svg));
}
console.log('side-plan-review: 10 проверок пройдены');
