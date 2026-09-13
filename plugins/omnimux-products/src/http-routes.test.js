import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createHubSeams, createProductsDispatcher, sendJson } from './http-routes.js'
import { createLibraryStore } from './library.js'

let root
let realFile

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'products-routes-'))
  realFile = join(root, 'hero.png')
  writeFileSync(realFile, 'png')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeDispatcher(opts = {}) {
  const library = createLibraryStore({
    paths: { libraryFile: join(root, 'store', 'library.json') },
  })
  const deps = { library }
  if (opts.picker) deps.picker = opts.picker
  if (opts.importFromUrl) deps.importFromUrl = opts.importFromUrl
  if (opts.ctx) deps.ctx = opts.ctx
  if (Object.prototype.hasOwnProperty.call(opts, 'hub')) deps.hub = opts.hub
  return { dispatcher: createProductsDispatcher(deps), library }
}

function post(path, body, extra = {}) {
  return { method: 'POST', url: path, body, ...extra }
}

function put(path, body, extra = {}) {
  return { method: 'PUT', url: path, body, ...extra }
}

function del(path, extra = {}) {
  return { method: 'DELETE', url: path, ...extra }
}

describe('ProductsDispatcher state', () => {
  it('returns full state initially and unchanged (no products) when prev matches', async () => {
    const { dispatcher, library } = makeDispatcher()
    const first = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/products/state' })
    assert.equal(first.status, 200)
    assert.equal(first.body.unchanged, false)
    assert.equal(first.body.revision, 0)
    assert.deepEqual(first.body.products, [])

    library.add({ name: '某防晒', selling_points: '清爽' })
    const second = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/products/state?prev=0' })
    assert.equal(second.status, 200)
    assert.equal(second.body.unchanged, false)
    assert.equal(second.body.products.length, 1)
    assert.equal(Object.prototype.hasOwnProperty.call(second.body, 'products'), true)

    const rev = second.body.revision
    const third = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/products/state?prev=${rev}` })
    assert.equal(third.body.unchanged, true)
    assert.equal(third.body.revision, rev)
    assert.equal(Object.prototype.hasOwnProperty.call(third.body, 'products'), false)
  })
})

describe('ProductsDispatcher CRUD', () => {
  it('creates, conflicts 409, 404s missing, and deletes via REST verbs', async () => {
    const { dispatcher, library } = makeDispatcher()
    const created = await dispatcher.dispatch(post('/omnimux/products', {
      name: '某防晒',
      selling_points: '清爽不粘腻',
      media: [{ real_path: realFile }],
    }))
    assert.equal(created.status, 200)
    assert.equal(created.body.product.cite, '@产品/某防晒')
    assert.equal(library.list().length, 1)
    const id = created.body.product.id

    const conflict = await dispatcher.dispatch(post('/omnimux/products', { name: '某防晒' }))
    assert.equal(conflict.status, 409)
    assert.equal(conflict.body.error, 'name-conflict')

    const missing = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/products/prd_deadbeef' })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error, 'product-not-found')

    const updated = await dispatcher.dispatch(put(`/omnimux/products/${id}`, { price: '199' }))
    assert.equal(updated.status, 200)
    assert.equal(updated.body.product.price, '199')

    const listed = await dispatcher.dispatch({ method: 'GET', url: '/omnimux/products?q=清爽' })
    assert.equal(listed.status, 200)
    assert.equal(listed.body.products.length, 1)

    const media = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/products/${id}/media` })
    assert.equal(media.status, 200)
    assert.equal(media.body.media.length, 1)

    const deleted = await dispatcher.dispatch(del(`/omnimux/products/${id}`))
    assert.equal(deleted.status, 200)
    assert.equal(library.list().length, 0)

    const gone = await dispatcher.dispatch(del(`/omnimux/products/${id}`))
    assert.equal(gone.status, 404)
  })

  it('returns 400 for invalid or unavailable media without creating or changing products', async () => {
    const { dispatcher, library } = makeDispatcher()
    for (const [path, code] of [
      ['relative/hero.png', 'media-path-invalid'],
      [join(root, 'missing.png'), 'media-path-unavailable'],
    ]) {
      const rejected = await dispatcher.dispatch(post('/omnimux/products', {
        name: '无效商品', media: [{ real_path: path }],
      }))
      assert.equal(rejected.status, 400)
      assert.equal(rejected.body.error, code)
    }
    assert.deepEqual(library.list(), [])
    assert.equal(library.revision(), 0)

    const product = library.add({ name: '某防晒', price: '99', media: [{ real_path: realFile }] })
    const before = library.get(product.id)
    const rejected = await dispatcher.dispatch(put(`/omnimux/products/${product.id}`, {
      name: '新名称', price: '199', media: [{ real_path: join(root, 'missing.png') }],
    }))
    assert.equal(rejected.status, 400)
    assert.equal(rejected.body.error, 'media-path-unavailable')
    assert.deepEqual(library.get(product.id), before)
    assert.equal(library.revision(), 1)
  })

  it('PUT without a JSON object is invalid-json', async () => {
    const { dispatcher } = makeDispatcher()
    const created = await dispatcher.dispatch(post('/omnimux/products', { name: '某防晒' }))
    const id = created.body.product.id
    const bad = await dispatcher.dispatch(put(`/omnimux/products/${id}`, null))
    assert.equal(bad.status, 400)
    assert.equal(bad.body.error, 'invalid-json')
  })
})

