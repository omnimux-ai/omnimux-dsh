/**
 * Host contract of the manual "update this account" flow (Issue #3556).
 *
 * Layer: the three handlers in `rival/rival-plugin-refresh.js` plus the route
 * table that exposes them. The world is a real `createRivalAccountsStore` on a
 * throw-away tmp directory with an injected clock, driven by the production
 * dispatcher exactly like `rival-routes.test.js`.
 *
 * What is asserted, and why:
 * - token lifecycle: minted once per request, replaced on a second request,
 *   2-minute TTL, claim-then-complete state machine, replay refused;
 * - identity binding: platform and `@`-insensitive handle on both claim and
 *   complete;
 * - merge: non-empty profile wins, unmeasured counters keep their old value,
 *   posts upsert by platform id (URL fallback) without deleting history;
 * - the whole point: a remote spy sees 0 calls and the budget ledger stays at
 *   0 — this path must never touch the cloud.
 */

import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRivalAccountsStore } from './rival/rival-accounts-store.js'
import { resolveRivalPaths } from './rival/rival-paths.js'
import { createRivalRefreshScheduler } from './rival/rival-refresh.js'
import { SOCIAL_DATA_TOOL, createRivalRemote } from './rival/rival-remote.js'
import { createRivalAccountsService } from './rival/rival-accounts-service.js'
import { createRivalDispatcher, matchRivalRoute, RIVAL_PREFIX } from './rival/rival-routes.js'
import {
  PLUGIN_REFRESH_TTL_MS,
  handlePluginRefreshClaim,
  handlePluginRefreshComplete,
  handlePluginRefreshRequest,
} from './rival/rival-plugin-refresh.js'

const FIXED_NOW = Date.parse('2026-10-21T08:00:00.000Z')
const NOW_ISO = new Date(FIXED_NOW).toISOString()
const LATER_ISO = new Date(FIXED_NOW + PLUGIN_REFRESH_TTL_MS).toISOString()
const TIKTOK_URL = 'https://www.tiktok.com/@alice'
const X_URL = 'https://x.com/@bob'

/** Two captured posts; newest first, as the content script reports them. */
const CAPTURE_POSTS = [
  {
    platform_post_id: '7300000000000000002',
    source_url: 'https://www.tiktok.com/@alice/video/7300000000000000002',
    title: 'second',
    content: 'second body',
    posted_at: '2026-10-20T12:00:00.000Z',
    stats: { likes: 20, comments: 3, views: 2000, shares: 2 },
  },
  {
    platform_post_id: '7300000000000000001',
    source_url: 'https://www.tiktok.com/@alice/video/7300000000000000001',
    title: 'first',
    content: 'first body',
    posted_at: '2026-10-19T12:00:00.000Z',
    stats: { likes: 5, comments: 1, views: 500, shares: 0 },
  },
]

/** @type {Array<{ root: string }>} */
const sandboxes = []
after(() => {
  for (const made of sandboxes) rmSync(made.root, { recursive: true, force: true })
})

/**
 * Remote spy: every call is a failure the test wants to see.
 * The plugin-refresh path must never reach `getTool`, let alone `execute`.
 */
function makeCloud() {
  const cloud = { calls: 0 }
  cloud.getTool = (name) => {
    if (name !== SOCIAL_DATA_TOOL) return undefined
    return {
      async execute() {
        cloud.calls += 1
        throw new Error('plugin refresh must not call the cloud')
      },
    }
  }
  return cloud
}

function makeWorld() {
  const root = mkdtempSync(join(tmpdir(), 'rival-plugin-refresh-'))
  sandboxes.push({ root })
  const paths = resolveRivalPaths({
    paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') },
  })
  let clockMs = FIXED_NOW
  const clock = () => clockMs
  clock.advance = (ms) => {
    clockMs += ms
  }
  const store = createRivalAccountsStore({ paths, now: clock })
  const cloud = makeCloud()
  const remote = createRivalRemote({ getTool: cloud.getTool, now: clock })
  let service = null
  const scheduler = createRivalRefreshScheduler({
    store,
    remote,
    now: clock,
    runCycle: (input) => service.runCycle(input),
  })
  service = createRivalAccountsService({ store, remote, scheduler, paths })
  const dispatcher = createRivalDispatcher({ service, paths })
  return { root, paths, store, cloud, remote, service, scheduler, dispatcher, clock }
}

