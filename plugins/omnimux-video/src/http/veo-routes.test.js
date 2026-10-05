import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createVeoDispatcher, registerVeoRoutes } from './veo-routes.js'
import { createVeoTaskStore, safeMediaBase, veoMediaUrl } from './veo-task-store.js'
import { VIDS_ERROR_CODES } from '../shared/veoTaskSpec.js'

/**
 * @param {{ getConnection?: () => unknown, store?: ReturnType<typeof createVeoTaskStore>,
 *   now?: () => number, generate?: Function, outputDir?: string }} [deps]
 */
function mountVeo(deps = {}) {
  let handler
  const dispatcher = createVeoDispatcher({
    store: deps.store,
    now: deps.now,
    outputDir: deps.outputDir,
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    generate: deps.generate || (async () => { throw new Error('should not run') }),
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

test('POST /tasks 把四模式字段透传进任务记录', async () => {
  const store = createVeoTaskStore()
  const dispatcher = createVeoDispatcher({
    store,
    now: () => 1700000004321,
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    outputDir: '/tmp/veo-test-media',
    generate: async () => { throw new Error('should not run') },
  })
  const created = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: {
      mode: 'modify',
      operation: 'video_edit',
      prompt: '把外套换成红色',
      seconds: 8,
      resolution: '1080p',
      aspect_ratio: 'portrait',
      image_url: 'https://cdn.example.com/ref.png',
      video_id: 'video_7',
    },
  })
  assert.equal(created.status, 202)
  const task = created.body.task
  assert.equal(task.id, 'task_veo_1700000004321')
  assert.equal(task.mode, 'modify')
  assert.equal(task.operation, 'video_edit')
  assert.equal(task.seconds, 8)
  assert.equal(task.durationSec, 8)
  assert.equal(task.resolution, '1080p')
  assert.equal(task.aspect_ratio, 'portrait')
  assert.equal(task.image_url, 'https://cdn.example.com/ref.png')
  assert.equal(task.video_id, 'video_7')
  assert.equal(task.title, '把外套换成红色')
  // 客户端今天读取的公共字段必须继续存在（videoUrl 在完成态由既有用例覆盖）。
  for (const key of ['id', 'status', 'progress', 'durationSec', 'resolution', 'title']) {
    assert.ok(key in task, `任务响应必须保留字段 ${key}`)
  }
  const stored = store.get('task_veo_1700000004321')
  assert.equal(stored.operation, 'video_edit')
  assert.equal(stored.seconds, 8)
  assert.equal(stored.aspect_ratio, 'portrait')
  assert.equal(stored.image_url, 'https://cdn.example.com/ref.png')
  assert.equal(stored.video_id, 'video_7')
})

test('POST /tasks 旧契约 durationSec 仍被接受并派生真源默认值', async () => {
  const dispatcher = createVeoDispatcher({
    now: () => 1700000005678,
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    generate: async () => { throw new Error('should not run') },
  })
  const created = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: 'a cat running on grass', mode: 'create', durationSec: 12 },
  })
  assert.equal(created.status, 202)
  const task = created.body.task
  assert.equal(task.durationSec, 12)
  assert.equal(task.seconds, 12)
  assert.equal(task.operation, 'text_to_video')
  assert.equal(task.resolution, '720p')
  assert.equal(task.aspect_ratio, 'landscape')
  assert.equal(task.image_url, undefined)
  assert.equal(task.video_id, undefined)
})

test('POST /tasks 越界参数返回 400 与稳定错误码', async () => {
  const dispatcher = createVeoDispatcher({
    detectEnv: () => ({ installed: true, bridgeConnected: true, version: 'test' }),
    generate: async () => { throw new Error('should not run') },
  })
  const cases = [
    { body: { prompt: '一只猫', seconds: 3 }, code: VIDS_ERROR_CODES.badSeconds },
    { body: { prompt: '一只猫', seconds: 13 }, code: VIDS_ERROR_CODES.badSeconds },
    { body: { prompt: '一只猫', parameters: { durationSec: 3 } }, code: VIDS_ERROR_CODES.badSeconds },
    { body: { prompt: '一只猫', mode: 'animate', seconds: 5 }, code: VIDS_ERROR_CODES.missingImage },
    { body: { prompt: '一只猫', mode: 'extend', seconds: 5 }, code: VIDS_ERROR_CODES.missingVideo },
    { body: { prompt: '一只猫', resolution: '480p' }, code: VIDS_ERROR_CODES.badResolution },
    { body: { prompt: '一只猫', aspect_ratio: 'square' }, code: VIDS_ERROR_CODES.badAspectRatio },
  ]
  for (const item of cases) {
    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux-video/api/veo/tasks',
      body: item.body,
    })
    assert.equal(res.status, 400)
    assert.equal(res.body.error, 'invalid-request')
    assert.equal(res.body.code, item.code)
    assert.equal(typeof res.body.message, 'string')
    assert.ok(res.body.message.length > 0)
  }
})

test('Veo routes 经 HTTP 层解析后仍透传四模式字段', async () => {
  const store = createVeoTaskStore()
  const call = mountVeo({
    store,
    now: () => 1700000009012,
    getConnection: () => ({ requestRejection: () => undefined }),
  })
  const res = await call({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    headers: { origin: 'http://localhost:43120', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({
      mode: 'animate',
      operation: 'first_frame',
      prompt: '让画面里的海浪动起来',
      seconds: 6,
      resolution: '4k',
      aspect_ratio: 'portrait',
      image_url: 'https://cdn.example.com/frame.png',
    }),
  })
  assert.equal(res.status, 202)
  const task = res.body.task
  assert.equal(task.id, 'task_veo_1700000009012')
  assert.equal(task.operation, 'first_frame')
  assert.equal(task.seconds, 6)
  assert.equal(task.resolution, '4k')
  assert.equal(task.aspect_ratio, 'portrait')
  assert.equal(task.image_url, 'https://cdn.example.com/frame.png')
  assert.equal(task.durationSec, 6)
  assert.equal(store.get('task_veo_1700000009012').operation, 'first_frame')
})
