/* Корректировка 03, п. 6: две нормы без подмены выбранного вердикта. */
const fs = require('fs'), path = require('path'), assert = require('assert');
global.window = global;
const src = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { KEO, DATA } = new Function(src + '\nreturn { KEO, DATA };')();
let count = 0;
function test(name, fn) { fn(); count++; console.log('OK  ' + name); }
for (const mode of ['side', 'top', 'comb']) for (const system of ['ЕО', 'СО']) {
  test(`${mode}/${system}: обе табличные нормы и независимый выбор`, () => {
    const s = KEO.defaultState(); s.mode = mode; s.lightSys = system;
    const original = JSON.stringify(s), n = KEO.normComparison(s), room = KEO.room(s);
    assert.equal(n.rows.length, 2);
    for (const x of n.rows) {
      const key = (mode === 'side' ? 'eSide' : 'eTop') + (x.system === 'ЕО' ? 'N' : 'C');
      assert.equal(x.tableValue, room[key]); assert.equal(x.value, room[key]);
      assert.equal(x.selected, x.system === system); assert.equal(x.manual, false);
    }
    assert.equal(JSON.stringify(s), original);
    assert.match(n.note, /не подтверждает допустимость перехода/);
  });
}
test('ручная норма не заменяет норму второй системы', () => {
  const s = KEO.defaultState(); s.lightSys = 'СО'; s.normManual = 1.23;
  const n = KEO.normComparison(s);
  assert.equal(n.rows[0].value, KEO.room(s).eSideN); assert.equal(n.rows[0].manual, false);
  assert.equal(n.rows[1].value, 1.23); assert.equal(n.rows[1].tableValue, KEO.room(s).eSideC); assert.equal(n.rows[1].manual, true);
});
test('отчёт содержит две нормы и только выбранный вердикт', () => {
  const s = KEO.defaultState(), C = KEO.compute(s), M = KEO.buildModel(s, C);
  assert(C.ok);
  const table = M.find(x => x.type === 'table' && x.title.startsWith('Нормы КЕО: ЕО и СО'));
  assert.equal(table.rows.length, 2); assert.match(table.rows[1][2], /не используется в вердикте/);
  assert.equal(M.filter(x => x.type === 'verdict').length, 1);
  assert.equal(M.find(x => x.type === 'verdict').ok, C.pass);
});
test('нет нормы: PDF не выдаёт ложное несоответствие', () => {
  const s = KEO.defaultState(); s.roomId = '__unknown__'; s.rtManual = 'center';
  const C = KEO.compute(s); assert(C.ok); assert.equal(C.pass, null);
  const M = KEO.buildModel(s, C);
  assert(!M.some(x => x.type === 'verdict'));
  assert(M.some(x => x.type === 'p' && /Соответствие не оценивалось/.test(x.text)));
  assert(!M.some(x => x.type === 'p' && /требования.*не выполняются/i.test(x.text)));
  assert(KEO.normComparison(s).rows.every(x => x.value === null && x.tableValue === null));
});
test('ручная норма выбранной системы с отсутствующим назначением', () => {
  const s = KEO.defaultState(); s.roomId = '__unknown__'; s.rtManual = 'center'; s.normManual = 1.2;
  const C = KEO.compute(s); assert(C.ok); assert.notEqual(C.pass, null);
  const M = KEO.buildModel(s, C); assert.equal(M.filter(x => x.type === 'verdict').length, 1);
  const n = KEO.normComparison(s); assert.equal(n.rows[0].value, 1.2); assert.equal(n.rows[1].value, null);
});
console.log(`\n${count}/${count} проверок пройдено`);
