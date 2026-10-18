import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Readable } from 'node:stream'
import { describeByokConfig, parseByokPut, registerByokRoutes, BYOK_KEY_REF } from './http.js'
import { parseSettingsSection } from '../settings/schema.js'

function fakeRes() {
  return { status: 0, text: '', writeHead(status) { this.status = status }, end(text) { this.text = text }, body() { return JSON.parse(this.text) } }
}
function fakeReq(method, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  stream.method = method
  stream.headers = headers
  return stream
}
function fakeSettings(initial = {}) {
  let value = parseSettingsSection(initial)
  let revision = 1
  const updates = []
  return {
    updates,
    get value() { return structuredClone(value) },
    get revision() { return revision },
    get: async () => structuredClone(value),
    describe: () => [{ ns: 'omnimux', revision, value: structuredClone(value) }],
    update: async (ns, patch, expectedRevision) => {
      assert.equal(ns, 'omnimux')
      assert.equal(expectedRevision, revision)
      updates.push(structuredClone(patch))
      value = parseSettingsSection(Object.assign({}, value, patch))
      revision += 1
    },
  }
}
function fakeCredentials(stored = '') {
  const tokens = new Map(stored ? [['OMNIMUX_MEDIA_KEY_OPENAI', stored]] : [])
  const writes = []
  const resolves = []
  return {
    writes, resolves,
    get value() { return tokens.get('OMNIMUX_MEDIA_KEY_OPENAI') || '' },
    describe: async (ref) => ({ configured: tokens.has(ref), source: 'file', writable: true }),
    set: async (ref, token) => { writes.push([ref, token]); tokens.set(ref, token) },
    unset: async (ref) => { writes.push([ref, '']); tokens.delete(ref) },
    resolve: async (ref) => { resolves.push(ref); return tokens.has(ref) ? { value: tokens.get(ref) } : undefined },
  }
}
function register(deps) {
  const handlers = new Map()
  registerByokRoutes({ register(route) { handlers.set(route.path, route.handler); return () => handlers.delete(route.path) } }, deps)
  return handlers
}
function savedRecord() {
  return { provider: 'openai', endpoint: 'https://p.test/v1', models: { image: 'm1' }, capabilities: ['image'], revision: 1, verified: true }
}
function storedSettings() {
  return fakeSettings({ runtimeMediaProvider: 'openai', runtimeKeyEndpoint: 'https://p.test/v1', runtimeKeyModel: 'text-model', runtimeKeyVerified: true, byokProviders: [savedRecord()] })
}
function saveBody(apiKey = 'sk-new') {
  return { provider: 'openai', endpoint: 'https://p.test/v1', models: { image: 'm1' }, apiKey, expectedRevision: 1, mediaImage: true }
}

describe('describeByokConfig', () => {
  it('reports state without ever carrying the key', () => {
    const view = describeByokConfig({ runtimeKeyEndpoint: 'https://p.test/v1', runtimeKeyModel: 'm1', runtimeKeyVerified: true, runtimeMediaImage: true }, true)
    assert.deepEqual(view, { endpoint: 'https://p.test/v1', model: 'm1', verified: true, mediaImage: true, mediaVideo: false, mediaAudio: false, hasKey: true })
    assert.ok(!('apiKey' in view))
  })
})

describe('parseByokPut', () => {
  it('rejects a bad endpoint', () => {
    assert.throws(() => parseByokPut({ provider: 'openai', endpoint: 'not-a-url', models: { image: 'm' } }), /http/)
    assert.throws(() => parseByokPut({ provider: 'openai', endpoint: '', models: { image: 'm' } }), /http/)
    assert.throws(() => parseByokPut({ provider: 'openai', endpoint: 'https://user:secret@p.test/v1', models: { image: 'm' } }), /http/)
  })
  it('rejects an empty model', () => {
    assert.throws(() => parseByokPut({ provider: 'openai', endpoint: 'https://p.test/v1', models: { image: ' ' } }), /模型/)
  })
  it('strips a trailing slash and marks the pass stale without assigning a media model to text', () => {
    const parsed = parseByokPut({ provider: 'openai', endpoint: 'https://p.test/v1/', model: 'm1', apiKey: 'sk-x', mediaImage: true })
    assert.equal(parsed.patch.runtimeKeyEndpoint, 'https://p.test/v1')
    assert.equal(parsed.patch.runtimeKeyVerified, false)
    assert.equal(parsed.patch.runtimeMediaImage, true)
    assert.equal(parsed.patch.runtimeKeyModel, undefined)
    assert.deepEqual(parsed.models, { image: 'm1' })
    assert.equal(parsed.apiKey, 'sk-x')
  })
})

