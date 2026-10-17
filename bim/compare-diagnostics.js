/* Offline evidence comparison; no replay, network, Viewer, or writes. */
const fs=require('node:fs'),vm=require('node:vm');
if(process.argv.length!==4){console.error('Usage: node bim/compare-diagnostics.js <first.json> <second.json>');process.exit(2);}
try{
 const context=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/diagnostics.js','utf8')+';globalThis.compare=BimDiagnostics.compare;',context);
 const packets=process.argv.slice(2).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
 console.log(JSON.stringify(context.compare(...packets),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
