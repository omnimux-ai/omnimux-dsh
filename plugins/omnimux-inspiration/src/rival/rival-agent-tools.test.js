/**
 * T04 / G5 gates for the six Agent tools.
 *
 * Two layers are asserted here: the tool contract itself (name, description,
 * parameters, output shape) and the error semantics the Agent has to be able to
 * relay. "No work done" is not an error — a refresh the budget refuses answers
 * an empty queue with a reason key, because an Agent must be able to tell that
 * apart from a failure.
 */

import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRivalAccountsStore } from './rival-accounts-store.js'
import { resolveRivalPaths } from './rival-paths.js'
import { createRivalRefreshScheduler } from './rival-refresh.js'
import { createRivalRemote, SOCIAL_DATA_TOOL, TOOL_MISSING_MESSAGE } from './rival-remote.js'
import { createRivalAccountsService } from './rival-accounts-service.js'
import {
  LOGIN_REQUIRED_MESSAGE,
  QUOTA_EXHAUSTED_MESSAGE,
  RIVAL_TOOL_NAMES,
  registerRivalTools,
  toToolError,
} from './rival-agent-tools.js'
import { INSPIRATION_TOOL_NAMES } from '../index.js'
import { RIVAL_ERROR_CODES } from './constants.js'

const FIXED_NOW = Date.parse('2026-09-12T08:00:00.000Z')
const USER_FIXTURE = { channel_id: 'UCabcdefghijklmnopqrstuv', nickname: 'Rival One', follower_count: 12_000 }
const POSTS_FIXTURE = {
  items: [
    { id: '7321234567890123456', short_code: '7321234567890123456', desc: 'kitchen hack', play_count: 5000, digg_count: 400, comment_count: 30, share_count: 10, cover_url: 'https://cdn.example.com/c.jpg', create_time: 1_700_000_000 },
    { id: '7321234567890123457', short_code: '7321234567890123457', desc: 'garden tips', play_count: 100, digg_count: 5, create_time: 1_700_100_000 },
  ],
}

/**
 * @param {{ failUser?: Error, failPosts?: Error, tool?: any }} [behaviour]
 */
