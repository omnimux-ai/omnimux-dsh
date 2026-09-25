import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CategoryShuffleCache,
  fetchCategoryRandomSample,
  fetchScopesRandomSample,
  shuffleArray,
} from './category-shuffle-cache.js'

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

describe('fetchScopesRandomSample 多 scope 合并采样与行级过滤', () => {
  /** 单页 scope 替身：pages 是 `scope -> 页数组` 的固定分片。 */
  const scopePages = (pages, hooks = {}) => async (scope, page) => {
    if (hooks[scope]) return hooks[scope](page)
    const items = pages[scope]?.[page]
    if (!items) return { ok: false, status: 404, body: {} }
    return { ok: true, status: 200, body: { totalPages: pages[scope].length, items } }
  }

  it('参数防守：scopes 非数组或 fetchPageFn 缺失时返回空数组', async () => {
    assert.deepEqual(await fetchScopesRandomSample(null, () => {}), [])
    assert.deepEqual(await fetchScopesRandomSample([], () => {}), [])
    assert.deepEqual(await fetchScopesRandomSample(['a/b'], null), [])
  })

  it('两个 scope 合并：逐 scope 采样后按 id 去重', async () => {
    const fetchPage = scopePages({
      'a/b': [[{ id: 'x1' }, { id: 'x2' }, { id: 'shared' }]],
      'a/c': [[{ id: 'shared' }, { id: 'y1' }]],
    })
    const res = await fetchScopesRandomSample(['a/b', 'a/c'], fetchPage)
    assert.deepEqual(res.map((row) => row.id).sort(), ['shared', 'x1', 'x2', 'y1'])
  })

  it('行级过滤发生在截断之前：候选池比目标多一张且那张被筛掉时仍是满员', async () => {
    // 25 张候选、其中 1 张判为不可用：先取满 24 张再过滤会随机掉到 23 张，
    // 先过滤再截断则每次都是 24 张 —— 这一行不该在 24/23 之间抖动。
    const pool = Array.from({ length: 24 }, (_, index) => ({ id: `keep_${index}`, kind: 'audio' }))
    pool.push({ id: 'drop_me', kind: 'media' })
    const fetchPage = scopePages({
      'a/b': [pool],
      'a/c': [[{ id: 'sfx_1', kind: 'audio' }]],
    })
    for (let round = 0; round < 50; round += 1) {
      const res = await fetchScopesRandomSample(
        ['a/b', 'a/c'], fetchPage, (x) => x, 24, (row) => row.kind === 'audio',
      )
      assert.equal(res.length, 24, `第 ${round} 次抽样应为 24 张`)
      assert.equal(res.some((row) => row.id === 'drop_me'), false, '被筛掉的行不得出现')
    }
  })

  it('单 scope 失败时仍取满 targetCount：per-scope 阶段不得提前削掉候选池', async () => {
    // 只有 a/b 供得上货（a/c 整条链路失败，没有第二份供给兜底）。
    // 每页 24 行里混 4 行 media，两个采样页合并出 40 行可用、8 行该筛掉：
    // per-scope 上限若停在 targetCount，这层 slice 会先把 48 行削成 24 行，
    // 其中只有 ~20 行可用 —— keepFn 再准也凑不满 24 张。
    const page = (pageIndex) => [
      ...Array.from({ length: 20 }, (_, index) => ({ id: `keep_${pageIndex}_${index}`, kind: 'audio' })),
      ...Array.from({ length: 4 }, (_, index) => ({ id: `drop_${pageIndex}_${index}`, kind: 'media' })),
    ]
    const fetchPage = scopePages({ 'a/b': [page(0), page(1), page(2)] }, {
      'a/c': () => { throw new Error('network failure') },
    })
    for (let round = 0; round < 30; round += 1) {
      const res = await fetchScopesRandomSample(
        ['a/b', 'a/c'], fetchPage, (x) => x, 24, (row) => row.kind === 'audio',
      )
      assert.equal(res.length, 24, `第 ${round} 次抽样应为 24 张`)
      assert.equal(res.some((row) => row.kind !== 'audio'), false, '被筛掉的行不得出现')
    }
  })

  it('目标数量截断：候选充足时只返回 targetCount 张', async () => {
    const fetchPage = scopePages({
      'a/b': [Array.from({ length: 40 }, (_, index) => ({ id: `b_${index}` }))],
    })
    const res = await fetchScopesRandomSample(['a/b'], fetchPage)
    assert.equal(res.length, 24)
  })

  it('单 scope 失败容错：一个 scope 报错时另一个的结果照常返回', async () => {
    const fetchPage = scopePages({ 'a/c': [[{ id: 'y1' }, { id: 'y2' }]] }, {
      'a/b': () => { throw new Error('network failure') },
    })
    const res = await fetchScopesRandomSample(['a/b', 'a/c'], fetchPage)
    assert.deepEqual(res.map((row) => row.id).sort(), ['y1', 'y2'])
  })

  it('单 scope 归一化抛错时同样容错，另一个 scope 照常返回', async () => {
    const fetchPage = scopePages({
      'a/b': [[{ id: 'bad_1' }]],
      'a/c': [[{ id: 'good_1' }]],
    })
    const normalize = (row) => {
      if (String(row.id).startsWith('bad')) throw new Error('malformed row')
      return row
    }
    const res = await fetchScopesRandomSample(['a/b', 'a/c'], fetchPage, normalize)
    assert.deepEqual(res.map((row) => row.id), ['good_1'])
  })

  it('单 scope 缺失容错：一个 scope 返回 404 时另一个照常返回', async () => {
    const fetchPage = scopePages({ 'a/c': [[{ id: 'y1' }]] })
    const res = await fetchScopesRandomSample(['a/missing', 'a/c'], fetchPage)
    assert.deepEqual(res.map((row) => row.id), ['y1'])
  })

  it('两个 scope 都取不到行时返回空数组，不抛出', async () => {
    const fetchPage = scopePages({})
    assert.deepEqual(await fetchScopesRandomSample(['a/b', 'a/c'], fetchPage), [])
  })

  it('抽样不足目标数量时接受少卡，不补位、不回退', async () => {
    const fetchPage = scopePages({ 'a/b': [[{ id: 'only_1' }]] })
    const res = await fetchScopesRandomSample(['a/b'], fetchPage)
    assert.deepEqual(res.map((row) => row.id), ['only_1'])
  })
})