describe('ProductsDispatcher kind + brand_strategy', () => {
  it('POST digital + strategy 200', async () => {
    const { dispatcher } = makeDispatcher()
    const created = await dispatcher.dispatch(post('/omnimux/products', {
      name: '数字货',
      kind: 'digital',
      selling_points: '订阅制',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    }))
    assert.equal(created.status, 200)
    assert.equal(created.body.product.kind, 'digital')
    assert.equal(created.body.product.brand_strategy.brand_basic_info.product.name, 'X')
  })

  it('kind service 400', async () => {
    const { dispatcher } = makeDispatcher()
    const bad = await dispatcher.dispatch(post('/omnimux/products', { name: '服务货', kind: 'service' }))
    assert.equal(bad.status, 400)
    assert.equal(bad.body.error, 'kind-invalid')
  })

  it('PUT only price keeps strategy; PUT null clears', async () => {
    const { dispatcher } = makeDispatcher()
    const created = await dispatcher.dispatch(post('/omnimux/products', {
      name: '某防晒',
      selling_points: '清爽',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    }))
    const id = created.body.product.id

    const priced = await dispatcher.dispatch(put(`/omnimux/products/${id}`, { price: '199' }))
    assert.equal(priced.status, 200)
    assert.equal(priced.body.product.price, '199')
    assert.equal(priced.body.product.brand_strategy.brand_basic_info.product.name, 'X')

    const cleared = await dispatcher.dispatch(put(`/omnimux/products/${id}`, { brand_strategy: null }))
    assert.equal(cleared.status, 200)
    assert.equal(cleared.body.product.brand_strategy, null)
  })

  it('POST [] 400; POST {} stores null', async () => {
    const { dispatcher } = makeDispatcher()
    const arrayBody = await dispatcher.dispatch(post('/omnimux/products', {
      name: '数组战略',
      brand_strategy: [],
    }))
    assert.equal(arrayBody.status, 400)
    assert.equal(arrayBody.body.error, 'brand-strategy-invalid')

    const emptyObj = await dispatcher.dispatch(post('/omnimux/products', {
      name: '空战略',
      brand_strategy: {},
    }))
    assert.equal(emptyObj.status, 200)
    assert.equal(emptyObj.body.product.brand_strategy, null)
  })
})

describe('ProductsDispatcher loopback guard', () => {
  it('rejects cross-origin POST/PUT/DELETE with 403 not-local', async () => {
    const { dispatcher } = makeDispatcher()
    const evilPost = await dispatcher.dispatch(post('/omnimux/products', { name: 'x' }, { origin: 'http://evil.example' }))
    assert.equal(evilPost.status, 403)
    assert.equal(evilPost.body.error, 'not-local')

    const local = await dispatcher.dispatch(post('/omnimux/products', { name: '本机货' }, { origin: 'http://127.0.0.1:3210' }))
    assert.equal(local.status, 200)
    const id = local.body.product.id

    const evilPut = await dispatcher.dispatch(put(`/omnimux/products/${id}`, { price: '1' }, { origin: 'http://evil.example' }))
    assert.equal(evilPut.status, 403)

    const evilDel = await dispatcher.dispatch(del(`/omnimux/products/${id}`, { secFetchSite: 'cross-site' }))
    assert.equal(evilDel.status, 403)
  })
})

