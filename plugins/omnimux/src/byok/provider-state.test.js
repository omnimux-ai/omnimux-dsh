import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Readable } from 'node:stream'
import { registerByokRoutes } from './http.js'
import { parseSettingsSection } from '../settings/schema.js'

function settingsDouble(initial = {}) {
  let value = parseSettingsSection(initial)
  let revision = 1
  const updates = []
  const service = {
    updates, beforeUpdate: null, afterUpdate: null,
    get value() { return structuredClone(value) },
    get revision() { return revision },
    describe() { return [{ ns: 'omnimux', revision, value: structuredClone(value) }] },
    async get(ns) { assert.equal(ns, 'omnimux'); return structuredClone(value) },
    async update(ns, patch, expectedRevision) {
      assert.equal(ns, 'omnimux')
      if (expectedRevision !== revision) throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' })
      updates.push(structuredClone(patch))
      if (service.beforeUpdate) await service.beforeUpdate(patch, updates.length)
      if (expectedRevision !== revision) throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' })
      value = parseSettingsSection(Object.assign({}, value, patch))
      revision += 1
      if (service.afterUpdate) await service.afterUpdate(patch, updates.length)
    },
    external(patch) { value = parseSettingsSection(Object.assign({}, value, patch)); revision += 1 },
  }
  return service
}

function credentialsDouble(entries = []) {
  const tokens = new Map(entries)
  let listener = null
  const service = {
    writes: [], resolves: [], describes: [], beforeDescribe: null, readOnly: false,
    async describe(ref) {
      service.describes.push(ref)
      if (service.beforeDescribe) await service.beforeDescribe(ref)
      return { configured: tokens.has(ref), source: service.readOnly ? 'env' : 'file', writable: !service.readOnly }
    },
    async resolve(ref) { service.resolves.push(ref); return tokens.has(ref) ? { value: tokens.get(ref) } : undefined },
    async set(ref, token) { service.writes.push(['set', ref, token]); tokens.set(ref, token); if (listener) listener(ref) },
    async unset(ref) { service.writes.push(['unset', ref]); tokens.delete(ref); if (listener) listener(ref) },
    peek(ref) { return tokens.get(ref) },
    external(ref, token) { tokens.set(ref, token); if (listener) listener(ref) },
    subscribe(callback) { listener = callback; return () => { listener = null } },
  }
  return service
}

function routesDouble(settings, credentials) {
  const handlers = new Map()
  const network = []
  registerByokRoutes({ register(route) { handlers.set(route.path, route.handler); return () => handlers.delete(route.path) } }, {
    settings, credentials,
    onCredentialUpdated: (callback) => credentials.subscribe(callback),
    fetcher: async (url) => { network.push(url); return { ok: true, status: 200 } },
  })
  return {
    network,
    async request(path, method = 'GET', body) {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
      req.method = method
      req.headers = {}
      const res = { status: 0, text: '', writeHead(status) { this.status = status }, end(text) { this.text = text } }
      await handlers.get(path)(req, res)
      return { status: res.status, body: JSON.parse(res.text) }
    },
  }
}

function record(provider = 'openai', endpoint = 'https://p.test/v1') {
  return { provider, endpoint, models: { image: 'image-one' }, capabilities: ['image'], revision: 4, verified: true }
}
function draft(revision = 1) {
  return { provider: 'openai', endpoint: 'https://p.test/v1/', model: 'image-two', mediaImage: true, models: { image: 'image-two' }, apiKey: 'synthetic-new', expectedRevision: revision }
}
const CONFIG = '/omnimux/byok/config'
const CHECK = '/omnimux/byok/test'
const OPENAI_REF = 'OMNIMUX_MEDIA_KEY_OPENAI'
const FAL_REF = 'OMNIMUX_MEDIA_KEY_FAL'

