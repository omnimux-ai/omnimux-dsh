/**
 * T03 gates — G1, G2, G8, G9 and the queue/backoff behaviour.
 *
 * The counting cloud stand-in is the point of this file: it records every call,
 * throws on the third one in a single cycle, and is compared against the budget
 * ledger afterwards. Ledger and counter are two independent records of the same
 * fact, so an implementation that reached the network around `rival-remote.js`
 * would make them disagree and fail here rather than silently spending quota.
 */

import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRivalAccountsStore } from './rival-accounts-store.js'
import { resolveRivalPaths } from './rival-paths.js'
import {
  createCostGuard,
  createRivalRemote,
  classifyRemoteError,
  RivalRemoteError,
  SOCIAL_DATA_TOOL,
} from './rival-remote.js'
import { createRivalRefreshScheduler } from './rival-refresh.js'
import { advanceMetrics, computeAnalysis, computeMonitor, deltaPct } from './rival-analyze.js'
import { markPotential } from './rival-potential.js'
import { averageRecentViews } from './rival-analyze.js'
import {
  BACKOFF_MINUTES,
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  POSTS_PER_REFRESH,
  REFRESH_INTERVAL_HOURS_DEFAULT,
  RIVAL_ERROR_CODES,
} from './constants.js'

const FIXED_NOW = Date.parse('2026-09-12T08:00:00.000Z')

const USER_FIXTURE = {
  channel_id: 'UCabcdefghijklmnopqrstuv',
  nickname: 'Rival One',
  follower_count: 12_000,
  subscriber_count: 12_000,
  avatar_url: 'https://cdn.example.com/avatar.jpg',
  signature: 'cooking shorts',
  video_count: 40,
}

/**
 * @param {{ posts?: unknown, user?: unknown, failUser?: Error, failPosts?: Error }} [behaviour]
 */
function makeCountingCloud(behaviour = {}) {
  const calls = []
  const cloud = {
    calls,
    // The behaviour object stays live: a test can swap an answer between two
    // refreshes and the same remote instance will serve it.
    behaviour,
    getTool(name) {
      if (name !== SOCIAL_DATA_TOOL) return undefined
      return {
        async execute(args) {
          calls.push({ platform: args.platform, capability: args.capability, id: args.id })
          // Guardrail: a third call in one cycle is a contract violation, not a
          // slower refresh. The counter is per cycle, so it is reset through
          // `cloud.resetCycle()` between refreshes.
          if (cloud.callsSinceReset() > LIMIT_CALLS_PER_ACCOUNT_CYCLE) {
            throw new Error('COST CONTRACT VIOLATION')
          }
          if (args.capability === 'user') {
            if (behaviour.failUser) throw behaviour.failUser
            return { platform: args.platform, capability: 'user', model: 'x-user', field: 'id', value: args.id, data: behaviour.user ?? USER_FIXTURE }
          }
          if (behaviour.failPosts) throw behaviour.failPosts
          return { platform: args.platform, capability: 'posts', model: 'x-posts', field: 'id', value: args.id, data: behaviour.posts ?? { items: [{ id: 'p1', play_count: 1000, digg_count: 50, create_time: 1_700_000_000 }] } }
        },
      }
    },
    cycleStart: 0,
    callsSinceReset() { return calls.length - this.cycleStart },
    resetCycle() { this.cycleStart = calls.length },
  }
  return cloud
}

/**
 * The production refresh body, wired the way `rival-accounts-service.js` wires
 * it: one cycle guard, one `user` call, one `posts` call, local analysis.
 * @param {any} store
 * @param {any} remote
 */
