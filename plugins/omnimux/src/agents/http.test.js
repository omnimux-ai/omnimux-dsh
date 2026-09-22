import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Readable } from 'node:stream'
import { registerAgentRoutes } from './http.js'

function fakeRes() {
  return {
    status: 0,
    text: '',
    writeHead(status) { this.status = status },
    end(text) { this.text = text },
    body() { return JSON.parse(this.text) },
  }
}

function fakeReq(method, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  stream.method = method
  stream.headers = headers
  return stream
}

function fakeSettings(initial = {}) {
  let value = { ...initial }
  return {
    get value() { return value },
    get: async () => value,
    describe: () => [{ ns: 'omnimux', revision: 1 }],
    update: async (ns, patch) => { value = { ...value, ...patch } },
  }
}

function register(deps) {
  const handlers = {}
  const webServer = {
    register(route) {
      handlers[route.path] = route.handler
      return () => { delete handlers[route.path] }
    },
  }
  registerAgentRoutes(webServer, deps)
  return handlers
}

describe('agent routes', () => {
  it('GET lists scanned agents', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [{ id: 'claude', name: 'Claude Code', installed: true, version: '2.1' }],
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().agents.length, 1)
    assert.equal(res.body().agents[0].installed, true)
  })

  it('select marks a probed agent verified', async () => {
    const settings = fakeSettings({})
    const handlers = register({
      settings,
      probe: async () => ({ installed: true, version: '2.1' }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(settings.value.runtimeAgentId, 'claude')
    assert.equal(settings.value.runtimeAgentVerified, true)
  })

  it('select on a missing binary stores the choice as unverified', async () => {
    const settings = fakeSettings({})
    const handlers = register({
      settings,
      probe: async () => ({ installed: false, version: '' }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'kimi' }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body(), { ok: false, error: 'not-installed' })
    assert.equal(settings.value.runtimeAgentId, 'kimi')
    assert.equal(settings.value.runtimeAgentVerified, false)
  })

  it('select rejects an unknown agent id', async () => {
    const handlers = register({ settings: fakeSettings({}) })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
  })

  it('select refuses a cross-origin write', async () => {
    const handlers = register({ settings: fakeSettings({}) })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'claude' }, { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
  })
})
