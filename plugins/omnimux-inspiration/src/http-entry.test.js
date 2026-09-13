/**
 * HTTP-entry integration gate.
 *
 * Every other 对标账号 test drives `createRivalDispatcher` (or the service)
 * directly, which is exactly the blind spot that let a broken HTTP entry ship:
 * the dispatcher, the agent tools, and the client were all correct while
 * nothing routed a real request to them. This file therefore exercises
 * `apply(ctx)` — the production assembly — through the handler the plugin
 * registers on `webServer`, and asserts what an HTTP client actually receives.
 *
 * Layer under test:
 *   apply(ctx) → webServer prefix handler → dispatcher.dispatch
 *                                          ├── rival prefix  → rival dispatcher
 *                                          └── everything else → inspiration routes
 *
 * Offline: the only outbound seam is the hub's `omnimux_social_data` tool, which
 * is replaced by a counting stub, and the suite runs under `deny-network.mjs`.
 */

import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from './index.js'
import { LOCAL_PREFIX } from './http-routes.js'
import { resolveInspirationPaths } from './paths.js'
import { createRivalAccountsStore } from './rival/rival-accounts-store.js'
import { resolveRivalPaths } from './rival/rival-paths.js'
import { RIVAL_BOUNDARY, RIVAL_PREFIX } from './rival/rival-routes.js'
import { SOCIAL_DATA_TOOL } from './rival/rival-remote.js'

const USER_FIXTURE = {
  channel_id: 'UCabcdefghijklmnopqrstuv',
  nickname: 'Rival One',
  follower_count: 12_000,
  signature: 'cooking shorts',
}
const POSTS_FIXTURE = {
  items: [
    { id: '7321234567890123456', short_code: '7321234567890123456', desc: 'kitchen hack', play_count: 5000, digg_count: 400, comment_count: 30, share_count: 10, create_time: 1_700_000_000 },
  ],
}
const ACCOUNT_URL = 'https://www.youtube.com/@foo'

/** A `{ kind: 'prefix' }` route registered by `apply` through `mountHttp`. */
const registrations = []
/** Cloud-seam calls the stub served; the real network is denied by `deny-network.mjs`. */
const cloudCalls = []
const sandboxes = []

let savedDshHome = null

before(() => {
  savedDshHome = process.env.DSH_HOME
})

after(() => {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
})

beforeEach(() => {
  registrations.length = 0
  cloudCalls.length = 0
})

afterEach(() => {
  while (sandboxes.length > 0) rmSync(sandboxes.pop(), { recursive: true, force: true })
})

/**
 * The hub's social-data tool, replaced: every call is recorded so a test can
 * prove the cloud was never touched outside the stubbed seam.
 */
function makeCloudTool() {
  return {
    async execute(args) {
      cloudCalls.push({ platform: args.platform, capability: args.capability, id: args.id })
      if (args.capability === 'user') {
        return { platform: args.platform, capability: 'user', field: 'channel_id', value: args.id, data: USER_FIXTURE }
      }
      return { platform: args.platform, capability: 'posts', field: 'channel_id', value: args.id, data: POSTS_FIXTURE }
    },
  }
}

/**
 * Boot the plugin exactly as the host does, against a throwaway `DSH_HOME`.
 *
 * The context shape mirrors the cordis one the host calls `apply` with:
 * `ctx.tools` for tool registration, `ctx.inject` for the async `webServer`
 * dependency, and `ctx.effect` for teardown.
 */
