import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { parsePublishConfig } from './config.js'
import { createPublishDispatcher, registerPublishRoutes, assertLocalWrite, sendJson } from './http-routes.js'
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
/** @type {{ calls: Array<{ name: string, arguments: object }> }} */
let tools = ''
/** @type {ReturnType<typeof createPublishDispatcher>} */
let dispatcher = ''
/** @type {ReturnType<typeof createSubmitService>} */
let service = ''
let tick = 0

function mockTools() {
  const calls = []
  return {
    calls,
    get: (name) => (name in handlers ? { name } : undefined),
    async execute(exec) {
      calls.push({ name: exec.name, arguments: exec.arguments, exec })
      const handler = handlers[exec.name]
      if (!handler) return { content: [{ type: 'text', text: `UNKNOWN_TOOL ${exec.name}` }], isError: true, value: undefined }
      try {
        const value = await handler(exec.arguments, exec)
        return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false, value }
      } catch (error) {
        return { content: [{ type: 'text', text: `${error.name}: ${error.message}` }], isError: true, value: undefined }
      }
    },
  }
}

function freshDispatcher(handlerOverrides = {}) {
  handlers = {
    omnimux_accounts_list: () => ({
      success: true,
      data: { accounts: [{ id: 'acc-1', platform: 'xiaohongshu', username: 'red', status: 'active' }] },
    }),
    omnimux_publish_presign: (args) => ({ success: true, data: { upload_url: `https://up/${args.filename}`, public_url: `https://pub/${args.filename}` } }),
    omnimux_publish_create: (args) => ({ success: true, data: { id: `post-${args.account_ids[0]}` } }),
    omnimux_publish_get: () => ({ success: true, data: { id: 1, status: 'published' } }),
    ...handlerOverrides,
  }
  tools = mockTools()
  // 预签名 PUT 走 mock fetcher（测试环境不打真网络）
  const fetcher = async () => ({ ok: true, status: 200 })
  const channel = createHubChannel({ tools, fetcher })
  const accounts = createAccountSource({ channel, overlayPath: '' })
  const config = parsePublishConfig({ dataDir: dir, submitTimeoutSeconds: 5 })
  service = createSubmitService({ store, media, channel, accounts, config, now: () => new Date(2026, 0, 1, 0, 0, ++tick).toISOString() })
  dispatcher = createPublishDispatcher({ store, media, accounts, service, config })
  return dispatcher
}

/** 模拟 Node req/res 的极简 harness。 */
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

const LOCAL = { origin: 'http://127.0.0.1:65432', 'sec-fetch-site': 'same-origin' }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-publish-http-'))
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

