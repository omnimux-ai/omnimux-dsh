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

/** A digital landing-page import: the six-module report plus the mapped fields. */
const DIGITAL_IMPORT = {
  name: 'MiniMax 开放平台',
  selling_points: '一站式多模态模型服务，超长上下文',
  features: '文本模型 API，让开发者一个接口接入多模态',
  target_audience: 'AI 应用开发者',
  brand: 'MiniMax',
  price: '',
  sku: '',
  promotion: '',
  link: 'https://platform.example.com',
  categories: ['AI 平台'],
  images: [],
  kind: 'digital',
  analysis: { mode: 'model', model: 'gemini-3.8-flash', reason: null },
  brand_strategy: {
    brand_basic_info: {
      company: { name: 'MiniMax', website: 'https://platform.example.com', locale: 'cn' },
      product: { name: 'MiniMax 开放平台', category: 'AI 平台' },
    },
    content_angles: [
      { id: 'cost_01', title: '成本焦虑', description: '按量付费', target_audience: 'AI 应用开发者', priority: 1 },
    ],
    tone_and_voice: { dos: ['用数据说话'], donts: ['夸大效果'] },
    identity_and_product: {
      core_identity: '一站式多模态模型服务',
      product_offering: ['文本模型 API'],
      unique_advantage: ['超长上下文'],
      problems_solved: ['多模型拼接成本高'],
      solutions: ['让开发者一个接口接入多模态'],
      extra_unknown_key: 'dropped',
    },
    mission_and_positioning: {
      mission: '让智能触手可及',
      differentiation: ['性价比'],
      ownable_space: { statement: '多模态入口', category: 'AI 平台', is_not: ['通用云'] },
    },
    market_and_competition: {
      customer_segments: [{ name: 'AI 应用开发者', percentage: 60 }],
      competitors: [{ name: 'OpenAI', website: 'https://openai.com' }],
    },
  },
}

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
      'add.urlImport.degraded': ['解析成功，但智能分析未接入，已按页面信息尽力填充', 'Extracted from the page only — the analysis model was unavailable'],
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
      setters: {
        ...Object.fromEntries(STRING_FIELDS.map((key) => [
          `set${key.charAt(0).toUpperCase()}${key.slice(1)}`,
          (value) => { writes.push([key, value]) },
        ])),
        setKind: (value) => { writes.push(['kind', value]) },
      },
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
      setStrategyOpen: (value) => { writes.push(['strategyOpen', value]) },
      setStrategyTouched: (value) => { writes.push(['strategyTouched', value]) },
      setStrategy: (value) => { writes.push(['strategy', value]) },
      openStrategy: () => {},
      patchStrategy: () => {},
      handleSelectPhysical: () => {},
      handleSelectDigital: () => {},
    }
    const bundle = bundleFormReturn(base, mediaState, strategyState, false)
    return { bundle, writes }
  }

  /** Same form, but the setters really write: the submit payload can be read back. */
  function liveHarness() {
    const base = {
      fields: { ...Object.fromEntries([...STRING_FIELDS, 'kind'].map((key) => [key, ''])), kind: 'physical' },
      setters: {},
    }
    for (const key of [...STRING_FIELDS, 'kind']) {
      base.setters[`set${key.charAt(0).toUpperCase()}${key.slice(1)}`] = (value) => { base.fields[key] = value }
    }
    const mediaState = {
      categories: [],
      media: [],
      coverId: null,
      setCategories: (next) => {
        mediaState.categories = typeof next === 'function' ? next(mediaState.categories) : next
      },
    }
    const strategyState = {
      strategyOpen: false,
      strategyTouched: false,
      strategy: {},
      setStrategyOpen: (value) => { strategyState.strategyOpen = value },
      setStrategyTouched: (value) => { strategyState.strategyTouched = value },
      setStrategy: (value) => { strategyState.strategy = value },
      openStrategy: () => {},
      patchStrategy: () => {},
      handleSelectPhysical: () => {},
      handleSelectDigital: () => {},
    }
    return { bundle: bundleFormReturn(base, mediaState, strategyState, false), base, strategyState }
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

  it('never moves the kind switch or the strategy panel for a physical import', () => {
    const { bundle, writes } = harness()
    bundle.actions.applyImportedData({ ...IMPORTED, kind: 'physical', analysis: { mode: 'model', model: 'gemini-3.8-flash' } })
    const touched = writes.map(([key]) => key)
    assert.equal(touched.includes('kind'), false)
    assert.equal(touched.includes('strategyOpen'), false)
    assert.equal(touched.includes('strategy'), false)
  })

  it('switches to digital, unfolds the six modules and fills them from the analysis', () => {
    const { bundle, writes } = harness()
    bundle.actions.applyImportedData(DIGITAL_IMPORT)
    const applied = Object.fromEntries(writes)
    assert.equal(applied.kind, 'digital')
    assert.equal(applied.strategyOpen, true, 'the six strategy cards must arrive expanded')
    assert.equal(applied.strategyTouched, true)
    assert.equal(applied.selling, '一站式多模态模型服务，超长上下文')
    assert.equal(applied.audience, 'AI 应用开发者')
    assert.equal(applied.brand, 'MiniMax')
    assert.deepEqual(applied.categories, ['已有标签', 'AI 平台'])
    // The whole six-module report lands in the panel, not just a summary.
    assert.deepEqual(Object.keys(applied.strategy), [
      'brand_basic_info',
      'content_angles',
      'tone_and_voice',
      'identity_and_product',
      'mission_and_positioning',
      'market_and_competition',
    ])
    assert.equal(applied.strategy.brand_basic_info.company.name, 'MiniMax')
    assert.equal(applied.strategy.identity_and_product.core_identity, '一站式多模态模型服务')
    assert.deepEqual(applied.strategy.identity_and_product.unique_advantage, ['超长上下文'])
    assert.equal(applied.strategy.mission_and_positioning.ownable_space.category, 'AI 平台')
    assert.deepEqual(applied.strategy.market_and_competition.customer_segments, [{ name: 'AI 应用开发者', percentage: 60 }])
    assert.equal(applied.strategy.content_angles[0].target_audience, 'AI 应用开发者')
  })

  it('still switches to digital when the answer carries the kind but no strategy', () => {
    const { bundle, writes } = harness()
    bundle.actions.applyImportedData({ name: '某平台', kind: 'digital' })
    const applied = Object.fromEntries(writes)
    assert.equal(applied.kind, 'digital')
    assert.equal(applied.strategyOpen, undefined)
  })

  it('keeps the dialog usable when a strategy arrives unusable', () => {
    for (const broken of ['not an object', [], 42, { brand_basic_info: 'nope' }]) {
      const { bundle, writes } = harness()
      bundle.actions.applyImportedData({ name: '某平台', kind: 'digital', brand_strategy: broken })
      const applied = Object.fromEntries(writes)
      assert.equal(applied.kind, 'digital')
      assert.equal(applied.strategy, undefined, `strategy must not be written for ${JSON.stringify(broken)}`)
    }
  })

  it('submits the copy fields under the wire names the library actually reads', () => {
    const { bundle } = liveHarness()
    bundle.actions.applyImportedData(IMPORTED)
    const payload = bundle.payload()
    assert.equal(payload.kind, 'physical')
    assert.equal(payload.selling_points, '6 小时长效保温，防滑硅胶底座')
    assert.equal(payload.target_audience, 'Coffee lovers')
    assert.equal(payload.brand, 'Aurora')
    assert.equal(payload.features, '容量: 350ml')
    assert.equal(payload.price, '24.9')
    assert.equal(payload.sku, 'AM-350')
    assert.equal(payload.link, 'https://shop.example.com/p/aurora-mug')
    assert.equal(payload.brand_strategy, undefined)
  })

  it('submits the filled strategy with a digital import', () => {
    const { bundle, strategyState } = liveHarness()
    bundle.actions.applyImportedData(DIGITAL_IMPORT)
    assert.equal(strategyState.strategyOpen, true)
    const payload = bundle.payload()
    assert.equal(payload.kind, 'digital')
    assert.equal(payload.selling_points, '一站式多模态模型服务，超长上下文')
    assert.equal(payload.target_audience, 'AI 应用开发者')
    assert.equal(payload.brand_strategy.brand_basic_info.company.name, 'MiniMax')
    assert.equal(payload.brand_strategy.identity_and_product.core_identity, '一站式多模态模型服务')
    // Price / SKU / promotion stay physical-only fields.
    assert.equal(payload.price, undefined)
    assert.equal(payload.sku, undefined)
    assert.equal(payload.promotion, undefined)
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
    assert.match(source, /if \(event\.key === 'Enter'\) \{/)
    assert.match(source, /event\.preventDefault\(\)/)
    assert.match(source, /loading=\{phase === 'loading'\}/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.loading'\)\)/)
    // Success has two flavours: the model read the page, or only the page rules did.
    assert.match(source, /setMessage\(t\(data\.analysis\?\.mode === 'heuristic' \? 'add\.urlImport\.degraded' : 'add\.urlImport\.success'\)\)/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.failed'\)\)/)
    assert.match(source, /setMessage\(t\('add\.urlImport\.invalidUrl'\)\)/)
    assert.match(source, /role="status"/)
  })

  it('declares the bar styles and the link icon', () => {
    const styles = read('styles.js')
    for (const className of [
      'omnimux-products-url-import-group',
      'omnimux-products-url-import-row',
      'omnimux-products-url-import-field',
      'omnimux-products-url-import-status',
    ]) {
      assert.match(styles, new RegExp(`\\.${className}\\b`))
    }
    assert.match(styles, /@keyframes omnimux-products-fade-in/)
    assert.match(read('icons.jsx'), /export function LinkIcon/)
  })

  // The bar is a plain layout row over the shared kit: the field frame, its
  // 32px height, 8px radius and focus ring are the kit's, not a local copy.
  // A hand-rolled frame here is what produced the "box inside a box" look.
  it('delegates the field frame and the button to the shared kit', () => {
    const view = read('ProductFormFields.jsx')
    const start = view.indexOf('export function UrlImportBar')
    const end = view.indexOf('export function ProductFormBody')
    assert.ok(start >= 0 && end > start, 'UrlImportBar body is locatable')
    const bar = view.slice(start, end)

    assert.match(bar, /<InputField\b/)
    assert.match(bar, /className="omnimux-products-url-import-field"/)
    assert.match(bar, /prefix=\{<LinkIcon size=\{14\} \/>\}/)
    assert.match(bar, /<Button\b/)
    assert.ok(!bar.includes('<input'), 'no hand-written input element remains')
    assert.ok(!bar.includes('style={{'), 'no inline frame backstop remains')

    // Every deprecated hand-rolled frame class must be gone from view and styles.
    const styles = read('styles.js')
    for (const dead of [
      '.omnimux-products-url-import-input',
      '.omnimux-products-url-import-icon',
      '.omnimux-products-url-import[data-phase',
    ]) {
      assert.ok(!styles.includes(dead), `styles drop ${dead}`)
      assert.ok(!view.includes(dead.slice(1)), `view drops ${dead.slice(1)}`)
    }
    assert.ok(!/^\.omnimux-products-url-import \{/m.test(styles), 'the outer wrapper rule is gone')
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
