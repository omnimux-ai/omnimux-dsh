import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefinition, createScheduledRun } from './domain.js'
import {
  applyUnattendedPermission,
  executeAutomationRun,
  readSessionEvents,
  settlesWithin,
  summarizeRun,
} from './executor.js'

/** @returns {any} */
function makeRun(overrides = {}) {
  const definition = createDefinition({
    id: 'automation_1',
    name: '每日检查',
    prompt: '检查测试并报告结果。',
    schedule: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' },
    workspaceId: 'ws_1',
    cwd: '/tmp/demo',
    agentPreset: 'standard',
    createdBy: { kind: 'web', sessionId: 'session_1' },
    now: '2026-08-16T01:00:00.000Z',
  })
  return { ...createScheduledRun(definition, '2026-08-16T01:00:00.000Z'), ...overrides }
}

test('摘要只取首个 turn/start 之后的最后一条助手文本，并带出结束原因', () => {
  const events = [
    { seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '噪音' }] } } },
    { seq: 2, type: 'turn/start', data: {} },
    { seq: 3, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '第一段' }] } } },
    { seq: 4, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '最终结论' }] } } },
    { seq: 5, type: 'turn/end', data: { reason: 'stop' } },
  ]
  assert.deepEqual(summarizeRun(events, 2), { text: '最终结论', reason: 'stop' })
})

test('摘要取首条 turn/start 之后的最后一条助手文本，非文本块不参与拼接', () => {
  const events = [
    { seq: 1, type: 'turn/start', data: {} },
    { seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '旧' }] } } },
    { seq: 3, type: 'assistant/message', data: { message: { content: [{ type: 'tool', text: '忽略' }] } } },
  ]
  // firstSeq 落在 turn/start 之前：能看见整个回合，最后一条纯工具消息不改写已捕获的文本。
  assert.deepEqual(summarizeRun(events, 1), { text: '旧' })
  // firstSeq 落在回合开始之后：本轮没有可用的 turn/start，摘要保持为空而不是回填上一轮内容。
  assert.deepEqual(summarizeRun(events, 2), { text: '' })
})

test('firstSeq 之前的 turn/start 不算开始，摘要保持为空', () => {
  const events = [
    { seq: 1, type: 'turn/start', data: {} },
    { seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '旧' }] } } },
  ]
  assert.deepEqual(summarizeRun(events, 2), { text: '' })
})

test('没有开始回合时摘要为空，不臆造内容', () => {
  assert.deepEqual(summarizeRun([{ seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'x' }] } } }], 1), { text: '' })
})

test('settlesWithin 在时限内完成返回 true，超时返回 false 且不吞异常', async () => {
  assert.equal(await settlesWithin(Promise.resolve('ok'), 50), true)
  assert.equal(await settlesWithin(Promise.reject(new Error('boom')), 50), false)
  assert.equal(await settlesWithin(new Promise(() => undefined), 20), false)
})

test('readSessionEvents 优先取快照函数，其次取 events 字段', () => {
  assert.deepEqual(readSessionEvents({ snapshotEvents: () => [1, 2] }), [1, 2])
  assert.deepEqual(readSessionEvents({ events: [3] }), [3])
  assert.deepEqual(readSessionEvents({}), [])
})

test('无人值守权限同时设置预设与 never 审批策略', () => {
  const calls = []
  const session = { append: (type, data) => calls.push([type, data]) }
  const presets = { set: (target, permission) => calls.push(['preset', target, permission]) }
  applyUnattendedPermission(presets, session, 'workspace-write')
  assert.deepEqual(calls[0], ['preset', session, 'workspace-write'])
  assert.deepEqual(calls[1], ['approval/policy', { policy: 'never' }])
})

test('信号已中止时运行直接判为 cancelled，不触碰工作区', async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await executeAutomationRun({}, makeRun(), makeRun(), {
    runTimeoutMs: 1_000,
    sessionId: 'sess-1',
    signal: controller.signal,
  })
  assert.equal(result.status, 'cancelled')
  assert.equal(result.error.code, 'cancelled')
})

test('目标工作区不存在时判为 failed 且给出 workspace_not_found', async () => {
  const ctx = { workspaceRegistry: { get: () => undefined } }
  const result = await executeAutomationRun(ctx, {}, makeRun(), {
    runTimeoutMs: 1_000,
    sessionId: 'sess-1',
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.error.code, 'workspace_not_found')
})

test('工作区目录不可用或已变更时判为 failed', async () => {
  const ctx = {
    workspaceRegistry: {
      get: () => ({ status: async () => 'ok', path: '/tmp/elsewhere' }),
    },
  }
  const result = await executeAutomationRun(ctx, {}, makeRun(), {
    runTimeoutMs: 1_000,
    sessionId: 'sess-1',
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.error.code, 'workspace_unavailable')
})