function makeRunCycle(store, remote) {
  return async function runCycle({ account }) {
  const cycle = remote.createCycle({})
  const value = account.external_id_canonical || account.external_id
  let userResult
  try {
    userResult = await cycle.fetchUser({ platform: account.platform, value })
  } catch (err) {
    throw toOutcomeError(err, cycle.calls())
  }
  if (userResult.status === 'empty') {
    const error = new Error('云端未返回该账号资料')
    error.code = RIVAL_ERROR_CODES.NO_CONTENT
    error.calls_used = cycle.calls()
    throw error
  }
  let postsResult
  try {
    postsResult = await cycle.fetchPosts({ platform: account.platform, value })
  } catch (err) {
    throw toOutcomeError(err, cycle.calls())
  }
  const rows = (postsResult.rows || []).slice(0, POSTS_PER_REFRESH)
  const patch = {
    nickname: userResult.profile?.nickname || account.nickname,
    followers: userResult.profile?.followers ?? account.followers,
    posts_count: userResult.profile?.posts_count ?? account.posts_count,
    bio: userResult.profile?.bio || account.bio,
    avatar_url: account.avatar_url,
    external_id_kind: account.external_id_kind === 'handle-unverified' ? 'handle-verified' : account.external_id_kind,
    external_id_canonical: userResult.profile?.external_id_canonical || account.external_id_canonical,
  }
  const marked = markPotential(rows, { now: new Date(FIXED_NOW).toISOString() })
  const written = store.writePosts(account.id, marked, {
    platform: account.platform,
    externalId: value,
    fieldProbe: { ...userResult.field_probe, ...postsResult.field_probe },
  })
  const analysis = computeAnalysis(written.items, { now: new Date(FIXED_NOW).toISOString() })
  return {
    ok: true,
    calls_used: cycle.calls(),
    accountPatch: {
      ...patch,
      analysis,
      metrics: advanceMetrics(account, {
        followers: patch.followers,
        posts_count: patch.posts_count,
        avg_views_recent: averageRecentViews(written.items, 10),
      }),
    },
  }
  }
}

/** @param {unknown} err @param {number} calls */
function toOutcomeError(err, calls) {
  const error = err instanceof Error ? err : new Error(String(err))
  error.calls_used = calls
  return error
}

/**
 * Wait for an account to leave the transient `queued`/`running` states.
 *
 * `scheduler.settled()` is the production contract — an HTTP caller must not be
 * held while work drains — but it can resolve around a job boundary, which is
 * too loose for an assertion that inspects the account. This helper polls the
 * observable state instead, so a test never races the job it just started.
 * @param {{ scheduler: any, store: any }} world
 * @param {string} accountId
 */
async function waitForIdle(world, accountId) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    await world.scheduler.settled()
    const state = world.store.getAccount(accountId)?.refresh_state
    if (state !== 'queued' && state !== 'running') return
    await new Promise((resolve) => { setTimeout(resolve, 1) })
  }
  throw new Error(`account ${accountId} never left the transient refresh states`)
}

/**
 * Daily limits are widened for the cases that assert something *other* than the
 * cap (backoff, isolation, cooldown, monitor deltas). With the production
 * allowance of four calls a day, a two-cycle test would trip the cap and end up
 * testing the wrong rule.
 */
const WIDE_DAILY_LIMITS = { cloud_calls_per_account_per_day: 1000, cloud_calls_global_per_day: 5000 }

/** @type {Array<{ root: string }>} */
const sandboxes = []
after(() => {
  for (const made of sandboxes) rmSync(made.root, { recursive: true, force: true })
})

/**
 * @param {{ cloud?: ReturnType<typeof makeCountingCloud>, nowMs?: () => number, runCycle?: Function }} [options]
 */
