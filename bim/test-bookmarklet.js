/* Executes the exact installation href in fresh VMs. Not a live browser test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../docs/bim.html','utf8');
const href=html.match(/class="bm" href="([^"]+)"/)[1].replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
assert.ok(href.startsWith('javascript:'));
const source=href.slice('javascript:'.length), bundle=fs.readFileSync(__dirname+'/keo-bim.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise}};
function env(fetch){const e={fetch,AbortController,Symbol,Date,alerts:[],runs:[],alert:m=>e.alerts.push(m)};e.window=e;return vm.createContext(e)}
const response=(code,ok=true,status=200)=>({ok,status,text:async()=>code});
const app=id=>`window.KeoBim={run:async()=>runs.push(${JSON.stringify(id)})};`;
(async()=>{
 let c=env(async(url,options)=>{assert.match(url,/^https:\/\/musai-rus.github.io\/keo-calc\/keo-bim.js\?\d+$/);assert.equal(options.cache,'no-store');return response(app('fresh'))});
 await vm.runInContext(source,c);assert.deepEqual(c.runs,['fresh']);assert.equal(c.alerts.length,0);
 await vm.runInContext(source,c);assert.deepEqual(c.runs,['fresh','fresh']);
 c=env(async()=>response(app('must-not-execute'),false,503));c.KeoBim={run:()=>c.runs.push('stale')};await vm.runInContext(source,c);assert.equal(c.runs.length,0);assert.match(c.alerts[0],/HTTP 503/);
 for(const code of ['/* empty response */','<html>error</html>','window.KeoBim={};']){
  c=env(async()=>response(code));c.KeoBim={run:()=>c.runs.push('stale')};await vm.runInContext(source,c);assert.equal(c.runs.length,0);assert.equal(c.alerts.length,1);
 }
 c=env(async()=>{throw Error('network unavailable')});await vm.runInContext(source,c);assert.match(c.alerts[0],/network unavailable/);
 c=env(async()=>response('window.KeoBim={run:async()=>{throw Error("run rejected")}}'));await vm.runInContext(source,c);assert.match(c.alerts[0],/run rejected/);
 // Out-of-order network response cannot replace or start the newer application.
 const slow=deferred(),fast=deferred();let n=0,signals=[];
 c=env((u,o)=>{signals.push(o.signal);return n++===0?slow.promise:fast.promise});
 const a=vm.runInContext(source,c),b=vm.runInContext(source,c);assert.equal(signals[0].aborted,true);
 fast.resolve(response(app('new')));await b;slow.resolve(response(app('old')));await a;assert.deepEqual(c.runs,['new']);assert.equal(c.alerts.length,0);
 // Also guard a response whose body completes after the newer invocation.
 const body=deferred();n=0;c=env(async()=>n++===0?{ok:true,text:()=>body.promise}:response(app('new-body')));
 const pending=vm.runInContext(source,c);await Promise.resolve();await vm.runInContext(source,c);body.resolve(app('old-body'));await pending;assert.deepEqual(c.runs,['new-body']);
 // The shipped bundle must initialize in a clean global environment; a missing
 // Viewer stops at its explicit binding check, never at a missing helper global.
 c=env(async()=>response(bundle));c.setInterval=()=>0;c.clearInterval=()=>{};c.Autodesk={Viewing:{}};
 vm.runInContext(bundle,c);assert.equal(typeof c.KeoBim.run,'function');assert.equal(typeof c.KeoBimLib.BimSpaces.compose,'function');
 assert.throws(()=>c.KeoBimLib.BimViewerBinding.capture(c),/Откройте 3D-вид/);
 console.log('OK: installation href, fresh globals, repeat, HTTP/network/invalid body, async error, response/body races, actual bundle initialization');
})().catch(e=>{console.error(e);process.exitCode=1});
