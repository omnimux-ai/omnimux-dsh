import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendTrendingItems,
  emptyFeedState,
  getTrendingItemKeys,
  seedFeedState,
} from './trending-feed.js'

/**
 * 一张已映射的卡片行（字段名以 trending-source.js 的 mapSourceItem 输出为准）。
 *
 * 默认值刻意做到「互相不重复」：指纹含标题 + 播放量，若所有样本共用标题与播放量，
 * 任何两条都会被判成同一支片的镜像，测出来的就不是去重逻辑而是样本自己撞车。
 */
function makeItem(overrides = {}) {
  return {
    id: 'insp_1',
    title: 'Reference video title',
    region: 'US',
    industry: 'beauty',
    tags: [],
    views: 1000,
    engagement: 2,
    days: 1,
    cover: '/omnimux/inspiration/media/covers/a.jpg',
    sourceUrl: 'https://www.tiktok.com/@a/video/1',
    structure: '',
    product: '',
    angle: '',
    ...overrides,
  }
}

/** 造一张与前一张在任何指纹维度上都不相同的卡片。 */
function makeDistinctItem(id) {
  return makeItem({
    id,
    title: `Reference video ${id}`,
    sourceUrl: `https://www.tiktok.com/@a/video/${id}`,
    views: 1000 + id.length,
  })
}

test('feed: 内容指纹覆盖 id / 来源链接 / 标题+播放量，缺身份的行返回空集', () => {
  const keys = getTrendingItemKeys(makeItem())
  assert.ok(keys.includes('id:insp_1'))
  assert.ok(keys.includes('url:https://www.tiktok.com/@a/video/1'))
  assert.ok(keys.includes('tv:reference video title:1000'))

  // 标题过短不参与指纹：短标题重合概率高，用它会误删真实数据
  const short = getTrendingItemKeys(makeItem({ title: 'Ai', id: '', sourceUrl: '' }))
  assert.deepEqual(short, [])

  // 非对象入参同样收敛成空集，而不是抛错
  assert.deepEqual(getTrendingItemKeys(null), [])
  assert.deepEqual(getTrendingItemKeys('nope'), [])
})

test('feed: 追加页剔除与已有条目重复的卡片，且不改动入参数组', () => {
  const first = [makeDistinctItem('a'), makeDistinctItem('b')]
  const more = [
    // 同一 id：同一支片的换皮镜像
    makeItem({ id: 'b', title: 'Reference video b', sourceUrl: 'https://www.tiktok.com/@a/video/b', views: 1001 }),
    makeDistinctItem('c'),
  ]
  const merged = appendTrendingItems(first, more)

  assert.deepEqual(merged.map((item) => item.id), ['a', 'b', 'c'])
  assert.equal(first.length, 2, '入参数组不得被就地修改')
  assert.notEqual(merged, first, '有新增时必须返回新数组，触发 React 重渲染')
})

test('feed: 同一支片的换皮镜像按「标题+播放量」识别，不重复上屏', () => {
  const first = [makeItem({ id: 'a', title: 'Same hook video', views: 5000 })]
  // 换了 id、换了链接，但标题与播放量一致：同一支片的镜像条目
  const more = [makeItem({ id: 'z', sourceUrl: 'https://x/z', title: 'same hook video', views: 5000 })]
  const merged = appendTrendingItems(first, more)

  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'a')
})

test('feed: 同一批内部的重复同样剔除——两个源回同一条是常态', () => {
  const merged = appendTrendingItems([], [
    makeItem({ id: 'dup', title: 'Shared video', sourceUrl: 'https://www.tiktok.com/@a/video/x', views: 700 }),
    // 同一支片从另一个源回来：id 与链接都换了，标题与播放量一致
    makeItem({ id: 'dup-mirror', title: 'shared video', sourceUrl: 'https://mirror/x', views: 700 }),
    makeDistinctItem('keep'),
  ])

  assert.deepEqual(merged.map((item) => item.id), ['dup', 'keep'])
})

test('feed: 没有任何新条目时原样返回，避免无意义的重渲染', () => {
  const first = [makeDistinctItem('a')]
  assert.equal(appendTrendingItems(first, [makeDistinctItem('a')]), first)
  assert.equal(appendTrendingItems(first, []), first)
  assert.equal(appendTrendingItems(first, null), first)
  assert.deepEqual(appendTrendingItems(undefined, undefined), [])
})

test('feed: 首屏初值——没缓存给空骨架，有缓存同步恢复并沿用「到头没」的记录', () => {
  const blank = emptyFeedState()
  assert.deepEqual(blank, { items: [], status: 'loading', loading: true, loadingMore: false, hasMore: true, page: 1 })

  // 没有缓存 / 缓存是空列表：都按空骨架处理，不能把空列表当「已有内容」
  assert.deepEqual(seedFeedState(null), blank)
  assert.deepEqual(seedFeedState(undefined), blank)
  assert.deepEqual(seedFeedState({ items: [], status: 'ready', hasMore: false }), blank)
  assert.deepEqual(seedFeedState({ status: 'ready' }), blank)

  // 有缓存：直接呈现那一批，且仍在后台重取（loading 保持真）
  const seeded = seedFeedState({ items: [makeDistinctItem('a')], status: 'ready', hasMore: true })
  assert.deepEqual(seeded.items.map((item) => item.id), ['a'])
  assert.equal(seeded.status, 'ready')
  assert.equal(seeded.loading, true, '缓存只是先呈现，后台仍要重取')
  assert.equal(seeded.loadingMore, false)
  assert.equal(seeded.hasMore, true)
  assert.equal(seeded.page, 1)

  // 缓存页记着「已经到头」：初值不得再翻一页，否则重挂载会白拉一次
  const exhausted = seedFeedState({ items: [makeDistinctItem('b')], status: 'ready', hasMore: false })
  assert.equal(exhausted.hasMore, false)

  // 缓存没记这个字段（老版本写下的条目）：按「还有」处理，重取结果会纠正
  assert.equal(seedFeedState({ items: [makeDistinctItem('c')], status: 'ready' }).hasMore, true)

  // 缓存页缺状态字段时不得塌成 'loading'：那会让「工具栏是否出现」判断成还在首屏加载
  assert.equal(seedFeedState({ items: [makeDistinctItem('d')] }).status, 'ready')
  // 但缓存页自己的状态要如实带出来（被筛空 / 空库都要保持原样）
  assert.equal(seedFeedState({ items: [makeDistinctItem('e')], status: 'filtered' }).status, 'filtered')
})
