/**
 * plugins/omnimux-video/src/hubSeamAccessor.test.js
 *
 * Issue #3189 —— 中枢 `videoGenerate` 缝未在插件 `inject` 中声明时的安全取值回归。
 *
 * 判定器（oracle）是**真实 Host 行为**，不是普通对象：
 * 真实 Host（`@deepseek-ai/cordis` v4 `ReflectService.handler.get`）对未在 `inject` 中声明的服务，
 * 读取 `ctx.<name>` 会**抛错** `cannot get property "<name>" without inject`，而不是返回 `undefined`。
 * 本文件的 `createHostLikeContext` 复刻该语义：未声明属性抛同类错误，安全取值器 `ctx.get(name)`
 * 照常返回（未注册即 `undefined`），嵌套 `ctx.inject(deps, cb)` 的回调 ctx 声明 `deps`（与真实
 * cordis 的 `inject(inject, callback)` → `plugin({inject, apply})` 同构）。
 *
 * 因此本文件在修复前必须失败、修复后必须通过：
 * 修复前 `getVideoGenerate()` 先读 `ctx.videoGenerate` → 抛错 → 插件自己的 HTTP 面 500
 * （与运行中 Dev 应用观测到的 `{"error":"internal","message":"cannot get property \"videoGenerate\" without inject"}` 同形）。
 *
 * 被测量的对象是**真实装配路径**：真实 `apply()`（`./index.js`）+ 真实 `registerVeoRoutes` +
 * 真实 `createVeoDispatcher` + 真实 `createHubVidsGenerator`，挂在真实 `node:http` 服务上，
 * 用 `fetch` 走插件自己的 HTTP 面。唯一的替身是中枢缝本身（本机 vids2api 不在单元测试范围内）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'

import { apply, inject as pluginInject } from './index.js'

const VEO_PREFIX = '/omnimux-video/api/veo'

/** 替身缝返回的取片地址基址：本机假上游，绝不发真实请求。 */
const FAKE_UPSTREAM_BASE = 'http://127.0.0.1:59998'

/* ------------------------------------------------------------------ 真实 Host 同构 ctx */

/** 与真实 cordis `isSpecialProperty` 同构：符号 / 保留字 / 数字 / 下划线前缀不做守卫。 */
const RESERVED_WORDS = ['prototype', 'then']

function isSpecialProperty(prop) {
  return (
    typeof prop === 'symbol' ||
    RESERVED_WORDS.includes(prop) ||
    String(parseInt(String(prop))) === String(prop) ||
    String(prop).startsWith('_')
  )
}

/**
 * 构造与真实 Host 同构的 `ctx`。
 *
 * - `services` 里注册的服务**只有**出现在 `declared` 中时才可通过 `ctx.<name>` 读取；
 *   否则读取抛 `cannot get property "<name>" without inject`（真实 cordis 语义）。
 * - `ctx.get(name)` 是安全取值器：任何情况下都返回服务或 `undefined`，不抛错。
 * - `ctx.inject(deps, cb)` 与真实 cordis 同构：回调收到声明了 `deps` 的派生 ctx。
 *
 * @param {{ services?: Record<string, unknown>, declared?: string[] }} [options]
 */
function createHostLikeContext({ services = {}, declared = [] } = {}) {
  const registry = new Map(Object.entries(services))
  /** @type {string[]} */
  const provided = []
  /** @type {{ label?: string, dispose: unknown }[]} */
  const effects = []

  const build = (declaredSet) => {
    const target = {
      // ctx API：真实 cordis 上这些始终可用。
      get(name) {
        return registry.get(name)
      },
      provide(name, value) {
        registry.set(name, value)
        provided.push(name)
      },
      effect(factory, label) {
        const dispose = factory()
        effects.push({ label, dispose })
        return dispose
      },
      inject(deps, callback) {
        return callback(build(new Set([...declaredSet, ...deps])))
      },
      on() {
        return () => {}
      },
      emit() {},
    }
    for (const name of declaredSet) {
      if (registry.has(name)) target[name] = registry.get(name)
    }
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (isSpecialProperty(prop)) return Reflect.get(t, prop, receiver)
        if (Reflect.has(t, prop)) return Reflect.get(t, prop, receiver)
        throw new Error(`cannot get property "${prop}" without inject`)
      },
    })
  }

  return { ctx: build(new Set(declared)), provided, effects }
}