const ACCOUNT_DEFAULTS = {
  platform: 'tiktok',
  external_id: '@alice',
  external_id_kind: 'username',
  handle: '@alice',
  profile_url: TIKTOK_URL,
  nickname: 'Alice Old',
  avatar_url: 'https://cdn.example/old.jpg',
  bio: 'old bio',
  followers: 100,
  posts_count: 1,
  refresh_interval_hours: 24,
  refresh_state: 'idle',
  next_auto_refresh_at: '2026-10-22T08:00:00.000Z',
}

function seedAccount(world, overrides) {
  return world.store.addAccount(Object.assign({}, ACCOUNT_DEFAULTS, overrides))
}

function seedXAccount(world, overrides) {
  return seedAccount(world, Object.assign({
    platform: 'x',
    external_id: '@bob',
    handle: '@bob',
    profile_url: X_URL,
    nickname: 'Bob Old',
  }, overrides))
}

function capture(overrides) {
  return Object.assign({
    platform: 'tiktok',
    handle: 'alice',
    nickname: 'Alice New',
    avatar_url: 'https://cdn.example/new.jpg',
    bio: 'new bio',
    followers: 1200,
    following: 12,
    posts_count: 2,
    posts: CAPTURE_POSTS.slice(),
    captured_at: NOW_ISO,
    extractor: 'tiktok-profile',
  }, overrides)
}

function requestToken(world, accountId) {
  return handlePluginRefreshRequest({ store: world.store, accountId })
}

function claimToken(world, body) {
  return handlePluginRefreshClaim({ store: world.store, body })
}

function completeToken(world, body) {
  return handlePluginRefreshComplete({ store: world.store, body })
}

/** request → claim → complete with defaults, returning all three answers. */
function runFlow(world, accountId, options) {
  const opts = Object.assign({ pageUrl: TIKTOK_URL, handle: 'alice', capture: null }, options)
  const requested = requestToken(world, accountId)
  assert.equal(requested.status, 201)
  const token = requested.body.data.token
  const claimed = claimToken(world, { token, page_url: opts.pageUrl, handle: opts.handle })
  assert.equal(claimed.status, 200)
  const completeBody = { token, account: capture(opts.capture) }
  return { requested, claimed, token, completed: completeToken(world, completeBody), completeBody }
}

function postOf(store, accountId, postId) {
  return store.findPost(accountId, postId)
}

