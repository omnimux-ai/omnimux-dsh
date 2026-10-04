import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { DIRECT_MEDIA_GENERATE_ROUTE, registerDirectMediaRoutes } from './direct-http.js'
import {
  createMediaTaskRecord,
  saveMediaTaskRecord,
  getMediaTaskRecord,
  findMediaTaskByRequestKey,
  updateMediaTaskRecord,
} from './task-store.js'

function response() {
  const res = {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(text) { this.body = text },
  }
  res.json = () => JSON.parse(res.body)
  return res
}

function post(body) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  stream.method = 'POST'
  stream.url = DIRECT_MEDIA_GENERATE_ROUTE
  return stream
}

function makeRoute({ calls, executeImage, storageDir }) {
  let route = null
  const webServer = { register: (definition) => { route = definition; return () => { route = null } } }
  registerDirectMediaRoutes(webServer, {
    storageDir,
    executeImage: executeImage || (async (req) => {
      calls.push({ kind: 'image', req })
      return { mode: 'live', taskId: 'task_img_123', url: 'https://example.com/x.png' }
    }),
  })
  return route
}

describe('requestKey/taskRef 账本契约（Issue #3011 · 服务端）', () => {
  let storageDir
  let cacheDir

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), 'omx-ledger-store-'))
    cacheDir = mkdtempSync(join(tmpdir(), 'omx-ledger-cache-'))
  })

  afterEach(() => {
    for (const dir of [storageDir, cacheDir]) {
      if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
  })

  const seedRecord = (patch = {}) => {
    const record = createMediaTaskRecord({
      capability: 'image',
      model: 'gpt-image-2.5',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'gpt-image-2.5',
      taskPath: 'images/generations',
      requestKey: 'req-viewer-001',
    })
    Object.assign(record, patch)
    saveMediaTaskRecord(record, { storageDir })
    return record
  }

  it('生命周期：submitting（无上游 id）→ interrupted；submitted → 续传；ready → 短路缓存', async () => {
    const calls = []
    const route = makeRoute({
      calls,
      storageDir,
      executeImage: async (req) => {
        calls.push({ kind: 'image', req })
        return { mode: 'live', taskId: 'up_1', taskRef: req.taskRef, url: 'https://example.com/done.png' }
      },
    })
    const collectBody = (taskRef) => ({
      kind: 'image', model: 'gpt-image-2.5', requestKey: 'req-viewer-001', taskRef, wait: true,
    })

    // 1) 提交尚未拿到上游 id（进程重启丢失现场）→ 任务已中断
    const record = seedRecord({ status: 'submitting' })
    const interrupted = response()
    await route.handler(post(collectBody(record.taskRef)), interrupted)
    assert.equal(interrupted.status, 500)
    assert.equal(interrupted.json().code, 'omnimux-task-interrupted')
    assert.equal(interrupted.json().error, '任务已中断，请重新提交')

    // 2) 上游已接收 → 交执行器轮询并原样透传 taskRef
    updateMediaTaskRecord(record.taskRef, { status: 'submitted', upstreamTaskId: 'up_1' }, { storageDir })
    const polled = response()
    await route.handler(post(collectBody(record.taskRef)), polled)
    assert.equal(polled.status, 200)
    assert.equal(polled.json().mode, 'live')
    assert.equal(polled.json().taskRef, record.taskRef)
    assert.equal(calls.length, 1)

    // 3) 账本 ready 且产物仍在 → 不再轮询
    const cacheFile = join(cacheDir, 'done.png')
    writeFileSync(cacheFile, 'PNG')
    updateMediaTaskRecord(record.taskRef, {
      status: 'ready',
      artifact: { cachePath: cacheFile, mimeType: 'image/png', sizeBytes: 3 },
    }, { storageDir })
    const cached = response()
    await route.handler(post(collectBody(record.taskRef)), cached)
    assert.equal(cached.status, 200)
    assert.equal(cached.json().url, cacheFile)
    assert.equal(cached.json().dest, cacheFile)
    assert.equal(calls.length, 1)
  })

  it('requestKey 幂等：账本记录可被 findMediaTaskByRequestKey 找回并携带 taskRef', () => {
    const record = seedRecord({
      status: 'submitted',
      upstreamTaskId: 'up_2',
    })
    const found = findMediaTaskByRequestKey('req-viewer-001', { storageDir })
    assert.ok(found)
    assert.equal(found.taskRef, record.taskRef)
    assert.equal(found.status, 'submitted')
  })

  it('旧 transport failed 记录按同一 taskRef 恢复成功，不发新提交', async () => {
    const calls = []
    const record = seedRecord({ status: 'failed', upstreamTaskId: 'up_3', error: '生成服务暂时不可用，请稍后重试', errorCode: 'omnimux-request-failed' })
    const route = makeRoute({ calls, storageDir, executeImage: async (req) => {
      calls.push({ kind: 'image', req })
      assert.equal(req.taskRef, record.taskRef)
      assert.equal(req.taskId, 'up_3')
      assert.equal(req.prompt, '')
      return { mode: 'live', taskRef: req.taskRef, taskId: req.taskId, url: 'https://example.com/recovered.png' }
    } })
    const res = response()
    await route.handler(post({
      kind: 'image', model: 'gpt-image-2.5', requestKey: 'req-viewer-001', taskRef: record.taskRef, wait: true,
    }), res)
    assert.equal(res.status, 200)
    assert.equal(res.json().mode, 'live')
    assert.equal(res.json().taskRef, record.taskRef)
    assert.equal(res.json().taskId, 'up_3')
    assert.equal(calls.length, 1)
    assert.equal(calls.filter(({ req }) => !req.taskId && !req.taskRef).length, 0)
  })

  it('明确上游终态 failed 记录原样回传 error/errorCode，不再轮询', async () => {
    const calls = []
    const route = makeRoute({ calls, storageDir })
    const record = seedRecord({ status: 'failed', upstreamTaskId: 'up_terminal', error: 'upstream task failed: nsfw', errorCode: 'omnimux-failed' })
    const res = response()
    await route.handler(post({ kind: 'image', model: 'gpt-image-2.5', requestKey: 'req-viewer-001', taskRef: record.taskRef, wait: true }), res)
    assert.equal(res.status, 500)
    assert.equal(res.json().code, 'omnimux-failed')
    assert.equal(res.json().error, 'upstream task failed: nsfw')
    assert.equal(calls.length, 0)
  })
})

