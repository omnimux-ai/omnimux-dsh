import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { createCategoryCache } from './inspiration.js'
import { createInspirationDispatcher, registerInspirationRoutes } from './inspiration-http.js'

function clientWith(handler, rawHandler) {
  return {
    async withPat(path, init = {}) {
      return handler(path, init)
    },
    async withPatRaw(path, init = {}) {
      if (rawHandler) return rawHandler(path, init)
      throw new Error('raw not stubbed')
    },
  }
}

const LOCAL_ORIGIN = 'http://127.0.0.1:8787'

function listPayload() {
  return {
    success: true,
    data: {
      total: 1,
      page: 1,
      size: 20,
      items: [{
        id: '1',
        type: 'video',
        title: '猫',
        cover_url: '/api/inspiration/v1/media/covers/a.jpg',
      }],
    },
  }
}

describe('inspiration dispatcher', () => {
  it('lists items and rewrites cover URLs onto Host', async () => {
    /** @type {string[]} */
    const seen = []
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async (path) => {
        seen.push(path)
        return listPayload()
      }),
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration?type=video' })
    assert.equal(result.status, 200)
    assert.equal(result.body.data.items[0].cover_url, '/omnimux/inspiration/media/covers/a.jpg')
    assert.deepEqual(seen, ['/api/inspiration/v1/inspirations?type=video'])
  })

  it('forwards status and tags', async () => {
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async (path) => {
        if (path.endsWith('/status')) return { enabled: true, configured: true, gateway_ready: true }
        return { success: true, data: { tags: [{ id: 1, name: '猫' }] } }
      }),
    })
    const status = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/status' })
    assert.equal(status.body.gateway_ready, true)
    const tags = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/tags' })
    assert.equal(tags.body.data.tags[0].name, '猫')
  })

  it('forwards media upload and rewrites response media URLs', async () => {
    /** @type {string[]} */
    const paths = []
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async (path, init) => {
        paths.push(path)
        assert.equal(init.method, 'POST')
        return {
          success: true,
          data: {
            key: 'covers/2026/08/new.jpg',
            url: '/api/inspiration/v1/media/covers/2026/08/new.jpg',
          },
        }
      }),
    })
    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/media',
      body: { url: 'https://example.com/pic.jpg' },
    })
    assert.equal(res.status, 200)
    assert.deepEqual(paths, ['/api/inspiration/v1/media'])
    assert.equal(res.body.data.url, '/omnimux/inspiration/media/covers/2026/08/new.jpg')
  })

  it('maps unsigned calls to 401 and refuses a cross-origin write', async () => {
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async () => {
        throw new OmnimuxError('needs-omnimux', 'sign in')
      }),
    })
    const unsigned = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration' })
    assert.equal(unsigned.status, 401)
    const refused = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration',
      origin: 'https://evil.example',
      body: { source_url: 'https://x.com/a' },
    })
    assert.equal(refused.status, 403)
  })

  it('blocks common user writes with 403 and permits admin writes', async () => {
    const commonDispatcher = createInspirationDispatcher({
      official: { mount: true },
      identity: {
        require: async () => ({ id: 1, role: 1, is_admin: false }),
      },
      client: clientWith(async () => ({ success: true, data: {} })),
    })
    const blockedRes = await commonDispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration',
      body: { source_url: 'https://x.com/a' },
    })
    assert.equal(blockedRes.status, 403)
    assert.match(blockedRes.body.error, /仅限官方管理员管理/)

    const adminDispatcher = createInspirationDispatcher({
      official: { mount: true },
      identity: {
        require: async () => ({ id: 2, role: 10, is_admin: true }),
      },
      client: clientWith(async () => ({ success: true, data: { id: 'insp_123' } })),
    })
    const allowedRes = await adminDispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration',
      body: { source_url: 'https://x.com/a' },
    })
    assert.equal(allowedRes.status, 200)
  })

  it('is absent when official tools are unmounted', async () => {
    const dispatcher = createInspirationDispatcher({ official: { mount: false } })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration' })
    assert.equal(result.status, 404)
  })

  it('streams media with Range and rejects traversal', async () => {
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async () => ({}), async (path, init) => {
        assert.equal(path, '/api/inspiration/v1/media/covers/a.jpg')
        assert.equal(init.headers.range, 'bytes=0-3')
        assert.equal(init.headers['if-range'], '"original-cover"')
        return {
          status: 206,
          headers: { get: (name) => (name === 'content-type' ? 'image/jpeg' : name === 'content-range' ? 'bytes 0-3/10' : undefined) },
          arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
        }
      }),
    })
    const state = { status: 0, headers: {}, body: null, headersSent: false }
    const res = {
      writeHead(status, headers) {
        state.status = status
        state.headers = headers
        state.headersSent = true
      },
      end(buf) { state.body = buf },
      destroy() {},
    }
    await dispatcher.streamMedia({
      method: 'GET',
      url: '/omnimux/inspiration/media/covers/a.jpg',
      headers: { range: 'bytes=0-3', 'if-range': '"original-cover"' },
    }, res)
    assert.equal(state.status, 206)
    assert.equal(state.headers['content-type'], 'image/jpeg')
    assert.equal(Buffer.from(state.body).length, 4)

    const bad = {
      status: 0,
      body: '',
      writeHead() {},
      end(text) { this.body = String(text) },
      destroy() {},
    }
    await dispatcher.streamMedia({ method: 'GET', url: '/omnimux/inspiration/media/../etc/passwd' }, bad)
    assert.match(bad.body, /invalid media key/)
  })

  it('handles inspiration share creation with permission checks', async () => {
    let currentProfile = { id: 'u1', role: 1, is_admin: false }
    const calls = []
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      identity: {
        require: async () => currentProfile,
      },
      client: clientWith(async (path, init) => {
        calls.push({ path, init })
        return { ok: true, data: { share_url: 'https://omnimux.ai/s/abc', expire: init.body?.expire } }
      }),
    })

    // 1. 普通用户创建 3 天分享链接成功
    const res3Days = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/insp-1/share',
      body: { expire: '3days' },
      origin: LOCAL_ORIGIN,
    })
    assert.equal(res3Days.status, 200)
    assert.equal(res3Days.body.data.expire, '3days')

    // 2. 普通用户请求永久有效被拦截为 403
    const resForeverDenied = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/insp-1/share',
      body: { expire: 'forever' },
      origin: LOCAL_ORIGIN,
    })
    assert.equal(resForeverDenied.status, 403)
    assert.match(resForeverDenied.body.error, /永久有效/)

    // 3. 管理员用户创建永久有效分享链接成功
    currentProfile = { id: 'admin-1', role: 10, is_admin: true }
    const resForeverAdmin = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/insp-1/share',
      body: { expire: 'forever' },
      origin: LOCAL_ORIGIN,
    })
    assert.equal(resForeverAdmin.status, 200)
    assert.equal(resForeverAdmin.body.data.expire, 'forever')
  })
})

