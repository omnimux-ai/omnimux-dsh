import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAccountModelKeyService, accountModelKeyRef } from './model-key.js'
import { createAuthDispatcher, registerAuthRoutes } from './http-routes.js'
import { Readable } from 'node:stream'

const key = `sk-${'a'.repeat(48)}`
const row = { id: 4, name: 'My analysis key', status: 1, expired_time: -1, remain_quota: 20, unlimited_quota: false }

function fixture(options = {}) {
  const values = new Map()
  const calls = []
  const writes = []
  let account = { id: 7, token: 'synthetic-login-only' }
  let active = 0, maxActive = 0
  const credentials = {
    async resolve(ref) { if (options.readError) throw new Error(key); return values.has(ref) ? { value: values.get(ref) } : undefined },
    async set(ref, value) { writes.push(ref); if (options.saveError) throw new Error(key); if (!options.dropSave) values.set(ref, value) },
  }
  const identity = { async status() { return { logged_in: Boolean(account), id: account?.id, base_url: 'https://omnimux.ai' } } }
  const store = { async resolve() { return account?.token } }
  const service = createAccountModelKeyService({
    store, identity, credentials, siteBaseUrl: 'https://omnimux.ai', env: {},
    async fetcher(url, init) {
      calls.push({ path: new URL(url).pathname, method: init.method, authorization: init.headers.authorization })
      assert.equal(init.headers.authorization, `Bearer ${account.token}`)
      assert.equal(init.headers['New-Api-User'], String(account.id))
      active += 1; maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active -= 1
      if (options.status) return { status: options.status, ok: false, json: async () => ({ success: false, message: key }) }
      const path = new URL(url).pathname
      const data = path.endsWith('/key') ? { key: options.prefixed ? key : key.slice(3) }
        : path === '/api/token/' ? { items: [{ ...row, key, token: account.token, ...options.row }], total: 1 }
          : { ...row, ...options.row }
      if (path.endsWith('/key') && options.switchOnReveal) account = { id: 8, token: 'different-login-only' }
      return { status: 200, ok: true, json: async () => ({ success: true, data }) }
    },
  })
  return { service, credentials, store, identity, values, calls, writes, get maxActive() { return maxActive },
    switchAccount(next) { account = next } }
}

test('account key listing projects only public metadata and never enables a key', async () => {
  const h = fixture({ row: { name: key } })
  const view = await h.service.list()
  assert.deepEqual(Object.keys(view.items[0]).sort(), ['id', 'name', 'status', 'expired_time', 'remain_quota', 'unlimited_quota'].sort())
  assert.equal(view.configured, false)
  assert.equal(view.createUrl, 'https://omnimux.ai/keys/')
  assert.equal(JSON.stringify(view).includes(key), false)
  assert.deepEqual(h.writes, [])
  assert.deepEqual(h.calls.map((call) => call.method), ['GET'])
})

test('explicit existing key selection saves an account-bound secret and returns no secret', async () => {
  for (const prefixed of [false, true]) {
    const h = fixture({ prefixed })
    const selected = await h.service.select(4)
    assert.deepEqual(selected, { configured: true, source: 'account', selectedId: 4 })
    assert.equal(await h.service.resolve(), key)
    assert.deepEqual(h.writes, [accountModelKeyRef('https://omnimux.ai', 7)])
    assert.equal(JSON.stringify(selected).includes(key), false)
    assert.deepEqual(h.calls.map((call) => [call.method, call.path]), [['GET', '/api/token/4'], ['POST', '/api/token/4/key']])
    assert.equal((await h.service.list()).selectedId, 4)
  }
})

test('normal analysis never creates or reveals credentials and explicit configuration retains priority', async () => {
  const h = fixture()
  await assert.rejects(() => h.service.resolve(), (error) => error.code === 'official-credential-required')
  assert.deepEqual(h.calls, [])
  h.values.set('OMNIMUX_API_KEY', 'explicit-user-key')
  h.switchAccount(null)
  assert.equal(await h.service.resolve(), 'explicit-user-key')
  assert.equal(await h.service.resolve({ env: { OMNIMUX_TOKEN: 'environment-key' } }), 'environment-key')
  assert.deepEqual(h.writes, [])
})

