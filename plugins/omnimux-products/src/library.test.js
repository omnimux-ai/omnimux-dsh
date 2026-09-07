import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createLibraryStore, isDigitalProduct, normalizeBrandStrategy, ProductsError } from './library.js'

let root
let realFile

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'products-library-'))
  realFile = join(root, 'hero.png')
  writeFileSync(realFile, 'png')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeStore() {
  return createLibraryStore({
    paths: { libraryFile: join(root, 'store', 'library.json') },
  })
}

describe('LibraryStore add/list', () => {
  it('UI create may save with name only', () => {
    const store = makeStore()
    const product = store.add({ name: '某防晒' })
    assert.match(product.id, /^prd_[0-9a-f]{8}$/)
    assert.equal(product.kind, 'physical')
    assert.equal(product.status, 'active')
    assert.equal(product.brand_strategy, null)
    assert.equal(product.source, 'manual')
    assert.equal(product.handle, '某防晒')
    assert.equal(product.cite, '@产品/某防晒')
    assert.equal(product.selling_points, '')
    assert.equal(product.description, '')
    assert.equal(store.revision(), 1)
  })

  it('agent create without selling_points and description throws content-required', () => {
    const store = makeStore()
    assert.throws(
      () => store.add({ name: '空货', requireContent: true }),
      (error) => error instanceof ProductsError && error.code === 'content-required',
    )
    assert.throws(
      () => store.add({ name: '空货', requireContent: true, selling_points: '  ', description: '' }),
      (error) => error.code === 'content-required',
    )
    const ok = store.add({ name: '某防晒', requireContent: true, selling_points: '清爽不粘腻' })
    assert.equal(ok.name, '某防晒')
  })

  it('rejects blank names, slashes, and duplicate handles with 409 semantics', () => {
    const store = makeStore()
    assert.throws(() => store.add({ name: '  ' }), (error) => error.code === 'name-required')
    assert.throws(() => store.add({ name: 'a/b' }), (error) => error.code === 'name-invalid')
    store.add({ name: '某防晒' })
    assert.throws(() => store.add({ name: '某防晒' }), (error) => error.code === 'name-conflict')
  })

  it('search hits selling_points, brand, and sku', () => {
    const store = makeStore()
    store.add({ name: '某防晒', selling_points: '清爽不粘腻', brand: '安耐晒', sku: 'AN-01' })
    store.add({ name: '唇釉', selling_points: '显白' })
    assert.equal(store.list({ query: '清爽' }).length, 1)
    assert.equal(store.list({ query: '安耐晒' })[0].name, '某防晒')
    assert.equal(store.list({ query: 'AN-01' }).length, 1)
  })
})

describe('LibraryStore path refs', () => {
  function invalidMediaCases() {
    return [
      { media: [null], code: 'media-path-invalid' },
      { media: [{ real_path: '' }], code: 'media-path-invalid' },
      { media: [{ real_path: 'relative/hero.png' }], code: 'media-path-invalid' },
      { media: [{ real_path: `${realFile}\0` }], code: 'media-path-invalid' },
      { media: [{ real_path: join(root, 'missing.png') }], code: 'media-path-unavailable' },
      { media: [{ real_path: root }], code: 'media-path-unavailable' },
    ]
  }

  it('rejects invalid paths on create without persisting a partial product', () => {
    const store = makeStore()
    for (const { media, code } of invalidMediaCases()) {
      assert.throws(
        () => store.add({ name: '定妆货', media: [{ real_path: realFile }, ...media] }),
        (error) => error instanceof ProductsError && error.code === code,
      )
      assert.deepEqual(store.list(), [])
      assert.equal(store.revision(), 0)
      assert.equal(existsSync(join(root, 'store', 'library.json')), false)
    }
    assert.equal(readFileSync(realFile, 'utf8'), 'png')
  })

  it('rejects invalid media updates before mutating any product fields or persisted state', () => {
    const store = makeStore()
    const product = store.add({ name: '某防晒', price: '99', media: [{ real_path: realFile }] })
    const before = store.get(product.id)
    const file = join(root, 'store', 'library.json')
    const persisted = readFileSync(file, 'utf8')
    for (const { media, code } of invalidMediaCases()) {
      assert.throws(
        () => store.update(product.id, {
          name: '新名称', kind: 'digital', price: '199', categories: ['新类别'], language: 'en',
          media: [{ real_path: realFile }, ...media], cover_media_id: null,
          brand_strategy: { brand_basic_info: { product: { name: '新战略' } } },
        }),
        (error) => error instanceof ProductsError && error.code === code,
      )
      assert.deepEqual(store.get(product.id), before)
      assert.equal(store.revision(), 1)
      assert.equal(readFileSync(file, 'utf8'), persisted)
    }
    assert.equal(readFileSync(realFile, 'utf8'), 'png')
  })

  it('rejects unreadable paths and preserves an existing product', () => {
    const store = createLibraryStore({
      paths: { libraryFile: join(root, 'store', 'library.json') },
      fs: { accessSync: () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) } },
    })
    const product = store.add({ name: '某防晒' })
    const before = store.get(product.id)
    assert.throws(
      () => store.update(product.id, { name: '新名称', media: [{ real_path: realFile }] }),
      (error) => error.code === 'media-path-unavailable',
    )
    assert.deepEqual(store.get(product.id), before)
    assert.equal(store.revision(), 1)
  })

  it('hides persisted media that vanish later without changing the source file', () => {
    const store = makeStore()
    const product = store.add({
      name: '定妆货',
      media: [{ real_path: realFile }],
    })
    assert.equal(product.media.length, 1)
    assert.equal(product.media[0].real_path, realFile)

    const gone = join(root, 'gone.jpg')
    writeFileSync(gone, 'jpg')
    store.update(product.id, { media: [{ real_path: realFile }, { real_path: gone }] })
    rmSync(gone)
    const view = store.getView(product.id)
    assert.equal(view.media.length, 1)
    assert.equal(view.media[0].real_path, realFile)
    assert.equal(view.missing_media_count, 1)
    assert.equal(statSync(realFile).isFile(), true)
  })

  it('remove drops the JSON record and never unlinks the real file', () => {
    const store = makeStore()
    const product = store.add({ name: '某防晒', media: [{ real_path: realFile }] })
    store.remove(product.id)
    assert.equal(store.list().length, 0)
    assert.equal(statSync(realFile).isFile(), true)
  })
})

