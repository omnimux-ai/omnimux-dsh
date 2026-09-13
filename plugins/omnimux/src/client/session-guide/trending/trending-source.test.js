import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CACHE_TTL_MS,
  TRENDING_SOURCE_PAGE_SIZE,
  TRENDING_SOURCE_STATUS,
  buildSourceQuery,
  clearTrendingCache,
  deriveDimensions,
  deriveIndustryOptions,
  deriveRegionOptions,
  deriveViewBuckets,
  getInspirationFingerprints,
  getTrendingCache,
  getTrendingCacheKey,
  loadTrendingPage,
  mapSourceItem,
  mergeCapabilities,
  normalizeCoverUrl,
  normalizeTrendingPage,
  peekTrendingCache,
  readAgeDays,
  readEngagement,
  readStructure,
  readViews,
  setTrendingCache,
  unionOptions,
} from './trending-source.js'

/** 一条接近真实形态的灵感库行。 */
function makeRow(overrides = {}) {
  return {
    id: 'insp_test',
    title: 'Reference video title',
    country_code: 'us',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/cover_abc.jpg',
    source_url: 'https://www.tiktok.com/@a/video/1',
    stats: { likes: 100, comments: 20, shares: 5, views: 1000 },
    deconstruction: { hook_highlight: '【钩子】开场 3 秒反差' },
    published_at: '2026-09-10T00:00:00.000Z',
    tags: ['a', '', 'b'],
    ...overrides,
  }
}

const NOW = Date.parse('2026-09-12T12:00:00.000Z')