describe('ProductsDispatcher import-from-link', () => {
  it('POST returns { success, data } and forwards url + kind to the importer', async () => {
    const seen = []
    const imported = { name: '某防晒 50ml', brand: 'Aurora', categories: ['Beauty'], images: [] }
    const { dispatcher, library } = makeDispatcher({
      importFromUrl: async (args) => {
        seen.push(args)
        return imported
      },
    })

    const ok = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'https://shop.example.com/p/1',
      kind: 'digital',
    }))
    assert.equal(ok.status, 200)
    assert.equal(ok.body.success, true)
    assert.deepEqual(ok.body.data, imported)
    assert.equal(seen.length, 1)
    // The url, the kind and the hub seams cross; this vertical holds no
    // credential and calls no OmniMux HTTP surface of its own.
    assert.equal(seen[0].url, 'https://shop.example.com/p/1')
    assert.equal(seen[0].kind, 'digital')
    assert.equal(seen[0].hub, null, 'no host ctx means no hub seams, not a failure')
    // Importing never writes to the library.
    assert.deepEqual(library.list(), [])
    assert.equal(library.revision(), 0)
  })

  it('hands the host seats to the importer as hub seams', async () => {
    const seen = []
    const textComplete = { execute: async () => ({ text: 'ok' }) }
    const pageFetch = { execute: async () => ({ pageContent: '# page' }) }
    const ctx = { tools: { get: (name) => (name === 'omnimux_page_fetch' ? pageFetch : undefined) }, get: () => textComplete }
    const { dispatcher } = makeDispatcher({
      ctx,
      importFromUrl: async (args) => {
        seen.push(args)
        return { name: '货' }
      },
    })
    const ok = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: 'https://shop.example.com/p/1' }))
    assert.equal(ok.status, 200)
    assert.equal(typeof seen[0].hub.pageFetch, 'function')
    assert.equal(typeof seen[0].hub.textComplete, 'function')
    const answer = await seen[0].hub.textComplete({ prompt: 'hi', model: 'gemini-3.8-flash', maxTokens: 12 })
    assert.deepEqual(answer, { text: 'ok' })
    assert.deepEqual(await seen[0].hub.pageFetch('https://shop.example.com/p/1'), { pageContent: '# page' })
  })

  it('defaults kind to physical when the body omits it', async () => {
    const seen = []
    const { dispatcher } = makeDispatcher({
      importFromUrl: async (args) => {
        seen.push(args)
        return { name: '货' }
      },
    })
    const ok = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: 'https://shop.example.com/p/1' }))
    assert.equal(ok.status, 200)
    assert.equal(seen[0].kind, 'physical')
  })

  it('validates the url with the real importer and answers 400 invalid-url', async () => {
    const { dispatcher } = makeDispatcher()
    for (const bad of ['javascript:alert(1)', 'http://127.0.0.1:8080/p', 'not a url', '']) {
      const rejected = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: bad }))
      assert.equal(rejected.status, 400, `expected 400 for ${bad}`)
      assert.equal(rejected.body.error, 'invalid-url')
    }
  })

  it('rejects an unknown kind and a non-object body', async () => {
    const { dispatcher } = makeDispatcher()
    const badKind = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'https://shop.example.com/p/1',
      kind: 'service',
    }))
    assert.equal(badKind.status, 400)
    assert.equal(badKind.body.error, 'kind-invalid')

    const badBody = await dispatcher.dispatch(post('/omnimux/products/import-from-link', null))
    assert.equal(badBody.status, 400)
    assert.equal(badBody.body.error, 'invalid-json')
  })

  it('maps an importer failure onto its own status code', async () => {
    const { dispatcher } = makeDispatcher({
      importFromUrl: async () => {
        const { LinkImportError } = await import('./link-importer.js')
        throw new LinkImportError('link-import-failed', 'the page responded HTTP 500')
      },
    })
    const failed = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: 'https://shop.example.com/p/1' }))
    assert.equal(failed.status, 502)
    assert.equal(failed.body.error, 'link-import-failed')
  })

  it('answers 422 link-import-empty for a page with no product information', async () => {
    const { dispatcher } = makeDispatcher({
      importFromUrl: async () => {
        const { LinkImportError } = await import('./link-importer.js')
        throw new LinkImportError('link-import-empty', 'no product information was found on the page')
      },
    })
    const empty = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: 'https://shop.example.com/p/1' }))
    assert.equal(empty.status, 422)
    assert.equal(empty.body.error, 'link-import-empty')
  })

  it('reaches that 422 through the real importer and a chrome-only page', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<head><title>首页 | Example Store</title></head><body><ul><li>首页</li><li>登录</li><li>购物车</li></ul></body>',
    })
    try {
      const { dispatcher } = makeDispatcher()
      const empty = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: 'https://shop.example.com/p/1' }))
      assert.equal(empty.status, 422)
      assert.equal(empty.body.error, 'link-import-empty')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('keeps the local-write guard on the import route', async () => {
    const { dispatcher } = makeDispatcher({ importFromUrl: async () => ({ name: '货' }) })
    const evil = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'https://shop.example.com/p/1',
    }, { origin: 'http://evil.example' }))
    assert.equal(evil.status, 403)
    assert.equal(evil.body.error, 'not-local')

    const crossSite = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'https://shop.example.com/p/1',
    }, { secFetchSite: 'cross-site' }))
    assert.equal(crossSite.status, 403)

    const local = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'https://shop.example.com/p/1',
    }, { origin: 'http://127.0.0.1:3210' }))
    assert.equal(local.status, 200)
  })
})

