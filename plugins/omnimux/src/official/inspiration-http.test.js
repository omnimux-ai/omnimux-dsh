import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
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
})