function bootPlugin() {
  const root = mkdtempSync(join(tmpdir(), 'inspiration-http-entry-'))
  sandboxes.push(root)
  // `apply` resolves the library and rival paths from `DSH_HOME` at mount time,
  // so pointing it at the sandbox is what keeps this test off the real library.
  process.env.DSH_HOME = root

  const registeredTools = []
  const effects = []
  const injects = []
  const ctx = {
    tools: {
      register(tool) {
        registeredTools.push(tool)
      },
      get(toolName) {
        return toolName === SOCIAL_DATA_TOOL ? makeCloudTool() : undefined
      },
    },
    inject(deps, callback) {
      injects.push({ deps, callback })
    },
    effect(callback, label) {
      effects.push({ callback, label })
    },
  }
  apply(ctx)

  const webServer = {
    register(route) {
      registrations.push(route)
      return () => {
        const index = registrations.indexOf(route)
        if (index >= 0) registrations.splice(index, 1)
      }
    },
  }
  // The host hands the resolved `webServer` back with the same `effect` seat the
  // outer context has, which is what the plugin registers its HTTP teardown on.
  for (const injected of injects) {
    injected.callback({ webServer, effect: (callback, label) => effects.push({ callback, label }) })
  }

  const prefixRoutes = registrations.filter((route) => route.path === LOCAL_PREFIX)
  assert.equal(
    prefixRoutes.length,
    1,
    `expected exactly one ${LOCAL_PREFIX} prefix route; the rival module must not register a second one`,
  )

  return { root, effects, registeredTools, route: prefixRoutes[0], prefixRoutes }
}

/**
 * @param {{ method?: string, url: string, headers?: Record<string, string>, body?: unknown }} request
 */
function makeReq({ method = 'GET', url, headers = {}, body }) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = Readable.from(payload === '' ? [] : [Buffer.from(payload, 'utf8')])
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1', ...(payload === '' ? {} : { 'content-type': 'application/json' }), ...headers }
  return req
}

function makeRes() {
  const state = { status: 0, headers: null, body: '' }
  return {
    state,
    writeHead(status, headers) {
      state.status = status
      state.headers = headers
      return this
    },
    end(chunk) {
      state.body += typeof chunk === 'string' ? chunk : (chunk ? Buffer.from(chunk).toString('utf8') : '')
      return this
    },
    json() {
      return state.body ? JSON.parse(state.body) : null
    },
  }
}

/** Send one request through the prefix handler the plugin registered. */
async function httpCall(route, { method = 'GET', url, headers = {}, body } = {}) {
  const req = makeReq({ method, url, headers, body })
  const res = makeRes()
  await route.handler(req, res)
  return { status: res.state.status, headers: res.state.headers, body: res.json(), raw: res.state.body }
}

