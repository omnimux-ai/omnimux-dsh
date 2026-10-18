import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLocalStore } from './local-store.js'
import { analysisInputFingerprint } from './analysis-input.js'
import { createEmptyCreationDraft, reconcileCreationDraft } from './creation-draft.js'
import { handleSaveCreationDraft, handlePrepareCreationReferences, handleMaterializeCreationReferences } from './creation-handlers.js'
const temporary = []
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function setup() {
 const dir = mkdtempSync(join(tmpdir(), 'creation-handlers-')); temporary.push(dir)
 const paths = { dir, libraryFile: join(dir, 'library.json'), mediaDir: join(dir, 'media'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images'), coversDir: join(dir, 'media/covers') }
 const store = createLocalStore({ paths }); const row = store.add({ id: 'post', title: '实际参考', content: '只选这段正文', source_url: 'https://x.com/a/status/1', media_items: [{type:'image',url:'/omnimux/inspiration/local/media/images/one.jpg'}, {type:'image',url:'/omnimux/inspiration/local/media/images/two.jpg'}] })
 writeFileSync(join(paths.imagesDir, 'one.jpg'), 'first image'); writeFileSync(join(paths.imagesDir, 'two.jpg'), 'selected second image')
 store.update(row.id, { local_paths: { image_1: join(paths.imagesDir, 'one.jpg'), image_2: join(paths.imagesDir, 'two.jpg') } })
 const calls = []; const attachments = { registerSource(plugin, root) { calls.push({ plugin, root }) }, async materializeProduced(input) { calls.push(input); return { results: input.files.map((file,index) => ({ ok: true, relativePath: `assets/imported/reference_${index}${file.path.endsWith('.md') ? '.md' : '.jpg'}`, title: file.title, extension: file.path.endsWith('.md') ? 'MD' : 'JPG', kind: file.path.endsWith('.md') ? 'document' : 'image', size: 10 })) } } }
 const ctx = { id: row.id, store, paths, composerAttachments: () => attachments }
 const draft = (patch = {}) => reconcileCreationDraft(store.get(row.id), createEmptyCreationDraft(store.get(row.id)), { references: [{kind:'body'}], ...patch })
 return { ctx, store, paths, calls, attachments, draft }
}
const request = (ctx, body) => ({ ...ctx, req: { body } })
describe('saved creation references', () => {
 it('persists a draft and returns the complete item without invoking a creator', async () => { const s=setup(); const out=await handleSaveCreationDraft(request(s.ctx,{draft:s.draft()})); assert.equal(out.status,200); assert.equal(s.store.get('post').creation_draft.text,s.draft().text); assert.equal(out.body.data.content,'只选这段正文'); assert.equal(s.calls.length,0) })
 it('prepares body-only source documentation without attaching unselected images', async () => { const s=setup(); const out=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft()})); assert.equal(out.status,200); const ref=out.body.data.creation_reference; assert.ok(ref.id); const files=Object.values(s.store.get('post').local_paths).filter(path=>path.includes(ref.id)); const manifest=files.find(path=>path.endsWith('.md')); assert.match(readFileSync(manifest,'utf8'),/只选这段正文/); assert.equal(files.filter(path=>/\.jpg$/.test(path)).length,0); assert.equal(s.calls.length,0) })
 it('copies only image two and materializes the saved handle using real relative paths', async () => { const s=setup(); const out=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft({references:[{kind:'media',media_index:1}]})})); assert.equal(out.status,200); const reference_id=out.body.data.creation_reference.id; const result=await handleMaterializeCreationReferences(request(s.ctx,{sessionId:'session-real',reference_id,files:[{path:'/etc/passwd'}]})); assert.equal(result.status,200); assert.equal(result.body.attachments.length,2); const call=s.calls.find(value=>value.files); const image=call.files.find(file=>!file.path.endsWith('.md')); assert.equal(readFileSync(image.path,'utf8'),'selected second image'); assert.ok(result.body.attachments.every(file=>file.relativePath.startsWith('assets/imported/'))); assert.ok(call.files.every(file=>!file.path.includes('/etc/'))) })
 it('uses saved current analysis rather than a client supplied snapshot', async () => { const s=setup(); const target={scope:'body',directions:['creative']}; const entry={...target,status:'done',source:'live',input_fingerprint:analysisInputFingerprint(s.store.get('post'),target),result:{markdown:'真正的保存分析'},model:'fixture-model'}; s.store.update('post',{analysis_results:{body:entry}}); const out=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft({references:[{kind:'analysis',scope:'body',input_fingerprint:entry.input_fingerprint,result_snapshot:{markdown:'恶意伪造'}}]})})); assert.equal(out.status,200); const manifest=Object.values(s.store.get('post').local_paths).find(path=>path.endsWith('.md')); assert.match(readFileSync(manifest,'utf8'),/真正的保存分析/); assert.doesNotMatch(readFileSync(manifest,'utf8'),/恶意伪造/) })
 it('rejects a stale handle after the draft or selected input changed', async () => { const s=setup(); const out=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft()})); const reference_id=out.body.data.creation_reference.id; s.store.update('post',{content:'正文已变'}); const result=await handleMaterializeCreationReferences(request(s.ctx,{sessionId:'session',reference_id})); assert.equal(result.status,409); assert.equal(s.calls.length,0) })
 it('refuses forged handles and changed produced bytes', async () => { const s=setup(); assert.equal((await handleMaterializeCreationReferences(request(s.ctx,{sessionId:'session',reference_id:'../../bad'}))).status,400); const out=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft()})); const reference_id=out.body.data.creation_reference.id; const manifest=Object.values(s.store.get('post').local_paths).find(path=>path.endsWith('.md')); writeFileSync(manifest,'changed'); const result=await handleMaterializeCreationReferences(request(s.ctx,{sessionId:'session',reference_id})); assert.equal(result.status,409); assert.equal(s.calls.length,0) })
 it('does not report complete attachments when hub returns a partial failure', async () => { const s=setup(); const out=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft({references:[{kind:'media',media_index:1}]})})); s.attachments.materializeProduced=async()=>({results:[{ok:true,relativePath:'assets/imported/a.md'},{ok:false,error:'disk-space-insufficient'}]}); const result=await handleMaterializeCreationReferences(request(s.ctx,{sessionId:'session',reference_id:out.body.data.creation_reference.id})); assert.equal(result.status,502); assert.equal(result.body.attachments,undefined) })
 it('reuses an unchanged prepared reference and its stable materialization request id', async () => { const s=setup(); const first=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft()})); const second=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft()})); assert.equal(second.body.data.creation_reference.id,first.body.data.creation_reference.id); const body={sessionId:'session',reference_id:first.body.data.creation_reference.id}; await handleMaterializeCreationReferences(request(s.ctx,body)); await handleMaterializeCreationReferences(request(s.ctx,body)); assert.equal(s.calls.filter(value=>value.files)[0].requestId,s.calls.filter(value=>value.files)[1].requestId) })
 it('rejects cancellation without saving or leaving preparation files', async () => { const s=setup(); const controller=new AbortController(); controller.abort(); await assert.rejects(handlePrepareCreationReferences(request({...s.ctx,signal:controller.signal},{draft:s.draft()})),{name:'AbortError'}); assert.equal(s.store.get('post').creation_reference,undefined); const root=join(s.paths.videosDir,'creation-references'); assert.deepEqual(existsSync(root)?readdirSync(root):[],[]) })
 it('does not overwrite a newer saved draft while reference files are preparing', async () => {
  const s=setup(); const draft=s.draft(); const pending=handlePrepareCreationReferences(request(s.ctx,{draft}));
  const changed=reconcileCreationDraft(s.store.get('post'),draft,{manual:true,text:'刚刚修改的新草稿'});
  s.store.update('post',{creation_draft:changed});
  const out=await pending; assert.equal(out.status,409); assert.equal(s.store.get('post').creation_draft.text,'刚刚修改的新草稿');
  assert.equal(s.store.get('post').creation_reference,undefined);
  assert.deepEqual(readdirSync(join(s.paths.videosDir,'creation-references')),[]);
 })
 it('does not return attachments after the saved draft changes during the copy', async () => {
  const s=setup(); const prepared=await handlePrepareCreationReferences(request(s.ctx,{draft:s.draft()}));
  s.attachments.materializeProduced=async(input)=>{
   s.store.update('post',{creation_draft:reconcileCreationDraft(s.store.get('post'),s.store.get('post').creation_draft,{manual:true,text:'交接途中修改'})});
   return{results:input.files.map(()=>({ok:true,relativePath:'assets/imported/source.md'}))};
  };
  const result=await handleMaterializeCreationReferences(request(s.ctx,{sessionId:'session',reference_id:prepared.body.data.creation_reference.id}));
  assert.equal(result.status,409); assert.equal(result.body.attachments,undefined);
 })

})
