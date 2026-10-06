import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { createVeoDispatcher, registerVeoRoutes, VEO_UPLOAD_MAX_BYTES } from './veo-routes.js'
import { createVeoTaskStore, safeMediaBase, veoMediaUrl } from './veo-task-store.js'
import { VIDS_ERROR_CODES } from '../shared/veoTaskSpec.js'

/**
 * @param {{ getConnection?: () => unknown, store?: ReturnType<typeof createVeoTaskStore>,
 *   now?: () => number, generate?: Function, outputDir?: string, hubAvailable?: () => boolean,
 *   detectEnv?: () => object }} [deps]
 */
function mountVeo(deps = {}) {
  let handler
  const dispatcher = createVeoDispatcher({
    store: deps.store,
    now: deps.now,
    outputDir: deps.outputDir,
    hubAvailable: deps.hubAvailable,
    detectEnv: deps.detectEnv || (() => ({ installed: true, bridgeConnected: true, version: 'test' })),
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
    /** @type {{ status?: number, body?: unknown, headers?: object }} */
    const result = {}
    // 真实可写响应：媒体路由用 fs.createReadStream(...).pipe(res)，纯对象桩会在 pipe 处抛错。
    const responseChunks = []
    const res = new Writable({
      write(chunk, _encoding, callback) {
        responseChunks.push(Buffer.from(chunk))
        callback()
      },
    })
    res.writeHead = (status, responseHeaders) => {
      result.status = status
      result.headers = responseHeaders
    }
    const finished = new Promise((resolve) => {
      res.on('finish', resolve)
      res.on('close', resolve)
    })
    await handler(req, res)
    await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 1000))])
    const text = Buffer.concat(responseChunks).toString('utf8')
    try {
      result.body = text ? JSON.parse(text) : undefined
    } catch {
      result.body = text
    }
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

/* ---------------------------------------------------- 中枢缝后端（Issue #3186） */

test('中枢缝可用时，opencli 缺失也返回 202（门禁只约束内部驱动）', async () => {
  const store = createVeoTaskStore()
  const dispatcher = createVeoDispatcher({
    store,
    now: () => 1700000010000,
    hubAvailable: () => true,
    detectEnv: () => ({ installed: false, bridgeConnected: false }),
    outputDir: '/tmp/veo-test-media',
    generate: async () => ({
      success: true,
      channel: 'hub',
      fileName: 'veo_hub_1.mp4',
      localPath: '/tmp/veo-test-media/veo_hub_1.mp4',
      fileSize: 4096,
      durationSec: 10,
      resolution: '1080p',
      upstreamTaskId: '0123456789abcdef01234567',
      upstreamUrl: 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content',
    }),
  })

  const created = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: '一只猫在草地上奔跑', mode: 'create', seconds: 10, resolution: '1080p' },
  })
  assert.equal(created.status, 202)
  assert.equal(created.body.task.channel, 'hub')

  await new Promise((r) => setTimeout(r, 30))
  const polled = await dispatcher.dispatch({
    method: 'GET',
    url: `/omnimux-video/api/veo/tasks/${created.body.task.id}`,
  })
  const task = polled.body.task
  assert.equal(task.status, 'completed')
  assert.equal(task.channel, 'hub')
  assert.equal(task.upstreamTaskId, '0123456789abcdef01234567')
  assert.equal(task.upstreamUrl, 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content')
  assert.equal(task.videoUrl, '/omnimux-video/api/veo/media/veo_hub_1.mp4')
  assert.equal(task.resolution, '1080p')
})

test('中枢缝不可用时，opencli 缺失仍按内部驱动返回 503', async () => {
  const dispatcher = createVeoDispatcher({
    hubAvailable: () => false,
    detectEnv: () => ({ installed: false, bridgeConnected: false }),
    generate: async () => { throw new Error('should not run') },
  })
  const res = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: '一只猫在草地上奔跑', mode: 'create', seconds: 10 },
  })
  assert.equal(res.status, 503)
  assert.equal(res.body.error, 'opencli-missing')
})

test('生成器收到 operation / image_url / video_id 三个字段', async () => {
  /** @type {object[]} */
  const calls = []
  const dispatcher = createVeoDispatcher({
    now: () => 1700000011000,
    hubAvailable: () => true,
    detectEnv: () => ({ installed: false, bridgeConnected: false }),
    outputDir: '/tmp/veo-test-media',
    generate: async (request) => {
      calls.push(request)
      return {
        success: true,
        fileName: 'veo_hub_2.mp4',
        localPath: '/tmp/veo-test-media/veo_hub_2.mp4',
        fileSize: 4096,
        durationSec: 8,
      }
    },
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
      image_url: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/replacement.png',
      video_id: 'task_veo_prev',
    },
  })
  assert.equal(created.status, 202)
  await new Promise((r) => setTimeout(r, 30))

  assert.equal(calls.length, 1)
  assert.equal(calls[0].operation, 'video_edit')
  assert.equal(calls[0].imageUrl, 'http://127.0.0.1:43120/omnimux-video/api/veo/media/replacement.png')
  assert.equal(calls[0].videoId, 'task_veo_prev')
  assert.equal(calls[0].seconds, 8)
  assert.equal(calls[0].aspectRatio, 'portrait')
})

