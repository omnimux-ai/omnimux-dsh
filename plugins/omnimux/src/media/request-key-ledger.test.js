import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { Readable } from 'node:stream'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DIRECT_MEDIA_GENERATE_ROUTE, registerDirectMediaRoutes } from './direct-http.js'
import {
  createMediaTaskRecord,
  saveMediaTaskRecord,
  getMediaTaskRecord,
  findMediaTaskByRequestKey,
  updateMediaTaskRecord,
} from './task-store.js'

const here = dirname(fileURLToPath(import.meta.url))

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

  it('failed 记录把 error/errorCode 持久化，取回接口原样回传不再轮询', async () => {
    const calls = []
    const route = makeRoute({ calls, storageDir })
    const record = seedRecord({ status: 'submitted', upstreamTaskId: 'up_3' })
    updateMediaTaskRecord(record.taskRef, {
      status: 'failed',
      error: '生成服务暂时不可用，请稍后重试',
      errorCode: 'omnimux-request-failed',
    }, { storageDir })

    const res = response()
    await route.handler(post({
      kind: 'image', model: 'gpt-image-2.5', requestKey: 'req-viewer-001',
      taskRef: record.taskRef, wait: true,
    }), res)

    assert.equal(res.status, 500)
    assert.equal(res.json().code, 'omnimux-request-failed')
    assert.equal(res.json().error, '生成服务暂时不可用，请稍后重试')
    assert.equal(calls.length, 0)
  })
})

describe('requestKey/taskRef 账本契约 · execute.js 静态断言（Issue #3011 · 服务端）', () => {
  it('execute.js 提交抛错时把 pendingTaskRecord 标为 failed 并写入 error', async () => {
    const source = await readFile(join(here, 'execute.js'), 'utf8')
    assert.match(
      source,
      /pendingTaskRecord[\s\S]*?status:\s*'failed'|status:\s*'failed'[\s\S]*?pendingTaskRecord/,
      'execute.js 须在提交失败时把 pendingTaskRecord 更新为 failed',
    )
    assert.match(source, /errorCode/, 'execute.js 须把错误 code 持久化为 errorCode')
  })

  it('execute.js 上游同步出图时更新同一条 pendingTaskRecord 为 ready 并返回 taskRef', async () => {
    const source = await readFile(join(here, 'execute.js'), 'utf8')
    assert.match(
      source,
      /pendingTaskRecord[\s\S]*?status:\s*'ready'/,
      'execute.js 须在同步出图时把 pendingTaskRecord 更新为 ready',
    )
    // 同步出图路径的返回值必须带 taskRef（wait:false + requestKey 时前端靠它续传）
    const liveReturn = source.match(/return\s*\{\s*mode:\s*'live',[^}]*\}/)
    assert.ok(liveReturn, 'execute.js 同步出图须返回 live 结果')
    assert.match(liveReturn[0], /taskRef/, '同步出图 live 结果须携带 taskRef')
  })

  it('execute.js 收取轮询失败时把账本记录标为 failed 并写入 error', async () => {
    const source = await readFile(join(here, 'execute.js'), 'utf8')
    const collectIdx = source.indexOf('finishMediaTask(')
    assert.ok(collectIdx > -1, 'execute.js 须存在 finishMediaTask 收取路径')
    const collectBlock = source.slice(collectIdx - 4000, collectIdx + 4000)
    assert.match(collectBlock, /status:\s*'failed'/, '收取失败须回写 status failed')
    assert.match(collectBlock, /catch/, '收取路径须捕获失败以回写账本')
  })
})
