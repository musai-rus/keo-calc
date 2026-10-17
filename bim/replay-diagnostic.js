/* Local replay only. No network, Viewer, file writes, or code from the packet. */
const fs = require('node:fs'), vm = require('node:vm');
if (process.argv.length !== 3) { console.error('Usage: node bim/replay-diagnostic.js <private-room-diagnostic.json>'); process.exit(2); }
// The bundle declares UI event constants at load time. Supply names only, no
// Viewer instance, geometry, property database, network or ray implementation.
const context = vm.createContext({ console, performance, Autodesk:{Viewing:{}} }); context.window = context;
vm.runInContext(fs.readFileSync(__dirname+'/keo-bim.js','utf8'),context);
const packet = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
try {
  const replay = context.KeoBim.replayDiagnostic(packet), r = replay.result;
  console.log(JSON.stringify({matches:replay.matches,mode:r.mode,e:r.comb?.eAvgR ?? r.C?.res?.eFinal ?? r.C?.res?.eAvgR,points:r.comb?.e ?? r.C?.res?.e,error:r.err || null}));
  if (!replay.matches) process.exitCode=1;
} catch (e) { console.error(e.message); process.exitCode=1; }