describe('byok routes', () => {
  it('analysis confirmation changes only its binding and checks the settings revision', async () => {
    const settings = fakeSettings({ scenarioBindings: { text: { channel: 'agent' }, analysis: { channel: 'pending' },
      image: { channel: 'byok', provider: 'openai' }, video: { channel: 'official' }, audio: { channel: 'pending' } },
      toolModel: 'provider:some-image-model' })
    const before = settings.value
    const handlers = register({ settings, getConnection: () => ({ requestRejection() {} }) })
    const read = fakeRes()
    await handlers.get('/omnimux/analysis/service')(fakeReq('GET'), read)
    assert.deepEqual(read.body(), { revision: 1, channel: 'pending', configured: false,
      reason: '请确认此用途的模型服务', imageToolConfigured: true })
    const confirmed = fakeRes()
    await handlers.get('/omnimux/analysis/service')(fakeReq('PUT', { expectedRevision: 1, channel: 'official' }), confirmed)
    assert.equal(confirmed.status, 200)
    assert.equal(confirmed.body().channel, 'official')
    assert.equal(confirmed.body().revision, 2)
    assert.deepEqual(settings.value, { ...before, scenarioBindings: { ...before.scenarioBindings, analysis: { channel: 'official' } } })
    assert.deepEqual(Object.keys(settings.updates[0]), ['scenarioBindings'])
    const stale = fakeRes()
    await handlers.get('/omnimux/analysis/service')(fakeReq('PUT', { expectedRevision: 1, channel: 'official' }), stale)
    assert.equal(stale.status, 409)
    assert.equal(settings.updates.length, 1)
  })
  it('analysis writes reject malicious origins and unavailable Host authorization', async () => {
    for (const [headers, connection, expected] of [
      [{ host: '127.0.0.1:8080', origin: 'https://evil.example' }, { requestRejection() {} }, 403],
      [{}, undefined, 503],
    ]) {
      const settings = fakeSettings()
      const handlers = register({ settings, getConnection: () => connection })
      const res = fakeRes()
      await handlers.get('/omnimux/analysis/service')(fakeReq('PUT', { expectedRevision: 1, channel: 'official' }, headers), res)
      assert.equal(res.status, expected)
      assert.deepEqual(settings.updates, [])
    }
  })
  it('analysis reads honor raw legacy choices instead of schema defaults', async () => {
    const value = parseSettingsSection({ toolModel: 'auto' })
    const handlers = register({ settings: { describe: () => [{ ns: 'omnimux', revision: 2, value,
      user: { runtimeMode: 'key' } }], get: async () => value } })
    const res = fakeRes()
    await handlers.get('/omnimux/analysis/service')(fakeReq('GET'), res)
    assert.equal(res.body().channel, 'pending')
    assert.equal(res.body().imageToolConfigured, false)
  })
  it('GET reports config and provider credential metadata without trusting a legacy verification flag', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('sk-stored')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers.get('/omnimux/byok/config')(fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().hasKey, true)
    assert.equal(res.body().configured, true)
    assert.equal(res.body().source, 'file')
    assert.equal(res.body().verified, false)
    assert.ok(!('apiKey' in res.body()))
    assert.deepEqual(credentials.resolves, [])
  })
  it('PUT stores only the provider key and resets the pass', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers.get('/omnimux/byok/config')(fakeReq('PUT', saveBody()), res)
    assert.equal(res.status, 200)
    assert.deepEqual(credentials.writes, [['OMNIMUX_MEDIA_KEY_OPENAI', 'sk-new']])
    assert.equal(credentials.writes.some((entry) => entry[0] === BYOK_KEY_REF), false)
    assert.equal(settings.value.runtimeKeyEndpoint, 'https://p.test/v1')
    assert.equal(settings.value.runtimeKeyVerified, false)
    assert.equal(settings.value.runtimeKeyModel, 'text-model')
    assert.equal(res.body().hasKey, true)
    assert.equal(res.body().saved, true)
  })
  it('PUT without a key keeps the same-provider same-origin stored one', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('sk-old')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers.get('/omnimux/byok/config')(fakeReq('PUT', saveBody('')), res)
    assert.equal(res.status, 200)
    assert.deepEqual(credentials.writes, [])
    assert.equal(credentials.value, 'sk-old')
    assert.equal(res.body().hasKey, true)
  })
  it('PUT refuses a cross-origin write', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials()
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers.get('/omnimux/byok/config')(fakeReq('PUT', saveBody(), { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
    assert.deepEqual(settings.updates, [])
    assert.deepEqual(credentials.writes, [])
  })
  it('test checks stored provider metadata without networking, resolving the key or persisting verification', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('sk-stored')
    const calls = []
    const handlers = register({ settings, credentials, fetcher: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 } } })
    const before = settings.value
    const res = fakeRes()
    await handlers.get('/omnimux/byok/test')(fakeReq('POST', {}), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().checkType, 'offline-config')
    assert.equal(res.body().verified, false)
    assert.equal(res.body().connectionVerified, false)
    assert.deepEqual(settings.value, before)
    assert.deepEqual(settings.updates, [])
    assert.deepEqual(credentials.resolves, [])
    assert.equal(calls.length, 0)
  })
  it('test reports invalid configuration failure without upstream requests or clearing saved state', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('sk-stored')
    const calls = []
    const handlers = register({ settings, credentials, fetcher: async () => { calls.push('http'); return { ok: false, status: 401 } } })
    const before = settings.value
    const res = fakeRes()
    await handlers.get('/omnimux/byok/test')(fakeReq('POST', { endpoint: 'not-a-url' }), res)
    assert.equal(res.status, 400)
    assert.equal(res.body().ok, false)
    assert.match(res.body().error, /http/)
    assert.deepEqual(settings.value, before)
    assert.deepEqual(settings.updates, [])
    assert.deepEqual(credentials.writes, [])
    assert.deepEqual(calls, [])
  })
  it('test with a caller-provided draft key never persists it or marks a connection verified', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('')
    const calls = []
    const handlers = register({ settings, credentials, fetcher: async () => { calls.push('http'); return { ok: true, status: 200 } } })
    const before = settings.value
    const res = fakeRes()
    await handlers.get('/omnimux/byok/test')(fakeReq('POST', { apiKey: 'sk-fresh' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().credentialSource, 'draft')
    assert.equal(res.body().configured, true)
    assert.equal(res.body().persisted, false)
    assert.equal(res.body().verified, false)
    assert.deepEqual(settings.value, before)
    assert.deepEqual(settings.updates, [])
    assert.deepEqual(credentials.writes, [])
    assert.deepEqual(credentials.resolves, [])
    assert.deepEqual(calls, [])
  })
  it('answers OPTIONS preflight with 204 on every route', async () => {
    const handlers = register({ settings: fakeSettings(), credentials: fakeCredentials() })
    for (const path of ['/omnimux/byok/config', '/omnimux/byok/test', '/omnimux/runtime/mode']) {
      const res = fakeRes()
      await handlers.get(path)(fakeReq('OPTIONS'), res)
      assert.equal(res.status, 204, `${path} must answer preflight`)
    }
  })
  it('DELETE clears only the targeted provider config and key', async () => {
    const settings = storedSettings()
    const credentials = fakeCredentials('sk-stored')
    const handlers = register({ settings, credentials })
    const res = fakeRes()
    await handlers.get('/omnimux/byok/config')(fakeReq('DELETE', { provider: 'openai', expectedRevision: 1 }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().hasKey, false)
    assert.deepEqual(res.body().providers, [])
    assert.equal(credentials.value, '')
    assert.deepEqual(credentials.writes, [['OMNIMUX_MEDIA_KEY_OPENAI', '']])
    assert.equal(settings.value.runtimeKeyVerified, false)
    assert.equal(settings.value.runtimeMediaImage, false)
    assert.equal(settings.value.runtimeMediaVideo, false)
    assert.equal(settings.value.runtimeMediaAudio, false)
  })
  it('runtime mode endpoint writes a valid choice', async () => {
    const settings = fakeSettings()
    const handlers = register({ settings, credentials: fakeCredentials() })
    const res = fakeRes()
    await handlers.get('/omnimux/runtime/mode')(fakeReq('PUT', { mode: 'key' }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body(), { ok: true, mode: 'key' })
    assert.equal(settings.value.runtimeMode, 'key')
    assert.equal(settings.revision, 2)
  })
  it('runtime mode endpoint rejects an unknown choice', async () => {
    const settings = fakeSettings()
    const handlers = register({ settings, credentials: fakeCredentials() })
    const res = fakeRes()
    await handlers.get('/omnimux/runtime/mode')(fakeReq('PUT', { mode: 'nope' }), res)
    assert.equal(res.status, 400)
    assert.equal(settings.value.runtimeMode, '')
    assert.deepEqual(settings.updates, [])
  })
  it('runtime mode endpoint refuses a cross-origin write', async () => {
    const settings = fakeSettings()
    const handlers = register({ settings, credentials: fakeCredentials() })
    const res = fakeRes()
    await handlers.get('/omnimux/runtime/mode')(fakeReq('PUT', { mode: 'key' }, { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
    assert.deepEqual(settings.updates, [])
  })
})