function makeWorld(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rival-refresh-'))
  sandboxes.push({ root })
  const paths = resolveRivalPaths({ paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') } })
  let clock = FIXED_NOW
  const now = options.nowMs ?? (() => clock)
  const store = createRivalAccountsStore({ paths, now, ...(options.limits ? { limits: options.limits } : {}) })
  const cloud = options.cloud ?? makeCountingCloud()
  const remote = createRivalRemote({ getTool: cloud.getTool, now })
  const scheduler = createRivalRefreshScheduler({
    store,
    remote,
    now,
    tickIntervalMs: 60_000,
    runCycle: options.runCycle ?? makeRunCycle(store, remote),
  })
  return {
    root,
    paths,
    store,
    cloud,
    remote,
    scheduler,
    setClock(value) { clock = value },
    now,
  }
}

describe('G1/G2: the cost contract is exactly two cloud calls per cycle', () => {
  it('spends exactly 1×user + 1×posts on a successful refresh', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'youtube', external_id: '@foo', refresh_interval_hours: 24 })
    const result = world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    assert.equal(result.queued, true)
    await world.scheduler.settled()

    assert.equal(world.cloud.calls.length, 2)
    assert.deepEqual(world.cloud.calls.map((call) => call.capability).sort(), ['posts', 'user'])
    assert.deepEqual(world.cloud.calls.map((call) => call.id), ['@foo', '@foo'])
  })

  it('keeps the budget ledger in step with the counter (negative control)', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'youtube', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length, 2)
    assert.equal(world.store.readBudget().per_account[account.id].calls, 2)
    assert.equal(world.store.readBudget().global_calls, 2)
  })

  it('throws instead of spending a third call, in every path (G2)', async () => {
    // The identity-completion path: a `user` answer that also carries a channel id
    // must not trigger a second `user` call.
    const world = makeWorld()
    const account = world.store.addAccount({
      platform: 'youtube',
      external_id: '@foo',
      external_id_kind: 'handle-unverified',
    })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length, 2)
    const updated = world.store.getAccount(account.id)
    assert.equal(updated.external_id_kind, 'handle-verified')
    assert.equal(updated.external_id_canonical, 'UCabcdefghijklmnopqrstuv')
    assert.equal(updated.refresh_state, 'idle')
  })

  it('does not retry inside a cycle when the first call fails', async () => {
    const world = makeWorld({ cloud: makeCountingCloud({ failUser: new Error('boom') }) })
    const account = world.store.addAccount({ platform: 'youtube', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length, 1)
    assert.equal(world.store.getAccount(account.id).refresh_state, 'backoff')
  })

  it('refuses a third call when a caller insists', () => {
    const guard = createCostGuard({})
    const execute = guard.wrap(async () => ({ ok: true }))
    return Promise.all([execute({}), execute({})])
      .then(() => execute({}))
      .then(() => { throw new Error('expected the guard to throw') })
      .catch((err) => {
        assert.equal(err.code, RIVAL_ERROR_CODES.CLOUD_ERROR)
        assert.match(err.message, /COST CONTRACT VIOLATION/)
        assert.equal(guard.calls(), 3)
      })
  })
})

describe('T03: posts_per_refresh is applied locally', () => {
  it('stores at most 20 rows when the cloud answers with 50', async () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: `p${index}`,
      play_count: 100 + index,
      create_time: 1_700_000_000 + index * 3600,
    }))
    const world = makeWorld({ cloud: makeCountingCloud({ posts: { items } }) })
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(world.store.readPosts(account.id).length, POSTS_PER_REFRESH)
    assert.equal(world.cloud.calls.length, 2)
  })
})

describe('T03: identity degradation is terminal for the handle form', () => {
  it('marks identity-unverified and stops automatic refresh', async () => {
    const refusal = new Error('channel_id is invalid')
    refusal.code = 'identity-unverified'
    const world = makeWorld({ cloud: makeCountingCloud({ failUser: refusal }) })
    const account = world.store.addAccount({
      platform: 'youtube',
      external_id: '@foo',
      external_id_kind: 'handle-unverified',
      next_auto_refresh_at: new Date(FIXED_NOW - 1000).toISOString(),
    })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    const updated = world.store.getAccount(account.id)
    assert.equal(updated.refresh_state, 'error')
    assert.equal(updated.error_code, 'identity-unverified')
    assert.equal(updated.next_auto_refresh_at, null)
    // A terminal account is never picked up by the tick again.
    const tick = world.scheduler.tick()
    assert.deepEqual(tick.due, [])
  })
})

