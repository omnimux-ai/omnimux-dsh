import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { oneClickReplicate, resetReplicateLock } from './replicate-to-chat.js'
import { buildReplicationPrompt } from './replication.js'
const row={id:'post',local_paths:{video:'/never/use-first.mp4'},creation_reference:{id:'prepared-reference',text:'只借鉴第二张图片的画面风格。'}}
afterEach(resetReplicateLock)
function setup(overrides={}) {
 const added=[],removed=[],prefilled=[],materialized=[],events=[]
 const payloads=[{sourcePlugin:'omnimux-inspiration',kind:'document',entityId:'prepared:manifest',title:'选用参考与来源',relativePath:'assets/imported/references.md'}, {sourcePlugin:'omnimux-inspiration',kind:'image',entityId:'prepared:image2',title:'图片2',relativePath:'assets/imported/second.jpg'}]
 const io={clickNewSession:async()=>({ok:true,sessionId:'real-session'}),revealConversation(){events.push('reveal')},materializeReferences:async(input)=>{materialized.push(input);return{ok:true,attachments:payloads}},addAttachment(sessionId,payload){const attachment={id:`added-${added.length}`};added.push({sessionId,payload,...attachment});return{ok:true,attachment}},removeAttachment(sessionId,id){removed.push({sessionId,id})},prefillPrompt:async(request)=>{prefilled.push(request);const result=request.attach();return result.ok?{ok:true}:{ok:false,error:'attach-full'}},...overrides}
 return {io,added,removed,prefilled,materialized,events,payloads}
}
describe('prepared reference handoff',()=>{
 it('uses the selected saved draft instead of the legacy product template',()=>{assert.equal(buildReplicationPrompt(row),row.creation_reference.text)})
 it('materializes after formal session creation, attaches all returned files and reads back the exact draft',async()=>{const s=setup();const out=await oneClickReplicate(row,s.io);assert.equal(out.ok,true);assert.deepEqual(s.materialized,[{id:'post',sessionId:'real-session',reference_id:'prepared-reference'}]);assert.deepEqual(s.added.map(value=>value.payload.relativePath),s.payloads.map(value=>value.relativePath));assert.equal(s.prefilled[0].prompt,row.creation_reference.text);assert.equal(s.prefilled[0].requireReadback,true);assert.doesNotMatch(JSON.stringify(s.added),/never\/use-first|商品/)})
 it('does not attach or prefill when materialization fails',async()=>{const s=setup({materializeReferences:async()=>({ok:false,error:'来源已变化'})});const out=await oneClickReplicate(row,s.io);assert.equal(out.ok,false);assert.equal(s.added.length,0);assert.equal(s.prefilled.length,0)})
 it('protects an existing draft before adding any attachments',async()=>{const s=setup({prefillPrompt:async()=>({ok:false,error:'draft-protected'})});const out=await oneClickReplicate(row,s.io);assert.equal(out.ok,false);assert.equal(s.added.length,0)})
 it('rolls back only newly added attachments when a later item is refused',async()=>{const s=setup();s.io.addAttachment=(sessionId,payload)=>{if(s.added.length)return{ok:false,reason:'quota-exceeded'};const attachment={id:'owned'};s.added.push({sessionId,payload});return{ok:true,attachment}};const out=await oneClickReplicate(row,s.io);assert.equal(out.ok,false);assert.deepEqual(s.removed,[{sessionId:'real-session',id:'owned'}])})
 it('supplies a rollback if the composer rejects the write after attachment insertion',async()=>{const s=setup();s.io.prefillPrompt=async(request)=>{const result=request.attach();assert.equal(result.ok,true);result.rollback();return{ok:false,error:'composer-rejected'}};const out=await oneClickReplicate(row,s.io);assert.equal(out.ok,false);assert.equal(new Set(s.removed.map(value=>value.id)).size,2)})
 it('refuses malformed prepared data without falling back to first video',async()=>{const s=setup();const out=await oneClickReplicate({...row,creation_reference:{id:'bad',text:''}},s.io);assert.equal(out.ok,false);assert.equal(s.materialized.length,0);assert.equal(s.added.length,0)})
})

it('restores attachments only for the same exact draft this handoff actually wrote',async()=>{
 const s=setup(); const requests=[];
 s.io.prefillPrompt=async(request)=>{requests.push(request);request.attach();request.onDraftWritten();return{ok:false,error:'composer-missing'}};
 assert.equal((await oneClickReplicate(row,s.io)).ok,false);
 s.io.prefillPrompt=async(request)=>{requests.push(request);return request.attach()};
 assert.equal((await oneClickReplicate(row,s.io)).ok,true);
 assert.equal(requests[0].resumeOwnPrompt,false);assert.equal(requests[1].resumeOwnPrompt,true);
 s.io.prefillPrompt=async(request)=>{requests.push(request);return{ok:false,error:'draft-protected'}};
 assert.equal((await oneClickReplicate(row,s.io)).ok,false);assert.equal(requests.at(-1).resumeOwnPrompt,false);
})
it('does not claim an existing draft after a failed call that never wrote it',async()=>{
 const s=setup({prefillPrompt:async()=>({ok:false,error:'draft-protected'})});await oneClickReplicate(row,s.io);let captured;
 s.io.prefillPrompt=async(request)=>{captured=request;return{ok:false,error:'draft-protected'}};
 assert.equal((await oneClickReplicate(row,s.io)).ok,false);assert.equal(captured.resumeOwnPrompt,false);
})
it('does not resume its previous draft into another session or after the prepared text changes',async()=>{
 const s=setup({prefillPrompt:async(request)=>{request.onDraftWritten();return{ok:false,error:'composer-missing'}}});await oneClickReplicate(row,s.io);
 s.io.clickNewSession=async()=>({ok:true,sessionId:'different-session'});
 const captured=[];s.io.prefillPrompt=async(request)=>{captured.push(request);return{ok:false,error:'draft-protected'}};
 await oneClickReplicate(row,s.io);
 s.io.clickNewSession=async()=>({ok:true,sessionId:'real-session'});
 await oneClickReplicate({...row,creation_reference:{...row.creation_reference,text:'修改后的其他草稿'}},s.io);assert.deepEqual(captured.map(request=>request.resumeOwnPrompt),[false,false]);
})
