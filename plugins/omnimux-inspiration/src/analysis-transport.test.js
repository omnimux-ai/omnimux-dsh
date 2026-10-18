import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { mkdtempSync, writeFileSync, truncateSync, rmSync, existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareAnalysisTransport, handleScopedAnalysis } from './scoped-analysis.js'
import { createLocalStore } from './local-store.js'

const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function asset(size, name = 'source.mp4') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'inspiration-transport-test-'))); dirs.push(dir)
  const path = join(dir, name); writeFileSync(path, 'original'); truncateSync(path, size)
  return path
}
const input = (paths) => ({ prompt: '完整原文', references: paths.map((pathOrUrl) => ({ type: 'video', pathOrUrl })) })

test('98MB saved video uses formal full-timeline, audio-preserving seam and cleans only its output', async () => {
  const source = asset(98_376_196); let request
  const prepared = await prepareAnalysisTransport(input([source]), { videoProcess: { execute: async (req) => {
    request = req; writeFileSync(req.dest, 'prepared whole video')
    return { mode: 'live', files: [{ path: req.dest, kind: 'video', meta: { preserveTimeline: true, keepAudio: true } }] }
  } } })
  assert.equal(request.capability, 'video_inline_analysis_prepare')
  assert.equal(request.input.videoUrl, source)
  assert.equal(request.input.preserveTimeline, true); assert.equal(request.input.keepAudio, true)
  assert.ok(request.input.maxRequestBytes < 9 * 1024 * 1024)
  assert.equal(prepared.references[0].pathOrUrl, request.dest)
  await prepared.cleanup()
  assert.equal(existsSync(request.dest), false); assert.equal(existsSync(source), true)
})

test('shares encoded total budget across all videos, leaves originals in order', async () => {
  const sources = [asset(98_376_196), asset(50_000_000), asset(500)]
  const calls = []
  const prepared = await prepareAnalysisTransport(input(sources), { videoProcess: { execute: async (req) => {
    calls.push(req); writeFileSync(req.dest, 'compressed'); truncateSync(req.dest, req.input.maxRequestBytes)
    return { mode: 'live', files: [{ path: req.dest, kind: 'video', meta: { preserveTimeline: true, keepAudio: true } }] }
  } } })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].input.maxRequestBytes, calls[1].input.maxRequestBytes)
  assert.ok(calls[0].input.maxRequestBytes * 2 * 4 / 3 < 9 * 1024 * 1024)
  assert.deepEqual(prepared.references.map((r) => r.pathOrUrl), [calls[0].dest, calls[1].dest, sources[2]])
  await prepared.cleanup()
})

test('refuses oversized image-only payload without submitting a subset', async () => {
  const path = asset(8 * 1024 * 1024, 'photo.jpg')
  await assert.rejects(prepareAnalysisTransport({ prompt: 'body', references: [{ type: 'image', pathOrUrl: path }] }), /容量/)
})

test('missing seam, failed/oversize output and cancellation clean output and never replace source', async () => {
  const source = asset(98_376_196)
  await assert.rejects(prepareAnalysisTransport(input([source])), /视频处理能力/)
  for (const mode of ['error', 'overshoot', 'cancel', 'fake', 'old-engine']) {
    let output; const controller = new AbortController()
    await assert.rejects(prepareAnalysisTransport(input([source]), { signal: controller.signal, videoProcess: { execute: async (req) => {
      output = req.dest; writeFileSync(output, 'partial')
      if (mode === 'error') throw new Error('processing failed')
      if (mode === 'cancel') controller.abort()
      return { mode: mode === 'fake' ? 'mock' : 'live', files: [{ path: req.dest, kind: 'video', meta: { overshoot: mode === 'overshoot', preserveTimeline: mode !== 'old-engine', keepAudio: mode !== 'old-engine' } }] }
    } } }))
    assert.equal(existsSync(output), false); assert.equal(existsSync(source), true)
  }
})

test('scope pipeline calls model only with prepared input and cleans on model success/failure/cancel', async () => {
  for (const outcome of ['done', 'failed', 'cancel']) {
    const source = asset(98_376_196)
    const root = join(source, '..')
    const paths = { dir: root, libraryFile: join(root, 'library.json'), videosDir: root, imagesDir: join(root, 'images'), coversDir: join(root, 'covers'), mediaDir: root }
    const store = createLocalStore({ paths })
    const row = store.add({ title: 'saved post', content: 'complete body', type: 'video', local_paths: { video: source }, media_items: [{ type: 'video', url: '/omnimux/inspiration/local/media/videos/source.mp4' }] })
    let output; let calls = 0; const controller = new AbortController()
    const work = handleScopedAnalysis({ id: row.id, store, paths, signal: controller.signal, req: { body: { scope: 'post' } }, videoProcess: { execute: async (req) => {
      output = req.dest; writeFileSync(output, 'whole prepared video')
      return { mode: 'live', files: [{ path: output, kind: 'video', meta: { preserveTimeline: true, keepAudio: true } }] }
    } }, textComplete: { execute: async (req) => {
      calls += 1; assert.equal(req.references[0].pathOrUrl, output); assert.equal(existsSync(output), true)
      if (outcome === 'failed') throw new Error('provider failed')
      if (outcome === 'cancel') controller.abort()
      return { mode: 'live', text: 'actual analysis' }
    } } })
    if (outcome === 'cancel') await assert.rejects(work, { name: 'AbortError' })
    else assert.equal((await work).status, outcome === 'done' ? 200 : 502)
    assert.equal(calls, 1); assert.equal(existsSync(output), false); assert.equal(existsSync(source), true)
    assert.equal(store.get(row.id).analysis_results.post.status, outcome === 'done' ? 'done' : 'failed')
  }
})
