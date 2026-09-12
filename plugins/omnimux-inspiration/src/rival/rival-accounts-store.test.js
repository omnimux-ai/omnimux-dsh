/**
 * T02 gates.
 *
 * G3 is the important one: the persisted row must contain exactly the fields the
 * whitelist builder names. This repository has lost state twice to a field that a
 * handler wrote and the row builder never copied — the write "succeeded" and the
 * card stayed on "running" forever.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAccountRow,
  buildConfig,
  buildPostRow,
  createRivalAccountsStore,
  RivalStoreError,
} from './rival-accounts-store.js'
import { resolveRivalPaths } from './rival-paths.js'
import { averageRecentViews } from './rival-analyze.js'
import {
  computeBaseline,
  markPotential,
  median,
  scoreRuleSet,
} from './rival-potential.js'
import {
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  LIMIT_CALLS_PER_ACCOUNT_DAY,
  LIMIT_CALLS_GLOBAL_DAY,
  POSTS_CACHE_MAX_ROWS,
  VIEWS_HISTORY_MAX,
} from './constants.js'

const FIXED_NOW = Date.parse('2026-09-12T08:00:00.000Z')

/**
 * @param {{ nowMs?: () => number }} [clock]
 */
function makeStore(clock = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rival-store-'))
  const paths = resolveRivalPaths({
    paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') },
  })
  const store = createRivalAccountsStore({ paths, now: clock.nowMs ?? (() => FIXED_NOW) })
  return { root, paths, store }
}

/** @type {Array<{ root: string }>} */
const sandboxes = []
function sandbox(clock) {
  const made = makeStore(clock)
  sandboxes.push(made)
  return made
}
after(() => {
  for (const made of sandboxes) rmSync(made.root, { recursive: true, force: true })
})

describe('rival-accounts-store: whitelist constructors (G3)', () => {
  it('drops a field the whitelist does not name', () => {
    const row = buildAccountRow(
      { platform: 'youtube', external_id: '@foo', secret_field: 'leak', nested: { a: 1 } },
      { now: '2026-09-12T00:00:00.000Z' },
    )
    assert.equal('secret_field' in row, false)
    assert.equal('nested' in row, false)
  })

  it('drops an undeclared field on the way to disk as well', () => {
    const { store, paths } = sandbox()
    const created = store.addAccount({ platform: 'tiktok', external_id: '@foo', sneaky: 'x' })
    const onDisk = JSON.parse(readFileSync(paths.accountsFile, 'utf8')).items[0]
    assert.equal('sneaky' in created, false)
    assert.equal('sneaky' in onDisk, false)
    assert.equal(onDisk.id, created.id)
  })

  it('normalizes an unknown refresh state to idle and an unknown interval to the default', () => {
    const row = buildAccountRow({ platform: 'x', external_id: 'foo', refresh_state: 'nope', refresh_interval_hours: 7 }, { now: FIXED_NOW_ISO })
    assert.equal(row.refresh_state, 'idle')
    assert.equal(row.refresh_interval_hours, 24)
  })

  it('keeps a post row to the declared shape', () => {
    const row = buildPostRow(
      { id: 'p1', title: 't', stats: { views: 5, extra: 1 }, something_else: true },
      { now: FIXED_NOW_ISO, accountId: 'riv_a', platform: 'tiktok' },
    )
    assert.deepEqual(Object.keys(row).sort(), [
      'account_id', 'cover_http_url', 'cover_local_path', 'cover_url', 'duration', 'first_seen_at',
      'id', 'in_library', 'inspiration_id', 'last_seen_at', 'metrics', 'platform', 'posted_at',
      'potential', 'stats', 'text', 'title', 'type', 'url', 'video_local_path', 'video_url',
    ])
    assert.equal('extra' in row.stats, false)
    assert.equal('something_else' in row, false)
    assert.equal(row.account_id, 'riv_a')
  })

  it('builds a config from constants, not from the caller', () => {
    const config = buildConfig({ limits: { cloud_calls_global_per_day: 999_999 }, posts_per_refresh: 500 }, FIXED_NOW_ISO)
    assert.equal(config.limits.cloud_calls_per_account_per_cycle, LIMIT_CALLS_PER_ACCOUNT_CYCLE)
    assert.equal(config.limits.cloud_calls_per_account_per_day, LIMIT_CALLS_PER_ACCOUNT_DAY)
    assert.equal(config.limits.cloud_calls_global_per_day, LIMIT_CALLS_GLOBAL_DAY)
    assert.equal(config.media_download.video, 'on-demand')
  })
})

