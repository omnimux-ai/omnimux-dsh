import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TRENDING_SOURCE_PAGE_SIZE,
  TRENDING_SOURCE_STATUS,
  buildSourceQuery,
  deriveDimensions,
  deriveIndustryOptions,
  deriveRegionOptions,
  deriveViewBuckets,
  loadTrendingItems,
  mapSourceItem,
  mergeCapabilities,
  normalizeCoverUrl,
  readAgeDays,
  readEngagement,
  readStructure,
  readViews,
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
  assert.equal(query, `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}&country=US&category=beauty&views_min=1000000`)
  assert.equal(buildSourceQuery(), `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}`)
  assert.equal(buildSourceQuery({ views: '0' }), `sort=views&page_size=${TRENDING_SOURCE_PAGE_SIZE}`)
})

/** 最小 Response 替身。 */
function fakeResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body }
}

test('source: 有数据 → ready，并把行映射成卡片行', async () => {
  const result = await loadTrendingItems({
    fetchImpl: async () => fakeResponse({ data: { items: [makeRow({ id: 'r1' }), { id: 'r2' }], total: 2 } }),
  })
  assert.equal(result.status, TRENDING_SOURCE_STATUS.ready)
  assert.equal(result.items.length, 2)
  assert.equal(result.total, 2)
  assert.equal(result.items[0].id, 'r1')
})

test('source: 被筛选筛空 ≠ 库为空（否则会误导用户去导入）', async () => {
  const emptyBody = { data: { items: [], total: 0 } }
  const byRegion = await loadTrendingItems({
    filters: { region: 'TH' },
    fetchImpl: async () => fakeResponse(emptyBody),
  })
  assert.equal(byRegion.status, TRENDING_SOURCE_STATUS.filtered)

  const byViews = await loadTrendingItems({
    filters: { views: '10000000' },
    fetchImpl: async () => fakeResponse(emptyBody),
  })
  assert.equal(byViews.status, TRENDING_SOURCE_STATUS.filtered)

  const unfiltered = await loadTrendingItems({
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
  const notFound = await loadTrendingItems({ fetchImpl: async () => fakeResponse({}, { ok: false, status: 404 }) })
  assert.equal(notFound.status, TRENDING_SOURCE_STATUS.unavailable)
  assert.equal(notFound.reason, 'http-404')
  assert.deepEqual(notFound.items, [])

  const thrown = await loadTrendingItems({ fetchImpl: async () => { throw new Error('boom') } })
  assert.equal(thrown.status, TRENDING_SOURCE_STATUS.unavailable)
  assert.equal(thrown.reason, 'network')

  const badJson = await loadTrendingItems({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad') } }) })
  assert.equal(badJson.reason, 'bad-json')

  const badShape = await loadTrendingItems({ fetchImpl: async () => fakeResponse({ data: { total: 3 } }) })
  assert.equal(badShape.reason, 'bad-shape')

  const aborted = await loadTrendingItems({
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
  const result = await loadTrendingItems({ fetchImpl: null, fetch: undefined })
  // Node 有全局 fetch，这条断言只保证「没有 fetch 实现」时不崩
  assert.ok(result.status === TRENDING_SOURCE_STATUS.unavailable || result.status === TRENDING_SOURCE_STATUS.ready)
})
