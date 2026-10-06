/**
 * tests/e2e/google-vids-hub-wiring.e2e.test.mjs
 *
 * Issue #3186 —— 面板四模式经中枢 `videoGenerate` 缝生成：端到端验收（替身缝 + 真实插件代码路径）。
 *
 * 本文件不 mock 被测代码：真实构造 `createHubVidsGenerator` 与 `createVeoDispatcher`，
 * 在真实 `node:http` 服务上挂真实 `registerVeoRoutes`，用 `fetch` 走插件自己的 HTTP 面。
 * 唯一的替身是**中枢缝本身**（本机 vids2api 不在测试范围内）：它记录收到的确切请求对象、
 * 把一份真实 MP4 字节写到 `request.dest`，并返回上游任务号与取片地址。
 *
 * 强判据（不是「调用过」而是「结果对」）：
 * - 任务终态 `completed`（面板读的终态字段）、`videoUrl` 经真实 HTTP 取回 200 + video/mp4，
 *   且字节与缝写入的字节逐字节相同（可播放的取证对象）；
 * - 缝收到的请求对象逐字段 `deepEqual`：`seconds → duration`、`mode → operation`、
 *   `image` 只在 first_frame / video_edit、`references` 只在 video_edit / video_extend、
 *   **不含 `seconds` 键**；
 * - 修改 / 延续引用的是**前序任务的上游取片地址**，不是插件自身任务号。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import { createHubVidsGenerator } from '../../plugins/omnimux-video/src/driver/hubVidsGenerator.js'
import {
  createVeoDispatcher,
  registerVeoRoutes,
} from '../../plugins/omnimux-video/src/http/veo-routes.js'
import { createVeoTaskStore } from '../../plugins/omnimux-video/src/http/veo-task-store.js'

const VEO_PREFIX = '/omnimux-video/api/veo'

/** 替身缝返回的取片地址基址：本机假上游，绝不发真实请求。 */
const FAKE_UPSTREAM_BASE = 'http://127.0.0.1:59999'

/* ------------------------------------------------------------------ 真实媒体字节 */

/**
 * 最小但**真实**的 MP4 容器：`ftyp` + `mdat`。断言的是字节本身，
 * 因此「可播放」有可解码的取证对象，而不是一个字符串地址。
 * @returns {Buffer}
 */
function buildMinimalMp4() {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]), // box size = 32
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2avc1mp41', 'ascii'),
  ])
  const payload = Buffer.from('omnimux-vids-hub-wiring-3186-e2e-payload', 'utf8')
  const size = Buffer.alloc(4)
  size.writeUInt32BE(8 + payload.length, 0)
  const mdat = Buffer.concat([size, Buffer.from('mdat', 'ascii'), payload])
  return Buffer.concat([ftyp, mdat])
}

const MP4_BYTES = buildMinimalMp4()

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

/**
 * 真实可解码的 1×1 PNG（IHDR + IDAT + IEND，CRC 自算）：
 * 上传路由按魔数判定类型，这里给的是真图，不是伪造头。
 * @returns {Buffer}
 */
function buildTinyPng() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = zlib.deflateSync(Buffer.from([0x00, 0x20, 0x40, 0x60]))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const TINY_PNG = buildTinyPng()

/* ------------------------------------------------------------------ 替身中枢缝 */

/**
 * 替身中枢缝：记录确切请求对象 → 写真实 MP4 到 `request.dest` → 返回上游标识。
 * @param {{ recorded: object[], counter: { n: number }, base: string }} deps
 */
function createStubHubSeam({ recorded, counter, base }) {
  return {
    async execute(request) {
      recorded.push({ ...request })
      counter.n += 1
      const taskId = counter.n.toString(16).padStart(24, '0')
      fs.mkdirSync(path.dirname(request.dest), { recursive: true })
      fs.writeFileSync(request.dest, MP4_BYTES)
      return {
        mode: 'live',
        model: 'google-vids-omni',
        taskId,
        url: `${base}/videos/${taskId}/content`,
        dest: request.dest,
      }
    },
  }
}