/* ------------------------------------------------------------------ 真实媒体字节 */

/** 最小但真实的 MP4 容器：`ftyp` + `mdat`。断言的是字节本身。 */
function buildMinimalMp4() {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2avc1mp41', 'ascii'),
  ])
  const payload = Buffer.from('omnimux-vids-seam-accessor-3189-payload', 'utf8')
  const size = Buffer.alloc(4)
  size.writeUInt32BE(8 + payload.length, 0)
  return Buffer.concat([ftyp, size, Buffer.from('mdat', 'ascii'), payload])
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
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
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

/** 真实可解码的 1×1 PNG：上传路由按魔数判定类型，这里给真图而非伪造头。 */
function buildTinyPng() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const idat = zlib.deflateSync(Buffer.from([0x00, 0x20, 0x40, 0x60]))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const TINY_PNG = buildTinyPng()

/* ------------------------------------------------------------------ 装配 */

/** 替身中枢缝：记录确切请求对象 → 写真实 MP4 到 `request.dest` → 返回上游标识。 */
function createStubHubSeam({ recorded, counter }) {
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
        url: `${FAKE_UPSTREAM_BASE}/videos/${taskId}/content`,
        dest: request.dest,
      }
    },
  }
}

/**
 * 用真实 `apply()` 把插件挂到与真实 Host 同构的 ctx 上，并在真实 HTTP 服务上暴露其路由。
 *
 * @param {{ provideSeam?: boolean }} [options]
 */
async function createHarness(options = {}) {
  /** @type {object[]} */
  const recorded = []
  const counter = { n: 0 }
  const seam = createStubHubSeam({ recorded, counter })
  /** @type {object[]} */
  const tools = []
  /** @type {Function | null} */
  let handler = null

  const services = {
    // 与宿主一致：tools 是服务，插件经 ctx.tools.register 注册工具。
    tools: {
      register(tool) {
        tools.push(tool)
        return () => {}
      },
    },
    textComplete: { execute: async () => ({ text: 'stub' }) },
    webServer: {
      register(route) {
        handler = route.handler
        return () => {
          handler = null
        }
      },
    },
    // 与宿主一致：连接服务提供同源准入。
    connection: { requestRejection: () => undefined },
  }
  // 中枢缝经**安全取值器**可读；故意不进入 `declared`，与真实 Host 下未声明 inject 一致。
  if (options.provideSeam !== false) services.videoGenerate = seam

  const host = createHostLikeContext({ services, declared: pluginInject })

  // 真实装配路径：未声明 videoGenerate，缝只能经 ctx.get 解析。
  apply(host.ctx, {})

  assert.equal(typeof handler, 'function', 'apply() 未把 /api/veo 路由挂到 webServer 上')

  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((error) => {
        // 与运行中 Host 的 500 信封同形：路由抛错 → 内部错误响应，而不是进程崩溃。
        if (res.headersSent) {
          res.destroy()
          return
        }
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal', message: error && error.message }))
      })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${server.address().port}`

  return {
    origin,
    seam,
    recorded,
    tools,
    host,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      for (const entry of host.effects) {
        if (typeof entry.dispose === 'function') entry.dispose()
      }
    },
  }
}

async function getJson(url) {
  const res = await fetch(url)
  return { status: res.status, body: await res.json() }
}

async function getHealth(origin) {
  return getJson(`${origin}${VEO_PREFIX}/health`)
}

async function postTask(origin, body) {
  const res = await fetch(`${origin}${VEO_PREFIX}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/** 轮询到终态（面板的轮询语义：GET /tasks/:id）。 */
async function settleTask(origin, id, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const res = await getJson(`${origin}${VEO_PREFIX}/tasks/${encodeURIComponent(id)}`)
    last = res.body?.task ?? null
    if (last && (last.status === 'completed' || last.status === 'failed')) return last
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`任务 ${id} 未在 ${timeoutMs}ms 内到达终态：${JSON.stringify(last)}`)
}

/** 删掉本次运行真正写出的成片，避免污染本机媒体目录。 */
function cleanupMedia(mediaDir, fileNames) {
  if (!mediaDir) return
  for (const name of fileNames) {
    if (!name) continue
    try {
      fs.rmSync(path.join(mediaDir, name), { force: true })
    } catch {
      /* 清理失败不影响判定 */
    }
  }
}

