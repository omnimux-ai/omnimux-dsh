import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountWebSocketHmr, REBUILT_EVENT, SNAPSHOT_PATH } from './host.js'
import { createHubEventBus } from '../events/hub-event-bus.js'
import { parseHubConfig } from '../config.js'

test('WebSocket HMR preserves configured hub settings', () => {
  const parsed = parseHubConfig({
    productName: 'Configured workspace',
    media: { defaultProvider: 'omnimux' },
    gate: { media: { audio: false } },
  })
  assert.equal(parsed.hmrTransport, 'websocket')
  assert.equal(parsed.productName, 'Configured workspace')
  assert.equal(parsed.media.defaultProvider, 'omnimux')
  assert.equal(parsed.gate.media.audio, false)
})

test('official watcher is reused, rebuild is bridged, and snapshot retains authentication', () => {
  const bus = createHubEventBus()
  const cleanups = []
  const routes = []
  let rebuilt
  let watcherConfig
  let watcherDisposed = false
  const rows = [{ id: 'omnimux', rev: 'v2' }]
  const ctx = {
    effect(factory) { cleanups.push(factory()) },
    clientModules: { graph: () => ({ entries: rows }), onRebuilt(fn) { rebuilt = fn; return () => { rebuilt = null } } },
    webServer: { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) } },
    connection: { requestRejection: req => req.headers.cookie === 'fixture' ? undefined : 401 },
  }
  mountWebSocketHmr(ctx, bus, (inner, config) => {
    assert.equal(inner, ctx)
    watcherConfig = config
    inner.effect(() => () => { watcherDisposed = true })
  })
  assert.deepEqual(watcherConfig, { pollIntervalMs: 500 })
  let notice
  const unsubscribe = bus.subscribe(event => { notice = event })
  rebuilt('omnimux', 'v2')
  assert.equal(notice.type, REBUILT_EVENT)
  assert.deepEqual(notice.payload, rows[0])
  const route = routes.find(row => row.path === SNAPSHOT_PATH)
  function request(headers, method = 'GET') {
    const result = {}
    route.handler({ headers, method }, { writeHead(status) { result.status = status }, end(body) { result.body = body } })
    return result
  }
  assert.equal(request({ origin: 'http://127.0.0.1' }).status, 401)
  assert.equal(request({ cookie: 'fixture', origin: 'https://foreign.example' }).status, 403)
  assert.equal(request({ cookie: 'fixture', origin: 'http://127.0.0.1' }, 'POST').status, 405)
  const result = request({ cookie: 'fixture', origin: 'http://127.0.0.1' })
  assert.equal(result.status, 200)
  assert.deepEqual(JSON.parse(result.body).entries, rows)
  for (const cleanup of cleanups.reverse()) cleanup()
  unsubscribe()
  assert.equal(rebuilt, null)
  assert.equal(watcherDisposed, true)
  assert.equal(routes.length, 0)
})

test('dual native and WebSocket HMR activation fails before mounting effects', () => {
  const ctx = { clientModules: { graph: () => ({ entries: [{ id: '@deepseek-ai/dsh-client-hmr' }] }) } }
  assert.throws(() => mountWebSocketHmr(ctx, {}, () => {}), /must|requires/)
})
