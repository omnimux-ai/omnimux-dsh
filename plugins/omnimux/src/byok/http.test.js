import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Readable } from 'node:stream'
import { describeByokConfig, parseByokPut, registerByokRoutes, BYOK_KEY_REF } from './http.js'

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
  const updates = []
  return {
    updates,
    get value() { return value },
    get: async () => value,
    describe: () => [{ ns: 'omnimux', revision: 1 }],
    update: async (ns, patch, revision) => {
      assert.equal(ns, 'omnimux')
      assert.equal(revision, 1)
      updates.push(patch)
      value = { ...value, ...patch }
    },
  }
}

function fakeCredentials(stored = '') {
  let value = stored
  const writes = []
  return {
    writes,
    get value() { return value },
    set: async (ref, token) => { writes.push([ref, token]); value = token },
    resolve: async (ref) => (ref === BYOK_KEY_REF && value ? { value } : undefined),
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
  registerByokRoutes(webServer, deps)
  return handlers
}

describe('describeByokConfig', () => {
  it('reports state without ever carrying the key', () => {
    const view = describeByokConfig({
      runtimeKeyEndpoint: 'https://p.test/v1',
      runtimeKeyModel: 'm1',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    }, true)
    assert.deepEqual(view, {
      endpoint: 'https://p.test/v1',
      model: 'm1',
      verified: true,
      mediaImage: true,
      mediaVideo: false,
      mediaAudio: false,
      hasKey: true,
    })
    assert.ok(!('apiKey' in view))
  })
})

describe('parseByokPut', () => {
  it('rejects a bad endpoint', () => {
    assert.throws(() => parseByokPut({ endpoint: 'not-a-url', model: 'm' }), /http/)
    assert.throws(() => parseByokPut({ endpoint: '', model: 'm' }), /http/)
  })

  it('rejects an empty model', () => {
    assert.throws(() => parseByokPut({ endpoint: 'https://p.test/v1', model: ' ' }), /模型/)
  })

  it('strips a trailing slash and marks the pass stale', () => {
    const { patch, apiKey } = parseByokPut({
      endpoint: 'https://p.test/v1/',
      model: 'm1',
      apiKey: 'sk-x',
      mediaImage: true,
    })
    assert.equal(patch.runtimeKeyEndpoint, 'https://p.test/v1')
    assert.equal(patch.runtimeKeyVerified, false)
    assert.equal(patch.runtimeMediaImage, true)
    assert.equal(apiKey, 'sk-x')
  })
})

describe('byok routes', () => {
  it('GET reports config and hasKey', async () => {
    const settings = fakeSettings({
      runtimeKeyEndpoint: 'https://p.test/v1',
      runtimeKeyModel: 'm1',
      runtimeKeyVerified: true,
    })
    const credentials = fakeCredentials('sk-stored')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers['/omnimux/byok/config'](fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().hasKey, true)
    assert.equal(res.body().verified, true)
    assert.ok(!('apiKey' in res.body()))
  })

  it('PUT stores the key in credentials and resets the pass', async () => {
    const settings = fakeSettings({})
    const credentials = fakeCredentials('')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers['/omnimux/byok/config'](fakeReq('PUT', {
      endpoint: 'https://p.test/v1',
      model: 'm1',
      apiKey: 'sk-new',
      mediaImage: true,
    }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(credentials.writes, [[BYOK_KEY_REF, 'sk-new']])
    assert.equal(settings.value.runtimeKeyEndpoint, 'https://p.test/v1')
    assert.equal(settings.value.runtimeKeyVerified, false)
    assert.equal(res.body().hasKey, true)
  })

  it('PUT without a key keeps the stored one', async () => {
    const settings = fakeSettings({})
    const credentials = fakeCredentials('sk-old')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers['/omnimux/byok/config'](fakeReq('PUT', {
      endpoint: 'https://p.test/v1',
      model: 'm1',
    }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(credentials.writes, [])
    assert.equal(res.body().hasKey, true)
  })

  it('PUT refuses a cross-origin write', async () => {
    const handlers = register({ settings: fakeSettings({}), credentials: fakeCredentials('') })
    const res = fakeRes()
    await handlers['/omnimux/byok/config'](fakeReq('PUT', {
      endpoint: 'https://p.test/v1', model: 'm1',
    }, { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
  })

  it('test marks verified on success using the stored key', async () => {
    const settings = fakeSettings({
      runtimeKeyEndpoint: 'https://p.test/v1',
      runtimeKeyModel: 'm1',
    })
    const credentials = fakeCredentials('sk-stored')
    const calls = []
    const handlers = register({
      settings,
      credentials,
      fetcher: async (url, init) => {
        calls.push({ url, init })
        return { ok: true, status: 200 }
      },
    })
    const res = fakeRes()
    await handlers['/omnimux/byok/test'](fakeReq('POST', {}), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(settings.value.runtimeKeyVerified, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://p.test/v1/chat/completions')
    assert.equal(calls[0].init.headers.authorization, 'Bearer sk-stored')
  })

  it('test reports the upstream status on failure and clears the pass', async () => {
    const settings = fakeSettings({
      runtimeKeyEndpoint: 'https://p.test/v1',
      runtimeKeyModel: 'm1',
      runtimeKeyVerified: true,
    })
    const credentials = fakeCredentials('sk-stored')
    const handlers = register({
      settings,
      credentials,
      fetcher: async () => ({ ok: false, status: 401 }),
    })
    const res = fakeRes()
    await handlers['/omnimux/byok/test'](fakeReq('POST', {}), res)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body(), { ok: false, status: 401 })
    assert.equal(settings.value.runtimeKeyVerified, false)
  })

  it('DELETE clears the config and the key', async () => {
    const settings = fakeSettings({
      runtimeKeyEndpoint: 'https://p.test/v1',
      runtimeKeyModel: 'm1',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    })
    const credentials = fakeCredentials('sk-stored')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers['/omnimux/byok/config'](fakeReq('DELETE'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().hasKey, false)
    assert.equal(res.body().endpoint, '')
    assert.equal(credentials.value, '')
    assert.equal(settings.value.runtimeKeyVerified, false)
    assert.equal(settings.value.runtimeMediaImage, false)
  })

  it('runtime mode endpoint writes a valid choice', async () => {
    const settings = fakeSettings({})
    const handlers = register({ settings, credentials: fakeCredentials('') })
    const res = fakeRes()
    await handlers['/omnimux/runtime/mode'](fakeReq('PUT', { mode: 'key' }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body(), { ok: true, mode: 'key' })
    assert.equal(settings.value.runtimeMode, 'key')
  })

  it('runtime mode endpoint rejects an unknown choice', async () => {
    const settings = fakeSettings({})
    const handlers = register({ settings, credentials: fakeCredentials('') })
    const res = fakeRes()
    await handlers['/omnimux/runtime/mode'](fakeReq('PUT', { mode: 'nope' }), res)
    assert.equal(res.status, 400)
    assert.equal(settings.value.runtimeMode, undefined)
  })

  it('runtime mode endpoint refuses a cross-origin write', async () => {
    const handlers = register({ settings: fakeSettings({}), credentials: fakeCredentials('') })
    const res = fakeRes()
    await handlers['/omnimux/runtime/mode'](fakeReq('PUT', { mode: 'key' }, { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
  })
})