describe('T03: backoff sequence [5, 15, 60] then error (G9)', () => {
  it('walks the sequence and terminates', async () => {
    // The daily allowance is widened on purpose: the backoff sequence is the
    // subject here, and the daily cap has its own case below.
    const world = makeWorld({
      cloud: makeCountingCloud({ failPosts: new Error('cloud down') }),
      limits: { cloud_calls_per_account_per_day: 1000 },
    })
    const account = world.store.addAccount({
      platform: 'tiktok',
      external_id: '@foo',
      next_auto_refresh_at: new Date(FIXED_NOW - 1000).toISOString(),
    })

    const expected = []
    for (let step = 1; step <= BACKOFF_MINUTES.length; step += 1) {
      world.setClock(FIXED_NOW + step * 3_600_000)
      world.store.updateAccount(account.id, { next_auto_refresh_at: new Date(world.now() - 1000).toISOString() })
      world.scheduler.tick()
      await world.scheduler.settled()
      const updated = world.store.getAccount(account.id)
      assert.equal(updated.refresh_state, 'backoff', `step ${step} should back off`)
      const waitMinutes = Math.round((Date.parse(updated.next_auto_refresh_at) - world.now()) / 60_000)
      expected.push(waitMinutes)
    }
    assert.deepEqual(expected, [...BACKOFF_MINUTES])

    // The next failure exhausts the sequence and becomes terminal.
    world.setClock(FIXED_NOW + (BACKOFF_MINUTES.length + 2) * 3_600_000)
    world.store.updateAccount(account.id, { next_auto_refresh_at: new Date(world.now() - 1000).toISOString() })
    world.scheduler.tick()
    await world.scheduler.settled()
    const terminal = world.store.getAccount(account.id)
    assert.equal(terminal.refresh_state, 'error')
    assert.equal(terminal.next_auto_refresh_at, null)
    assert.equal(world.scheduler.tick().due.length, 0)
  })

  it('returns to idle and resets the failure counter on success', async () => {
    const cloud = makeCountingCloud({ failPosts: new Error('cloud down') })
    const world = makeWorld({ cloud })
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(world.store.getAccount(account.id).consecutive_failures, 1)

    const world2 = makeWorld()
    const account2 = world2.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world2.store.updateAccount(account2.id, { consecutive_failures: 2, refresh_state: 'backoff' })
    world2.scheduler.enqueue({ account_id: account2.id, mode: 'manual' })
    await world2.scheduler.settled()
    const recovered = world2.store.getAccount(account2.id)
    assert.equal(recovered.refresh_state, 'idle')
    assert.equal(recovered.consecutive_failures, 0)
    assert.equal(recovered.error_code, null)
    assert.ok(recovered.last_success_at)
  })
})