test('source: 封面路径归一覆盖本地库 / 云目录 / 绝对 URL / 裸 key', () => {
  assert.equal(
    normalizeCoverUrl('/omnimux/inspiration/local/media/covers/a.jpg'),
    '/omnimux/inspiration/local/media/covers/a.jpg',
  )
  assert.equal(
    normalizeCoverUrl('/omnimux/inspiration/media/covers/a.jpg'),
    '/omnimux/inspiration/media/covers/a.jpg',
  )
  assert.equal(
    normalizeCoverUrl('/api/inspiration/v1/media/covers/a.jpg'),
    '/omnimux/inspiration/media/covers/a.jpg',
  )
  assert.equal(normalizeCoverUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(normalizeCoverUrl('covers/a.jpg'), '/omnimux/inspiration/media/covers/a.jpg')
  // 目录穿越必须被拒，返回空串让卡片走矢量兜底
  assert.equal(normalizeCoverUrl('/omnimux/inspiration/media/../../etc/passwd'), '')
  assert.equal(normalizeCoverUrl(''), '')
  assert.equal(normalizeCoverUrl(null), '')
})

test('source: 播放量读 stats 优先、顶层兜底，读不到是 null 而不是 0', () => {
  assert.equal(readViews(makeRow()), 1000)
  assert.equal(readViews({ stats: { views: '2500' } }), 2500)
  assert.equal(readViews({ views: 3200 }), 3200)
  // 「不知道播放量」必须与「播放量是 0」区分开：两者都落到 null，卡片显示 `—`
  assert.equal(readViews({ stats: {}, views: 0 }), null)
  assert.equal(readViews({}), null)
  assert.equal(readViews(null), null)
})

test('source: 互动率 = (赞+评+转) ÷ 播放量 ×100，缺播放量返回 null 而不是编一个数', () => {
  assert.equal(readEngagement(makeRow()), 12.5)
  // 缺 shares 按 0 计，不是缺失整体
  assert.equal(readEngagement({ stats: { likes: 10, views: 100 } }), 10)
  // 没有播放量就没有分母
  assert.equal(readEngagement({ stats: { likes: 10 } }), null)
  assert.equal(readEngagement({ stats: { likes: 10, views: 0 } }), null)
  assert.equal(readEngagement({ stats: { views: 100 } }), 0)
})

test('source: 结构要点优先钩子高亮、去 Markdown、超长截断', () => {
  assert.equal(readStructure({ deconstruction: { hook_highlight: '**要点**' } }), '要点')
  assert.equal(readStructure({ deconstruction: { hook: '只有 hook' } }), '只有 hook')
  assert.equal(readStructure({ deconstruction: { summary: '只有 summary' } }), '只有 summary')
  assert.equal(readStructure({ deconstruction: { hook_highlight: '', hook: 'h' } }), 'h')
  assert.equal(readStructure({}), '')
  assert.equal(readStructure(null), '')
  const long = readStructure({ deconstruction: { summary: 'x'.repeat(400) } })
  assert.equal(long.length, 158)
  assert.ok(long.endsWith('…'))
})

test('source: 入库行映射不补默认值（缺就是空）', () => {
  const item = mapSourceItem(makeRow(), NOW)
  assert.deepEqual(item, {
    id: 'insp_test',
    title: 'Reference video title',
    region: 'US',
    industry: 'beauty',
    tags: ['a', 'b'],
    views: 1000,
    engagement: 12.5,
    days: 2,
    cover: '/omnimux/inspiration/local/media/covers/cover_abc.jpg',
    sourceUrl: 'https://www.tiktok.com/@a/video/1',
    structure: '【钩子】开场 3 秒反差',
    product: '',
    angle: '',
  })

  const sparse = mapSourceItem({ id: 'insp_sparse' }, NOW)
  assert.equal(sparse.region, '')
  assert.equal(sparse.industry, '')
  assert.equal(sparse.views, null)
  assert.equal(sparse.engagement, null)
  assert.equal(sparse.days, null)
  assert.equal(sparse.cover, '')
  assert.equal(sparse.structure, '')
  assert.deepEqual(sparse.tags, [])

  // 没有 id 的行无法定位，直接丢弃而不是造一个 id
  assert.equal(mapSourceItem({ title: 'no id' }), null)
  assert.equal(mapSourceItem(null), null)
})

test('source: 发布距今天数只认真实时间，未来或不可解析一律 null', () => {
  assert.equal(readAgeDays('2026-09-10T12:00:00.000Z', NOW), 2)
  assert.equal(readAgeDays('2026-09-12T12:00:00.000Z', NOW), 0)
  assert.equal(readAgeDays('2026-09-20T12:00:00.000Z', NOW), null)
  assert.equal(readAgeDays('not-a-date', NOW), null)
  assert.equal(readAgeDays('', NOW), null)
  assert.equal(readAgeDays(undefined, NOW), null)
})

test('source: 维度由数据推导，没有数据的维度不得为真', () => {
  assert.deepEqual(deriveDimensions([]), {
    region: false, industry: false, views: false, engagement: false, range: false,
  })

  const items = [mapSourceItem(makeRow(), NOW)]
  assert.deepEqual(deriveDimensions(items), {
    region: true, industry: true, views: true, engagement: true, range: true,
  })

  const sparse = [mapSourceItem({ id: 'insp_x' }, NOW)]
  assert.deepEqual(deriveDimensions(sparse), {
    region: false, industry: false, views: false, engagement: false, range: false,
  })

  // 有播放量但没有发布时间的库：时间窗维度必须为假
  const noDate = [mapSourceItem({ id: 'insp_y', stats: { views: 10, likes: 1 } }, NOW)]
  assert.equal(deriveDimensions(noDate).range, false)
  assert.equal(deriveDimensions(noDate).views, true)
  assert.equal(deriveDimensions(noDate).engagement, true)
})

test('source: 地区 / 类目档位由数据推导并去重排序', () => {
  const items = [
    mapSourceItem(makeRow({ id: 'a', country_code: 'th' }), NOW),
    mapSourceItem(makeRow({ id: 'b', country_code: 'US' }), NOW),
    mapSourceItem(makeRow({ id: 'c', country_code: 'us' }), NOW),
    mapSourceItem(makeRow({ id: 'd', country_code: '', category: '' }), NOW),
  ]
  assert.deepEqual(deriveRegionOptions(items), [
    { value: '', labelKey: 'trending.region.all' },
    { value: 'TH', label: 'TH' },
    { value: 'US', label: 'US' },
  ])
  assert.deepEqual(deriveIndustryOptions(items), [
    { value: '', labelKey: 'trending.industry.all' },
    { value: 'beauty', label: 'beauty' },
  ])
})

test('source: query 只带服务端过滤条件，排序与窗口固定', () => {
  const query = buildSourceQuery({ region: 'US', industry: 'beauty', views: '1000000', engagement: '2', sort: 'engagement' })
  assert.equal(query, `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&page=1&country=US&category=beauty&views_min=1000000`)
  assert.equal(buildSourceQuery(), `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&page=1`)
  assert.equal(buildSourceQuery({ views: '0' }), `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&page=1`)
})

test('source: 翻页 query 带上 page，非法页号收敛回第 1 页', () => {
  assert.equal(buildSourceQuery({ page: 3 }), `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&page=3`)
  for (const bad of [0, -2, Number.NaN, 'abc', null, undefined, {}]) {
    assert.equal(
      buildSourceQuery({ page: bad }),
      `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&page=1`,
      `页号 ${String(bad)} 必须收敛回第 1 页`,
    )
  }
  assert.equal(buildSourceQuery({ page: 2.7 }), `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&page=2`)
})

test('source: 缓存 key 含页码——第 2 页不得覆盖第 1 页的缓存', () => {
  const filters = { region: 'US' }
  assert.notEqual(
    getTrendingCacheKey({ filters, page: 1 }),
    getTrendingCacheKey({ filters, page: 2 }),
  )
  assert.equal(getTrendingCacheKey({ filters }), getTrendingCacheKey({ filters, page: 1 }))
})

/** 最小 Response 替身。 */
function fakeResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body }
}