describe('products hub seams', () => {
  it('answers null without a host context, and resolves nothing eagerly', () => {
    assert.equal(createHubSeams(undefined), null)
    assert.equal(createHubSeams(null), null)
    const seams = createHubSeams({})
    assert.equal(typeof seams.textComplete, 'function')
    assert.equal(typeof seams.pageFetch, 'function')
  })

  it('prefers the provided textComplete service', async () => {
    const calls = []
    const ctx = {
      get: (name) => (name === 'textComplete' ? { execute: async (req) => { calls.push(req); return { text: 'x' } } } : undefined),
    }
    const seams = createHubSeams(ctx)
    const answer = await seams.textComplete({ prompt: 'p', model: 'gemini-3.8-flash', maxTokens: 32 })
    assert.deepEqual(answer, { text: 'x' })
    assert.deepEqual(calls, [{ prompt: 'p', model: 'gemini-3.8-flash', maxTokens: 32 }])
  })

  it('falls back to the omnimux_text_complete tool with the wire field names it needs', async () => {
    const calls = []
    const ctx = {
      get: () => undefined,
      tools: { get: (name) => (name === 'omnimux_text_complete' ? { execute: async (args) => { calls.push(args); return { text: 'y' } } } : undefined) },
    }
    const seams = createHubSeams(ctx)
    const answer = await seams.textComplete({ prompt: 'p', model: 'gemini-3.8-flash', maxTokens: 32 })
    assert.deepEqual(answer, { text: 'y' })
    // The official tool requires a reason and spells the cap max_tokens.
    assert.equal(calls[0].max_tokens, 32)
    assert.equal(calls[0].model, 'gemini-3.8-flash')
    assert.match(calls[0].reason, /omnimux-products/)
  })

  it('reads the page through omnimux_page_fetch, and fails loudly when the hub is missing', async () => {
    const ctx = { tools: { get: (name) => (name === 'omnimux_page_fetch' ? { execute: async (args) => ({ pageContent: `# ${args.url}` }) } : undefined) } }
    const seams = createHubSeams(ctx)
    assert.deepEqual(await seams.pageFetch('https://a.example'), { pageContent: '# https://a.example' })

    const bare = createHubSeams({})
    await assert.rejects(() => bare.pageFetch('https://a.example'), /omnimux_page_fetch unavailable/)
    await assert.rejects(() => bare.textComplete({ prompt: 'p' }), /omnimux_text_complete unavailable/)
  })

  it('survives a ctx whose get() throws', async () => {
    const ctx = {
      get: () => { throw new Error('no such seat') },
      tools: { get: (name) => (name === 'omnimux_text_complete' ? { execute: async () => ({ text: 'z' }) } : undefined) },
    }
    const seams = createHubSeams(ctx)
    assert.deepEqual(await seams.textComplete({ prompt: 'p' }), { text: 'z' })
  })
})

describe('products responses · secret guard', () => {
  function fakeRes() {
    const out = { status: 0, body: '' }
    return {
      out,
      writeHead: (status) => { out.status = status },
      end: (text) => { out.body = text },
    }
  }

  it('emits ordinary page copy that merely contains "sk-"', () => {
    const res = fakeRes()
    sendJson(res, 200, { data: { selling_points: 'risk-free, task-focused, desk-lamp' } })
    assert.equal(res.out.status, 200)
    assert.match(res.out.body, /risk-free/)
  })

  it('still refuses a real-looking key and an access token', () => {
    for (const body of [
      { data: { note: 'sk-proj-abcdefghijklmnopqrstuvwxyz012345' } },
      { data: { note: 'access_token=abc' } },
    ]) {
      const res = fakeRes()
      sendJson(res, 200, body)
      assert.equal(res.out.status, 500)
      assert.match(res.out.body, /refused to emit a secret/)
    }
  })
})
