import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, request as httpRequest } from 'node:http'
import { mountHubHttp } from '../host/http.js'
import { createGenerationProducts } from './generation-products.js'
import { registerCatalogRoutes } from './http.js'

function products() {
  const models = [{ id: 'PRIVATE-MODEL', routing: { channel: 'fixture', wireModel: 'PRIVATE-WIRE', protocol: 'fixture' },
    parameters: { n: { type: 'number', range: { min: 0, max: 20 }, defaultValue: 5 } },
    operations: [{ id: 'text_to_image', inputs: [], output: { type: 'image' } }] }]
  const api = createGenerationProducts({
    readIndex: () => ({ schemaVersion: '1.1', issues: [], parseErrors: [], all: () => models,
      registry: { operations: [{ id: 'text_to_image', label: '文生图', defaultOutputType: 'image' },
        { id: 'image_to_image', label: '图生图', defaultOutputType: 'image' }, { id: 'multi_reference', label: '多图主体参考', defaultOutputType: 'image' },
        { id: 'video_multi_ref', label: '全能参考', defaultOutputType: 'video' }, { id: 'first_last_frame', label: '首尾帧过渡', defaultOutputType: 'video' }] } }),
    readGroups: () => [{ id: 'PRIVATE-GROUP', wireGroup: 'PRIVATE-WIRE-GROUP', enabled: true, constraints: {} }],
    readQualification: ({ identity, domain }) => ({ identity, domain, active: true, sourceDigest: 'a'.repeat(64), documentVersion: 'fixture-v1',
      sample: { mode: 'live', taskId: 'PRIVATE-TASK', output: { type: 'image', verified: true } } }),
  })
  return { api, models }
}
function mount(api, connection = { requestRejection: () => undefined }) {
  const routes = []; const stopped = []; let calls = 0
  mountHubHttp({ webServer: { register(route) { routes.push(route); return () => stopped.push(route.path) } } }, {
    store: {}, identity: { require() { throw new Error('identity must not be called') } }, siteBaseUrl: 'https://example.invalid', clientName: 'fixture',
    hub: { official: { mount: false }, apps: {} }, brand: {}, homeDir: 'unused', profile: 'unused',
    appsStore: { view: () => ({ apps: [] }) }, tabsStore: {}, accountMetaStore: {}, avatarStore: {}, listCatalog: () => ({ old: true }),
    products: { list: () => api.list(), preparePreview: r => { calls++; return api.preparePreview(r) } }, getConnection: () => connection,
  })
  return { routes, stopped, calls: () => calls }
}
async function dispatch(m, path, { method = 'GET', headers = {}, body = '', chunks } = {}) {
  const route = m.routes.find(r => r.path === path); assert.ok(route, `actual Host mount missing ${path}`)
  let reads = 0; let status; let text
  await route.handler({ method, url: path, headers: { host: '127.0.0.1:12345', ...headers }, socket: {},
    async *[Symbol.asyncIterator]() { for (const chunk of chunks ?? [Buffer.from(body)]) { reads++; yield chunk } } },
  { writeHead(value) { status = value }, end(value) { text = value } })
  return { status, body: JSON.parse(text), reads }
}
const req = (api, changes = {}) => ({ schemaVersion: 1, currentFingerprint: api.list().currentFingerprint,
  productId: 'generation.image', intent: 'text_to_image', parameters: {}, assets: [], ...changes })

