import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { DIRECT_MEDIA_GENERATE_ROUTE, registerDirectMediaRoutes } from './direct-http.js'

function fixture(overrides = {}) {
  let route = null
  const webServer = { register: (definition) => { route = definition; return () => { route = null } } }
  const calls = []
  const deps = {
    executeImage: async (req) => {
      calls.push({ kind: 'image', req })
      return { mode: 'live', taskId: 'task_img_123', url: 'https://example.com/test.png' }
    },
    executeVideo: async (req) => {
      calls.push({ kind: 'video', req })
      return { mode: 'live', taskId: 'task_vid_456', url: 'https://example.com/test.mp4' }
    },
    ...overrides,
  }
  registerDirectMediaRoutes(webServer, deps)
  return { route, deps, calls }
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

function post(body, url = DIRECT_MEDIA_GENERATE_ROUTE) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  stream.method = 'POST'
  stream.url = url
  return stream
}

describe('Direct Media Generate HTTP Route', () => {
  it('registers an exact POST route on /omnimux/api/media/generate', () => {
    const { route } = fixture()
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, DIRECT_MEDIA_GENERATE_ROUTE)
  })

  it('rejects non-POST requests with 405', async () => {
    const { route } = fixture()
    const req = { method: 'GET', url: DIRECT_MEDIA_GENERATE_ROUTE }
    const res = response()
    await route.handler(req, res)
    assert.equal(res.status, 405)
    assert.equal(res.json().error, 'method-not-allowed')
  })

  it('rejects empty prompt with 400', async () => {
    const { route } = fixture()
    const req = post({ prompt: '' })
    const res = response()
    await route.handler(req, res)
    assert.equal(res.status, 400)
    assert.equal(res.json().error, 'prompt-required')
  })

  it('successfully dispatches image generation and returns result', async () => {
    const { route, calls } = fixture()
    const req = post({
      kind: 'image',
      prompt: 'a cinematic portrait of a cyberpunk girl',
      model: 'gpt-image-2.5',
      aspectRatio: '16:9',
    })
    const res = response()
    await route.handler(req, res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.mode, 'live')
    assert.equal(data.taskId, 'task_img_123')
    assert.equal(data.url, 'https://example.com/test.png')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].kind, 'image')
    assert.equal(calls[0].req.prompt, 'a cinematic portrait of a cyberpunk girl')
    assert.equal(calls[0].req.model, 'gpt-image-2.5')
    assert.equal(calls[0].req.aspectRatio, '16:9')
  })

  it('forwards a known operation id and drops a malformed one', async () => {
    const { route, calls } = fixture()
    const ok = response()
    await route.handler(post({
      kind: 'image',
      prompt: 'edit this',
      model: 'gpt-image-2.5',
      operation: 'image_edit',
    }), ok)
    assert.equal(calls[0].req.operation, 'image_edit')

    const bad = response()
    await route.handler(post({
      kind: 'image',
      prompt: 'edit this',
      operation: 'Image Edit!',
    }), bad)
    assert.equal(bad.status, 200)
    assert.equal(calls[1].req.operation, undefined)
  })

  it('successfully dispatches video generation and returns result', async () => {
    const { route, calls } = fixture()
    const req = post({
      kind: 'video',
      prompt: 'a running horse in slow motion',
      model: 'kling-v2',
      duration: 5,
    })
    const res = response()
    await route.handler(req, res)

    assert.equal(res.status, 200)
    const data = res.json()
    assert.equal(data.ok, true)
    assert.equal(data.kind, 'video')
    assert.equal(data.url, 'https://example.com/test.mp4')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].kind, 'video')
    assert.equal(calls[0].req.duration, 5)
  })
})
