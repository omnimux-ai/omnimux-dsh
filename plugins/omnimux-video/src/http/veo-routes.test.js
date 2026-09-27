import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createVeoDispatcher, registerVeoRoutes } from './veo-routes.js'
import { createVeoTaskStore, veoMediaUrl } from './veo-task-store.js'

/**
 * @param {{ getConnection?: () => unknown }} [deps]
 */
function mountVeo(deps = {}) {
  let handler
  const dispatcher = createVeoDispatcher({
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    generate: async () => { throw new Error('should not run') },
  })
  registerVeoRoutes(
    { register: (route) => { handler = route.handler; return () => {} } },
    dispatcher,
    deps,
  )
  return async ({
    method = 'GET',
    url = '/omnimux-video/api/veo/health',
    headers = {},
    body,
  } = {}) => {
    const chunks = body === undefined ? [] : [Buffer.from(body)]
    const req = Readable.from(chunks)
    Object.assign(req, {
      method,
      url,
      headers: { host: 'localhost:43120', ...headers },
      socket: {},
    })
    /** @type {{ status?: number, body?: unknown }} */
    const result = {}
    await handler(req, {
      writeHead(status) { result.status = status },
      end(payload) {
        const text = String(payload ?? '')
        result.body = text ? JSON.parse(text) : undefined
      },
    })
    return result
  }
}

test('veoMediaUrl rejects path traversal', () => {
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

test('Veo routes return 503 when Host connection is missing', async () => {
  const call = mountVeo({})
  const res = await call({
    headers: { origin: 'http://localhost:43120' },
  })
  assert.equal(res.status, 503)
  assert.equal(res.body.error, 'request-denied')
})

test('Veo routes return 403 for cross-site browser requests', async () => {
  const call = mountVeo({
    getConnection: () => ({ requestRejection: () => undefined }),
  })
  const res = await call({
    headers: {
      origin: 'http://localhost:43120',
      'sec-fetch-site': 'cross-site',
    },
  })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, 'request-denied')
})

test('Veo routes allow same-origin authenticated requests', async () => {
  const call = mountVeo({
    getConnection: () => ({ requestRejection: () => undefined }),
  })
  const res = await call({
    headers: {
      origin: 'http://localhost:43120',
      'sec-fetch-site': 'same-origin',
    },
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
})
