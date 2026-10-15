/* Назначение здания по полному списку помещений. node bim/test-purpose.js */
const assert = require('node:assert/strict'), fs = require('node:fs');
const DATA = require('../data.js');
const C = new Function(fs.readFileSync(__dirname + '/calc.js', 'utf8') + ';return BimCalc;')();
let total = 0;
function test(name, fn) { fn(); total++; console.log('OK ' + name); }
const group = id => DATA.rooms.find(r => r.id === id).g;
const infer = names => C.inferGroup(names, DATA.rooms);
const kindergarten = ['Групповая 1', 'Групповая 2', 'Спальня 1', 'Спальня 2', 'Раздевальная'];
test('ДОО определяется по совокупности помещений', () => {
  const r = infer(kindergarten); assert.equal(r.group, group('A57')); assert.equal(r.status, 'supported');
  assert.equal(r.total, 5); assert.equal(r.candidates[0].evidence.find(e => /Групповая/.test(e.name)).count, 2);
});
test('Служебные помещения и большой пищеблок не перевешивают ДОО', () => {
  const r = infer([...kindergarten, ...Array(1000).fill('Санузел'), ...Array(1000).fill('Коридор'), ...Array(1000).fill('Горячий цех')]);
  assert.equal(r.group, group('A57'));
});
for (const [name, id, names] of [
  ['школа', 'A29', ['Класс 1', 'Класс 2', 'Учительская', 'Учебный кабинет']],
  ['офис', 'A1', ['Офис', 'Переговорная', 'Бухгалтерия']],
  ['медицинская организация', 'A108', ['Палата', 'Процедурная', 'Перевязочная']],
  ['жилое здание', 'A191', ['Жилая комната', 'Кухня', 'Спальня']],
  ['гостиница', 'A106', ['Номер 101', 'Номер 102', 'Ресепшн']],
  ['торговля', 'A90', ['Торговый зал', 'Примерочная']]
]) test(name, () => assert.equal(infer(names).group, group(id)));
test('Общие названия не создают случайное назначение', () => {
  const r = infer(['Кабинет', 'Помещение 101', 'Комната', 'Коридор', 'Санузел']);
  assert.equal(r.group, null); assert.equal(r.status, 'unknown');
});
test('Пустые названия и пустая таблица обрабатываются', () => {
  assert.equal(infer(['', null, undefined]).group, null);
  assert.equal(C.inferGroup(kindergarten, []).group, null);
});
test('Один характерный Room даёт только предварительное предположение', () => {
  assert.equal(infer(['Групповая']).status, 'tentative');
});
test('Признаки разных назначений видны, первый прогон не блокируется', () => {
  const r = infer(['Групповая', 'Спальня', 'Жилая комната', 'Квартира']);
  assert.equal(r.status, 'ambiguous'); assert.ok(r.group);
  assert.ok(r.candidates.some(c => c.group === group('A57')));
});
test('Перестановка помещений и строк таблицы не меняет выбор', () => {
  const names = ['Офис', 'Палата', 'Перевязочная', 'Бухгалтерия'];
  assert.equal(C.inferGroup(names, DATA.rooms).group, C.inferGroup([...names].reverse(), [...DATA.rooms].reverse()).group);
});
test('Дополнительные одинаковые нормативные строки не дают лишних голосов', () => {
  const names = ['Офис', 'Переговорная', 'Лаборатория'];
  const rows = [...DATA.rooms, ...Array(50).fill(DATA.rooms.find(r => r.id === 'A166'))];
  assert.equal(C.inferGroup(names, rows).group, infer(names).group);
});
test('Нормы и коэффициенты не изменяются при классификации', () => {
  const before = JSON.stringify(DATA); infer(kindergarten); assert.equal(JSON.stringify(DATA), before);
  assert.equal(C.mapNorm('Групповая', DATA.rooms, group('A57')).id, 'A57');
  assert.equal(C.mapNorm('Спальня', DATA.rooms, group('A57')).id, 'A60');
});
test('Нераспознанное назначение отличается от принятого правила без нормы', () => {
  assert.equal(C.knownUnnormed('Кладовая игрушек', group('A57')), true);
  assert.equal(C.knownUnnormed('Помещение XYZ', group('A57')), false);
  assert.equal(C.knownUnnormed('Кладовая', null), false);
});
console.log(`${total}/${total} пройдено`);
