import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPromptOptimizer, registerPromptOptimizerRoutes, PROMPT_OPTIMIZER_ROUTE } from './mount.js'

const ENV = { JEV_API_KEY: 'sk-jev-test' }

function fakeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.status = status
      Object.assign(res.headers, headers)
    },
    end(chunk) {
      if (chunk !== undefined) res.body += chunk
    },
  }
  return res
}

function fakeReq({ method = 'GET', body, headers = {} }) {
  const chunks = body === undefined ? [] : [Buffer.from(body)]
  return {
    method,
    url: PROMPT_OPTIMIZER_ROUTE,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function mountRoute(serviceDeps = {}) {
  let route = null
  const webServer = {
    register: (definition) => {
      route = definition
      return () => { route = null }
    },
  }
  registerPromptOptimizerRoutes(webServer, {
    getConnection: () => ({ requestRejection: () => undefined }),
    credentialsPath: '/nonexistent/cred.yaml',
    ...serviceDeps,
  })
  assert.ok(route, 'route should be registered')
  return route
}

async function call(route, req) {
  const res = fakeRes()
  await route.handler(req, res)
  return { status: res.status, body: JSON.parse(res.body || '{}') }
}

test('mountPromptOptimizer provides the promptOptimizer seam', async () => {
  const provided = {}
  mountPromptOptimizer(
    { provide: (name, api) => { provided[name] = api }, get: () => undefined },
    { env: ENV },
  )
  assert.ok(provided.promptOptimizer)
  assert.equal(typeof provided.promptOptimizer.evaluate, 'function')
  assert.equal(typeof provided.promptOptimizer.isConfigured, 'function')
  assert.equal(await provided.promptOptimizer.isConfigured(), true)
})

test('mountPromptOptimizer prefers ctx credentials over deps env ordering', async () => {
  const provided = {}
  const credMock = { resolve: async (ref) => (ref === 'JEV_API_KEY' ? { value: 'sk-ctx' } : undefined) }
  mountPromptOptimizer(
    { provide: (name, api) => { provided[name] = api }, get: (name) => (name === 'credentials' ? credMock : undefined) },
    { env: {} },
  )
  assert.equal(await provided.promptOptimizer.isConfigured(), true)
})

test('GET returns configured flag without touching auth or the network', async () => {
  const route = mountRoute({ env: ENV })
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, PROMPT_OPTIMIZER_ROUTE)
  const res = await call(route, fakeReq({ method: 'GET' }))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { configured: true })
})

test('GET reports configured:false when no key is resolvable', async () => {
  const route = mountRoute({ env: {} })
  const res = await call(route, fakeReq({ method: 'GET' }))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { configured: false })
})

test('POST evaluates the draft and returns the filled prompt', async () => {
  let capturedBody = null
  const fetcher = async (url, init) => {
    capturedBody = JSON.parse(init.body)
    return {
      ok: true,
      json: async () => ({
        answers: {
          decision: {
            type: 'choice',
            choice: 'bugfix-production',
            probabilities: { 'bugfix-production': 0.9, 'generic-optimize': 0.1 },
            confidence: 0.9,
          },
        },
      }),
    }
  }
  const route = mountRoute({ env: ENV, fetcher })
  const res = await call(route, fakeReq({
    method: 'POST',
    body: JSON.stringify({ text: '登录接口偶尔报 500' }),
  }))
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.templateId, 'bugfix-production')
  assert.ok(res.body.prompt.includes('登录接口偶尔报 500'))
  assert.equal(capturedBody.model, 'jev-latest')
})

test('POST without a configured key answers 200 + unconfigured without fetching', async () => {
  let called = false
  const fetcher = async () => { called = true }
  const route = mountRoute({ env: {}, fetcher })
  const res = await call(route, fakeReq({
    method: 'POST',
    body: JSON.stringify({ text: '优化一下' }),
  }))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: false, unconfigured: true })
  assert.equal(called, false)
})

test('POST rejects invalid bodies and non-GET/POST methods', async () => {
  const route = mountRoute({ env: ENV })

  const empty = await call(route, fakeReq({ method: 'POST', body: JSON.stringify({}) }))
  assert.equal(empty.status, 400)

  const badJson = await call(route, fakeReq({ method: 'POST', body: '{not json' }))
  assert.equal(badJson.status, 400)
  assert.equal(badJson.body.error, 'invalid-json')

  const put = await call(route, fakeReq({ method: 'PUT' }))
  assert.equal(put.status, 405)
})

test('upstream failure answers 500 with a classified message, never a crash', async () => {
  const fetcher = async () => ({ ok: false, status: 529, text: async () => 'overloaded' })
  const route = mountRoute({ env: ENV, fetcher })
  const res = await call(route, fakeReq({
    method: 'POST',
    body: JSON.stringify({ text: '写个接口' }),
  }))
  assert.equal(res.status, 500)
  assert.equal(res.body.ok, false)
  assert.ok(String(res.body.error).length > 0)
})