describe('HTTP entry: the rival prefix is reachable through the registered handler', () => {
  it('answers the account list on GET /rival-accounts with 200 rather than `not found`', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, { url: RIVAL_PREFIX })

    // This is the P0 assertion: the inspiration route table reads the segment
    // after `/local/` as an item id, so an unclaimed rival prefix answers the
    // item route's 404 `not found` — which is what the page rendered.
    assert.equal(response.status, 200, `GET ${RIVAL_PREFIX} → ${response.raw}`)
    assert.equal(response.body.error, undefined)
    assert.deepEqual(response.body.data.items, [])
    assert.equal(response.body.data.total, 0)
  })

  it('classifies a pasted URL on POST /rival-accounts/classify', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, {
      method: 'POST',
      url: `${RIVAL_PREFIX}/classify`,
      body: { url: ACCOUNT_URL },
    })

    assert.equal(response.status, 200, `POST ${RIVAL_PREFIX}/classify → ${response.raw}`)
    assert.equal(response.body.data.kind, 'account')
    assert.equal(response.body.data.platform, 'youtube')
    assert.equal(response.body.data.external_id, '@foo')
  })

  it('imports an account on POST /rival-accounts and serves it back on GET /<id>', async () => {
    const world = bootPlugin()
    const created = await httpCall(world.route, {
      method: 'POST',
      url: RIVAL_PREFIX,
      body: { url: ACCOUNT_URL, tags: ['cooking'] },
    })

    assert.equal(created.status, 201, `POST ${RIVAL_PREFIX} → ${created.raw}`)
    assert.equal(created.body.data.external_id, '@foo')
    assert.equal(created.body.data.platform, 'youtube')
    assert.deepEqual(created.body.data.tags, ['cooking'])
    assert.equal(created.body.data.profile_url, ACCOUNT_URL)
    const accountId = created.body.data.id
    assert.ok(accountId)

    const detail = await httpCall(world.route, { url: `${RIVAL_PREFIX}/${accountId}` })
    assert.equal(detail.status, 200, `GET ${RIVAL_PREFIX}/${accountId} → ${detail.raw}`)
    assert.equal(detail.body.data.account.id, accountId)
    assert.equal(detail.body.data.account.external_id, '@foo')

    const posts = await httpCall(world.route, { url: `${RIVAL_PREFIX}/${accountId}/posts` })
    assert.equal(posts.status, 200, `GET ${RIVAL_PREFIX}/${accountId}/posts → ${posts.raw}`)
    assert.ok(Array.isArray(posts.body.data.items))
  })

  it('serves the monitored posts of an account on GET /<id>/posts', async () => {
    const world = bootPlugin()
    const created = await httpCall(world.route, {
      method: 'POST',
      url: RIVAL_PREFIX,
      body: { url: ACCOUNT_URL },
    })
    const accountId = created.body.data.id
    // Seeding through the same store the module writes keeps this an HTTP test
    // (what a client receives) rather than a store test.
    const seed = createRivalAccountsStore({
      paths: resolveRivalPaths({ paths: resolveInspirationPaths({ homeDir: world.root }) }),
    })
    seed.writePosts(accountId, [
      { id: '7321234567890123456', desc: 'kitchen hack', play_count: 5000, digg_count: 400, create_time: 1_700_000_000 },
    ])

    const posts = await httpCall(world.route, { url: `${RIVAL_PREFIX}/${accountId}/posts` })
    assert.equal(posts.status, 200, `GET ${RIVAL_PREFIX}/${accountId}/posts → ${posts.raw}`)
    assert.equal(posts.body.data.items.length, 1)
    assert.equal(posts.body.data.items[0].id, '7321234567890123456')
    assert.equal(posts.body.data.account.id, accountId)
  })

  it('still answers 404 for an unknown sub-path of the rival prefix', async () => {
    const world = bootPlugin()
    // A catch-all that swallowed every `/rival-accounts/...` path would turn
    // this into a 200 (or a 500); the prefix must claim its own 404 instead.
    const response = await httpCall(world.route, { url: `${RIVAL_PREFIX}/nope/nope` })
    assert.equal(response.status, 404, `${RIVAL_PREFIX}/nope/nope → ${response.raw}`)
    assert.equal(response.body.error, 'not found')
  })

  it('does not let the rival prefix swallow a look-alike sibling path', async () => {
    const world = bootPlugin()
    // `/rival-accounts-extra` starts with the boundary text but is not inside
    // it, so it must stay on the inspiration router (which reads it as an item
    // id and answers its own not-found).
    const response = await httpCall(world.route, { url: `${LOCAL_PREFIX}/${RIVAL_BOUNDARY}-extra` })
    assert.equal(response.status, 404)
    assert.equal(response.body.error, 'not found')
  })

  it('keeps 405 on a wrong method instead of falling through to the inspiration router', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, { method: 'GET', url: `${RIVAL_PREFIX}/classify` })
    assert.equal(response.status, 405, `GET ${RIVAL_PREFIX}/classify → ${response.raw}`)
    assert.equal(response.body.code, 'method-not-allowed')
  })

  it('rejects a malformed JSON body before either dispatcher sees it', async () => {
    const world = bootPlugin()
    const req = makeReq({ method: 'POST', url: RIVAL_PREFIX })
    req.push(Buffer.from('{not json', 'utf8'))
    req.push(null)
    const res = makeRes()
    await world.route.handler(req, res)
    assert.equal(res.state.status, 400)
    assert.equal(res.json().error, 'invalid json')
  })
})

