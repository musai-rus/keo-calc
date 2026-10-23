// Deterministic D1 graph. D0 host is embedded, so Dynamo has no sys.path dependency.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const d0 = read('d0_probe.py');
const marker = '\nif "IN" in globals():\n';
if (d0.split(marker).length !== 2) throw new Error('D0 entry marker changed; review embedding');
const source = d0.split(marker)[0] + '\n\n' + read('d1_capture.py');
const bundleHash = hash(source);
const graph = JSON.parse(read('KEO_D0_ReadOnly.dyn'));
const ids = new Map();
function collect(value) {
  if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, val]) => {
    if (['Id', 'Uuid'].includes(key) && typeof val === 'string') ids.set(val, hash('keo-d1:' + val).slice(0, 32));
    collect(val);
  });
}
function rewrite(value) {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, rewrite(val)]));
  return typeof value === 'string' && ids.has(value) ? ids.get(value) : value;
}
collect(graph);
const out = rewrite(graph);
out.Name = 'KEO D1 - Room evidence';
out.Description = 'D1 diagnostic Room evidence. Explicit test copy only; no model writes or KEO calculation.';
out.Nodes[3].Code = 'BUNDLE_SHA256 = "' + bundleHash + '"\n' + source;
out.View.NodeViews[3].Name = 'D1 - Room evidence';
out.View.NodeViews[4].Name = 'D1 run summary';
out.View.NodeViews[1].Y = 260;
out.View.NodeViews[2].Y = 410;
const target = path.join(root, 'KEO_D1_RoomEvidence.dyn');
const content = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== content) throw new Error('D1 graph differs; regenerate');
} else fs.writeFileSync(target, content, 'utf8');
console.log(JSON.stringify({graph: path.basename(target), sourceBundleSha256: bundleHash, d0Sha256: hash(d0), nodes: out.Nodes.length}));
