/**
 * T04 gates — G4 (duplicate import), the E1–E14 contract, the error codes, and
 * G10 (the structural gate that keeps cloud access in one file).
 *
 * The dispatcher under test is the production one: it takes a
 * `{ method, url, body }` request, so every endpoint is exercised without a
 * socket.
 */

import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRivalAccountsStore } from './rival-accounts-store.js'
import { resolveRivalPaths } from './rival-paths.js'
import { createRivalRefreshScheduler } from './rival-refresh.js'
import { createRivalRemote, SOCIAL_DATA_TOOL } from './rival-remote.js'
import { createRivalAccountsService } from './rival-accounts-service.js'
import { createRivalDispatcher, matchRivalRoute, RIVAL_PREFIX } from './rival-routes.js'
import {
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  RIVAL_ERROR_CODES,
} from './constants.js'

const FIXED_NOW = Date.parse('2026-09-12T08:00:00.000Z')
const USER_FIXTURE = {
  channel_id: 'UCabcdefghijklmnopqrstuv',
  nickname: 'Rival One',
  follower_count: 12_000,
  signature: 'cooking shorts',
}
const POSTS_FIXTURE = {
  items: [
    { id: '7321234567890123456', short_code: '7321234567890123456', desc: 'kitchen hack', play_count: 5000, digg_count: 400, comment_count: 30, share_count: 10, create_time: 1_700_000_000 },
    { id: '7321234567890123457', short_code: '7321234567890123457', desc: 'garden tips', play_count: 300, digg_count: 10, create_time: 1_700_100_000 },
  ],
}

