/**
 * 脏数据指纹的不变量（B1–B5）。
 *
 * 这组用例钉死的是「指纹语义 == payload 语义」：指纹变了就必须真的会写出不同的
 * 产品，指纹没变就不能因为纯 UI 状态（标签草稿、面板展开）而误判为脏。
 *
 * 对应规格：`specs/product-secondary-page.spec.md` §2.2（AC-201 ~ AC-204）。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FINGERPRINT_EXCLUDED_KEYS,
  bundleFormReturn,
  computeProductFingerprint,
  emptyProductSnapshot,
  formSnapshotOf,
  getFormFingerprint,
  isFingerprintDirty,
  stableStringify,
} from './useProductFormState.js'

const EMPTY_STRATEGY = { brand_basic_info: {}, content_angles: [], tone_and_voice: {} }
const FILLED_STRATEGY = {
  brand_basic_info: {
    company: { name: 'Aurora', website: 'https://aurora.example.com', locale: 'cn' },
    product: { name: 'Aurora Mug', category: 'Drinkware' },
  },
  content_angles: [
    { id: 'heat_01', title: '保温焦虑', description: '6 小时长效保温', target_audience: '通勤族', priority: 1 },
  ],
}

const BASE_FIELDS = Object.freeze({
  name: 'Aurora Mug',
  kind: 'physical',
  selling: '6 小时长效保温',
  audience: '通勤族',
  brand: 'Aurora',
  features: '容量 350ml',
  price: '24.9',
  sku: 'AM-350',
  promotion: '今日下单免运费',
  link: 'https://shop.example.com/p/aurora-mug',
})

const COVER_MEDIA = Object.freeze([
  { id: 'med_desktop', real_path: '/media/site-aurora-desktop.png', original_name: 'site-aurora-desktop.png' },
  { id: 'med_mobile', real_path: '/media/site-aurora-mobile.png', original_name: 'site-aurora-mobile.png' },
])

/**
 * 用真实装配函数搭一份表单返回值 —— 指纹与 payload 出自同一份输入，
 * 因此两者的差异只可能来自字段域取舍，不会来自测试夹具。
 * @param {Record<string, unknown>} [overrides]
 */
function formOf(overrides = {}) {
  const fields = { ...BASE_FIELDS, ...(overrides.fields ?? {}) }
  const base = { fields, setters: {}, resetBaseFields: () => {} }
  const mediaState = {
    categories: overrides.categories ?? ['Home & Kitchen'],
    media: overrides.media ?? COVER_MEDIA,
    coverId: overrides.coverId === undefined ? 'med_desktop' : overrides.coverId,
    tagDraft: overrides.tagDraft ?? '',
  }
  const strategyState = {
    strategy: overrides.strategy ?? EMPTY_STRATEGY,
    strategyTouched: overrides.strategyTouched ?? false,
    strategyOpen: overrides.strategyOpen ?? false,
  }
  return bundleFormReturn(base, mediaState, strategyState, false)
}

const printOf = (overrides) => computeProductFingerprint(formOf(overrides).state)
const payloadOf = (overrides) => JSON.stringify(formOf(overrides).payload())

describe('products form · stableStringify is order-independent', () => {
  it('sorts keys, keeps array order, drops undefined', () => {
    assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }))
    assert.equal(stableStringify([1, 2]), '[1,2]')
    assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]))
    assert.equal(stableStringify({ a: 1, b: undefined }), stableStringify({ a: 1 }))
    assert.equal(stableStringify(null), 'null')
  })
})

describe('products form · B1/B3 the baseline anchor is not a false positive', () => {
  it('a freshly opened form is never dirty', () => {
    assert.equal(printOf({}), computeProductFingerprint(formOf({}).state))
    const snapshot = formSnapshotOf({ name: 'Aurora Mug', kind: 'physical', cover_media_id: 'med_desktop' })
    assert.equal(isFingerprintDirty(computeProductFingerprint(snapshot), computeProductFingerprint(snapshot)), false)
  })

  it('the empty-product snapshot fingerprints like an untouched create form', () => {
    const empty = computeProductFingerprint(emptyProductSnapshot())
    const create = computeProductFingerprint({
      name: '', kind: 'physical', selling: '', audience: '', brand: '', features: '',
      price: '', sku: '', promotion: '', link: '',
      categories: [], media: [], coverId: null, strategy: EMPTY_STRATEGY,
    })
    assert.equal(create, empty)
  })

  it('changing a value and changing it back returns to not-dirty', () => {
    const baseline = printOf({})
    assert.notEqual(printOf({ fields: { name: 'Aurora Mug 2' } }), baseline)
    assert.equal(printOf({ fields: { name: 'Aurora Mug' } }), baseline)
  })

  it('a name that only differs by surrounding whitespace is not a change', () => {
    // buildPayload trims the name; the fingerprint must agree or every open is dirty.
    assert.equal(printOf({ fields: { name: '  Aurora Mug  ' } }), printOf({}))
  })
})