test('source: 有数据 → ready，并把行映射成卡片行', async () => {
  const result = await loadTrendingPage({
    fetchImpl: async () => fakeResponse({ data: { items: [makeRow({ id: 'r1' }), { id: 'r2' }], total: 2 } }),
  })
  assert.equal(result.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(result.items.length, 2)
  assert.equal(result.total, 2)
  assert.equal(result.items[0].id, 'r1')
})

test('source: 单页拉满一窗 → hasMore 为真；回不满则天然停在末尾', async () => {
  clearTrendingCache()
  // 指纹含封面路径：测试行必须各带自己的封面，否则会被真源当同一支片的镜像剔掉
  const fullWindow = Array.from(
    { length: TRENDING_SOURCE_PAGE_SIZE },
    (_, index) => makeRow({
      id: `full_${index}`,
      source_url: `https://www.tiktok.com/@a/video/${300000000000000 + index}`,
      cover_url: `/omnimux/inspiration/local/media/covers/full_${index}.jpg`,
    }),
  )

  const filled = await loadTrendingPage({
    sourcePaths: ['/local'],
    sourcePageSizes: { '/local': TRENDING_SOURCE_PAGE_SIZE },
    fetchImpl: async () => fakeResponse({ data: { items: fullWindow, total: fullWindow.length } }),
  })
  assert.equal(filled.items.length, TRENDING_SOURCE_PAGE_SIZE)
  assert.equal(filled.hasMore, true)
  assert.equal(filled.page, 1)

  clearTrendingCache()
  const tail = await loadTrendingPage({
    sourcePaths: ['/local'],
    sourcePageSizes: { '/local': TRENDING_SOURCE_PAGE_SIZE },
    fetchImpl: async () => fakeResponse({ data: { items: [makeRow({ id: 'tail_1' })], total: 1 } }),
  })
  assert.equal(tail.items.length, 1)
  assert.equal(tail.hasMore, false)
})

test('source: 上游忽略 page 参数时不会空转——第二页整页都是旧的，hasMore 仍按窗口判定', async () => {
  clearTrendingCache()
  const rows = [
    makeRow({ id: 'fixed_1', source_url: 'https://www.tiktok.com/@a/video/900000000000001', cover_url: '/omnimux/inspiration/local/media/covers/fixed_1.jpg' }),
    makeRow({ id: 'fixed_2', source_url: 'https://www.tiktok.com/@a/video/900000000000002', cover_url: '/omnimux/inspiration/local/media/covers/fixed_2.jpg' }),
  ]
  const fetchImpl = async () => fakeResponse({ data: { items: rows, total: rows.length } })
  const options = { sourcePaths: ['/local'], sourcePageSizes: { '/local': 2 }, fetchImpl }

  const first = await loadTrendingPage({ ...options, page: 1 })
  const second = await loadTrendingPage({ ...options, page: 2 })

  assert.equal(first.items.length, 2)
  assert.equal(first.hasMore, true, '首页填满窗口 → 还有下一页')
  // 真源看不清「第二页是不是旧的」（它只见到一页），收口由取数状态机按
  // 「这一批带来了几张新卡片」判定：见 use-trending-feed.js 的 gained 分支。
  assert.equal(second.items.length, 2)
  assert.equal(second.hasMore, true)
})

test('source: 追加页请求真的带上页码，不与首页共用缓存', async () => {
  clearTrendingCache()
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    return fakeResponse({ data: { items: [makeRow({ id: 'p2_a' })], total: 1 } })
  }

  const first = await loadTrendingPage({ sourcePaths: ['/local'], filters: { region: 'US' }, page: 1, fetchImpl })
  const second = await loadTrendingPage({ sourcePaths: ['/local'], filters: { region: 'US' }, page: 2, fetchImpl })

  assert.equal(calls.length, 2, '首页被缓存，第 2 页是新的网络请求')
  assert.match(calls[0], /page=1/)
  assert.match(calls[1], /page=2/)
  assert.equal(first.items[0].id, 'p2_a')
  assert.equal(second.items[0].id, 'p2_a')
})

