import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createComposerAttachmentsDispatcher, registerComposerAttachmentRoutes } from './composer-attachments-http.js'

const PICK_FILES_PATH = '/omnimux/composer/attachments/pick-files'

async function host(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'omx-native-http-'))
  const state = {
    sessionReads: [],
    leasesReleased: 0,
    pickerCalls: 0,
    paths: ['/tmp/one.txt', '/tmp/two.txt'],
    error: null,
    sessionQuery: {
      async observeSession(id) {
        state.sessionReads.push(id)
        if (id !== 'session-a') throw new Error('session not found')
        return { header: { cwd }, [Symbol.dispose]() { state.leasesReleased += 1 } }
      },
    },
    runtime: {
      async pickFiles() {
        state.pickerCalls += 1
        if (state.error) throw state.error
        return state.paths
      },
    },
    connection: {
      requestRejection(req) {
        return req.headers.cookie === 'host-session=valid' ? undefined : 401
      },
    },
  }
  let route
  const dispose = registerComposerAttachmentRoutes({
    register(value) { route = value; return () => { route = null } },
  }, createComposerAttachmentsDispatcher({
    getSessionQuery: () => state.sessionQuery,
    getDesktopRuntime: () => state.runtime,
  }), { getConnection: () => state.connection })
  const server = http.createServer((req, res) => route.handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    dispose()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    rmSync(cwd, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (options = {}) => {
    const headers = { 'content-type': 'application/json', cookie: 'host-session=valid', origin: base, ...options.headers }
    for (const [name, value] of Object.entries(headers)) if (value === undefined) delete headers[name]
    return new Promise((resolve, reject) => {
      const outgoing = http.request(base + (options.path || PICK_FILES_PATH), {
        method: options.method || 'POST', headers,
      }, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => { body += chunk })
        response.on('error', reject)
        response.on('end', () => {
          try { resolve({ status: response.statusCode, body: JSON.parse(body) }) } catch (error) { reject(error) }
        })
      })
      outgoing.on('error', reject)
      outgoing.setTimeout(2000, () => outgoing.destroy(new Error('fixture request timed out')))
      outgoing.end(options.method === 'GET' ? undefined : (options.raw ?? JSON.stringify(options.body ?? { sessionId: 'session-a' })))
    })
  }
  return { state, request, base, cwd }
}

test('native picker returns file selections and cancellation without materializing files', async (t) => {
  const { state, request, cwd } = await host(t)
  assert.deepEqual(await request(), { status: 200, body: { paths: state.paths } })
  assert.deepEqual(state.sessionReads, ['session-a'])
  assert.equal(state.leasesReleased, 1)
  assert.equal(state.pickerCalls, 1)
  assert.equal(existsSync(join(cwd, 'assets')), false)
  state.paths = []
  assert.deepEqual(await request(), { status: 200, body: { paths: [] } })
  assert.equal(state.pickerCalls, 2)
})

test('picker requires Host authentication before any session or native call', async (t) => {
  const { state, request } = await host(t)
  const unauthorized = await request({ headers: { cookie: undefined } })
  assert.equal(unauthorized.status, 401)
  assert.equal(unauthorized.body.error, 'unauthorized')
  state.connection = { requestRejection: () => 403 }
  assert.equal((await request()).status, 403)
  state.connection = undefined
  const unavailable = await request()
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.body.error, 'auth-unavailable')
  assert.equal(state.pickerCalls, 0)
  assert.deepEqual(state.sessionReads, [])
})

test('picker refuses missing, malformed, foreign and different-port origins', async (t) => {
  const { state, request, base } = await host(t)
  for (const headers of [
    { origin: undefined },
    { origin: 'null' },
    { origin: 'not a URL', referer: base + '/session' },
    { origin: 'https://untrusted.example' },
    { origin: 'http://127.0.0.1:1' },
    { origin: base.replace('127.0.0.1', 'localhost') },
    { origin: base.replace('http:', 'https:') },
    { 'sec-fetch-site': 'cross-site' },
    { origin: undefined, referer: 'http://127.0.0.1:1/session' },
  ]) {
    const result = await request({ headers })
    assert.equal(result.status, 403, JSON.stringify(headers))
    assert.equal(result.body.error, 'not-local')
  }
  assert.equal(state.pickerCalls, 0)
  assert.deepEqual(state.sessionReads, [])
  assert.equal((await request({ headers: { origin: undefined, referer: base + '/session' } })).status, 200)
})

test('picker validates method, body and session before native interaction', async (t) => {
  const { state, request } = await host(t)
  assert.equal((await request({ method: 'GET' })).status, 405)
  assert.equal((await request({ raw: '{' })).status, 400)
  for (const sessionId of ['', 'default', 'missing-session', null]) {
    const result = await request({ body: { sessionId } })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'session-not-found')
  }
  state.sessionQuery = undefined
  assert.equal((await request()).status, 404)
  state.sessionQuery = { observeSession: async () => ({ header: {} }) }
  assert.equal((await request()).status, 404)
  assert.equal(state.pickerCalls, 0)
})

test('only missing native capability returns the fallback-eligible 501', async (t) => {
  const { state, request } = await host(t)
  const runtime = state.runtime
  for (const missing of [undefined, {}]) {
    state.runtime = missing
    const result = await request()
    assert.equal(result.status, 501)
    assert.equal(result.body.error, 'native-picker-unavailable')
  }
  state.runtime = runtime
  state.error = Object.assign(new Error('busy'), { code: 'native-picker-busy' })
  assert.deepEqual(await request(), {
    status: 409, body: { error: 'native-picker-busy', message: 'a native file picker is already open' },
  })
  state.error = new Error('dialog failed')
  assert.deepEqual(await request(), { status: 500, body: { error: 'internal', message: 'dialog failed' } })
  state.error = null
  state.paths = undefined
  assert.equal((await request()).status, 500)
  state.paths = []
  assert.deepEqual(await request(), { status: 200, body: { paths: [] } })
})

test('materialize passes filesOnly through and retains legacy directory behavior', async (t) => {
  const { state, request, cwd } = await host(t)
  const directory = join(cwd, 'Example.app')
  mkdirSync(directory)
  const options = {
    path: '/omnimux/composer/attachments/materialize',
    body: { sessionId: 'session-a', paths: [directory], filesOnly: true },
    headers: { origin: undefined, cookie: undefined },
  }
  const rejected = await request(options)
  assert.equal(rejected.status, 200)
  assert.equal(rejected.body.results[0].error, 'not-a-file')
  assert.equal(existsSync(join(cwd, 'assets')), false)
  options.body.filesOnly = 'true'
  assert.equal((await request(options)).status, 400)
  delete options.body.filesOnly
  const copied = await request(options)
  assert.equal(copied.status, 200)
  assert.equal(copied.body.results[0].ok, true)
  assert.equal(copied.body.results[0].extension, 'DIR')
  assert.equal(state.pickerCalls, 0)
})
