import assert from 'node:assert/strict'
import test from 'node:test'
import { createScheduledSessionOpener, ensureOpenScheduledSession } from './open-session.js'

test('会话 id 为空时不做任何动作', async () => {
  const calls = []
  const opened = await ensureOpenScheduledSession({
    id: '   ',
    adopt: async (id) => { calls.push(['adopt', id]) },
    open: (id) => { calls.push(['open', id]) },
  })
  assert.equal(opened, false)
  assert.deepEqual(calls, [])
})

test('先在宿主登记会话，再打开；宿主簿缺条目时刷新后重试', async () => {
  const calls = []
  let listed = false
  const opened = await ensureOpenScheduledSession({
    id: 'sess_1',
    adopt: async (id) => { calls.push(['adopt', id]) },
    listed: () => listed,
    refresh: async () => { calls.push(['refresh']); listed = true },
    open: (id) => { calls.push(['open', id]) },
  })
  assert.equal(opened, true)
  assert.deepEqual(calls, [['adopt', 'sess_1'], ['refresh'], ['open', 'sess_1']])
})

test('宿主簿已有条目时不再多刷一次', async () => {
  const calls = []
  const opened = await ensureOpenScheduledSession({
    id: 'sess_1',
    adopt: async (id) => { calls.push(['adopt', id]) },
    listed: () => true,
    refresh: async () => { calls.push(['refresh']) },
    open: (id) => { calls.push(['open', id]) },
  })
  assert.equal(opened, true)
  assert.deepEqual(calls, [['adopt', 'sess_1'], ['open', 'sess_1']])
})

test('宿主簿晚一步到位时按 1s 退避重试，重试成功后返回 true', async () => {
  let listed = false
  let refreshes = 0
  let attempts = 0
  const opened = await ensureOpenScheduledSession({
    id: 'sess_1',
    listed: () => listed,
    refresh: async () => {
      refreshes += 1
      // 第一次刷新（打开前那次）还没收录，第二次刷新后宿主簿才补上。
      if (refreshes >= 2) listed = true
    },
    open: () => {
      attempts += 1
      if (!listed) throw new Error('unknown session')
    },
  })
  assert.equal(opened, true)
  assert.equal(attempts, 2)
})

test('登记与刷新都补不上时，重试一轮后放弃，不无限循环', async () => {
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn) => {
    queueMicrotask(fn)
    return 0
  }
  try {
    let refreshes = 0
    let attempts = 0
    const opened = await ensureOpenScheduledSession({
      id: 'sess_1',
      listed: () => false,
      refresh: async () => { refreshes += 1 },
      open: () => {
        attempts += 1
        throw new Error('unknown session')
      },
    })
    assert.equal(opened, false)
    // 打开前一次 + 退避间隔 3 次，共 4 次刷新。
    assert.equal(refreshes, 4)
    // 会话始终不在宿主簿里，只在打开前后各试一次，不做无效重试。
    assert.equal(attempts, 2)
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
})

test('没有刷新入口时只尝试一次，不进入退避循环', async () => {
  let attempts = 0
  const opened = await ensureOpenScheduledSession({
    id: 'sess_1',
    open: () => { attempts += 1 },
  })
  assert.equal(opened, true)
  assert.equal(attempts, 1)
})

test('会话 id 只来自调用方，打开器不拼接也不猜测', async () => {
  const opened = []
  const ctx = {
    sessions: {
      list: { getSnapshot: () => ({ ids: ['sess_1'], byId: {}, current: null }) },
      open: (id) => { opened.push(id) },
    },
  }
  const runtime = { adoptSession: async () => undefined }
  const opener = createScheduledSessionOpener(ctx, runtime)
  opener('sess_1')
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
  assert.deepEqual(opened, ['sess_1'])
})

test('宿主会话簿缺席时打开器静默降级，不抛异常', async () => {
  const opener = createScheduledSessionOpener({}, { adoptSession: async () => undefined })
  assert.doesNotThrow(() => opener('sess_missing'))
  await new Promise(resolve => setTimeout(resolve, 0))
})
