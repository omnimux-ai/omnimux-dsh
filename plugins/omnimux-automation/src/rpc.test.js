import assert from 'node:assert/strict'
import test from 'node:test'
import { AutomationRequestError } from './service.js'
import { registerAutomationRpc } from './rpc.js'

const CHANNEL = '/dsh-automation'

/** 捕获 handler 与注册选项的假 ctx。 */
function makeCtx() {
  const captured = {}
  return {
    captured,
    ctx: {
      logger: { warn: () => undefined },
      connection: {
        rpc: {
          handle: (channel, handler, options) => {
            captured.channel = channel
            captured.handler = handler
            captured.options = options
            return async () => undefined
          },
        },
      },
    },
  }
}

function makeService(overrides = {}) {
  return {
    create: async (_scope, input) => ({ id: 'automation_1', revision: 1, ...input }),
    update: async () => ({ id: 'automation_1', revision: 2 }),
    delete: async (_scope, id) => ({ id, preserveRunHistory: true }),
    runNow: async () => ({ id: 'run_1' }),
    markRead: async () => ({ id: 'run_1', unread: false }),
    adoptSession: async () => undefined,
    forgetSession: async () => undefined,
    forgetAutomationSessions: async () => undefined,
    snapshot: async () => ({ automations: [], runs: [], serverNow: '2026-08-16T01:00:00.000Z' }),
    ...overrides,
  }
}

async function handler(serviceOverrides) {
  const { ctx, captured } = makeCtx()
  registerAutomationRpc(ctx, makeService(serviceOverrides))
  assert.equal(captured.channel, CHANNEL)
  assert.equal(captured.options.authority, 'loopback')
  return captured.handler
}

test('RPC 通道固定在 /dsh-automation 且 authority 为 loopback', async () => {
  await handler()
})

test('未知 endpoint 返回 bad-request，不泄漏内部文案', async () => {
  const call = await handler()
  const result = await call('nope', {}, new AbortController().signal)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'bad-request')
})

test('create 把客户端的周几 1..7 转成 Host 的 MO..SU', async () => {
  const call = await handler()
  const result = await call('create', {
    sessionId: 'settings',
    input: {
      name: '工作日检查',
      prompt: '做检查。',
      timeZone: 'Asia/Shanghai',
      permission: 'read-only',
      schedule: { kind: 'weekly', weekdays: [5, 1], time: '09:00' },
    },
  }, new AbortController().signal)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, { id: 'automation_1' })
})

test('create 的周几越界与空名称都是 bad-request', async () => {
  const call = await handler()
  const bad = await call('create', {
    input: {
      name: ' ',
      prompt: 'x',
      timeZone: 'Asia/Shanghai',
      permission: 'read-only',
      schedule: { kind: 'weekly', weekdays: [0], time: '09:00' },
    },
  }, new AbortController().signal)
  assert.equal(bad.ok, false)
  assert.equal(bad.error.code, 'bad-request')
})

test('mutate 只接受 pause / resume / delete', async () => {
  const call = await handler()
  const signal = new AbortController().signal
  const paused = await call('mutate', { sessionId: 'settings', automationId: 'automation_1', mutation: 'pause' }, signal)
  assert.equal(paused.ok, true)
  assert.deepEqual(paused.value, { id: 'automation_1', revision: 2 })

  const removed = await call('mutate', { sessionId: 'settings', automationId: 'automation_1', mutation: 'delete' }, signal)
  assert.equal(removed.ok, true)
  assert.deepEqual(removed.value, { id: 'automation_1', preserveRunHistory: true })

  const invalid = await call('mutate', { sessionId: 'settings', automationId: 'automation_1', mutation: 'explode' }, signal)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'bad-request')
})

test('内部异常泛化为 internal，aborted 信号投影为 cancelled', async () => {
  const call = await handler({
    runNow: async () => { throw new Error('内部堆栈细节') },
  })
  const failed = await call('run-now', { sessionId: 'settings', automationId: 'automation_1' }, new AbortController().signal)
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'internal')
  assert.doesNotMatch(failed.error.message, /内部堆栈细节/)

  const controller = new AbortController()
  controller.abort()
  const cancelled = await call('run-now', { sessionId: 'settings', automationId: 'automation_1' }, controller.signal)
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.error.code, 'cancelled')
})

test('AutomationRequestError 也按 bad-request 透出原文', async () => {
  const call = await handler({
    delete: async () => { throw new AutomationRequestError('任务不存在') },
  })
  const result = await call('mutate', { sessionId: 'settings', automationId: 'automation_1', mutation: 'delete' }, new AbortController().signal)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'bad-request')
  assert.equal(result.error.message, '任务不存在')
})

test('session 相关 endpoint 回显入参并在 service 抛错时保持封闭', async () => {
  const call = await handler()
  const signal = new AbortController().signal
  assert.deepEqual(await call('adopt-session', { sessionId: 'sess_1' }, signal), { ok: true, value: { sessionId: 'sess_1' } })
  assert.deepEqual(await call('forget-session', { sessionId: 'sess_1' }, signal), { ok: true, value: { sessionId: 'sess_1' } })
  assert.deepEqual(await call('forget-automation-sessions', { automationId: 'automation_1' }, signal), { ok: true, value: { automationId: 'automation_1' } })
  assert.deepEqual(await call('mark-read', { sessionId: 'settings', runId: 'run_1' }, signal), { ok: true, value: { runId: 'run_1', unread: false } })
})
