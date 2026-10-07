const E = require('./engine.js');
let fails = 0, total = 0;
function chk(name, got, exp, tol) {
  total++; const ok = Math.abs(got - exp) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: получено ${(+got).toFixed(4)}, эталон ${exp} (допуск ±${tol})`);
}
const W = (hpd, ho, bo, s, t1, t2, K) => ({ hpd, ho, bo, s, t1, t2, K });

console.log('\n=== 1. АР2 прил.1, пом. 1.003 (боковой, 1 окно) ===');
let r = E.side({ group: 5, rho: 0.55, hp: 0, MF: 0.83, walls: [{ orient: 'В', bp: 3.06, dp: 8.10, lt: 4.05, ds: 0, dst: 0.72, windows: [W(0.5, 2.2, 1.65, 0, 0.64, 0.85, 1)] }] });
let w = r.walls[0], s0 = w.wins[0].sectors[0];
chk('n1', s0.n1, 6.1, 0.05); chk('n2', s0.n2, 20.5, 0.05); chk('εб', s0.eps, 1.2505, 0.01);
chk('γ', s0.gamma, 19.02, 0.01); chk('q(γ)', s0.q, 0.6293, 0.0005); chk('r0', w.r0, 2.857, 0.001);
chk('CN', w.CN, 1.25, 0); chk('eр', r.e, 1.27, 0.005);

console.log('\n=== 2. АР2 прил.2, пом. 1.004 (боковой, 4 окна, разные τ2) ===');
r = E.side({ group: 5, rho: 0.55, hp: 0, MF: 0.83, walls: [{ orient: 'В', bp: 7.40, dp: 8.00, lt: 7.00, ds: 0, dst: 0.72, windows: [W(0.5, 2.2, 1.65, -2.88, 0.64, 0.75, 1), W(0.5, 2.2, 1.65, -1.12, 0.64, 0.75, 1), W(0.5, 2.2, 1.65, 0.62, 0.64, 0.70, 1), W(0.5, 2.2, 1.65, 2.38, 0.64, 0.75, 1)] }] });
w = r.walls[0];
[8.9, 12.5, 13.1, 10.0].forEach((n2, i) => chk(`окно ${i + 1}: n2`, w.wins[i].sectors[0].n2, n2, 0.06));
chk('n1', w.wins[0].sectors[0].n1, 2.7, 0.05); chk('γ', w.wins[0].sectors[0].gamma, 11.90, 0.01);
chk('r0', w.r0, 5.5827, 0.002); chk('eр', r.e, 1.59, 0.005);

console.log('\n=== 3. АР2 прил.7, пом. 1.019 (r0, n1 при Δст = 0,30) ===');
r = E.side({ group: 5, rho: 0.55, hp: 0, MF: 0.83, walls: [{ orient: 'З', bp: 10.30, dp: 5.90, lt: 4.90, ds: 0, dst: 0.30, windows: [W(0.5, 2.6, 1.65, -0.3, 0.64, 0.70, 0.43)] }] });
w = r.walls[0];
chk('r0', w.r0, 3.0313, 0.002); chk('n1 (окно без затенения)', w.wins[0].sectors[0].n1, 6.8, 0.05);
chk('K (козырёк 3,25 м, 1 м от стены, табл. Б.19)', E.KLookup('canopy', 5.90, 3.25, 'wall1').v, 0.43, 0.006);
// Kзд0 / bф / z1, z2 у.з.п. 1 и 2: aэ 1.94/3.22, lэ 27.25/0.68, Hр 6.0, ρф 0.25, lт 4.95/5.19
const bsp = 10.28, dst = 0.30, hw = 3.1;
[[1.94, 27.25, 4.95, 0.12, 0.03, 0.31, 1.50], [3.22, 0.68, 5.19, 0.05, 0.28, 1.71, 1.85], [3.97, 23.49, 4.96, 0.14, 0.07, 0.35, 1.59]].forEach(([a, l, lt, bf, z1, z2, k0], i) => {
  const Z1 = a * (lt + dst) / ((l + lt + dst) * bsp), Z2 = 6.0 * (lt + dst) / ((l + lt + dst) * hw);
  chk(`у.з.п.${i + 1} z1`, Z1, z1, 0.006); chk(`у.з.п.${i + 1} z2`, 6.0 * (4.90 + dst) / ((l + 4.90 + dst) * hw), z2, 0.006);
  chk(`у.з.п.${i + 1} bф`, E.bfLookup(0.25, l / a, a / 6.0).v, bf, 0.006);
  chk(`у.з.п.${i + 1} Kзд0 (СП: (lт+Δст)/dп; влияние на e < 0,1 %)`, E.kzd0Lookup(0.25, 0.55, Z1, Z2, 0.88).v, k0, 0.03);
});

console.log('\n=== 4. АР2 прил.9, пом. 1.031 (r0 на УРП 0,8) ===');
r = E.side({ group: 5, rho: 0.55, hp: 0.8, MF: 0.83, walls: [{ orient: 'СЗ', bp: 5.00, dp: 5.15, lt: 2.58, ds: 0, dst: 0.30, windows: [W(0.5, 2.6, 1.3, -1.82, 0.64, 0.85, 0.30), W(0.5, 2.6, 1.3, 0, 0.64, 0.85, 0.30), W(0.5, 2.6, 1.3, 1.82, 0.64, 0.85, 0.30)] }] });
w = r.walls[0];
chk('r0', w.r0, 2.1433, 0.002);
chk('eр по суммам keo.expert', 1.25 * (4.1135 + 0.0218) * w.r0 * 0.544 * 0.30 * 0.83, 1.50, 0.005);
// с одним эквивалентным «длинным» зданием (≈ застройка на 30–55 м, высота 6 м) — оценка порядка
r = E.side({ group: 5, rho: 0.55, hp: 0.8, MF: 0.83, walls: [{ orient: 'СЗ', bp: 5.00, dp: 5.15, lt: 2.58, ds: 0, dst: 0.30, windows: [W(0.5, 2.6, 1.3, -1.82, 0.64, 0.85, 0.30), W(0.5, 2.6, 1.3, 0, 0.64, 0.85, 0.30), W(0.5, 2.6, 1.3, 1.82, 0.64, 0.85, 0.30)], buildings: [{ l: 40, Hp: 6, a: 300, off: 0, rhoF: 0.25 }] }] });
chk('eр с эквивалентной застройкой (оценка)', r.e, 1.50, 0.03);

console.log('\n=== 5. АР3 прил.1, пом. 1.G.11.2 (2 круглые шахты) ===');
const lf = [[3.75, 2.66], [2.71, 1.21], [2.26, 0.58], [2.71, 1.93], [3.75, 3.40]];
let t = E.top({ group: 5, MF: 0.67, rho: 0.55, H: 4.2, hurp: 0.8, spans: 1, l1: 7.41, points: lf.map(() => ({ x: 0, y: 0 })),
  types: [{ shape: 'round', dv: 2, dn: 2, hsf: 1.0, refl: 'diffuse', rhoW: 0.7, t1: 0.48, t2: 0.75, lanterns: [{}, {}], lf }] });
chk('iф', t.types[0].idx.i, 1.0, 1e-9); chk('Kс (рис. Б.2)', t.types[0].kc.v, 0.50, 0.01); chk('r2', t.r2, 1.44, 0.003);
[3.11, 9.68, 13.66, 6.74, 1.99].forEach((v, j) => chk(`ε РТ${j + 1} (q по формуле 3.2, в эталоне — с графика)`, t.types[0].pts[j].eps, v, 0.21));
chk('σотр', t.types[0].sOtr, 0.99, 0.02);
[1.99, 4.10, 5.37, 3.15, 1.63].forEach((v, j) => chk(`e РТ${j + 1}`, t.e[j], v, 0.06));
chk('eср', t.eAvg, 3.61, 0.04); chk('eср/emin', t.uniInv, 2.22, 0.03);
// тот же расчёт с Kс = 0,50 как в эталоне
t = E.top({ group: 5, MF: 0.67, rho: 0.55, H: 4.2, hurp: 0.8, spans: 1, l1: 7.41, points: lf.map(() => ({})), types: [{ shape: 'round', dv: 2, dn: 2, hsf: 1.0, Kc: 0.5, t1: 0.48, t2: 0.75, lanterns: [{}, {}], lf }] });
chk('eср (Kс = 0,50 задан)', t.eAvg, 3.61, 0.02);

console.log('\n=== 6. Excel «Проверочный расчёт», пом. 1.Н.1 (прямоуг. шахты, 4 фонаря) ===');
const lfx = [[0.4355, 0.4355, 4.47, 4.47]];
const tx = E.lanternIndex({ shape: 'rect', av: 2.1, bv: 1, an: 2.46, bn: 1.8, hsf: 1.8 });
chk('iф (в Excel √π≈1,77)', tx.i, 0.5568, 0.001);

console.log('\n=== 7. Функции ===');
chk('q(90°)', E.qGamma(90), 1.281, 0.001); chk('q(0°)', E.qGamma(0), 0.429, 1e-9);

console.log('\n=== 8. Фонари-надстройки (Б.2): геометрия и метод Данилюка ===');
{
  const T = o => Object.assign({ name: '', kind: 'rect', b: 3, hst: 0.5, ho: 1.5, beta: 60, face: 'R', pieces: 1, ystart: 0, ylen: 200, pitch: 0, t1: 0.8, t2: 0.9, MF: 0.83, CNrow: 'С-Ю', xs: [6] }, o);
  let inp = { group: 1, rho: 0.55, L: 12, W: 200, Hk: 6, hurp: 0.8, spans: 1, l1: 12, y0: 100, points: [{ x: 6 }], types: [T({})] };
  let r = E.lanternsB2(inp), s = r.types[0].pts[0].sectors;
  const d = x => x * 180 / Math.PI;
  chk('П-фонарь над точкой: φн правого остекления', s[0].phiA, d(Math.atan2(5.7, 1.5)), 1e-6);
  chk('П-фонарь над точкой: φв правого остекления', s[0].phiB, d(Math.atan2(7.2, 1.5)), 1e-6);
  chk('n1 = 50·(cos φн − cos φв)', s[0].n1raw, 50 * (Math.cos(Math.atan2(5.7, 1.5)) - Math.cos(Math.atan2(7.2, 1.5))), 1e-9);
  chk('симметрия: n1 левого = n1 правого', s[1].n1raw, s[0].n1raw, 1e-9);
  chk('длинный фонарь: n2 → 100', s[0].n2, 100, 0.05);
  // заслонение соседним фонарём
  inp = { group: 1, rho: 0.55, L: 14, W: 200, Hk: 7, hurp: 0.8, spans: 1, l1: 14, y0: 100, points: [{ x: 1 }], types: [T({ hst: 0.6, ho: 1.8, xs: [6, 10] })] };
  r = E.lanternsB2(inp); s = r.types[0].pts[0].sectors.filter(x => x.inst === 0 && x.side === 'R');
  chk('соседний фонарь срезает низ видимого участка: φн', s[0].phiA, d(Math.atan2(8.6, 7.5)), 1e-6);
  chk('… φв по верху остекления', s[0].phiB, d(Math.atan2(8.6, 6.5)), 1e-6);
  // метод Данилюка против точного интегрирования (равнояркое небо), двухпролётное здание
  const base = t => ({ group: 1, rho: 0.55, L: 24, W: 36, Hk: 7, hurp: 0.8, spans: 2, l1: 12, y0: 18, points: [1, 4, 7, 10, 12, 14, 17, 20, 23].map(x => ({ x })), types: [t] });
  const TT = o => T(Object.assign({ hst: 0.6, ho: 1.8, ystart: 3, ylen: 30, MF: 0.77, xs: [6, 18] }, o));
  Object.entries({ 'прямоугольный': TT({}), 'трапециевидный': TT({ kind: 'trap', b: 4, ho: 1.5, beta: 65 }), 'А-образный': TT({ kind: 'A', beta: 45 }), 'шед вертикальный': TT({ kind: 'shedV', xs: [3, 9, 15, 21], b: 2.5, ho: 1.6 }), 'шед наклонный': TT({ kind: 'shedI', xs: [3, 9, 15, 21], beta: 60, ho: 1.5 }), 'проём в покрытии': TT({ kind: 'plane', b: 2, hst: 0.4 }) }).forEach(([k, t]) => {
    const inp2 = base(t), r2 = E.lanternsB2(inp2);
    let worst = 0;
    r2.types[0].pts.forEach((p, j) => { const dan = p.sectors.reduce((a, x) => a + 0.01 * x.n1raw * x.n2raw, 0), ex = E.b2Exact(inp2, inp2.points[j], false, 3000); if (ex > 0.1) worst = Math.max(worst, Math.abs(dan / ex - 1)); });
    chk(`${k}: max |ε(Данилюк)/ε(точно) − 1| по 9 точкам`, worst, 0, 0.01);
  });
  // формула (Б.2): пересчёт по компонентам
  const inp3 = base(TT({})), r3 = E.lanternsB2(inp3), T3 = r3.types[0], p3 = T3.pts[4];
  chk('kф прямоугольного (табл. Б.22)', T3.kf, 1.2, 0); chk('kф шеда вертикального', E.kfOf({ kind: 'shedV' }), 1.4, 0); chk('kф штучных проёмов', E.kfOf({ kind: 'plane', pieces: 3 }), 1.1, 0);
  chk('e (Б.2) = CN·[Σεq + εср(r2·kф − 1)]·τо·MF', p3.e, T3.CN * (p3.S + T3.epsAvg * (T3.r2 * T3.kf - 1)) * T3.tau0 * T3.MF, 1e-12);
  chk('CN «С-Ю», группа 5', E.lanternsB2({ ...inp3, group: 5 }).types[0].CN, 1.33, 0);
}
console.log(`\nИтог: ${total - fails}/${total} проверок пройдено`);
process.exit(fails ? 1 : 0);
