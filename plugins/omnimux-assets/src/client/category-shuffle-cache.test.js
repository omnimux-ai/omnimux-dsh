import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CategoryShuffleCache, shuffleArray, fetchCategoryRandomSample } from './category-shuffle-cache.js'

describe('shuffleArray', () => {
  it('handles empty and single-element arrays safely', () => {
    assert.deepEqual(shuffleArray([]), [])
    assert.deepEqual(shuffleArray([42]), [42])
    assert.deepEqual(shuffleArray(null), [])
  })

  it('maintains all elements without mutation of original array', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const originalCopy = [...original]
    const shuffled = shuffleArray(original)

    assert.equal(shuffled.length, original.length)
    assert.deepEqual(original, originalCopy, 'original array must not be mutated')
    assert.deepEqual([...shuffled].sort(), [...original].sort())
  })
})

describe('CategoryShuffleCache', () => {
  it('caches shuffled items and returns the exact same array reference for subsequent gets', () => {
    const cache = new CategoryShuffleCache(10)
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    const first = cache.getOrShuffle('character', items)
    assert.equal(first.length, 4)
    assert.equal(cache.has('character'), true)

    const second = cache.getOrShuffle('character', items)
    assert.strictEqual(first, second, 'must return identical array reference during session')
  })

  it('clears all cached shuffles on manual clear/refresh', () => {
    const cache = new CategoryShuffleCache(10)
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }]

    cache.getOrShuffle('scene', items)
    assert.equal(cache.has('scene'), true)

    cache.clear()
    assert.equal(cache.has('scene'), false)
    assert.equal(cache.get('scene'), undefined)
  })

  it('evicts oldest entries when exceeding maxEntries capacity', () => {
    const cache = new CategoryShuffleCache(2)
    cache.set('c1', [1])
    cache.set('c2', [2])
    assert.equal(cache.has('c1'), true)
    assert.equal(cache.has('c2'), true)

    cache.set('c3', [3])
    assert.equal(cache.has('c1'), false, 'oldest entry c1 should be evicted')
    assert.equal(cache.has('c2'), true)
    assert.equal(cache.has('c3'), true)
  })
})

describe('fetchCategoryRandomSample 跨页随机采样与混编洗牌算法', () => {
  it('参数防守：分类为空或 fetchPageFn 缺失时返回空数组', async () => {
    assert.deepEqual(await fetchCategoryRandomSample('', () => {}), [])
    assert.deepEqual(await fetchCategoryRandomSample('character', null), [])
  })

  it('单页分类兼容：当 totalPages <= 1 时原地打乱并截取返回', async () => {
    const mockPage = async () => ({
      ok: true,
      body: {
        totalPages: 1,
        items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      },
    })
    const res = await fetchCategoryRandomSample('single_cat', mockPage)
    assert.equal(res.length, 3)
    assert.deepEqual(res.map((i) => i.id).sort(), ['a', 'b', 'c'])
  })

  it('多页分类随机抽样：当 totalPages > 1 时随机采样页码混编并去重截取', async () => {
    const requestedPages = []
    const mockPage = async (cat, page) => {
      requestedPages.push(page)
      return {
        ok: true,
        body: {
          totalPages: 10,
          items: Array.from({ length: 24 }, (_, i) => ({ id: `item_p${page}_${i}` })),
        },
      }
    }
    const res = await fetchCategoryRandomSample('multi_cat', mockPage, (x) => x, 24)
    assert.equal(res.length, 24)
    assert.ok(requestedPages.length >= 1, '必须至少请求过目标分页')
  })

  it('网络异常降级：某页加载报错时平滑容错不抛出', async () => {
    let callCount = 0
    const mockPage = async () => {
      callCount += 1
      if (callCount === 1) {
        return { ok: true, body: { totalPages: 5, items: [{ id: 'fallback_1' }] } }
      }
      throw new Error('network failure')
    }
    const res = await fetchCategoryRandomSample('flaky_cat', mockPage)
    assert.equal(res.length, 1)
    assert.equal(res[0].id, 'fallback_1')
  })
})

