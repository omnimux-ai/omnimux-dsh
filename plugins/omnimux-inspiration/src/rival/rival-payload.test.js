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

function makeWorld({ user = PROFILE, posts = { items: [] } } = {}) {
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
        return { data: args.capability === 'user' ? user : posts }
      },
    }),
    now,
  })
  let service
  const scheduler = createRivalRefreshScheduler({ store, remote, now, runCycle: (input) => service.runCycle(input) })
  service = createRivalAccountsService({ store, remote, scheduler, now })
  const account = store.addAccount({
    platform: 'youtube',
    external_id: '@example',
    external_id_kind: 'handle-unverified',
    nickname: 'Saved account',
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
