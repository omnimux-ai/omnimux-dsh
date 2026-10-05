import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRivalAccountsStore } from '../rival/rival-accounts-store.js'
import { resolveRivalPaths } from '../rival/rival-paths.js'
import { createRivalRefreshScheduler } from '../rival/rival-refresh.js'
import { createRivalRemote, SOCIAL_DATA_TOOL } from '../rival/rival-remote.js'
import { createRivalAccountsService } from '../rival/rival-accounts-service.js'
import { createRivalDispatcher, RIVAL_PREFIX } from '../rival/rival-routes.js'
import {
  accountHealth,
  coolingMinutesLeft,
  poolQuota,
  poolTally,
  stoppedReasonText,
} from './rival-health.js'

/**
 * #3111 端到端契约：真实 dispatcher（E1/E7/E8/E9）产出的账号事实行，
 * 喂给 Client 唯一的四态判据，验证「已停止」恢复路径的端到端状态机。
 *
 * 不绕过 HTTP 层手改 store——所有事实都从真实路由响应里取，判据函数是
 * 组件里跑的那一个。期望值来自规格 §8.1 的字面值：error+identity-unverified
 * → 需要重新导入；error+其余 → 已停止；backoff → 冷却中；其余（含 paused）
 * → 正常。
 */

const NOW = Date.parse('2026-10-05T08:00:00.000Z')
const USER_FIXTURE = {
  channel_id: 'UCabcdefghijklmnopqrstuv',
  nickname: 'Rival One',
  follower_count: 12_000,
}
const POSTS_FIXTURE = {
  items: [
    { id: '1', short_code: '1', desc: 'p1', play_count: 5000, digg_count: 400, comment_count: 30, share_count: 10, create_time: 1_700_000_000 },
  ],
}

function makeCountingCloud(behaviour = {}) {
  const cloud = {
    calls: [],
    getTool(name) {
      if (name !== SOCIAL_DATA_TOOL) return undefined
      return {
        async execute(args) {
          cloud.calls.push({ capability: args.capability, id: args.id })
          if (args.capability === 'user') {
            if (behaviour.failUser) throw behaviour.failUser
            return { platform: args.platform, capability: 'user', field: 'channel_id', value: args.id, data: behaviour.user ?? USER_FIXTURE }
          }
          if (behaviour.failPosts) throw behaviour.failPosts
          return { platform: args.platform, capability: 'posts', field: 'channel_id', value: args.id, data: behaviour.posts ?? POSTS_FIXTURE }
        },
      }
    },
  }
  return cloud
}

const sandboxes = []
function makeWorld(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rival-pool-health-'))
  sandboxes.push(root)
  const paths = resolveRivalPaths({ paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') } })
  const now = () => NOW
  const store = createRivalAccountsStore({ paths, now, ...(options.limits ? { limits: options.limits } : {}) })
  const cloud = options.cloud ?? makeCountingCloud()
  const remote = createRivalRemote({ getTool: cloud.getTool, now })
  let service = null
  const scheduler = createRivalRefreshScheduler({
    store,
    remote,
    now,
    runCycle: (input) => service.runCycle(input),
  })
  service = createRivalAccountsService({
    store,
    remote,
    scheduler,
    paths,
    importUrl: async () => ({ status: 202, body: { data: { id: 'insp_1' } } }),
  })
  const dispatcher = createRivalDispatcher({
    service,
    paths,
    downloadMediaImpl: async (url, dir, opts) => {
      writeFileSync(join(dir, `${opts?.prefix ?? 'x'}file.jpg`), 'image-bytes')
      return join(dir, `${opts?.prefix ?? 'x'}file.jpg`)
    },
  })
  return { root, store, scheduler, dispatcher }
}

async function call(dispatcher, method, url, body) {
  return dispatcher.dispatch({ method, url, ...(body === undefined ? {} : { body }) })
}

async function cleanup() {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true })
  sandboxes.length = 0
}