/* ------------------------------------------------------------------ 真实 HTTP 面 */

/**
 * 起一个真实 HTTP 服务，挂真实 `registerVeoRoutes` + 真实 dispatcher + 真实生成器。
 * 与 `plugins/omnimux-video/src/index.js` 的装配方式一致（懒解析缝、同源取片解析、门禁依赖）。
 *
 * @param {{
 *   seam?: { execute: Function },
 *   hubAvailable?: () => boolean,
 *   detectEnv?: () => object,
 *   generate?: (request: object) => Promise<unknown>,
 * }} [options]
 */
async function createHarness(options = {}) {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vids-hub-e2e-'))
  const store = createVeoTaskStore()
  /** @type {object[]} */
  const recorded = []
  const calls = { generate: 0 }
  const counter = { n: 0 }
  const seam = options.seam ?? createStubHubSeam({ recorded, counter, base: FAKE_UPSTREAM_BASE })
  const hubAvailable = options.hubAvailable ?? (() => true)
  let clock = 1_700_000_000_000
  const now = () => (clock += 1000)

  const hubVidsGenerator = createHubVidsGenerator({
    getSeam: () => (hubAvailable() ? seam : undefined),
    resolveSourceVideo: (taskId) => store.resolveSourceUrl(taskId),
  })

  const dispatcher = createVeoDispatcher({
    store,
    now,
    hubAvailable,
    // 门禁故意报「未装 / 未连接」：缝可用时它不得生效（AC-5）。
    detectEnv: options.detectEnv ?? (() => ({ installed: false, bridgeConnected: false, version: 'stub' })),
    generate: async (request) => {
      calls.generate += 1
      if (options.generate) return options.generate(request)
      return hubVidsGenerator(request)
    },
    outputDir: mediaDir,
  })

  /** @type {Function | null} */
  let handler = null
  registerVeoRoutes(
    {
      register: (route) => {
        handler = route.handler
        return () => {
          handler = null
        }
      },
    },
    dispatcher,
    {
      // 与宿主一致：连接服务提供同源准入；测试给最小放行实现。
      getConnection: () => ({ requestRejection: () => undefined }),
      outputDir: mediaDir,
      now,
    },
  )

  const server = http.createServer((req, res) => {
    if (typeof handler !== 'function') {
      res.writeHead(503)
      res.end()
      return
    }
    handler(req, res)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${server.address().port}`

  return {
    origin,
    mediaDir,
    store,
    recorded,
    calls,
    base: FAKE_UPSTREAM_BASE,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(mediaDir, { recursive: true, force: true })
    },
  }
}

async function postTask(origin, body) {
  const res = await fetch(`${origin}${VEO_PREFIX}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function getTask(origin, id) {
  const res = await fetch(`${origin}${VEO_PREFIX}/tasks/${encodeURIComponent(id)}`)
  return { status: res.status, body: await res.json() }
}

/** 轮询到终态（面板的轮询语义：GET /tasks/:id）。 */
async function settleTask(origin, id, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const res = await getTask(origin, id)
    last = res.body?.task ?? null
    if (last && (last.status === 'completed' || last.status === 'failed')) return last
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`任务 ${id} 未在 ${timeoutMs}ms 内到达终态：${JSON.stringify(last)}`)
}

/** 取回成片字节并返回可断言的响应事实。 */
async function fetchMedia(origin, videoUrl) {
  const res = await fetch(`${origin}${videoUrl}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  return { status: res.status, contentType: res.headers.get('content-type'), bytes }
}

/* ------------------------------------------------------------------ 测试 */

test('E2E #3186: 面板四模式经中枢缝生成（真实路由 + 真实生成器 + 替身缝）', async (t) => {
  await t.test('媒体字节自检：MP4 与 PNG 是真容器，不是伪造头', () => {
    assert.equal(MP4_BYTES.subarray(4, 8).toString('ascii'), 'ftyp')
    assert.ok(MP4_BYTES.length > 32)
    assert.deepEqual([...TINY_PNG.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
  })

  await t.test('选图上传走插件自身 HTTP 面，返回可抓取的绝对地址且内容可取回', async () => {
    const h = await createHarness()
    try {
      const res = await fetch(`${h.origin}${VEO_PREFIX}/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: TINY_PNG,
      })
      assert.equal(res.status, 200)
      const upload = await res.json()
      assert.equal(upload.mime, 'image/png')
      assert.equal(upload.fileSize, TINY_PNG.length)
      // 绝对地址，落在插件自己的 HTTP 面上（不是 blob:、不是 data:、不是本地路径）。
      assert.equal(upload.url, `${h.origin}${VEO_PREFIX}/media/${upload.fileName}`)
      assert.ok(upload.url.startsWith('http://'))
      assert.ok(!upload.url.startsWith('blob:'))

      const served = await fetch(upload.url)
      assert.equal(served.status, 200)
      assert.equal(served.headers.get('content-type'), 'image/png')
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), TINY_PNG)
    } finally {
      await h.close()
    }
  })

  await t.test('创建：text_to_video 无多余字段，终态 completed 且成片可播放', async () => {
    const h = await createHarness()
    try {
      const created = await postTask(h.origin, {
        prompt: '一只猫在草地上奔跑',
        mode: 'create',
        seconds: 8,
        resolution: '1080p',
        aspect_ratio: 'portrait',
      })
      assert.equal(created.status, 202)
      const taskId = created.body.task.id

      const task = await settleTask(h.origin, taskId)
      assert.equal(task.status, 'completed')
      assert.equal(task.channel, 'hub')
      assert.equal(task.progress, 100)
      assert.match(task.upstreamTaskId, /^[0-9a-f]{24}$/)
      assert.equal(task.upstreamUrl, `${h.base}/videos/${task.upstreamTaskId}/content`)
      assert.equal(task.videoUrl, `${VEO_PREFIX}/media/${task.fileName}`)

      const media = await fetchMedia(h.origin, task.videoUrl)
      assert.equal(media.status, 200)
      assert.equal(media.contentType, 'video/mp4')
      assert.deepEqual(media.bytes, MP4_BYTES)

      assert.equal(h.recorded.length, 1)
      const request = h.recorded[0]
      assert.deepEqual(request, {
        dest: path.join(h.mediaDir, task.fileName),
        model: 'google-vids-omni',
        operation: 'text_to_video',
        prompt: '一只猫在草地上奔跑',
        duration: 8,
        resolution: '1080p',
        aspectRatio: 'portrait',
      })
      assert.equal('seconds' in request, false)
      assert.equal('image' in request, false)
      assert.equal('references' in request, false)
    } finally {
      await h.close()
    }
  })

  await t.test('动画：first_frame 只带 image，引用上传返回的服务地址', async () => {
    const h = await createHarness()
    try {
      const uploadRes = await fetch(`${h.origin}${VEO_PREFIX}/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: TINY_PNG,
      })
      const upload = await uploadRes.json()

      const created = await postTask(h.origin, {
        prompt: '让画面里的猫跑起来',
        mode: 'animate',
        seconds: 6,
        resolution: '720p',
        aspect_ratio: 'landscape',
        image_url: upload.url,
      })
      assert.equal(created.status, 202)
      const task = await settleTask(h.origin, created.body.task.id)
      assert.equal(task.status, 'completed')

      const media = await fetchMedia(h.origin, task.videoUrl)
      assert.equal(media.status, 200)
      assert.deepEqual(media.bytes, MP4_BYTES)

      assert.equal(h.recorded.length, 1)
      const request = h.recorded[0]
      assert.deepEqual(request, {
        dest: path.join(h.mediaDir, task.fileName),
        model: 'google-vids-omni',
        operation: 'first_frame',
        prompt: '让画面里的猫跑起来',
        duration: 6,
        resolution: '720p',
        aspectRatio: 'landscape',
        image: upload.url,
      })
      assert.equal('seconds' in request, false)
      assert.equal('references' in request, false)
    } finally {
      await h.close()
    }
  })

  await t.test('修改：video_edit 带 image + references，且引用前序上游取片地址而非插件任务号', async () => {
    const h = await createHarness()
    try {
      const uploadRes = await fetch(`${h.origin}${VEO_PREFIX}/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: TINY_PNG,
      })
      const upload = await uploadRes.json()

      const source = await postTask(h.origin, { prompt: '源片段', mode: 'create', seconds: 8 })
      const sourceTask = await settleTask(h.origin, source.body.task.id)
      assert.equal(sourceTask.status, 'completed')

      const modified = await postTask(h.origin, {
        prompt: '把白猫改成黑猫',
        mode: 'modify',
        seconds: 10,
        resolution: '1080p',
        aspect_ratio: 'landscape',
        image_url: upload.url,
        video_id: sourceTask.id,
      })
      assert.equal(modified.status, 202)
      const modifiedTask = await settleTask(h.origin, modified.body.task.id)
      assert.equal(modifiedTask.status, 'completed')

      assert.equal(h.recorded.length, 2)
      const request = h.recorded[1]
      assert.deepEqual(request, {
        dest: path.join(h.mediaDir, modifiedTask.fileName),
        model: 'google-vids-omni',
        operation: 'video_edit',
        prompt: '把白猫改成黑猫',
        duration: 10,
        resolution: '1080p',
        aspectRatio: 'landscape',
        image: upload.url,
        references: [{ type: 'video', role: 'source', pathOrUrl: sourceTask.upstreamUrl }],
      })
      assert.equal('seconds' in request, false)
      // 引用的是上游取片地址，不是插件自身任务号。
      assert.notEqual(request.references[0].pathOrUrl, sourceTask.id)
      assert.equal(request.references[0].pathOrUrl.includes(sourceTask.id), false)
      assert.equal(request.references[0].pathOrUrl, `${h.base}/videos/${sourceTask.upstreamTaskId}/content`)
    } finally {
      await h.close()
    }
  })

  await t.test('延续：video_extend 只带 references，引用前序任务的上游取片地址', async () => {
    const h = await createHarness()
    try {
      const first = await postTask(h.origin, { prompt: '第一段', mode: 'create', seconds: 8 })
      const firstTask = await settleTask(h.origin, first.body.task.id)

      const second = await postTask(h.origin, {
        prompt: '第二段',
        mode: 'create',
        seconds: 8,
        video_id: undefined,
      })
      const secondTask = await settleTask(h.origin, second.body.task.id)

      const extended = await postTask(h.origin, {
        prompt: '接着第二段往后演',
        mode: 'extend',
        seconds: 4,
        resolution: '720p',
        aspect_ratio: 'landscape',
        video_id: secondTask.id,
      })
      assert.equal(extended.status, 202)
      const extendedTask = await settleTask(h.origin, extended.body.task.id)
      assert.equal(extendedTask.status, 'completed')

      const media = await fetchMedia(h.origin, extendedTask.videoUrl)
      assert.equal(media.status, 200)
      assert.deepEqual(media.bytes, MP4_BYTES)

      assert.equal(h.recorded.length, 3)
      const request = h.recorded[2]
      assert.deepEqual(request, {
        dest: path.join(h.mediaDir, extendedTask.fileName),
        model: 'google-vids-omni',
        operation: 'video_extend',
        prompt: '接着第二段往后演',
        duration: 4,
        resolution: '720p',
        aspectRatio: 'landscape',
        references: [{ type: 'video', role: 'source', pathOrUrl: secondTask.upstreamUrl }],
      })
      assert.equal('seconds' in request, false)
      assert.equal('image' in request, false)
      // 每个任务解析出自己那条上游地址，不会串到别的任务上。
      assert.notEqual(secondTask.upstreamUrl, firstTask.upstreamUrl)
      assert.notEqual(request.references[0].pathOrUrl, secondTask.id)
    } finally {
      await h.close()
    }
  })
})

