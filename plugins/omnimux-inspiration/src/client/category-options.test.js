import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listCategories } from './api.js'
import { buildCategoryFilterOptions } from './feed-helpers.js'
import { zh, en } from './locales.js'

/**
 * Category dropdown dynamic options (Issue #2497).
 *
 * The dropdown used to carry 9 hardcoded e-commerce buckets that matched
 * almost nothing in the cloud catalogue (category=数码科技 → total=0). These
 * gates pin the replacement: options come from the hub's aggregate of the
 * real catalogue, the first entry is exactly 全部, and a stale selection
 * stays visible instead of blanking the trigger.
 */

const tZh = (key) => zh[key] || key
const tEn = (key) => en[key] || key

describe('category filter copywriting', () => {
  it('keeps the first option label exactly 全部 / All', () => {
    assert.equal(zh['category.all'], '全部')
    assert.equal(en['category.all'], 'All')
    // The QA gate regex fails the build on 全部+维度 compounds.
    assert.doesNotMatch(zh['category.all'], /全部(平台|账号|来源|类型|状态|分类|发布方式)/)
  })
})

describe('buildCategoryFilterOptions', () => {
  it('leads with the fixed 全部 entry and appends hub rows in order', () => {
    const options = buildCategoryFilterOptions([
      { name: 'digital', count: 1178 },
      { name: 'Health & Wellness', count: 300 },
      { name: '女装和内衣', count: 120 },
    ], tZh)
    assert.deepEqual(options, [
      { value: '', label: '全部' },
      { value: 'digital', label: 'digital' },
      { value: 'Health & Wellness', label: 'Health & Wellness' },
      { value: '女装和内衣', label: '女装和内衣' },
    ])
  })

  it('degrades to the 全部-only set on empty or malformed data', () => {
    assert.deepEqual(buildCategoryFilterOptions([], tZh), [{ value: '', label: '全部' }])
    assert.deepEqual(buildCategoryFilterOptions(undefined, tZh), [{ value: '', label: '全部' }])
    assert.deepEqual(buildCategoryFilterOptions(null, tEn), [{ value: '', label: 'All' }])
    assert.deepEqual(buildCategoryFilterOptions([{ name: '' }, { count: 3 }, 'digital'], tZh), [
      { value: '', label: '全部' },
      { value: 'digital', label: 'digital' },
    ])
  })

  it('trims, dedupes and accepts bare-string rows', () => {
    const options = buildCategoryFilterOptions([' digital ', { name: 'digital' }, { name: ' 健康 ' }], tZh)
    assert.deepEqual(options, [
      { value: '', label: '全部' },
      { value: 'digital', label: 'digital' },
      { value: '健康', label: '健康' },
    ])
  })

  it('keeps the current selection visible when the fresh list drops it', () => {
    const options = buildCategoryFilterOptions([{ name: 'digital', count: 5 }], tZh, 'legacy-bucket')
    assert.deepEqual(options.at(-1), { value: 'legacy-bucket', label: 'legacy-bucket' })
    // A selection already in the list is not duplicated.
    const same = buildCategoryFilterOptions([{ name: 'digital', count: 5 }], tZh, 'digital')
    assert.equal(same.filter((option) => option.value === 'digital').length, 1)
    // An empty selection adds nothing.
    assert.equal(buildCategoryFilterOptions([], tZh, '').length, 1)
  })
})

describe('listCategories', () => {
  it('requests the hub aggregate route', async () => {
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

  it('reports failures without throwing so the dropdown can degrade', async () => {
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
