import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRivalAccountsStore } from './rival-accounts-store.js'
import { createRivalAccountsService } from './rival-accounts-service.js'
import { createRivalRemote } from './rival-remote.js'
import { createRivalRefreshScheduler } from './rival-refresh.js'
import { resolveRivalPaths } from './rival-paths.js'

const NOW = Date.parse('2026-10-18T02:00:00.000Z')
const PREVIOUS_SUCCESS = '2026-10-17T02:00:00.000Z'
const PROFILE = { nickname: 'Example', follower_count: 0 }
const sandboxes = []

afterEach(() => {
  for (const root of sandboxes.splice(0)) rmSync(root, { recursive: true, force: true })
})

function makeWorld({ user = PROFILE, posts = { items: [] }, platform = 'youtube' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rival-payload-'))
  sandboxes.push(root)
  const paths = resolveRivalPaths({ paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'media') } })
  const now = () => NOW
  const store = createRivalAccountsStore({ paths, now })
  const calls = []
  const remote = createRivalRemote({
    getTool: () => ({
      execute: async (args) => {
        calls.push(args.capability)
        return { platform: args.platform, capability: args.capability, model: `${args.platform}-${args.capability}`, data: args.capability === 'user' ? user : posts }
      },
    }),
    now,
  })
  let service
  const scheduler = createRivalRefreshScheduler({ store, remote, now, runCycle: (input) => service.runCycle(input) })
  service = createRivalAccountsService({ store, remote, scheduler, now })
  const account = store.addAccount({
    platform,
    external_id: '@example',
    external_id_kind: 'handle-unverified',
    nickname: 'Saved account',
    bio: 'Saved biography',
    avatar_url: 'https://example.com/saved-avatar.jpg',
    followers: 120,
    last_success_at: PREVIOUS_SUCCESS,
    last_refresh_at: PREVIOUS_SUCCESS,
    refresh_count: 3,
    consecutive_failures: 1,
  })
  store.writePosts(account.id, [{ id: 'saved-post', title: 'Saved post' }], { fieldProbe: { nickname: 'name' } })
  return { store, service, scheduler, account, calls }
}

async function refresh(world) {
  assert.equal(world.scheduler.enqueue({ account_id: world.account.id, mode: 'first' }).queued, true)
  await world.scheduler.settled()
  return world.store.getAccount(world.account.id)
}

describe('refresh payload validation preserves the last successful data', () => {
  const invalid = [
    ['unknown account fields', { user: { opaque: 'value' } }, 1],
    ['an invalid account avatar', { user: { avatar_url: 'file:///private/avatar.png' } }, 1],
    ['an invalid canonical account id', { user: { channel_id: '@example' } }, 1],
    ['a negative account counter', { user: { follower_count: -1 } }, 1],
    ['unknown post containers', { posts: { mystery: [{ id: 'new-post' }] } }, 2],
    ['an empty unrecognized object', { posts: {} }, 2],
    ['an unwrapped empty array', { posts: [] }, 2],
    ['an invalid list container', { posts: { items: null } }, 2],
    ['nonempty posts without identity', { posts: { items: [{ title: 'No id' }, {}] } }, 2],
    ['nonempty posts with no objects', { posts: { items: [null, false, 'post'] } }, 2],
    ['a rejected account response', { user: { code: 500, nickname: 'Untrusted account' } }, 1],
    ['an upstream error object', { user: { error: { message: 'sensitive-upstream-detail' }, nickname: 'Untrusted account' } }, 1],
    ['a rejected posts response with rows', { posts: { success: false, items: [{ id: 'untrusted-post' }] } }, 2],
    ['a rejected nested response', { posts: { data: { status: 'failed', items: [] } } }, 2],
  ]

  for (const [name, payload, calls] of invalid) {
    it(`rejects ${name} without replacing cached posts or success state`, async () => {
      const world = makeWorld(payload)
      const cached = world.store.readPostsFile(world.account.id)
      const row = await refresh(world)
      assert.equal(row.refresh_state, 'backoff')
      assert.equal(row.error_code, 'cloud-error')
      assert.equal(row.error_message.includes('sensitive-upstream-detail'), false)
      assert.equal(row.consecutive_failures, 2)
      assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
      assert.equal(row.last_refresh_at, new Date(NOW).toISOString())
      assert.equal(row.refresh_count, 3)
      assert.equal(row.nickname, 'Saved account')
      assert.equal(row.external_id_kind, 'handle-unverified')
      assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
      assert.equal(world.calls.length, calls)
    })
  }

  for (const capability of ['user', 'posts']) {
    it(`keeps the no-content error for the ${capability} sentinel`, async () => {
      const world = makeWorld({ [capability]: { text: null } })
      const row = await refresh(world)
      assert.equal(row.error_code, 'no-content')
      assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
      assert.equal(world.store.readPosts(world.account.id)[0].id, 'saved-post')
    })
  }
})

