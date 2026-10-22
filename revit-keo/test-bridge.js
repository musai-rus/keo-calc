// Run from the repository root: node revit-keo/test-bridge.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('./bridge.js');
const root = path.resolve(__dirname, '..');

// Exact production modules; this mirrors test-model.js and DOES NOT fork Engine.
global.window = global;
const sources = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  .split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n');
const { KEO } = new Function(sources + '\nreturn { KEO };')();

const input = KEO.defaultState();
Object.assign(input, { groupManual: true, group: 5, roomId: 'EXAMPLE', rtManual: 'center' });
const wall = input.side.walls[0];
Object.assign(wall, { orient: 'В', dp: 6, bp: 3.4, H: 3.3, dst: 0.4,
  t1: 0, t1c: 0.48, t2: 5, t4: 0, kType: 'manual', kManual: 0.72, kBasis: 'синтетический тест' });
wall.windows = [KEO.defaultWindow(-0.9), KEO.defaultWindow(0.9)]
  .map(w => ({ ...w, hpd: 0.8, ho: 1.8, bo: 1.5 }));

const envelope = { schema: B.CANDIDATE, room: { documentKey: 'root', uniqueId: 'synthetic-room-01' }, state: input };
const before = KEO.compute(input);
assert.equal(before.ok, true, `Synthetic state should be valid: ${(before.err || []).join('; ')}`);
const r = B.replayCandidate(KEO, envelope);
assert.equal(r.status, 'PENDING', 'Import parity is not native geometry evidence');
assert.equal(r.color, 'gray');
assert.equal(r.errors.length, 0);
assert.ok(r.previewImportJson);
const after = KEO.compute(JSON.parse(r.previewImportJson));
assert.equal(after.ok, true);
assert.deepEqual(after.res, before.res);
assert.deepEqual(after.norm, before.norm);
assert.equal(after.pass, before.pass);
assert.equal(r.coreReplay.eFinal, before.res.eFinal);
assert.deepEqual(input.side.walls[0].windows.map(x => x.bo), [1.5, 1.5], 'Input untouched');

const raw = { schema: B.SCHEMA, profile: 'horizontal-line-plan/0.1',
  sourceSnapshot: { sha256: 'a'.repeat(64) }, scope: { rooms: [
    { ref: { documentKey: 'root', uniqueId: 'UID1' } },
    { ref: { documentKey: 'root', uniqueId: 'UID2' } }
  ] } };
let d = B.inspectRawCapture(raw);
assert.equal(d.captureStructureOk, true);
assert.deepEqual(d.rooms.map(x => x.status), ['PENDING', 'PENDING']);
assert.ok(d.issues.some(x => x.code === 'geometry-not-accepted'));
assert.ok(d.issues.some(x => x.code === 'norm-not-accepted'));
// Equal display numbers must not ever be used for identity.
raw.scope.rooms.push({ ref: { documentKey: 'root', uniqueId: 'UID1' } });
d = B.inspectRawCapture(raw);
assert.equal(d.captureStructureOk, false);
assert.ok(d.issues.some(x => x.code === 'duplicate-room-identity'));
// Spoofing "executedInRevit" alone cannot turn gray into green.
raw.execution = { executedInRevit: true, readOnly: true };
assert.equal(B.inspectRawCapture(raw).status, 'PENDING');

for (const broken of [null, {}, { ...envelope, state: { v: 1 } },
  { ...envelope, room: { uniqueId: 'UID1' } }]) {
  const x = B.replayCandidate(KEO, broken);
  assert.equal(x.status, 'PENDING');
  assert.equal(x.previewImportJson, null);
}
console.log('OK revit-keo bridge: real core replay, safe gray diagnostics, invalid/duplicate identity');
