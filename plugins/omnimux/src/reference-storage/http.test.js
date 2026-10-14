import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { registerReferenceStorageRoutes } from './http.js'

function setup() {
  const routes = new Map()
  let config = { enabled: false }
  let revision = 1
  const secrets = new Map()
  const credentials = {
    async describe(ref) { return { configured: secrets.has(ref), writable: true } },
    async resolve(ref) { return secrets.has(ref) ? { value: secrets.get(ref) } : undefined },
    async set(ref, value) { secrets.set(ref, value) },
    async unset(ref) { secrets.delete(ref) },
  }
  const settings = {
    get() { return { referenceStorage: config } },
    describe() { return [{ namespace: 'omnimux', revision }] },
    async update(ns, patch, expected) { assert.equal(expected, revision); config = patch.referenceStorage; revision++ },
  }
  registerReferenceStorageRoutes({ register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, {
    getConnection: () => ({ requestRejection: req => req.headers.authorization === 'test-session' ? undefined : 401 }),
    getSettings: () => settings, getCredentials: () => credentials,
  })
  async function invoke(method, body, origin = 'http://localhost:44321', authorized = true) {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
    req.method = method
    req.socket = { encrypted: false }
    req.headers = { host: 'localhost:44321', origin, authorization: authorized ? 'test-session' : '' }
    const headers = new Map()
    const res = { statusCode: 0, setHeader(key, value) { headers.set(key.toLowerCase(), value) }, writeHead(status) { this.statusCode = status }, end(text) { this.body = JSON.parse(text) } }
    await routes.get('/omnimux/reference-storage/config')(req, res)
    return { status: res.statusCode, body: res.body, headers }
  }
  return { invoke, secrets }
}
test('config read rejects unauthenticated and same-host different-port before access', async () => {
  const s = setup()
  assert.equal((await s.invoke('GET', undefined, 'http://localhost:44321', false)).status, 401)
  assert.equal((await s.invoke('GET', undefined, 'http://localhost:44322')).status, 403)
  const read = await s.invoke('GET')
  assert.equal(read.status, 200)
  assert.equal(read.body.config.enabled, false)
  assert.equal(read.headers.get('cache-control'), 'private, no-store')
})
test('single save stores credential values only in credential provider and returns status', async () => {
  const s = setup()
  const result = await s.invoke('PUT', { enabled: true, endpoint: 'https://storage.example.test', bucket: 'reference-media', region: 'auto', publicBaseUrl: 'https://media.example.test', accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', expectedRevision: 1 })
  assert.equal(result.status, 200)
  assert.equal(result.body.hasCredentials, true)
  assert.equal(JSON.stringify(result.body).includes('synthetic'), false)
  assert.equal(s.secrets.size, 2)
  const stale = await s.invoke('PUT', { enabled: false, expectedRevision: 1 })
  assert.equal(stale.status, 409)
})
test('invalid requests do not expose sensitive payload or write credentials', async () => {
  const s = setup()
  const result = await s.invoke('PUT', { enabled: true, endpoint: 'https://user:synthetic-secret@storage.example.test', bucket: 'reference-media', publicBaseUrl: 'https://media.example.test', accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', expectedRevision: 1 })
  assert.equal(result.status, 400)
  assert.equal(JSON.stringify(result.body).includes('synthetic'), false)
  assert.equal(s.secrets.size, 0)
  assert.equal((await s.invoke('POST', {})).status, 405)
})