describe('TikTok userInfo profile is consumed through the real refresh cycle', () => {
  // This is P after the hub's existing one-layer { code: 200, data: P }
  // unwrap. The seam returns { platform, capability, model, data: P }.
  const fixture = {
    userInfo: {
      user: { nickname: 'Fixture Creator', signature: 'Fixture biography', avatarLarger: 'https://example.com/avatar.jpg' },
      stats: { followerCount: 0, videoCount: 2 },
    },
  }

  it('persists all five leaves and posts before recording a new successful refresh', async () => {
    const world = makeWorld({ platform: 'tiktok', user: fixture, posts: { items: [{ id: 'new-post', play_count: 12 }] } })
    const writePosts = world.store.writePosts
    world.store.writePosts = (...args) => {
      assert.equal(world.store.getAccount(world.account.id).last_success_at, PREVIOUS_SUCCESS)
      assert.equal(world.store.getAccount(world.account.id).refresh_count, 3)
      return writePosts(...args)
    }
    const row = await refresh(world)
    assert.equal(row.refresh_state, 'idle')
    assert.equal(row.error_code, null)
    assert.equal(row.consecutive_failures, 0)
    assert.equal(row.nickname, 'Fixture Creator')
    assert.equal(row.bio, 'Fixture biography')
    assert.equal(row.avatar_url, 'https://example.com/avatar.jpg')
    assert.equal(row.followers, 0)
    assert.equal(row.posts_count, 2)
    assert.equal(row.metrics.latest.followers, 0)
    assert.equal(row.metrics.latest.posts_count, 2)
    assert.equal(row.refresh_count, 4)
    assert.equal(row.last_success_at, new Date(NOW).toISOString())
    assert.equal(row.last_refresh_at, new Date(NOW).toISOString())
    const saved = world.store.readPostsFile(world.account.id)
    assert.equal(saved.items.some((post) => post.id === 'new-post' && post.last_seen_at === new Date(NOW).toISOString()), true)
    assert.equal(saved.field_probe.avatar_url, 'userInfo.user.avatarLarger')
    assert.equal(saved.field_probe.followers, 'userInfo.stats.followerCount')
    assert.deepEqual(world.calls, ['user', 'posts'])
  })

  for (const avatarLarger of [undefined, 'file:///private/avatar.jpg', 'https://']) {
    it(`keeps the cached avatar for a recognized partial profile with ${String(avatarLarger)}`, async () => {
      const world = makeWorld({ platform: 'tiktok', user: { userInfo: { user: { nickname: 'Fixture Creator', avatarLarger }, stats: {} } } })
      const row = await refresh(world)
      assert.equal(row.refresh_state, 'idle')
      assert.equal(row.nickname, 'Fixture Creator')
      assert.equal(row.avatar_url, 'https://example.com/saved-avatar.jpg')
      assert.equal(row.followers, 120)
      assert.deepEqual(world.calls, ['user', 'posts'])
    })
  }

  const failures = [
    ['missing stats', { userInfo: { user: { nickname: 'Untrusted account' } } }],
    ['missing user', { userInfo: { stats: { followerCount: 0 } } }],
    ['wrong stats type', { userInfo: { user: { nickname: 'Untrusted account' }, stats: [] } }],
    ['all unusable leaves', { userInfo: { user: { nickname: ' ', avatarLarger: 'file:///private/avatar.jpg' }, stats: { followerCount: -1, videoCount: '2' } } }],
    ['failed wrapper', { nickname: 'Fallback account', userInfo: { ...fixture.userInfo, success: false } }],
    ['failed nested user', { nickname: 'Fallback account', userInfo: { ...fixture.userInfo, user: { ...fixture.userInfo.user, error: { message: 'sensitive-upstream-detail' } } } }],
    ['failed nested stats', { nickname: 'Fallback account', userInfo: { ...fixture.userInfo, stats: { ...fixture.userInfo.stats, code: 500 } } }],
    ['failed original user', { ...fixture, user: { code: 500 } }],
  ]
  for (const [name, user] of failures) {
    it(`rejects ${name} before requesting posts or changing successful data`, async () => {
      const world = makeWorld({ platform: 'tiktok', user })
      const cached = world.store.readPostsFile(world.account.id)
      const row = await refresh(world)
      assert.equal(row.refresh_state, 'backoff')
      assert.equal(row.error_code, 'cloud-error')
      assert.equal(row.error_message.includes('sensitive-upstream-detail'), false)
      assert.equal(row.refresh_count, 3)
      assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
      assert.equal(row.nickname, 'Saved account')
      assert.equal(row.bio, 'Saved biography')
      assert.equal(row.avatar_url, 'https://example.com/saved-avatar.jpg')
      assert.equal(row.followers, 120)
      assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
      assert.deepEqual(world.calls, ['user'])
    })
  }

  const statuses = [{ code: 500 }, { status: 'failed' }, { status_code: -1 }, { success: false }, { ok: false }, { error: 'sensitive-upstream-detail' }]
  for (const container of ['wrapper', 'user', 'stats']) {
    for (const status of statuses) {
      it(`refuses ${container} business failure ${Object.keys(status)[0]} before accepting a flat fallback`, async () => {
        const userInfo = structuredClone(fixture.userInfo)
        Object.assign(container === 'wrapper' ? userInfo : userInfo[container], status)
        const world = makeWorld({ platform: 'tiktok', user: { nickname: 'Flat fallback', userInfo } })
        const cached = world.store.readPostsFile(world.account.id)
        const row = await refresh(world)
        assert.equal(row.refresh_state, 'backoff')
        assert.equal(row.error_code, 'cloud-error')
        assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
        assert.equal(row.refresh_count, 3)
        assert.equal(row.nickname, 'Saved account')
        assert.equal(row.error_message.includes('sensitive-upstream-detail'), false)
        assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
        assert.deepEqual(world.calls, ['user'])
      })
    }
  }

  const rejectedCodes = [{ code: 1 }, { status: 302 }, { status_code: ' 1 ' }, { status: '3.02e2' }, { status: false }]
  for (const container of ['wrapper', 'user', 'stats']) {
    for (const status of rejectedCodes) {
      it(`refuses non-success business code ${JSON.stringify(status)} in ${container} before fallback`, async () => {
        const userInfo = structuredClone(fixture.userInfo)
        Object.assign(container === 'wrapper' ? userInfo : userInfo[container], status)
        const world = makeWorld({ platform: 'tiktok', user: { nickname: 'Flat fallback', userInfo } })
        const cached = world.store.readPostsFile(world.account.id)
        const row = await refresh(world)
        assert.equal(row.refresh_state, 'backoff')
        assert.equal(row.error_code, 'cloud-error')
        assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
        assert.equal(row.refresh_count, 3)
        assert.equal(row.nickname, 'Saved account')
        assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
        assert.deepEqual(world.calls, ['user'])
      })
    }
  }

  const acceptedCodes = [
    { code: 0, status: 200, status_code: 299.5 },
    { code: ' 0 ', status: '2e2', status_code: ' 2.99e2 ' },
    { code: '', status: null, status_code: null },
    { code: false, status_code: false },
    { code: '1,0', status: '0x1', status_code: '0b1' },
  ]
  for (const container of ['wrapper', 'user', 'stats']) {
    for (const status of acceptedCodes) {
      it(`keeps success or absent business code ${JSON.stringify(status)} in ${container}`, async () => {
        const userInfo = structuredClone(fixture.userInfo)
        Object.assign(container === 'wrapper' ? userInfo : userInfo[container], status)
        const world = makeWorld({ platform: 'tiktok', user: { userInfo } })
        const row = await refresh(world)
        assert.equal(row.refresh_state, 'idle')
        assert.equal(row.nickname, 'Fixture Creator')
        assert.equal(row.followers, 0)
        assert.equal(row.refresh_count, 4)
        assert.deepEqual(world.calls, ['user', 'posts'])
      })
    }
  }

  it('keeps old root business-code behavior instead of applying the new container rule globally', async () => {
    const world = makeWorld({ platform: 'tiktok', user: { code: 1, nickname: 'Old flat profile' } })
    assert.equal((await refresh(world)).refresh_state, 'idle')
    assert.deepEqual(world.calls, ['user', 'posts'])
  })

  it('does not record success when persisting the new profile posts fails', async () => {
    const world = makeWorld({ platform: 'tiktok', user: fixture, posts: { items: [{ id: 'new-post' }] } })
    const cached = world.store.readPostsFile(world.account.id)
    world.store.writePosts = () => { throw new Error('fixture disk failure') }
    const row = await refresh(world)
    assert.equal(row.refresh_state, 'backoff')
    assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
    assert.equal(row.refresh_count, 3)
    assert.equal(row.nickname, 'Saved account')
    assert.equal(row.avatar_url, 'https://example.com/saved-avatar.jpg')
    assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
    assert.deepEqual(world.calls, ['user', 'posts'])
  })

  it('preserves successful data when posts fail after the new profile was parsed', async () => {
    const world = makeWorld({ platform: 'tiktok', user: fixture, posts: { success: false, items: [{ id: 'untrusted-post' }] } })
    const cached = world.store.readPostsFile(world.account.id)
    const row = await refresh(world)
    assert.equal(row.refresh_state, 'backoff')
    assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
    assert.equal(row.refresh_count, 3)
    assert.equal(row.nickname, 'Saved account')
    assert.equal(row.avatar_url, 'https://example.com/saved-avatar.jpg')
    assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
    assert.deepEqual(world.calls, ['user', 'posts'])
  })

  it('does not introduce TikTok wrapper failure scanning on other platforms', async () => {
    const world = makeWorld({ platform: 'x', user: { nickname: 'Old profile', userInfo: { success: false } } })
    assert.equal((await refresh(world)).refresh_state, 'idle')
    assert.deepEqual(world.calls, ['user', 'posts'])
  })
})

