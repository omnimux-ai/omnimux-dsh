import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createMediaTaskRecord,
  saveMediaTaskRecord,
  getMediaTaskRecord,
  findMediaTaskByUpstreamId,
  findMediaTaskByRequestKey,
  updateMediaTaskRecord,
} from './task-store.js'

describe('Hub Media Task Store 单元测试', () => {
  let tempDir

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'media-task-store-test-'))
  })

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('契约 1: 能够正确创建、原子持久化并按 taskRef 读取任务记录', () => {
    const record = createMediaTaskRecord({
      capability: 'video',
      model: 'minimax-h3',
      operation: 'first_frame',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'minimax-h3',
      group: 'default',
      taskPath: 'video/generations',
      requestKey: 'req-video-123',
      credentialRef: 'OMNIMUX_API_KEY',
    })

    assert.ok(record.taskRef.startsWith('mtask_'))
    assert.equal(record.status, 'submitting')
    assert.equal(record.model, 'minimax-h3')

    saveMediaTaskRecord(record, { storageDir: tempDir })

    const loaded = getMediaTaskRecord(record.taskRef, { storageDir: tempDir })
    assert.ok(loaded)
    assert.equal(loaded.taskRef, record.taskRef)
    assert.equal(loaded.model, 'minimax-h3')
    assert.equal(loaded.requestKey, 'req-video-123')
    assert.equal(loaded.status, 'submitting')

    // 验证文件权限为 0600
    const filePath = join(tempDir, `${record.taskRef}.json`)
    const stats = statSync(filePath)
    assert.equal(stats.mode & 0o777, 0o600)
  })

  it('契约 2: 能够按 upstreamTaskId 反查任务，支持旧 taskId-only 兼容收取', () => {
    const record = createMediaTaskRecord({
      capability: 'audio',
      model: 'index-tts',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'index-tts',
      taskPath: 'video/generations', // 特殊路径
      requestKey: 'req-audio-special',
    })
    record.upstreamTaskId = 'upstream-task-xyz-888'
    record.status = 'submitted'

    saveMediaTaskRecord(record, { storageDir: tempDir })

    const found = findMediaTaskByUpstreamId('upstream-task-xyz-888', { storageDir: tempDir })
    assert.ok(found)
    assert.equal(found.taskRef, record.taskRef)
    assert.equal(found.taskPath, 'video/generations')
    assert.equal(found.upstreamTaskId, 'upstream-task-xyz-888')

    // 查询不存在的 ID
    const notFound = findMediaTaskByUpstreamId('non-existent-task', { storageDir: tempDir })
    assert.equal(notFound, null)
  })

  it('契约 3: 能够按 requestKey 检索，支持防重复提交幂等防护', () => {
    const record = createMediaTaskRecord({
      capability: 'image',
      model: 'gpt-image-2.5',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'gpt-image-2.5',
      taskPath: 'images/generations',
      requestKey: 'idempotent-key-999',
    })

    saveMediaTaskRecord(record, { storageDir: tempDir })

    const hit = findMediaTaskByRequestKey('idempotent-key-999', { storageDir: tempDir })
    assert.ok(hit)
    assert.equal(hit.taskRef, record.taskRef)
    assert.equal(hit.requestKey, 'idempotent-key-999')
  })

  it('契约 4: 能够原子更新任务状态与产物缓存信息', () => {
    const record = createMediaTaskRecord({
      capability: 'video',
      model: 'seedance-2-0',
      providerId: 'omnimux',
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      wireModel: 'seedance-2-0',
      taskPath: 'video/generations',
      requestKey: 'req-update-1',
    })
    saveMediaTaskRecord(record, { storageDir: tempDir })

    const updated = updateMediaTaskRecord(record.taskRef, {
      status: 'ready',
      upstreamTaskId: 'upstream-finish-1',
      artifact: {
        cachePath: '/tmp/cached.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1048576,
      },
    }, { storageDir: tempDir })

    assert.equal(updated.status, 'ready')
    assert.equal(updated.upstreamTaskId, 'upstream-finish-1')
    assert.equal(updated.artifact.mimeType, 'video/mp4')

    const reloaded = getMediaTaskRecord(record.taskRef, { storageDir: tempDir })
    assert.equal(reloaded.status, 'ready')
    assert.equal(reloaded.artifact.sizeBytes, 1048576)
  })

  it('契约 5: 针对非法字符或路径遍历尝试应安全拒绝', () => {
    assert.equal(getMediaTaskRecord('../secret', { storageDir: tempDir }), null)
    assert.equal(getMediaTaskRecord('mtask_123/../../bad', { storageDir: tempDir }), null)
  })
})