test('logout and account changes cannot reuse an earlier account key', async () => {
  const h = fixture()
  await h.service.select(4)
  h.switchAccount(null)
  await assert.rejects(() => h.service.resolve(), (error) => error.code === 'needs-omnimux')
  h.switchAccount({ id: 8, token: 'different-login-only' })
  await assert.rejects(() => h.service.resolve(), (error) => error.code === 'official-credential-required')
  assert.notEqual(accountModelKeyRef('https://omnimux.ai', 7), accountModelKeyRef('https://other.example', 7))
})

test('switching account during reveal fails before storing or using the result', async () => {
  const h = fixture({ switchOnReveal: true })
  await assert.rejects(() => h.service.select(4), (error) => error.code === 'official-account-changed')
  assert.deepEqual(h.writes, [])
})

test('an account switch while reading a saved key cannot return the previous secret', async () => {
  const h = fixture()
  await h.service.select(4)
  const original = h.credentials.resolve
  h.credentials.resolve = async (ref) => {
    const hit = await original(ref)
    if (ref === accountModelKeyRef('https://omnimux.ai', 7)) h.switchAccount({ id: 8, token: 'new-login-only' })
    return hit
  }
  await assert.rejects(() => h.service.resolve(), (error) => error.code === 'official-account-changed')
})

test('failed identity verification is an availability error instead of missing credentials', async () => {
  const h = fixture()
  h.identity.load = async ({ verify }) => {
    assert.equal(verify, true)
    return { kind: 'self_failed', body: { logged_in: false } }
  }
  await assert.rejects(() => h.service.resolve(), (error) => error.code === 'official-identity-unavailable' && error.status === 502)
  assert.deepEqual(h.calls, [])
})

test('credential read/save failures remain distinct from a missing key and reveal no secret', async () => {
  for (const [options, code] of [[{ readError: true }, 'official-credential-unavailable'], [{ saveError: true }, 'official-credential-save-failed']]) {
    const h = fixture(options)
    await assert.rejects(() => options.readError ? h.service.resolve() : h.service.select(4), (error) => error.code === code && !JSON.stringify(error).includes(key) && !error.message.includes(key))
  }
  const h = fixture({ dropSave: true })
  await assert.rejects(() => h.service.select(4), (error) => error.code === 'official-credential-save-failed')
})

test('concurrent explicit selections serialize without creating keys', async () => {
  const h = fixture()
  await Promise.all([h.service.select(4), h.service.select(4)])
  assert.equal(h.maxActive, 1)
  assert.equal(h.calls.filter((call) => call.method === 'POST' && call.path === '/api/token/').length, 0)
})

test('invalid, disabled, expired and exhausted keys do not reveal or save', async () => {
  const invalid = fixture()
  await assert.rejects(() => invalid.service.select('4'), (error) => error.status === 400)
  assert.deepEqual(invalid.calls, [])
  for (const invalidRow of [{ status: 2 }, { expired_time: 0 }, { remain_quota: 0 }]) {
    const h = fixture({ row: invalidRow })
    await assert.rejects(() => h.service.select(4), (error) => error.code === 'official-key-unavailable')
    assert.equal(h.calls.length, 1)
    assert.deepEqual(h.writes, [])
  }
})

test('account 401/403 preserve authorization failures without exposing upstream secrets', async () => {
  for (const status of [401, 403]) {
    const h = fixture({ status })
    await assert.rejects(() => h.service.list(), (error) => error.code === 'needs-omnimux' && error.status === status && !error.message.includes(key))
  }
})

test('auth routes return only safe selection state and require Host admission', async () => {
  const h = fixture()
  const dispatcher = createAuthDispatcher({ store: h.store, identity: h.identity, modelKeys: h.service, siteBaseUrl: 'https://omnimux.ai' })
  const result = await dispatcher.dispatch({ method: 'POST', url: '/omnimux/auth/model-key', body: { id: 4 } })
  assert.equal(result.status, 200)
  assert.equal(JSON.stringify(result.body).includes(key), false)
  for (const [headers, connection, expected] of [[{ host: '127.0.0.1:8080', origin: 'https://evil.example' }, { requestRejection() {} }, 403], [{}, undefined, 503]]) {
    const handlers = new Map()
    registerAuthRoutes({ register(route) { handlers.set(route.path, route.handler); return () => {} } }, dispatcher, { getConnection: () => connection })
    const req = Readable.from([Buffer.from('{"id":4}')])
    Object.assign(req, { method: 'POST', headers, url: '/omnimux/auth/model-key' })
    const res = { writeHead(status) { this.status = status }, end() {} }
    await handlers.get('/omnimux/auth/model-key')(req, res)
    assert.equal(res.status, expected)
  }
})