/* ------------------------------------------------------------------ 判定器自检 */

test('#3189 判定器自检：守卫型 ctx 复刻真实 Host 语义（未声明属性抛错、安全取值器可用）', () => {
  const host = createHostLikeContext({
    services: { tools: { register: () => {} }, videoGenerate: { execute: async () => ({}) } },
    declared: pluginInject,
  })

  // 与真实 Host 同类的错误，而不是 undefined。
  assert.throws(
    () => host.ctx.videoGenerate,
    (error) => {
      assert.match(error.message, /cannot get property "videoGenerate" without inject/)
      return true
    },
  )
  assert.throws(() => host.ctx.veoTasks, /cannot get property "veoTasks" without inject/)

  // 安全取值器照常应答：注册过就给值，未注册给 undefined，都不抛错。
  assert.equal(typeof host.ctx.get('videoGenerate').execute, 'function')
  assert.equal(host.ctx.get('doesNotExist'), undefined)
  assert.equal(host.ctx.get('videoGenerate') === undefined, false)

  // 已声明的服务可直接读（与真实 Host 一致）。
  assert.equal(typeof host.ctx.tools.register, 'function')
  assert.equal(typeof host.ctx.get('textComplete'), 'undefined')

  // 嵌套 inject 的回调 ctx 声明 deps，与真实 cordis 同构。
  host.ctx.inject(['webServer'], (derived) => {
    assert.throws(() => derived.videoGenerate, /cannot get property "videoGenerate" without inject/)
    assert.equal(derived.get('videoGenerate') === undefined, false)
  })

  // 反证：把 videoGenerate 加进 inject 后就不再抛错——说明判定器真的在按 inject 判定。
  const declaredHost = createHostLikeContext({
    services: { videoGenerate: { execute: async () => ({}) } },
    declared: [...pluginInject, 'videoGenerate'],
  })
  assert.equal(typeof declaredHost.ctx.videoGenerate.execute, 'function')
})

test('#3189 inject 诚实性：videoGenerate 不得进入插件 inject', () => {
  assert.ok(Array.isArray(pluginInject))
  assert.equal(pluginInject.includes('videoGenerate'), false)
  assert.deepEqual([...pluginInject].sort(), ['textComplete', 'tools'])
})

/* ------------------------------------------------------------------ 缝缺失：装载 + 回退 */

test('#3189 缝缺失：apply() 不抛错，/health 200 且走内部驱动回退（不再 500）', async (t) => {
  await t.test('未声明 videoGenerate 时装载成功，健康检查报 hub 不可用', async () => {
    const h = await createHarness({ provideSeam: false })
    try {
      const health = await getHealth(h.origin)
      // 修复前：500 + cannot get property "videoGenerate" without inject。
      assert.equal(
        health.status,
        200,
        `健康检查应 200，实际 ${health.status}：${JSON.stringify(health.body)}`,
      )
      assert.equal(health.body.hub.available, false)
      assert.equal(typeof health.body.mediaDir, 'string')
      // 健康检查内部会调用 hubAvailable() → getVideoGenerate()，因此 200 即证明缝的懒解析
      // 在未声明 inject 时不再抛错（修复前这里正是 500）。
      // 缝缺失时的 opencli / 桥接门禁（503 opencli-missing / opencli-bridge-disconnected）需要
      // 替身 detectEnv 才能在不触达真实 opencli 的前提下断言，已由
      // tests/e2e/google-vids-hub-wiring.e2e.test.mjs 覆盖，本文件不重复。
      assert.equal(h.recorded.length, 0)
    } finally {
      await h.close()
    }
  })

  await t.test('缝缺失时插件仍装载了全部工具，provide 的 seam 名不变', async () => {
    const h = await createHarness({ provideSeam: false })
    try {
      const names = h.tools.map((tool) => tool.name).sort()
      assert.deepEqual(names, ['video_analyze', 'video_depth', 'video_process', 'video_reverse_prompt'])
      assert.ok(h.host.provided.includes('videoProcess'))
      assert.ok(h.host.provided.includes('veoTasks'))
    } finally {
      await h.close()
    }
  })
})

/* ------------------------------------------------------------------ 缝可用：四模式映射 */

