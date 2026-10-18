import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from './index.js'
import { createRivalAccountsStore } from './rival/rival-accounts-store.js'
import { resolveRivalPaths } from './rival/rival-paths.js'
import { SOCIAL_DATA_TOOL } from './rival/rival-remote.js'

test('plugin lifecycle starts due-account collection and disposes its only refresh timer', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'rival-lifecycle-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const disposers = []
  t.after(() => {
    for (const dispose of disposers.reverse()) dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })
  const intervals = []
  const cleared = []
  t.mock.method(globalThis, 'setInterval', (callback, milliseconds) => {
    const timer = { unref() {} }
    intervals.push({ callback, milliseconds, timer })
    return timer
  })
  t.mock.method(globalThis, 'clearInterval', (timer) => { cleared.push(timer) })
  const store = createRivalAccountsStore({ paths: resolveRivalPaths({ homeDir: home }) })
  const account = store.addAccount({
    platform: 'tiktok', external_id: 'sample', handle: '@sample',
    refresh_interval_hours: 24, next_auto_refresh_at: new Date(0).toISOString(),
  })
  const calls = []
  const tool = {
    async execute(args) {
      calls.push(args.capability)
      return { data: args.capability === 'user'
        ? { nickname: 'Sample', follower_count: 0 }
        : { items: [{ id: 'sample-post', desc: 'new work', create_time: 1_700_000_000 }] } }
    },
  }
  apply({
    tools: { register() {}, get: (name) => name === SOCIAL_DATA_TOOL ? tool : undefined },
    inject() {},
    effect(factory) {
      const dispose = factory()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  })
  assert.equal(intervals.length, 1, 'loading the real plugin must start one refresh timer')
  assert.equal(intervals[0].milliseconds, 60_000)
  intervals[0].callback()
  for (let attempt = 0; attempt < 20 && store.getAccount(account.id).refresh_state !== 'idle'; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.deepEqual(calls, ['user', 'posts'])
  assert.equal(store.getAccount(account.id).consecutive_failures, 0)
  assert.equal(store.readPosts(account.id).length, 1)
  assert.ok(Date.parse(store.getAccount(account.id).next_auto_refresh_at) > Date.now())
  disposers.pop()()
  assert.deepEqual(cleared, [intervals[0].timer])
})