it('draft configuration check is offline and never persists or resolves credential bytes', async () => {
  const settings = settingsDouble({ runtimeMode: 'official' })
  const credentials = credentialsDouble()
  const routes = routesDouble(settings, credentials)
  const before = settings.value
  const response = await routes.request(CHECK, 'POST', draft())
  assert.equal(response.status, 200)
  assert.equal(response.body.checkType, 'offline-config')
  assert.equal(response.body.persisted, false)
  assert.equal(response.body.verified, false)
  assert.equal(response.body.connectionVerified, false)
  assert.equal(response.body.ready, false)
  assert.equal(response.body.credentialSource, 'draft')
  assert.deepEqual(response.body.identity.models, { image: 'image-two' })
  assert.equal(response.body.capabilities[0].supported, false)
  assert.deepEqual(settings.value, before)
  assert.equal(settings.revision, 1)
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
  assert.deepEqual(credentials.resolves, [])
  assert.deepEqual(routes.network, [])
})

it('save confirms normalized schema readback while preserving other keys, text model and bindings', async () => {
  const settings = settingsDouble({ runtimeMode: 'official', runtimeKeyModel: 'text-original', byokProviders: [record('fal', 'https://fal.test')], scenarioBindings: { text: { channel: 'official' }, video: { channel: 'byok', provider: 'fal' } } })
  const credentials = credentialsDouble([[FAL_REF, 'synthetic-fal'], ['OMNIMUX_BYOK_API_KEY', 'synthetic-legacy']])
  const routes = routesDouble(settings, credentials)
  const response = await routes.request(CONFIG, 'PUT', draft())
  assert.equal(response.status, 200)
  assert.equal(response.body.saved, true)
  assert.equal(response.body.revision, 3)
  assert.deepEqual(credentials.writes, [['set', OPENAI_REF, 'synthetic-new']])
  assert.equal(credentials.peek(FAL_REF), 'synthetic-fal')
  assert.equal(credentials.peek('OMNIMUX_BYOK_API_KEY'), 'synthetic-legacy')
  assert.equal(settings.value.runtimeMode, 'official')
  assert.equal(settings.value.runtimeKeyModel, 'text-original')
  assert.deepEqual(settings.value.scenarioBindings.video, { channel: 'byok', provider: 'fal' })
  const saved = response.body.providers.find((row) => row.provider === 'openai')
  assert.equal(saved.endpoint, 'https://p.test/v1')
  assert.deepEqual(saved.models, { image: 'image-two' })
  assert.equal(saved.verified, false)
  assert.equal(saved.saveState, undefined)
  assert.equal(settings.value.byokProviders.find((row) => row.provider === 'openai').saveState, undefined)
  assert.equal(Object.hasOwn(settings.value.byokProviders[1], 'apiKey'), false)
  assert.deepEqual(routes.network, [])
})

it('missing and stale revisions reject before any credential or metadata write', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  const routes = routesDouble(settings, credentials)
  assert.equal((await routes.request(CONFIG, 'PUT', Object.assign(draft(), { expectedRevision: undefined }))).status, 400)
  assert.equal((await routes.request(CONFIG, 'PUT', draft(0))).status, 409)
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
  assert.deepEqual(credentials.describes, [])
})

it('partial metadata failure keeps pending identity and origin recovery requires a new key', async () => {
  const settings = settingsDouble({ byokProviders: [record()] })
  const credentials = credentialsDouble([[OPENAI_REF, 'synthetic-old']])
  const routes = routesDouble(settings, credentials)
  settings.beforeUpdate = async (patch, count) => { if (count === 2) throw new Error('metadata transport failure') }
  const failed = await routes.request(CONFIG, 'PUT', Object.assign(draft(), { endpoint: 'https://new-origin.test/v1' }))
  assert.equal(failed.status, 503)
  assert.equal(failed.body.partial, true)
  assert.equal(failed.body.stage, 'metadata')
  assert.equal(failed.body.credential, 'confirmed')
  const pending = (await routes.request(CONFIG)).body.providers[0]
  assert.equal(pending.saveState, 'pending')
  assert.equal(pending.endpoint, 'https://p.test/v1')
  assert.equal(pending.verified, false)
  const retry = Object.assign(draft(settings.revision), { endpoint: 'https://new-origin.test/v1', apiKey: '' })
  const priorWrites = settings.updates.length
  assert.equal((await routes.request(CONFIG, 'PUT', retry)).status, 409)
  assert.equal(settings.updates.length, priorWrites)
  assert.equal(credentials.writes.length, 1)
  settings.beforeUpdate = null
  retry.apiKey = 'synthetic-recovery'
  const recovered = await routes.request(CONFIG, 'PUT', retry)
  assert.equal(recovered.status, 200)
  assert.equal(recovered.body.providers[0].endpoint, 'https://new-origin.test/v1')
  assert.equal(recovered.body.providers[0].saveState, undefined)
  assert.equal(credentials.peek(OPENAI_REF), 'synthetic-recovery')
})