describe('kind + brand_strategy persist', () => {
  it('normalizeBrandStrategy(null|undefined|"") === null', () => {
    assert.equal(normalizeBrandStrategy(null), null)
    assert.equal(normalizeBrandStrategy(undefined), null)
    assert.equal(normalizeBrandStrategy(''), null)
  })

  it('[] / 1 throw brand-strategy-invalid', () => {
    assert.throws(
      () => normalizeBrandStrategy([]),
      (error) => error instanceof ProductsError && error.code === 'brand-strategy-invalid',
    )
    assert.throws(
      () => normalizeBrandStrategy(1),
      (error) => error instanceof ProductsError && error.code === 'brand-strategy-invalid',
    )
  })

  it('empty object → null', () => {
    assert.equal(normalizeBrandStrategy({}), null)
  })

  it('partial product name persists and fills missing keys', () => {
    const out = normalizeBrandStrategy({ brand_basic_info: { product: { name: 'X' } } })
    assert.equal(out.brand_basic_info.product.name, 'X')
    assert.equal(out.brand_basic_info.company.locale, 'auto')
    assert.equal(out.brand_basic_info.company.name, '')
    assert.deepEqual(out.content_angles, [])
    assert.deepEqual(out.tone_and_voice, { dos: [], donts: [] })
    assert.equal(out.identity_and_product.core_identity, '')
    assert.deepEqual(out.mission_and_positioning.ownable_space, { statement: '', category: '', is_not: [] })
    assert.deepEqual(out.market_and_competition, { customer_segments: [], competitors: [] })
  })

  it('unknown keys such as fileId are dropped', () => {
    const out = normalizeBrandStrategy({
      fileId: 'keep-me-not',
      file_id: 'nope',
      signed_url: 'https://example',
      brand_basic_info: { product: { name: 'X', extra: 1 } },
    })
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'fileId'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'file_id'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'signed_url'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(out.brand_basic_info.product, 'extra'), false)
  })

  it('isDigitalProduct is true only for digital + persisted strategy', () => {
    const strategy = normalizeBrandStrategy({ brand_basic_info: { product: { name: 'X' } } })
    assert.equal(isDigitalProduct({ kind: 'digital', brand_strategy: null }), false)
    assert.equal(isDigitalProduct({ kind: 'digital', brand_strategy: strategy }), true)
    assert.equal(isDigitalProduct({ kind: 'physical', brand_strategy: strategy }), false)
  })

  it('add digital without strategy or selling copy is allowed on UI; strategy stays null', () => {
    const store = makeStore()
    const product = store.add({ name: '数字货', kind: 'digital' })
    assert.equal(product.kind, 'digital')
    assert.equal(product.brand_strategy, null)
  })

  it('agent digital create accepts strategy or link as content', () => {
    const store = makeStore()
    const viaStrategy = store.add({
      name: '战略货',
      kind: 'digital',
      requireContent: true,
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    })
    assert.equal(viaStrategy.brand_strategy.brand_basic_info.product.name, 'X')
    const viaLink = store.add({
      name: '链接货',
      kind: 'digital',
      requireContent: true,
      link: 'https://example.com',
    })
    assert.equal(viaLink.link, 'https://example.com')
    assert.throws(
      () => store.add({ name: '空数字货', kind: 'digital', requireContent: true }),
      (error) => error instanceof ProductsError && error.code === 'content-required',
    )
  })

  it('add digital + selling_points + strategy round-trips', () => {
    const store = makeStore()
    const product = store.add({
      name: '数字货',
      kind: 'digital',
      selling_points: '订阅制',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    })
    assert.equal(product.kind, 'digital')
    assert.equal(product.brand_strategy.brand_basic_info.product.name, 'X')
    const got = store.get(product.id)
    assert.equal(got.brand_strategy.brand_basic_info.product.name, 'X')
  })

  it('add kind nope → kind-invalid', () => {
    const store = makeStore()
    assert.throws(
      () => store.add({ name: '坏货', kind: 'nope' }),
      (error) => error instanceof ProductsError && error.code === 'kind-invalid',
    )
  })

  it('omitted kind defaults to physical', () => {
    const store = makeStore()
    const product = store.add({ name: '实体货' })
    assert.equal(product.kind, 'physical')
  })

  it('source url-import | brand-analysis is written as manual', () => {
    const store = makeStore()
    const a = store.add({ name: '抓取货', source: 'url-import' })
    const b = store.add({ name: '分析货', source: 'brand-analysis' })
    assert.equal(a.source, 'manual')
    assert.equal(b.source, 'manual')
  })

  it('hand-written json with strategy hydrates non-null on a new store', () => {
    const file = join(root, 'store', 'library.json')
    mkdirSync(join(root, 'store'), { recursive: true })
    writeFileSync(file, `${JSON.stringify({
      schema: 1,
      revision: 1,
      products: [{
        id: 'prd_abc12345',
        name: '手写货',
        handle: '手写货',
        kind: 'digital',
        description: '',
        selling_points: '卖点',
        target_audience: '',
        brand: '',
        features: '',
        price: '',
        sku: '',
        promotion: '',
        categories: [],
        language: 'auto',
        status: 'active',
        link: '',
        media: [],
        cover_media_id: null,
        brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
        source: 'manual',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
    }, null, 2)}\n`)
    const store = createLibraryStore({ paths: { libraryFile: file } })
    const got = store.get('prd_abc12345')
    assert.ok(got.brand_strategy)
    assert.equal(got.brand_strategy.brand_basic_info.product.name, 'X')
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).products[0].brand_strategy.brand_basic_info.product.name, 'X')
  })

  it('update only price does not clear strategy', () => {
    const store = makeStore()
    const product = store.add({
      name: '某防晒',
      selling_points: '清爽',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    })
    const updated = store.update(product.id, { price: '199' })
    assert.equal(updated.price, '199')
    assert.equal(updated.brand_strategy.brand_basic_info.product.name, 'X')
  })

  it('update brand_strategy:null clears', () => {
    const store = makeStore()
    const product = store.add({
      name: '某防晒',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    })
    const updated = store.update(product.id, { brand_strategy: null })
    assert.equal(updated.brand_strategy, null)
  })

  it('update omitting the key keeps strategy', () => {
    const store = makeStore()
    const product = store.add({
      name: '某防晒',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    })
    const updated = store.update(product.id, { sku: 'AN-01' })
    assert.equal(updated.sku, 'AN-01')
    assert.equal(updated.brand_strategy.brand_basic_info.product.name, 'X')
  })

  it('illegal kind on update → kind-invalid', () => {
    const store = makeStore()
    const product = store.add({ name: '某防晒' })
    assert.throws(
      () => store.update(product.id, { kind: 'service' }),
      (error) => error instanceof ProductsError && error.code === 'kind-invalid',
    )
  })

  it('get() clones brand_strategy so UI cannot mutate the in-memory store', () => {
    const store = makeStore()
    const product = store.add({
      name: '某防晒',
      brand_strategy: { brand_basic_info: { product: { name: 'X' } } },
    })
    const first = store.get(product.id)
    first.brand_strategy.brand_basic_info.product.name = 'mutated'
    const second = store.get(product.id)
    assert.equal(second.brand_strategy.brand_basic_info.product.name, 'X')
  })
})

describe('LibraryStore corrupt JSON', () => {
  it('explicitly fails when library.json is not valid JSON', () => {
    const file = join(root, 'store', 'library.json')
    mkdirSync(join(root, 'store'), { recursive: true })
    writeFileSync(file, '{not json')
    assert.throws(
      () => createLibraryStore({ paths: { libraryFile: file } }),
      (error) => error instanceof ProductsError && error.code === 'library-corrupt',
    )
  })
})