describe('inspiration categories route (Issue #2497)', () => {
  /**
   * Catalogue client for the category walk: `total` rows paged at 100,
   * categories round-robin from `names`.
   * @param {{ total: number, names: string[], onRequest?: (path: string) => void }} options
   */
  function catalogueClient({ total, names, onRequest }) {
    return clientWith(async (path) => {
      onRequest?.(path)
      const url = new URL(path, 'http://127.0.0.1')
      const page = Number(url.searchParams.get('page')) || 1
      const pageSize = Number(url.searchParams.get('page_size')) || 100
      const start = (page - 1) * pageSize
      const items = []
      for (let index = start; index < Math.min(start + pageSize, total); index += 1) {
        items.push({ id: String(index + 1), category: names[index % names.length] })
      }
      return { success: true, data: { total, page, size: pageSize, items } }
    })
  }

  it('aggregates the catalogue and never forwards "categories" as an id', async () => {
    /** @type {string[]} */
    const requested = []
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: catalogueClient({ total: 4, names: ['digital', 'digital', '健康', ''], onRequest: (path) => requested.push(path) }),
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, {
      data: [
        { name: 'digital', count: 2 },
        { name: '健康', count: 1 },
      ],
    })
    assert.deepEqual(requested, ['/api/inspiration/v1/inspirations?page=1&page_size=100'])
    assert.equal(
      requested.some((path) => path.includes('/inspirations/categories')),
      false,
      'the categories route must not fall through to the :id wildcard',
    )
  })

  it('still routes a real id through the :id wildcard', async () => {
    /** @type {string[]} */
    const requested = []
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async (path) => {
        requested.push(path)
        return { success: true, data: { id: 'abc123' } }
      }),
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/abc123' })
    assert.equal(result.status, 200)
    assert.deepEqual(requested, ['/api/inspiration/v1/inspirations/abc123'])
  })

  it('serves the cached aggregate within the TTL without re-walking', async () => {
    let walks = 0
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: catalogueClient({ total: 2, names: ['digital', 'digital'], onRequest: () => { walks += 1 } }),
    })
    const first = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    const second = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.deepEqual(first.body, second.body)
    assert.equal(walks, 1, 'a TTL-fresh cache must not re-walk the catalogue')
  })

  it('serves the stale value immediately and refreshes behind it', async () => {
    let now = 1_000_000
    let walks = 0
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      categoryCache: createCategoryCache({ ttlMs: 600_000, now: () => now }),
      client: catalogueClient({ total: 2, names: ['digital', 'digital'], onRequest: () => { walks += 1 } }),
    })
    const first = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(walks, 1)
    now += 600_001
    const stale = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(stale.status, 200)
    assert.deepEqual(stale.body, first.body, 'a stale cache answers with the stale value right away')
    for (let attempt = 0; attempt < 50 && walks < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.equal(walks, 2, 'a stale answer must trigger a background refresh')
  })

  it('answers 200 with an empty list when the walk fails and nothing is cached', async () => {
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      client: clientWith(async () => {
        throw new OmnimuxError('upstream', 'cloud unreachable')
      }),
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { data: [] })
  })

  it('keeps serving the stale value when the background refresh fails', async () => {
    let now = 1_000_000
    let failing = false
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      categoryCache: createCategoryCache({ ttlMs: 600_000, now: () => now }),
      client: clientWith(async (path) => {
        if (failing) throw new OmnimuxError('upstream', 'cloud unreachable')
        return { success: true, data: { total: 1, items: [{ id: '1', category: 'digital' }] } }
      }),
    })
    const first = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.deepEqual(first.body, { data: [{ name: 'digital', count: 1 }] })
    now += 600_001
    failing = true
    const stale = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(stale.status, 200)
    assert.deepEqual(stale.body, first.body)
    // Let the background refresh fail and settle; the cache must still hold.
    await new Promise((resolve) => setTimeout(resolve, 20))
    failing = false
    now += 1
    const recovered = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(recovered.status, 200)
  })

  it('accepts GET without an admin identity like every other read', async () => {
    const dispatcher = createInspirationDispatcher({
      official: { mount: true },
      identity: { require: async () => ({ id: 1, role: 1, is_admin: false }) },
      client: catalogueClient({ total: 1, names: ['digital'] }),
    })
    const result = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/categories' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { data: [{ name: 'digital', count: 1 }] })
  })
})