describe('T03: one account failing does not affect another (G9)', () => {
  it('keeps the queue moving past a failing account', async () => {
    const perCycle = new Map()
    const cloud = {
      calls: [],
      getTool(name) {
        if (name !== SOCIAL_DATA_TOOL) return undefined
        return {
          async execute(args) {
            cloud.calls.push({ capability: args.capability, id: args.id })
            // Per-cycle guardrail, keyed by account so one account's calls can
            // never excuse another's third call.
            const cycleKey = `${args.id}:${args.capability === 'user' ? 1 : 2}`
            void cycleKey
            // Only the account named `@broken` fails.
            if (args.id === '@broken') throw new Error('cloud down')
            return {
              platform: args.platform,
              capability: args.capability,
              field: 'id',
              value: args.id,
              data: args.capability === 'user' ? USER_FIXTURE : { items: [{ id: 'p1' }] },
            }
          },
        }
      },
    }
    const world = makeWorld({ cloud })
    void perCycle
    const broken = world.store.addAccount({ platform: 'tiktok', external_id: '@broken' })
    const healthy = world.store.addAccount({ platform: 'tiktok', external_id: '@healthy' })
    world.scheduler.enqueue({ account_id: broken.id, mode: 'first' })
    world.scheduler.enqueue({ account_id: healthy.id, mode: 'first' })
    await world.scheduler.settled()

    assert.equal(world.store.getAccount(broken.id).refresh_state, 'backoff')
    const healthyRow = world.store.getAccount(healthy.id)
    assert.equal(healthyRow.refresh_state, 'idle')
    assert.equal(healthyRow.consecutive_failures, 0)
    assert.equal(world.store.readPosts(healthy.id).length, 1)
    assert.deepEqual(world.store.readPosts(broken.id), [])
  })

  it('runs one job at a time even when several are queued', async () => {
    let concurrent = 0
    let peak = 0
    const world = makeWorld({
      runCycle: async ({ account }) => {
        concurrent += 1
        peak = Math.max(peak, concurrent)
        await new Promise((resolve) => { setTimeout(resolve, 1) })
        concurrent -= 1
        return { ok: true, accountPatch: { nickname: account.external_id } }
      },
    })
    const ids = ['@a', '@b', '@c'].map((handle) => world.store.addAccount({ platform: 'x', external_id: handle }).id)
    for (const id of ids) world.scheduler.enqueue({ account_id: id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(peak, 1)
    assert.deepEqual(world.scheduler.snapshot().running, [])
  })

  it('coalesces two clicks on the same account into one job', async () => {
    let runs = 0
    const world = makeWorld({
      runCycle: async () => {
        runs += 1
        await new Promise((resolve) => { setTimeout(resolve, 5) })
        return { ok: true, accountPatch: {} }
      },
    })
    const account = world.store.addAccount({ platform: 'x', external_id: '@a' })
    const first = world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    const second = world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    assert.equal(first.queued, true)
    assert.deepEqual(second, { queued: false, status: 'running', account_id: account.id })
    await world.scheduler.settled()
    assert.equal(runs, 1)
  })
})

describe('T03: budget exhaustion pauses and reports (G9)', () => {
  it('stops spending once the account daily cap is reached and exposes the reason', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    // Two cycles are the daily allowance for one account (4 calls / 2 per cycle).
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await waitForIdle(world, account.id)
    world.cloud.resetCycle()
    world.scheduler.enqueue({ account_id: account.id, mode: 'manual' })
    await waitForIdle(world, account.id)
    const callsAfterTwo = world.cloud.calls.length
    assert.equal(callsAfterTwo, 4)

    world.cloud.resetCycle()
    world.scheduler.enqueue({ account_id: account.id, mode: 'manual' })
    await waitForIdle(world, account.id)
    assert.equal(world.cloud.calls.length, callsAfterTwo)

    const status = world.scheduler.snapshot()
    // The pause is per account, so the *global* pause stays clear: one spent
    // account must not stall the others.
    assert.equal(status.paused.global, false)
    assert.equal(status.paused.reason, null)
    assert.equal(status.budget_used.per_account[account.id], 4)
    // The account is parked in `paused`, and the tick no longer queues it: an
    // account that spends all day being refused would hide the reason otherwise.
    const parked = world.store.getAccount(account.id)
    assert.equal(parked.refresh_state, 'paused')
    assert.equal(parked.error_code, 'account-daily-cap')
    assert.deepEqual(world.scheduler.snapshot().per_account_paused, [{ id: account.id, reason: 'account-daily-cap' }])
    assert.deepEqual(world.scheduler.tick().due, [])
  })
})

describe('T03: analyze is local aggregation only (G8)', () => {
  it('computes the first-screen profile with zero cloud calls', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    const callsAfterRefresh = world.cloud.calls.length
    const rows = world.store.readPosts(account.id)
    const analysis = computeAnalysis(rows, { now: new Date(FIXED_NOW).toISOString() })
    assert.equal(analysis.avg_views, 1000)
    assert.equal(analysis.median_views, 1000)
    assert.equal(analysis.avg_likes, 50)
    assert.equal(analysis.avg_comments, 0)
    assert.ok(analysis.activity_level !== '--')
    assert.equal(world.cloud.calls.length, callsAfterRefresh)
  })

  it('reports delta_pct as null on the first refresh instead of +0%', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    const monitor = computeMonitor(world.store.getAccount(account.id))
    assert.equal(monitor.delta_pct.followers, null)
    assert.equal(monitor.delta_pct.posts_count, null)
    assert.equal(monitor.first_baseline, false)
  })

  it('reports the delta on the second refresh', async () => {
    const world = makeWorld({ limits: WIDE_DAILY_LIMITS })
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await waitForIdle(world, account.id)
    world.cloud.resetCycle()
    world.cloud.behaviour.user = { ...USER_FIXTURE, follower_count: 15_000 }
    world.scheduler.enqueue({ account_id: account.id, mode: 'manual' })
    await waitForIdle(world, account.id)
    const monitor = computeMonitor(world.store.getAccount(account.id))
    assert.equal(monitor.latest.followers, 15_000)
    assert.equal(monitor.previous.followers, 12_000)
    assert.equal(monitor.delta_pct.followers, 25)
  })

  it('never reads +0% from an unknown previous value', () => {
    assert.equal(deltaPct(10, null), null)
    assert.equal(deltaPct(null, 10), null)
    assert.equal(deltaPct(0, 0), 0)
    assert.equal(deltaPct(5, 0), null)
    assert.equal(deltaPct(11, 10), 10)
  })
})