test('AC8 actual Host mount preserves legacy catalog and new GET/POST cross the same product Interface', async () => {
  const { api } = products(); const m = mount(api)
  assert.deepEqual((await dispatch(m, '/omnimux/model-catalog')).body, { old: true })
  const directory = await dispatch(m, '/omnimux/generation-products')
  assert.equal(directory.status, 200); assert.deepEqual(directory.body, api.list())
  const body = req(api, { parameters: { n: 7 } })
  const checked = await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', body: JSON.stringify(body) })
  assert.equal(checked.status, 200); assert.deepEqual(checked.body, api.preparePreview(body)); assert.equal(checked.body.executable, false)
  assert.equal(m.calls(), 1)
  assert.equal((await dispatch(m, '/omnimux/generation-products', { method: 'POST' })).status, 404)
  assert.equal((await dispatch(m, '/omnimux/generation-products/preview')).status, 404)
})
test('both mounted routes authorize before body: exact origin, unauthenticated and missing connection', async () => {
  const { api } = products()
  for (const [connection, headers, expected] of [[undefined, {}, 503], [{ requestRejection: () => 401 }, {}, 401],
    [{ requestRejection: () => undefined }, { origin: 'https://foreign.invalid' }, 403],
    [{ requestRejection: () => undefined }, { origin: 'http://127.0.0.1:12345/path' }, 403]]) {
    const m = mount(api, connection === undefined ? null : connection)
    for (const [path, method] of [['/omnimux/generation-products', 'GET'], ['/omnimux/generation-products/preview', 'POST']]) {
      const result = await dispatch(m, path, { method, headers, body: JSON.stringify(req(api)) })
      assert.equal(result.status, expected); assert.equal(result.reads, 0); assert.deepEqual(result.body, { error: 'request-denied' })
    }
    assert.equal(m.calls(), 0)
  }
})
test('exact 1048576 UTF8 bytes accepted, 1048577 rejects at first oversized chunk without preview or remaining reads', async () => {
  const { api } = products(); const m = mount(api)
  const text = JSON.stringify(req(api)); const exact = text + ' '.repeat(1048576 - Buffer.byteLength(text))
  const limit = await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', body: exact })
  assert.equal(limit.status, 200); assert.equal(m.calls(), 1)
  const tooLarge = await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', chunks: [Buffer.from(exact + ' '), Buffer.from('unused')] })
  assert.equal(tooLarge.status, 413); assert.equal(tooLarge.reads, 1); assert.equal(m.calls(), 1)
  assert.deepEqual(tooLarge.body.issues, [{ code: 'request_too_large' }]); assert.equal(tooLarge.body.executable, false)
})
test('mounted POST reports fixed public invalid, stale and unavailable outcomes without private details', async () => {
  const { api, models } = products(); const m = mount(api)
  for (const [body, code] of [['{', 'invalid_request'], [JSON.stringify(req(api, { model: 'PRIVATE' })), 'invalid_request'],
    [JSON.stringify(req(api, { schemaVersion: 2 })), 'unsupported_version'], [JSON.stringify(req(api, { parameters: { unknown: 1 } })), 'unknown_parameter']]) {
    const result = await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', body })
    assert.equal(result.status, 400); assert.deepEqual(result.body.issues, [{ code }])
  }
  const old = req(api); models[0].routing.wireModel = 'changed'
  const stale = await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', body: JSON.stringify(old) })
  assert.equal(stale.status, 409); assert.deepEqual(stale.body.issues, [{ code: 'stale_fingerprint' }])
  const broken = mount({ list() { throw new Error('PRIVATE-PATH') }, preparePreview() { throw new Error('PRIVATE-PATH') } })
  for (const [path, method] of [['/omnimux/generation-products', 'GET'], ['/omnimux/generation-products/preview', 'POST']]) {
    const result = await dispatch(broken, path, { method, body: '{}' })
    assert.equal(result.status, 503); assert.deepEqual(result.body.issues, [{ code: 'catalog_unavailable' }])
    assert.equal(JSON.stringify(result.body).includes('PRIVATE'), false)
  }
})
test('legacy catalog exact body and failure behavior remain unchanged', async () => {
  let route; registerCatalogRoutes({ register(r) { route = r; return () => {} } }, { list: () => ({ source: 'legacy', defaults: {}, text: [], image: [], video: [], audio: [] }) })
  const m = { routes: [route] }; const result = await dispatch(m, '/omnimux/model-catalog')
  assert.equal(result.status, 200); assert.deepEqual(result.body, { source: 'legacy', defaults: {}, text: [], image: [], video: [], audio: [] })
})
test('mounted HTTP over real ephemeral server handles authenticated JSON preview with no provider/auth/task calls', async () => {
  const { api } = products(); const m = mount(api)
  assert.ok(m.routes.find(r => r.path === '/omnimux/generation-products/preview'))
  const server = createServer((req, res) => {
    const route = m.routes.find(r => r.path === req.url)
    if (!route) { res.writeHead(404); res.end('{}'); return }
    void route.handler(req, res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = server.address().port
    const result = await new Promise((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path: '/omnimux/generation-products/preview', method: 'POST' }, response => {
        const chunks = []; response.on('data', c => chunks.push(c)); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }))
      }); request.on('error', reject); request.end(JSON.stringify(req(api)))
    })
    assert.equal(result.status, 200); assert.equal(result.body.status, 'ready'); assert.equal(result.body.executable, false)
    assert.equal(m.calls(), 1)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('repair mounted default prompt shares one frozen text value and stays non-executable', async () => {
  const { api, models } = products()
  models[0].parameters = { prompt: { type: 'string', defaultValue: 'x' } }
  models[0].operations[0].inputs = [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }]
  const m = mount(api)
  const result = await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', body: JSON.stringify(req(api)) })
  assert.equal(result.status, 200); assert.equal(result.body.status, 'ready'); assert.equal(result.body.executable, false)
  assert.deepEqual(result.body.issues, [])
})
test('repair mounted safe access_token parameter never leaks legacy serialization failure', async () => {
  const { api, models } = products(); models[0].parameters = { access_token: { type: 'boolean' } }
  const m = mount(api)
  const responses = [await dispatch(m, '/omnimux/generation-products'),
    await dispatch(m, '/omnimux/generation-products/preview', { method: 'POST', body: JSON.stringify(req(api, { parameters: { access_token: 'invalid' } })) })]
  for (const result of responses) {
    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { schemaVersion: 1, status: 'pending', executable: false, issues: [{ code: 'catalog_unavailable' }] })
  }
})
test('repair repeated mounted guarded labels yield fixed catalog unavailable on both new routes only', async () => {
  const { api, models } = products()
  models[0].parameters.n.options = [{ value: 5, label: 'sk-DUMMYONLY123456' }]
  const m = mount(api)
  for (let i = 0; i < 2; i++) {
    const directory = await dispatch(m, '/omnimux/generation-products')
    assert.equal(directory.status, 503); assert.deepEqual(directory.body.issues, [{ code: 'catalog_unavailable' }])
    assert.equal(JSON.stringify(directory.body).includes('DUMMY'), false)
  }
  const guarded = mount({ list: () => api.list(), preparePreview: () => ({ schemaVersion: 1, status: 'rejected', executable: false,
    issues: [{ code: 'parameter_invalid', field: 'access_token' }] }) })
  const result = await dispatch(guarded, '/omnimux/generation-products/preview', { method: 'POST', body: '{}' })
  assert.equal(result.status, 503); assert.deepEqual(result.body.issues, [{ code: 'catalog_unavailable' }])
  let oldRoute
  registerCatalogRoutes({ register(route) { oldRoute = route; return () => {} } }, { list: () => ({ label: 'access_token' }) })
  assert.deepEqual((await dispatch({ routes: [oldRoute] }, '/omnimux/model-catalog')).body, { error: 'refused to emit a secret' })
})
