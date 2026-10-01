import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { executeOmnimuxMedia } from './execute.js'
import { createMediaTaskRecord, saveMediaTaskRecord } from './task-store.js'

describe('媒体任务生命周期收取与误判消除测试', () => {
  let tempHomeDir
  let origDshHome

  beforeEach(() => {
    origDshHome = process.env.DSH_HOME
    tempHomeDir = mkdtempSync(join(tmpdir(), 'media-lifecycle-test-home-'))
    process.env.DSH_HOME = tempHomeDir
  })

  afterEach(() => {
    if (origDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = origDshHome
    if (tempHomeDir && existsSync(tempHomeDir)) {
      rmSync(tempHomeDir, { recursive: true, force: true })
    }
  })
  it('契约 1: 当主会话处于 agent 模式且未配置媒体时，凭借有效 taskRef 轮询取结果绝不报 omnimux-unconfigured', async () => {
    const record = createMediaTaskRecord({
      capability: 'video',
      model: 'minimax-h3',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'minimax-h3',
      group: 'default',
      taskPath: 'video/generations',
      requestKey: 'req-test-agent-bypass',
    })
    record.upstreamTaskId = 'task-remote-12345'
    record.status = 'submitted'
    saveMediaTaskRecord(record)

    let networkPolled = false
    const mockFetcher = async (url) => {
      networkPolled = true
      return new Response(JSON.stringify({
        status: 'completed',
        output: { video_url: 'https://cdn.test/video.mp4' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    try {
      await executeOmnimuxMedia('video', {
        dest: '/tmp/test-out.mp4',
        taskRef: record.taskRef,
        taskId: record.upstreamTaskId,
        runtimeSettings: {
          runtimeMode: 'agent', // 本机 CLI 模式，且未配置 BYOK
        },
        env: {
          OMNIMUX_API_KEY: 'test-token',
        },
        fetcher: mockFetcher,
        wait: true,
      })
      assert.equal(networkPolled, true, 'taskRef 轮询取回产物必须触发上游网络状态查询')
    } catch (err) {
      // 核心断言：绝对不能被“本机助手只承接文字”误拦！
      assert.notEqual(
        err.message,
        '本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方',
        '轮询请求绝对不能被新生成准入规则误拦截'
      )
    }
  })

  it('契约 2: 仅传 taskId 且在账本中唯一定位时，同样免除 agent 模式未配置媒体拦截', async () => {
    const record = createMediaTaskRecord({
      capability: 'video',
      model: 'minimax-h3',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'minimax-h3',
      group: 'default',
      taskPath: 'video/generations',
      requestKey: 'req-test-legacy-task-id',
    })
    record.upstreamTaskId = 'task-legacy-99999'
    record.status = 'submitted'
    saveMediaTaskRecord(record)

    const mockFetcher = async () => new Response(JSON.stringify({
      status: 'completed',
      output: { video_url: 'https://cdn.test/video-legacy.mp4' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    try {
      await executeOmnimuxMedia('video', {
        dest: '/tmp/test-out.mp4',
        taskId: 'task-legacy-99999', // 没有 model，没有 taskRef
        runtimeSettings: {
          runtimeMode: 'agent',
        },
        env: {
          OMNIMUX_API_KEY: 'test-token',
        },
        fetcher: mockFetcher,
        wait: true,
      })
    } catch (err) {
      assert.notEqual(
        err.message,
        '本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方',
        '旧版仅传 taskId 也必须免除 agent 误判'
      )
    }
  })

  it('契约 3: 相同 requestKey 发起新生成提交时，直接复用已存在的任务记录，严禁触发二次上游 POST', async () => {
    const testKey = `req-idempotent-repeat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const record = createMediaTaskRecord({
      capability: 'video',
      model: 'minimax-h3',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'minimax-h3',
      group: 'default',
      taskPath: 'video/generations',
      requestKey: testKey,
    })
    record.upstreamTaskId = 'task-first-submit-777'
    record.status = 'submitted'
    saveMediaTaskRecord(record)

    let postCallCount = 0
    const mockFetcher = async () => {
      postCallCount++
      return new Response('{}', { status: 200 })
    }

    const res = await executeOmnimuxMedia('video', {
      dest: '/tmp/test-repeat.mp4',
      model: 'minimax-h3',
      prompt: 'a cinematic video',
      requestKey: testKey,
      runtimeSettings: { runtimeMode: 'official' },
      env: { OMNIMUX_API_KEY: 'test-token' },
      fetcher: mockFetcher,
      wait: false,
    })

    assert.equal(res.mode, 'submitted')
    assert.equal(res.taskId, 'task-first-submit-777')
    assert.equal(res.taskRef, record.taskRef)
    assert.equal(postCallCount, 0, '命中有记录的 requestKey 必须短路，严禁发生二次生成请求')
  })
})
