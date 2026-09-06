import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { avatarIdFromPath, createOfficialDispatcher, registerOfficialRoutes } from './http-routes.js'
import { createAccountMetaStore } from './account-meta.js'
import { createOfficialClient } from './client.js'

function clientWith(handler) {
  return {
    async withPat(path, init = {}) {
      return handler(path, init)
    },
  }
}

const LOCAL_ORIGIN = 'http://127.0.0.1:8787'

/** In-memory meta store that records every call. */
function fakeMetaStore(doc = {}) {
  const state = { ...doc }
  /** @type {Array<{ op: string, id: string, patch?: Record<string, unknown> }>} */
  const calls = []
  return {
    calls,
    read: () => ({ ...state }),
    update: (id, patch) => {
      calls.push({ op: 'update', id, patch: { ...patch } })
      const current = { ...(state[id] || {}) }
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete current[key]
        else current[key] = value
      }
      current.updated_at = '2026-08-20T10:00:00Z'
      state[id] = current
      return { ...current }
    },
    remove: (id) => {
      calls.push({ op: 'remove', id })
      delete state[id]
    },
    prune: (validIds) => {
      calls.push({ op: 'prune', id: String(Array.from(validIds).sort().join(',')) })
      const valid = new Set(validIds)
      /** @type {string[]} */
      const removed = []
      for (const id of Object.keys(state)) {
        if (!valid.has(id)) {
          delete state[id]
          removed.push(id)
        }
      }
      return removed
    },
  }
}

function accountFixture() {
  return {
    data: {
      accounts: [
        { id: 'a', provider: 'zernio', platform: 'tiktok', display_name: 'Ada', username: 'ada', group: 'site-group' },
        { id: 'b', provider: 'zernio', platform: 'youtube', display_name: 'Bo', username: 'bo' },
      ],
    },
  }
}

function accountFixtureWithAvatars() {
  return {
    data: {
      accounts: [
        {
          id: 'a',
          provider: 'zernio', platform: 'tiktok',
          display_name: 'Ada',
          username: 'ada',
          group: 'site-group',
          avatar_url: 'https://cdn.example/a.png',
        },
        {
          id: 'b',
          provider: 'zernio', platform: 'youtube',
          display_name: 'Bo',
          username: 'bo',
          avatar_url: 'https://cdn.example/b.png',
        },
      ],
    },
  }
}

const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
)

function signedIdentity() {
  return { require: async () => ({ id: 'user-1' }) }
}

function unsignedIdentity() {
  return {
    async require() {
      throw new OmnimuxError('needs-omnimux', 'sign in')
    },
  }
}

/** In-memory avatar store that records every call. */
function fakeAvatarStore({ hits = {}, sources = {} } = {}) {
  const state = { ...hits }
  const source = { ...sources }
  /** @type {Array<{ op: string, id: string, url?: string }>} */
  const calls = []
  return {
    calls,
    has: (id) => Boolean(state[id]),
    get: (id) => state[id] || null,
    sourceUrl: (id) => source[id] || '',
    localUrlFor: (id) => `/omnimux/accounts/${encodeURIComponent(id)}/avatar`,
    remove: (id) => {
      calls.push({ op: 'remove', id })
      delete state[id]
      delete source[id]
    },
    prune: (validIds) => {
      calls.push({ op: 'prune', id: String(Array.from(validIds).sort().join(',')) })
      const valid = new Set(validIds)
      /** @type {string[]} */
      const removed = []
      for (const id of Object.keys(state)) {
        if (!valid.has(id)) {
          delete state[id]
          delete source[id]
          removed.push(id)
        }
      }
      return removed
    },
    putFromUrl: async (id, url) => {
      calls.push({ op: 'putFromUrl', id, url })
      return { ok: true }
    },
  }
}

