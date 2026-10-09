/* Независимая проверка геометрической части бокового КЕО (Б.1).
   Ядро считает εб = 0,01·n1·n2 по графикам Данилюка (аналитически, с округлением лучей до 0,1) и умножает на q(γ) в середине сектора (3.2).
   Здесь та же величина Σ εб·q считается численным интегрированием по видимой части проёма с той же моделью неба, что заложена в (3.2):
     q(γ) = 0,429·[1 + 4·exp(−0,7/sin γ)] — относительная яркость неба (стандартное небо МКО, тип 1), нормированная так, что
     освещённость горизонтальной плоскости открытым небосводом равна π·L̄ (2·∫ q·sinγ·cosγ dγ = 1).
     ε = (100/π)·∫∫ q(γ)·cos(i_гор)·cos(i_окно)/r² dA,  sin γ = z/r.
   Остальные множители (r0, τ0, K, CN, MF) берутся из ядра — это табличные величины, их значения и источники выводятся для ручной проверки.
   Окна стены с противостоящим зданием не сверяются (часть неба закрыта зданием — эта часть здесь не моделируется).
   Запуск: node bim/verify-side.js [state.json …]   (без аргументов — контрольные случаи АР2 прил. 1, 2; bim/verify/1226-L01.json — помещения модели 1226) */
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
global.window = global;
const src = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { Engine, KEO } = new Function(src + '\nreturn { Engine, KEO };')();

// ∫∫ по прямоугольнику y∈[y1,y2], z∈[z1,z2] на плоскости x = D (точка в начале координат, z — вверх от УРП)
const q = sg => sg <= 0 ? 0.429 : 0.429 * (1 + 4 * Math.exp(-0.7 / sg));
function skyRect(D, y1, y2, z1, z2, n = 400) {
  let s = 0; const dy = (y2 - y1) / n, dz = (z2 - z1) / n;
  for (let i = 0; i < n; i++) { const y = y1 + (i + 0.5) * dy; for (let j = 0; j < n; j++) { const z = z1 + (j + 0.5) * dz, r2 = D * D + y * y + z * z, r = Math.sqrt(r2); s += q(z / r) * D * z / (r2 * r2); } }
  return 100 * s * dy * dz / Math.PI;
}
const f = (x, n = 3) => (x === null || x === undefined || isNaN(x)) ? '—' : (+x).toFixed(n).replace('.', ',');

function check(name, st) {
  const C = KEO.compute(st); if (!C.ok) { console.log(`${name}: ошибка исходных данных — ${C.err.join('; ')}`); return null; }
  const R = C.res, inp = KEO.sideInput(st);
  console.log(`\n=== ${name} ===`);
  let eInd = 0, skipped = 0;
  R.walls.forEach((w, wi) => {
    const wi_ = inp.walls[wi];
    console.log(`Стена ${wi + 1} (${w.orient}): CN = ${f(w.CN, 2)} (СП 52, табл. 5.1), r0 = ${f(w.r0, 3)} (СП 367, табл. ${w.r0info.table}; dп/h01 ${f(w.dh, 2)}, lт/dп ${f(w.ld, 2)}, bп/dп ${f(w.bd, 2)}), MF = ${f(w.MF, 2)}; точка: lт ${f(wi_.lt, 2)}, ds ${f(wi_.ds, 2)}, Δст ${f(wi_.dst, 2)}`);
    console.log('  окно   bо×hо, hпд      τ0     K    Σεб·q (ядро)  ∫ неба (незав.)   Δ, %     e ядро   e незав.');
    w.wins.forEach((x, k) => {
      const core = x.sumSky, g = x.geo; // только небо (без противостоящих зданий)
      // противостоящее здание закрывает часть неба: этот участок здесь не интегрируется — окно не сверяется (берётся значение ядра)
      const hasB = (wi_.buildings || []).length > 0;
      const ind = hasB ? core : (g && g.y2 > g.y1 && g.z2 > g.z1) ? skyRect(g.D, g.y1, g.y2, g.z1, g.z2) : 0;
      if (hasB) skipped++;
      const eC = x.e, eI = w.CN * (ind + x.sumBld) * w.r0 * x.tau0 * x.K * w.MF; eInd += eI;
      console.log(`  ${String(k + 1).padStart(3)}   ${f(x.w.bo, 2)}×${f(x.w.ho, 2)}, ${f(x.w.hpd, 2)}   ${f(x.tau0, 3)}  ${f(x.K, 2)}   ${f(core, 4).padStart(9)}   ${f(ind, 4).padStart(12)}   ${f(core ? 100 * (core - ind) / ind : 0, 1).padStart(6)}   ${f(eC, 3).padStart(7)}   ${f(eI, 3).padStart(7)}`);
    });
  });
  const eCore = R.e;
  console.log(`Итого: e ядро ${f(eCore, 3)} %, e незав. ${f(eInd, 3)} %, Δ ${f(100 * (eCore - eInd) / eInd, 1)} %${skipped ? ` (окон с противостоящим зданием: ${skipped} — небо по ним взято из ядра, не сверено)` : ''}`);
  return { eCore, eInd };
}

const W = (hpd, ho, bo, s, t2) => ({ hpd, ho, bo, s, t2o: t2 || 0.85, tau0o: null, Ko: null });
function arState(p) {
  const st = KEO.defaultState(); st.groupManual = true; st.group = 5; st.rho = 0.55; st.roomId = 'A1'; st.hpManual = 0; st.rtManual = 'manual'; st.env = 'normal'; st.glassMult = 1;
  st.side.walls = [{ ...KEO.defaultWall(p.orient), dp: p.dp, bp: p.bp, H: 3, dst: p.dst, lt: p.lt, ds: 0, t1: 0, t1c: 0.64, t2: 0, t4: 0, kType: 'none', windows: p.windows, buildings: [] }];
  return st;
}
const files = process.argv.slice(2);
if (files.length) files.forEach(fn => { const j = JSON.parse(fs.readFileSync(fn, 'utf8')); Object.entries(j.states || { [path.basename(fn)]: j }).forEach(([k, st]) => check(k, Object.assign(KEO.defaultState(), st, { meta: KEO.defaultState().meta, rhoCalc: KEO.defaultState().rhoCalc }))); });
else {
  check('АР2 прил. 1, пом. 1.003 (эталон e = 1,27 %)', arState({ orient: 'В', dp: 8.10, bp: 3.06, lt: 4.05, dst: 0.72, windows: [W(0.5, 2.2, 1.65, 0)] }));
  check('АР2 прил. 2, пом. 1.004 (эталон e = 1,59 %)', arState({ orient: 'В', dp: 8.0, bp: 7.4, lt: 7.0, dst: 0.72, windows: [W(0.5, 2.2, 1.65, -2.88, 0.75), W(0.5, 2.2, 1.65, -1.12, 0.75), W(0.5, 2.2, 1.65, 0.62, 0.70), W(0.5, 2.2, 1.65, 2.38, 0.75)] }));
}