const FIXED_NOW_ISO = new Date(FIXED_NOW).toISOString()

describe('rival-accounts-store: atomic writes', () => {
  it('leaves no temp file behind and never writes the target partially', () => {
    const { store, paths } = sandbox()
    store.addAccount({ platform: 'tiktok', external_id: '@a' })
    store.addAccount({ platform: 'youtube', external_id: '@b' })
    const leftovers = readdirSync(paths.dir).filter((name) => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [])
    assert.equal(JSON.parse(readFileSync(paths.accountsFile, 'utf8')).items.length, 2)
  })

  it('survives a corrupt file by answering an empty library instead of throwing', () => {
    const { store, paths } = sandbox()
    store.addAccount({ platform: 'tiktok', external_id: '@a' })
    writeFileSync(paths.accountsFile, '{ not json', 'utf8')
    assert.deepEqual(store.listAccounts(), [])
  })
})

describe('rival-accounts-store: dedup, update and removal', () => {
  it('finds an account by platform + external_id, case-insensitively', () => {
    const { store } = sandbox()
    store.addAccount({ platform: 'youtube', external_id: '@Foo' })
    assert.ok(store.findAccount('youtube', '@foo'))
    assert.equal(store.findAccount('youtube', '@bar'), null)
    assert.equal(store.findAccount('tiktok', '@foo'), null)
  })

  it('keeps nested metrics when a patch touches only one branch', () => {
    const { store } = sandbox()
    const created = store.addAccount({ platform: 'x', external_id: 'foo' })
    store.updateAccount(created.id, { metrics: { previous: { followers: 10 } } })
    const updated = store.updateAccount(created.id, { metrics: { latest: { followers: 12 } } })
    assert.equal(updated.metrics.latest.followers, 12)
    assert.equal(updated.metrics.previous.followers, 10)
  })

  it('throws a coded 404 for a missing account', () => {
    const { store } = sandbox()
    assert.throws(() => store.updateAccount('nope', {}), (err) => err instanceof RivalStoreError && err.status === 404)
    assert.throws(() => store.removeAccount('nope'), (err) => err.code === 'account-not-found')
  })

  it('removes the account and its post cache', () => {
    const { store, paths } = sandbox()
    const created = store.addAccount({ platform: 'x', external_id: 'foo' })
    store.writePosts(created.id, [{ id: 'p1' }], { platform: 'x' })
    const file = join(paths.postsDir, `${created.id}.json`)
    assert.equal(existsSync(file), true)
    store.removeAccount(created.id)
    assert.equal(store.listAccounts().length, 0)
    assert.equal(existsSync(file), false)
  })
})

