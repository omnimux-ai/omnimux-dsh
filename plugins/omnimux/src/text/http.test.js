import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerTextCompleteRoutes } from './http.js'

function createMockWebServer() {
  const routes = new Map()
  return {
    routes,
    register({ kind, path, handler }) {
      routes.set(`${kind}:${path}`, handler)
      return () => routes.delete(`${kind}:${path}`)
    },
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    writeHead(status, headers = {}) {
      this.statusCode = status
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = v
      }
    },
    end(data = '') {
      this.body += data
    },
  }
}

async function* createStream(chunks) {
  for (const c of chunks) yield Buffer.from(c)
}

describe('registerTextCompleteRoutes HTTP gateway', () => {
  it('registers route on /omnimux/text/complete and unregisters on stop', () => {
    const server = createMockWebServer()
    const stop = registerTextCompleteRoutes(server, {})
    assert.equal(server.routes.has('exact:/omnimux/text/complete'), true)
    stop()
    assert.equal(server.routes.has('exact:/omnimux/text/complete'), false)
  })

  it('answers CORS preflight OPTIONS request with 204', async () => {
    const server = createMockWebServer()
    registerTextCompleteRoutes(server, {})
    const handler = server.routes.get('exact:/omnimux/text/complete')
    const req = { method: 'OPTIONS' }
    const res = createMockRes()

    await handler(req, res)
    assert.equal(res.statusCode, 204)
    assert.equal(res.headers['access-control-allow-origin'], '*')
    assert.equal(res.headers['access-control-allow-methods'], 'POST, OPTIONS')
  })

  it('rejects non-POST method with 405', async () => {
    const server = createMockWebServer()
    registerTextCompleteRoutes(server, {})
    const handler = server.routes.get('exact:/omnimux/text/complete')
    const req = { method: 'GET' }
    const res = createMockRes()

    await handler(req, res)
    assert.equal(res.statusCode, 405)
    const json = JSON.parse(res.body)
    assert.equal(json.ok, false)
  })

  it('handles POST and returns completed text from textComplete', async () => {
    const server = createMockWebServer()
    let executedWith = null
    const textComplete = {
      execute: async (input) => {
        executedWith = input
        return { text: '神评文案测试成功' }
      },
    }
    registerTextCompleteRoutes(server, { textComplete })
    const handler = server.routes.get('exact:/omnimux/text/complete')

    const payload = JSON.stringify({ prompt: '推文正文', system: '神评专家' })
    const req = Object.assign(createStream([payload]), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    const res = createMockRes()

    await handler(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['access-control-allow-origin'], '*')
    const json = JSON.parse(res.body)
    assert.equal(json.ok, true)
    assert.equal(json.text, '神评文案测试成功')
    assert.equal(executedWith.prompt, '推文正文')
    assert.equal(executedWith.system, '神评专家')
  })

  it('rejects empty prompt with 400', async () => {
    const server = createMockWebServer()
    registerTextCompleteRoutes(server, {})
    const handler = server.routes.get('exact:/omnimux/text/complete')

    const payload = JSON.stringify({ prompt: '', system: '' })
    const req = Object.assign(createStream([payload]), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    const res = createMockRes()

    await handler(req, res)
    assert.equal(res.statusCode, 400)
    const json = JSON.parse(res.body)
    assert.equal(json.ok, false)
  })
})