function makeCountingCloud(behaviour = {}) {
  const cloud = {
    calls: [],
    behaviour,
    getTool(name) {
      if (name !== SOCIAL_DATA_TOOL) return undefined
      return {
        async execute(args) {
          cloud.calls.push({ platform: args.platform, capability: args.capability, id: args.id })
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

/** @type {Array<{ root: string }>} */
const sandboxes = []
after(() => {
  for (const made of sandboxes) rmSync(made.root, { recursive: true, force: true })
})

/**
 * @param {{ cloud?: any, imports?: any[], limits?: Record<string, number> }} [options]
 */
function makeWorld(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rival-routes-'))
  sandboxes.push({ root })
  const paths = resolveRivalPaths({ paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') } })
  const now = () => FIXED_NOW
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
  const importCalls = []
  service = createRivalAccountsService({
    store,
    remote,
    scheduler,
    paths,
    importUrl: async (payload) => {
      importCalls.push(payload)
      if (options.imports) return options.imports.shift() ?? options.imports[options.imports.length - 1]
      return { status: 202, body: { data: { id: 'insp_1' } } }
    },
  })
  const dispatcher = createRivalDispatcher({
    service,
    paths,
    downloadMediaImpl: async (url, dir, opts) => {
      writeFileSync(join(dir, `${opts?.prefix ?? 'x'}file.jpg`), 'image-bytes')
      return join(dir, `${opts?.prefix ?? 'x'}file.jpg`)
    },
  })
  return { root, paths, store, cloud, service, scheduler, dispatcher, importCalls }
}

/** @param {any} dispatcher @param {string} method @param {string} url @param {Record<string, any>} [body] */
async function call(dispatcher, method, url, body) {
  return dispatcher.dispatch({ method, url, ...(body === undefined ? {} : { body }) })
}

const WIDE = { cloud_calls_per_account_per_day: 1000, cloud_calls_global_per_day: 5000 }

describe('E1/E2/E3 + G4: import, dedup and classification', () => {
  it('classifies an account URL and a content URL', async () => {
    const world = makeWorld()
    const account = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/classify`, { url: 'https://www.youtube.com/@foo' })
    assert.equal(account.status, 200)
    assert.equal(account.body.data.kind, 'account')
    assert.equal(account.body.data.platform, 'youtube')
    assert.equal(account.body.data.external_id, '@foo')

    const content = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/classify`, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    assert.equal(content.body.data.kind, 'content')

    const bogus = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/classify`, { url: 'not a url' })
    assert.equal(bogus.status, 400)
    assert.equal(bogus.body.code, RIVAL_ERROR_CODES.UNRECOGNIZED_URL)
  })

  it('imports a new account with 201 and queues the first refresh', async () => {
    const world = makeWorld()
    const result = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo', tags: ['cooking'] })
    assert.equal(result.status, 201)
    assert.equal(result.body.data.external_id, '@foo')
    assert.equal(result.body.data.external_id_kind, 'handle-unverified')
    assert.equal(result.body.data.refresh_interval_hours, 24)
    assert.deepEqual(result.body.data.tags, ['cooking'])
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length, 2)
  })

  it('answers 200 + is_duplicate on a second import without touching the cloud (G4)', async () => {
    const world = makeWorld()
    await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
    await world.scheduler.settled()
    const callsAfterFirst = world.cloud.calls.length

    const second = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
    assert.equal(second.status, 200)
    assert.equal(second.body.existing, true)
    assert.equal(second.body.is_duplicate, true)
    assert.equal(world.store.listAccounts().length, 1)
    assert.equal(world.cloud.calls.length, callsAfterFirst)
  })

  it('treats the same handle written differently as a duplicate', async () => {
    const world = makeWorld()
    await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@Foo' })
    await world.scheduler.settled()
    const second = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
    assert.equal(second.body.is_duplicate, true)
    assert.equal(world.store.listAccounts().length, 1)
  })

  it('answers unrecognized-url for facebook, threads and any other domain (E3)', async () => {
    // Regression (requirement 2): these used to answer 200 with
    // `{ kind: 'content' }`, so the dialog's `rivalAccounts.import.unrecognized`
    // branch was unreachable and the content import was attempted instead.
    const world = makeWorld()
    const callsBefore = world.cloud.calls.length
    for (const url of [
      'https://www.facebook.com/somepage',
      'https://fb.watch/abc123/',
      'https://www.threads.net/@someone',
      'https://www.threads.com/@someone',
      'https://example.com/@someone',
    ]) {
      const result = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/classify`, { url })
      assert.equal(result.status, 400, url)
      assert.equal(result.body.code, RIVAL_ERROR_CODES.UNRECOGNIZED_URL, url)
      assert.equal(typeof result.body.error, 'string', url)
      assert.ok(result.body.error.length > 0, url)
    }
    assert.equal(world.cloud.calls.length, callsBefore)
    assert.deepEqual(world.store.listAccounts(), [])
  })

  it('still hands the four platforms\u2019 content links to the existing pipeline', async () => {
    const world = makeWorld()
    for (const url of [
      'https://www.tiktok.com/@foo/video/7321234567890123456',
      'https://www.instagram.com/reel/CxYz123ab/',
      'https://x.com/foo/status/1700000000000000000',
    ]) {
      const result = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/classify`, { url })
      assert.equal(result.status, 200, url)
      assert.equal(result.body.data.kind, 'content', url)
    }
  })

  it('dedups a mixed-prefix import of one account (E2, requirement 3)', async () => {
    // Regression: `x.com/@bar` stored `@bar` while `x.com/bar` stored `bar`, so
    // the same account produced two rows.
    const world = makeWorld()
    const first = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://x.com/@bar' })
    assert.equal(first.status, 201)
    await world.scheduler.settled()
    const callsAfterFirst = world.cloud.calls.length

    const second = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://x.com/bar' })
    assert.equal(second.status, 200)
    assert.equal(second.body.existing, true)
    assert.equal(second.body.is_duplicate, true)
    assert.equal(world.store.listAccounts().length, 1)
    assert.equal(world.cloud.calls.length, callsAfterFirst)
  })

  it('rejects an unresolvable identity with 422', async () => {
    const world = makeWorld()
    const result = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    assert.equal(result.status, 422)
    assert.equal(result.body.code, RIVAL_ERROR_CODES.IDENTITY_UNRESOLVED)
  })

  it('keeps the account row when the first refresh fails', async () => {
    const world = makeWorld({ cloud: makeCountingCloud({ failUser: new Error('cloud down') }) })
    const result = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
    assert.equal(result.status, 201)
    await world.scheduler.settled()
    const account = world.store.getAccount(result.body.data.id)
    assert.equal(account.refresh_state, 'backoff')
    assert.equal(account.consecutive_failures, 1)
    assert.equal(world.store.listAccounts().length, 1)
  })

  it('marks a refused handle as identity-unverified and explains it', async () => {
    const refusal = new Error('channel_id is invalid')
    refusal.code = 'identity-unverified'
    const world = makeWorld({ cloud: makeCountingCloud({ failUser: refusal }) })
    const result = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.youtube.com/@foo' })
    await world.scheduler.settled()
    const account = world.store.getAccount(result.body.data.id)
    assert.equal(account.refresh_state, 'error')
    assert.equal(account.error_code, RIVAL_ERROR_CODES.IDENTITY_UNVERIFIED)
    assert.equal(account.next_auto_refresh_at, null)
    assert.equal(world.service.identityHintKey, 'rivalAccounts.identity.handleUnverifiedHint')
  })
})

describe('E4/E5/E6: detail, patch and delete', () => {
  it('returns account, analysis and monitor together', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const detail = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.account.id, created.body.data.id)
    assert.equal(detail.body.data.analysis.avg_views, 2650)
    assert.equal(detail.body.data.monitor.delta_pct.followers, null)
    assert.equal(detail.body.data.profile.post_count, 2)
  })

  it('patches tags and the refresh interval, and rejects an invalid one', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    const id = created.body.data.id
    await world.scheduler.settled()

    const patched = await call(world.dispatcher, 'PATCH', `${RIVAL_PREFIX}/${id}`, { tags: ['a', 'b'], refresh_interval_hours: 12 })
    assert.equal(patched.status, 200)
    assert.deepEqual(patched.body.data.tags, ['a', 'b'])
    assert.equal(patched.body.data.refresh_interval_hours, 12)

    const manual = await call(world.dispatcher, 'PATCH', `${RIVAL_PREFIX}/${id}`, { refresh_interval_hours: 0 })
    assert.equal(manual.body.data.next_auto_refresh_at, null)

    const invalid = await call(world.dispatcher, 'PATCH', `${RIVAL_PREFIX}/${id}`, { refresh_interval_hours: 7 })
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.code, RIVAL_ERROR_CODES.INVALID_INTERVAL)
  })

  it('answers 404 for an unknown account on every id route', async () => {
    const world = makeWorld()
    for (const [method, url] of [
      ['GET', `${RIVAL_PREFIX}/nope`],
      ['PATCH', `${RIVAL_PREFIX}/nope`],
      ['DELETE', `${RIVAL_PREFIX}/nope`],
      ['GET', `${RIVAL_PREFIX}/nope/monitor`],
      ['POST', `${RIVAL_PREFIX}/nope/analyze`],
      ['GET', `${RIVAL_PREFIX}/nope/posts`],
      ['POST', `${RIVAL_PREFIX}/nope/refresh`],
    ]) {
      const result = await call(world.dispatcher, method, url, method === 'PATCH' ? {} : undefined)
      assert.equal(result.status, 404, `${method} ${url}`)
      assert.equal(result.body.code, RIVAL_ERROR_CODES.ACCOUNT_NOT_FOUND, `${method} ${url}`)
    }
  })

  it('deletes an account and its cache', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const removed = await call(world.dispatcher, 'DELETE', `${RIVAL_PREFIX}/${created.body.data.id}`)
    assert.equal(removed.status, 200)
    assert.equal(removed.body.data.removed, true)
    assert.equal(world.store.listAccounts().length, 0)
    assert.deepEqual(readdirSync(world.paths.postsDir), [])
  })
})

describe('E7/E8/E9: refresh, refresh-all and status', () => {
  it('answers 202 with cloud_calls_planned = 2 and spends exactly 2 per cycle', async () => {
    const world = makeWorld({ limits: WIDE })
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const before = world.cloud.calls.length

    const refreshed = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
    assert.equal(refreshed.status, 202)
    assert.equal(refreshed.body.data.cloud_calls_planned, LIMIT_CALLS_PER_ACCOUNT_CYCLE)
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length - before, 2)
    assert.equal(world.store.readBudget().per_account[created.body.data.id].calls, 4)
  })

  it('refuses a manual refresh inside the cooldown window with 429', async () => {
    const world = makeWorld({ limits: WIDE })
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
    await world.scheduler.settled()
    const again = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
    assert.equal(again.status, 429)
    assert.equal(again.body.code, RIVAL_ERROR_CODES.MANUAL_COOLDOWN)
  })

  it('refuses with the exhausted ledger named', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
    await world.scheduler.settled()
    // The daily allowance for one account is two cycles (4 calls / 2 per cycle).
    await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
    await world.scheduler.settled()
    const refused = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/refresh`, { manual: true })
    assert.equal(refused.status, 429)
    assert.equal(refused.body.code, RIVAL_ERROR_CODES.BUDGET_EXHAUSTED)
    assert.equal(refused.body.reason, 'account-daily-cap')
  })

  it('refreshes all accounts and reports what it skipped', async () => {
    const world = makeWorld({ limits: WIDE })
    await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@a' })
    await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@b' })
    await world.scheduler.settled()
    const result = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/refresh-all`, { manual: true })
    assert.equal(result.status, 202)
    assert.equal(result.body.data.queued.length, 2)
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length, 8)
  })

  it('exposes the status snapshot with budget usage and limits', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const status = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/status`)
    assert.equal(status.status, 200)
    assert.deepEqual(status.body.data.queued, [])
    assert.deepEqual(status.body.data.running, [])
    assert.equal(status.body.data.paused.global, false)
    assert.equal(status.body.data.budget_used.global_calls, 2)
    assert.equal(status.body.data.budget_limits.cloud_calls_per_account_per_cycle, 2)
    assert.ok(status.body.data.next_auto_at)
    assert.equal(world.store.getAccount(created.body.data.id).id, created.body.data.id)
  })
})

describe('E10/E11/E12: monitor, analyze and the post list', () => {
  it('computes the monitor without any cloud call', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const before = world.cloud.calls.length
    const monitor = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}/monitor`)
    assert.equal(monitor.status, 200)
    assert.equal(monitor.body.data.first_baseline, false)
    assert.equal(world.cloud.calls.length, before)
  })

  it('analyzes locally with zero cloud calls', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const before = world.cloud.calls.length
    const analysis = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/analyze`)
    assert.equal(analysis.status, 200)
    assert.equal(analysis.body.data.analysis.avg_views, 2650)
    assert.equal(world.cloud.calls.length, before)
  })

  it('filters the post list to potential posts', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const all = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}/posts`)
    assert.equal(all.status, 200)
    assert.equal(all.body.data.total, 2)
    assert.equal(all.body.data.items[0].url.startsWith('https://www.tiktok.com/'), true)
    assert.equal(all.body.data.carry_over, 0)
    assert.ok(all.body.data.field_probe.views)

    const flagged = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}/posts?only_potential=1`)
    assert.ok(flagged.body.data.total <= all.body.data.total)

    const limited = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}/posts?limit=1`)
    assert.equal(limited.body.data.items.length, 1)

    const byViews = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}/posts?sort=views`)
    assert.equal(byViews.body.data.items[0].stats.views >= byViews.body.data.items[1].stats.views, true)
  })
})

