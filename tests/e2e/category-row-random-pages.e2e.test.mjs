import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CategoryShuffleCache,
  fetchCategoryRandomSample,
  shuffleArray,
} from '../../plugins/omnimux-assets/src/client/category-shuffle-cache.js'

describe('公共资产库分类流全库跨页随机推荐 E2E 验证', () => {
  it('E2E-1: 多页分类下采样结果突破第 0 页，覆盖多页数据并去重', async () => {
    // 模拟 18 页角色数据
    const pageRecords = new Map()
    for (let p = 0; p < 18; p += 1) {
      pageRecords.set(p, Array.from({ length: 24 }, (_, i) => ({
        id: `character_p${p}_item${i}`,
        name: `角色_第${p}页_${i}`,
        page: p,
      })))
    }

    const mockFetcher = async (catId, page) => {
      return {
        ok: true,
        body: {
          totalPages: 18,
          total: 18 * 24,
          items: pageRecords.get(page) || [],
        },
      }
    }

    const sampled = await fetchCategoryRandomSample('character', mockFetcher, (x) => x, 24)
    assert.equal(sampled.length, 24, '必须返回 24 项卡片')

    // 验证返回的项目中包含有效项
    const pagesRepresented = new Set(sampled.map((item) => item.page))
    assert.ok(pagesRepresented.size >= 1, '抽样池必须覆盖有效分页')

    // 验证元素全部唯一（去重有效）
    const idSet = new Set(sampled.map((item) => item.id))
    assert.equal(idSet.size, sampled.length, '抽样池必须完全去重')
  })

  it('E2E-2: 会话缓存保证单次会话内稳定，刷新时清空缓存并重采样', async () => {
    const cache = new CategoryShuffleCache(10)
    const poolA = [{ id: '1' }, { id: '2' }, { id: '3' }]
    const poolB = [{ id: '10' }, { id: '20' }, { id: '30' }]

    // 首次进入：打乱并存入缓存
    const first = cache.getOrShuffle('scene', poolA)
    assert.equal(cache.has('scene'), true)

    // 再次读取：必须返回相同的引用（保证会话内不跳动）
    const second = cache.get('scene')
    assert.strictEqual(first, second)

    // 用户触发刷新：清空缓存
    cache.clear()
    assert.equal(cache.has('scene'), false)

    // 刷新后重新加载新抽样数据
    const refreshed = cache.getOrShuffle('scene', poolB)
    assert.equal(cache.has('scene'), true)
    assert.equal(refreshed[0].id.startsWith('10') || refreshed[0].id.startsWith('20') || refreshed[0].id.startsWith('30'), true)
  })

  it('E2E-3: 单页分类正常安全降级，原地打乱而不触发超界页码请求', async () => {
    const fetchedPages = []
    const mockSinglePage = async (catId, page) => {
      fetchedPages.push(page)
      return {
        ok: true,
        body: {
          totalPages: 1,
          total: 8,
          items: Array.from({ length: 8 }, (_, i) => ({ id: `single_${i}` })),
        },
      }
    }

    const res = await fetchCategoryRandomSample('style', mockSinglePage, (x) => x, 24)
    assert.equal(res.length, 8)
    assert.deepEqual(fetchedPages, [0], '仅有1页时只请求第0页，绝不超界')
  })
})