describe('rival-accounts-store: post cache', () => {
  it('keeps the previous row and counts it as carry_over', () => {
    const { store } = sandbox()
    store.writePosts('riv_a', [{ id: 'p1', posted_at: '2026-09-10T00:00:00.000Z' }], { platform: 'tiktok' })
    const result = store.writePosts('riv_a', [{ id: 'p2', posted_at: '2026-09-11T00:00:00.000Z' }], { platform: 'tiktok' })
    assert.equal(result.carry_over, 1)
    const rows = store.readPosts('riv_a')
    assert.deepEqual(rows.map((row) => row.id).sort(), ['p1', 'p2'])
  })

  it('sorts newest first and puts an unreadable date last, without dropping it', () => {
    const { store } = sandbox()
    store.writePosts('riv_a', [
      { id: 'old', posted_at: '2026-09-01T00:00:00.000Z' },
      { id: 'undated' },
      { id: 'new', posted_at: '2026-09-11T00:00:00.000Z' },
    ], { platform: 'tiktok' })
    assert.deepEqual(store.readPosts('riv_a').map((row) => row.id), ['new', 'old', 'undated'])
  })

  it('trims the cache to the configured maximum, newest first', () => {
    const { store } = sandbox()
    const rows = Array.from({ length: POSTS_CACHE_MAX_ROWS + 25 }, (_, index) => ({
      id: `p${index}`,
      posted_at: new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 3_600_000).toISOString(),
    }))
    store.writePosts('riv_a', rows, { platform: 'tiktok' })
    const stored = store.readPosts('riv_a')
    assert.equal(stored.length, POSTS_CACHE_MAX_ROWS)
    assert.equal(stored[0].id, `p${POSTS_CACHE_MAX_ROWS + 24}`)
  })

  it('caps views_history at the configured maximum', () => {
    let clock = FIXED_NOW
    const { store } = sandbox({ nowMs: () => clock })
    for (let index = 0; index < VIEWS_HISTORY_MAX + 5; index += 1) {
      clock = FIXED_NOW + index * 60_000
      store.writePosts('riv_a', [{ id: 'p1', stats: { views: 100 + index } }], { platform: 'tiktok' })
    }
    const row = store.readPosts('riv_a')[0]
    assert.equal(row.metrics.views_history.length, VIEWS_HISTORY_MAX)
    assert.equal(row.metrics.views_history[VIEWS_HISTORY_MAX - 1].views, 100 + VIEWS_HISTORY_MAX + 4)
  })

  it('keeps first_seen_at stable across refreshes and advances last_seen_at', () => {
    let clock = FIXED_NOW
    const { store } = sandbox({ nowMs: () => clock })
    store.writePosts('riv_a', [{ id: 'p1' }], { platform: 'tiktok' })
    const first = store.readPosts('riv_a')[0]
    clock = FIXED_NOW + 86_400_000
    store.writePosts('riv_a', [{ id: 'p1', title: 'updated' }], { platform: 'tiktok' })
    const second = store.readPosts('riv_a')[0]
    assert.equal(second.first_seen_at, first.first_seen_at)
    assert.equal(second.last_seen_at, new Date(clock).toISOString())
    assert.equal(second.title, 'updated')
  })

  it('updates one cached post and rejects an unknown one', () => {
    const { store } = sandbox()
    store.writePosts('riv_a', [{ id: 'p1' }], { platform: 'tiktok' })
    const updated = store.updatePost('riv_a', 'p1', { inspiration_id: 'insp_1', in_library: true })
    assert.equal(updated.inspiration_id, 'insp_1')
    assert.equal(store.findPost('riv_a', 'p1').in_library, true)
    assert.throws(() => store.updatePost('riv_a', 'nope', {}), (err) => err.code === 'post-not-found')
  })

  it('drops a video_url that arrives as an empty string', () => {
    const { store } = sandbox()
    store.writePosts('riv_a', [{ id: 'p1', video_url: '' }], { platform: 'tiktok' })
    assert.equal(store.readPosts('riv_a')[0].video_url, null)
  })
})

