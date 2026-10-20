/* Development helper. Pass only the official browser client's tab CDP capability.
   Splits authorized research JSON into small messages; never opens a connection,
   navigates, reads credentials or installs an alternate browser controller. */
import {createHash,randomUUID} from 'node:crypto';
export async function putResearchJson(cdp,name,value,{chunkChars=32768}={}){
  if(!/^Keo[A-Za-z0-9_]+$/.test(name)||name==='KeoResearchJsonTransfer'||!Number.isSafeInteger(chunkChars)||chunkChars<1||chunkChars>32768)throw Error('invalid-transfer-options');
  const serialized=JSON.stringify(value);
  if(typeof serialized!=='string')throw Error('json-value-required');
  const id=randomUUID(),sha256=createHash('sha256').update(serialized).digest('hex'),parts=Math.ceil(serialized.length/chunkChars);
  const evaluate=async expression=>{
    const response=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},{timeoutMs:15000});
    if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text||'transfer-evaluation-failed');
    return response.result?.value;
  };
  await evaluate(`(()=>{if(window.KeoResearchJsonTransfer)throw Error('research-transfer-already-pending');window.KeoResearchJsonTransfer={id:${JSON.stringify(id)},parts:[],next:0};return true;})()`);
  try{
    for(let i=0;i<parts;i++){
      const chunk=serialized.slice(i*chunkChars,(i+1)*chunkChars);
      await evaluate(`(()=>{const t=window.KeoResearchJsonTransfer;if(t?.id!==${JSON.stringify(id)}||t.next!==${i})throw Error('transfer-order-mismatch');t.parts.push(${JSON.stringify(chunk)});t.next++;return t.next;})()`);
    }
    return await evaluate(`(async()=>{const t=window.KeoResearchJsonTransfer;if(t?.id!==${JSON.stringify(id)}||t.next!==${parts})throw Error('incomplete-transfer');const s=t.parts.join('');if(s.length!==${serialized.length})throw Error('transfer-length-mismatch');const bytes=new TextEncoder().encode(s),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==${JSON.stringify(sha256)}||window.KeoResearchJsonTransfer!==t)throw Error('transfer-integrity-mismatch');const value=JSON.parse(s);window[${JSON.stringify(name)}]=value;delete window.KeoResearchJsonTransfer;return {name:${JSON.stringify(name)},bytes:bytes.length,parts:${parts},sha256:hash};})()`);
  }catch(error){
    // A partial transfer must never replace the previous valid input.
    try{await evaluate(`(()=>{if(window.KeoResearchJsonTransfer?.id===${JSON.stringify(id)})delete window.KeoResearchJsonTransfer;return true;})()`);}catch{}
    throw error;
  }
}