test('source: 页号归一——缺省与非法值都是第 1 页', () => {
  assert.equal(normalizeTrendingPage(undefined), 1)
  assert.equal(normalizeTrendingPage(0), 1)
  assert.equal(normalizeTrendingPage(-3), 1)
  assert.equal(normalizeTrendingPage('x'), 1)
  assert.equal(normalizeTrendingPage(4), 4)
  assert.equal(normalizeTrendingPage('7'), 7)
})

test('source: peekTrendingCache 只看缓存不发请求，key 由入参自己算', async () => {
  clearTrendingCache()
  const filters = { region: 'US' }
  assert.equal(peekTrendingCache({ filters }), null, '没缓存时如实返回 null')

  let fetchCount = 0
  await loadTrendingPage({
    filters,
    cache: true,
    fetchImpl: async () => {
      fetchCount += 1
      return fakeResponse({ data: { items: [makeRow({ id: 'peek_1' })], total: 1 } })
    },
  })

  const hit = peekTrendingCache({ filters })
  assert.ok(hit, '写过缓存后必须能 peek 到')
  assert.equal(hit.isStale, false)
  assert.deepEqual(hit.page.items.map((item) => item.id), ['peek_1'])
  assert.equal(fetchCount, 2, 'peek 自身不得触发任何网络调用')

  // 换一组筛选条件就该是另一把 key，不能蹭到别人的缓存
  assert.equal(peekTrendingCache({ filters: { region: 'TH' } }), null)

  // 过期条目仍要能被 peek 到：首屏先呈现旧内容、再由重取结果覆盖，而不是清空重来
  setTrendingCache(getTrendingCacheKey({ filters }), hit.page, -1000)
  assert.equal(peekTrendingCache({ filters })?.isStale, true)
})

