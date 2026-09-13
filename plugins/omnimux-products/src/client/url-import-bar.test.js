import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildProductFields, parseHtmlDocument } from '../link-importer.js'
import { importFromLink, isHttpUrl } from './api.js'
import { en, zh } from './locales.js'
import { bundleFormReturn, importedPatchOf } from './useProductFormState.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, name), 'utf8')

const IMPORTED = {
  name: 'Aurora Mug 350ml',
  selling_points: '6 小时长效保温，防滑硅胶底座',
  features: '容量: 350ml',
  target_audience: 'Coffee lovers',
  brand: 'Aurora',
  price: '24.9',
  sku: 'AM-350',
  promotion: 'Checkout today and enjoy free shipping',
  link: 'https://shop.example.com/p/aurora-mug',
  categories: ['Home & Kitchen', 'Drinkware'],
  images: ['https://cdn.example.com/a.jpg'],
}

const STRING_FIELDS = ['name', 'selling', 'audience', 'brand', 'features', 'price', 'sku', 'promotion', 'link']

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('products client · link import copy', () => {
  it('ships the seven url-import keys in both dictionaries', () => {
    const expected = {
      'add.urlImport.placeholder': ['粘贴商品或品牌落地页链接，智能解析填写项...', 'Paste product link to auto-fill fields...'],
      'add.urlImport.button': ['智能解析', 'Auto Fill'],
      'add.urlImport.loading': ['正在解析...', 'Parsing...'],
      'add.urlImport.success': ['解析成功，已自动填入目标项', 'Product info extracted and auto-filled'],
      'add.urlImport.invalidUrl': ['请输入合法的网页链接', 'Please enter a valid URL'],
      'add.urlImport.failed': ['解析失败，请检查链接或手动输入', 'Failed to parse link, please fill manually'],
      'add.urlImport.empty': ['未能提取到有效商品信息，请手动输入', 'No usable product info found, please fill manually'],
    }
    for (const [key, [zhText, enText]] of Object.entries(expected)) {
      assert.equal(zh[key], zhText, `zh ${key}`)
      assert.equal(en[key], enText, `en ${key}`)
    }
  })

  it('reads the empty-page answer as its own message, not a generic failure', () => {
    assert.equal(zh['add.urlImport.empty'], '未能提取到有效商品信息，请手动输入')
    assert.notEqual(zh['add.urlImport.empty'], zh['add.urlImport.failed'])
    assert.match(read('ProductFormFields.jsx'), /result\.body\?\.error === 'link-import-empty' \? 'add\.urlImport\.empty' : 'add\.urlImport\.failed'/)
  })
})

describe('products client · import api', () => {
  it('isHttpUrl accepts a pasted host and refuses junk', () => {
    assert.equal(isHttpUrl('https://shop.example.com/p/1'), true)
    assert.equal(isHttpUrl('shop.example.com/p/1'), true)
    assert.equal(isHttpUrl(''), false)
    assert.equal(isHttpUrl('not a url'), false)
    assert.equal(isHttpUrl('javascript:alert(1)'), false)
  })

  it('POSTs the link to the import route without writing anything', async () => {
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ success: true, data: IMPORTED }) }
    }
    const result = await importFromLink('https://shop.example.com/p/aurora-mug', 'physical')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/omnimux/products/import-from-link')
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      url: 'https://shop.example.com/p/aurora-mug',
      kind: 'physical',
    })
    assert.equal(result.ok, true)
    assert.equal(result.body.data.name, 'Aurora Mug 350ml')
  })
})

