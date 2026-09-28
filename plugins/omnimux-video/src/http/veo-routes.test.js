import test from 'node:test'
import assert from 'node:assert/strict'
import { createVeoDispatcher } from './veo-routes.js'
import { createVeoTaskStore, safeMediaBase, veoMediaUrl } from './veo-task-store.js'

test('safeMediaBase and veoMediaUrl reject path traversal', () => {
  assert.equal(safeMediaBase('ok.mp4'), 'ok.mp4')
  assert.equal(safeMediaBase('../secret.mp4'), null)
  assert.equal(safeMediaBase('dir/ok.mp4'), null)
  assert.equal(safeMediaBase(''), null)
  assert.equal(veoMediaUrl('ok.mp4'), '/omnimux-video/api/veo/media/ok.mp4')
  assert.throws(() => veoMediaUrl('../secret.mp4'))
})

test('POST /tasks rejects empty prompt', async () => {
  const dispatcher = createVeoDispatcher({
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    generate: async () => { throw new Error('should not run') },
  })
  const res = await dispatcher.dispatch({ method: 'POST', url: '/omnimux-video/api/veo/tasks', body: { prompt: '  ' } })
  assert.equal(res.status, 400)
  assert.equal(res.body.error, 'invalid-request')
})

test('POST /tasks returns 503 when opencli bridge is down', async () => {
  const dispatcher = createVeoDispatcher({
    detectEnv: () => ({ installed: true, bridgeConnected: false, version: 'test' }),
    generate: async () => { throw new Error('should not run') },
  })
  const res = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: 'a cat running on grass' },
  })
  assert.equal(res.status, 503)
  assert.equal(res.body.error, 'opencli-bridge-disconnected')
})

test('POST /tasks accepts and completes via mocked generator', async () => {
  const store = createVeoTaskStore()
  let progressCalls = 0
  const dispatcher = createVeoDispatcher({
    store,
    now: () => 1700000000000,
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    outputDir: '/tmp/veo-test-media',
    generate: async ({ prompt, onProgress }) => {
      onProgress?.({ percent: 40, phase: 'rendering', message: 'mock rendering' })
      progressCalls += 1
      return {
        success: true,
        fileName: 'veo_export_mock.mp4',
        localPath: '/tmp/veo-test-media/veo_export_mock.mp4',
        fileSize: 12345,
        durationSec: 10,
        resolution: '720p',
      }
    },
  })

  const created = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: 'a cat running on grass', mode: 'create', durationSec: 10 },
  })
  assert.equal(created.status, 202)
  assert.equal(created.body.task.id, 'task_veo_1700000000000')
  assert.ok(['queued', 'generating', 'completed'].includes(created.body.task.status))

  // allow background promise to settle
  await new Promise((r) => setTimeout(r, 30))
  const polled = await dispatcher.dispatch({
    method: 'GET',
    url: `/omnimux-video/api/veo/tasks/${created.body.task.id}`,
  })
  assert.equal(polled.status, 200)
  assert.equal(polled.body.task.status, 'completed')
  assert.equal(polled.body.task.videoUrl, '/omnimux-video/api/veo/media/veo_export_mock.mp4')
  assert.ok(progressCalls >= 1)
})

test('GET /health reports opencli readiness', async () => {
  const dispatcher = createVeoDispatcher({
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: '1.2.3' }),
  })
  const res = await dispatcher.dispatch({ method: 'GET', url: '/omnimux-video/api/veo/health' })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.opencli.version, '1.2.3')
})

test('POST /tasks fails when generator returns unsafe fileName', async () => {
  const store = createVeoTaskStore()
  const dispatcher = createVeoDispatcher({
    store,
    now: () => 1700000000999,
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    outputDir: '/tmp/veo-test-media',
    generate: async () => ({
      success: true,
      fileName: '../secret.mp4',
      localPath: '/tmp/veo-test-media/../secret.mp4',
      fileSize: 1,
      durationSec: 10,
      resolution: '720p',
    }),
  })
  const created = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: 'unsafe media name', mode: 'create', durationSec: 10 },
  })
  assert.equal(created.status, 202)
  await new Promise((r) => setTimeout(r, 30))
  const polled = await dispatcher.dispatch({
    method: 'GET',
    url: `/omnimux-video/api/veo/tasks/${created.body.task.id}`,
  })
  assert.equal(polled.status, 200)
  assert.equal(polled.body.task.status, 'failed')
  assert.equal(polled.body.task.videoUrl, undefined)
  assert.match(String(polled.body.task.error || polled.body.task.message || ''), /invalid media file name/)
})