describe('products form · B4 pure UI state never counts as a change', () => {
  it('the tag draft, the panel toggle and the touch flag are excluded', () => {
    for (const key of FINGERPRINT_EXCLUDED_KEYS) {
      assert.equal(typeof key, 'string')
    }
    const baseline = printOf({})
    assert.equal(printOf({ tagDraft: '新标签' }), baseline)
    assert.equal(printOf({ strategyOpen: true }), baseline)
    assert.equal(printOf({ strategyTouched: true }), baseline)
  })

  it('opening the strategy panel and collapsing it again is not a change', () => {
    const closed = printOf({ strategyOpen: false })
    const opened = printOf({ strategyOpen: true })
    const closedAgain = printOf({ strategyOpen: false })
    assert.equal(opened, closed)
    assert.equal(closedAgain, closed)
  })
})

describe('products form · B5 the fingerprint and the payload never drift apart', () => {
  const cases = [
    ['name', { fields: { name: 'Aurora Mug Pro' } }],
    ['selling', { fields: { selling: '更保温' } }],
    ['audience', { fields: { audience: '学生' } }],
    ['brand', { fields: { brand: 'Aurora Labs' } }],
    ['features', { fields: { features: '容量 500ml' } }],
    ['price', { fields: { price: '29.9' } }],
    ['sku', { fields: { sku: 'AM-500' } }],
    ['promotion', { fields: { promotion: '第二件半价' } }],
    ['link', { fields: { link: 'https://shop.example.com/p/other' } }],
    ['categories', { categories: ['Home & Kitchen', 'Drinkware'] }],
    ['media', { media: [{ id: 'med_new', real_path: '/media/a.png', original_name: 'a.png' }] }],
    ['coverId', { coverId: 'med_mobile' }],
  ]

  for (const [label, overrides] of cases) {
    it(`a physical-product change to ${label} moves both the fingerprint and the payload`, () => {
      assert.notEqual(printOf(overrides), printOf({}), `${label}: fingerprint did not move`)
      assert.notEqual(payloadOf(overrides), payloadOf({}), `${label}: payload did not move`)
    })
  }

  it('switching to digital moves both, and price/sku/promotion stop counting', () => {
    const digital = { fields: { kind: 'digital' } }
    assert.notEqual(printOf(digital), printOf({}))
    assert.notEqual(payloadOf(digital), payloadOf({}))
    // 数字产品的 payload 不写这三个键 —— 指纹也不能因为隐藏字段被判脏。
    for (const field of ['price', 'sku', 'promotion']) {
      const moved = { fields: { kind: 'digital', [field]: '999' } }
      assert.equal(printOf(moved), printOf(digital), `${field}: hidden digital field counted as a change`)
      assert.equal(payloadOf(moved), payloadOf(digital), `${field}: payload changed for a digital product`)
    }
  })

  it('a physical product ignores the hidden strategy payload', () => {
    const withStrategy = { strategy: FILLED_STRATEGY }
    assert.equal(printOf(withStrategy), printOf({}))
    assert.equal(payloadOf(withStrategy), payloadOf({}))
  })

  it('a touched digital strategy moves both', () => {
    const before = { fields: { kind: 'digital' }, strategyTouched: true }
    const after = { fields: { kind: 'digital' }, strategy: FILLED_STRATEGY, strategyTouched: true }
    assert.notEqual(printOf(after), printOf(before))
    assert.notEqual(payloadOf(after), payloadOf(before))
  })

  it('an untouched strategy stays out of the payload and out of the fingerprint', () => {
    const untouched = { fields: { kind: 'digital' }, strategy: FILLED_STRATEGY, strategyTouched: false }
    const blank = { fields: { kind: 'digital' }, strategy: EMPTY_STRATEGY, strategyTouched: false }
    assert.equal(printOf(untouched), printOf(blank))
    assert.equal(payloadOf(untouched), payloadOf(blank))
    assert.equal('brand_strategy' in formOf(untouched).payload(), false)
  })
})

describe('products form · the fingerprint reads the same fields from both sources', () => {
  it('getFormFingerprint is the state-facing alias of the same pure function', () => {
    const state = formOf({}).state
    assert.equal(getFormFingerprint(state), computeProductFingerprint(state))
  })

  it('an edit snapshot and the live state of an untouched form fold together', () => {
    const product = {
      id: 'prd_1',
      updated_at: '2026-09-14T00:00:00.000Z',
      name: BASE_FIELDS.name,
      kind: 'physical',
      selling_points: BASE_FIELDS.selling,
      target_audience: BASE_FIELDS.audience,
      brand: BASE_FIELDS.brand,
      features: BASE_FIELDS.features,
      price: BASE_FIELDS.price,
      sku: BASE_FIELDS.sku,
      promotion: BASE_FIELDS.promotion,
      link: BASE_FIELDS.link,
      categories: ['Home & Kitchen'],
      media: COVER_MEDIA,
      cover_media_id: 'med_desktop',
    }
    const baseline = computeProductFingerprint(formSnapshotOf(product))
    const current = computeProductFingerprint(formOf({}).state)
    assert.equal(current, baseline, 'opening the editor must not look dirty')
    assert.equal(isFingerprintDirty(current, baseline), false)
  })

  it('reordering the media list is a real change (the cover moves with it)', () => {
    const reordered = [...COVER_MEDIA].reverse()
    assert.notEqual(printOf({ media: reordered }), printOf({}))
    assert.notEqual(payloadOf({ media: reordered }), payloadOf({}))
  })
})
