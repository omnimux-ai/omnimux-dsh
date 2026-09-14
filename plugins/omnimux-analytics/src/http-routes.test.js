import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import {
  ANALYTICS_INGEST_PATH,
  createAnalyticsIngestDispatcher,
  registerAnalyticsRoutes,
} from './http-routes.js'

/**
 * Start a real HTTP server around the dispatcher on an ephemeral port.
 * @param {{ ingest?: (event: any) => boolean }} [deps]
 */
async function serve(deps = {}) {
  const dispatcher = createAnalyticsIngestDispatcher({ ingest: deps.ingest, log: { warn: () => {} } })
  const server = createServer((req, res) => { void dispatcher(req, res) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = /** @type {{ port: number }} */ (server.address())
  return {
    url: `http://127.0.0.1:${port}${ANALYTICS_INGEST_PATH}`,
    close: () => new Promise((resolve) => { server.close(resolve) }),
  }
}

/**
 * @param {string} url
 * @param {RequestInit} init
 */
async function post(url, init) {
  const response = await fetch(url, init)
  const text = await response.text()
  return { status: response.status, body: text.length > 0 ? JSON.parse(text) : null }
}

const json = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

test('valid page events are queued and accepted', async () => {
  /** @type {Array<{ name: string, data: Record<string, unknown> }>} */
  const queued = []
  const server = await serve({ ingest: (event) => { queued.push(event); return true } })
  try {
    const open = await post(server.url, json({ name: 'stage-open', stage: 'omnimux-assets' }))
    const close = await post(server.url, json({ name: 'stage-close', stage: 'omnimux-assets', dwellMs: 1234 }))
    assert.equal(open.status, 202)
    assert.deepEqual(open.body, { accepted: true, queued: true })
    assert.equal(close.status, 202)
    assert.deepEqual(queued, [
      { name: 'stage-open', data: { stage: 'omnimux-assets' } },
      { name: 'stage-close', data: { stage: 'omnimux-assets', dwellMs: 1234 } },
    ])
  } finally {
    await server.close()
  }
})

test('a disabled collector still answers the renderer', async () => {
  const server = await serve({ ingest: () => false })
  try {
    const response = await post(server.url, json({ name: 'stage-open', stage: 'omnimux-clip' }))
    assert.equal(response.status, 202)
    assert.deepEqual(response.body, { accepted: true, queued: false })
  } finally {
    await server.close()
  }
})

test('unknown names, unknown fields, and shaped-like-a-path ids are refused', async () => {
  /** @type {unknown[]} */
  const queued = []
  const server = await serve({ ingest: (event) => { queued.push(event); return true } })
  try {
    const attempts = [
      { name: 'evil-event', stage: 'omnimux-assets' },
      { name: 'stage-open', stage: 'omnimux-assets', prompt: 'secret' },
      { name: 'stage-open', stage: '../../etc/passwd' },
      { name: 'stage-open' },
    ]
    for (const attempt of attempts) {
      const response = await post(server.url, json(attempt))
      assert.equal(response.status, 400, JSON.stringify(attempt))
      assert.equal(response.body.error, 'invalid-event')
    }
    assert.deepEqual(queued, [])
  } finally {
    await server.close()
  }
})

test('method, body encoding, and body size are bounded', async () => {
  const server = await serve({ ingest: () => true })
  try {
    const wrongMethod = await post(server.url, { method: 'GET' })
    assert.equal(wrongMethod.status, 405)

    const malformed = await post(server.url, json('{oops'))
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.error, 'invalid-json')

    const oversized = await post(server.url, json({ name: 'stage-open', stage: 'a'.repeat(9000) }))
    assert.equal(oversized.status, 413)
    assert.equal(oversized.body.error, 'body-too-large')
  } finally {
    await server.close()
  }
})

test('a throwing collector yields 500 instead of an unhandled rejection', async () => {
  const server = await serve({ ingest: () => { throw new Error('queue exploded') } })
  try {
    const response = await post(server.url, json({ name: 'stage-open', stage: 'omnimux-assets' }))
    assert.equal(response.status, 500)
    assert.equal(response.body.error, 'internal')
  } finally {
    await server.close()
  }
})

test('routes register on a plugin-owned path, never on the hub dashboard prefix', () => {
  /** @type {Array<{ kind: string, path: string }>} */
  const registered = []
  const dispose = registerAnalyticsRoutes({ register: (route) => { registered.push(route); return () => {} } }, async () => {})
  assert.deepEqual(registered.map((route) => ({ kind: route.kind, path: route.path })), [
    { kind: 'exact', path: ANALYTICS_INGEST_PATH },
  ])
  assert.equal(ANALYTICS_INGEST_PATH.startsWith('/omnimux/analytics'), false)
  assert.equal(typeof dispose, 'function')
})