describe('E2E：error 的两个互斥子类在 E1 上可区分（规格 §8.1）', () => {
  it('identity-unverified → reimport；退避用尽 → stopped，两态互斥', async () => {
    try {
      const identityRefusal = new Error('channel_id is invalid')
      identityRefusal.code = 'identity-unverified'
      const world = makeWorld({ cloud: makeCountingCloud({ failUser: identityRefusal }) })
      const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
      await world.scheduler.settled()

      const list = await call(world.dispatcher, 'GET', RIVAL_PREFIX)
      const row = list.body.data.items.find((account) => account.id === created.body.data.id)
      assert.equal(row.refresh_state, 'error')
      assert.equal(row.error_code, 'identity-unverified')
      assert.equal(accountHealth(row, NOW), 'reimport', '身份类失败必须判需要重新导入')
      assert.notEqual(accountHealth(row, NOW), 'stopped', '与已停止互斥')
    } finally {
      await cleanup()
    }
  })

  it('非身份类失败跑完退避序列后 → stopped + 连续失败计数', async () => {
    try {
      // 默认 per-day cap 是 4 次调用（=2 个周期）：放宽后才能把三次失败喂给同一账号。
      const world = makeWorld({
        cloud: makeCountingCloud({ failUser: new Error('cloud down') }),
        limits: { cloud_calls_per_account_per_day: 100, cloud_calls_global_per_day: 500 },
      })
      assert.equal(
        world.store.readConfig().limits.cloud_calls_per_account_per_day,
        100,
        'the widened ledger must actually apply',
      )
      const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
      await world.scheduler.settled()
      // 第一次失败后是 backoff + 计数 1。手动刷新会被 10 分钟冷却拦住，
      // 退避序列只有自动 tick 跑得完：BACKOFF_MINUTES = [5, 15, 60]。
      world.scheduler.tick(NOW + 6 * 60_000)
      await world.scheduler.settled()
      world.scheduler.tick(NOW + 16 * 60_000)
      await world.scheduler.settled()
      world.scheduler.tick(NOW + 61 * 60_000)
      await world.scheduler.settled()

      const list = await call(world.dispatcher, 'GET', RIVAL_PREFIX)
      const row = list.body.data.items.find((account) => account.id === created.body.data.id)
      assert.equal(row.refresh_state, 'error')
      assert.equal(row.error_code, 'cloud-error')
      assert.equal(accountHealth(row, NOW), 'stopped')
      assert.equal(stoppedReasonText(row), '连续 4 次刷新失败')
    } finally {
      await cleanup()
    }
  })
})

describe('E2E：已停止账号的行内重试恢复路径（规格 §8.1 恢复路径）', () => {
  it('POST /refresh 让 error 账号回队列，健康态立即回正常、计数闭合', async () => {
    try {
      const identityRefusal = new Error('channel_id is invalid')
      identityRefusal.code = 'identity-unverified'
      const world = makeWorld({ cloud: makeCountingCloud({ failUser: identityRefusal }) })
      const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
      await world.scheduler.settled()

      const before = await call(world.dispatcher, 'GET', RIVAL_PREFIX)
      const beforeTally = poolTally(before.body.data.items, NOW)
      assert.equal(beforeTally.reimport, 1)

      const refreshed = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
      assert.equal(refreshed.status, 202)

      // 行内重试后的重读：refresh_state 离开终态（queued/running），健康态立刻回正常。
      const after = await call(world.dispatcher, 'GET', RIVAL_PREFIX)
      const row = after.body.data.items.find((account) => account.id === created.body.data.id)
      assert.ok(['queued', 'running'].includes(row.refresh_state), `expected queued or running, got ${row.refresh_state}`)
      assert.equal(accountHealth(row, NOW), 'normal')
      const afterTally = poolTally(after.body.data.items, NOW)
      assert.equal(afterTally.reimport, 0)
      assert.equal(afterTally.ok, afterTally.total, '恢复后计数闭合到全部正常')
    } finally {
      await cleanup()
    }
  })
})

describe('E2E：E9 快照支撑今日额度', () => {
  it('poolQuota 从 E9 的 budget_used/budget_limits 算出 left/total', async () => {
    try {
      const world = makeWorld()
      await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
      await world.scheduler.settled()

      const status = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/status`)
      assert.equal(status.status, 200)
      const quota = poolQuota(status.body.data, null)
      assert.equal(quota.total, 50)
      assert.equal(quota.left, 48, '首次采集花掉 2 次云调用：50 - 2 = 48')
    } finally {
      await cleanup()
    }
  })
})

describe('E2E：冷却中账号的分钟数判据', () => {
  it('backoff 行读 next_auto_refresh_at 给冷却分钟（向上取整）', async () => {
    try {
      const world = makeWorld({ cloud: makeCountingCloud({ failUser: new Error('cloud down') }) })
      const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
      await world.scheduler.settled()

      const list = await call(world.dispatcher, 'GET', RIVAL_PREFIX)
      const row = list.body.data.items.find((account) => account.id === created.body.data.id)
      assert.equal(row.refresh_state, 'backoff')
      // Host 写的是 now + 5min（BACKOFF_MINUTES[0]）；冷却分钟应得 5。
      assert.equal(accountHealth(row, NOW), 'cooling')
      assert.equal(coolingMinutesLeft(row, NOW), 5)
    } finally {
      await cleanup()
    }
  })
})