describe('official accounts dispatcher', () => {
  it('lists public account fields and applies filters', async () => {
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => ({
        data: {
          accounts: [
            { id: 'a', provider: 'zernio', platform: 'tiktok', group: 'ops', access_token: 'pat-nope' },
            { id: 'b', provider: 'zernio', platform: 'youtube', group: 'ads' },
          ],
        },
      })),
    })
    const all = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(all.status, 200)
    assert.deepEqual(all.body.accounts.map((row) => row.id), ['a', 'b'])
    assert.equal('access_token' in all.body.accounts[0], false)
    const filtered = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?platform=tiktok&provider=zernio' })
    assert.deepEqual(filtered.body.accounts.map((row) => row.id), ['a'])
  })

  it('connects and disconnects through the official client', async () => {
    /** @type {string[]} */
    const seen = []
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async (path, init) => {
        seen.push(`${init.method || 'GET'} ${path}`)
        if (path === '/api/social/v1/connect') return { auth_url: 'https://omnimux.ai/cli/connect' }
        return { success: true }
      }),
    })
    const connected = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/accounts?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { provider: 'zernio', platform: 'tiktok' },
    })
    assert.equal(connected.status, 200)
    assert.equal(connected.body.auth_url, 'https://omnimux.ai/cli/connect')
    const removed = await dispatcher.dispatch({
      method: 'DELETE',
      url: '/omnimux/accounts/acc-1?provider=zernio',
      origin: LOCAL_ORIGIN,
    })
    assert.equal(removed.status, 200)
    assert.deepEqual(seen, ['POST /api/social/v1/connect', 'DELETE /api/social/v1/accounts/acc-1?provider=zernio'])
  })

  it('maps client quota failures to 402', async () => {
    const message = '当前操作需要更多额度，充值后即可继续使用 OmniMux。'
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => {
        throw new OmnimuxError('quota-exceeded', message)
      }),
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(result.status, 402)
    assert.deepEqual(result.body, { error: 'quota-exceeded', message })
  })

  it('maps unsigned calls to 401 and refuses a cross-origin write', async () => {
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => {
        throw new OmnimuxError('needs-omnimux', 'sign in')
      }),
    })
    const unsigned = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(unsigned.status, 401)
    const refused = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/accounts?provider=zernio',
      origin: 'https://evil.example',
      body: { provider: 'zernio', platform: 'tiktok' },
    })
    assert.equal(refused.status, 403)
  })

  it('is absent when official tools are unmounted', async () => {
    const dispatcher = createOfficialDispatcher({ official: { mount: false } })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(result.status, 404)
  })
})

