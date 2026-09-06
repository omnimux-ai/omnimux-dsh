/**
 * Phase 4 退回修复的路由级回归（严过关 R1/R2）：
 * - R1：GET /dsh-publish/media/content 此前在路由作用域引用 dispatcher 闭包外的
 *   `media` 变量 → 必现 500。现走 dispatcher.openMedia，测试走完整 handler。
 * - R2：POST /records/submit 此前后台 runner `.catch(() => {})` 静默吞错，
 *   validation 阶段失败（账本零变化）会让 UI 轮询空转到超时。现拆
 *   prepare（同步校验+物化，失败回 4xx）+ dispatch（后台，整段失败落
 *   record.error + revision bump）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { parsePublishConfig } from './config.js'
import { createPublishDispatcher, registerPublishRoutes } from './http-routes.js'
import { createHubChannel } from './hubtools.js'
import { createAccountSource } from './accounts.js'
import { createMediaStore } from './media.js'
import { createRecordStore, PublishError } from './store.js'
import { createSubmitService } from './submit.js'

/** @type {string} */
let dir = ''
/** @type {ReturnType<typeof createRecordStore>} */
let store = ''
/** @type {ReturnType<typeof createMediaStore>} */
let media = ''
/** @type {Record<string, Function>} */
let handlers = {}
/** @type {{ calls: unknown[] }} */
let tools = ''
/** @type {ReturnType<typeof createSubmitService>} */
let service = ''
/** @type {ReturnType<typeof createPublishDispatcher>} */
let dispatcher = ''
let tick = 0

function mockTools() {
  const calls = []
  return {
    calls,
    get: (name) => (name in handlers ? { name } : undefined),
    async execute(exec) {
      calls.push(exec)
      const handler = handlers[exec.name]
      if (!handler) return { content: [{ type: 'text', text: `UNKNOWN_TOOL ${exec.name}` }], isError: true, value: undefined }
      try {
        return { content: [{ type: 'text', text: 'ok' }], isError: false, value: await handler(exec.arguments, exec) }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true, value: undefined }
      }
    },
  }
}

const LOCAL = { origin: 'http://127.0.0.1:65432', 'sec-fetch-site': 'same-origin' }

/** 模拟 Node req/res；end() 兼容 JSON 与二进制两种响应体。 */
function mockReqRes({ method = 'GET', url = '/', headers = {}, body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))]
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
  /** @type {{ status: number, raw: unknown, body: unknown, headers: Record<string, string> }} */
  const captured = { status: 0, raw: undefined, body: undefined, headers: {} }
  const res = {
    writeHead(status, hdrs) {
      captured.status = status
      Object.assign(captured.headers, hdrs || {})
    },
    end(text) {
      captured.raw = text
      if (typeof text !== 'string' || text === '') return
      try {
        captured.body = JSON.parse(text)
      } catch {
        captured.body = text
      }
    },
  }
  return { req, res, captured }
}

/**
 * 组一个带真实（或注入）service 的完整路由 handler。
 * @param {Record<string, Function>} [handlerOverrides]
 * @param {Partial<ReturnType<typeof createSubmitService>>} [serviceOverride]
 */
function makeHandler(handlerOverrides = {}, serviceOverride) {
  handlers = {
    omnimux_accounts_list: () => ({
      success: true,
      data: { accounts: [{ id: 'acc-1', provider: 'tiktok_direct', platform: 'tiktok', username: 'one', status: 'active' }] },
    }),
    omnimux_publish_presign: (args) => ({ success: true, data: { upload_url: `https://up/${args.filename}`, public_url: `https://pub/${args.filename}` } }),
    omnimux_publish_create: (args) => ({ success: true, data: { id: `post-${args.account_ids[0]}` } }),
    omnimux_publish_get: () => ({ success: true, data: { id: 1, status: 'published' } }),
    ...handlerOverrides,
  }
  tools = mockTools()
  const channel = createHubChannel({ tools, fetcher: async () => ({ ok: true, status: 200 }) })
  const accounts = createAccountSource({ channel, overlayPath: '' })
  const config = parsePublishConfig({ dataDir: dir, submitTimeoutSeconds: 5 })
  service = serviceOverride ?? createSubmitService({
    store, media, channel, accounts, config,
    now: () => new Date(2026, 0, 1, 0, 0, ++tick).toISOString(),
  })
  dispatcher = createPublishDispatcher({ store, media, accounts, service, config })
  const routes = []
  const webServer = { register: (route) => { routes.push(route); return () => {} } }
  registerPublishRoutes(webServer, dispatcher)
  return routes[0].handler
}

