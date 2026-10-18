import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher } from './http-routes.js'
import { analysisInputFingerprint, sourceFingerprint } from './analysis-input.js'
import { analyzeInspirationVideo } from './analyzer.js'
import { handleGetItem } from './http-handlers.js'

const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function world(execute = async () => ({ mode: 'live', model: 'test-model', text: '## 摘要\n来自实际输入的分析。' })) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'inspiration-scope-'))); dirs.push(dir)
  const paths = { dir, libraryFile: join(dir, 'library.json'), mediaDir: join(dir, 'media'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images'), coversDir: join(dir, 'media/covers') }
  for (const root of [paths.videosDir, paths.imagesDir, paths.coversDir]) mkdirSync(root, { recursive: true })
  const video = join(paths.videosDir, 'first.mp4'); const second = join(paths.videosDir, 'second.mp4'); const image = join(paths.imagesDir, 'photo.jpg')
  for (const path of [video, second, image]) writeFileSync(path, 'saved asset')
  const store = createLocalStore({ paths })
  const row = store.add({ title: '短标题', content: '完整原始正文\n第二段，保留原文', type: 'video', source_url: 'https://x.com/creator/status/12345', local_paths: { video, video_2: second, image_1: image }, media_items: [
    { type: 'video', url: '/omnimux/inspiration/local/media/videos/first.mp4' },
    { type: 'image', url: '/omnimux/inspiration/local/media/images/photo.jpg' },
    { type: 'video', url: '/omnimux/inspiration/local/media/videos/second.mp4' },
  ] })
  const calls = []
  const dispatcher = createLocalInspirationDispatcher({ localStore: store, textComplete: { execute: async (args, exec) => { calls.push({ args, exec }); return execute(args, exec) } } })
  const send = (action, body, signal) => dispatcher.dispatch({ method: 'POST', url: `/omnimux/inspiration/local/${row.id}/${action}`, body, signal })
  return { paths, row, store, calls, send, video, second, image }
}

describe('scoped post analysis', () => {
  it('persists the real service failure and clears it after a successful retry', async () => {
    let ready = false
    const w = world(async () => {
      if (!ready) throw Object.assign(new Error('素材理解服务尚未确认，请选择分析服务'), { code: 'analysis-service-unconfigured' })
      return { mode: 'live', model: 'fixture-model', text: '## 摘要\n已恢复的分析。' }
    })
    const failed = await w.send('analyze', { scope: 'post' })
    assert.equal(failed.status, 502)
    assert.equal(failed.body.error, '素材理解服务尚未确认，请选择分析服务')
    const stored = createLocalStore({ paths: w.paths }).get(w.row.id).analysis_results.post
    assert.equal(stored.error_code, 'analysis-service-unconfigured')
    assert.doesNotMatch(stored.error, /API Key/)
    ready = true
    const success = await w.send('analyze', { scope: 'post' })
    assert.equal(success.status, 200)
    assert.equal(success.body.data.analysis_results.post.error_code, null)
    assert.equal(success.body.data.analysis_results.post.error, null)
  })
  it('sends complete ordered inputs and only selected directions, preserving real source and model', async () => {
    const w = world(); const selection = { scope: 'post', directions: ['expression', 'creative'] }
    const res = await w.send('analyze', selection)
    assert.equal(res.status, 200)
    assert.deepEqual(w.calls[0].args.references.map((ref) => ref.pathOrUrl), [w.video, w.image, w.second])
    assert.match(w.calls[0].args.prompt, /完整原始正文\n第二段/)
    assert.match(w.calls[0].args.prompt, /表达：/); assert.doesNotMatch(w.calls[0].args.prompt, /内容：主题/)
    const entry = res.body.data.analysis_results.post
    assert.equal(entry.status, 'done'); assert.equal(entry.source, 'live'); assert.equal(entry.model, 'test-model')
    assert.equal(entry.input_fingerprint, analysisInputFingerprint(w.row, selection))
    assert.equal(createLocalStore({ paths: w.paths }).get(w.row.id).analysis_results.post.input_fingerprint, entry.input_fingerprint)
  })
  it('isolates body, selected image and second video without accepting a supplied path', async () => {
    const w = world()
    for (const selection of [{ scope: 'body' }, { scope: 'media', media_index: 1, path: '/etc/passwd' }, { scope: 'media', media_index: 2 }]) assert.equal((await w.send('analyze', selection)).status, 200)
    assert.deepEqual(w.calls.map((call) => call.args.references.map((ref) => ref.pathOrUrl)), [[], [w.image], [w.second]])
    assert.deepEqual(Object.keys(w.store.get(w.row.id).analysis_results), ['body', 'media:1', 'media:2'])
    assert.equal(w.store.get(w.row.id).deconstruction, undefined)
  })
  it('analyzes a legacy photo saved as its owned local cover', async () => {
    const w = world()
    const cover = join(w.paths.coversDir, 'legacy-photo.jpg')
    writeFileSync(cover, 'saved photo')
    w.store.update(w.row.id, { type: 'image', media_items: [], media_urls: [], cover_url: '/omnimux/inspiration/local/media/covers/legacy-photo.jpg', local_paths: { cover } })
    const response = await w.send('analyze', { scope: 'media', media_index: 0 })
    assert.equal(response.status, 200)
    assert.deepEqual(w.calls[0].args.references, [{ type: 'image', pathOrUrl: cover }])
    assert.equal(response.body.data.analysis_results['media:0'].status, 'done')
  })
  it('refuses a video poster disguised as an attachment and an external legacy cover', async () => {
    const w = world()
    const cover = join(w.paths.coversDir, 'poster.jpg')
    writeFileSync(cover, 'poster')
    w.store.update(w.row.id, { type: 'video', media_items: [{ type: 'image', url: '/omnimux/inspiration/local/media/covers/poster.jpg' }], local_paths: { cover } })
    assert.equal((await w.send('analyze', { scope: 'media', media_index: 0 })).status, 422)
    rmSync(cover); symlinkSync('/etc/hosts', cover)
    w.store.update(w.row.id, { type: 'image', media_items: [], media_urls: [], cover_url: '/omnimux/inspiration/local/media/covers/poster.jpg', local_paths: { cover } })
    assert.equal((await w.send('analyze', { scope: 'media', media_index: 0 })).status, 422)
    assert.equal(w.calls.length, 0)
  })
  it('rejects invalid scope, directions and indices before calling the tool', async () => {
    const w = world()
    for (const selection of [{ scope: 'unknown' }, { scope: 'media', media_index: -1 }, { scope: 'media', media_index: 9 }, { scope: 'post', directions: [] }, { scope: 'body', directions: ['bad'] }]) assert.equal((await w.send('analyze', selection)).status, 400)
    assert.equal(w.calls.length, 0)
  })
  it('marks missing or external files partial instead of analyzing a subset', async () => {
    const w = world(); rmSync(w.image); symlinkSync('/etc/hosts', w.image)
    assert.equal((await w.send('analyze', { scope: 'post' })).status, 422)
    assert.equal(w.calls.length, 0); assert.equal(w.store.get(w.row.id).analysis_results.post.status, 'partial')
  })
  it('merges concurrent scopes and rejects duplicate in-flight requests', async () => {
    let release; const gate = new Promise((resolve) => { release = resolve })
    const w = world(async () => { await gate; return { mode: 'live', text: '真实分析' } })
    const body = w.send('analyze', { scope: 'body' }); const media = w.send('analyze', { scope: 'media', media_index: 1 })
    assert.equal(w.store.get(w.row.id).analysis_results.body.status, 'running')
    assert.equal(handleGetItem({ id: w.row.id, store: w.store }).body.data.analysis_results.body.status, 'running', 'a live executor must survive status reads')
    assert.equal((await w.send('analyze', { scope: 'body' })).status, 409)
    release(); await Promise.all([body, media])
    const results = w.store.get(w.row.id).analysis_results
    assert.equal(results.body.status, 'done'); assert.equal(results['media:1'].status, 'done')
  })
  it('recovers interrupted persisted scopes on read while preserving completed results', async () => {
    const w = world()
    await w.send('analyze', { scope: 'body' })
    const completed = w.store.get(w.row.id).analysis_results.body
    w.store.updateAnalysis(w.row.id, 'post', { scope: 'post', status: 'running', result: null })
    w.store.updateAnalysis(w.row.id, 'media:1', { scope: 'media', media_index: 1, status: 'running', result: null })
    const row = handleGetItem({ id: w.row.id, store: w.store }).body.data
    assert.equal(row.analysis_results.post.status, 'failed')
    assert.match(row.analysis_results.post.error, /已中断/)
    assert.equal(row.analysis_results['media:1'].status, 'failed')
    assert.deepEqual(row.analysis_results.body, completed)
    assert.equal(createLocalStore({ paths: w.paths }).get(w.row.id).analysis_results.post.status, 'failed')
    assert.equal((await w.send('analyze', { scope: 'body' })).status, 200)
  })
  it('records errors, empty and non-live results without fabricated success', async () => {
    for (const execute of [async () => { throw new Error('provider unavailable') }, async () => ({ mode: 'live', text: '' }), async () => ({ mode: 'mock', text: 'template' })]) {
      const w = world(execute); assert.equal((await w.send('analyze', { scope: 'body' })).status, 502)
      const entry = w.store.get(w.row.id).analysis_results.body
      assert.equal(entry.status, 'failed'); assert.equal(entry.result, null); assert.equal(entry.source, 'legacy_unknown')
    }
  })
  it('preserves previous actual output on failed retry', async () => {
    let n = 0; const w = world(async () => { if (++n > 1) throw new Error('temporarily unavailable'); return { mode: 'live', text: 'prior real result' } })
    await w.send('analyze', { scope: 'body' }); await w.send('analyze', { scope: 'body' })
    const entry = w.store.get(w.row.id).analysis_results.body
    assert.equal(entry.status, 'failed'); assert.equal(entry.result.markdown, 'prior real result')
  })
  it('rejects results for content edited during a request', async () => {
    const w = world(async () => { w.store.update(w.row.id, { content: 'changed' }); return { mode: 'live', text: 'old input result' } })
    const response = await w.send('analyze', { scope: 'body' })
    assert.equal(response.status, 409); assert.equal(response.body.data.analysis_results.body.status, 'partial'); assert.equal(response.body.data.analysis_results.body.result, null)
  })
  it('propagates cancellation and saves retryable failure', async () => {
    const controller = new AbortController()
    const w = world(async (_args, exec) => { assert.equal(exec.signal, controller.signal); controller.abort(); return { mode: 'live', text: 'late output' } })
    assert.equal((await w.send('analyze', { scope: 'body' }, controller.signal)).status, 499)
    const entry = w.store.get(w.row.id).analysis_results.body
    assert.equal(entry.status, 'failed'); assert.equal(entry.result, null); assert.match(entry.error, /取消/)
  })
})

describe('body translation and retained contracts', () => {
  it('translates raw body, preserves script translation/draft and marks legacy provenance', async () => {
    const w = world(async () => ({ mode: 'live', model: 'test', text: JSON.stringify({ text: 'Translated original body' }) }))
    w.store.update(w.row.id, { deconstruction: { segments: [{ text: '生成台词' }] }, script_translation: { text: 'old script translation' }, creation_draft: { text: 'user draft' } })
    const response = await w.send('translate', { scope: 'body', lang: 'en' })
    assert.equal(response.status, 200); assert.match(w.calls[0].args.prompt, /完整原始正文/); assert.doesNotMatch(w.calls[0].args.prompt, /生成台词/)
    assert.equal(response.body.data.body_translation.source_fingerprint, sourceFingerprint(w.row.content))
    assert.equal(response.body.data.script_translation.text, 'old script translation')
    const fresh = createLocalStore({ paths: w.paths }).get(w.row.id)
    await w.store.replace(w.row.id, { ...fresh, title: 'replacement' })
    assert.equal(w.store.get(w.row.id).creation_draft.text, 'user draft'); assert.equal(w.store.get(w.row.id).body_translation.text, 'Translated original body')
    assert.equal(w.store.get(w.row.id).deconstruction.source, 'legacy_unknown')
  })
  it('rejects stale translation after body changes', async () => {
    const w = world(async () => { w.store.update(w.row.id, { content: 'changed' }); return { mode: 'live', text: 'old translation' } })
    assert.equal((await w.send('translate', { scope: 'body' })).status, 409); assert.equal(w.store.get(w.row.id).body_translation, undefined)
  })
  it('does not label empty JSON as a translation or reuse the original body as a successful translation', async () => {
    const w = world(async () => ({ mode: 'live', text: '{}' }))
    assert.equal((await w.send('translate', { scope: 'body' })).status, 502)
    assert.equal(w.store.get(w.row.id).body_translation, undefined)
  })
  it('preserves a user draft when media is reimported and invalidates scope identities when order changes', async () => {
    const w = world()
    await w.send('analyze', { scope: 'media', media_index: 1 })
    const old = w.store.get(w.row.id).analysis_results['media:1']
    w.store.update(w.row.id, { creation_draft: { text: 'keep my words', edited: true } })
    const changed = { ...w.row, media_items: [w.row.media_items[1], w.row.media_items[0], w.row.media_items[2]] }
    assert.notEqual(analysisInputFingerprint(changed, old), old.input_fingerprint)
    await w.store.replace(w.row.id, changed)
    assert.equal(w.store.get(w.row.id).creation_draft.text, 'keep my words')
  })
  it('marks legacy remote attachments incomplete rather than analyzing only their caption', async () => {
    const w = world()
    w.store.update(w.row.id, { media_items: [], local_paths: {}, media_urls: ['https://example.com/old.mp4'] })
    assert.equal((await w.send('analyze', { scope: 'post' })).status, 422)
    assert.equal(w.calls.length, 0)
  })
  it('normalizes actual cancellation when the translation tool reports an ordinary error', async () => {
    const controller = new AbortController()
    const w = world(async () => { controller.abort('user cancelled'); throw new Error('network closed') })
    assert.equal((await w.send('translate', { scope: 'body' }, controller.signal)).status, 499)
    assert.equal(w.store.get(w.row.id).body_translation, undefined)
  })
  it('legacy video analyzer reports actual failure instead of inventing beauty scenes', async () => {
    const response = await analyzeInspirationVideo({ videoPath: '/unused', videoAnalyzeTool: { execute: async () => { throw new Error('video failed') } } })
    assert.equal(response.deconstruction, null); assert.equal(response.error, 'video failed')
    assert.equal((await analyzeInspirationVideo({ videoPath: '/unused', videoAnalyzeTool: { execute: async () => ({ text: 'unverified' }) } })).deconstruction, null)
  })
})
