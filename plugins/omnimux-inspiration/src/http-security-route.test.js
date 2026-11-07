import assert from 'node:assert/strict'
import { PassThrough, Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { apply } from './index.js'
import { LOCAL_PREFIX } from './http-routes.js'

function makeReq({ method = 'GET', url, headers = {}, body } = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = Readable.from(payload === '' ? [] : [Buffer.from(payload, 'utf8')])
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:64245', ...(payload === '' ? {} : { 'content-type': 'application/json' }), ...headers }
  return req
}

function makeRes() {
  const state = { status: 0, headers: {}, body: '' }
  const res = new PassThrough()
  res.state = state
  res.writeHead = function writeHead(status, headers) {
    state.status = status
    state.headers = headers || {}
    return this
  }
  res.end = function end(chunk) {
    if (chunk !== undefined) state.body += chunk.toString()
    this.emit('finish')
    return this
  }
  res.json = () => {
    try { return state.body ? JSON.parse(state.body) : null } catch { return null }
  }
  return res
}

async function httpCall(route, options) {
  const req = makeReq(options)
  const res = makeRes()
  await route.handler(req, res)
  return { status: res.state.status, headers: res.state.headers, body: res.json() }
}

function bootPlugin() {
  const root = mkdtempSync(join(tmpdir(), 'inspiration-security-route-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  const routes = []
  const ctx = {
    tools: { register() {}, get() { return undefined } },
    get() { return undefined },
    inject(deps, callback) {
      if (!deps.includes('webServer')) return
      callback({
        webServer: { register(route) { routes.push(route); return () => {} } },
        effect: () => () => {},
      })
    },
    effect() {},
  }
  apply(ctx)
  const route = routes.find((entry) => entry.path === LOCAL_PREFIX)
  assert.ok(route, 'inspiration prefix route must be registered')
  return {
    route,
    dispose() {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      rmSync(root, { recursive: true, force: true })
    },
  }
}

describe('inspiration route-level security boundary', () => {
  it('does not grant CORS to a browser OPTIONS preflight', async () => {
    const world = bootPlugin()
    try {
      const res = await httpCall(world.route, {
        method: 'OPTIONS',
        url: `${LOCAL_PREFIX}/import-url`,
        headers: { origin: 'http://127.0.0.1:5173' },
      })
      assert.equal(res.status, 204)
      assert.equal(res.headers['Access-Control-Allow-Origin'], undefined)
    } finally {
      world.dispose()
    }
  })

  it('allows an exact browser-extension origin', async () => {
    const world = bootPlugin()
    try {
      const res = await httpCall(world.route, {
        method: 'OPTIONS',
        url: `${LOCAL_PREFIX}/import-url`,
        headers: { origin: 'chrome-extension://abcdefghijklmnop' },
      })
      assert.equal(res.status, 204)
      assert.equal(res.headers['Access-Control-Allow-Origin'], 'chrome-extension://abcdefghijklmnop')
    } finally {
      world.dispose()
    }
  })

  it('rejects foreign GET and same-site POST', async () => {
    const world = bootPlugin()
    try {
      const foreign = await httpCall(world.route, {
        url: LOCAL_PREFIX,
        headers: { origin: 'https://evil.example' },
      })
      assert.equal(foreign.status, 403)
      assert.deepEqual(foreign.body, { error: 'not-local' })

      const sameSite = await httpCall(world.route, {
        method: 'POST',
        url: `${LOCAL_PREFIX}/import-url`,
        headers: { origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-site' },
        body: { url: 'https://x.com/creator/status/1' },
      })
      assert.equal(sameSite.status, 403)
      assert.deepEqual(sameSite.body, { error: 'not-local' })
    } finally {
      world.dispose()
    }
  })
})