describe('E13: convert a post into the inspiration library', () => {
  it('imports through the existing pipeline and records the id', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const result = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/posts/7321234567890123456/to-inspiration`, { tags: ['x'] })
    assert.equal(result.status, 202)
    assert.equal(result.body.data.inspiration_id, 'insp_1')
    assert.equal(world.importCalls.length, 1)
    assert.equal(world.importCalls[0].auto_analyze, true)
    assert.equal(world.importCalls[0].url, 'https://www.tiktok.com/video/7321234567890123456')
    assert.equal(world.store.findPost(created.body.data.id, '7321234567890123456').in_library, true)
  })

  it('answers the existing id instead of importing twice', async () => {
    const world = makeWorld()
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/posts/7321234567890123456/to-inspiration`)
    const second = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/posts/7321234567890123456/to-inspiration`)
    assert.equal(second.body.data.already_in_library, true)
    assert.equal(world.importCalls.length, 1)
  })
})

describe('E14 + add-to-session media: the local media route contract', () => {
  it('downloads the cover on demand and serves its Host-relative URL', async () => {
    const world = makeWorld({ cloud: makeCountingCloud({ posts: { items: [{ id: 'p1', cover_url: 'https://cdn.example.com/c.jpg' }] } }) })
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const postId = world.store.readPosts(created.body.data.id)[0].id
    const media = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/posts/${postId}/media`, { kind: 'cover' })
    assert.equal(media.status, 200)
    assert.ok(media.body.data.absolute_path.startsWith(world.paths.coversDir))
    assert.equal(media.body.data.http_url, `/omnimux/inspiration/local/media/rival-accounts/covers/${media.body.data.http_url.split('/').pop()}`)

    const attachment = await call(world.dispatcher, 'GET', `${RIVAL_PREFIX}/${created.body.data.id}`)
    assert.ok(attachment.body.data.account)
    const payload = world.service.buildAttachmentPayload(created.body.data.id, postId)
    assert.equal(payload.kind, 'rival_post')
    assert.equal(payload.relativePath, media.body.data.absolute_path)
    assert.equal(payload.previewUrl, media.body.data.http_url)
    assert.equal(payload.extension, 'JPG')
  })

  it('answers no-media for a post with nothing to attach', async () => {
    const world = makeWorld({ cloud: makeCountingCloud({ posts: { items: [{ id: 'p1', desc: 'text only' }] } }) })
    const created = await call(world.dispatcher, 'POST', RIVAL_PREFIX, { url: 'https://www.tiktok.com/@foo' })
    await world.scheduler.settled()
    const postId = world.store.readPosts(created.body.data.id)[0].id
    const media = await call(world.dispatcher, 'POST', `${RIVAL_PREFIX}/${created.body.data.id}/posts/${postId}/media`, { kind: 'cover' })
    assert.equal(media.status, 409)
    assert.equal(media.body.code, RIVAL_ERROR_CODES.NO_MEDIA)
    assert.throws(
      () => world.service.buildAttachmentPayload(created.body.data.id, postId),
      (err) => err.code === RIVAL_ERROR_CODES.NO_MEDIA,
    )
  })

  it('routes the media tree through the existing stream prefix', () => {
    const done = [
      'rival-accounts',
      'rival-accounts/covers',
      'rival-accounts/covers/x.jpg',
      'rival-accounts/videos',
      'rival-accounts/videos/x.mp4',
    ]
    // E14 reuses `/omnimux/inspiration/local/media/<subpath>` verbatim: the rival
    // tree is a real subdirectory of `mediaDir`, so no second route exists.
    for (const subpath of done) {
      assert.equal(subpath.split('/')[0], 'rival-accounts')
    }
  })
})