describe('registerInspirationRoutes', () => {
  it('registers the Host prefix', () => {
    const routes = []
    registerInspirationRoutes({
      register(route) {
        routes.push(`${route.kind}:${route.path}`)
        return () => {}
      },
    }, createInspirationDispatcher({ official: { mount: true }, client: clientWith(async () => ({})) }))
    assert.deepEqual(routes, ['prefix:/omnimux/inspiration'])
  })

  function mockRes() {
    return {
      status: 0,
      headers: {},
      bodyText: '',
      writeHead(status, headers) {
        this.status = status
        this.headers = headers || {}
      },
      end(text) {
        this.bodyText = text || ''
      },
    }
  }

  it('emits CORS headers on the gateway list response so cross-origin pages can fetch', async () => {
    let handler = null
    registerInspirationRoutes({
      register(route) {
        handler = route.handler
        return () => {}
      },
    }, createInspirationDispatcher({ official: { mount: true }, client: clientWith(async () => ({ data: { items: [], total: 0 } })) }))
    const res = mockRes()
    await handler({ method: 'GET', url: '/omnimux/inspiration?page=1' }, res)
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
    assert.equal(res.headers['Access-Control-Allow-Headers'], '*')
    assert.match(String(res.headers['Access-Control-Allow-Methods']), /GET/)
  })

  it('answers OPTIONS preflight with 204 and CORS headers', async () => {
    let handler = null
    registerInspirationRoutes({
      register(route) {
        handler = route.handler
        return () => {}
      },
    }, createInspirationDispatcher({ official: { mount: true }, client: clientWith(async () => ({})) }))
    const res = mockRes()
    await handler({ method: 'OPTIONS', url: '/omnimux/inspiration' }, res)
    assert.equal(res.status, 204)
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
  })
})