describe('registerPublishRoutes: 前缀路由全家', () => {
  async function call({ method, url, headers = {}, body }) {
    freshDispatcher()
    const routes = []
    const webServer = { register: (route) => { routes.push(route); return () => {} } }
    registerPublishRoutes(webServer, dispatcher)
    const { req, res, captured } = mockReqRes({ method, url, headers, body })
    const matched = routes.find((r) => url.startsWith(r.path)) || routes[0]
    await matched.handler(req, res)
    return captured
  }

  it('GET /omnimux/publish/state and /dsh-publish/state answer revision and cheap polling', async () => {
    const first = await call({ method: 'GET', url: '/omnimux/publish/state' })
    assert.equal(first.status, 200)
    assert.equal(first.body.rev, 0)
    assert.equal(first.body.unchanged, false)
    assert.deepEqual(first.body.counts, {
      total: 0,
      draft: 0,
      submitted: 0,
      reviewing: 0,
      published: 0,
      failed: 0,
    })
    const same = await call({ method: 'GET', url: `/omnimux/publish/state?rev=${first.body.rev}` })
    assert.equal(same.body.unchanged, true)

    // Legacy alias also works seamlessly
    const legacy = await call({ method: 'GET', url: '/dsh-publish/state' })
    assert.equal(legacy.status, 200)
    assert.equal(legacy.body.rev, 0)
  })

  it('GET /omnimux/publish/records filters the three tabs', async () => {
    freshDispatcher()
    dispatcher.createDraft({ type: 'image', payload: { title: '草稿', description: '描述' } })
    const result = await call({ method: 'GET', url: '/omnimux/publish/records?status=draft' })
    assert.equal(result.status, 200)
    assert.equal(result.body.records.length, 1)
    assert.equal(result.body.records[0].title, '草稿')
  })

  it('GET /omnimux/publish/capabilities serves the merged matrix (表单裁剪数据源)', async () => {
    const result = await call({ method: 'GET', url: '/omnimux/publish/capabilities' })
    assert.equal(result.status, 200)
    assert.equal(result.body.platforms.xiaohongshu.supports_cover, false)
    assert.equal(result.body.statusMap.published, 'published')
  })

  it('unknown route → 404', async () => {
    const result = await call({ method: 'GET', url: '/dsh-publish/nope' })
    assert.equal(result.status, 404)
  })

  it('cross-origin POST → 403（跨源写拒绝）', async () => {
    const result = await call({
      method: 'POST',
      url: '/dsh-publish/drafts',
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      body: { type: 'image' },
    })
    assert.equal(result.status, 403)
    assert.equal(result.body.error, 'not-local')
  })

  it('local POST drafts → 200 with record view', async () => {
    const result = await call({
      method: 'POST',
      url: '/dsh-publish/drafts',
      headers: LOCAL,
      body: { type: 'image', payload: { title: 'T', description: 'D' } },
    })
    assert.equal(result.status, 200)
    assert.match(result.body.record.id, /^rec_/)
    // 草稿阶段内容校验错误同源暴露（无媒体 → image-required）
    assert.ok(result.body.content_errors.some((e) => e.code === 'image-required'))
  })

  it('invalid JSON body → 400', async () => {
    const captured = await (async () => {
      freshDispatcher()
      const routes = []
      const webServer = { register: (route) => { routes.push(route); return () => {} } }
      registerPublishRoutes(webServer, dispatcher)
      const { req, res, captured: cap } = mockReqRes({
        method: 'POST',
        url: '/dsh-publish/drafts',
        headers: LOCAL,
        body: Buffer.from('{broken'),
      })
      await routes[0].handler(req, res)
      return cap
    })()
    assert.equal(captured.status, 400)
    assert.equal(captured.body.error, 'invalid-json')
  })

  it('drafts/delete without confirm → 400 confirm-required', async () => {
    freshDispatcher()
    const created = dispatcher.createDraft({ type: 'image', payload: { title: 'T' } })
    const result = await call({
      method: 'POST',
      url: '/dsh-publish/drafts/delete',
      headers: LOCAL,
      body: { draft_id: created.record.id },
    })
    assert.equal(result.status, 400)
    assert.equal(result.body.error, 'confirm-required')
    const confirmed = await call({
      method: 'POST',
      url: '/dsh-publish/drafts/delete',
      headers: LOCAL,
      body: { draft_id: created.record.id, confirm: true },
    })
    assert.equal(confirmed.status, 200)
    assert.deepEqual(confirmed.body, { id: created.record.id, deleted: true })
  })

  it('POST /dsh-publish/media ingests raw bytes (sha256 入库)', async () => {
    const result = await call({
      method: 'POST',
      url: '/dsh-publish/media?filename=shot.png',
      headers: { ...LOCAL, 'content-type': 'image/png' },
      body: Buffer.from('png-bytes'),
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.media.filename, 'shot.png')
    assert.equal(result.body.media.kind, 'image')
    assert.equal(media.open(result.body.media.id).buffer.toString(), 'png-bytes')
  })

  it('POST /dsh-publish/records/submit starts in background and answers immediately', async () => {
    let release
    handlers = {}
    freshDispatcher({
      omnimux_publish_create: async (args) => {
        if (!release) release = new Promise((r) => setTimeout(r, 20))
        await release
        return { success: true, data: { id: `post-${args.account_ids[0]}` } }
      },
    })
    const { media: row } = media.importBuffer(Buffer.from('bytes'), { filename: 'a.png', content_type: 'image/png' })
    store.create({ type: 'image', title: 'T', media_ids: [row.id], account_ids: ['acc-1'] })
    const routes = []
    const webServer = { register: (route) => { routes.push(route); return () => {} } }
    registerPublishRoutes(webServer, dispatcher)
    const { req, res, captured } = mockReqRes({
      method: 'POST',
      url: '/dsh-publish/records/submit',
      headers: LOCAL,
      body: { record_id: store.listViews({}).records[0].id },
    })
    await routes[0].handler(req, res)
    assert.equal(captured.status, 200)
    assert.equal(captured.body.started, true) // 立即返回
    await new Promise((r) => setTimeout(r, 60)) // 等 runner 完成
    const view = store.listViews({ status_filter: 'submitted' }).records[0]
    assert.equal(view.subtask_summary.submitted, 1)
  })

  it('PublishError codes map to HTTP statuses', async () => {
    freshDispatcher()
    const result = await call({
      method: 'POST',
      url: '/dsh-publish/records/refresh',
      headers: LOCAL,
      body: { record_id: 'rec_missing' },
    })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'record-not-found')
  })
})

describe('sendJson secret guard（自实现）', () => {
  it('refuses to emit bodies containing tokens', () => {
    /** @type {{ status: number, body: unknown, headers: Record<string, string> }} */
    const captured = { status: 0, body: undefined, headers: {} }
    const res = {
      writeHead(status, hdrs) {
        captured.status = status
        Object.assign(captured.headers, hdrs || {})
      },
      end(text) {
        captured.body = JSON.parse(text)
      },
    }
    sendJson(res, 200, { note: 'access_token leak' })
    assert.equal(captured.status, 500)
    assert.equal(captured.body.error, 'refused to emit a secret')
    const res2 = {
      writeHead(status) {
        captured.status = status
      },
      end(text) {
        captured.body = JSON.parse(text)
      },
    }
    sendJson(res2, 200, { ok: true })
    assert.equal(captured.status, 200)
  })
})