describe('official accounts overlay', () => {
  it('merges meta without pruning accounts absent from a scoped list', async () => {
    const meta = fakeMetaStore({
      a: { group: 'local-group', agent_usable: true },
      gone: { group: 'ops' },
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixture()),
      metaStore: meta,
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(result.status, 200)
    const a = result.body.accounts.find((row) => row.id === 'a')
    assert.equal(a.group, 'local-group')
    assert.equal(a.agent_usable, true)
    assert.equal(a.status, 'active')
    const b = result.body.accounts.find((row) => row.id === 'b')
    assert.equal('agent_usable' in b, false)
    assert.deepEqual(meta.calls, [])
    assert.deepEqual(meta.read().gone, { group: 'ops' })
  })

  it('patches group and agent_usable and returns the merged view row', async () => {
    const meta = fakeMetaStore()
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixture()),
      metaStore: meta,
    })
    const result = await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/a?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { group: 'brand', agent_usable: false },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.account.id, 'a')
    assert.equal(result.body.account.display_name, 'Ada')
    assert.equal(result.body.account.group, 'brand')
    assert.equal(result.body.account.agent_usable, false)
    assert.deepEqual(meta.calls, [{ op: 'update', id: 'a', patch: { group: 'brand', agent_usable: false } }])
  })

  it('normalizes an empty-string group and refuses metadata for unverified accounts', async () => {
    const meta = fakeMetaStore({ ghost: { group: 'old', agent_usable: true } })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixture()),
      metaStore: meta,
    })
    const cleared = await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/a?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { group: '  ' },
    })
    assert.equal(cleared.status, 200)
    assert.equal('group' in cleared.body.account, true, 'site group still shows when overlay is cleared')
    assert.equal(cleared.body.account.group, 'site-group')
    assert.deepEqual(meta.calls, [{ op: 'update', id: 'a', patch: { group: null } }])
    // A missing site row cannot authorize a metadata write.
    const ghost = await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/ghost?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { agent_usable: false },
    })
    assert.equal(ghost.status, 409)
    assert.equal(ghost.body.error, 'account-provider-mismatch')
    assert.deepEqual(meta.read().ghost, { group: 'old', agent_usable: true })
  })

  it('rejects invalid PATCH bodies with 400', async () => {
    const meta = fakeMetaStore()
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixture()),
      metaStore: meta,
    })
    const cases = [
      { group: 12 },
      { agent_usable: 'yes' },
      { scopes: ['read'] },
      {},
      null,
    ]
    for (const body of cases) {
      const result = await dispatcher.dispatch({
        method: 'PATCH',
        url: '/omnimux/accounts/a?provider=zernio',
        origin: LOCAL_ORIGIN,
        body,
      })
      assert.equal(result.status, 400, `expected 400 for ${JSON.stringify(body)}`)
    }
    assert.deepEqual(meta.calls, [], 'no meta writes on invalid input')
    const missingId = await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { group: 'x' },
    })
    assert.equal(missingId.status, 400)
  })

  it('refuses a cross-origin PATCH and clears meta after a DELETE', async () => {
    const meta = fakeMetaStore({ 'acc-1': { group: 'ops' } })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async (_path, init) => (init.method === 'DELETE' ? { success: true } : accountFixture())),
      metaStore: meta,
    })
    const refused = await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/acc-1?provider=zernio',
      origin: 'https://evil.example',
      body: { group: 'nope' },
    })
    assert.equal(refused.status, 403)
    assert.deepEqual(meta.calls, [])
    const removed = await dispatcher.dispatch({
      method: 'DELETE',
      url: '/omnimux/accounts/acc-1?provider=zernio',
      origin: LOCAL_ORIGIN,
    })
    assert.equal(removed.status, 200)
    assert.deepEqual(meta.calls, [{ op: 'remove', id: 'acc-1' }])
    assert.equal('acc-1' in meta.read(), false)
  })

  it('keeps local account metadata and avatars when the official disconnect does not explicitly succeed', async () => {
    const cases = [
      { body: { success: false, message: '  synthetic upstream rejection  ' }, message: 'synthetic upstream rejection' },
      { body: {}, message: 'official disconnect failed' },
      { body: { success: 'true' }, message: 'official disconnect failed' },
      { body: null, message: 'official disconnect failed' },
      { body: { message: 'upstream unavailable' }, ok: false, status: 500, message: 'upstream unavailable' },
    ]
    for (const fixture of cases) {
      const meta = fakeMetaStore({ 'acc-1': { group: 'ops' } })
      const avatars = fakeAvatarStore({ hits: { 'acc-1': true } })
      const client = createOfficialClient({
        siteBaseUrl: 'https://omnimux.ai',
        resolveApiKey: () => 'sk-x',
        resolveAccess: async () => ({ token: 'pat-x', userId: 'user-1' }),
        fetcher: async () => ({
          ok: fixture.ok ?? true,
          status: fixture.status ?? 200,
          json: async () => fixture.body,
        }),
      })
      const dispatcher = createOfficialDispatcher({
        official: { mount: true },
        client,
        metaStore: meta,
        avatarStore: avatars,
      })

      const result = await dispatcher.dispatch({
        method: 'DELETE',
        url: '/omnimux/accounts/acc-1?provider=zernio',
        origin: LOCAL_ORIGIN,
      })

      assert.equal(result.status, 502)
      assert.equal(result.body.error, fixture.message)
      assert.deepEqual(meta.calls, [])
      assert.deepEqual(avatars.calls, [])
      assert.deepEqual(meta.read(), { 'acc-1': { group: 'ops' } })
      assert.equal(avatars.has('acc-1'), true)
    }
  })

  it('clears only the disconnected account metadata and avatar after an explicit official success', async () => {
    const meta = fakeMetaStore({ 'acc-1': { group: 'ops' }, keep: { group: 'ads' } })
    const avatars = fakeAvatarStore({ hits: { 'acc-1': true, keep: true } })
    const client = createOfficialClient({
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-x',
      resolveAccess: async () => ({ token: 'pat-x', userId: 'user-1' }),
      fetcher: async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }),
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client,
      metaStore: meta,
      avatarStore: avatars,
    })

    const result = await dispatcher.dispatch({
      method: 'DELETE',
      url: '/omnimux/accounts/acc-1?provider=zernio',
      origin: LOCAL_ORIGIN,
    })

    assert.deepEqual(result, { status: 200, body: { ok: true } })
    assert.deepEqual(meta.calls, [{ op: 'remove', id: 'acc-1' }])
    assert.deepEqual(avatars.calls, [{ op: 'remove', id: 'acc-1' }])
    assert.deepEqual(meta.read(), { keep: { group: 'ads' } })
    assert.equal(avatars.has('acc-1'), false)
    assert.equal(avatars.has('keep'), true)
  })

  it('works against the real file-backed store end to end', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-routes-'))
    try {
      const metaStore = createAccountMetaStore({ home, now: () => '2026-08-20T10:00:00Z' })
      const dispatcher = createOfficialDispatcher({
        official: { mount: true },
        client: clientWith(async (_path, init) => (init.method === 'DELETE' ? { success: true } : accountFixture())),
        metaStore,
      })
      const patched = await dispatcher.dispatch({
        method: 'PATCH',
        url: '/omnimux/accounts/a?provider=zernio',
        origin: LOCAL_ORIGIN,
        body: { agent_usable: false },
      })
      assert.equal(patched.status, 200)
      assert.equal(patched.body.account.agent_usable, false)
      const listed = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
      const a = listed.body.accounts.find((row) => row.id === 'a')
      assert.equal(a.agent_usable, false)
      await dispatcher.dispatch({ method: 'DELETE', url: '/omnimux/accounts/a?provider=zernio', origin: LOCAL_ORIGIN })
      const after = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
      const gone = after.body.accounts.find((row) => row.id === 'a')
      assert.equal('agent_usable' in gone, false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('clears an overlay group with an explicit null so the site group resurfaces', async () => {
    const meta = fakeMetaStore()
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixture()),
      metaStore: meta,
    })
    await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/a?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { group: 'local' },
    })
    const cleared = await dispatcher.dispatch({
      method: 'PATCH',
      url: '/omnimux/accounts/a?provider=zernio',
      origin: LOCAL_ORIGIN,
      body: { group: null },
    })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.body.account.group, 'site-group')
    assert.deepEqual(meta.calls[1], { op: 'update', id: 'a', patch: { group: null } })
  })
})

