import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { apply } from '../index.js'
import { createAuthDispatcher, sendJson } from './http-routes.js'
import { createPendingStore } from './pending.js'
import { createTokenStore } from './store.js'

function jsonResponse(status, json) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  }
}

describe('auth http dispatcher', () => {
  it('starts a flow without leaking the device code and stores the PAT on success', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-http-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-http-cfg-'))
    const store = createTokenStore({ homeDir, configDir })
    const pending = createPendingStore()
    /** @type {string[]} */
    const urls = []
    const dispatcher = createAuthDispatcher({
      store,
      pending,
      siteBaseUrl: 'https://omnimux.ai',
      fetcher: async (url, init) => {
        urls.push(`${init?.method || 'GET'} ${url}`)
        if (String(url).endsWith('/api/user/device/code')) {
          return jsonResponse(200, {
            success: true,
            data: {
              device_code: 'SECRET-DEVICE',
              user_code: 'WXYZ',
              verification_uri_complete: 'https://omnimux.ai/cli/login?user_code=WXYZ',
              expires_in: 900,
              interval: 5,
            },
          })
        }
        if (String(url).endsWith('/api/user/device/token')) {
          const body = JSON.parse(String(init?.body || '{}'))
          assert.equal(body.device_code, 'SECRET-DEVICE')
          return jsonResponse(200, {
            success: true,
            data: { access_token: 'pat-live', user_id: 3, username: 'ada' },
          })
        }
        if (String(url).endsWith('/api/user/self')) {
          return jsonResponse(200, {
            success: true,
            data: { id: 3, username: 'ada', display_name: 'Ada', quota: 500000, used_quota: 0, email: 'hidden@x' },
          })
        }
        throw new Error(`unexpected ${url}`)
      },
    })
    try {
      const started = await dispatcher.dispatch({ method: 'POST', url: '/omnimux/auth/login' })
      assert.equal(started.status, 200)
      const startedText = JSON.stringify(started.body)
      assert.equal(started.body.user_code, 'WXYZ')
      assert.match(started.body.flow_id, /^[a-f0-9]{32}$/)
      assert.equal(/SECRET-DEVICE|pat-live|access_token|sk-/.test(startedText), false)

      const pendingPoll = await dispatcher.dispatch({
        method: 'POST',
        url: '/omnimux/auth/poll',
        body: { flow_id: started.body.flow_id },
      })
      assert.equal(pendingPoll.status, 200)
      assert.equal(pendingPoll.body.logged_in, true)
      assert.equal(pendingPoll.body.username, 'ada')
      assert.equal(pendingPoll.body.quota_usd, 1)
      assert.equal(/pat-live|SECRET-DEVICE|hidden@x|access_token/.test(JSON.stringify(pendingPoll.body)), false)
      assert.equal(await store.resolve(), 'pat-live')
      assert.equal(existsSync(join(configDir, 'secrets.json')), true)

      const status = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/auth/status' })
      assert.equal(status.body.logged_in, true)
      assert.equal(status.body.username, 'ada')
      assert.equal(status.body.verified, null)

      const loggedOut = await dispatcher.dispatch({ method: 'POST', url: '/omnimux/auth/logout' })
      assert.equal(loggedOut.body.logged_in, false)
      assert.equal(await store.resolve(), undefined)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('lists hub capabilities without secrets', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-cap-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-cap-cfg-'))
    const dispatcher = createAuthDispatcher({
      store: createTokenStore({ homeDir, configDir }),
      pending: createPendingStore(),
      siteBaseUrl: 'https://omnimux.ai',
      capabilities: { identity: true, videoGenerate: true, imageGenerate: true, textComplete: true, official: true },
    })
    try {
      const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/capabilities' })
      assert.equal(result.status, 200)
      assert.equal(result.body.identity, true)
      assert.equal(result.body.official, true)
      assert.equal(/access_token|sk-/.test(JSON.stringify(result.body)), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('lists the model catalog without secrets', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-mc-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-mc-cfg-'))
    const paths = []
    /** @type {Function | null} */
    let catalogHandler = null
    apply({
      tools: { register() {} },
      provide() {},
      get() { return undefined },
      inject(deps, callback) {
        if (deps.includes('clientModules')) {
          assert.deepEqual(deps, ['clientModules', 'webServer', 'loader', 'connection'])
          return // This HTTP-only fixture has no client module service.
        }
        if (deps.includes('connection')) {
          assert.deepEqual(deps, ['webServer', 'connection'])
          return // This HTTP-only fixture has no connection service.
        }
        if (deps[0] === 'webServer') {
          assert.deepEqual(deps, ['webServer'])
          callback({
            webServer: {
              register(route) {
                paths.push(route.path)
                if (route.path === '/omnimux/model-catalog') catalogHandler = route.handler
                return () => {}
              },
            },
            effect(factory) { factory() },
          })
          return
        }
        // sessionQuery / settings / commands are optional for this scenario: model the
        // services as absent, but never swallow an unknown dependency.
        if (deps[0] === 'sessionQuery') {
          assert.deepEqual(deps, ['sessionQuery'])
          return
        }
        if (deps[0] === 'settings' || deps[0] === 'commands') return
        assert.fail(`unexpected inject deps: ${JSON.stringify(deps)}`)
      },
    }, { official: { mount: false } })
    try {
      assert.ok(paths.includes('/omnimux/model-catalog'))
      assert.equal(typeof catalogHandler, 'function')
      /** @type {{ status?: number, chunks: string[] }} */
      const seen = { chunks: [] }
      const res = {
        writeHead(status) { seen.status = status },
        end(chunk) { seen.chunks.push(String(chunk)) },
      }
      await catalogHandler({ method: 'GET', url: '/omnimux/model-catalog' }, res)
      assert.equal(seen.status, 200)
      const body = JSON.parse(seen.chunks.join(''))
      assert.equal(body.source, 'omnimux')
      assert.equal(typeof body.fingerprint, 'string')
      assert.ok(body.defaults)
      assert.ok(Array.isArray(body.text))
      assert.ok(Array.isArray(body.image))
      assert.ok(Array.isArray(body.video))
      assert.ok(Array.isArray(body.audio))
      assert.equal(/access_token|sk-/.test(JSON.stringify(body)), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('sendJson refuses a body that contains a token', () => {
    /** @type {{ status?: number, chunks: string[] }} */
    const seen = { chunks: [] }
    const res = {
      writeHead(status) {
        seen.status = status
      },
      end(chunk) {
        seen.chunks.push(String(chunk))
      },
    }
    sendJson(res, 200, { access_token: 'pat-nope' })
    assert.equal(seen.status, 500)
    assert.equal(/pat-nope/.test(seen.chunks.join('')), false)
  })

  it('apply mounts auth routes when webServer arrives through inject', async () => {
    const paths = []
    const optional = {}
    /** @type {{ kind: string, path: string, handler: Function }[]} */
    const routes = []
    /** @type {string[]} */
    const observedSessionIds = []
    // Sentinel with identity: the sessionQuery inject callback must run and
    // later routes must depend on this exact instance (#522 regression).
    const sessionQuerySentinel = {
      async observeSession(id) {
        observedSessionIds.push(id)
        return { header: { cwd: tmpdir() } }
      },
    }
    apply({
      tools: { register() {} },
      provide() {},
      get(name) { return optional[name] },
      inject(deps, callback) {
        if (deps.includes('clientModules')) {
          assert.deepEqual(deps, ['clientModules', 'webServer', 'loader', 'connection'])
          return // This HTTP-only fixture has no client module service.
        }
        if (deps.includes('connection')) {
          assert.deepEqual(deps, ['webServer', 'connection'])
          return // This HTTP-only fixture has no connection service.
        }
        if (deps[0] === 'webServer') {
          assert.deepEqual(deps, ['webServer'])
          callback({
            webServer: {
              register(route) {
                paths.push(`${route.kind}:${route.path}`)
                routes.push(route)
                return () => {}
              },
            },
            effect(factory) { factory() },
          })
          return
        }
        if (deps[0] === 'sessionQuery') {
          assert.deepEqual(deps, ['sessionQuery'])
          callback({ sessionQuery: sessionQuerySentinel })
          return
        }
        if (deps[0] === 'settings' || deps[0] === 'commands') return
        assert.fail(`unexpected inject deps: ${JSON.stringify(deps)}`)
      },
    })
    assert.deepEqual(paths, [
      'exact:/omnimux/auth/status',
      'exact:/omnimux/auth/login',
      'exact:/omnimux/auth/poll',
      'exact:/omnimux/auth/logout',
      'exact:/omnimux/capabilities',
      'exact:/omnimux/model-catalog',
      'prefix:/omnimux/plugins',
      'prefix:/omnimux/apps',
      'prefix:/omnimux/accounts',
      'prefix:/omnimux/analytics',
      'prefix:/omnimux/inspiration',
      'exact:/omnimux/avatar',
      'prefix:/omnimux/composer/attachments',
      // #453: workbench routes register via webServer.register in the same inject
      'exact:/omnimux/workbench/viewport',
      'exact:/omnimux/workbench/rpc/ack',
    ])
    // #522 regression: drive a composer attachments request and prove the
    // injected sentinel is the sessionQuery the route dispatcher holds.
    const composerRoute = routes.find((route) => route.path === '/omnimux/composer/attachments')
    assert.ok(composerRoute, 'composer attachments route must be registered')
    /** @type {{ status?: number, chunks: string[] }} */
    const seen = { chunks: [] }
    const req = {
      method: 'POST',
      url: '/omnimux/composer/attachments/materialize',
      headers: {},
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ sessionId: 'sess-522', paths: [] }))
      },
    }
    const res = {
      writeHead(status) { seen.status = status },
      end(chunk) { seen.chunks.push(String(chunk)) },
    }
    await composerRoute.handler(req, res)
    assert.equal(seen.status, 200)
    assert.deepEqual(observedSessionIds, ['sess-522'])

    req.url = '/omnimux/composer/attachments/pick-files'
    req.headers = { host: '127.0.0.1:45121', origin: 'http://127.0.0.1:45121' }
    seen.chunks = []
    await composerRoute.handler(req, res)
    assert.equal(seen.status, 503)
    optional.connection = { requestRejection: () => undefined }
    seen.chunks = []
    await composerRoute.handler(req, res)
    assert.equal(seen.status, 501)
    optional.desktopRuntime = { pickFiles: async () => ['/tmp/selected.txt'] }
    seen.chunks = []
    await composerRoute.handler(req, res)
    assert.equal(seen.status, 200)
    assert.deepEqual(JSON.parse(seen.chunks.join('')), { paths: ['/tmp/selected.txt'] })
    assert.deepEqual(observedSessionIds, ['sess-522', 'sess-522', 'sess-522'])
  })

  it('apply still registers the video tool when webServer is absent', () => {
    /** @type {string[]} */
    const names = []
    apply({
      tools: { register(tool) { names.push(tool.name) } },
      provide() {},
      get() { return undefined },
    })
    assert.ok(names.includes('omnimux_video_submit'))
    assert.ok(names.includes('omnimux_image_submit'))
    assert.ok(names.includes('omnimux_social_data'))
  })
})
