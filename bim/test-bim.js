/* Проверки «КЕО по модели» без Viewer: синтетические планы → растры → состав пространств → расчёт тем же ядром.
   Запуск: node bim/test-bim.js (из корня репозитория). */
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
global.window = global;
const files = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js', 'bim/spaces.js', 'bim/geom.js', 'bim/calc.js'];
const src = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { DATA, Engine, KEO, BimSpaces: SP, BimGeom: G, BimCalc: Cc } = new Function(src + '\nreturn { DATA, Engine, KEO, BimSpaces, BimGeom, BimCalc };')();

let fails = 0, total = 0;
const ok = (name, cond, info) => { total++; if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${info !== undefined ? ' — ' + info : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f3 = x => (x === null || x === undefined) ? '—' : (+x).toFixed(3);

/* ---------- синтетический план ----------
   Наружные стены 0..13 × 0..8, фасад с окнами — y = 0 (внутрь +y).
   Групповая A: x 0..6, Спальня B: x 6..13. Перегородка x = 6 от y = 8 до y = gap (gap = 0 — сплошная).
   Коридор K: y 8..10, проход из A в K без двери (x 2..3.2) — закрыт только линией разделения. */
const box = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
function plan(gap, opts = {}) {
  const phys = [...box(0, 0, 13, 10), [6, 8, 6, gap], [0, 8, 2, 8], [3.2, 8, 13, 8]];
  const lines = [];
  if (gap > 0 && opts.sepLine !== false) lines.push([6, 0, 6, gap]); // линия разделения в проходе группа—спальня
  lines.push([2, 8, 3.2, 8]);                                         // линия разделения в проходе группа—коридор
  const bx = G.bounds(phys.concat(lines));
  const Rp = G.raster(phys, 0.05, bx), R = G.raster(phys.concat(lines), 0.05, bx);
  Rp.regs.forEach(r => r && r.border && Rp.ext.add(r.id));
  return { R, Rp };
}
const U = { m2: 'autodesk.unit.unit:squareMeters-1.0.1', mm2: 'autodesk.unit.unit:squareMillimeters-1.0.1', ft2: 'autodesk.unit.unit:squareFeet-1.0.1', mm: 'autodesk.unit.unit:millimeters-1.0.1', m: 'autodesk.unit.unit:meters-1.0.1', ft: 'autodesk.unit.unit:feet-1.0.1' };
// помещение как из G.rooms: площадь и периметр — через явное преобразование единиц
function room(eid, num, name, A, P, unit = 'm', H = 3) {
  const fa = { m: 1, mm: 1e6, ft: 1 / 0.09290304 }[unit], fl = { m: 1, mm: 1e3, ft: 1 / 0.3048 }[unit];
  const a = SP.conv(A * fa, U[unit === 'm' ? 'm2' : unit + '2'], 'area'), p = SP.conv(P * fl, U[unit], 'len'), h = SP.conv(H * fl, U[unit], 'len');
  return { id: +eid, key: String(eid), eid: String(eid), level: 'L01', num, name, area: a.v, areaRaw: A * fa, areaUnit: a.unit, per: p.v, h: h.v, warn: [] };
}
const EX = rm => /коридор|холл|вестибюл|лестни/i.test(rm.name);
const rooms0 = (unit) => [room(101, '30', 'Групповая', 48, 28, unit), room(102, '84', 'Спальня', 56, 30, unit), room(103, '12', 'Коридор', 26, 30, unit)];
const keysOf = res => res.spaces.flatMap(s => s.rooms.map(r => r.key));

console.log('\n=== 1. Единицы площади: м², мм², фут² ===');
{
  const a = SP.conv(64.75, U.m2, 'area').v, b = SP.conv(64750000, U.mm2, 'area').v, c = SP.conv(64.75 / 0.09290304, U.ft2, 'area').v;
  ok('64,75 м² = 64 750 000 мм² = 696,97 фут²', near(a, 64.75, 1e-9) && near(b, 64.75, 1e-9) && near(c, 64.75, 1e-9), `${a} / ${b} / ${c}`);
  ok('длина: 3000 мм = 3 м = 9,8425 фут', near(SP.conv(3000, U.mm, 'len').v, 3, 1e-9) && near(SP.conv(3 / 0.3048, U.ft, 'len').v, 3, 1e-9));
  const u = SP.conv(64.75, 'autodesk.unit.unit:acres-1.0.1', 'area');
  ok('неизвестные единицы — значение не используется, есть предупреждение', u.v === null && !u.ok && /не распознаны/.test(u.warn), u.warn);
  const n = SP.conv(64.75, null, 'area');
  ok('единицы не указаны — не угадываем', n.v === null && /не распознаны/.test(n.warn));
  ok('нет значения', SP.conv('', U.m2, 'area').v === null);
}

console.log('\n=== 2. Сплошная перегородка и проход ===');
let P1, res1;
{
  const P = plan(0), rm = rooms0('m'); SP.matchRooms(P.R, rm);
  const res = SP.compose(P.R, P.Rp, rm, EX, null);
  const g = res.spaces.find(s => s.rooms.some(r => r.num === '30')), s = res.spaces.find(s => s.rooms.some(r => r.num === '84'));
  ok('сплошная перегородка: групповая и спальня — разные пространства', g && s && g !== s && g.rooms.length === 1 && s.rooms.length === 1, res.spaces.map(x => x.key).join(' | '));
  ok('сплошная перегородка: обе опознаны по контуру', rm[0].reg && rm[1].reg, `ΔA ${f3(rm[0].dA)} / ${f3(rm[1].dA)}`);
}
{
  P1 = plan(1.2); const rm = rooms0('m'); SP.matchRooms(P1.R, rm);
  res1 = SP.compose(P1.R, P1.Rp, rm, EX, null);
  const g = res1.spaces.find(s => s.rooms.some(r => r.num === '30'));
  ok('проход 1,2 м у витража: одно пространство «30 + 84»', g && g.rooms.length === 2 && g.rooms.some(r => r.num === '84') && g.merged && !g.manual, g && g.key);
  ok('линия разделения не стена: в Rp одна область на групповую и спальню', P1.Rp.lab[P1.Rp.regs[g.P].seed] === g.P && res1.spaces.filter(s => s.P === g.P).length === 1);
}

console.log('\n=== 3. Несколько помещений в одной области: без потерь и повторов ===');
{
  const k = keysOf(res1), u = res1.unplaced.map(r => r.key);
  ok('каждое неисключённое помещение — ровно в одном пространстве', k.length === new Set(k).size && ['101', '102'].every(x => k.includes(x)) && !u.length, k.join(','));
  // без линии разделения: в R групповая и спальня — одна область 104 м², ни одно не опознано по контуру → баланс площадей
  const P = plan(1.2, { sepLine: false }), rm = rooms0('m'); SP.matchRooms(P.R, rm);
  const res = SP.compose(P.R, P.Rp, rm, EX, null), sp = res.spaces[0];
  ok('без линии разделения: оба помещения отнесены к пространству по балансу площадей', res.spaces.length === 1 && sp.rooms.length === 2 && sp.balance.length === 2, sp && sp.key);
  ok('площадь не задваивается: сумма Revit = 48 + 56', near(sp.rooms.reduce((s, r) => s + r.area, 0), 104, 1e-9));
  // два помещения одинаковой площади — вариант не единственный: не угадываем, предлагаем пользователю
  const rmA = [room(301, '30', 'Групповая', 48, 28), room(302, '84', 'Спальня', 56, 30), room(303, '12', 'Коридор', 26, 30), room(304, '39', 'Групповая', 48, 28), room(305, '85', 'Спальня', 56, 30)];
  const PA = plan(1.2, { sepLine: false }); SP.matchRooms(PA.R, rmA);
  const ra = SP.compose(PA.R, PA.Rp, rmA, EX, null), ua = ra.unknown;
  ok('неоднозначный подбор по площади (30+84 или 39+85, все по 104 м²): помещения не назначаются, показаны варианты', !ra.spaces.some(x => x.rooms.some(r => ['30', '84', '39', '85'].includes(r.num))) && ua.length === 1 && ua[0].cands.length >= 2, ua[0] && ua[0].cands.map(c => c.label).join(' | '));
  const rb = SP.compose(PA.R, PA.Rp, rmA, EX, { assign: [{ at: ua[0].at, keys: ['301', '302'] }] });
  const sb = rb.spaces.find(x => x.rooms.some(r => r.num === '30'));
  ok('ручной выбор варианта: «30 + 84» в контуре, 39 и 85 — без контура, без повторов', sb && sb.rooms.length === 2 && !sb.unknown.length && rb.unplaced.map(r => r.num).sort().join() === '39,85' && keysOf(rb).length === 2, sb && sb.key);
  // две спальни в одном объёме — разные помещения: раздельно, вопрос пользователю
  const rmD = [room(401, '78', 'Спальня', 48, 28), room(402, '103', 'Спальня', 56, 30), room(403, '12', 'Коридор', 26, 30)];
  const PD = plan(1.2); SP.matchRooms(PD.R, rmD); const rd = SP.compose(PD.R, PD.Rp, rmD, EX, null);
  ok('две спальни с общим проходом: раздельно и отмечены для проверки', rd.spaces.length === 2 && rd.spaces.every(x => x.rooms.length === 1 && x.dup), rd.spaces.map(x => x.key).join(' | '));
  const rd2 = SP.compose(PD.R, PD.Rp, rmD, EX, { merge: [['401', '402']] });
  ok('…после решения пользователя — одно пространство', rd2.spaces.length === 1 && rd2.spaces[0].rooms.length === 2 && rd2.spaces[0].manual && !rd2.spaces[0].dup);
  // одинаковые номера на разных уровнях/моделях: ключ — ElementId, номер не ключ
  const rm2 = [room(201, '1', 'Групповая', 48, 28), room(202, '1', 'Спальня', 56, 30), room(203, '1', 'Коридор', 26, 30)];
  const P2 = plan(0); SP.matchRooms(P2.R, rm2); const r2 = SP.compose(P2.R, P2.Rp, rm2, EX, null);
  ok('одинаковые номера «1»: помещения различаются по ElementId, не теряются', keysOf(r2).sort().join(',') === '201,202', keysOf(r2).join(','));
}

console.log('\n=== 4. Коридор автоматически не объединяется ===');
{
  const g = res1.spaces.find(s => s.rooms.some(r => r.num === '30'));
  ok('коридор не в пространстве группы', !g.rooms.some(r => r.num === '12'));
  ok('коридор показан как соседнее помещение с открытым проходом', g.excludedNeighbours.some(r => r.num === '12') && g.neighbours.some(r => r.num === '12'));
  ok('коридор опознан по контуру, но отдельного пространства нет (исключён)', !res1.spaces.some(s => s.rooms.some(r => r.num === '12')));
  const rm = rooms0('m'); SP.matchRooms(P1.R, rm);
  const r = SP.compose(P1.R, P1.Rp, rm, EX, { merge: [['101', '103']], split: [] });
  const gm = r.spaces.find(s => s.rooms.some(x => x.num === '12'));
  ok('ручное решение «объединить группу с коридором» выполняется', gm && gm.manual && gm.rooms.length === 2 && gm.rooms.some(x => x.num === '30'), gm && gm.key);
  ok('после ручного объединения спальня — отдельно, без повторов', r.spaces.filter(s => s.rooms.some(x => x.num === '84')).length === 1 && keysOf(r).length === new Set(keysOf(r)).size, r.spaces.map(s => s.key).join(' | '));
  const rs = SP.compose(P1.R, P1.Rp, rm, EX, { merge: [], split: [['101', '102']] });
  ok('ручное решение «считать раздельно»', rs.spaces.length === 2 && rs.spaces.every(s => s.rooms.length === 1 && s.manual), rs.spaces.map(s => s.key).join(' | '));
}

console.log('\n=== 5. Те же результаты в мм и футах ===');
{
  const run = unit => { const rm = rooms0(unit); SP.matchRooms(P1.R, rm); return SP.compose(P1.R, P1.Rp, rm, EX, null).spaces.map(s => s.key + ':' + s.rooms.reduce((a, r) => a + r.area, 0).toFixed(6)).join('|'); };
  const m = run('m'), mm = run('mm'), ft = run('ft');
  ok('состав и площади совпадают (м / мм / фут)', m === mm && m === ft, `${m} | ${ft}`);
}

/* ---------- расчёт ---------- */
const P = P1, rmS = rooms0('m'); SP.matchRooms(P.R, rmS);
const RES = SP.compose(P.R, P.Rp, rmS, EX, null), LAB = SP.spaceLabel(P.R, P.Rp, RES.spaces);
const SPC = RES.spaces.find(s => s.rooms.some(r => r.num === '30')), IDX = RES.spaces.indexOf(SPC);
const CELLS = G.spaceCells(P.R, LAB, RES.spaces.length, 4);
const S = { rho: 0.55, t1: 3, t2: 0, t4: 0, lt1: 3, lt2: 0, lrho: 0.7, region: 'г. Москва', group: 1, bGroup: '' };
const rowG = DATA.rooms.find(r => r.id === 'A57'), rowS = DATA.rooms.find(r => r.id === 'A60');
const env = extra => ({ KEO, Engine, DATA, settings: S, floor: 0, pts: CELLS.pts[IDX], Rp: P.Rp, T: null, rows: [rowG, rowS], shade: () => ({ kDepth: 0, blds: [] }), ...extra });
// окно на фасаде y = 0: центр x, ширина w, подоконник 0,8, высота 1,8
const win = (id, x, w) => ({ id, cat: 'Revit Windows', c: [x, 0], t: [1, 0], n: [0, 1], nin: [0, 1], w, d: 0.05, z0: 0.8, z1: 2.6, dIn: 0.05, dOut: 0.05, dst: 0.4 });

console.log('\n=== 6. Метка пространства и видимость окон ===');
{
  const sepCell = (() => { const i = Math.floor((6 - P.R.minx) / P.R.cell), j = Math.floor((0.6 - P.R.miny) / P.R.cell); for (let di = -2; di <= 2; di++) if (P.R.lab[j * P.R.W + i + di] === 0 && P.Rp.lab[j * P.R.W + i + di] > 0) return j * P.R.W + i + di; return -1; })();
  ok('клетки линии разделения отнесены к пространству', sepCell >= 0 && LAB[sepCell] === IDX);
  const A = [3, 4];
  const full = SP.visibleParts(P.Rp, A, [3, 0.05], [1, 0], 1.5).reduce((s, q) => s + q.b - q.a, 0);
  ok('окно перед точкой видно полностью', near(full, 1.5, 0.01), f3(full));
  const part = SP.visibleParts(P.Rp, A, [7.5, 0.05], [1, 0], 3).reduce((s, q) => s + q.b - q.a, 0);
  ok('окно спальни за перегородкой видно частично (перегородка — препятствие после объединения)', part > 0.2 && part < 2.8, `видно ${f3(part)} из 3 м`);
  const hid = SP.visibleParts(P.Rp, A, [11, 0.05], [1, 0], 2).reduce((s, q) => s + q.b - q.a, 0);
  ok('дальнее окно спальни закрыто перегородкой', hid < 0.05, f3(hid));
  const PnoWall = plan(8); // перегородки нет совсем
  const free = SP.visibleParts(PnoWall.Rp, A, [11, 0.05], [1, 0], 2).reduce((s, q) => s + q.b - q.a, 0);
  ok('без перегородки то же окно видно', near(free, 2, 0.01), f3(free));
}

console.log('\n=== 7. Боковое освещение объединённого пространства ===');
let rSide;
{
  rSide = Cc.space(SPC, [win(1, 3, 1.5), win(2, 9, 1.5), win(3, 11, 1.5)], [], env());
  ok('режим — боковое, расчёт выполнен', rSide.mode === 'side' && rSide.C && rSide.C.ok, rSide.err || (rSide.C && rSide.C.err));
  const W = rSide.st.side.walls[0];
  const bo = W.windows.reduce((s, x) => s + x.bo, 0);
  ok('окна за перегородкой не попадают в расчёт целиком', bo < 4.5 - 0.3, `учтено bо = ${f3(bo)} из 4,5 м`);
  ok('норма — наибольшая из норм помещений (групповая / спальня)', rSide.row && rSide.row.eSideN === Math.max(rowG.eSideN, rowS.eSideN), rSide.row && rSide.row.id);
  ok('есть пояснение о частично закрытом окне', rSide.notes.some(n => /виден из точки|закрыт/.test(n)), rSide.notes.join(' / '));
  // расчётная точка — в помещении, определяющем норму (групповая), а не в середине объединённого пространства
  const regPts = id => { const o = []; for (let j = 0; j < P.R.H; j += 4) for (let i = 0; i < P.R.W; i += 4) if (P.R.lab[j * P.R.W + i] === id) o.push([P.R.minx + (i + 0.5) * P.R.cell, P.R.miny + (j + 0.5) * P.R.cell]); return o; };
  const rG = Cc.space(SPC, [win(1, 3, 1.5), win(2, 9, 1.5), win(3, 11, 1.5)], [], env({ roomPts: rm => regPts(rm.reg) }));
  ok('точка бокового света — в групповой (x < 6), с пояснением', rG.A[0] < 6 && rG.notes.some(n => /определяющем норму/.test(n)), `A = (${f3(rG.A[0])}; ${f3(rG.A[1])})`);
  // основная стена + небольшое окно в торцевой стене: точка по правилу основной стены (1 м от дальней стены), вклад торцевого окна учтён
  const side = { id: 9, cat: 'Revit Windows', c: [0, 4], t: [0, 1], n: [1, 0], nin: [1, 0], w: 0.5, d: 0.05, z0: 0.8, z1: 2.6, dIn: 0.05, dOut: 0.05, dst: 0.4 };
  const rS = Cc.space(SPC, [win(1, 3, 1.5), win(2, 9, 1.5), side], [], env({ roomPts: rm => regPts(rm.reg) }));
  ok('малое торцевое окно не переводит точку в центр: lт = dп − 1 по основной стене', rS.C.ok && !rS.multi && rS.st.side.walls.length === 2 && near(rS.st.side.walls[0].lt, rS.st.side.walls[0].dp - 1, 0.15), rS.st.side.walls.map(w => `${w.orient}: lт ${w.lt}, dп ${w.dp}`).join('; '));
  ok('ширина bп — по сечению через точку до перегородки (6 м), а не по всему пространству (13 м)', near(rG.st.side.walls[0].bp, 6, 0.15), `bп = ${rG.st.side.walls[0].bp}`);
  const sw = SP.sectionWidth(P.Rp, [3, 4], [1, 0], [0, 1]);
  // колонна 0,4×0,4 м в сечении: пропускается; перегородка и наружная стена — границы
  const physC = [...box(0, 0, 13, 10), [6, 8, 6, 1.2], [0, 8, 2, 8], [3.2, 8, 13, 8], ...box(4.5, 3.9, 4.9, 4.3)];
  const RpC = G.raster(physC, 0.05, G.bounds(physC)); RpC.regs.forEach(r => r && r.border && RpC.ext.add(r.id));
  const swC = SP.sectionWidth(RpC, [3, 4.1], [1, 0], [0, 1]);
  ok('сечение: колонна пропускается, стена и перегородка — границы', near(sw[0] + sw[1], 6, 0.1) && near(swC[0] + swC[1], 6, 0.1), `без колонны ${f3(sw[0] + sw[1])}, с колонной ${f3(swC[0] + swC[1])}`);
  // то же вручную в калькуляторе: состояние из модели пересчитывается тем же ядром
  const C2 = KEO.compute(JSON.parse(JSON.stringify(rSide.st)));
  ok('ручной пересчёт состояния в калькуляторе даёт то же e', C2.ok && near(C2.res.eFinal, rSide.C.res.eFinal, 1e-9), `${f3(rSide.C.res.eFinal)} = ${f3(C2.ok && C2.res.eFinal)}`);
}

console.log('\n=== 8. Верхнее и комбинированное освещение ===');
{
  const lan = (x, y, a, b, extra) => ({ id: 900 + x, cat: 'Revit Windows', type: 'Зенитный фонарь', roof: true, c: [x, y], t: [1, 0], n: [0, 1], av: a, bv: b, z0: 4.2, z1: 4.4, tilt: 0, H: 3.6, hsf: 0.6, ...extra });
  const L2 = [lan(3, 4, 1.5, 1.5), lan(9.5, 4, 1.5, 1.5)];
  const rTop = Cc.space(SPC, [], L2, env());
  ok('только фонари → верхнее (Б.3), расчёт выполнен', rTop.mode === 'top' && rTop.C.ok, rTop.err || (rTop.C.err || []).join());
  ok('два одинаковых фонаря — один тип, две позиции', rTop.st.top.types.length === 1 && rTop.st.top.types[0].lanterns.length === 2);
  ok('несколько расчётных точек (характерный разрез)', rTop.pts.length >= 3 && rTop.C.res.e.length === rTop.pts.length, `${rTop.pts.length} точек`);
  ok('норма — графа верхнего/комбинированного освещения', rTop.C.norm.v === Math.max(rowG.eTopN, rowS.eTopN), `${rTop.C.norm.v}`);
  // контроль переноса фонарей в систему координат пространства: тот же расчёт, введённый «руками»
  const fr = Cc.planFrame(CELLS.pts[IDX]);
  const st = KEO.defaultState(); st.mode = 'top'; st.roomId = rTop.row.id; st.bType = rTop.row.g; st.rho = 0.55;
  st.top = { sys: 'shaft', L: +fr.L.toFixed(2), B: +fr.B.toFixed(2), H: 3.6, spans: 1, l1: null, y0: null, nPts: 0, b2: [],
    types: [{ name: 'Ф', shape: 'rect', av: 1.5, bv: 1.5, an: 1.5, bn: 1.5, dv: 1, dn: 1, hsf: 0.6, refl: 'diffuse', rhoW: 0.7, t1: DATA.tau1[3].v, t2: DATA.tau2[0].v, t3: 1, t4: 1, net: false, tilt: 0,
      lanterns: L2.map(l => { const q = fr.toLocal(l.c); return { x: +q[0].toFixed(2), y: +q[1].toFixed(2) }; }) }] };
  const Cm = KEO.compute(st);
  ok('верхний свет: совпадает с ручным вводом в калькулятор', Cm.ok && near(Cm.res.eAvgR, rTop.C.res.eAvgR, 1e-9), `${f3(rTop.C.res.eAvgR)} = ${f3(Cm.ok && Cm.res.eAvgR)}`);

  const L3 = [...L2, lan(6.5, 6, 1.0, 2.0), lan(11, 6, 1.5, 1.5, { shaded: 'над фонарём непрозрачная конструкция' })];
  const rT3 = Cc.space(SPC, [], L3, env());
  ok('фонари разных размеров — разные типы', rT3.st.top.types.length === 2);
  ok('затенённый фонарь не учитывается, есть пояснение', rT3.st.top.types.reduce((s, t) => s + t.lanterns.length, 0) === 3 && rT3.notes.some(n => /не учтён/.test(n)));
  const rMiss = Cc.space(SPC, [], [lan(3, 4, 1.5, 1.5, { H: undefined, hsf: undefined })], env());
  ok('нет данных о шахте и высоте — допущения показаны явно', rMiss.C.ok && rMiss.notes.filter(n => /допущение/.test(n)).length >= 2, rMiss.notes.filter(n => /допущение/.test(n)).join(' / '));
  const rAll = Cc.space(SPC, [], [lan(3, 4, 1.5, 1.5, { shaded: 'перекрыт' })], env());
  ok('все фонари затенены, окон нет — расчёт не выполняется', !!rAll.err, rAll.err);

  const rC = Cc.space(SPC, [win(1, 3, 1.5), win(2, 9, 1.5)], L2, env());
  ok('окна + фонари → комбинированное (Б.4)', rC.mode === 'comb' && rC.comb, rC.err);
  const c = rC.comb;
  ok('e = eв + eб в каждой точке (без двойного учёта)', c.e.every((e, j) => near(e, c.eTop[j] + c.eSide[j], 1e-12)) && c.eTop.every((e, j) => near(e, rTop.C.res.e[j], 1e-12)));
  ok('eб в точке ≥ 0, eср по Б.10', c.eSide.every(e => e >= 0) && near(c.eAvg, Engine.avgB10(c.e), 1e-12), `eср = ${f3(c.eAvg)}, eв ср = ${f3(rTop.C.res.eAvg)}`);
  ok('комбинированное ≥ только верхнего', c.eAvg >= rTop.C.res.eAvg - 1e-12);
  ok('итог — норма и равномерность', typeof c.uniOk === 'boolean' && c.norm.v === rTop.C.norm.v);
}

console.log(`\n${fails ? 'ЕСТЬ ОШИБКИ' : 'Все проверки пройдены'}: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