describe('HTTP entry: the existing inspiration endpoints are unchanged', () => {
  it('answers the library list on GET /omnimux/inspiration/local', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, { url: LOCAL_PREFIX })

    assert.equal(response.status, 200, `GET ${LOCAL_PREFIX} → ${response.raw}`)
    assert.deepEqual(response.body.data.items, [])
    assert.equal(response.body.data.total, 0)
    assert.ok(Array.isArray(response.body.data.platforms))
  })

  it('still reads an item by id on GET /omnimux/inspiration/local/<id>', async () => {
    const world = bootPlugin()
    const missing = await httpCall(world.route, { url: `${LOCAL_PREFIX}/does-not-exist` })
    assert.equal(missing.status, 404, `GET ${LOCAL_PREFIX}/does-not-exist → ${missing.raw}`)
    assert.equal(missing.body.error, 'not found')
  })

  it('keeps the media stream route answering its own 404 for an absent file', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, { url: `${LOCAL_PREFIX}/media/covers/missing.jpg` })
    assert.equal(response.status, 404, `${LOCAL_PREFIX}/media/covers/missing.jpg → ${response.raw}`)
    assert.equal(response.body.error, 'file not found')
  })

  it('keeps the collection POST on the inspiration router (rival writes are not misrouted)', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, { method: 'POST', url: LOCAL_PREFIX, body: {} })
    assert.equal(response.status, 400, `POST ${LOCAL_PREFIX} → ${response.raw}`)
    assert.equal(response.body.error, 'title is required')
  })
})

describe('HTTP entry: assembly completeness and teardown', () => {
  it('takes over the rival prefix through the single registered prefix route', async () => {
    const world = bootPlugin()
    // Structural half of the gate: no second route exists for the rival prefix,
    // and the one route that does exist answers rival requests. A future change
    // that splits the rival prefix into its own registration fails here.
    assert.equal(world.prefixRoutes.length, 1)
    assert.equal(world.route.kind, 'prefix')

    const owned = await httpCall(world.route, { url: RIVAL_PREFIX })
    assert.notEqual(owned.status, 404)
  })

  it('registers the plugin tools and exposes a teardown effect', () => {
    const world = bootPlugin()
    const names = world.registeredTools.map((tool) => tool.name)
    assert.ok(names.includes('inspiration_search'))
    assert.ok(names.includes('inspiration_rival_accounts'), names.join(','))
    assert.ok(world.effects.some((entry) => entry.label === 'omnimux-inspiration-rival-scheduler'))
    assert.ok(world.effects.some((entry) => entry.label === 'omnimux-inspiration-http-routes'))
  })

  it('answers through the injected cloud seam, never through a real client', async () => {
    const world = bootPlugin()
    // `deny-network.mjs` already replaces dns / net / tls / http(s) / fetch with
    // throwing stubs for this whole run, so an accidental egress fails the suite
    // loudly. What is left to hold here is the positive half: the module's one
    // outbound path is the tool the host injects, and it is not called except
    // when a request needs it.
    const created = await httpCall(world.route, {
      method: 'POST',
      url: RIVAL_PREFIX,
      body: { url: ACCOUNT_URL },
    })
    assert.equal(created.status, 201)
    assert.ok(cloudCalls.length >= 1, 'the injected social-data tool should serve the refresh cycle')
    assert.ok(
      cloudCalls.every((call) => call.platform === 'youtube'),
      `unexpected platform in cloud seam: ${JSON.stringify(cloudCalls)}`,
    )
  })
})

describe('HTTP entry: the media-export route is reachable through the registered handler', () => {
  it('answers a validation error on POST /fetch-media rather than the item route`s `not found`', async () => {
    const world = bootPlugin()
    const response = await httpCall(world.route, {
      method: 'POST',
      url: `${LOCAL_PREFIX}/fetch-media`,
      body: {},
    })

    // The same blind spot the rival prefix hit: an unclaimed sub-path is read as
    // an item id, so a route the extension depends on would answer 404 `not
    // found` and look like a missing feature instead of a bad request.
    assert.equal(response.status, 400, `POST /fetch-media → ${response.raw}`)
    assert.match(response.body.error, /url/)
  })
})
