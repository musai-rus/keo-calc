'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const bridge = require('../bridge.js');
const { missingInputs } = require('./active-inputs.cjs');
const FILES = ['data.js', 'report.js', 'engine.js', 'schemes.js', 'model.js'];
const SCHEMA = 'keo-runner-preview/0.1';
const LIMIT = 2 * 1024 * 1024;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonClone = value => JSON.parse(JSON.stringify(value));

function failure(code, detail) {
  return { schema: SCHEMA, ok: false, previewOnly: true, status: 'ERROR', color: 'gray',
    errors: [{ code, detail }], previewImportJson: null };
}
function loadCore(root = path.resolve(__dirname, '../..')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'core-manifest.json'), 'utf8'));
  const context = vm.createContext({ window: {} });
  const hashes = {};
  for (const name of FILES) {
    const bytes = fs.readFileSync(path.join(root, name));
    hashes[name] = digest(bytes);
    if (hashes[name] !== manifest.files[name]) throw Error('core-hash-mismatch: ' + name);
    // Original browser sources, unchanged; module/require/network APIs are not exposed.
    new vm.Script(bytes.toString('utf8'), { filename: name }).runInContext(context, { timeout: 5000 });
  }
  const KEO = new vm.Script('KEO').runInContext(context);
  return { KEO, core: { files: hashes, sha256: digest(JSON.stringify(hashes)), sourceCommit: manifest.sourceCommit } };
}
function run(envelope, runtime = loadCore()) {
  try {
    const missing = missingInputs(envelope?.state);
    if (missing.length) return failure('missing-active-inputs', missing.join(', '));
    const input = jsonClone(envelope);
    // An absent report date must not introduce the runtime's current date into a fingerprint.
    input.state.meta = { ...input.state.meta, date: input.state.meta?.date || '' };
    const replay = bridge.replayCandidate(runtime.KEO, input);
    if (!replay.previewImportJson) return { ...failure('invalid-candidate', 'Расчётный вход отклонён'), errors: replay.errors };
    const state = JSON.parse(replay.previewImportJson);
    const result = runtime.KEO.compute(state);
    if (!Number.isFinite(result.res?.eFinal) || (result.norm.v !== null && !Number.isFinite(result.norm.v)))
      return failure('non-finite-result', 'Ядро не вернуло конечное расчётное/нормируемое значение');
    return { schema: SCHEMA, ok: true, previewOnly: true, status: 'PENDING', color: 'gray',
      room: jsonClone(input.room), core: runtime.core, inputSha256: digest(JSON.stringify(state)),
      coreResult: jsonClone(result), previewImportJson: replay.previewImportJson,
      migrationNotes: replay.migrationNotes, issues: replay.issues };
  } catch (error) { return failure('runner-error', error.message); }
}
async function cli() {
  let bytes = 0, chunks = [];
  try {
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > LIMIT) { process.stdin.destroy(); throw Error('input-too-large'); }
      chunks.push(chunk);
    }
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
    const response = run(request);
    process.stdout.write(JSON.stringify(response) + '\n');
    process.exitCode = response.ok ? 0 : 2;
  } catch (error) {
    process.stdout.write(JSON.stringify(failure('runner-protocol', error.message)) + '\n');
    process.exitCode = 2;
  }
}
if (require.main === module) cli();
module.exports = { run, loadCore, failure, FILES, SCHEMA, LIMIT };
