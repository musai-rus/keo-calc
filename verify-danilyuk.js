/* Сверка чисел лучей с эталоном и считывание по графикам Данилюка I и II.
   Вход: verify/danilyuk-ref.json — исходные данные помещений АР2 (файл, страницы, геометрия, коэффициенты) и значения эталона.
   Выход: таблица сравнения в консоли и verify/danilyuk-out.json (значения ядра, отсчёты по графикам, расхождения).
   Запуск: node verify-danilyuk.js */
const fs = require('fs'), path = require('path');
global.window = global;
const src = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { KEO } = new Function(src + '\nreturn { KEO };')();
const f = (x, n = 2) => (x === null || x === undefined || isNaN(x)) ? '—' : (+x).toFixed(n).replace('.', ',');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'verify/danilyuk-ref.json'), 'utf8')), out = {};
Object.entries(ref).forEach(([name, o]) => {
  const st = KEO.migrate(o.state).st, C = KEO.compute(st);
  console.log(`\n=== ${name} — ${o.ref.file}, ${o.ref.pages} ===`);
  if (!C.ok) { console.log('ошибка исходных данных: ' + C.err.join('; ')); return; }
  const w = C.res.walls[0], rows = [];
  console.log('проём  n1: эталон / ядро (до окр.) / график   n2: эталон / ядро (до окр.) / график    γ: эталон / ядро   q: эталон / ядро   εq: эталон / ядро');
  w.wins.forEach((x, i) => {
    st.dan = { wall: 0, win: i, sec: 0 };
    const dc = KEO.danCheck(st, C), s = x.sectors[0], g = dc.d.list[0], r = o.ref.sectors[i];
    const row = { win: i + 1, ref: { n1: r[1], n2: r[2], eps: r[3], gamma: r[4], q: r[5], eq: r[6] }, core: { n1raw: s.n1raw, n1: s.n1, n2raw: s.n2raw, n2: s.n2, eps: s.eps, gamma: s.gamma, q: s.q, eq: s.eps * s.q }, graph: { n1: g.n1g, n2: g.n2g, read1: [g.r1a, g.r1b], read2: [g.r2a, g.r2b], R: g.R } };
    row.diff = { n1: +(s.n1 - r[1]).toFixed(1), n2: +(s.n2 - r[2]).toFixed(1), n1graph: +(g.n1g - r[1]).toFixed(1), n2graph: +(g.n2g - r[2]).toFixed(1) };
    rows.push(row);
    console.log(`  ${i + 1}     ${f(r[1], 1)} / ${f(s.n1raw, 3)} → ${f(s.n1, 1)} / ${f(g.n1g, 1)}        ${f(r[2], 1)} / ${f(s.n2raw, 3)} → ${f(s.n2, 1)} / ${f(g.n2g, 1)}       ${f(r[4], 2)} / ${f(s.gamma, 2)}    ${f(r[5], 4)} / ${f(s.q, 4)}    ${f(r[6], 4)} / ${f(s.eps * s.q, 4)}`);
  });
  console.log(`e: эталон ${f(o.ref.e)} %, расчёт ${f(C.res.eFinal)} % (${f(C.res.e, 4)})`);
  out[name] = { ref: o.ref, rows, e: C.res.e, eR: C.res.eFinal, r0: w.r0, CN: w.CN, MF: w.MF, tau0: w.wins.map(x => x.tau0), K: w.wins.map(x => x.K) };
});
fs.writeFileSync(path.join(__dirname, 'verify/danilyuk-out.json'), JSON.stringify(out, null, 1));