it('a changed origin cannot reuse stored credentials after a complete save', async () => {
  const settings = settingsDouble({ byokProviders: [record()] })
  const credentials = credentialsDouble([[OPENAI_REF, 'synthetic-old']])
  const routes = routesDouble(settings, credentials)
  const request = Object.assign(draft(), { endpoint: 'https://other.test/v1', apiKey: '' })
  assert.equal((await routes.request(CONFIG, 'PUT', request)).status, 409)
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
})

it('targeted deletion preserves unrelated credentials and pends only its own bound scenarios', async () => {
  const settings = settingsDouble({ runtimeMediaProvider: 'openai', byokProviders: [record(), record('fal', 'https://fal.test')], scenarioBindings: { text: { channel: 'official' }, image: { channel: 'byok', provider: 'openai' }, video: { channel: 'byok', provider: 'fal' } } })
  const credentials = credentialsDouble([[OPENAI_REF, 'synthetic-openai'], [FAL_REF, 'synthetic-fal'], ['OMNIMUX_BYOK_API_KEY', 'synthetic-legacy']])
  const response = await routesDouble(settings, credentials).request(CONFIG, 'DELETE', { provider: 'openai', expectedRevision: 1 })
  assert.equal(response.status, 200)
  assert.deepEqual(credentials.writes, [['unset', OPENAI_REF]])
  assert.equal(credentials.peek(OPENAI_REF), undefined)
  assert.equal(credentials.peek(FAL_REF), 'synthetic-fal')
  assert.equal(credentials.peek('OMNIMUX_BYOK_API_KEY'), 'synthetic-legacy')
  assert.deepEqual(response.body.providers.map((row) => row.provider), ['fal'])
  assert.deepEqual(response.body.bindings.image, { channel: 'pending' })
  assert.deepEqual(response.body.bindings.video, { channel: 'byok', provider: 'fal' })
  assert.equal(settings.value.runtimeMediaImage, false)
})

it('credential reference events change public check version without exposing key bytes', async () => {
  const settings = settingsDouble({ byokProviders: [record()] })
  const credentials = credentialsDouble([[OPENAI_REF, 'synthetic-first']])
  const routes = routesDouble(settings, credentials)
  const request = Object.assign(draft(), { apiKey: '' })
  const first = await routes.request(CHECK, 'POST', request)
  credentials.external(OPENAI_REF, 'synthetic-second')
  const second = await routes.request(CHECK, 'POST', request)
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(first.body.credentialVersion, 0)
  assert.equal(second.body.credentialVersion, 1)
  assert.equal(second.body.revision, first.body.revision)
  assert.equal(JSON.stringify(second.body).includes('synthetic-second'), false)
  assert.deepEqual(credentials.resolves, [])
  assert.deepEqual(settings.updates, [])
})

it('late check rejects revision changes without overwriting newer settings', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  credentials.beforeDescribe = async () => { settings.external({ runtimeKeyModel: 'newer-text' }) }
  const routes = routesDouble(settings, credentials)
  const response = await routes.request(CHECK, 'POST', draft())
  assert.equal(response.status, 409)
  assert.equal(settings.value.runtimeKeyModel, 'newer-text')
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
  assert.deepEqual(routes.network, [])
})

it('late check rejects credential events without any persistence', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  credentials.beforeDescribe = async () => { credentials.external(OPENAI_REF, 'synthetic-rotated') }
  const response = await routesDouble(settings, credentials).request(CHECK, 'POST', draft())
  assert.equal(response.status, 409)
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
})

