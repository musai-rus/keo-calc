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
 // Execute the real generated installer script and each resulting dragged href.
 // All regions come from the same directory as the calculator, with no group copy.
 const decode=s=>s.replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const options=[...html.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m=>({value:decode(m[1]),textContent:decode(m[2])}));
 assert.deepEqual(options.slice(1).map(o=>o.value),require('../data.js').regions.map(r=>r.name));
 const select={value:'',options,addEventListener:(event,fn)=>{assert.equal(event,'change');select.change=fn}},button={setAttribute:(name,value)=>{assert.equal(name,'href');button.href=value}},summary={};
 const installer=vm.createContext({document:{getElementById:id=>id==='bookmark-region'?select:summary,querySelector:()=>button}});
 vm.runInContext(html.match(/<!-- KEO_BOOKMARKLET_SETUP -->\s*<script>([\s\S]*?)<\/script>/)[1],installer);
 assert.equal(button.href,href);
 for(const region of require('../data.js').regions){
  select.value=region.name;select.change();assert.ok(button.textContent.includes(region.name));assert.ok(summary.textContent.includes('группа '+region.g));
  c=env(async()=>response('window.KeoBim={run:async options=>runs.push(JSON.stringify(options))}'));
  await vm.runInContext(button.href.slice(11),c);assert.deepEqual(JSON.parse(c.runs[0]),{region:region.name});assert.equal(c.alerts.length,0);
 }
 const installedHref=button.href;select.value='';select.change();assert.equal(button.href,href);assert.notEqual(installedHref,button.href);
 select.value='not in the directory';select.change();assert.equal(button.href,href);
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
