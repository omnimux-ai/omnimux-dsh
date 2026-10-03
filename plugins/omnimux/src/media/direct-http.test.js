import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { DIRECT_MEDIA_GENERATE_ROUTE, registerDirectMediaRoutes } from './direct-http.js'
import {
  createMediaTaskRecord,
  saveMediaTaskRecord,
  getMediaTaskRecord,
} from './task-store.js'

function fixture(overrides = {}) {
  let route = null
  const webServer = { register: (definition) => { route = definition; return () => { route = null } } }
  const calls = []
  const deps = {
    executeImage: async (req) => {
      calls.push({ kind: 'image', req })
      return { mode: 'live', taskId: 'task_img_123', url: 'https://example.com/test.png' }
    },
    executeVideo: async (req) => {
      calls.push({ kind: 'video', req })
      return { mode: 'live', taskId: 'task_vid_456', url: 'https://example.com/test.mp4' }
    },
    ...overrides,
  }
  registerDirectMediaRoutes(webServer, deps)
  return { route, deps, calls }
}

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

function post(body, url = DIRECT_MEDIA_GENERATE_ROUTE) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  stream.method = 'POST'
  stream.url = url
  return stream
}

describe('Direct Media Generate HTTP Route', () => {
  it('registers an exact POST route on /omnimux/api/media/generate', () => {
    const { route } = fixture()
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, DIRECT_MEDIA_GENERATE_ROUTE)
  })

  it('rejects non-POST requests with 405', async () => {
    const { route } = fixture()
    const req = { method: 'GET', url: DIRECT_MEDIA_GENERATE_ROUTE }
    const res = response()
    await route.handler(req, res)
    assert.equal(res.status, 405)
    assert.equal(res.json().error, 'method-not-allowed')
  })

  it('rejects empty prompt with 400', async () => {
    const { route } = fixture()
    const req = post({ prompt: '' })
    const res = response()
    await route.handler(req, res)
    assert.equal(res.status, 400)
    assert.equal(res.json().error, 'prompt-required')
  })

  it('successfully dispatches image generation and returns result', async () => {
    const { route, calls } = fixture()
    const req = post({
      kind: 'image',
      prompt: 'a cinematic portrait of a cyberpunk girl',
      model: 'gpt-image-2.5',
      aspectRatio: '16:9',
    })
    const res = response()
    await route.handler(req, res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.mode, 'live')
    assert.equal(data.taskId, 'task_img_123')
    assert.equal(data.url, 'https://example.com/test.png')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].kind, 'image')
    assert.equal(calls[0].req.prompt, 'a cinematic portrait of a cyberpunk girl')
    assert.equal(calls[0].req.model, 'gpt-image-2.5')
    assert.equal(calls[0].req.aspectRatio, '16:9')
  })

  it('forwards a known operation id and drops a malformed one', async () => {
    const { route, calls } = fixture()
    const ok = response()
    await route.handler(post({
      kind: 'image',
      prompt: 'edit this',
      model: 'gpt-image-2.5',
      operation: 'image_edit',
    }), ok)
    assert.equal(calls[0].req.operation, 'image_edit')

    const bad = response()
    await route.handler(post({
      kind: 'image',
      prompt: 'edit this',
      operation: 'Image Edit!',
    }), bad)
    assert.equal(bad.status, 200)
    assert.equal(calls[1].req.operation, undefined)
  })

  it('successfully dispatches video generation and returns result', async () => {
    const { route, calls } = fixture()
    const req = post({
      kind: 'video',
      prompt: 'a running horse in slow motion',
      model: 'kling-v2',
      duration: 5,
    })
    const res = response()
    await route.handler(req, res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.kind, 'video')
    assert.equal(data.url, 'https://example.com/test.mp4')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].kind, 'video')
    assert.equal(calls[0].req.duration, 5)
  })

  it('forwards a boolean sound flag and drops non-boolean values', async () => {
    const { route, calls } = fixture()
    await route.handler(post({
      kind: 'video',
      prompt: 'mute video',
      model: 'kling-v2',
      sound: false,
    }), response())
    assert.equal(calls[0].req.sound, false)

    await route.handler(post({
      kind: 'video',
      prompt: 'loud video',
      model: 'kling-v2',
      sound: 'yes',
    }), response())
    assert.equal(calls[1].req.sound, undefined)
  })
})