test('#3189 缝可用：经真实 apply() 装配，四模式仍映射到 text_to_video / first_frame / video_edit / video_extend', async (t) => {
  await t.test('创建 → text_to_video（无多余字段），终态 completed 且成片可播放', async () => {
    const h = await createHarness()
    try {
      const health = await getHealth(h.origin)
      assert.equal(
        health.status,
        200,
        `缝可用时健康检查应 200，实际 ${health.status}：${JSON.stringify(health.body)}`,
      )
      assert.equal(health.body.hub.available, true)

      const created = await postTask(h.origin, {
        prompt: '一只猫在草地上奔跑',
        mode: 'create',
        seconds: 8,
        resolution: '1080p',
        aspect_ratio: 'portrait',
      })
      assert.equal(
        created.status,
        202,
        `创建任务应 202，实际 ${created.status}：${JSON.stringify(created.body)}`,
      )
      const task = await settleTask(h.origin, created.body.task.id)
      assert.equal(task.status, 'completed')
      assert.equal(task.channel, 'hub')
      assert.equal(task.videoUrl, `${VEO_PREFIX}/media/${task.fileName}`)

      const media = await fetch(`${h.origin}${task.videoUrl}`)
      assert.equal(media.status, 200)
      assert.equal(media.headers.get('content-type'), 'video/mp4')
      assert.deepEqual(Buffer.from(await media.arrayBuffer()), MP4_BYTES)

      assert.equal(h.recorded.length, 1)
      const request = h.recorded[0]
      assert.deepEqual(request, {
        dest: path.join(health.body.mediaDir, task.fileName),
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
      cleanupMedia(health.body.mediaDir, [task.fileName])
    } finally {
      await h.close()
    }
  })

  await t.test('动画 → first_frame（只带 image）', async () => {
    const h = await createHarness()
    try {
      const health = await getHealth(h.origin)
      const uploadRes = await fetch(`${h.origin}${VEO_PREFIX}/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: TINY_PNG,
      })
      assert.equal(uploadRes.status, 200)
      const upload = await uploadRes.json()
      assert.equal(upload.url, `${h.origin}${VEO_PREFIX}/media/${upload.fileName}`)

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

      assert.equal(h.recorded.length, 1)
      assert.deepEqual(h.recorded[0], {
        dest: path.join(health.body.mediaDir, task.fileName),
        model: 'google-vids-omni',
        operation: 'first_frame',
        prompt: '让画面里的猫跑起来',
        duration: 6,
        resolution: '720p',
        aspectRatio: 'landscape',
        image: upload.url,
      })
      assert.equal('seconds' in h.recorded[0], false)
      assert.equal('references' in h.recorded[0], false)
      cleanupMedia(health.body.mediaDir, [task.fileName, upload.fileName])
    } finally {
      await h.close()
    }
  })

  await t.test('修改 → video_edit（image + references），引用前序上游取片地址', async () => {
    const h = await createHarness()
    try {
      const health = await getHealth(h.origin)
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
        dest: path.join(health.body.mediaDir, modifiedTask.fileName),
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
      assert.equal(request.references[0].pathOrUrl, `${FAKE_UPSTREAM_BASE}/videos/${sourceTask.upstreamTaskId}/content`)
      assert.equal(request.references[0].pathOrUrl.includes(sourceTask.id), false)
      cleanupMedia(health.body.mediaDir, [sourceTask.fileName, modifiedTask.fileName, upload.fileName])
    } finally {
      await h.close()
    }
  })

  await t.test('延续 → video_extend（只带 references）', async () => {
    const h = await createHarness()
    try {
      const health = await getHealth(h.origin)
      const first = await postTask(h.origin, { prompt: '第一段', mode: 'create', seconds: 8 })
      const firstTask = await settleTask(h.origin, first.body.task.id)
      const second = await postTask(h.origin, { prompt: '第二段', mode: 'create', seconds: 8 })
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

      assert.equal(h.recorded.length, 3)
      const request = h.recorded[2]
      assert.deepEqual(request, {
        dest: path.join(health.body.mediaDir, extendedTask.fileName),
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
      assert.equal(request.references[0].pathOrUrl, `${FAKE_UPSTREAM_BASE}/videos/${secondTask.upstreamTaskId}/content`)
      cleanupMedia(health.body.mediaDir, [firstTask.fileName, secondTask.fileName, extendedTask.fileName])
    } finally {
      await h.close()
    }
  })
})