it('concurrent saves sharing a revision permit one commit and reject the competitor', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  const routes = routesDouble(settings, credentials)
  const responses = await Promise.all([routes.request(CONFIG, 'PUT', draft()), routes.request(CONFIG, 'PUT', Object.assign(draft(), { apiKey: 'synthetic-competing' }))])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
  assert.equal(settings.updates.length, 2)
  assert.equal(credentials.writes.length, 1)
  assert.equal(credentials.peek(OPENAI_REF), 'synthetic-new')
})

it('lost post-commit responses are confirmed by exact normalized readback', async () => {
  const settings = settingsDouble()
  settings.afterUpdate = async () => { throw new Error('response lost after commit') }
  const credentials = credentialsDouble()
  const response = await routesDouble(settings, credentials).request(CONFIG, 'PUT', draft())
  assert.equal(response.status, 200)
  assert.equal(response.body.saved, true)
  assert.equal(response.body.revision, 3)
  assert.equal(response.body.providers[0].endpoint, 'https://p.test/v1')
  assert.equal(response.body.providers[0].saveState, undefined)
})

it('mismatched final metadata readback never reports a successful save', async () => {
  const settings = settingsDouble()
  settings.afterUpdate = async (patch, count) => { if (count === 2) settings.external({ byokProviders: [] }) }
  const credentials = credentialsDouble()
  const response = await routesDouble(settings, credentials).request(CONFIG, 'PUT', draft())
  assert.equal(response.status, 503)
  assert.equal(response.body.partial, true)
  assert.equal(response.body.stage, 'metadata')
  assert.equal(response.body.needsConfirmation, true)
})

it('credential rotation during metadata readback invalidates the save result', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  settings.afterUpdate = async (patch, count) => { if (count === 2) credentials.external(OPENAI_REF, 'synthetic-external') }
  const response = await routesDouble(settings, credentials).request(CONFIG, 'PUT', draft())
  assert.equal(response.status, 409)
  assert.equal(response.body.partial, true)
  assert.equal(response.body.stage, 'readback')
  assert.equal(response.body.saved, undefined)
})

it('credential rotation during final public config readback must invalidate the save receipt', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  credentials.beforeDescribe = async () => {
    if (credentials.describes.length === 2) credentials.external(OPENAI_REF, 'synthetic-final-rotation')
  }
  const response = await routesDouble(settings, credentials).request(CONFIG, 'PUT', draft())
  assert.equal(response.status, 409)
  assert.equal(response.body.partial, true)
  assert.equal(response.body.stage, 'readback')
  assert.equal(response.body.saved, undefined)
})

it('read-only sources reject replacement and deletion before metadata writes', async () => {
  const settings = settingsDouble({ byokProviders: [record()] })
  const credentials = credentialsDouble([[OPENAI_REF, 'synthetic-env']])
  credentials.readOnly = true
  const routes = routesDouble(settings, credentials)
  assert.equal((await routes.request(CONFIG, 'PUT', draft())).status, 409)
  assert.equal((await routes.request(CONFIG, 'DELETE', { provider: 'openai', expectedRevision: 1 })).status, 409)
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
})

it('invalid purpose bindings and duplicate provider identities reject without persistence', async () => {
  const settings = settingsDouble()
  const credentials = credentialsDouble()
  const routes = routesDouble(settings, credentials)
  const invalid = Object.assign(draft(), { scenarioBindings: { text: { channel: 'byok', provider: 'openai' } } })
  assert.equal((await routes.request(CONFIG, 'PUT', invalid)).status, 400)
  assert.deepEqual(settings.updates, [])
  assert.deepEqual(credentials.writes, [])
  const duplicated = settingsDouble({ byokProviders: [record(), record()] })
  assert.equal((await routesDouble(duplicated, credentials).request(CONFIG, 'PUT', draft())).status, 409)
  assert.deepEqual(duplicated.updates, [])
  assert.deepEqual(credentials.writes, [])
})
