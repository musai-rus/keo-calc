const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const marker = '\nif "IN" in globals():\n';
const prefix = name => {
  const text = read(name);
  if (text.split(marker).length !== 2) throw Error('Entry marker changed: ' + name);
  return text.split(marker)[0];
};
const source = prefix('d0_probe.py') + '\n\n' + prefix('d1_capture.py') + '\n\n' + read('d2_inspect.py');
const graph = JSON.parse(read('KEO_D1_RoomEvidence.dyn'));
const ids = new Map();
function walk(value) {
  if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, val]) => {
    if (['Id', 'Uuid'].includes(key) && typeof val === 'string') ids.set(val, hash('keo-d2:' + val).slice(0, 32));
    walk(val);
  });
}
function rewrite(value) {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
  return typeof value === 'string' && ids.has(value) ? ids.get(value) : value;
}
walk(graph);
const out = rewrite(graph);
out.Name = 'KEO D2 - Geometry inspection';
out.Description = 'Read-only reconnaissance; D2 geometry and KEO are NOT accepted.';
out.Nodes[3].Code = 'BUNDLE_SHA256 = "' + hash(source) + '"\n' + source;
out.View.NodeViews[3].Name = 'D2 - Geometry inspection';
out.View.NodeViews[4].Name = 'D2 run summary';
const target = path.join(__dirname, 'KEO_D2_GeometryInspection.dyn');
const content = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== content) throw Error('D2 graph is stale');
} else fs.writeFileSync(target, content, 'utf8');
console.log(JSON.stringify({bundleSha256: hash(source), nodes: out.Nodes.length, runType: out.View.Dynamo.RunType}));