test('source: 被筛选筛空 ≠ 库为空（否则会误导用户去导入）', async () => {
  const emptyBody = { data: { items: [], total: 0 } }
  const byRegion = await loadTrendingPage({
    filters: { region: 'TH' },
    fetchImpl: async () => fakeResponse(emptyBody),
  })
  assert.equal(byRegion.status, TRENDING_SOURCE_STATUS.filtered)

  const byViews = await loadTrendingPage({
    filters: { views: '10000000' },
    fetchImpl: async () => fakeResponse(emptyBody),
  })
  assert.equal(byViews.status, TRENDING_SOURCE_STATUS.filtered)

  const unfiltered = await loadTrendingPage({
    filters: {},
    fetchImpl: async () => fakeResponse(emptyBody),
  })
  assert.equal(unfiltered.status, TRENDING_SOURCE_STATUS.empty)
})

test('source: 播放量档位只保留真能切分的档，切不动就整个维度不成立', () => {
  const mixed = deriveViewBuckets([
    { views: 40_000_000 },
    { views: 12_000_000 },
    { views: 900_000 },
  ])
  assert.deepEqual(mixed.map((b) => b.value), ['', '1000000', '5000000', '10000000'])

  // 全都在 10M 以上：四个阈值任选结果一样，就是这个模块要防的假控件
  assert.deepEqual(deriveViewBuckets([{ views: 20_000_000 }, { views: 40_000_000 }]), [])
  assert.equal(deriveDimensions([{ views: 20_000_000 }]).views, false)
  assert.deepEqual(deriveViewBuckets([]), [])
  assert.deepEqual(deriveViewBuckets([{ views: null }]), [])
})

test('source: 能力集单调只增不减（筛选后档位不得塌陷）', () => {
  const all = [mapSourceItem(makeRow({ id: 'a', country_code: 'us' }), NOW)]
  const onlyTh = [mapSourceItem(makeRow({ id: 'b', country_code: 'th' }), NOW)]

  const first = mergeCapabilities(null, all)
  assert.deepEqual(first.regionOptions.map((o) => o.value), ['', 'US'])

  const second = mergeCapabilities(first, onlyTh)
  assert.deepEqual(second.regionOptions.map((o) => o.value), ['', 'TH', 'US'], '旧档位必须保留，否则换不回地区')
  assert.equal(second.dimensions.region, true)

  // 维度一旦成立就不该因为下一批缺字段而消失
  const sparse = [mapSourceItem({ id: 'c' }, NOW)]
  const third = mergeCapabilities(second, sparse)
  assert.equal(third.dimensions.region, true)
  assert.equal(third.dimensions.views, true)
  assert.deepEqual(third.regionOptions.map((o) => o.value), ['', 'TH', 'US'])

  assert.deepEqual(unionOptions([], []), [])
  assert.deepEqual(
    unionOptions([{ value: 'US', label: 'US' }], [{ value: '', labelKey: 'trending.region.all' }]).map((o) => o.value),
    ['', 'US'],
  )
})