describe('official account avatars', () => {
  it('parses the avatar byte path and rejects traversal', () => {
    assert.equal(avatarIdFromPath('/omnimux/accounts/acc-1/avatar'), 'acc-1')
    assert.equal(avatarIdFromPath('/omnimux/accounts/a%2Fb/avatar'), 'a/b')
    assert.equal(avatarIdFromPath('/omnimux/accounts/a/b/avatar'), '')
    assert.equal(avatarIdFromPath('/omnimux/accounts/acc-1/avatar/extra'), '')
    assert.equal(avatarIdFromPath('/omnimux/accounts/avatar'), '')
    assert.equal(avatarIdFromPath('/omnimux/accounts/../avatar'), '')
  })

  it('rewrites a cache hit without pruning other scoped accounts', async () => {
    const avatars = fakeAvatarStore({
      hits: {
        a: { buffer: PNG_BYTES, mimeType: 'image/png', ext: 'png' },
      },
      sources: { a: 'https://cdn.example/a.png' },
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixtureWithAvatars()),
      avatarStore: avatars,
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(result.status, 200)
    const a = result.body.accounts.find((row) => row.id === 'a')
    const b = result.body.accounts.find((row) => row.id === 'b')
    assert.equal(a.avatar_url, '/omnimux/accounts/a/avatar')
    assert.equal(b.avatar_url, 'https://cdn.example/b.png')
    assert.deepEqual(
      avatars.calls.filter((call) => call.op === 'putFromUrl'),
      [{ op: 'putFromUrl', id: 'b', url: 'https://cdn.example/b.png' }],
    )
    assert.deepEqual(
      avatars.calls.filter((call) => call.op === 'prune'),
      [],
    )
  })

  it('fills avatars for the unfiltered view so ?platform= does not skip a miss', async () => {
    const avatars = fakeAvatarStore()
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixtureWithAvatars()),
      avatarStore: avatars,
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?platform=tiktok&provider=zernio' })
    assert.deepEqual(result.body.accounts.map((row) => row.id), ['a'])
    assert.deepEqual(
      avatars.calls.filter((call) => call.op === 'putFromUrl'),
      [
        { op: 'putFromUrl', id: 'a', url: 'https://cdn.example/a.png' },
        { op: 'putFromUrl', id: 'b', url: 'https://cdn.example/b.png' },
      ],
    )
  })

  it('does not rewrite or fetch when accountAvatars.enabled is false', async () => {
    const avatars = fakeAvatarStore({
      hits: { a: { buffer: PNG_BYTES, mimeType: 'image/png', ext: 'png' } },
      sources: { a: 'https://cdn.example/a.png' },
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true, accountAvatars: { enabled: false } },
      client: clientWith(async () => accountFixtureWithAvatars()),
      avatarStore: avatars,
      identity: signedIdentity(),
    })
    const listed = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts?provider=zernio' })
    assert.equal(listed.body.accounts[0].avatar_url, 'https://cdn.example/a.png')
    assert.deepEqual(avatars.calls, [])
    const bytes = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/accounts/a/avatar',
    })
    assert.equal(bytes.status, 404)
  })

  it('returns raster bytes on GET avatar and 404 on a miss', async () => {
    const avatars = fakeAvatarStore({
      hits: { a: { buffer: PNG_BYTES, mimeType: 'image/png', ext: 'png' } },
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixtureWithAvatars()),
      avatarStore: avatars,
      identity: signedIdentity(),
    })
    const hit = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts/a/avatar' })
    assert.equal(hit.status, 200)
    assert.equal(hit.raw, true)
    assert.equal(hit.headers['Content-Type'], 'image/png')
    assert.equal(hit.headers['Cache-Control'], 'private, max-age=86400')
    assert.equal(hit.headers['X-Content-Type-Options'], 'nosniff')
    assert.ok(Buffer.isBuffer(hit.body))
    assert.equal(hit.body[0], 0x89)
    const miss = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts/b/avatar' })
    assert.equal(miss.status, 404)
    assert.equal(miss.raw, undefined)
  })

  it('returns 401 when unsigned, 405 on a non-GET, and 404 for traversal', async () => {
    const avatars = fakeAvatarStore({
      hits: { a: { buffer: PNG_BYTES, mimeType: 'image/png', ext: 'png' } },
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixtureWithAvatars()),
      avatarStore: avatars,
      identity: unsignedIdentity(),
    })
    const unsigned = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/accounts/a/avatar' })
    assert.equal(unsigned.status, 401)
    const method = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/accounts/a/avatar',
      origin: LOCAL_ORIGIN,
    })
    assert.equal(method.status, 405)
    const traversal = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/accounts/../avatar',
      identity: signedIdentity(),
    })
    assert.equal(traversal.status, 404)
  })

  it('clears the cached raster on DELETE', async () => {
    const avatars = fakeAvatarStore({
      hits: { 'acc-1': { buffer: PNG_BYTES, mimeType: 'image/png', ext: 'png' } },
    })
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async (_path, init) => (init.method === 'DELETE' ? { success: true } : accountFixture())),
      avatarStore: avatars,
    })
    const removed = await dispatcher.dispatch({
      method: 'DELETE',
      url: '/omnimux/accounts/acc-1?provider=zernio',
      origin: LOCAL_ORIGIN,
    })
    assert.equal(removed.status, 200)
    assert.deepEqual(avatars.calls, [{ op: 'remove', id: 'acc-1' }])
  })
})