describe('X direct timeline is validated before a successful refresh is recorded', () => {
  // The same synthetic parent/node identities as the cloud validator, with
  // already-supported metadata solely to verify local persistence and feed.
  const timeline = [
    { id: 'fixture-parent', title: 'Fixture parent', text: 'Fixture parent body', created_at: '2026-10-18T01:00:00Z', node: { id: 'fixture-child' } },
    { node: { tweet_id: 'fixture-node', text: 'Fixture node body', created_at: '2026-10-18T00:00:00Z' } },
    null,
    {},
  ]

  it('persists the two normalized posts and profile before advancing successful state', async () => {
    const world = makeWorld({ platform: 'x', user: { nickname: 'Fixture account', follower_count: 0 }, posts: { timeline } })
    const writePosts = world.store.writePosts
    world.store.writePosts = (...args) => {
      const before = world.store.getAccount(world.account.id)
      assert.equal(before.last_success_at, PREVIOUS_SUCCESS)
      assert.equal(before.refresh_count, 3)
      assert.equal(before.nickname, 'Saved account')
      return writePosts(...args)
    }
    const row = await refresh(world)
    assert.equal(row.refresh_state, 'idle')
    assert.equal(row.error_code, null)
    assert.equal(row.consecutive_failures, 0)
    assert.equal(row.nickname, 'Fixture account')
    assert.equal(row.followers, 0)
    assert.equal(row.refresh_count, 4)
    assert.equal(row.last_success_at, new Date(NOW).toISOString())
    assert.equal(row.last_refresh_at, new Date(NOW).toISOString())
    const saved = world.store.readPostsFile(world.account.id)
    const parent = saved.items.find((post) => post.id === 'fixture-parent')
    const node = saved.items.find((post) => post.id === 'fixture-node')
    assert.equal(saved.items.length, 3)
    assert.equal(saved.items.some((post) => post.id === 'fixture-child'), false)
    assert.equal(parent.title, 'Fixture parent')
    assert.equal(parent.text, 'Fixture parent body')
    assert.equal(parent.posted_at, '2026-10-18T01:00:00.000Z')
    assert.equal(node.title, 'Fixture node body')
    assert.equal(node.posted_at, '2026-10-18T00:00:00.000Z')
    assert.equal(parent.last_seen_at, new Date(NOW).toISOString())
    assert.equal(node.last_seen_at, new Date(NOW).toISOString())
    const feed = world.service.listFeed({ accounts: [world.account.id] })
    assert.equal(feed.total, 3)
    for (const id of ['fixture-parent', 'fixture-node']) {
      const post = feed.items.find((item) => item.id === id)
      const persisted = saved.items.find((item) => item.id === id)
      assert.equal(post.account_id, world.account.id)
      assert.equal(post.title, persisted.title)
      assert.equal(post.text, persisted.text)
      assert.equal(post.posted_at, persisted.posted_at)
    }
    assert.deepEqual(world.calls, ['user', 'posts'])
  })

  for (const posts of [{ timeline: [] }, { items: [], timeline }]) {
    it(`keeps the recognized empty list successful for ${JSON.stringify(posts)}`, async () => {
      const world = makeWorld({ platform: 'x', posts })
      const row = await refresh(world)
      assert.equal(row.refresh_state, 'idle')
      assert.equal(row.refresh_count, 4)
      assert.equal(row.last_success_at, new Date(NOW).toISOString())
      assert.deepEqual(world.store.readPosts(world.account.id).map((post) => post.id), ['saved-post'])
      assert.deepEqual(world.calls, ['user', 'posts'])
    })
  }

  const invalid = [
    ['nonempty unusable rows', { timeline: [{}, null, false, 'text'] }],
    ['metadata without an existing identity', { timeline: [{ title: 'Not identity' }] }],
    ['an unusable older list despite a valid timeline', { items: [{}], timeline }],
    ['an unobserved timeline_v2 array', { timeline_v2: timeline }],
    ['an object timeline', { timeline: { items: [{ id: 'not-a-direct-array' }] } }],
    ['a nested data timeline', { data: { timeline } }],
    ['a nested user timeline', { user: { timeline } }],
    ['a bare array', timeline],
    ['an unknown legacy identity', { timeline: [{ legacy: { id: 'not-a-new-alias' } }] }],
    ['a deeper node identity', { timeline: [{ node: { node: { id: 'not-a-new-path' } } }] }],
    ['a failed envelope with usable rows', { success: false, timeline }],
    ['an envelope error with usable rows', { error: 'sensitive-upstream-detail', timeline }],
    ['a nested envelope failure with usable rows', { timeline, result: { status: 'failed' } }],
  ]
  for (const [name, posts] of invalid) {
    it(`rejects ${name} without overwriting cached or successful state`, async () => {
      const world = makeWorld({ platform: 'x', user: { nickname: 'Untrusted new profile' }, posts })
      const cached = world.store.readPostsFile(world.account.id)
      const feed = world.service.listFeed({ accounts: [world.account.id] })
      const row = await refresh(world)
      assert.equal(row.refresh_state, 'backoff')
      assert.equal(row.error_code, 'cloud-error')
      assert.equal(row.error_message.includes('sensitive-upstream-detail'), false)
      assert.equal(row.consecutive_failures, 2)
      assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
      assert.equal(row.refresh_count, 3)
      assert.equal(row.nickname, 'Saved account')
      assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
      assert.deepEqual(world.service.listFeed({ accounts: [world.account.id] }), feed)
      assert.deepEqual(world.calls, ['user', 'posts'])
    })
  }

  it('does not advance successful state when writing valid timeline rows fails', async () => {
    const world = makeWorld({ platform: 'x', posts: { timeline } })
    const cached = world.store.readPostsFile(world.account.id)
    let writeAttempted = false
    world.store.writePosts = () => {
      writeAttempted = true
      throw new Error('fixture disk failure')
    }
    const row = await refresh(world)
    assert.equal(writeAttempted, true)
    assert.equal(row.refresh_state, 'backoff')
    assert.equal(row.last_success_at, PREVIOUS_SUCCESS)
    assert.equal(row.refresh_count, 3)
    assert.equal(row.nickname, 'Saved account')
    assert.deepEqual(world.store.readPostsFile(world.account.id), cached)
    assert.deepEqual(world.calls, ['user', 'posts'])
  })
})