describe('assertLocalWrite（自实现 loopback 校验）', () => {
  it('allows no-origin (curl / Electron IPC) and loopback origins', () => {
    assert.doesNotThrow(() => assertLocalWrite({}))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://127.0.0.1:1' }))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://localhost:1' }))
    assert.doesNotThrow(() => assertLocalWrite({ referer: 'http://[::1]:2/x' }))
  })

  it('refuses cross-site and non-loopback origins', () => {
    assert.throws(() => assertLocalWrite({ 'sec-fetch-site': 'cross-site' }))
    assert.throws(() => assertLocalWrite({ origin: 'https://evil.example' }))
    assert.throws(() => assertLocalWrite({ origin: 'http://192.168.1.5:8080' }))
    assert.throws(() => assertLocalWrite({ referer: 'https://evil.example/x' }))
  })
})

describe('dispatcher 同源约束（工具面 = HTTP 面同一函数）', () => {
  it('dispatcher methods back both faces: createDraft + listRecords + capabilities + importPath', async () => {
    freshDispatcher()
    const created = dispatcher.createDraft({ type: 'video', payload: { description: '视频描述', media: [] } })
    assert.ok(created.record.id)
    const listed = dispatcher.listRecords({ status_filter: 'draft' })
    assert.equal(listed.records.length, 1)
    const caps = dispatcher.capabilities()
    assert.ok(caps.platforms.douyin)
    assert.throws(() => dispatcher.importPath(join(dir, 'nonexistent.png')), (e) => e.code === 'path-not-found')
  })

  it('createDraft with a media path imports through the MediaStore', async () => {
    freshDispatcher()
    const src = join(dir, 'cover.png')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(src, Buffer.from('cover-bytes'))
    const result = dispatcher.createDraft({ type: 'image', payload: { title: 'T', media: [{ path: src }] } })
    assert.equal(result.record.media_ids.length, 1)
    assert.equal(media.open(result.record.media_ids[0]).buffer.toString(), 'cover-bytes')
  })

  it('read-only draft detail restores media and saving the restored payload preserves references', async () => {
    freshDispatcher()
    const row = media.importBuffer(Buffer.from('fixture image'), { filename: 'restore.png', content_type: 'image/png' }).media
    const created = store.create({ type: 'image', title: 'Restore', media_ids: [row.id] })
    const detail = await dispatcher.getRecord({ record_id: created.id, refresh: false })
    assert.deepEqual(detail.media, [{ id: row.id, kind: 'image', filename: 'restore.png', content_type: 'image/png' }])
    const saved = await dispatcher.updateDraft({ draft_id: created.id, patch: {
      title: 'Restored and saved', media: detail.media.map((item) => ({ media_id: item.id })),
    } })
    assert.deepEqual(saved.record.media_ids, [row.id])
    assert.equal(tools.calls.length, 0)
  })

  it('draft result carries media rows (kind/filename) for browser-side restore', async () => {
    freshDispatcher()
    const src = join(dir, 'pic2.png')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(src, Buffer.from('pic2'))
    const created = dispatcher.createDraft({ type: 'image', payload: { title: 'T', media: [{ path: src }] } })
    assert.equal(created.media.length, 1)
    assert.equal(created.media[0].kind, 'image')
    assert.equal(created.media[0].filename, 'pic2.png')
  })

  it('updateDraft with account_ids routes through the assign validation path（同源）', async () => {
    freshDispatcher()
    const src = join(dir, 'pic3.png')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(src, Buffer.from('pic3'))
    const created = dispatcher.createDraft({ type: 'image', payload: { title: 'T', media: [{ path: src }] } })
    // 不存在的账号 → validation-failed（与 publish_assign_accounts 同一条校验）
    await assert.rejects(
      () => dispatcher.updateDraft({ draft_id: created.record.id, patch: { account_ids: ['ghost'] } }),
      (e) => e instanceof PublishError && e.code === 'validation-failed',
    )
    // 合法账号挂载成功
    const updated = await dispatcher.updateDraft({ draft_id: created.record.id, patch: { account_ids: ['acc-1'] } })
    assert.deepEqual(updated.record.account_ids, ['acc-1'])
    // 清空选择也可以
    const cleared = await dispatcher.updateDraft({ draft_id: created.record.id, patch: { account_ids: [] } })
    assert.deepEqual(cleared.record.account_ids, [])
  })

  it('assignAccounts validates availability and conflicts (与 submit 同一份校验)', async () => {
    freshDispatcher()
    const src = join(dir, 'pic.png')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(src, Buffer.from('pic'))
    const created = dispatcher.createDraft({ type: 'image', payload: { title: 'T', media: [{ path: src }] } })
    // 平台 xiaohongshu 支持 image → 通过
    const assigned = await dispatcher.assignAccounts({ draft_id: created.record.id, account_ids: ['acc-1'] })
    assert.deepEqual(assigned.record.account_ids, ['acc-1'])
    // 不存在的账号 → validation-failed
    await assert.rejects(
      () => dispatcher.assignAccounts({ draft_id: created.record.id, account_ids: ['ghost'] }),
      (e) => e instanceof PublishError && e.code === 'validation-failed',
    )
  })
})