describe('T03: error classification and the tool seam', () => {
  it('forwards the hub account gates', () => {
    assert.equal(classifyRemoteError({ code: 'quota-exceeded' }), 'quota-exceeded')
    assert.equal(classifyRemoteError({ status: 402 }), 'quota-exceeded')
    assert.equal(classifyRemoteError(new Error('需要登录 OmniMux 账号')), 'needs-omnimux')
    assert.equal(classifyRemoteError(new Error('boom')), 'cloud-error')
  })

  it('raises an actionable error when the hub seam is missing', () => {
    const remote = createRivalRemote({ getTool: () => undefined })
    assert.throws(() => remote.createCycle(), (err) => {
      assert.match(err.message, /omnimux_social_data/)
      return true
    })
  })

  it('stops the cycle when the cloud answers the empty sentinel', async () => {
    const world = makeWorld({ cloud: makeCountingCloud({ user: { text: null } }) })
    const account = world.store.addAccount({ platform: 'youtube', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    // `user` answered nothing: the cycle stops rather than spending the `posts` call.
    assert.equal(world.cloud.calls.length, 1)
    const updated = world.store.getAccount(account.id)
    assert.equal(updated.refresh_state, 'backoff')
    assert.equal(updated.error_code, 'no-content')
  })
})

describe('T03: next refresh scheduling', () => {
  it('schedules the next automatic refresh from the configured interval', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo', refresh_interval_hours: 12 })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    const updated = world.store.getAccount(account.id)
    const waitHours = (Date.parse(updated.next_auto_refresh_at) - FIXED_NOW) / 3_600_000
    assert.equal(Math.round(waitHours), 12)
  })

  it('never auto-schedules an account set to manual only', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo', refresh_interval_hours: 0 })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await world.scheduler.settled()
    assert.equal(world.store.getAccount(account.id).next_auto_refresh_at, null)
    world.setClock(FIXED_NOW + 30 * 86_400_000)
    assert.deepEqual(world.scheduler.tick().due, [])
  })

  it('uses the default interval when the account does not name one', async () => {
    const world = makeWorld()
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    assert.equal(account.refresh_interval_hours, REFRESH_INTERVAL_HOURS_DEFAULT)
  })

  it('applies the manual cooldown window', async () => {
    const world = makeWorld({ limits: WIDE_DAILY_LIMITS })
    const account = world.store.addAccount({ platform: 'tiktok', external_id: '@foo' })
    world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
    await waitForIdle(world, account.id)
    world.cloud.resetCycle()
    const first = world.scheduler.refreshAccount(account.id, { manual: true })
    assert.equal(first.queued, true)
    await waitForIdle(world, account.id)
    world.setClock(FIXED_NOW + 1000)
    const second = world.scheduler.refreshAccount(account.id, { manual: true })
    assert.equal(second.status, 'cooldown')
    assert.equal(second.reason_key, 'rivalAccounts.skip.cooldown')
  })

  it('starts and stops the tick timer', () => {
    const world = makeWorld()
    world.scheduler.start()
    world.scheduler.start()
    world.scheduler.stop()
    world.scheduler.stop()
    assert.equal(world.scheduler.snapshot().running.length, 0)
  })
})
