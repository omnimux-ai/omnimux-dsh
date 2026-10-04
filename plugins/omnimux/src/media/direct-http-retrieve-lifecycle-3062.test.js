import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
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

describe('Issue #3062: direct-http 取回与重试状态机', () => {
  let tempDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omx-direct-3062-'))
  })

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('重试提交：账本中存在前序 submitting 记录时，带相同 requestKey 的重新提交不应被当作中断拦截', async () => {
    // 模拟前一次提交因网络异常遗留了 submitting 记录
    const initialRecord = createMediaTaskRecord({
      capability: 'image',
      model: 'gpt-image-2.5',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'gpt-image-2.5',
      taskPath: 'images/generations',
      requestKey: 'retry-key-001',
    })
    initialRecord.status = 'submitting'
    saveMediaTaskRecord(initialRecord, { storageDir: tempDir })

    const { route, calls } = fixture({
      storageDir: tempDir,
      executeImage: async (req) => {
        calls.push({ kind: 'image', req })
        return { mode: 'live', taskId: 'task_retry_ok', taskRef: initialRecord.taskRef, url: 'https://example.com/retry-success.png' }
      },
    })

    const res = response()
    // 用户或客户端带相同 requestKey 发起重试提交（无 taskRef，有 prompt）
    await route.handler(post({
      kind: 'image',
      prompt: 'a red apple',
      model: 'gpt-image-2.5',
      channel: 'economy',
      requestKey: 'retry-key-001',
      wait: false,
    }), res)

    // 不应被 500 omnimux-task-interrupted 拦截，必须成功执行
    assert.equal(res.status, 200)
    assert.equal(res.json().ok, true)
    assert.equal(res.json().taskId, 'task_retry_ok')
    assert.equal(calls.length, 1)
  })

  it('提交异常：首次提交抛错时，应通过 requestKey 回写账本状态为 failed，避免残留死锁在 submitting/submitted', async () => {
    for (const initStatus of ['submitting', 'submitted']) {
      const { route } = fixture({
        storageDir: tempDir,
        executeImage: async (req) => {
          const r = createMediaTaskRecord({
            capability: 'image',
            model: 'gpt-image-2.5',
            providerId: 'omnimux',
            protocol: 'openai-media',
            baseUrl: 'https://api.omnimux.ai/v1',
            wireModel: 'gpt-image-2.5',
            taskPath: 'images/generations',
            requestKey: req.requestKey,
          })
          r.status = initStatus
          saveMediaTaskRecord(r, { storageDir: tempDir })
          const err = new Error('Upstream safety checks rejected')
          err.code = 'content_policy_violation'
          throw err
        },
      })

      const res = response()
      await route.handler(post({
        kind: 'image',
        prompt: 'trigger safety violation',
        model: 'gpt-image-2.5',
        channel: 'economy',
        requestKey: `fail-key-${initStatus}`,
        wait: false,
      }), res)

      assert.equal(res.status, 500)
      assert.equal(res.json().ok, false)
      assert.equal(res.json().code, 'content_policy_violation')

      const updated = getMediaTaskRecord(res.json().taskRef, { storageDir: tempDir })
      assert.ok(updated)
      assert.equal(updated.status, 'failed')
      assert.equal(updated.errorCode, 'content_policy_violation')
    }
  })
})