describe('products client · importedPatchOf', () => {
  it('maps the server payload onto every form field', () => {
    const patch = importedPatchOf(IMPORTED)
    assert.deepEqual(Object.keys(patch), [...STRING_FIELDS, 'categories'])
    for (const key of STRING_FIELDS) assert.equal(typeof patch[key], 'string', key)
    assert.equal(patch.name, 'Aurora Mug 350ml')
    assert.equal(patch.selling, '6 小时长效保温，防滑硅胶底座')
    assert.equal(patch.audience, 'Coffee lovers')
    assert.equal(patch.brand, 'Aurora')
    assert.equal(patch.price, '24.9')
    assert.equal(patch.sku, 'AM-350')
    assert.equal(patch.link, 'https://shop.example.com/p/aurora-mug')
    assert.deepEqual(patch.categories, ['Home & Kitchen', 'Drinkware'])
  })

  it('never invents values for a malformed payload', () => {
    const patch = importedPatchOf({ name: null, price: 42, categories: ['ok', '', 7, null] })
    for (const key of STRING_FIELDS) assert.equal(patch[key], '', key)
    assert.deepEqual(patch.categories, ['ok'])
    assert.deepEqual(importedPatchOf(null).categories, [])
  })
})

describe('products client · applyImportedData', () => {
  /** Minimal stand-ins for the base / media / strategy hooks. */
  function harness() {
    const writes = []
    const base = {
      fields: Object.fromEntries([...STRING_FIELDS, 'kind'].map((key) => [key, ''])),
      setters: Object.fromEntries(STRING_FIELDS.map((key) => [
        `set${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        (value) => { writes.push([key, value]) },
      ])),
    }
    const mediaState = {
      categories: ['已有标签'],
      setCategories: (next) => {
        writes.push(['categories', typeof next === 'function' ? next(mediaState.categories) : next])
      },
    }
    const strategyState = {
      strategyOpen: false,
      strategyTouched: false,
      strategy: {},
      setStrategyOpen: () => {},
      openStrategy: () => {},
      patchStrategy: () => {},
      handleSelectPhysical: () => {},
      handleSelectDigital: () => {},
    }
    const bundle = bundleFormReturn(base, mediaState, strategyState, false)
    return { bundle, writes }
  }

  it('fills name, selling, audience, brand, features, price, sku, promotion, link and tags', () => {
    const { bundle, writes } = harness()
    bundle.actions.applyImportedData(IMPORTED)
    const applied = Object.fromEntries(writes)
    assert.equal(applied.name, 'Aurora Mug 350ml')
    assert.equal(applied.selling, '6 小时长效保温，防滑硅胶底座')
    assert.equal(applied.audience, 'Coffee lovers')
    assert.equal(applied.brand, 'Aurora')
    assert.equal(applied.features, '容量: 350ml')
    assert.equal(applied.price, '24.9')
    assert.equal(applied.sku, 'AM-350')
    assert.equal(applied.promotion, 'Checkout today and enjoy free shipping')
    assert.equal(applied.link, 'https://shop.example.com/p/aurora-mug')
    assert.deepEqual(applied.categories, ['已有标签', 'Home & Kitchen', 'Drinkware'])
  })

  it('leaves a field untouched when the parse had nothing for it', () => {
    const { bundle, writes } = harness()
    bundle.actions.applyImportedData({ name: 'Only a name' })
    assert.deepEqual(writes, [['name', 'Only a name']])
  })
})

describe('products client · link bar wiring', () => {
  it('renders the bar above the product name field', () => {
    const source = read('ProductFormFields.jsx')
    const barIndex = source.indexOf('<UrlImportBar')
    const nameIndex = source.indexOf('<FormHeaderSection')
    assert.ok(barIndex > 0, 'UrlImportBar is not rendered')
    assert.ok(nameIndex > barIndex, 'the link bar must sit above the name row')
    assert.match(source, /onImported=\{actions\.applyImportedData\}/)
    assert.match(source, /import \{ importFromLink, isHttpUrl \} from '\.\/api\.js'/)
  })

  it('submits on Enter, shows a loading button and answers inline', () => {
    const source = read('ProductFormFields.jsx')
    assert.match(source, /if \(event\.key !== 'Enter'\) return/)
    assert.match(source, /event\.preventDefault\(\)/)
    assert.match(source, /loading=\{phase === 'loading'\}/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.loading'\)\)/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.success'\)\)/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.failed'\)\)/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.invalidUrl'\)\)/)
    assert.match(source, /role="status"/)
  })

  it('declares the bar styles and the link icon', () => {
    const styles = read('styles.js')
    for (const className of [
      'omnimux-products-url-import',
      'omnimux-products-url-import-row',
      'omnimux-products-url-import-input',
      'omnimux-products-url-import-status',
    ]) {
      assert.match(styles, new RegExp(`\\.${className}\\b`))
    }
    assert.match(styles, /@keyframes omnimux-products-fade-in/)
    assert.match(read('icons.jsx'), /export function LinkIcon/)
  })

  // The bar itself draws the only frame; a host stylesheet that styles bare
  // inputs would otherwise draw a second rectangle inside it.
  it('flattens the inner field frame in every state, plus an inline backstop', () => {
    const styles = read('styles.js')
    const start = styles.indexOf('.omnimux-products-url-import-input,')
    const end = styles.indexOf('.omnimux-products-url-import-input::placeholder')
    assert.ok(start >= 0 && end > start, 'state-combined input rule precedes the placeholder rule')
    const fieldRule = styles.slice(start, end)
    const selectors = fieldRule.slice(0, fieldRule.indexOf('{')).split(',').map((s) => s.trim())
    for (const state of [':focus', ':focus-visible', ':active']) {
      assert.ok(selectors.includes(`.omnimux-products-url-import-input${state}`), `rule flattens ${state}`)
    }
    const required = [
      'border: 0 !important',
      'border-width: 0 !important',
      'border-style: none !important',
      'border-color: transparent !important',
      'outline: 0 !important',
      'outline-style: none !important',
      'box-shadow: none !important',
      '-webkit-box-shadow: none !important',
      '-webkit-appearance: none !important',
      'appearance: none !important',
      'background: transparent !important',
      'background-color: transparent !important',
    ]
    for (const declaration of required) {
      assert.ok(fieldRule.includes(declaration), `field rule declares ${declaration}`)
    }

    const view = read('ProductFormFields.jsx')
    assert.match(
      view,
      /style=\{\{ border: 'none', outline: 'none', boxShadow: 'none', background: 'transparent' \}\}[^\n]*exempt-ui02/,
    )
  })
})

describe('products client · server draft contract', () => {
  // Locks the server field names to the client mapping: a rename on either side
  // breaks this test instead of silently filling nothing.
  it('fills every form field from a real importer draft', () => {
    const html = [
      '<title>Aurora Mug 350ml | Example Store</title>',
      '<meta property="og:description" content="Double-wall ceramic mug that keeps coffee hot for 6 hours.">',
      '<script type="application/ld+json">{"@type":"Product","name":"Aurora Mug 350ml","sku":"AM-350",',
      '"brand":{"@type":"Brand","name":"Aurora"},"category":"Home & Kitchen > Drinkware",',
      '"audience":{"@type":"PeopleAudience","audienceType":"Coffee lovers"},',
      '"offers":{"@type":"Offer","price":"24.90"}}</script>',
      '<p>Checkout today and enjoy free shipping on every order.</p>',
    ].join('')
    const draft = buildProductFields({
      url: 'https://shop.example.com/p/aurora-mug',
      page: parseHtmlDocument(html, 'https://shop.example.com/p/aurora-mug'),
    })
    const patch = importedPatchOf(draft)
    assert.equal(patch.name, 'Aurora Mug 350ml')
    assert.equal(patch.brand, 'Aurora')
    assert.equal(patch.sku, 'AM-350')
    assert.equal(patch.price, '24.9')
    assert.equal(patch.audience, 'Coffee lovers')
    assert.equal(patch.link, 'https://shop.example.com/p/aurora-mug')
    assert.equal(patch.selling, 'Double-wall ceramic mug that keeps coffee hot for 6 hours.')
    assert.equal(patch.promotion, 'Checkout today and enjoy free shipping on every order.')
    assert.deepEqual(patch.categories, ['Home & Kitchen', 'Drinkware'])
    for (const key of STRING_FIELDS) assert.notEqual(patch[key], '', key)
  })
})
