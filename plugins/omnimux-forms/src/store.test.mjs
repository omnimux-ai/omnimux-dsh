import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDraftStore } from './store.js'
const key = { workspaceId: 'workspace-a', templateId: 'video', templateVersion: '1.0.0' }
async function fixture(t) { const dir = await mkdtemp(join(tmpdir(), 'forms-store-')); t.after(() => rm(dir, { recursive: true, force: true })); return createDraftStore(dir) }
test('persists stable values through reopening and isolates workspace and template versions', async t => {
 const store = await fixture(t)
 await store.put({ ...key, expectedRevision: 0, values: { name: 'A', video: [{ref:'opaque-1',name:'a.mp4',mimeType:'video/mp4',sizeBytes:12}] } })
 assert.equal((await store.get(key)).draft.values.name, 'A')
 assert.equal((await store.get({...key, workspaceId:'b'})).draft,null)
 assert.deepEqual(await store.get({...key, templateVersion:'2.0.0'}),{draft:null,otherVersions:['1.0.0']})
})
test('serializes writes and rejects stale concurrent revision without losing content', async t => {
 const store = await fixture(t)
 const results = await Promise.allSettled([store.put({...key,expectedRevision:0,values:{name:'first'}}),store.put({...key,expectedRevision:0,values:{name:'second'}})])
 assert.equal(results[0].status,'fulfilled'); assert.equal(results[1].reason.status,409)
 assert.equal((await store.get(key)).draft.values.name,'first')
})
test('rejects temporary URLs, unexpected metadata and path-shaped ids without writing outside storage', async t => {
 const store=await fixture(t)
 for(const ref of ['blob:temporary','data:image/png;base64,a','file:///tmp/a','https://example.com']) await assert.rejects(store.put({...key,expectedRevision:0,values:{file:[{ref,name:'a',mimeType:'image/png',sizeBytes:1}]}}))
 await assert.rejects(store.put({...key,expectedRevision:0,values:{'../x':'value'}}))
 assert.equal((await store.get(key)).draft,null)
})