test('E2E #3186 负路径: 中枢缝的可读原因落到任务记录，而不是通用 500', async (t) => {
  await t.test('缝抛出未配置错误：POST 返回 202，失败原因出现在任务记录上', async () => {
    const failure = new Error('本机 Google Vids 通道未配置：未找到可用的 vids2api 服务地址')
    failure.code = 'omnimux-unconfigured'
    const h = await createHarness({
      seam: {
        async execute() {
          throw failure
        },
      },
    })
    try {
      const created = await postTask(h.origin, { prompt: '一段测试视频', mode: 'create', seconds: 10 })
      assert.equal(created.status, 202)

      const task = await settleTask(h.origin, created.body.task.id)
      assert.equal(task.status, 'failed')
      assert.equal(task.error, failure.message)
      assert.equal(task.message, failure.message)
      assert.equal(task.errorCode, 'omnimux-unconfigured')
      // 结果卡读的是任务记录：可读原因必须原样到达，不能被压成通用文案。
      assert.match(task.error, /本机 Google Vids 通道未配置/)
      assert.notEqual(task.error, 'internal')
      assert.equal(task.videoUrl, undefined)
    } finally {
      await h.close()
    }
  })

  await t.test('源片段解析不到上游地址：报可读原因，不猜一个任务号顶上', async () => {
    const h = await createHarness()
    try {
      const created = await postTask(h.origin, {
        prompt: '延续一个不存在的片段',
        mode: 'extend',
        seconds: 4,
        video_id: 'task_veo_does_not_exist',
      })
      assert.equal(created.status, 202)
      const task = await settleTask(h.origin, created.body.task.id)
      assert.equal(task.status, 'failed')
      assert.match(task.error, /无法解析前序任务 task_veo_does_not_exist 的取片地址/)
      assert.equal(h.recorded.length, 0)
    } finally {
      await h.close()
    }
  })
})