describe('registerOfficialRoutes body parsing', () => {
  /** Minimal async-iterable request stub readJsonBody can consume. */
  function fakeReq(method, url, rawBody) {
    return {
      method,
      url,
      headers: { origin: 'http://127.0.0.1:8787' },
      async *[Symbol.asyncIterator]() {
        if (rawBody !== undefined) yield Buffer.from(rawBody, 'utf8')
      },
    }
  }

  function fakeRes() {
    const state = { status: 0, body: '', headers: {} }
    return {
      state,
      writeHead(status, headers) {
        state.status = status
        if (headers) state.headers = headers
      },
      end(text) { state.body = text },
    }
  }

  function fakeWebServer() {
    /** @type {Array<{ kind: string, path: string, handler: Function }>} */
    const routes = []
    return {
      routes,
      register(route) {
        routes.push(route)
        return () => {}
      },
    }
  }

  function handlerFor(webServer) {
    const route = webServer.routes.find((entry) => entry.path === '/omnimux/accounts')
    assert.ok(route, 'prefix route registered')
    return route.handler
  }

  it('parses a PATCH body and forwards it to the dispatcher', async () => {
    const webServer = fakeWebServer()
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: clientWith(async () => accountFixture()),
    })
    registerOfficialRoutes(webServer, dispatcher)
    const res = fakeRes()
    await handlerFor(webServer)(fakeReq('PATCH', '/omnimux/accounts/a?provider=zernio', '{"group":"ops"}'), res)
    assert.equal(res.state.status, 200)
    assert.equal(JSON.parse(res.state.body).account.group, 'ops')
  })

  it('rejects an invalid JSON PATCH body with 400 before dispatching', async () => {
    const webServer = fakeWebServer()
    let dispatched = 0
    const dispatcher = {
      async dispatch() { dispatched += 1; return { status: 200, body: {} } },
    }
    registerOfficialRoutes(webServer, dispatcher)
    const res = fakeRes()
    await handlerFor(webServer)(fakeReq('PATCH', '/omnimux/accounts/a?provider=zernio', 'not-json{'), res)
    assert.equal(res.state.status, 400)
    assert.equal(JSON.parse(res.state.body).error, 'invalid json')
    assert.equal(dispatched, 0, 'the dispatcher never sees a broken body')
  })

  it('writes avatar bytes instead of JSON', async () => {
    const webServer = fakeWebServer()
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      identity: signedIdentity(),
      avatarStore: fakeAvatarStore({
        hits: { a: { buffer: PNG_BYTES, mimeType: 'image/png', ext: 'png' } },
      }),
    })
    registerOfficialRoutes(webServer, dispatcher)
    const res = fakeRes()
    await handlerFor(webServer)(fakeReq('GET', '/omnimux/accounts/a/avatar'), res)
    assert.equal(res.state.status, 200)
    assert.equal(res.state.headers['Content-Type'], 'image/png')
    assert.equal(res.state.headers['Cache-Control'], 'private, max-age=86400')
    assert.ok(Buffer.isBuffer(res.state.body))
    assert.equal(res.state.body[0], 0x89)
    assert.notEqual(String(res.state.body)[0], '{')
  })

  it('rejects an invalid JSON POST body with 400', async () => {
    const webServer = fakeWebServer()
    const dispatcher = { async dispatch() { return { status: 200, body: {} } } }
    registerOfficialRoutes(webServer, dispatcher)
    const res = fakeRes()
    await handlerFor(webServer)(fakeReq('POST', '/omnimux/accounts', '{oops'), res)
    assert.equal(res.state.status, 400)
    assert.equal(JSON.parse(res.state.body).error, 'invalid json')
  })

  it('dispatches analytics endpoints', async () => {
    const calls = []
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: {
        withPat(path) {
          calls.push(path)
          return Promise.resolve({ ok: true, path })
        },
      },
    })
    const r1 = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/analytics/daily-metrics?platform=tiktok' })
    assert.equal(r1.status, 200)
    assert.equal(calls[0], '/api/social/v1/analytics/daily-metrics?platform=tiktok')

    const r2 = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/analytics/best-time-to-post' })
    assert.equal(r2.status, 200)

    const r3 = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/analytics/inbox/heatmap' })
    assert.equal(r3.status, 200)
    assert.equal(calls[2], '/api/social/v1/inbox-analytics/heatmap')
  })

  it('aggregates overview onto the dashboard view model', async () => {
    const calls = []
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: {
        async withPat(path) {
          calls.push(path)
          if (path === '/api/social/v1/accounts?provider=zernio') {
            return { accounts: [{ id: 'acc_tt_01', provider: 'zernio', platform: 'tiktok', username: 'dsh_drama' }] }
          }
          if (String(path).startsWith('/api/social/v1/analytics/daily-metrics')) {
            return {
              dailyData: [{
                date: '2026-08-02',
                postCount: 2,
                platforms: { tiktok: 2 },
                metrics: { likes: 17, comments: 0, shares: 0, views: 930 },
              }],
              platformBreakdown: [{
                provider: 'zernio', platform: 'tiktok',
                postCount: 2,
                metrics: { likes: 17, views: 930, er: 1.83 },
              }],
            }
          }
          if (String(path).startsWith('/api/social/v1/analytics/posts')) {
            return {
              posts: [{
                postId: 'live_ep1',
                provider: 'zernio', platform: 'tiktok',
                content: 'Live episode',
                publishedAt: '2026-08-02T10:00:00Z',
                analytics: { likes: 17, views: 930, engagementRate: 1.83 },
              }],
            }
          }
          return { ok: true, path }
        },
      },
    })
    const result = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux/analytics/overview?timeRange=30d&platform=tiktok',
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.kpi.bestPost.postId, 'live_ep1')
    assert.equal(result.body.kpi.bestPost.views, 930)
    assert.equal(result.body.kpi.engagementRate.value, 0.01828)
    assert.equal(result.body.meta.boundAccountCount, 1)
    assert.equal(result.body.meta.filterAccounts[0].id, 'acc_tt_01')
    assert.ok(calls.some((path) => path === '/api/social/v1/accounts?provider=zernio'))
    assert.ok(calls.some((path) => String(path).includes('/api/social/v1/analytics/daily-metrics')))
  })

  it('returns 401 from aggregated overview when the hub is unsigned', async () => {
    const dispatcher = createOfficialDispatcher({
      official: { mount: true },
      client: {
        async withPat() {
          throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
        },
      },
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/analytics/overview?timeRange=30d' })
    assert.equal(result.status, 401)
  })
})