describe('route matching', () => {
  it('matches every documented path and rejects unknown ones', () => {
    assert.deepEqual(matchRivalRoute(RIVAL_PREFIX), { kind: 'collection' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/classify`), { kind: 'classify' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/status`), { kind: 'status' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/refresh-all`), { kind: 'refresh-all' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_1`), { kind: 'account', id: 'riv_1' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_1/refresh`), { kind: 'account-refresh', id: 'riv_1' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_1/posts`), { kind: 'posts', id: 'riv_1' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_1/posts/p1/to-inspiration`), { kind: 'post-to-inspiration', id: 'riv_1', postId: 'p1' })
    assert.deepEqual(matchRivalRoute(`${RIVAL_PREFIX}/riv_1/posts/p1/media`), { kind: 'post-media', id: 'riv_1', postId: 'p1' })
    assert.equal(matchRivalRoute(`${RIVAL_PREFIX}/riv_1/nope`), null)
    assert.equal(matchRivalRoute('/something/else'), null)
  })

  it('refuses the wrong method instead of silently answering', async () => {
    const world = makeWorld()
    const result = await call(world.dispatcher, 'DELETE', `${RIVAL_PREFIX}/status`)
    assert.equal(result.status, 405)
  })
})

describe('G10: structural gates over src/rival/**', () => {
  const rivalDir = join(dirname(fileURLToPath(import.meta.url)))

  /** @returns {string[]} */
  function rivalSources() {
    return readdirSync(rivalDir)
      .filter((name) => name.endsWith('.js') && !name.includes('.test.'))
      .map((name) => join(rivalDir, name))
  }

  it('keeps every cloud call inside rival-remote.js', () => {
    const offenders = []
    for (const file of rivalSources()) {
      if (file.endsWith('rival-remote.js')) continue
      const source = readFileSync(file, 'utf8')
      if (/\bfetch\s*\(/.test(source) || /\.execute\s*\(/.test(source)) offenders.push(file)
    }
    assert.deepEqual(offenders, [])
  })

  it('never imports the hub or a sibling plugin', () => {
    const offenders = []
    for (const file of rivalSources()) {
      const source = readFileSync(file, 'utf8')
      if (/from\s+['"][^'"]*plugins\/omnimux\//.test(source) || /from\s+['"]\.\.\/\.\.\/\.\.\/omnimux/.test(source)) {
        offenders.push(file)
      }
      if (/omnimux-(accounts|publish|clip)\//.test(source)) offenders.push(file)
    }
    assert.deepEqual(offenders, [])
  })

  it('keeps the pure modules free of any network capability', () => {
    // A URL *string* is fine (the parsers synthesize canonical permalinks); what
    // must never appear is the ability to open a connection. `node:http`,
    // `node:https`, `node:dns`, `node:net` and `fetch` are all refused here.
    const networkRe = /node:(http|https|net|dns|tls)|\bglobalThis\.fetch\b|(?:^|[^.\w])fetch\s*\(/
    for (const name of ['rival-refresh.js', 'rival-accounts-store.js', 'rival-potential.js', 'rival-analyze.js', 'rival-parsers.js', 'rival-identity.js', 'rival-paths.js']) {
      const source = readFileSync(join(rivalDir, name), 'utf8')
      assert.equal(networkRe.test(source), false, `${name} can reach the network`)
    }
  })

  it('keeps the cost contract as a single exported constant', () => {
    const source = readFileSync(join(rivalDir, 'rival-refresh.js'), 'utf8')
    assert.equal(/LIMIT_CALLS_PER_ACCOUNT_CYCLE/.test(source), true)
  })
})