test('E2E #3186 负路径: 缝缺失时 opencli/桥接门禁仍然生效（503），缝可用时门禁不参与', async (t) => {
  await t.test('缝缺失 + opencli 未安装 → 503 opencli-missing，且不启动内部驱动', async () => {
    const h = await createHarness({
      hubAvailable: () => false,
      detectEnv: () => ({ installed: false, bridgeConnected: false, version: 'stub' }),
    })
    try {
      const res = await postTask(h.origin, { prompt: '一段测试视频', mode: 'create', seconds: 10 })
      assert.equal(res.status, 503)
      assert.equal(res.body.error, 'opencli-missing')
      assert.equal(h.calls.generate, 0)
      assert.equal(h.recorded.length, 0)
    } finally {
      await h.close()
    }
  })

  await t.test('缝缺失 + 桥接未连接 → 503 opencli-bridge-disconnected', async () => {
    const h = await createHarness({
      hubAvailable: () => false,
      detectEnv: () => ({ installed: true, bridgeConnected: false, version: 'stub' }),
    })
    try {
      const res = await postTask(h.origin, { prompt: '一段测试视频', mode: 'create', seconds: 10 })
      assert.equal(res.status, 503)
      assert.equal(res.body.error, 'opencli-bridge-disconnected')
      assert.equal(h.calls.generate, 0)
    } finally {
      await h.close()
    }
  })

  await t.test('缝可用 + opencli 未安装/未连接 → 202 并真的走中枢生成', async () => {
    const h = await createHarness({
      hubAvailable: () => true,
      detectEnv: () => ({ installed: false, bridgeConnected: false, version: 'stub' }),
    })
    try {
      const res = await postTask(h.origin, { prompt: '一段测试视频', mode: 'create', seconds: 10 })
      assert.equal(res.status, 202)
      const task = await settleTask(h.origin, res.body.task.id)
      assert.equal(task.status, 'completed')
      assert.equal(task.channel, 'hub')
      assert.equal(h.calls.generate, 1)
      assert.equal(h.recorded.length, 1)

      const health = await fetch(`${h.origin}${VEO_PREFIX}/health`)
      const healthBody = await health.json()
      assert.equal(health.status, 200)
      assert.equal(healthBody.ok, true)
      assert.deepEqual(healthBody.hub, { available: true })
    } finally {
      await h.close()
    }
  })
})