describe('Direct Media Generate · requestKey/taskRef 账本契约（Issue #3011）', () => {
  let tempDir
  let cacheDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omx-direct-http-ledger-'))
    cacheDir = mkdtempSync(join(tmpdir(), 'omx-direct-http-cache-'))
  })

  afterEach(() => {
    for (const dir of [tempDir, cacheDir]) {
      if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    }
  })

  const makeRecord = (overrides = {}) => {
    const record = createMediaTaskRecord({
      capability: 'image',
      model: 'gpt-image-2.5',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'gpt-image-2.5',
      taskPath: 'images/generations',
      requestKey: 'req-key-1',
      ...overrides,
    })
    saveMediaTaskRecord(record, { storageDir: tempDir })
    return record
  }

  it('提交请求透传 requestKey 与 wait:false，并把响应中的 taskRef 返回给前端', async () => {
    const { route, calls } = fixture({
      storageDir: tempDir,
      executeImage: async (req) => {
        calls.push({ kind: 'image', req })
        return { mode: 'submitted', taskId: 'upstream_abc', taskRef: 'mtask_ref12345', url: null }
      },
    })
    const res = response()
    await route.handler(post({
      kind: 'image',
      prompt: 'a cyberpunk cat',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      wait: false,
    }), res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.mode, 'submitted')
    assert.equal(data.taskRef, 'mtask_ref12345')
    assert.equal(data.url, null)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].req.requestKey, 'req-key-1')
    assert.equal(calls[0].req.wait, false)
    assert.equal(calls[0].req.taskRef, undefined)
  })

  it('执行器抛出带 code/status 的错误时，500 响应携带 code 与 status', async () => {
    const { route } = fixture({
      storageDir: tempDir,
      executeImage: async () => {
        const err = new Error('quota exceeded for this key')
        err.code = 'quota-exceeded'
        err.status = 429
        throw err
      },
    })
    const res = response()
    await route.handler(post({ kind: 'image', prompt: 'x', model: 'gpt-image-2.5' }), res)

    assert.equal(res.status, 500)
    const data = res.json()
    assert.equal(data.ok, false)
    assert.equal(data.error, 'quota exceeded for this key')
    assert.equal(data.code, 'quota-exceeded')
    assert.equal(data.status, 429)
  })

  it('执行器抛出无 code 的普通错误时，500 响应不带 code/status', async () => {
    const { route } = fixture({
      storageDir: tempDir,
      executeImage: async () => { throw new Error('plain failure') },
    })
    const res = response()
    await route.handler(post({ kind: 'image', prompt: 'x', model: 'gpt-image-2.5' }), res)

    assert.equal(res.status, 500)
    const data = res.json()
    assert.equal(data.ok, false)
    assert.equal(data.error, 'plain failure')
    assert.equal(data.code, undefined)
    assert.equal(data.status, undefined)
  })

  it('取回：ready 记录且产物文件存在时直接返回 cachePath，不再轮询上游', async () => {
    const cacheFile = join(cacheDir, 'artifact.png')
    writeFileSync(cacheFile, 'png-bytes')
    const record = makeRecord()
    record.status = 'ready'
    record.upstreamTaskId = 'upstream_done'
    record.artifact = { cachePath: cacheFile, mimeType: 'image/png', sizeBytes: 9 }
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const { route, calls } = fixture({
      storageDir: tempDir,
      executeImage: async () => { throw new Error('should never be called') },
    })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: record.taskRef,
      wait: true,
    }), res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.mode, 'live')
    assert.equal(data.url, cacheFile)
    assert.equal(data.dest, cacheFile)
    assert.equal(data.taskRef, record.taskRef)
    assert.equal(calls.length, 0)
  })

  it('取回：ready 记录但产物文件已被清理时，继续走执行器轮询', async () => {
    const record = makeRecord()
    record.status = 'ready'
    record.upstreamTaskId = 'upstream_done'
    record.artifact = { cachePath: join(cacheDir, 'gone.png'), mimeType: 'image/png', sizeBytes: 9 }
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const { route, calls } = fixture({
      storageDir: tempDir,
      executeImage: async (req) => {
        calls.push({ kind: 'image', req })
        return { mode: 'live', taskId: 'upstream_done', taskRef: record.taskRef, url: 'https://example.com/redone.png' }
      },
    })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: record.taskRef,
      wait: true,
    }), res)

    assert.equal(res.status, 200)
    assert.equal(res.json().url, 'https://example.com/redone.png')
    assert.equal(calls.length, 1)
  })

  it('取回：旧 transport failed 记录恢复同一上游任务，不新提交', async () => {
    const record = makeRecord()
    record.status = 'failed'
    record.upstreamTaskId = 'upstream_recoverable'
    record.error = '生成服务暂时不可用，请稍后重试'
    record.errorCode = 'omnimux-request-failed'
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const { route, calls } = fixture({
      storageDir: tempDir,
      executeImage: async (req) => {
        calls.push({ kind: 'image', req })
        assert.equal(req.taskRef, record.taskRef)
        assert.equal(req.taskId, 'upstream_recoverable')
        assert.equal(req.prompt, '')
        return { mode: 'live', taskId: req.taskId, taskRef: req.taskRef, url: 'https://example.com/recovered.png' }
      },
    })
    const res = response()
    await route.handler(post({
      kind: 'image', model: 'gpt-image-2.5', requestKey: 'req-key-1', taskRef: record.taskRef, wait: true,
    }), res)

    assert.equal(res.status, 200)
    assert.equal(res.json().ok, true)
    assert.equal(res.json().mode, 'live')
    assert.equal(res.json().taskRef, record.taskRef)
    assert.equal(res.json().taskId, 'upstream_recoverable')
    assert.equal(calls.length, 1)
    assert.equal(calls.filter(({ req }) => !req.taskRef && !req.taskId).length, 0)
  })

  it('取回：明确上游 failed 记录返回原终态错误，不再轮询', async () => {
    const record = makeRecord()
    Object.assign(record, { status: 'failed', upstreamTaskId: 'upstream_bad', error: 'upstream task failed: nsfw', errorCode: 'omnimux-failed' })
    saveMediaTaskRecord(record, { storageDir: tempDir })
    const { route, calls } = fixture({ storageDir: tempDir, executeImage: async (req) => {
      calls.push({ kind: 'image', req })
      throw new Error('terminal task must not execute')
    } })
    const res = response()
    await route.handler(post({ kind: 'image', model: 'gpt-image-2.5', requestKey: 'req-key-1', taskRef: record.taskRef, wait: true }), res)
    assert.equal(res.status, 500)
    assert.equal(res.json().ok, false)
    assert.equal(res.json().error, 'upstream task failed: nsfw')
    assert.equal(res.json().code, 'omnimux-failed')
    assert.equal(calls.length, 0)
  })

  it('取回：failed 记录缺 errorCode 时回落 omnimux-failed', async () => {
    const record = makeRecord()
    record.status = 'failed'
    record.error = 'raw provider error'
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const { route } = fixture({ storageDir: tempDir })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: record.taskRef,
      wait: true,
    }), res)

    assert.equal(res.status, 500)
    assert.equal(res.json().code, 'omnimux-failed')
    assert.equal(res.json().error, 'raw provider error')
  })

  it('取回：taskRef 对应记录不存在时返回 500 omnimux-task-not-found', async () => {
    const { route, calls } = fixture({ storageDir: tempDir })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: 'mtask_missing001',
      wait: true,
    }), res)

    assert.equal(res.status, 500)
    const data = res.json()
    assert.equal(data.ok, false)
    assert.equal(data.code, 'omnimux-task-not-found')
    assert.equal(data.error, '未找到对应的媒体任务记录，请重新提交生成')
    assert.equal(calls.length, 0)
  })

  it('取回：记录仍是 submitting 且无 upstreamTaskId 时返回 omnimux-task-interrupted', async () => {
    const record = makeRecord() // status: 'submitting', upstreamTaskId: undefined

    const { route, calls } = fixture({ storageDir: tempDir })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: record.taskRef,
      wait: true,
    }), res)

    assert.equal(res.status, 500)
    const data = res.json()
    assert.equal(data.ok, false)
    assert.equal(data.code, 'omnimux-task-interrupted')
    assert.equal(data.error, '任务已中断，请重新提交')
    assert.equal(calls.length, 0)
  })

  it('取回：submitted 记录交给执行器轮询，成功后把同一 taskRef 返回', async () => {
    const record = makeRecord()
    record.status = 'submitted'
    record.upstreamTaskId = 'upstream_poll'
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const { route, calls } = fixture({
      storageDir: tempDir,
      executeImage: async (req) => {
        calls.push({ kind: 'image', req })
        return { mode: 'live', taskId: 'upstream_poll', taskRef: record.taskRef, url: 'https://example.com/final.png' }
      },
    })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: record.taskRef,
      wait: true,
    }), res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.mode, 'live')
    assert.equal(data.taskRef, record.taskRef)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].req.taskRef, record.taskRef)
  })

  it('取回上游明确终态失败时持久化 failed 和原错误，后续不执行', async () => {
    const record = makeRecord()
    record.status = 'submitted'
    record.upstreamTaskId = 'upstream_will_fail'
    saveMediaTaskRecord(record, { storageDir: tempDir })
    let collections = 0
    const { route } = fixture({
      storageDir: tempDir,
      executeImage: async () => {
        collections += 1
        const err = new Error('upstream task failed: nsfw')
        err.code = 'omnimux-failed'
        throw err
      },
    })
    const res = response()
    await route.handler(post({
      kind: 'image',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      taskRef: record.taskRef,
      wait: true,
    }), res)

    assert.equal(res.status, 500)
    assert.equal(res.json().code, 'omnimux-failed')
    assert.equal(res.json().recoverable, false)
    const stored = getMediaTaskRecord(record.taskRef, { storageDir: tempDir })
    assert.equal(stored.status, 'failed')
    assert.equal(stored.error, 'upstream task failed: nsfw')
    assert.equal(stored.errorCode, 'omnimux-failed')
    const again = response()
    await route.handler(post({ kind: 'image', taskRef: record.taskRef, wait: true }), again)
    assert.equal(again.status, 500)
    assert.equal(again.json().code, 'omnimux-failed')
    assert.equal(again.json().error, stored.error)
    assert.equal(collections, 1)
  })

  it('收取暂时 transport 失败保留同一任务，随后恢复不新提交', async () => {
    const record = makeRecord()
    Object.assign(record, { status: 'submitted', upstreamTaskId: 'upstream_transport' })
    saveMediaTaskRecord(record, { storageDir: tempDir })
    const collected = []
    const { route } = fixture({ storageDir: tempDir, executeImage: async (req) => {
      collected.push(req)
      assert.equal(req.taskRef, record.taskRef)
      assert.equal(req.taskId, 'upstream_transport')
      if (collected.length === 1) throw Object.assign(new Error('temporary transport interruption'), { code: 'omnimux-request-failed', status: 503 })
      return { mode: 'live', taskId: req.taskId, taskRef: req.taskRef, url: 'https://example.com/recovered.png' }
    } })
    const body = { kind: 'image', taskRef: record.taskRef, requestKey: 'req-key-1', wait: true }
    const interrupted = response()
    await route.handler(post(body), interrupted)
    assert.equal(interrupted.status, 500)
    assert.equal(interrupted.json().error, 'temporary transport interruption')
    assert.equal(interrupted.json().code, 'omnimux-request-failed')
    assert.equal(interrupted.json().status, 503)
    assert.equal(interrupted.json().recoverable, true)
    assert.equal(interrupted.json().taskRef, record.taskRef)
    const stored = getMediaTaskRecord(record.taskRef, { storageDir: tempDir })
    assert.equal(stored.status, 'submitted')
    assert.equal(stored.upstreamTaskId, 'upstream_transport')
    assert.equal(stored.error, undefined)
    assert.equal(stored.errorCode, undefined)
    assert.equal(stored.collectionError, 'temporary transport interruption')
    assert.equal(stored.collectionErrorCode, 'omnimux-request-failed')
    const recovered = response()
    await route.handler(post(body), recovered)
    assert.equal(recovered.status, 200)
    assert.equal(recovered.json().mode, 'live')
    assert.equal(recovered.json().taskRef, record.taskRef)
    assert.equal(collected.length, 2)
    assert.equal(collected.filter((req) => !req.taskRef && !req.taskId).length, 0)
  })

  it('带 requestKey 提交且执行器返回 taskRef 缺省时，从账本回捞 taskRef 返回前端', async () => {
    const record = makeRecord()
    record.status = 'submitted'
    record.upstreamTaskId = 'upstream_known'
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const { route } = fixture({
      storageDir: tempDir,
      executeImage: async () => ({ mode: 'submitted', taskId: 'upstream_known', url: null }),
    })
    const res = response()
    await route.handler(post({
      kind: 'image',
      prompt: 'a cyberpunk cat',
      model: 'gpt-image-2.5',
      requestKey: 'req-key-1',
      wait: false,
    }), res)

    assert.equal(res.status, 200)
    assert.equal(res.json().taskRef, record.taskRef)
  })
})