describe('rival-accounts-store: budget ledger', () => {
  it('reserves exactly the per-cycle contract and reports the ledger', () => {
    const { store } = sandbox()
    const decision = store.reserve({ accountId: 'riv_a' })
    assert.equal(decision.allowed, true)
    assert.equal(decision.budget.per_account.riv_a.calls, LIMIT_CALLS_PER_ACCOUNT_CYCLE)
    assert.equal(decision.budget.global_calls, LIMIT_CALLS_PER_ACCOUNT_CYCLE)
  })

  it('refuses and names the ledger once the account daily cap is reached', () => {
    const { store } = sandbox()
    assert.equal(store.reserve({ accountId: 'riv_a' }).allowed, true)
    assert.equal(store.reserve({ accountId: 'riv_a' }).allowed, true)
    const refused = store.reserve({ accountId: 'riv_a' })
    assert.equal(refused.allowed, false)
    assert.equal(refused.reason, 'account-daily-cap')
    // A refusal never decrements: the ledger still shows the two granted cycles.
    assert.equal(refused.budget.per_account.riv_a.calls, LIMIT_CALLS_PER_ACCOUNT_DAY)
    // ... and it does NOT raise the global pause: another account still has its
    // own allowance, and a global pause would have stopped it too.
    assert.equal(refused.budget.paused.global, false)
    assert.equal(store.canReserve({ accountId: 'riv_b' }).allowed, true)
  })

  it('refuses once the global daily cap would be exceeded', () => {
    const { store } = sandbox()
    let granted = 0
    for (let index = 0; index < 40; index += 1) {
      const decision = store.reserve({ accountId: `riv_${index}` })
      if (!decision.allowed) {
        assert.equal(decision.reason, 'global-daily-cap')
        break
      }
      granted += 1
    }
    assert.equal(granted, Math.floor(LIMIT_CALLS_GLOBAL_DAY / LIMIT_CALLS_PER_ACCOUNT_CYCLE))
    assert.equal(store.readBudget().paused.global, true)
  })

  it('resets the ledger when the local day rolls over (injected clock)', () => {
    let clock = FIXED_NOW
    const { store } = sandbox({ nowMs: () => clock })
    store.reserve({ accountId: 'riv_a' })
    assert.equal(store.readBudget().per_account.riv_a.calls, LIMIT_CALLS_PER_ACCOUNT_CYCLE)
    clock = FIXED_NOW + 86_400_000
    const next = store.readBudget()
    assert.equal(next.per_account.riv_a, undefined)
    assert.equal(next.global_calls, 0)
    assert.equal(next.day, new Date(clock).toISOString().slice(0, 10))
  })

  it('refunds calls the refresh never spent', () => {
    const { store } = sandbox()
    store.reserve({ accountId: 'riv_a' })
    const after = store.refundCalls('riv_a', 1)
    assert.equal(after.per_account.riv_a.calls, LIMIT_CALLS_PER_ACCOUNT_CYCLE - 1)
    assert.equal(after.global_calls, LIMIT_CALLS_PER_ACCOUNT_CYCLE - 1)
  })

  it('clears a pause on demand', () => {
    const { store } = sandbox()
    for (let index = 0; index < 40; index += 1) store.reserve({ accountId: `riv_${index}` })
    assert.equal(store.readBudget().paused.global, true)
    const resumed = store.resumeBudget()
    assert.equal(resumed.paused.global, false)
    assert.equal(resumed.paused.reason, null)
  })

  it('honours the configured interval when deciding whether a refresh is due', () => {
    const { store } = sandbox()
    const created = store.addAccount({ platform: 'x', external_id: 'foo', refresh_interval_hours: 0 })
    assert.equal(store.isRefreshDue(created), false)
    const hourly = store.addAccount({ platform: 'x', external_id: 'bar', refresh_interval_hours: 24, next_auto_refresh_at: new Date(FIXED_NOW - 1000).toISOString() })
    assert.equal(store.isRefreshDue(hourly), true)
    const later = store.addAccount({ platform: 'x', external_id: 'baz', next_auto_refresh_at: new Date(FIXED_NOW + 60_000).toISOString() })
    assert.equal(store.isRefreshDue(later), false)
  })
})