describe('POST /rival-accounts/:id/plugin-refresh-request', () => {
  it('mints a 32-hex token, returns the profile URL with the hash and the TTL', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const result = requestToken(world, account.id)

    assert.equal(result.status, 201)
    const data = result.body.data
    assert.match(data.token, /^[0-9a-f]{32}$/)
    assert.equal(data.expires_at, LATER_ISO)
    assert.equal(data.url, `${TIKTOK_URL}#omnimux-refresh=${data.token}`)

    const persisted = world.store.getAccount(account.id)
    assert.equal(persisted.plugin_refresh.token, data.token)
    assert.equal(persisted.plugin_refresh.created_at, NOW_ISO)
    assert.equal(persisted.plugin_refresh.expires_at, LATER_ISO)
    assert.equal(persisted.plugin_refresh.claimed_at, null)
  })

  it('replaces the previous token so only the newest one can be claimed', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const first = requestToken(world, account.id)
    world.clock.advance(1_000)
    const second = requestToken(world, account.id)
    assert.notEqual(first.body.data.token, second.body.data.token)

    const oldClaim = claimToken(world, { token: first.body.data.token, page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(oldClaim.status, 404)
    assert.equal(oldClaim.body.code, 'plugin-refresh-unknown-token')

    const newClaim = claimToken(world, { token: second.body.data.token, page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(newClaim.status, 200)
  })

  it('refuses a platform the browser capture does not support', () => {
    const world = makeWorld()
    const account = seedAccount(world, {
      platform: 'instagram',
      external_id: '@alice',
      handle: '@alice',
      profile_url: 'https://www.instagram.com/@alice',
    })
    const result = requestToken(world, account.id)
    assert.equal(result.status, 400)
    assert.equal(result.body.code, 'platform-unsupported')
    assert.ok(result.body.error)
    assert.equal(world.store.getAccount(account.id).plugin_refresh, null)
  })

  it('answers 404 for an unknown account id', () => {
    const world = makeWorld()
    const result = requestToken(world, 'riv_missing')
    assert.equal(result.status, 404)
    assert.equal(result.body.code, 'account-not-found')
  })

  it('falls back to the canonical page URL when the stored URL is empty', () => {
    const world = makeWorld()
    const tiktok = seedAccount(world, { profile_url: '' })
    const xAccount = seedXAccount(world, { profile_url: '' })

    const tiktokUrl = requestToken(world, tiktok.id).body.data.url
    assert.ok(tiktokUrl.startsWith('https://www.tiktok.com/@alice#omnimux-refresh='))
    const xUrl = requestToken(world, xAccount.id).body.data.url
    assert.ok(xUrl.startsWith('https://x.com/@bob#omnimux-refresh='))
  })

  it('is reachable through the dispatcher as a POST and refuses other methods', async () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const posted = await world.dispatcher.dispatch({
      method: 'POST',
      url: `${RIVAL_PREFIX}/${account.id}/plugin-refresh-request`,
    })
    assert.equal(posted.status, 201)
    assert.match(posted.body.data.token, /^[0-9a-f]{32}$/)

    const got = await world.dispatcher.dispatch({
      method: 'GET',
      url: `${RIVAL_PREFIX}/${account.id}/plugin-refresh-request`,
    })
    assert.equal(got.status, 405)
  })
})

describe('POST /rival-accounts/plugin-refresh/claim', () => {
  it('returns the bound account identity and marks the token claimed', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const requested = requestToken(world, account.id)
    const token = requested.body.data.token

    const result = claimToken(world, { token, page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.data, {
      account_id: account.id,
      platform: 'tiktok',
      handle: '@alice',
      page_url: TIKTOK_URL,
    })
    assert.equal(world.store.getAccount(account.id).plugin_refresh.claimed_at, NOW_ISO)
  })

  it('answers 404 for an unknown or empty token', () => {
    const world = makeWorld()
    seedAccount(world)
    const unknown = claimToken(world, { token: 'f'.repeat(32), page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(unknown.status, 404)
    assert.equal(unknown.body.code, 'plugin-refresh-unknown-token')
    const empty = claimToken(world, { token: '', page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(empty.status, 404)
  })

  it('answers 410 once the 2-minute TTL has passed', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const token = requestToken(world, account.id).body.data.token
    world.clock.advance(PLUGIN_REFRESH_TTL_MS + 1_000)

    const result = claimToken(world, { token, page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(result.status, 410)
    assert.equal(result.body.code, 'plugin-refresh-expired')
  })

  it('answers 409 when the token was already claimed', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const token = requestToken(world, account.id).body.data.token
    assert.equal(claimToken(world, { token, page_url: TIKTOK_URL, handle: 'alice' }).status, 200)

    const replay = claimToken(world, { token, page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(replay.status, 409)
    assert.equal(replay.body.code, 'plugin-refresh-already-claimed')
  })

  it('normalizes @ and case on both sides of the handle comparison', () => {
    const world = makeWorld()
    const account = seedAccount(world, { handle: '@Alice', external_id: '@Alice' })
    const token = requestToken(world, account.id).body.data.token

    const result = claimToken(world, { token, page_url: TIKTOK_URL, handle: '@ALICE ' })
    assert.equal(result.status, 200)
  })

  it('answers 409 for a handle that is not the account handle', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const token = requestToken(world, account.id).body.data.token

    const result = claimToken(world, { token, page_url: TIKTOK_URL, handle: 'mallory' })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'plugin-refresh-handle-mismatch')
    assert.ok(result.body.error)
    assert.equal(world.store.getAccount(account.id).plugin_refresh.claimed_at, null)
  })

  it('answers 409 when the page is on another supported platform', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const token = requestToken(world, account.id).body.data.token

    const result = claimToken(world, { token, page_url: 'https://x.com/@alice', handle: 'alice' })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'plugin-refresh-platform-mismatch')
  })

  it('accepts a twitter.com page as the X account platform', () => {
    const world = makeWorld()
    const account = seedXAccount(world)
    const token = requestToken(world, account.id).body.data.token

    const result = claimToken(world, { token, page_url: 'https://twitter.com/bob', handle: 'bob' })
    assert.equal(result.status, 200)
    assert.equal(result.body.data.platform, 'x')
  })

  it('is reachable through the dispatcher under the collection namespace', async () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const requested = requestToken(world, account.id)
    const claimed = await world.dispatcher.dispatch({
      method: 'POST',
      url: `${RIVAL_PREFIX}/plugin-refresh/claim`,
      body: { token: requested.body.data.token, page_url: TIKTOK_URL, handle: 'alice' },
    })
    assert.equal(claimed.status, 200)
    assert.equal(claimed.body.data.account_id, account.id)
  })
})

describe('POST /rival-accounts/plugin-refresh/complete', () => {
  it('answers 409 when the token has not been claimed yet', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const token = requestToken(world, account.id).body.data.token

    const result = completeToken(world, { token, account: capture() })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'plugin-refresh-not-claimed')
    assert.equal(world.store.readPosts(account.id).length, 0)
  })

  it('answers 410 once the TTL has passed after claiming', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const token = requestToken(world, account.id).body.data.token
    assert.equal(claimToken(world, { token, page_url: TIKTOK_URL, handle: 'alice' }).status, 200)
    world.clock.advance(PLUGIN_REFRESH_TTL_MS + 1_000)

    const result = completeToken(world, { token, account: capture() })
    assert.equal(result.status, 410)
    assert.equal(result.body.code, 'plugin-refresh-expired')
  })

  it('answers 404 for a token that never existed', () => {
    const world = makeWorld()
    seedAccount(world)
    const result = completeToken(world, { token: 'a'.repeat(32), account: capture() })
    assert.equal(result.status, 404)
  })

  it('merges non-empty profile fields and integer counts', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)

    const merged = world.store.getAccount(account.id)
    assert.equal(merged.nickname, 'Alice New')
    assert.equal(merged.avatar_url, 'https://cdn.example/new.jpg')
    assert.equal(merged.bio, 'new bio')
    assert.equal(merged.followers, 1200)
    assert.equal(merged.posts_count, 2)
  })

  it('keeps the previous value when the capture is empty or not an integer', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id, {
      capture: {
        nickname: '',
        bio: '   ',
        avatar_url: undefined,
        followers: 12.5,
        posts_count: '3',
      },
    })
    assert.equal(flow.completed.status, 200)

    const merged = world.store.getAccount(account.id)
    assert.equal(merged.nickname, 'Alice Old')
    assert.equal(merged.bio, 'old bio')
    assert.equal(merged.avatar_url, 'https://cdn.example/old.jpg')
    assert.equal(merged.followers, 100)
    assert.equal(merged.posts_count, 1)
  })

  it('resets the account refresh timers and state', () => {
    const world = makeWorld()
    const account = seedAccount(world, {
      refresh_state: 'error',
      consecutive_failures: 3,
      error_code: 'cloud-error',
      error_message: 'boom',
      last_refresh_at: '2026-10-20T08:00:00.000Z',
    })
    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)

    const merged = world.store.getAccount(account.id)
    assert.equal(merged.refresh_state, 'idle')
    assert.equal(merged.consecutive_failures, 0)
    assert.equal(merged.error_code, null)
    assert.equal(merged.error_message, null)
    assert.equal(merged.last_refresh_at, NOW_ISO)
    assert.equal(merged.last_checked_at, NOW_ISO)
    assert.equal(merged.next_auto_refresh_at, new Date(FIXED_NOW + 24 * 3_600_000).toISOString())
    assert.equal(merged.plugin_refresh, null)

    const onDisk = JSON.parse(readFileSync(world.paths.accountsFile, 'utf8'))
    const row = onDisk.items.find((item) => item.id === account.id)
    assert.equal(row.plugin_refresh, null)
    assert.equal(row.last_checked_at, NOW_ISO)
  })

  it('leaves next_auto_refresh_at null for a manual-only interval', () => {
    const world = makeWorld()
    const account = seedAccount(world, { refresh_interval_hours: 0 })
    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)
    assert.equal(world.store.getAccount(account.id).next_auto_refresh_at, null)
  })

  it('inserts new posts with the plugin source marker and first_seen_at', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)
    assert.equal(flow.completed.body.data.new_posts, 2)
    assert.equal(flow.completed.body.data.updated_posts, 0)

    const posts = world.store.readPosts(account.id)
    assert.equal(posts.length, 2)
    const newest = posts.find((row) => row.id === '7300000000000000002')
    assert.equal(newest.source, 'plugin')
    assert.equal(newest.first_seen_at, NOW_ISO)
    assert.equal(newest.stats.views, 2000)
    assert.equal(newest.stats.likes, 20)
    assert.equal(newest.title, 'second')
    assert.equal(newest.url, 'https://www.tiktok.com/@alice/video/7300000000000000002')
  })

  it('updates an existing post in place, keeping its old copy and history', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    world.store.writePosts(account.id, [
      {
        id: '7300000000000000001',
        url: 'https://www.tiktok.com/@alice/video/7300000000000000001',
        title: 'seed title',
        text: 'seed body',
        posted_at: '2026-10-19T12:00:00.000Z',
        stats: { views: 50, likes: 5, comments: 1, shares: 0, saves: 7 },
      },
    ], { platform: 'tiktok', externalId: '@alice' })
    const seededFirstSeen = postOf(world.store, account.id, '7300000000000000001').first_seen_at

    const flow = runFlow(world, account.id, {
      capture: {
        posts: [
          {
            platform_post_id: '7300000000000000001',
            source_url: 'https://www.tiktok.com/@alice/video/7300000000000000001',
            title: 'capture title',
            content: 'capture body',
            posted_at: '2026-10-19T12:00:00.000Z',
            stats: { views: 100, likes: 9 },
          },
        ],
      },
    })
    assert.equal(flow.completed.status, 200)
    assert.equal(flow.completed.body.data.new_posts, 0)
    assert.equal(flow.completed.body.data.updated_posts, 1)

    const posts = world.store.readPosts(account.id)
    assert.equal(posts.length, 1)
    const updated = posts.find((row) => row.id === '7300000000000000001')
    assert.equal(updated.title, 'seed title')
    assert.equal(updated.text, 'seed body')
    assert.equal(updated.stats.views, 100)
    assert.equal(updated.stats.likes, 9)
    // Counters the capture did not measure are kept, not nulled out.
    assert.equal(updated.stats.saves, 7)
    assert.equal(updated.first_seen_at, seededFirstSeen)
    assert.equal(updated.metrics.views_history.length, 2)
    assert.equal(updated.metrics.views_history.at(-1).views, 100)
  })

  it('keeps posts the capture did not mention', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    world.store.writePosts(account.id, [
      {
        id: 'old-post',
        url: 'https://www.tiktok.com/@alice/video/old',
        title: 'old',
        posted_at: '2026-10-01T12:00:00.000Z',
        stats: { views: 10 },
      },
    ], { platform: 'tiktok', externalId: '@alice' })

    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)

    const posts = world.store.readPosts(account.id)
    assert.equal(posts.length, 3)
    assert.ok(posts.find((row) => row.id === 'old-post'))
  })

  it('uses the canonical source URL as the identity when no post id is present', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id, {
      capture: {
        posts: [
          {
            source_url: 'https://www.tiktok.com/@alice/video/77?is_from_webapp=1&sender_device=pc',
            title: 'no id',
            posted_at: '2026-10-18T12:00:00.000Z',
            stats: { views: 7 },
          },
        ],
      },
    })
    assert.equal(flow.completed.status, 200)
    const posts = world.store.readPosts(account.id)
    assert.equal(posts.length, 1)
    assert.equal(posts.at(0).id, 'https://www.tiktok.com/@alice/video/77')
    assert.equal(posts.at(0).url, 'https://www.tiktok.com/@alice/video/77?is_from_webapp=1&sender_device=pc')
  })

  it('answers 409 when the capture belongs to another handle', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id, { capture: { handle: 'mallory' } })
    assert.equal(flow.completed.status, 409)
    assert.equal(flow.completed.body.code, 'plugin-refresh-handle-mismatch')
    assert.equal(world.store.readPosts(account.id).length, 0)
  })

  it('answers 409 when the capture belongs to another platform', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id, { capture: { platform: 'x', handle: 'alice' } })
    assert.equal(flow.completed.status, 409)
    assert.equal(flow.completed.body.code, 'plugin-refresh-platform-mismatch')
  })

  it('answers 400 when the capture payload is missing', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const requested = requestToken(world, account.id)
    const token = requested.body.data.token
    assert.equal(claimToken(world, { token, page_url: TIKTOK_URL, handle: 'alice' }).status, 200)

    const result = completeToken(world, { token, account: null })
    assert.equal(result.status, 400)
    assert.equal(result.body.code, 'plugin-refresh-invalid-capture')
  })

  it('never touches the cloud or the refresh budget', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)
    assert.equal(world.cloud.calls, 0)
    assert.equal(world.store.readBudget().global_calls, 0)
    assert.deepEqual(Object.keys(world.store.readBudget().per_account), [])
  })

  it('refuses a replay of the completed token instead of calling it unknown', () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const flow = runFlow(world, account.id)
    assert.equal(flow.completed.status, 200)

    const claimReplay = claimToken(world, { token: flow.token, page_url: TIKTOK_URL, handle: 'alice' })
    assert.equal(claimReplay.status, 409)
    assert.equal(claimReplay.body.code, 'plugin-refresh-already-completed')

    const completeReplay = completeToken(world, { token: flow.token, account: capture() })
    assert.equal(completeReplay.status, 409)
    assert.equal(completeReplay.body.code, 'plugin-refresh-already-completed')
  })

  it('is reachable through the dispatcher and returns the merged account', async () => {
    const world = makeWorld()
    const account = seedAccount(world)
    const requested = await world.dispatcher.dispatch({
      method: 'POST',
      url: `${RIVAL_PREFIX}/${account.id}/plugin-refresh-request`,
    })
    const token = requested.body.data.token
    const claimed = await world.dispatcher.dispatch({
      method: 'POST',
      url: `${RIVAL_PREFIX}/plugin-refresh/claim`,
      body: { token, page_url: TIKTOK_URL, handle: 'alice' },
    })
    assert.equal(claimed.status, 200)
    const completed = await world.dispatcher.dispatch({
      method: 'POST',
      url: `${RIVAL_PREFIX}/plugin-refresh/complete`,
      body: { token, account: capture() },
    })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.data.new_posts, 2)
    assert.equal(completed.body.data.account.nickname, 'Alice New')
    assert.equal(world.cloud.calls, 0)
  })
})

