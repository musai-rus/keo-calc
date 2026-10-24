'use strict';
// SYNTHETIC ONLY. No project/family/Room identifiers or dimensions from a real model.
function candidate(KEO, mode = 'side', system = 'shaft') {
  const state = JSON.parse(JSON.stringify(KEO.defaultState()));
  Object.assign(state, { mode, groupManual: true, group: 5, roomId: 'A1', rtManual: 'center' });
  state.meta = { code: 'SYNTHETIC', object: 'Тест обмена', room: 'Пример', author: '', date: '' };
  state.top.sys = system;
  const wall = state.side.walls[0];
  Object.assign(wall, { orient: 'В', dp: 6, bp: 3.4, H: 3.3, dst: 0.4,
    t1c: 0.48, t2: 5, kType: 'manual', kManual: 0.72, kBasis: 'Синтетический тест' });
  wall.windows = [KEO.defaultWindow(-0.9), KEO.defaultWindow(0.9)];
  return { schema: 'keo-revit-input-preview/0.1',
    room: { documentKey: 'synthetic-document', uniqueId: 'synthetic-room', phase: 'synthetic-phase' }, state };
}
if (require.main === module) {
  const { loadCore } = require('./runner.cjs');
  process.stdout.write(JSON.stringify(candidate(loadCore().KEO)));
}
module.exports = { candidate };