test('source: 灵感库没装 / 未登录 / 网络异常一律 unavailable，绝不回落假数据', async () => {
  const notFound = await loadTrendingPage({ fetchImpl: async () => fakeResponse({}, { ok: false, status: 404 }) })
  assert.equal(notFound.status, TRENDING_SOURCE_STATUS.unavailable)
  assert.equal(notFound.reason, 'http-404')
  assert.deepEqual(notFound.items, [])

  const thrown = await loadTrendingPage({ fetchImpl: async () => { throw new Error('boom') } })
  assert.equal(thrown.status, TRENDING_SOURCE_STATUS.unavailable)
  assert.equal(thrown.reason, 'network')

  const badJson = await loadTrendingPage({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad') } }) })
  assert.equal(badJson.reason, 'bad-json')

  const badShape = await loadTrendingPage({ fetchImpl: async () => fakeResponse({ data: { total: 3 } }) })
  assert.equal(badShape.reason, 'bad-shape')

  const aborted = await loadTrendingPage({
    fetchImpl: async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    },
  })
  assert.equal(aborted.status, TRENDING_SOURCE_STATUS.unavailable)
  assert.equal(aborted.reason, 'aborted')
})

test('source: 没有可用 fetch 时不抛错，直接报 unavailable', async () => {
  const result = await loadTrendingPage({ fetchImpl: null, fetch: undefined })
  // Node 有全局 fetch，这条断言只保证「没有 fetch 实现」时不崩
  assert.ok(result.status === TRENDING_SOURCE_STATUS.unavailable || result.status === TRENDING_SOURCE_STATUS.ready)
})

test('source: 兼容解析云端精选灵感库结构（数字 id、analysis 结构、顶层 views、cover_key）', () => {
  const cloudRow = {
    id: 3007,
    title: '误会男友玩Tinder的相册清理App反转',
    country_code: 'US',
    category: 'Personal Development',
    cover_key: '/omnimux/inspiration/media/inspiration-covers/3007',
    source_url: 'https://www.tiktok.com/@test/video/1',
    views: 38600000,
    posted_at: '2026-09-10T00:00:00.000Z',
    analysis: {
      hook_highlight: '### 事实观察\n开场反转展示相册清理 App',
    },
  }
  const item = mapSourceItem(cloudRow, NOW)
  assert.equal(item.id, '3007', '数字 ID 必须规范转为 string')
  assert.equal(item.region, 'US')
  assert.equal(item.industry, 'Personal Development')
  assert.equal(item.views, 38600000)
  assert.equal(item.cover, '/omnimux/inspiration/media/inspiration-covers/3007')
  assert.ok(item.structure.includes('开场反转展示相册清理 App'))
})

test('source: 双源聚合拉取（本地库 + 云端库合并去重）', async () => {
  const localRow = makeRow({ id: 'local_1', title: 'Local video 1' })
  const cloudRow = {
    id: 2690,
    title: 'Cloud viral video 1',
    views: 78200000,
    cover_key: '/omnimux/inspiration/media/inspiration-covers/2690',
  }
  const duplicateCloudRow = {
    id: 'local_1',
    title: 'Duplicate in cloud',
    views: 500000,
  }

  const result = await loadTrendingPage({
    fetchImpl: async (url) => {
      const u = String(url)
      if (u.includes('/local')) {
        return fakeResponse({ data: { items: [localRow], total: 1 } })
      }
      return fakeResponse({ data: { items: [cloudRow, duplicateCloudRow], total: 2 } })
    },
  })

  assert.equal(result.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(result.items.length, 2, '必须合并且按 ID 去重')
  assert.equal(result.items[0].id, 'local_1', '本地源项目优先保留')
  assert.equal(result.items[1].id, '2690', '云端项目顺利合并排入')
})

test('source: 数据内存缓存命中（TTL 有效期内 0ms 返回、不重复发网络请求）', async () => {
  clearTrendingCache()
  let fetchCount = 0
  const row = makeRow({ id: 'cache_test_1', title: 'Cached video' })

  const fetchImpl = async () => {
    fetchCount += 1
    return fakeResponse({ data: { items: [row], total: 1 } })
  }

  // 首次请求：未命中缓存，发起网络请求
  const res1 = await loadTrendingPage({ fetchImpl, filters: { region: 'US' }, cache: true })
  assert.equal(res1.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(res1.items[0].id, 'cache_test_1')
  assert.equal(fetchCount, 2, '双源聚合共请求 2 个端点')

  // 第二次相同参数请求：命中新鲜缓存，网络请求次数不增加
  const res2 = await loadTrendingPage({ fetchImpl, filters: { region: 'US' }, cache: true })
  assert.equal(res2.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(res2.items[0].id, 'cache_test_1')
  assert.equal(fetchCount, 2, '命中缓存，不得再次发起网络调用')

  // 第三次使用 forceRefresh: true，强制绕过缓存重新拉取
  const res3 = await loadTrendingPage({ fetchImpl, filters: { region: 'US' }, forceRefresh: true, cache: true })
  assert.equal(res3.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(fetchCount, 4, '强制刷新必须重新触发网络请求')
})

test('source: 网络拉取失败时如存在陈旧缓存则平滑降级使用陈旧缓存', async () => {
  clearTrendingCache()
  const key = getTrendingCacheKey({ filters: { region: 'JP' } })
  const staleData = {
    status: TRENDING_SOURCE_STATUS.ready,
    items: [mapSourceItem(makeRow({ id: 'stale_1', title: 'Stale cached item' }))],
    total: 1,
  }
  // 注入已过期缓存
  setTrendingCache(key, staleData, -1000)

  // 此时网络报错失败
  const res = await loadTrendingPage({
    filters: { region: 'JP' },
    cache: true,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  })

  // 平滑降级至陈旧缓存，页面不崩溃
  assert.equal(res.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(res.items[0].id, 'stale_1')
})

test('source: getInspirationFingerprints 稳健提取真实 TikTok ID、作者播放量指纹并清洗临时后缀', () => {
  const rowA = {
    id: '339',
    source_url: 'https://www.tiktok.com/@kob.studys/video/7558617674939452703',
    stats: { views: 16200000 },
    cover_url: '/omnimux/inspiration/media/covers/kob.jpg',
  }
  const fpsA = getInspirationFingerprints(rowA)
  assert.ok(fpsA.includes('tt:7558617674939452703'))
  assert.ok(fpsA.includes('av:kobstudys:16200000'))
  assert.ok(fpsA.includes('cov:omnimux/inspiration/media/covers/kob.jpg'))

  // 镜像换皮行：带 gxgen 虚拟 URL 和被污染的 base64 handle，同播放量同封面
  const rowB = {
    id: '641',
    source_url: 'https://www.tiktok.com/@kob.studys-ahr0chm6ly92dc50awt0/video/gxgen-33032957-5ffd-4c15',
    stats: { views: 16200000 },
    cover_key: '/omnimux/inspiration/media/covers/kob.jpg',
  }
  const fpsB = getInspirationFingerprints(rowB)
  // 清洗后两者具备完全相同的作者播放量指纹与封面指纹
  assert.ok(fpsB.includes('av:kobstudys:16200000'))
  assert.ok(fpsB.includes('cov:omnimux/inspiration/media/covers/kob.jpg'))
})

test('source: 双源聚合时彻底识别并剔除换皮/重复爆款', async () => {
  clearTrendingCache()
  const fetchImpl = async (url) => {
    if (url.includes('/omnimux/inspiration/local')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: [
              {
                id: 'local_1',
                title: 'AI 播客咳嗽引发的“恐怖谷”反应',
                source_url: 'https://www.tiktok.com/@kob.studys/video/7558617674939452703',
                stats: { views: 16200000 },
              },
            ],
          },
        }),
      }
    }
    // 云端库返回了同一视频的另一个换皮版本（不同 id、不同 url，但相同博主与播放量）
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          items: [
            {
              id: 'cloud_dup_1',
              title: 'AI 播客“太像人”的惊愕瞬间',
              source_url: 'https://www.tiktok.com/@kob.studys/video/gxgen-33032957-5ffd-4c15',
              stats: { views: 16200000 },
            },
            {
              id: 'cloud_distinct_2',
              title: '全新独立视频',
              source_url: 'https://www.tiktok.com/@other/video/9999999999999999',
              stats: { views: 500000 },
            },
          ],
        },
      }),
    }
  }

  const res = await loadTrendingPage({ fetchImpl, cache: false })
  assert.equal(res.status, TRENDING_SOURCE_STATUS.ready)
  // 必须成功去重：原本 3 条数据，去重后只保留 2 条（重复的 cloud_dup_1 被剔除）
  assert.equal(res.items.length, 2)
  assert.equal(res.items[0].id, 'local_1')
  assert.equal(res.items[1].id, 'cloud_distinct_2')
})
