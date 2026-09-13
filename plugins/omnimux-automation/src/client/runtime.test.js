import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAutomationRuntime,
  effectiveSnapshotPollIntervalMs,
  isTransportError,
  sessionIdsNeedingHostSync,
  snapshotPollIntervalMs,
} from './runtime.js'

/** 记录 setInterval/clearInterval 调用的替身，返回恢复函数。 */
function spyTimers() {
  const originalSet = globalThis.setInterval
  const originalClear = globalThis.clearInterval
  const timers = new Set()
  const cleared = []
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms }
    timers.add(handle)
    return handle
  }
  globalThis.clearInterval = (handle) => {
    cleared.push(handle)
    timers.delete(handle)
  }
  return {
    timers,
    cleared,
    restore: () => {
      globalThis.setInterval = originalSet
      globalThis.clearInterval = originalClear
    },
  }
}

function makeRpc(calls) {
  return {
    call: async (channel, endpoint, payload) => {
      calls.push({ channel, endpoint, payload })
      return {
        ok: true,
        value: {
          automations: [],
          runs: [],
          workspaces: [],
          models: [],
          permissions: [],
          defaultPermission: 'read-only',
          serverNow: '2026-08-16T01:00:00.000Z',
        },
      }
    },
  }
}

test('轮询间隔按是否有排队/运行中的任务切换', () => {
  assert.equal(snapshotPollIntervalMs([]), 15_000)
  assert.equal(snapshotPollIntervalMs([{ status: 'succeeded' }]), 15_000)
  assert.equal(snapshotPollIntervalMs([{ status: 'running' }]), 2_000)
  assert.equal(snapshotPollIntervalMs([{ status: 'queued' }]), 2_000)
})

test('没有前台订阅时保持低频轮询', () => {
  assert.equal(effectiveSnapshotPollIntervalMs([{ status: 'running' }], 0), 15_000)
  assert.equal(effectiveSnapshotPollIntervalMs([{ status: 'running' }], 1), 2_000)
})

test('传输层错误识别不吞业务错误', () => {
  assert.equal(isTransportError(new Error('Failed to fetch')), true)
  assert.equal(isTransportError(new Error('Load failed')), true)
  assert.equal(isTransportError(new Error('automation not found')), false)
})

test('会话对账只覆盖未完成与最近 24 小时完成的运行', () => {
  const runs = [
    { status: 'running', sessionId: 'a', scheduledFor: '2026-08-16T00:00:00.000Z' },
    { status: 'succeeded', sessionId: 'b', scheduledFor: '2026-08-15T23:00:00.000Z', finishedAt: '2026-08-15T23:01:00.000Z' },
    { status: 'succeeded', sessionId: 'c', scheduledFor: '2026-08-01T00:00:00.000Z', finishedAt: '2026-08-01T00:01:00.000Z' },
    { status: 'failed', sessionId: '', scheduledFor: '2026-08-16T00:00:00.000Z' },
  ]
  assert.deepEqual(sessionIdsNeedingHostSync(runs, '2026-08-16T00:30:00.000Z'), ['a', 'b'])
})

test('前台订阅会挂轮询表，取消订阅后停表', async () => {
  const spies = spyTimers()
  try {
    const calls = []
    const runtime = createAutomationRuntime(makeRpc(calls))
    const unsubscribe = runtime.source.subscribe(() => undefined)
    assert.equal(spies.timers.size, 1)
    unsubscribe()
    assert.equal(spies.timers.size, 0)
  } finally {
    spies.restore()
  }
})

test('visible=false（setActive(false)）会停表并保留最后一次快照', async () => {
  const spies = spyTimers()
  try {
    const calls = []
    const runtime = createAutomationRuntime(makeRpc(calls))
    const unsubscribe = runtime.source.subscribe(() => undefined)
    await runtime.refresh()
    assert.equal(spies.timers.size, 1)
    const snapshotBefore = runtime.source.getSnapshot().snapshot

    runtime.setActive(false)
    assert.equal(spies.timers.size, 0)
    assert.deepEqual(runtime.source.getSnapshot().snapshot, snapshotBefore)

    runtime.setActive(true)
    assert.equal(spies.timers.size, 1)
    unsubscribe()
  } finally {
    spies.restore()
  }
})

test('setActive 幂等：重复同值调用不重建计时器', async () => {
  const spies = spyTimers()
  try {
    const runtime = createAutomationRuntime(makeRpc([]))
    runtime.setActive(false)
    runtime.setActive(false)
    assert.equal(spies.timers.size, 0)
    runtime.setActive(true)
    const armed = spies.timers.size
    runtime.setActive(true)
    assert.equal(spies.timers.size, armed)
  } finally {
    spies.restore()
  }
})

test('变更后先本地补齐再刷新，删除立即从快照摘掉', async () => {
  const calls = []
  const runtime = createAutomationRuntime(makeRpc(calls))
  await runtime.refresh()
  await runtime.mutateAutomation('a1', 'delete')
  const endpoints = calls.map(item => item.endpoint)
  assert.deepEqual(endpoints, ['snapshot', 'mutate', 'snapshot'])
  assert.deepEqual(runtime.source.getSnapshot().snapshot.automations, [])
})

test('markRunRead 打到 mark-read 端点', async () => {
  const calls = []
  const runtime = createAutomationRuntime(makeRpc(calls))
  await runtime.markRunRead('run_1')
  assert.deepEqual(calls.map(item => item.endpoint), ['mark-read', 'snapshot'])
  assert.equal(calls[0].payload.runId, 'run_1')
})

test('adopt/forget 走对应端点且不触发额外刷新路径以外的副作用', async () => {
  const calls = []
  const runtime = createAutomationRuntime(makeRpc(calls))
  await runtime.adoptSession('sess_1')
  assert.deepEqual(calls.map(item => item.endpoint), ['adopt-session'])
  assert.equal(calls[0].channel, '/dsh-automation')
})