describe('rival-potential: R1–R4 boundaries', () => {
  const baseline = (overrides = {}) => ({
    medianViews: 1000,
    medianLikes: 50,
    olderMedianViews: 900,
    sampleSize: 6,
    ...overrides,
  })

  it('flags nothing with a single sample', () => {
    const score = scoreRuleSet({ stats: { views: 100_000, likes: 9_000 } }, baseline({ sampleSize: 1 }))
    assert.equal(score.flagged, false)
    assert.deepEqual(score.rules, [])
  })

  it('does not divide by a zero median', () => {
    const score = scoreRuleSet({ stats: { views: 100 } }, baseline({ medianViews: 0, olderMedianViews: 0 }))
    assert.equal(score.flagged, false)
  })

  it('flags R1 exactly at the multiplier and not below it', () => {
    assert.deepEqual(scoreRuleSet({ stats: { views: 3000 } }, baseline()).rules.includes('R1'), true)
    assert.equal(scoreRuleSet({ stats: { views: 2999 } }, baseline()).rules.includes('R1'), false)
  })

  it('ignores a post whose view count is unknown', () => {
    const score = scoreRuleSet({ stats: {} }, baseline())
    assert.equal(score.flagged, false)
  })

  it('treats views=0 as a real value, not as an outlier', () => {
    const score = scoreRuleSet({ stats: { views: 0, likes: 0 } }, baseline())
    assert.equal(score.flagged, false)
  })

  it('flags R2 only above the absolute floor', () => {
    assert.equal(scoreRuleSet({ stats: { views: 1500 } }, baseline({ medianViews: 1000 })).rules.includes('R2'), true)
    assert.equal(scoreRuleSet({ stats: { views: 999 } }, baseline({ medianViews: 900 })).rules.includes('R2'), false)
  })

  it('flags R3 on engagement rate and not on raw likes', () => {
    const score = scoreRuleSet({ stats: { views: 1000, likes: 200 } }, baseline())
    assert.equal(score.rules.includes('R3'), true)
    const flat = scoreRuleSet({ stats: { views: 1000, likes: 50 } }, baseline())
    assert.equal(flat.rules.includes('R3'), false)
  })

  it('flags R4 against the older half of the history', () => {
    const score = scoreRuleSet({ stats: { views: 2700 } }, baseline({ olderMedianViews: 900 }))
    assert.equal(score.rules.includes('R4'), true)
  })

  it('explains every rule with a reason key', () => {
    const score = scoreRuleSet({ stats: { views: 100_000, likes: 10_000 } }, baseline())
    assert.deepEqual(score.rules, ['R1', 'R2', 'R3', 'R4'])
    assert.deepEqual(score.reason_keys, [
      'rivalAccounts.potential.r1',
      'rivalAccounts.potential.r2',
      'rivalAccounts.potential.r3',
      'rivalAccounts.potential.r4',
    ])
  })

  it('computes a median for both parities and for an empty list', () => {
    assert.equal(median([1, 2, 3]), 2)
    assert.equal(median([1, 2, 3, 4]), 2.5)
    assert.equal(median([]), 0)
    assert.equal(median([Number.NaN, undefined, 5]), 5)
  })

  it('derives the baseline from the rows and ignores unknown view counts', () => {
    const baselineOf = computeBaseline([
      { id: 'a', posted_at: '2026-09-01T00:00:00.000Z', stats: { views: 100, likes: 4 } },
      { id: 'b', posted_at: '2026-09-02T00:00:00.000Z', stats: { views: 200, likes: 6 } },
      { id: 'c', posted_at: '2026-09-03T00:00:00.000Z', stats: { views: 300, likes: 8 } },
      { id: 'd', posted_at: '2026-09-04T00:00:00.000Z', stats: {} },
    ])
    assert.equal(baselineOf.medianViews, 200)
    assert.equal(baselineOf.sampleSize, 4)
    assert.equal(baselineOf.medianLikes, 6)
  })

  it('marks a whole list at once and stamps scored_at', () => {
    const rows = markPotential(
      Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, stats: { views: 100 } })).concat([
        { id: 'hit', stats: { views: 10_000, likes: 5_000 } },
      ]),
      { now: FIXED_NOW_ISO },
    )
    const hit = rows.find((row) => row.id === 'hit')
    assert.equal(hit.potential.flagged, true)
    assert.equal(hit.potential.score, null)
    assert.equal(hit.potential.scored_at, FIXED_NOW_ISO)
    assert.equal(rows.find((row) => row.id === 'p0').potential.flagged, false)
  })

  it('averages the newest rows that carry a view count', () => {
    assert.equal(averageRecentViews([
      { posted_at: '2026-09-01T00:00:00.000Z', stats: { views: 10 } },
      { posted_at: '2026-09-02T00:00:00.000Z', stats: { views: 20 } },
      { posted_at: '2026-09-03T00:00:00.000Z', stats: {} },
    ]), 15)
    assert.equal(averageRecentViews([]), 0)
  })
})
