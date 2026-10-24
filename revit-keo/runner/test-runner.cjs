'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run, loadCore, FILES, LIMIT } = require('./runner.cjs');
const { candidate } = require('./fixtures.cjs');
const root = path.resolve(__dirname, '../..');
global.window = global;
// Independent reference loader used by the existing calculator tests.
const reference = new Function(FILES.map(f => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n').split('\n').filter(l => !/^if ?\(typeof module/.test(l)).join('\n') + '\nreturn KEO;')();
const runtime = loadCore();
const request = () => candidate(reference);
const cli = input => spawnSync(process.execPath, [path.join(__dirname, 'runner.cjs')],
  { input, encoding: 'utf8', cwd: os.tmpdir(), timeout: 10000, maxBuffer: 20 * 1024 * 1024 });

for (const [mode, system] of [['side', 'shaft'], ['top', 'shaft'], ['top', 'b2'], ['comb', 'shaft'], ['comb', 'b2']]) {
  test(`${mode}/${system}: same full result and import as unchanged manual core`, () => {
    const input = candidate(reference, mode, system), before = JSON.stringify(input);
    const got = run(input, runtime), expected = reference.compute(reference.migrate(JSON.parse(before).state).st);
    assert.equal(got.ok, true, JSON.stringify(got.errors));
    assert.deepEqual(got.coreResult, JSON.parse(JSON.stringify(expected)));
    assert.deepEqual(reference.compute(JSON.parse(got.previewImportJson)), expected);
    assert.equal(JSON.stringify(input), before);
    assert.equal(got.color, 'gray');
    assert.equal(got.status, 'PENDING');
  });
}
test('missing active geometry is not replaced with sample defaults', () => {
  const q = request(); delete q.state.side.walls[0].windows[0].bo;
  const r = run(q, runtime);
  assert.equal(r.ok, false); assert.match(r.errors[0].detail, /windows\[0\].bo/);
  assert.equal(r.previewImportJson, null);
});
test('inactive top geometry and unused room height are not required for side/default rho', () => {
  const q = request(); q.state.top = {}; delete q.state.side.walls[0].H;
  assert.equal(run(q, runtime).ok, true);
});
test('top-only input does not require side geometry', () => {
  const q = candidate(reference, 'top'); q.state.side = { walls: [] };
  assert.equal(run(q, runtime).ok, true);
});
test('only active shaft dimensions are required', () => {
  const q = candidate(reference, 'top');
  for (const k of ['av', 'bv', 'an', 'bn']) delete q.state.top.types[0][k];
  assert.equal(run(q, runtime).ok, true);
  delete q.state.top.types[0].dv;
  assert.equal(run(q, runtime).ok, false);
});
test('no identity, unknown mode, negative opening and malformed container fail gray', () => {
  for (const change of [q => delete q.room.uniqueId, q => q.state.mode = 'unknown',
    q => q.state.side.walls[0].windows[0].bo = -1, q => q.state.side.walls = null]) {
    const q = request(); change(q); const r = run(q, runtime);
    assert.equal(r.ok, false); assert.equal(r.color, 'gray'); assert.equal(r.previewImportJson, null);
  }
});
test('synthetic PASS and FAIL never authorize Room colors, even with forged flags', () => {
  for (const norm of [0.01, 100]) {
    const q = request(); q.state.normManual = norm; q.geometryAccepted = q.normAccepted = true;
    const r = run(q, runtime);
    assert.equal(r.coreResult.pass, norm < 1); assert.equal(r.status, 'PENDING');
    assert.equal(r.previewOnly, true); assert.equal(r.color, 'gray');
  }
});
test('no norm remains provisional', () => {
  const q = request(); q.state.roomId = 'synthetic-no-norm';
  const r = run(q, runtime); assert.equal(r.ok, true); assert.equal(r.coreResult.pass, null);
});
test('Room IDs and arbitrary model labels do not change computation', () => {
  const a = request(), b = request(); b.room = { documentKey: 'another-model', uniqueId: 'unrelated-id' };
  assert.deepEqual(run(a, runtime).coreResult, run(b, runtime).coreResult);
});
test('repeat is stable and fingerprint changes on an active input', () => {
  const q = request(), a = run(q, runtime);
  assert.deepEqual(run(q, runtime), a);
  q.state.side.walls[0].windows[0].bo += 0.01;
  assert.notEqual(run(q, runtime).inputSha256, a.inputSha256);
});
test('CLI from another cwd, UTF-8 input/output and pure JSON protocol', () => {
  const r = cli(JSON.stringify(request())); assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, ''); const data = JSON.parse(r.stdout);
  assert.equal(JSON.parse(data.previewImportJson).meta.room, 'Пример');
  assert.equal(data.ok, true);
});
test('CLI malformed and oversized requests return JSON failure', () => {
  for (const input of ['{', 'x'.repeat(LIMIT + 1)]) {
    const r = cli(input); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).ok, false);
  }
});
test('modified calculator source is rejected against the pinned manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keo-core-test-'));
  try {
    for (const file of FILES) fs.copyFileSync(path.join(root, file), path.join(dir, file));
    fs.appendFileSync(path.join(dir, 'engine.js'), '\n// changed');
    assert.throws(() => loadCore(dir), /core-hash-mismatch/);
  } finally { for (const file of FILES) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); }
});