describe('recognized empty accounts and known post shapes remain successful', () => {
  const emptyLists = [
    { items: [] },
    { aweme_list: [] },
    { data: { items: [] } },
    { result: { aweme_list: [] } },
    { edges: [] },
    { data: { edges: [] } },
  ]

  for (const posts of emptyLists) {
    it(`accepts a recognized profile with ${JSON.stringify(posts)}`, async () => {
      const world = makeWorld({ posts })
      const row = await refresh(world)
      assert.equal(row.refresh_state, 'idle')
      assert.equal(row.consecutive_failures, 0)
      assert.equal(row.error_code, null)
      assert.equal(row.last_success_at, new Date(NOW).toISOString())
      assert.equal(row.refresh_count, 4)
      assert.equal(row.followers, 0)
      assert.equal(row.external_id_kind, 'handle-verified')
      assert.equal(world.calls.length, 2)
    })
  }

  it('accepts a known zero follower count as recognizable account data', async () => {
    const world = makeWorld({ user: { follower_count: 0 } })
    assert.equal((await refresh(world)).refresh_state, 'idle')
  })

  const knownLists = [
    { items: [{ id: 'new-post' }] },
    { aweme_list: [{ aweme_id: 'new-post' }] },
    { data: { items: [{ id: 'new-post' }] } },
    { result: { videos: [{ id: 'new-post' }] } },
    { video: { id: 'new-post' } },
    { items: [{ title: 'No id' }, { id: 'new-post' }] },
    { items: [{ id: 'new-post', node: { id: 'unrelated-node' } }] },
    { edges: [{ node: { id: 'new-post' } }] },
    { data: { edges: [{ node: { id: 'new-post' } }] } },
    { items: [], data: { items: [{ id: 'new-post' }] } },
  ]

  for (const posts of knownLists) {
    it(`keeps known shape ${JSON.stringify(posts)} usable`, async () => {
      const world = makeWorld({ posts })
      assert.equal((await refresh(world)).refresh_state, 'idle')
      assert.equal(world.store.readPosts(world.account.id).some((row) => row.id === 'new-post'), true)
      assert.equal(world.calls.length, 2)
    })
  }
})