function makeCloud(behaviour = {}) {
  const cloud = {
    calls: [],
    // `behaviour` stays live: a test can install a failure between two refreshes
    // and the remote, which captured `getTool` once, will see it.
    behaviour,
    getTool(name) {
      if (name !== SOCIAL_DATA_TOOL) return undefined
      // `forceMissing` is the "seam went away" case; it wins over the stub below.
      if (behaviour.forceMissing) return undefined
      if (behaviour.tool !== undefined) return behaviour.tool
      return {
        async execute(args) {
          // Recorded so a test can assert the cost contract from the outside.
          cloud.calls.push({ platform: args.platform, capability: args.capability, id: args.id })
          if (args.capability === 'user') {
            if (behaviour.failUser) throw behaviour.failUser
            return { platform: args.platform, capability: 'user', field: 'channel_id', value: args.id, data: USER_FIXTURE }
          }
          if (behaviour.failPosts) throw behaviour.failPosts
          return { platform: args.platform, capability: 'posts', field: 'channel_id', value: args.id, data: POSTS_FIXTURE }
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
 * @param {{ cloud?: any, limits?: Record<string, number>, imports?: any[] }} [options]
 */
function makeTools(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rival-tools-'))
  sandboxes.push({ root })
  const paths = resolveRivalPaths({ paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') } })
  const now = () => FIXED_NOW
  const store = createRivalAccountsStore({ paths, now, ...(options.limits ? { limits: options.limits } : {}) })
  const cloud = options.cloud ?? makeCloud()
  const remote = createRivalRemote({ getTool: cloud.getTool, now })
  let service = null
  const scheduler = createRivalRefreshScheduler({ store, remote, now, runCycle: (input) => service.runCycle(input) })
  service = createRivalAccountsService({
    store,
    remote,
    scheduler,
    paths,
    importUrl: async () => ({ status: 202, body: { data: { id: 'insp_9' } } }),
  })
  const registered = new Map()
  registerRivalTools({ register: (tool) => registered.set(tool.name, tool) }, service)
  return { root, paths, store, cloud, service, scheduler, registered }
}

/** @param {Map<string, any>} registered @param {string} name */
function toolArgs(registered, name) {
  return registered.get(name).parameters
}

/**
 * Add an account and run its first refresh to completion.
 *
 * The first refresh is enqueued explicitly: `addAccount` only writes a row, and
 * the automatic tick is the scheduler's own concern. Waiting here also means a
 * later manual refresh in the same test is not blocked by the account still
 * being `queued`.
 * @param {ReturnType<typeof makeTools>} world
 * @param {Record<string, any>} record
 */
async function seedAccount(world, record) {
  const account = world.store.addAccount(record)
  world.scheduler.enqueue({ account_id: account.id, mode: 'first' })
  await waitForIdle(world, account.id)
  return world.store.getAccount(account.id)
}

/**
 * Wait until an account has left the transient `queued`/`running` states.
 *
 * `scheduler.settled()` is the production contract — an HTTP caller must not be
 * held while unrelated work drains — but it can resolve around a job boundary,
 * which is too loose for an assertion that inspects the account and its call
 * count. Polling the observable state keeps the tests free of that race.
 * @param {ReturnType<typeof makeTools>} world
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

const WIDE = { cloud_calls_per_account_per_day: 1000, cloud_calls_global_per_day: 5000 }

describe('G5: tool contract', () => {
  it('registers exactly the six declared tools', () => {
    const world = makeTools()
    assert.deepEqual([...world.registered.keys()], [...RIVAL_TOOL_NAMES])
  })

  it('keeps the plugin tool list and the manifest in sync', async () => {
    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(new URL('../../dsh.manifest.json', import.meta.url), 'utf8'))
    const manifestNames = manifest.capabilities.tools.map((tool) => tool.name)
    for (const name of RIVAL_TOOL_NAMES) {
      assert.equal(INSPIRATION_TOOL_NAMES.includes(name), true, `${name} missing from INSPIRATION_TOOL_NAMES`)
      assert.equal(manifestNames.includes(name), true, `${name} missing from dsh.manifest.json`)
    }
  })

  it('gives every tool a description, an object schema and an output contract', () => {
    const world = makeTools()
    for (const [name, tool] of world.registered.entries()) {
      assert.equal(typeof tool.description, 'string', name)
      assert.ok(tool.description.length >= 8, name)
      assert.equal(tool.parameters.type, 'object', name)
      assert.equal(tool.parameters.additionalProperties, false, name)
      assert.equal(typeof tool.output?.render, 'function', name)
      assert.ok(tool.output.schema, name)
      assert.equal(typeof tool.execute, 'function', name)
    }
  })

  it('declares account_id and post_id as required where the design does', () => {
    const world = makeTools()
    assert.deepEqual(toolArgs(world.registered, 'inspiration_rival_post').required, ['account_id', 'post_id'])
    assert.deepEqual(toolArgs(world.registered, 'inspiration_rival_posts_add_to_session').required, ['account_id', 'post_id'])
    assert.deepEqual(toolArgs(world.registered, 'inspiration_rival_to_inspiration').required, ['account_id', 'post_id'])
    assert.equal(toolArgs(world.registered, 'inspiration_rival_accounts').required, undefined)
    assert.equal(toolArgs(world.registered, 'inspiration_rival_posts').required, undefined)
    assert.equal(toolArgs(world.registered, 'inspiration_rival_refresh').required, undefined)
  })
})

describe('G5: tool behaviour', () => {
  it('lists accounts with the summary fields the design names', async () => {
    const world = makeTools({ limits: WIDE })
    await seedAccount(world, { platform: 'tiktok', external_id: '@foo', tags: ['a'] })
    const result = await world.registered.get('inspiration_rival_accounts').execute({ platform: 'tiktok' })
    assert.equal(result.count, 1)
    const account = result.accounts[0]
    for (const key of ['id', 'platform', 'handle', 'nickname', 'followers', 'tags', 'refresh_state', 'last_refresh_at', 'latest_post_at', 'potential_post_count']) {
      assert.ok(key in account, key)
    }
  })

  it('filters posts to the flagged ones', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    const all = await world.registered.get('inspiration_rival_posts').execute({ account_id: account.id })
    assert.equal(all.count, 2)
    assert.equal(typeof all.carry_over, 'number')
    const flagged = await world.registered.get('inspiration_rival_posts').execute({ account_id: account.id, only_potential: true })
    assert.ok(flagged.count <= all.count)
    for (const post of flagged.posts) assert.equal(post.potential.flagged, true)
  })

  it('resolves an account by platform + handle', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'youtube', external_id: '@foo', handle: '@foo' })
    const result = await world.registered.get('inspiration_rival_posts').execute({ platform: 'youtube', handle: '@foo' })
    assert.equal(result.count, 2)
    assert.equal(account.platform, 'youtube')
  })

  it('returns one post together with its account', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    const postId = world.store.readPosts(account.id)[0].id
    const result = await world.registered.get('inspiration_rival_post').execute({ account_id: account.id, post_id: postId })
    assert.equal(result.post.id, postId)
    assert.equal(result.account.id, account.id)
    assert.equal(result.account.followers, 12_000)
  })

  it('builds a rival_post attachment payload without mounting anything', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    const postId = world.store.readPosts(account.id)[0].id
    world.store.updatePost(account.id, postId, {
      cover_local_path: '/tmp/cover.jpg',
      cover_http_url: '/omnimux/inspiration/local/media/rival-accounts/covers/x.jpg',
    })
    const result = await world.registered.get('inspiration_rival_posts_add_to_session').execute({ account_id: account.id, post_id: postId })
    assert.equal(result.ok, true)
    assert.equal(result.attachment.kind, 'rival_post')
    assert.equal(result.attachment.sourcePlugin, 'omnimux-inspiration')
    assert.equal(result.attachment.entityId, postId)
    assert.equal(result.attachment.relativePath, '/tmp/cover.jpg')
    assert.equal(result.attachment.previewUrl, '/omnimux/inspiration/local/media/rival-accounts/covers/x.jpg')
    assert.deepEqual(result.attachment.metadata.stats, world.store.findPost(account.id, postId).stats)
    assert.match(result.note, /workbench/i)
  })

  it('converts a post and reports the inspiration id and job', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    const postId = world.store.readPosts(account.id)[0].id
    const result = await world.registered.get('inspiration_rival_to_inspiration').execute({ account_id: account.id, post_id: postId })
    assert.equal(result.inspiration_id, 'insp_9')
    assert.equal(result.import_status, 'importing')
    assert.equal(result.job, 'running')
  })

  it('queues one account and reports the remaining budget', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    const callsAfterSeed = world.cloud.calls.length
    // `manual: false` keeps this call out of the manual cooldown window the
    // seed's first refresh just opened; the cooldown has its own case above.
    const result = await world.registered.get('inspiration_rival_refresh').execute({ account_id: account.id, manual: false })
    assert.deepEqual(result.queued, [account.id])
    assert.deepEqual(result.skipped, [])
    // The snapshot is taken after the claim, so it already reflects this cycle.
    assert.equal(result.budget_remaining, 5000 - 4)
    await world.scheduler.settled()
    assert.equal(world.cloud.calls.length - callsAfterSeed, 2)
  })

  it('refreshes all accounts and skips a terminal one with a reason key', async () => {
    const world = makeTools({ limits: WIDE })
    const healthy = await seedAccount(world, { platform: 'tiktok', external_id: '@a' })
    const broken = world.store.addAccount({ platform: 'tiktok', external_id: '@b' })
    world.store.updateAccount(broken.id, { refresh_state: 'error', error_code: 'identity-unverified' })
    const result = await world.registered.get('inspiration_rival_refresh').execute({ all: true, manual: false })
    assert.deepEqual(result.queued, [healthy.id])
    assert.deepEqual(result.skipped, [{ id: broken.id, reason_key: 'rivalAccounts.skip.accountError' }])
    await waitForIdle(world, healthy.id)
  })

  it('answers "no work done" instead of failing when the budget is gone', async () => {
    const world = makeTools()
    // `@spent` burns its whole daily allowance (the seed plus one manual cycle);
    // `@fresh` still has its own, so the same call can be shown to queue one
    // account and skip the other.
    const spent = await seedAccount(world, { platform: 'tiktok', external_id: '@spent' })
    const fresh = world.store.addAccount({ platform: 'tiktok', external_id: '@fresh' })
    await world.registered.get('inspiration_rival_refresh').execute({ account_id: spent.id, manual: false })
    await waitForIdle(world, spent.id)
    assert.equal(world.store.readBudget().per_account[spent.id].calls, 4)

    const result = await world.registered.get('inspiration_rival_refresh').execute({ all: true, manual: false })
    assert.deepEqual(result.queued, [fresh.id])
    assert.deepEqual(result.skipped, [{ id: spent.id, reason_key: 'rivalAccounts.skip.budget' }])
    // The refusal is a report, not a failure: the account is parked, not failed.
    assert.equal(world.store.getAccount(spent.id).refresh_state, 'paused')
    assert.equal(world.store.getAccount(spent.id).error_code, 'account-daily-cap')
    await waitForIdle(world, fresh.id)
  })
})

describe('G5: error semantics', () => {
  it('names the missing record', async () => {
    const world = makeTools()
    await assert.rejects(
      () => world.registered.get('inspiration_rival_post').execute({ account_id: 'nope', post_id: 'p1' }),
      /对标账号不存在 \(account not found\): nope/,
    )
    const seeded = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    await assert.rejects(
      () => world.registered.get('inspiration_rival_post').execute({ account_id: seeded.id, post_id: 'nope' }),
      /对标帖子不存在 \(post not found\): nope/,
    )
  })

  it('turns the hub login gate into an actionable message', async () => {
    const gate = Object.assign(new Error('需要登录 OmniMux'), { code: RIVAL_ERROR_CODES.NEEDS_OMNIMUX })
    assert.equal(toToolError(gate).message, LOGIN_REQUIRED_MESSAGE)

    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    world.cloud.behaviour.failUser = gate
    await world.registered.get('inspiration_rival_refresh').execute({ account_id: account.id, manual: false })
    await waitForIdle(world, account.id)
    assert.equal(world.store.getAccount(account.id).error_code, RIVAL_ERROR_CODES.NEEDS_OMNIMUX)
  })

  it('turns an exhausted quota into an actionable message', async () => {
    const refusal = Object.assign(new Error('quota'), { status: 402, code: RIVAL_ERROR_CODES.QUOTA_EXCEEDED })
    assert.equal(toToolError(refusal).message, QUOTA_EXHAUSTED_MESSAGE)

    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    world.cloud.behaviour.failUser = refusal
    await world.registered.get('inspiration_rival_refresh').execute({ account_id: account.id, manual: false })
    await waitForIdle(world, account.id)
    assert.equal(world.store.getAccount(account.id).error_code, RIVAL_ERROR_CODES.QUOTA_EXCEEDED)
  })

  it('reports the missing hub seam', async () => {
    assert.equal(TOOL_MISSING_MESSAGE.includes('omnimux_social_data'), true)
    // A bare `Error` carrying the seam message is mapped to the actionable text,
    // and a refresh queued against a missing seam surfaces that error rather
    // than reporting a successful (empty) cycle.
    assert.equal(toToolError(new Error(TOOL_MISSING_MESSAGE)).message, TOOL_MISSING_MESSAGE)

    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    world.cloud.behaviour.tool = undefined
    world.cloud.behaviour.forceMissing = true
    await world.registered.get('inspiration_rival_refresh').execute({ account_id: account.id, manual: false })
    await waitForIdle(world, account.id)
    const stored = world.store.getAccount(account.id)
    assert.equal(stored.error_code, RIVAL_ERROR_CODES.CLOUD_ERROR)
    assert.match(stored.error_message || '', /omnimux_social_data/)
  })

  it('reports a missing media file instead of inventing an attachment', async () => {
    const world = makeTools({ limits: WIDE })
    const account = await seedAccount(world, { platform: 'tiktok', external_id: '@foo' })
    const postId = world.store.readPosts(account.id)[0].id
    await assert.rejects(
      () => world.registered.get('inspiration_rival_posts_add_to_session').execute({ account_id: account.id, post_id: postId }),
      /无可用媒体/,
    )
  })
})
