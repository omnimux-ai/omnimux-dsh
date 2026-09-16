import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
const source=readFileSync(new URL('../plugins/omnimux-browser/extension/src/background/index.ts',import.meta.url),'utf8')
const start=source.indexOf('chrome.runtime.onMessage.addListener',source.indexOf('disarmBridgeKeepalive()\n\n//'))
const end=source.indexOf('// `settingsReady` intentionally',start)
assert.ok(start>0&&end>start)
const listenerSource=transformSync(source.slice(start,end),{loader:'ts'}).code
function mount(gatewayRpc){let listener;runInNewContext(listenerSource,{chrome:{runtime:{onMessage:{addListener:fn=>{listener=fn}}}},gatewayRpc,BRIDGE_COMPLETE_TEXT_METHOD:'bridge.completeText'});return listener}
test('copilot waits for authenticated unary body and preserves its prompt',async()=>{
 let complete;const calls=[];const listener=mount((method,payload)=>{calls.push({method,payload});return new Promise(resolve=>{complete=resolve})})
 let response;const done=new Promise(resolve=>{listener({type:'DSH_TWITTER_COPILOT_GENERATE',systemPrompt:'brief',userMessage:'hello'}, {}, value=>{response=value;resolve()})})
 await Promise.resolve();assert.equal(response,undefined);assert.equal(calls.length,1);assert.equal(calls[0].method,'bridge.completeText');assert.equal(calls[0].payload.prompt,'hello')
 complete({text:'final body'});await done;assert.equal(response.ok,true);assert.equal(response.text,'final body')
})
test('copilot returns actual completion error and rejects receipt-only result',async()=>{
 for(const rpc of [async()=>{throw Error('service unavailable')},async()=>({accepted:true})]){
 const listener=mount(rpc);const response=await new Promise(resolve=>listener({type:'DSH_TWITTER_COPILOT_GENERATE',userMessage:'hello'},{},resolve));assert.equal(response.ok,false);assert.ok(response.message.length>0)
 }
})