describe('requestKey/taskRef 账本契约 · 真实 execute 行为', () => {
  let home
  let previousHome
  beforeEach(() => {
    previousHome = process.env.DSH_HOME
    home = mkdtempSync(join(tmpdir(), 'omx-execute-ledger-'))
    process.env.DSH_HOME = home
  })
  afterEach(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const input = (extra = {}) => ({ prompt: 'a lamp', model: 'gpt-image-2.5', dest: join(home, 'image.png'), requestKey: 'execute-ledger-fixture', env: { OMNIMUX_API_KEY: 'sk-fixture' }, ...extra })
  const accepted = () => {
    const record = createMediaTaskRecord({ capability: 'image', model: 'gpt-image-2.5', providerId: 'omnimux', protocol: 'openai-media', baseUrl: 'https://api.omnimux.ai/v1', wireModel: 'gpt-image-2.5', taskPath: 'images/generations', requestKey: 'execute-ledger-fixture' })
    Object.assign(record, { status: 'submitted', upstreamTaskId: 'accepted-image-fixture' })
    saveMediaTaskRecord(record)
    return record
  }

  it('提交未接单时保留 failed、错误文案与分类，未写产物', async () => {
    let submits = 0
    const failure = Object.assign(new Error('fixture submit timeout'), { code: 'ETIMEDOUT' })
    const req = input({ runtime: { async execute() { submits += 1; throw failure } } })
    await assert.rejects(() => executeOmnimuxMedia('image', req), { code: 'ETIMEDOUT', message: 'fixture submit timeout' })
    const stored = findMediaTaskByRequestKey(req.requestKey)
    assert.equal(submits, 1)
    assert.equal(stored.status, 'failed')
    assert.equal(stored.upstreamTaskId, undefined)
    assert.equal(stored.error, 'fixture submit timeout')
    assert.equal(stored.errorCode, 'ETIMEDOUT')
    assert.equal(existsSync(req.dest), false)
  })

  it('同步出图把提交前同一记录更新为 ready 并返回 taskRef，重复请求不提交', async () => {
    let submits = 0
    let pendingRef
    const req = input({ wait: false, fetcher: async (_url, init) => {
      submits += 1
      assert.equal(init.method, 'POST')
      const pending = findMediaTaskByRequestKey('execute-ledger-fixture')
      assert.equal(pending.status, 'submitting')
      pendingRef = pending.taskRef
      return json({ data: [{ b64_json: 'cG5n' }] })
    } })
    const result = await executeOmnimuxMedia('image', req)
    assert.equal(result.mode, 'live')
    assert.equal(result.taskRef, pendingRef)
    const stored = getMediaTaskRecord(result.taskRef)
    assert.equal(stored.status, 'ready')
    assert.equal(stored.artifact.cachePath, req.dest)
    assert.equal(existsSync(req.dest), true)
    assert.equal(findMediaTaskByRequestKey(req.requestKey).taskRef, pendingRef)
    const repeated = await executeOmnimuxMedia('image', req)
    assert.equal(repeated.mode, 'live')
    assert.equal(repeated.taskRef, pendingRef)
    assert.equal(submits, 1)
  })

  it('收取 transport 中断保留 submitted 与诊断，同一 taskRef 恢复成功且无 POST', async () => {
    const record = accepted()
    let gets = 0
    let posts = 0
    const req = input({ taskRef: record.taskRef, fetcher: async (url, init) => {
      if (init.method === 'POST') posts += 1
      assert.equal(init.method || 'GET', 'GET')
      gets += 1
      if (gets === 1) return json({ error: { message: 'temporary fixture transport interruption' } }, 400)
      assert.match(String(url), /images\/generations\/accepted-image-fixture$/)
      return json({ status: 'completed', data: [{ b64_json: 'cG5n' }] })
    } })
    await assert.rejects(() => executeOmnimuxMedia('image', req), (error) => {
      assert.equal(error.code, 'omnimux-request-failed')
      assert.equal(error.message, 'GET request failed (HTTP 400)')
      return true
    })
    const interrupted = getMediaTaskRecord(record.taskRef)
    assert.equal(interrupted.status, 'submitted')
    assert.equal(interrupted.upstreamTaskId, 'accepted-image-fixture')
    assert.equal(interrupted.error, undefined)
    assert.equal(interrupted.errorCode, undefined)
    assert.equal(interrupted.collectionErrorCode, 'omnimux-request-failed')
    assert.equal(interrupted.collectionError, 'GET request failed (HTTP 400)')
    const repeated = await executeOmnimuxMedia('image', input({ wait: false, fetcher: req.fetcher }))
    assert.equal(repeated.mode, 'submitted')
    assert.equal(repeated.taskRef, record.taskRef)
    assert.equal(gets, 1)
    const result = await executeOmnimuxMedia('image', req)
    assert.equal(result.mode, 'live')
    assert.equal(result.taskRef, record.taskRef)
    assert.equal(result.taskId, 'accepted-image-fixture')
    assert.equal(gets, 2)
    assert.equal(posts, 0)
    const recovered = getMediaTaskRecord(record.taskRef)
    assert.equal(recovered.status, 'ready')
    assert.equal(recovered.collectionError, undefined)
    assert.equal(recovered.collectionErrorCode, undefined)
    assert.equal(existsSync(req.dest), true)
  })

  it('收取上游明确终态失败持久化 failed、错误分类与原任务', async () => {
    const record = accepted()
    let posts = 0
    let gets = 0
    const req = input({ taskRef: record.taskRef, fetcher: async (_url, init) => {
      if (init.method === 'POST') posts += 1
      gets += 1
      return json({ status: 'failed', error: { message: 'provider fixture content rejected' } })
    } })
    await assert.rejects(() => executeOmnimuxMedia('image', req), (error) => {
      assert.equal(error.code, 'omnimux-failed')
      assert.match(error.message, /provider fixture content rejected/)
      return true
    })
    const stored = getMediaTaskRecord(record.taskRef)
    assert.equal(stored.status, 'failed')
    assert.equal(stored.upstreamTaskId, 'accepted-image-fixture')
    assert.equal(stored.errorCode, 'omnimux-failed')
    assert.match(stored.error, /provider fixture content rejected/)
    assert.equal(stored.collectionError, undefined)
    assert.equal(posts, 0)
    assert.equal(gets, 1)
    assert.equal(existsSync(req.dest), false)
  })
})