describe('route table of the plugin-refresh endpoints', () => {
  it('matches the three paths without stealing the account route', () => {
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_abc/plugin-refresh-request`), {
      kind: 'plugin-refresh-request',
      id: 'riv_abc',
    })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/plugin-refresh/claim`), { kind: 'plugin-refresh-claim' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/plugin-refresh/complete`), { kind: 'plugin-refresh-complete' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_abc`), { kind: 'account', id: 'riv_abc' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_abc/refresh`), { kind: 'account-refresh', id: 'riv_abc' })
  })

  it('answers 405 for a non-POST claim and 404 for an unknown path', async () => {
    const world = makeWorld()
    const got = await world.dispatcher.dispatch({ method: 'GET', url: `${RIVAL_PREFIX}/plugin-refresh/claim` })
    assert.equal(got.status, 405)
    const unknown = await world.dispatcher.dispatch({ method: 'POST', url: `${RIVAL_PREFIX}/plugin-refresh/nope` })
    assert.equal(unknown.status, 404)
  })
})

/**
 * #3839：小红书走同一条浏览器通道。
 *
 * 云端没有小红书的采集器（`CLOUD_RIVAL_PLATFORMS` 不含它），所以浏览器采集是
 * 它唯一的刷新通道。这一组用例把「通道可用」「笔记能显示」「不排云端定时」三件事
 * 一起钉住：任何一条退化，用户看到的都是「账号在、笔记永远空」。
 */
describe('#3839 xiaohongshu through the browser-refresh channel', () => {
  const XHS_UID = '5e4896d200000000010062cc'
  const XHS_URL = `https://www.xiaohongshu.com/user/profile/${XHS_UID}`
  /** 一条图文笔记 + 一条视频笔记，形状同扩展的 `captureAccount()` 输出。 */
  const XHS_CAPTURE_POSTS = [
    {
      platform_post_id: '66aa11bb22cc33dd44ee55ff',
      source_url: `https://www.xiaohongshu.com/explore/66aa11bb22cc33dd44ee55ff?xsec_token=abc`,
      title: '第一条笔记',
      content: '第一条笔记正文',
      posted_at: '2026-10-20T04:00:00.000Z',
      stats: { likes: 321, collects: 99, comments: 22 },
      media: [{ type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/a.jpg' }],
    },
    {
      platform_post_id: '66aa11bb22cc33dd44ee5600',
      source_url: `https://www.xiaohongshu.com/explore/66aa11bb22cc33dd44ee5600?xsec_token=def`,
      title: '第二条笔记',
      content: '',
      posted_at: '2026-10-19T04:00:00.000Z',
      stats: { likes: 12 },
      media: [
        { type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/b.jpg' },
        { type: 'video', url: 'https://sns-video-qc.xhscdn.com/b.mp4' },
      ],
    },
  ]

  function seedXhsAccount(world, overrides) {
    return seedAccount(world, Object.assign({
      platform: 'xiaohongshu',
      external_id: XHS_UID,
      external_id_kind: 'uid',
      handle: XHS_UID,
      profile_url: XHS_URL,
      nickname: '',
      avatar_url: '',
      bio: '',
      followers: null,
      posts_count: null,
      refresh_state: 'error',
      error_code: 'platform-unsupported',
      error_message: '该平台暂不支持自动刷新（云端采集未接入）',
      next_auto_refresh_at: null,
      consecutive_failures: 1,
    }, overrides))
  }

  function xhsCapture(overrides) {
    return Object.assign({
      platform: 'xiaohongshu',
      handle: XHS_UID,
      nickname: 'Miss圆滚滚',
      avatar_url: 'https://sns-avatar-qc.xhscdn.com/a.jpg',
      bio: '记录日常',
      followers: 12000,
      following: 30,
      posts_count: 88,
      posts: XHS_CAPTURE_POSTS.slice(),
      captured_at: NOW_ISO,
      extractor: 'xiaohongshu-profile',
    }, overrides)
  }

  it('mints a token for a 小红书 account and points it at the profile page', () => {
    const world = makeWorld()
    const account = seedXhsAccount(world)
    const result = requestToken(world, account.id)
    assert.equal(result.status, 201)
    assert.match(result.body.data.token, /^[0-9a-f]{32}$/)
    assert.equal(result.body.data.url, `${XHS_URL}#omnimux-refresh=${result.body.data.token}`)
    assert.equal(world.store.getAccount(account.id).plugin_refresh.token, result.body.data.token)
  })

  it('claims with the uid handle and merges the captured notes', () => {
    const world = makeWorld()
    const account = seedXhsAccount(world)
    const requested = requestToken(world, account.id)
    const token = requested.body.data.token
    const claimed = claimToken(world, { token, page_url: XHS_URL, handle: XHS_UID })
    assert.equal(claimed.status, 200)
    assert.equal(claimed.body.data.platform, 'xiaohongshu')

    const completed = completeToken(world, { token, account: xhsCapture() })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.data.new_posts, 2)
    assert.equal(completed.body.data.updated_posts, 0)

    const merged = world.store.getAccount(account.id)
    assert.equal(merged.nickname, 'Miss圆滚滚')
    assert.equal(merged.followers, 12000)
    assert.equal(merged.posts_count, 88)
    assert.equal(merged.refresh_state, 'idle')
    assert.equal(merged.error_code, null)
    assert.equal(merged.consecutive_failures, 0)

    const posts = world.store.readPosts(account.id)
    assert.equal(posts.length, 2)
    const first = posts.find((row) => row.id === '66aa11bb22cc33dd44ee55ff')
    assert.equal(first.title, '第一条笔记')
    assert.equal(first.text, '第一条笔记正文')
    assert.equal(first.type, 'image')
    assert.equal(first.cover_url, 'https://sns-webpic-qc.xhscdn.com/a.jpg')
    assert.equal(first.stats.likes, 321)
    assert.equal(first.stats.saves, 99)
    assert.equal(first.source, 'plugin')
    assert.equal(first.url, `https://www.xiaohongshu.com/explore/66aa11bb22cc33dd44ee55ff?xsec_token=abc`)
  })

  it('derives a video row from the captured media so the player has an address', () => {
    const world = makeWorld()
    const account = seedXhsAccount(world)
    const flow = runFlow(world, account.id, {
      pageUrl: XHS_URL,
      handle: XHS_UID,
      capture: xhsCapture(),
    })
    assert.equal(flow.completed.status, 200)
    const second = world.store.readPosts(account.id).find((row) => row.id === '66aa11bb22cc33dd44ee5600')
    assert.equal(second.type, 'video')
    assert.equal(second.cover_url, 'https://sns-webpic-qc.xhscdn.com/b.jpg')
    assert.equal(second.video_url, 'https://sns-video-qc.xhscdn.com/b.mp4')
    // 没有正文的图文笔记仍有标题与封面，不会被当成空行丢掉。
    assert.equal(second.title, '第二条笔记')
  })

  it('does not schedule a cloud cycle the platform can never serve', () => {
    const world = makeWorld()
    const account = seedXhsAccount(world)
    const flow = runFlow(world, account.id, {
      pageUrl: XHS_URL,
      handle: XHS_UID,
      capture: xhsCapture(),
    })
    assert.equal(flow.completed.status, 200)
    const merged = world.store.getAccount(account.id)
    // 24h 间隔在别的平台会排下一次；小红书没有云端通道，排了也只会再失败一次。
    // 因此这次回写把间隔归到「仅手动」(0)，`isRefreshDue` 从此不会再排它。
    assert.equal(merged.refresh_interval_hours, 0)
    assert.equal(merged.next_auto_refresh_at, null)
    assert.deepEqual(world.scheduler.tick().due, [])
  })

  it('still refuses a platform the content script cannot read', () => {
    const world = makeWorld()
    const account = seedAccount(world, {
      platform: 'instagram',
      external_id: '@alice',
      handle: '@alice',
      profile_url: 'https://www.instagram.com/@alice',
    })
    const result = requestToken(world, account.id)
    assert.equal(result.status, 400)
    assert.equal(result.body.code, 'platform-unsupported')
    // 文案由平台清单生成，不再写死「TikTok / X」。
    assert.match(result.body.error, /xiaohongshu/)
  })
})
