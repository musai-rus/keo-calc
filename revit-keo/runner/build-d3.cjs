'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const marker = '\nif "IN" in globals():\n';
const d0 = read('../dynamo/d0_probe.py');
if (d0.split(marker).length !== 2) throw Error('D0 entry marker changed');
const source = d0.split(marker)[0] + '\n\n' + read('client.py') + '\n\n' + read('d3_probe.py');
const graph = JSON.parse(read('../dynamo/KEO_D0_ReadOnly.dyn'));
const ids = new Map();
function collect(x) {
  if (Array.isArray(x)) x.forEach(collect);
  else if (x && typeof x === 'object') for (const [key, value] of Object.entries(x)) {
    if (['Id', 'Uuid'].includes(key) && typeof value === 'string') ids.set(value, hash('keo-d3:' + value).slice(0, 32));
    collect(value);
  }
}
function rewrite(x) {
  if (Array.isArray(x)) return x.map(rewrite);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,rewrite(v)]));
  return typeof x === 'string' && ids.has(x) ? ids.get(x) : x;
}
collect(graph);
const out = rewrite(graph);
out.Name = 'KEO D3 - Synthetic core replay';
out.Description = 'Read-only synthetic Python -> original JS core. No real Room KEO or model writes.';
out.Nodes[3].Code = 'BUNDLE_SHA256 = "' + hash(source) + '"\n' + source;
out.View.NodeViews[3].Name = 'D3 - Synthetic core replay';
out.View.NodeViews[4].Name = 'D3 summary';
const target = path.join(__dirname, 'KEO_D3_CoreReplay.dyn');
const text = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--check')) { if (read('KEO_D3_CoreReplay.dyn') !== text) throw Error('D3 graph is stale'); }
else fs.writeFileSync(target, text, 'utf8');
console.log(JSON.stringify({ bundleSha256: hash(source), nodes: out.Nodes.length, runType: out.View.Dynamo.RunType }));
