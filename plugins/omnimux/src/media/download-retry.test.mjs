import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadMediaFile, isDownloadRetryable } from './job.js'
import { OmnimuxError } from './errors.js'

describe('downloadMediaFile 暂态重试与自愈契约 (Issue #2880)', () => {
  it('isDownloadRetryable: 准确识别 content 暂态未完成与标准可重试状态', () => {
    // 400 且带任务未就绪文本
    assert.equal(isDownloadRetryable({
      status: 400,
      body: { error: { message: 'Task is not completed yet, current status: NOT_START', type: 'invalid_request_error' } },
    }), true)

    assert.equal(isDownloadRetryable({
      status: 400,
      body: { message: 'Task is not completed yet, current status: PROCESSING' },
    }), true)

    assert.equal(isDownloadRetryable({
      status: 400,
      body: 'Task is not ready, queued in background',
    }), true)

    // 404 (CDN / 存储未同步)
    assert.equal(isDownloadRetryable({ status: 404 }), true)

    // 5xx / 429 / 408
    assert.equal(isDownloadRetryable({ status: 500 }), true)
    assert.equal(isDownloadRetryable({ status: 502 }), true)
    assert.equal(isDownloadRetryable({ status: 503 }), true)
    assert.equal(isDownloadRetryable({ status: 429 }), true)
    assert.equal(isDownloadRetryable({ status: 408 }), true)

    // 网络抖动
    assert.equal(isDownloadRetryable({ error: new TypeError('fetch failed') }), true)

    // 非暂态错误一律不重试
    assert.equal(isDownloadRetryable({
      status: 400,
      body: { error: { message: 'invalid model parameter: prompt is required' } },
    }), false)
    assert.equal(isDownloadRetryable({ status: 401 }), false)
    assert.equal(isDownloadRetryable({ status: 403 }), false)
    assert.equal(isDownloadRetryable({ error: new DOMException('The user aborted a request.', 'AbortError') }), false)
    assert.equal(isDownloadRetryable({ error: new OmnimuxError('omnimux-aborted', 'aborted') }), false)
  })

  it('downloadMediaFile: 前 2 次 400 NOT_START 暂态，第 3 次 200 成功下载并落盘', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'download-retry-test-'))
    const dest = join(tempDir, 'out.mp4')
    try {
      let attempts = 0
      const fakeVideoBytes = Buffer.from('fake-mp4-data')
      const fakeFetcher = async (url, init) => {
        attempts++
        if (attempts <= 2) {
          return new Response(JSON.stringify({
            error: {
              message: 'Task is not completed yet, current status: NOT_START',
              type: 'invalid_request_error',
            },
          }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(fakeVideoBytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        })
      }

      let sleepCalls = 0
      const fakeSleep = async (ms) => {
        sleepCalls++
        assert.equal(ms, 100)
      }

      await downloadMediaFile({
        dest,
        url: 'https://omnimux.ai/v1/videos/task_123/content',
        capability: 'video',
        apiKey: 'test-key',
        fetcher: fakeFetcher,
        maxRetries: 5,
        retryDelayMs: 100,
        sleep: fakeSleep,
      })

      assert.equal(attempts, 3)
      assert.equal(sleepCalls, 2)
      assert.equal(existsSync(dest), true)
      assert.deepEqual(readFileSync(dest), fakeVideoBytes)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('downloadMediaFile: 401 权限错误绝不进行无意义重试', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'download-retry-test-'))
    const dest = join(tempDir, 'out.mp4')
    try {
      let attempts = 0
      const fakeFetcher = async () => {
        attempts++
        return new Response(JSON.stringify({ error: { message: 'Invalid token' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }

      await assert.rejects(
        () => downloadMediaFile({
          dest,
          url: 'https://omnimux.ai/v1/videos/task_123/content',
          capability: 'video',
          apiKey: 'bad-key',
          fetcher: fakeFetcher,
          maxRetries: 5,
          retryDelayMs: 10,
        }),
        (err) => err instanceof OmnimuxError && (err.code === 'needs-omnimux' || err.code === 'omnimux-download-failed'),
      )
      assert.equal(attempts, 1, '401 应在单次请求后立即抛出，不应重试')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('downloadMediaFile: 超出最大重试次数时抛出携带错误细节的异常', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'download-retry-test-'))
    const dest = join(tempDir, 'out.mp4')
    try {
      let attempts = 0
      const fakeFetcher = async () => {
        attempts++
        return new Response(JSON.stringify({
          error: { message: 'Task is not completed yet, current status: NOT_START' },
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }

      await assert.rejects(
        () => downloadMediaFile({
          dest,
          url: 'https://omnimux.ai/v1/videos/task_123/content',
          capability: 'video',
          fetcher: fakeFetcher,
          maxRetries: 3,
          retryDelayMs: 10,
          sleep: async () => {},
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-download-failed')
          assert.equal(err.status, 400)
          assert.match(err.message, /Task is not completed yet/)
          return true
        },
      )
      assert.equal(attempts, 4, '初次请求 1 次 + 重试 3 次 = 共 4 次')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
