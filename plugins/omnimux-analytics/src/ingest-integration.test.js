/**
 * End-to-end wiring: renderer POST → plugin ingest route → event queue →
 * Umami collection request.
 *
 * The inbound hop uses a real HTTP server and a real fetch; the outbound hop is
 * captured by stubbing the process fetch, so the assertion is on the exact
 * request the plugin would put on the wire.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { apply } from './index.js'
import { ANALYTICS_INGEST_PATH } from './http-routes.js'

const realFetch = globalThis.fetch

/** @type {Array<Record<string, any>>} */
let outbound
let restoreFetch

beforeEach(() => {
  outbound = []
  restoreFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    outbound.push({ url: String(url), ...JSON.parse(init.body) })
    return { ok: true }
  }
})

afterEach(() => {
  globalThis.fetch = restoreFetch
})

/**
 * Cordis-like context whose `inject` resolves immediately with a webServer
 * stand-in, so `apply` mounts its route during the call.
 * @param {{ kind: string, path: string, handler: Function }[]} routes
 */
function makeCtx(routes) {
  /** @type {Record<string, Function>} */
  const handlers = {}
  const webServer = { register: (route) => { routes.push(route); return () => {} } }
  return {
    handlers,
    ctx: {
      on(event, listener) { handlers[event] = listener; return listener },
      effect(fn) { return fn },
      inject(deps, callback) {
        if (deps.includes('webServer')) callback({ webServer })
        return () => {}
      },
      tools: { register() {}, get() { return undefined } },
    },
  }
}

/**
 * Serve the registered route on an ephemeral port and return its URL.
 * @param {{ kind: string, path: string, handler: Function }[]} routes
 */
async function serveRoutes(routes) {
  const server = createServer((req, res) => {
    const route = routes.find((candidate) => candidate.path === req.url)
    if (!route) { res.writeHead(404); res.end('{}'); return }
    void route.handler(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = /** @type {{ port: number }} */ (server.address())
  return {
    url: `http://127.0.0.1:${port}${ANALYTICS_INGEST_PATH}`,
    close: () => new Promise((resolve) => { server.close(resolve) }),
  }
}

const postEvent = (url, body) => realFetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('a page event reaches the collection request with the site id and dwell time', async () => {
  const routes = []
  const { ctx } = makeCtx(routes)
  apply(ctx, { websiteId: 'w-1', flushIntervalMs: 0 })

  assert.deepEqual(routes.map((route) => ({ kind: route.kind, path: route.path })), [
    { kind: 'exact', path: ANALYTICS_INGEST_PATH },
  ])

  const server = await serveRoutes(routes)
  try {
    const open = await postEvent(server.url, { name: 'stage-open', stage: 'omnimux-assets' })
    assert.equal(open.status, 202)
    assert.deepEqual(await open.json(), { accepted: true, queued: true })

    const close = await postEvent(server.url, { name: 'stage-close', stage: 'omnimux-assets', dwellMs: 4200 })
    assert.equal(close.status, 202)
  } finally {
    await server.close()
  }

  const stageEvents = outbound.filter((request) => String(request.payload.name).startsWith('stage-'))
  assert.equal(stageEvents.length, 2)
  assert.equal(stageEvents[0].url, 'https://analytics.omnimux.ai/api/send')
  assert.deepEqual(stageEvents[0].payload, {
    website: 'w-1',
    hostname: 'omnimux-plugins',
    language: 'en-US',
    referrer: '',
    screen: '',
    title: 'omnimux-plugins',
    url: 'omnimux://plugins',
    name: 'stage-open',
    data: { stage: 'omnimux-assets' },
  })
  assert.deepEqual(stageEvents[1].payload.data, { stage: 'omnimux-assets', dwellMs: 4200 })
})

test('an unconfigured profile still answers the renderer and sends nothing', async () => {
  const routes = []
  const { ctx } = makeCtx(routes)
  apply(ctx, undefined)

  const server = await serveRoutes(routes)
  try {
    const response = await postEvent(server.url, { name: 'stage-open', stage: 'omnimux-clip' })
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { accepted: true, queued: false })
  } finally {
    await server.close()
  }
  assert.deepEqual(outbound, [])
})

test('a rejected event never reaches the collection request', async () => {
  const routes = []
  const { ctx } = makeCtx(routes)
  apply(ctx, { websiteId: 'w-1', flushIntervalMs: 0 })

  const server = await serveRoutes(routes)
  try {
    const response = await postEvent(server.url, { name: 'stage-open', stage: 'omnimux-assets', prompt: 'secret' })
    assert.equal(response.status, 400)
  } finally {
    await server.close()
  }
  // `plugin-load` is reported at apply; no page event may follow a rejection.
  assert.deepEqual(outbound.filter((request) => String(request.payload.name).startsWith('stage-')), [])
})