test('中枢失败原因与错误码原样落到任务记录，不压成通用 500', async () => {
  const store = createVeoTaskStore()
  const reason = '本机 Google Vids 通道未配置：请设置 OMNIMUX_VIDS2API_BASE_URL 指向本机 vids2api 服务地址后再试。'
  const dispatcher = createVeoDispatcher({
    store,
    now: () => 1700000012000,
    hubAvailable: () => true,
    detectEnv: () => ({ installed: false, bridgeConnected: false }),
    outputDir: '/tmp/veo-test-media',
    generate: async () => { throw Object.assign(new Error(reason), { code: 'omnimux-unconfigured' }) },
  })

  const created = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-video/api/veo/tasks',
    body: { prompt: '一只猫在草地上奔跑', mode: 'create', seconds: 10 },
  })
  assert.equal(created.status, 202)
  await new Promise((r) => setTimeout(r, 30))

  const task = store.get('task_veo_1700000012000')
  assert.equal(task.status, 'failed')
  assert.equal(task.error, reason)
  assert.equal(task.message, reason)
  assert.equal(task.errorCode, 'omnimux-unconfigured')
})

test('处理函数抛错时 500 里带真实可读原因，不再吞成通用 internal error', async () => {
  const reason = '任务账本读取失败：磁盘句柄已关闭'
  const call = mountVeo({
    getConnection: () => ({ requestRejection: () => undefined }),
    store: {
      create: () => { throw new Error('should not run') },
      update: () => null,
      list: () => [],
      resolveSourceUrl: () => ({ url: '', reason: '' }),
      get: () => { throw new Error(reason) },
    },
  })
  const res = await call({
    method: 'GET',
    url: '/omnimux-video/api/veo/tasks/task_veo_1',
    headers: { origin: 'http://localhost:43120', 'sec-fetch-site': 'same-origin' },
  })
  assert.equal(res.status, 500)
  assert.equal(res.body.error, 'internal')
  assert.equal(res.body.message, reason)
})

/* ------------------------------------------------------ 选图上传（Issue #3186） */

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function pngBytes(size = 64) {
  return Buffer.concat([PNG_HEADER, Buffer.alloc(Math.max(size - PNG_HEADER.length, 8), 0x11)])
}

test('POST /uploads 落盘并回可抓取的绝对地址，media 路由按图片类型服务', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veo-upload-'))
  const call = mountVeo({
    outputDir,
    now: () => 1700000013000,
    getConnection: () => ({ requestRejection: () => undefined }),
  })

  const uploaded = await call({
    method: 'POST',
    url: '/omnimux-video/api/veo/uploads',
    headers: {
      origin: 'http://localhost:43120',
      'sec-fetch-site': 'same-origin',
      'content-type': 'image/png',
    },
    body: pngBytes(),
  })
  assert.equal(uploaded.status, 200)
  assert.equal(uploaded.body.fileName, 'vids_upload_1700000013000.png')
  assert.equal(uploaded.body.mime, 'image/png')
  assert.equal(uploaded.body.fileSize, pngBytes().length)
  assert.equal(
    uploaded.body.url,
    'http://localhost:43120/omnimux-video/api/veo/media/vids_upload_1700000013000.png',
  )
  assert.ok(fs.existsSync(path.join(outputDir, 'vids_upload_1700000013000.png')))

  const served = await call({
    method: 'GET',
    url: '/omnimux-video/api/veo/media/vids_upload_1700000013000.png',
  })
  assert.equal(served.status, 200)
  assert.equal(served.headers['Content-Type'], 'image/png')
})

test('POST /uploads 拒绝非图片类型、内容与声明不符、以及超限体积', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veo-upload-'))
  const call = mountVeo({
    outputDir,
    now: () => 1700000014000,
    getConnection: () => ({ requestRejection: () => undefined }),
  })

  const wrongType = await call({
    method: 'POST',
    url: '/omnimux-video/api/veo/uploads',
    headers: {
      origin: 'http://localhost:43120',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/octet-stream',
    },
    body: pngBytes(),
  })
  assert.equal(wrongType.status, 415)

  const mismatch = await call({
    method: 'POST',
    url: '/omnimux-video/api/veo/uploads',
    headers: {
      origin: 'http://localhost:43120',
      'sec-fetch-site': 'same-origin',
      'content-type': 'image/png',
    },
    body: Buffer.alloc(64, 0x22),
  })
  assert.equal(mismatch.status, 415)

  const tooLarge = await call({
    method: 'POST',
    url: '/omnimux-video/api/veo/uploads',
    headers: {
      origin: 'http://localhost:43120',
      'sec-fetch-site': 'same-origin',
      'content-type': 'image/png',
    },
    body: pngBytes(VEO_UPLOAD_MAX_BYTES + 1024),
  })
  assert.equal(tooLarge.status, 413)

  assert.deepEqual(fs.readdirSync(outputDir), [])
})
