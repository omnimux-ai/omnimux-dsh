import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listCategories } from './api.js'
import { buildCategoryFilterOptions } from './feed-helpers.js'
import { zh, en } from './locales.js'
import { OFFICIAL_CATEGORIES } from '../gxgen-category-map.js'

/**
 * Category dropdown (Issue #2507): fixed 全部 + 18 official industries.
 * The list is local; `/categories` is no longer the option source.
 */

const tZh = (key) => zh[key] || key
const tEn = (key) => en[key] || key
const COPY_GATE = /全部(平台|账号|来源|类型|状态|分类|发布方式)/

describe('category filter copywriting', () => {
  it('keeps the first option label exactly 全部 / All', () => {
    assert.equal(zh['category.all'], '全部')
    assert.equal(en['category.all'], 'All')
    assert.doesNotMatch(zh['category.all'], COPY_GATE)
  })

  it('ships zh/en labels for every official industry and never trips the 全部+维度 gate', () => {
    for (const row of OFFICIAL_CATEGORIES) {
      assert.equal(zh[`category.${row.id}`], row.zh, row.id)
      assert.equal(en[`category.${row.id}`], row.en, row.id)
      assert.doesNotMatch(zh[`category.${row.id}`], COPY_GATE)
      assert.doesNotMatch(en[`category.${row.id}`], COPY_GATE)
    }
    const zhBlob = Object.values(zh).join('\n')
    const enBlob = Object.values(en).join('\n')
    assert.doesNotMatch(zhBlob, COPY_GATE)
    assert.doesNotMatch(enBlob, COPY_GATE)
  })
})

describe('buildCategoryFilterOptions', () => {
  it('leads with 全部 and then the 18 official ids in sort_order', () => {
    const options = buildCategoryFilterOptions(tZh)
    assert.equal(options.length, 19)
    assert.deepEqual(options[0], { value: '', label: '全部' })
    assert.deepEqual(
      options.slice(1),
      OFFICIAL_CATEGORIES.map((row) => ({ value: row.id, label: row.zh })),
    )
  })

  it('uses English labels when translated that way', () => {
    const options = buildCategoryFilterOptions(tEn)
    assert.deepEqual(options[0], { value: '', label: 'All' })
    assert.equal(options[1].value, 'baby_parenting')
    assert.equal(options[1].label, 'Baby & Parenting')
    assert.equal(options.at(-1).value, 'other')
    assert.equal(options.at(-1).label, 'Other')
  })

  it('does not include product forms or free-text leftovers', () => {
    const values = buildCategoryFilterOptions(tZh).map((row) => row.value)
    assert.equal(values.includes('digital'), false)
    assert.equal(values.includes('physical'), false)
    assert.equal(values.includes('Health & Wellness'), false)
  })
})

describe('listCategories', () => {
  it('still requests the hub aggregate route (dropdown does not depend on it)', async () => {
    const savedFetch = globalThis.fetch
    /** @type {string[]} */
    const seen = []
    globalThis.fetch = async (url) => {
      seen.push(String(url))
      return { ok: true, status: 200, json: async () => ({ data: [{ name: 'digital', count: 2 }] }) }
    }
    try {
      const result = await listCategories()
      assert.equal(result.ok, true)
      assert.deepEqual(seen, ['/omnimux/inspiration/categories'])
      assert.deepEqual(result.body.data, [{ name: 'digital', count: 2 }])
    } finally {
      globalThis.fetch = savedFetch
    }
  })

  it('reports failures without throwing', async () => {
    const savedFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
    try {
      const result = await listCategories()
      assert.equal(result.ok, false)
      assert.equal(result.status, 500)
    } finally {
      globalThis.fetch = savedFetch
    }
  })
})