/** 带媒体 + 已挂账号的草稿（account_ids 随 create 存入，复现 agent 建稿路径）。 */
function seedSubmittableDraft() {
  const src = join(dir, `draft-${++tick}.png`)
  writeFileSync(src, Buffer.from('draft-media'))
  const { media: row } = media.importPath(src)
  const created = store.create({
    type: 'image',
    title: 'T', description: 'D', media_ids: [row.id],
    account_ids: ['acc-1'],
  })
  return created.id
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-publish-r12-'))
  tick = 0
  store = createRecordStore({
    paths: { recordsFile: join(dir, 'records.json') },
    now: () => new Date(2026, 0, 1, 0, 0, ++tick).toISOString(),
  })
  media = createMediaStore({
    paths: { mediaIndexFile: join(dir, 'media.json'), mediaDir: join(dir, 'media') },
    maxBytes: 1024 * 1024,
  })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('R1：GET /dsh-publish/media/content（完整 handler）', () => {
  it('serves uploaded bytes with the stored content type and length', async () => {
    const handler = makeHandler()
    const up = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/media?filename=shot.png',
      headers: { ...LOCAL, 'content-type': 'image/png' },
      body: Buffer.from('png-bytes-123'),
    })
    await handler(up.req, up.res)
    assert.equal(up.captured.status, 200)
    const mediaId = up.captured.body.media.id
    const { req, res, captured } = mockReqRes({ method: 'GET', url: `/dsh-publish/media/content?id=${mediaId}` })
    await handler(req, res)
    assert.equal(captured.status, 200)
    assert.equal(captured.headers['Content-Type'], 'image/png')
    assert.equal(captured.headers['Content-Length'], '13')
    assert.equal(String(captured.raw), 'png-bytes-123')
  })

  it('answers 404 media-not-found for unknown ids（不再 500）', async () => {
    const handler = makeHandler()
    const { req, res, captured } = mockReqRes({ method: 'GET', url: '/dsh-publish/media/content?id=deadbeef' })
    await handler(req, res)
    assert.equal(captured.status, 404)
    assert.equal(captured.body.error, 'media-not-found')
  })

  it('404 for a missing content file under an existing index row', async () => {
    const handler = makeHandler()
    const up = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/media?filename=gone.png',
      headers: { ...LOCAL, 'content-type': 'image/png' },
      body: Buffer.from('bytes'),
    })
    await handler(up.req, up.res)
    const mediaId = up.captured.body.media.id
    rmSync(join(dir, 'media', mediaId))
    const { req, res, captured } = mockReqRes({ method: 'GET', url: `/dsh-publish/media/content?id=${mediaId}` })
    await handler(req, res)
    assert.equal(captured.status, 404)
    assert.equal(captured.body.error, 'media-not-found')
  })
})

describe('R2：POST /dsh-publish/records/submit 不静默失败', () => {
  it('validation 阶段失败（未登录）→ 4xx JSON 直达调用方，不是 started:true', async () => {
    const handler = makeHandler({
      omnimux_accounts_list: () => {
        throw new PublishError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      },
    })
    const recordId = seedSubmittableDraft()
    const { req, res, captured } = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/records/submit',
      headers: LOCAL,
      body: { record_id: recordId },
    })
    await handler(req, res)
    assert.equal(captured.status, 503)
    assert.equal(captured.body.error, 'needs-omnimux')
    assert.equal(captured.body.started, undefined)
    // 账本未被污染：仍是 draft、无子任务
    const view = store.getView(recordId)
    assert.equal(view.status, 'draft')
    assert.equal(view.subtasks.length, 0)
  })

  it('legacy non-official account fails submit validation with details', async () => {
    const handler = makeHandler({
      omnimux_accounts_list: () => ({
        success: true,
        data: { accounts: [{ id: 'acc-1', platform: 'bilibili', username: 'bili', status: 'active' }] },
      }),
    })
    // 已保存的非官方账号不能被提交。
    const recordId = seedSubmittableDraft()
    const { req, res, captured } = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/records/submit',
      headers: LOCAL,
      body: { record_id: recordId },
    })
    await handler(req, res)
    assert.equal(captured.status, 409)
    assert.equal(captured.body.error, 'account-provider-mismatch')
    assert.ok(Array.isArray(captured.body.details.errors))
  })

  it('后台 dispatch 整段意外失败 → record.error 落账本 + revision bump（轮询可见）', async () => {
    // 假 service：prepare 成功，dispatch 整段炸掉（模拟物化后的全局性失败）
    const fakeService = {
      run: () => Promise.reject(new Error('boom')),
      prepare: async () => {},
      dispatch: () => Promise.reject(new Error('boom')),
      refresh: async () => { throw new Error('unused') },
      retryTask: async () => { throw new Error('unused') },
      dispose: () => {},
    }
    const handler = makeHandler({}, fakeService)
    const recordId = seedSubmittableDraft()
    const revBefore = store.revision()
    const { req, res, captured } = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/records/submit',
      headers: LOCAL,
      body: { record_id: recordId },
    })
    await handler(req, res)
    assert.equal(captured.status, 200)
    assert.equal(captured.body.started, true)
    await new Promise((resolve) => { setTimeout(resolve, 20) }) // 等 runner catch 落账本
    const view = store.getView(recordId)
    assert.match(String(view.error), /submit runner failed: boom/)
    assert.ok(store.revision() > revBefore, 'revision must bump so state?rev= polling sees the failure')
  })

  it('正常路径回归：prepare 通过 + 后台 create 完成，子任务 submitted，record.error 为空', async () => {
    const handler = makeHandler()
    const recordId = seedSubmittableDraft()
    const { req, res, captured } = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/records/submit',
      headers: LOCAL,
      body: { record_id: recordId },
    })
    await handler(req, res)
    assert.equal(captured.status, 200)
    assert.equal(captured.body.started, true)
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    const view = store.getView(recordId)
    assert.equal(view.status, 'submitted')
    assert.equal(view.subtask_summary.submitted, 1)
    assert.equal(view.error, null)
  })

  it('record.error 在下一次 materialize 时被清掉（重提交不留旧错误）', async () => {
    makeHandler()
    const recordId = seedSubmittableDraft()
    // 落一个 record 级错误（模拟上一轮 runner 失败）
    store.setRecordError(recordId, 'stale failure')
    assert.match(String(store.getView(recordId).error), /stale failure/)
    // 新一轮物化清掉旧错误
    store.materialize(recordId, [{ id: 'acc-1', provider: 'tiktok_direct', platform: 'tiktok' }])
    const view = store.getView(recordId)
    assert.equal(view.error, null)
    assert.equal(view.status, 'submitted')
  })
})
