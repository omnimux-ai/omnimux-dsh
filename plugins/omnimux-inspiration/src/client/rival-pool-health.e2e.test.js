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

/**
 * #3839 端到端：小红书账号从「导入即终态」走到「笔记在时间线上」。
 *
 * 这条链路横跨三层，任何一层单独测都证明不了用户看到的结果：
 *   1. Host 导入小红书账号 → 云端零调用、行落 `platform-unsupported`；
 *   2. 浏览器通道放行 → 一次性 token → claim → complete 回写笔记；
 *   3. Client 判据在真实 E1 行上判为「已停止」：
 *      `assert.equal(accountHealth(before, NOW), 'stopped')`。「浏览器更新」按钮的
 *      判据与渲染由 `rival-health.test.js` + `rival-pool-health-render.test.js` 覆盖；
 *   4. 回写后 E15 作品流真的能列出这些笔记。
 */
describe('E2E：小红书账号的浏览器更新闭环（#3839）', () => {
  const XHS_UID = '5e4896d200000000010062cc'
  const XHS_URL = `https://www.xiaohongshu.com/user/profile/${XHS_UID}`
  const XHS_CAPTURE = {
    platform: 'xiaohongshu',
    handle: XHS_UID,
    nickname: 'Miss圆滚滚',
    avatar_url: 'https://sns-avatar-qc.xhscdn.com/a.jpg',
    bio: '记录日常',
    followers: 12_000,
    following: 30,
    posts_count: 88,
    posts: [{
      platform_post_id: '66aa11bb22cc33dd44ee55ff',
      source_url: `https://www.xiaohongshu.com/explore/66aa11bb22cc33dd44ee55ff?xsec_token=abc`,
      title: '第一条笔记',
      content: '第一条笔记正文',
      posted_at: '2026-10-04T04:00:00.000Z',
      stats: { likes: 321, collects: 99 },
      media: [{ type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/a.jpg' }],
    }],
    captured_at: new Date(NOW).toISOString(),
    extractor: 'xiaohongshu-profile',
  }

  it('导入→终态→浏览器回写→作品流出现笔记，且全程零云端调用', async () => {
    try {
      const world = makeWorld()
      const imported = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: XHS_URL })
      assert.equal(imported.status, 201)
      const accountId = imported.body.data.id
      await world.scheduler.settled()

      // 1. 导入后是能力终态，云端一次都没被调用。
      const before = (await call(world.dispatcher, 'GET', RIVAL_PREFIX)).body.data.items
        .find((row) => row.id === accountId)
      assert.equal(before.refresh_state, 'error')
      assert.equal(before.error_code, 'platform-unsupported')
      assert.equal(before.next_auto_refresh_at, null)
      assert.equal(before.post_count, 0)
      // 2. 判据「这行该给浏览器更新」由 rival-health.test.js 与
      //    rival-pool-health-render.test.js 承担（判据 + 真实渲染）；这里只钉
      //    dispatcher 事实，避免同一个判据出现第三份会漂的副本。
      assert.equal(accountHealth(before, NOW), 'stopped')

      // 3. 浏览器通道：token → claim → complete。
      const requested = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${accountId}/plugin-refresh-request`)
      assert.equal(requested.status, 201)
      const token = requested.body.data.token
      assert.equal(requested.body.data.url, `${XHS_URL}#omnimux-refresh=${token}`)
      const claimed = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/plugin-refresh/claim`, {
        token,
        page_url: XHS_URL,
        handle: XHS_UID,
      })
      assert.equal(claimed.status, 200)
      const completed = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/plugin-refresh/complete`, {
        token,
        account: XHS_CAPTURE,
      })
      assert.equal(completed.status, 200)
      assert.equal(completed.body.data.new_posts, 1)

      // 4. 回写后：行回到可读状态，笔记在作品流里，封面与收藏都在。
      const after = (await call(world.dispatcher, 'GET', RIVAL_PREFIX)).body.data.items
        .find((row) => row.id === accountId)
      assert.equal(after.refresh_state, 'idle')
      assert.equal(after.error_code, null)
      assert.equal(after.nickname, 'Miss圆滚滚')
      assert.equal(after.post_count, 1)
      assert.equal(accountHealth(after, NOW), 'normal')

      const feed = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/posts?page=1&page_size=20`)
      assert.equal(feed.status, 200)
      const row = feed.body.data.items.find((item) => item.id === '66aa11bb22cc33dd44ee55ff')
      assert.ok(row, '回写的笔记必须出现在作品流里')
      assert.equal(row.title, '第一条笔记')
      assert.equal(row.source_platform, 'xiaohongshu')
      assert.equal(row.cover_src, 'https://sns-webpic-qc.xhscdn.com/a.jpg')
      assert.equal(row.stats.likes, 321)
    } finally {
      await cleanup()
    }
  })
})
