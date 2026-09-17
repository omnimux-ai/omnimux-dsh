import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { SESSION_MODEL_ROUTE, registerSessionModelRoutes } from './http.js'
import { createSessionModelPreference } from './model-preference.js'

/** Capture the registered route so the test can drive its handler directly. */
function fixture() {
  let route = null
  const webServer = { register: (definition) => { route = definition; return () => { route = null } } }
  const preference = createSessionModelPreference()
  registerSessionModelRoutes(webServer, { preference })
  return { route, preference }
}

function response() {
  const res = {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(text) { this.body = text },
  }
  res.json = () => JSON.parse(res.body)
  return res
}

/** `readJsonBody` consumes an async iterable, so a Readable stands in for req. */
function post(body, url = SESSION_MODEL_ROUTE) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  stream.method = 'POST'
  stream.url = url
  return stream
}

const get = (url) => ({ method: 'GET', url })

const emptyReq = () => {
  const stream = Readable.from([])
  stream.method = 'POST'
  stream.url = SESSION_MODEL_ROUTE
  return stream
}

describe('session model HTTP route', () => {
  it('registers a GET/POST route for the session pin', () => {
    const { route } = fixture()
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, SESSION_MODEL_ROUTE)
  })

  it('round-trips a pin through POST then GET', async () => {
    const { route } = fixture()

    const write = response()
    await route.handler(post({ sessionId: 's1', auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5' }), write)
    assert.equal(write.status, 200)
    assert.deepEqual(write.json(), {
      ok: true, sessionId: 's1', auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5',
    })

    const read = response()
    await route.handler(get(`${SESSION_MODEL_ROUTE}?sessionId=s1`), read)
    assert.equal(read.status, 200)
    assert.deepEqual(read.json(), {
      ok: true, sessionId: 's1', auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5',
    })
  })

  it('reports a session on automatic with the same shape the client writes', async () => {
    const { route } = fixture()

    const read = response()
    await route.handler(get(`${SESSION_MODEL_ROUTE}?sessionId=unknown`), read)
    assert.equal(read.status, 200)
    assert.deepEqual(read.json(), { ok: true, sessionId: 'unknown', auto: true, modelId: '', label: '' })
  })

  it('drops the pin when the user flips the switch back to automatic', async () => {
    const { route, preference } = fixture()
    preference.set('s1', { auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5' })

    const write = response()
    await route.handler(post({ sessionId: 's1', auto: true }), write)

    assert.equal(write.json().auto, true)
    assert.equal(preference.get('s1'), null)
  })

  it('rejects a write with no session id', async () => {
    const { route, preference } = fixture()

    const res = response()
    await route.handler(post({ auto: false, modelId: 'seedance-2-5' }), res)

    assert.equal(res.status, 400)
    assert.equal(res.json().error, 'session-required')
    assert.equal(preference.size(), 0)
  })

  it('rejects a malformed body', async () => {
    const { route } = fixture()

    const res = response()
    await route.handler(emptyReq(), res)
    // An empty body parses to `{}`, which has no sessionId.
    assert.equal(res.status, 400)
  })

  it('rejects methods other than GET and POST', async () => {
    const { route } = fixture()

    const res = response()
    await route.handler({ method: 'DELETE', url: SESSION_MODEL_ROUTE }, res)
    assert.equal(res.status, 405)
  })

  it('survives a GET with an unparseable url', async () => {
    const { route } = fixture()

    const res = response()
    await route.handler({ method: 'GET', url: 'http://[::1' }, res)
    assert.equal(res.status, 200)
    assert.equal(res.json().auto, true)
  })

  it('mounts nothing without a usable preference', () => {
    let called = false
    const webServer = { register: () => { called = true } }

    registerSessionModelRoutes(webServer, {})
    registerSessionModelRoutes(webServer, { preference: {} })
    registerSessionModelRoutes(null, { preference: createSessionModelPreference() })

    assert.equal(called, false)
  })
})
