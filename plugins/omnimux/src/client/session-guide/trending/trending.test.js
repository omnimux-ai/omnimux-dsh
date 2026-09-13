import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  TRENDING_ACCENT_COUNT,
  TRENDING_DATA_VERSION,
  TRENDING_ENGAGEMENT_BUCKETS,
  TRENDING_RANGES,
  TRENDING_SORTS,
  TRENDING_VIEW_BUCKETS,
  accentIndex,
  buildClonePrompt,
  defaultTrendingFilters,
  filterTrendingVideos,
  formatCompactNumber,
  formatEngagementPercent,
  selectTrendingVideos,
  sortTrendingVideos,
} from './trending-data.js'
import { guideEn, guideZh } from '../catalog.js'

/** 纯函数测试用的卡片行（形态与 trending-source 的映射结果一致）。 */
const ITEMS = [
  { id: 'a', region: 'US', industry: 'beauty', views: 12_000_000, engagement: 2.5, days: 3, title: 'A', structure: 's-a', product: '' },
  { id: 'b', region: 'US', industry: 'home', views: 900_000, engagement: 0.8, days: 40, title: 'B', structure: 's-b', product: '' },
  { id: 'c', region: 'TH', industry: 'beauty', views: 40_000_000, engagement: 1.4, days: null, title: 'C', structure: 's-c', product: '' },
]

test('trending: 紧凑数字与互动率读数对齐卡片', () => {
  assert.equal(formatCompactNumber(14520000), '14.52M')
  assert.equal(formatCompactNumber(9530000), '9.53M')
  assert.equal(formatCompactNumber(2400), '2.4K')
  assert.equal(formatCompactNumber(0), '0')

  assert.equal(formatEngagementPercent(7.4), '7.4%')
  assert.equal(formatEngagementPercent(8), '8%')
  assert.equal(formatEngagementPercent(6.84), '6.8%')
  assert.equal(formatEngagementPercent(9.06), '9.1%')
  // 缺字段的样本不得渲染出 NaN%
  assert.equal(formatEngagementPercent(0), '0%')
  assert.equal(formatEngagementPercent(-5), '0%')
  assert.equal(formatEngagementPercent(undefined), '0%')
  assert.equal(formatEngagementPercent(null), '0%')
  assert.equal(formatEngagementPercent(Number.NaN), '0%')
})

test('trending: 格式化跨档必须进位，不得出现 1000K/1000M/1000B', () => {
  assert.equal(formatCompactNumber(999999), '1M')
  assert.equal(formatCompactNumber(999999999), '1B')
  for (const value of [
    999, 1000, 999499, 999999, 1000000, 999999999, 1000000000, 999999999999,
  ]) {
    assert.ok(
      !/^1000(\.[0-9]+)?[KMBT]$/.test(formatCompactNumber(value)),
      `${value} 产出了未归一的读数 ${formatCompactNumber(value)}`,
    )
  }
})

test('trending: 档位定义完整，互动率按真实分布定标', () => {
  for (const buckets of [
    TRENDING_VIEW_BUCKETS,
    TRENDING_ENGAGEMENT_BUCKETS,
  ]) {
    assert.equal(buckets[0].value, '', '每个筛选维度都必须提供默认档')
    for (const bucket of buckets.slice(1)) {
      assert.ok(bucket.value !== '', '非默认档位必须携带下界值')
      assert.ok(
        bucket.labelKey || bucket.label,
        `非默认档位必须提供 labelKey 或 label: ${JSON.stringify(bucket)}`,
      )
    }
  }
  assert.ok(TRENDING_RANGES.every((r) => r.labelKey))
  // 时间窗是唯一没有「默认档」语义的维度：没有空档，选了窗就再也回不到全量
  assert.equal(TRENDING_RANGES[0].value, '', '时间窗必须留一个空档')
  assert.ok(TRENDING_RANGES.slice(1).every((r) => r.value))
  assert.ok(TRENDING_SORTS.every((s) => s.value && s.labelKey))
  assert.deepEqual(TRENDING_SORTS.map((s) => s.value), ['recommend', 'views', 'engagement'])

  // 早期样本时代的 4/6/8% 档位在真实库（0.27%~4.21%）上会几乎筛空
  assert.deepEqual(TRENDING_ENGAGEMENT_BUCKETS.map((b) => b.value), ['', '0.5', '1', '2'])
  const thresholds = TRENDING_ENGAGEMENT_BUCKETS.slice(1).map((b) => Number(b.value))
  for (let i = 1; i < thresholds.length; i += 1) {
    assert.ok(thresholds[i - 1] < thresholds[i], '档位必须单调递增')
  }
})

test('trending: 默认筛选态只含在册维度', () => {
  assert.deepEqual(defaultTrendingFilters(), {
    region: '',
    industry: '',
    views: '',
    engagement: '',
    range: '',
    sort: 'recommend',
  })
})

test('trending: 各维度筛选与组合筛选都真实生效', () => {
  const base = defaultTrendingFilters()
  assert.equal(filterTrendingVideos(ITEMS, base).length, ITEMS.length, '全开筛选即全量')

  const us = filterTrendingVideos(ITEMS, { ...base, region: 'US' })
  assert.ok(us.length > 0 && us.every((it) => it.region === 'US'))

  const beauty = filterTrendingVideos(ITEMS, { ...base, industry: 'beauty' })
  assert.ok(beauty.length > 0 && beauty.every((it) => it.industry === 'beauty'))

  const highViews = filterTrendingVideos(ITEMS, { ...base, views: '10000000' })
  assert.ok(highViews.length > 0 && highViews.every((it) => it.views >= 10000000))

  const highEngagement = filterTrendingVideos(ITEMS, { ...base, engagement: '1' })
  assert.ok(highEngagement.length > 0, '互动率档位必须仍有命中：空集会让 every() 恒真而假通过')
  assert.ok(highEngagement.every((it) => it.engagement >= 1))

  // 时间窗是上限语义，且没有发布时间的行必须被排除（不能靠猜）
  const within7 = filterTrendingVideos(ITEMS, { ...base, range: '7' })
  assert.deepEqual(within7.map((it) => it.id), ['a'])
  const within90 = filterTrendingVideos(ITEMS, { ...base, range: '90' })
  assert.deepEqual(within90.map((it) => it.id).sort(), ['a', 'b'])

  const combined = filterTrendingVideos(ITEMS, { ...base, region: 'US', industry: 'beauty' })
  assert.deepEqual(combined.map((it) => it.id), ['a'])
  assert.equal(filterTrendingVideos(ITEMS, { ...base, region: 'US', industry: 'kitchen' }).length, 0)
  assert.equal(filterTrendingVideos(null, base).length, 0)
})

test('trending: 排序为降序、稳定、缺失主键排末尾且不改动入参', () => {
  const before = ITEMS.map((it) => it.id)
  const byViews = sortTrendingVideos(ITEMS, 'views')
  for (let i = 1; i < byViews.length; i += 1) {
    assert.ok(byViews[i - 1].views >= byViews[i].views, '播放量必须降序')
  }

  const byEngagement = sortTrendingVideos(ITEMS, 'engagement')
  for (let i = 1; i < byEngagement.length; i += 1) {
    assert.ok(byEngagement[i - 1].engagement >= byEngagement[i].engagement, '互动率必须降序')
  }

  assert.deepEqual(ITEMS.map((it) => it.id), before, '排序不得改动入参顺序')

  // 缺 engagement 的行当 0，排到末尾；同值按 id 升序兜底
  const withMissing = sortTrendingVideos(
    [{ id: 'b', engagement: null }, { id: 'a', engagement: 1 }, { id: 'c', engagement: 1 }],
    'engagement',
  )
  assert.deepEqual(withMissing.map((it) => it.id), ['a', 'c', 'b'])
})

test('trending: selectTrendingVideos 先筛后排', () => {
  const list = selectTrendingVideos({ ...defaultTrendingFilters(), region: 'US', sort: 'engagement' }, ITEMS)
  assert.deepEqual(list.map((it) => it.id), ['a', 'b'])
  assert.deepEqual(selectTrendingVideos(defaultTrendingFilters(), null), [])
})

test('trending: selectTrendingVideos 默认使用智能推荐算法排序', () => {
  const sampleItems = [
    { id: 'old_flat', views: 5000000, days: 120, stats: { likes: 5000 } },
    { id: 'new_viral', views: 200000, days: 2, stats: { likes: 12000, comments: 1000, saves: 2000, shares: 1000 } },
  ]
  const list = selectTrendingVideos(defaultTrendingFilters(), sampleItems)
  assert.equal(list[0].id, 'new_viral', '近期优质爆款在智能推荐算法下置顶')
  assert.equal(list[1].id, 'old_flat')
})

test('trending: 克隆指令只写真实存在的字段', () => {
  const real = ITEMS[0]
  const prompt = buildClonePrompt(real)
  assert.ok(prompt.startsWith('Clone the attached viral ad and create a new video with the following content:'))
  assert.ok(prompt.includes(real.title), '必须带入原始文案')
  assert.ok(prompt.includes('目标市场：US'), '必须带入目标市场')
  assert.ok(prompt.includes('可复用结构：s-a'), '必须带入真实拆解出来的结构')
  assert.ok(!prompt.includes('产品：'), '真源行没有产品字段时不得写占位产品行')
  assert.ok(prompt.includes('保留原片的钩子节奏'), '必须显式约束结构复用')

  const withProduct = buildClonePrompt({ ...real, product: '我的产品' })
  assert.ok(withProduct.includes('产品：我的产品'))

  assert.equal(buildClonePrompt(null), '')
  assert.equal(
    buildClonePrompt({}),
    'Clone the attached viral ad and create a new video with the following content:\n\n\n保留原片的钩子节奏、信息递进与转化落点，替换为我的产品后重新生成。',
  )
})

test('trending: 强调色由 id 稳定派生且落在四档内', () => {
  for (const item of ITEMS) {
    const idx = accentIndex(item.id)
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < TRENDING_ACCENT_COUNT, `accent 越界: ${item.id} -> ${idx}`)
    assert.equal(accentIndex(item.id), idx, '同一 id 必须得到同一档位')
  }
  assert.equal(accentIndex(''), accentIndex(''))
  assert.equal(accentIndex(null), accentIndex(''))
})

function read(rel) {
  return fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf-8')
}

test('trending: 数据只来自真源，代码里不得再有编造样本', () => {
  const data = read('./trending-data.js')
  const section = read('./TrendingReplicateSection.jsx')
  const source = read('./trending-source.js')

  assert.equal(TRENDING_DATA_VERSION, 3, '样本库下线属于破坏性契约变更，必须升版本')
  // 手写样本库必须彻底消失，而不是「留在代码里当兜底」
  assert.ok(!data.includes('TRENDING_VIDEOS'), '样本库不得复活')
  assert.ok(!data.includes('tr-us-'), '样本数据不得残留')
  assert.ok(!section.includes('TRENDING_VIDEOS'), '板块不得引用任何样本库')
  assert.ok(section.includes('loadTrendingItems'), '板块必须从真源拉取数据')
  // 真源必须区分「库为空」与「被筛空」两种情况，话术完全不同
  for (const state of ['ready', 'empty', 'filtered', 'unavailable']) {
    assert.ok(source.includes(`${state}: '${state}'`), `真源必须暴露 ${state} 状态`)
  }
})

test('trending: 工具栏只渲染数据支持的维度（假控件护栏）', () => {
  const bar = read('./TrendingFilterBar.jsx')
  const section = read('./TrendingReplicateSection.jsx')
  const source = read('./trending-source.js')

  // 地区与类目不再是硬编码枚举，而是从真源数据推导
  assert.ok(!bar.includes('TRENDING_REGIONS'), '地区档位不得再用硬编码枚举')
  assert.ok(!bar.includes('TRENDING_INDUSTRIES'), '类目档位不得再用硬编码枚举')
  assert.ok(!bar.includes('trending.industry.apparel'), '固定类目词表必须删除')

  for (const dimension of ['region', 'industry', 'views', 'engagement', 'range']) {
    assert.ok(
      bar.includes(`dimensions.${dimension}`),
      `工具栏必须按数据能力决定是否渲染「${dimension}」维度`,
    )
  }
  assert.ok(section.includes('mergeCapabilities'), '板块必须把真源推导出的能力集并入工具栏')
  assert.ok(source.includes('export function deriveDimensions'), '维度必须由数据推导')
  assert.ok(section.includes('loadTrendingItems'), '板块必须从真源拉取数据')
  assert.ok(
    source.includes('deriveRegionOptions') && source.includes('deriveIndustryOptions'),
    '档位必须由数据推导',
  )
  assert.ok(source.includes('deriveViewBuckets'), '播放量档位必须按数据分布派生，切不动的档位不得出现')
})

test('trending: 无数据源维度不得回到 UI（营收 / ROAS 下线护栏）', () => {
  const catalog = read('../catalog.js')
  const bar = read('./TrendingFilterBar.jsx')
  const card = read('./TrendingVideoCard.jsx')
  const data = read('./trending-data.js')
  const source = read('./trending-source.js')

  for (const key of [
    'trending.revenue.',
    'trending.roas.',
    'trending.metric.revenue',
    'trending.sort.revenue',
    'trending.sort.roas',
    'trending.filter.revenue',
    'trending.filter.roas',
    'trending.info.revenue',
    'trending.info.roas',
  ]) {
    assert.ok(!catalog.includes(`"${key}`), `字典里不得再出现 ${key} 键位`)
  }
  for (const symbol of ['TRENDING_REVENUE_BUCKETS', 'TRENDING_ROAS_BUCKETS', 'filters.revenue', 'filters.roas']) {
    assert.ok(!bar.includes(symbol), `筛选工具栏不得再引用 ${symbol}`)
  }
  assert.ok(!card.includes('revenue'), '卡片不得再渲染营收指标')
  assert.ok(
    card.includes('formatEngagementPercent') && card.includes("t('trending.metric.engagement')"),
    '卡片第二指标必须换成互动率',
  )
  // 只拦「真的读写了这两个字段」，放过版本说明里的历史注解
  const fabricatedField = (text) => /(^|[^A-Za-z_$])revenue\s*[:=]/.test(text) || /(^|[^A-Za-z_$])roas\s*[:=]/.test(text)
  assert.ok(!fabricatedField(data), '派生层不得读写营收 / ROAS 字段')
  assert.ok(!fabricatedField(source), '真源层不得读写营收 / ROAS 字段')
})

test('trending: 工具栏不得显示命中计数，档位文案不得带「不限」', () => {
  const catalog = read('../catalog.js')
  const bar = read('./TrendingFilterBar.jsx')
  const styles = read('../styles.js')

  for (const key of ['trending.views.all', 'trending.engagement.all', 'trending.region.all', 'trending.industry.all']) {
    const line = catalog.split('\n').find((entry) => entry.includes(`"${key}":`))
    assert.ok(line, `缺少默认档位键位 ${key}`)
    assert.ok(!line.includes('不限'), `${key} 不应再带「不限」前缀：${line.trim()}`)
  }
  assert.ok(!catalog.includes('不限'), '中文档位不得再出现「不限」')
  assert.ok(!catalog.includes('命中'), '不得再出现命中计数文案')
  assert.ok(!bar.includes('omnimux-trending-count'), '工具栏不得再渲染命中计数')
  assert.ok(!bar.includes('total'), '工具栏不得再接收计数入参')
  assert.ok(!styles.includes('omnimux-trending-count'), '命中计数样式必须随组件一并删除')
})

test('trending: 复刻接管契约（搬迁原生输入框 / 只预填不代发）', () => {
  const section = read('./TrendingReplicateSection.jsx')
  const sessionGuide = read('../SessionGuide.jsx')
  const styles = read('../styles.js')

  // 1. 板块必须落在 Hero 会话宿主内并标记接管态
  assert.ok(section.includes("closest?.('[data-phase]')"), '板块必须探测 Hero 宿主根节点')
  assert.ok(section.includes("setAttribute(DOCK_OPEN_ATTR, '')"), '接管时必须写入停靠标记')
  assert.ok(section.includes('removeAttribute(DOCK_OPEN_ATTR)'), '退出接管时必须清除停靠标记')
  assert.ok(section.includes("export const DOCK_OPEN_ATTR = 'data-omnimux-dock-open'"))

  // 2. 必须搬运官方原生输入框，不得再复制一个仿制品
  assert.equal(
    fs.existsSync(path.resolve(import.meta.dirname, 'DockedComposer.jsx')),
    false,
    '自绘吸底输入框组件必须删除，输入框只能用官方那一个',
  )
  assert.ok(!section.includes('DockedComposer'), '板块不得再引用自绘吸底输入框')
  assert.ok(!section.includes('<textarea'), '板块不得自造输入区')
  assert.ok(!section.includes('onSubmit'), '板块不得自建提交通道')
  assert.ok(section.includes('buildClonePrompt(item)'), '复刻必须把克隆指令灌进原生输入框')
  assert.ok(section.includes("querySelector?.('[data-composer-card]')"), '停靠几何必须取自原生输入框卡片')

  // 3. 停靠样式必须直接作用于官方输入框卡片（搬位置，不复制控件）
  assert.match(
    styles,
    /\[data-omnimux-starter-host\]\[data-omnimux-dock-open\] \[data-composer-card\] \{[^}]*position:fixed!important/,
    '接管时必须把原生输入框卡片固定到会话视口底部',
  )
  assert.ok(styles.includes('--omnimux-dock-left'), '必须按 Hero 栏给出停靠横向几何')
  assert.ok(styles.includes('--omnimux-dock-width'), '必须按 Hero 栏给出停靠宽度')
  assert.ok(styles.includes('[class*="heroWorkspaceRow"]'), '工作区行必须随接管让位')

  // 4. 会话指南必须挂载该板块并只预填、不代发
  assert.ok(sessionGuide.includes('<TrendingReplicateSection'), 'BlankSessionGuide 必须渲染爆款对标板块')
  assert.ok(sessionGuide.includes('handleTrendingApply'), '必须提供复刻指令落地处理器')
  assert.ok(sessionGuide.includes('inputActions.setDraft'), '复刻只能走官方输入框 API 预填')
  assert.ok(!sessionGuide.includes('clickSend'), '不得代用户发送：仅预填输入框，发送权归用户')
})

test('trending: 下拉浮层底色不得依赖未定义 Token（透明菜单回归护栏）', () => {
  const styles = read('../styles.js')
  const menu = styles.match(/\.omnimux-trending-select-menu \{[\s\S]*?\n\}/)
  assert.ok(menu, '必须存在下拉菜单样式块')

  assert.ok(
    !/background:var\(--dsw-alias-bg-elevated\);/.test(menu[0]),
    '浮层底色不得裸用 var(--dsw-alias-bg-elevated)：该 Token 在本 Host 主题未定义，会退化成全透明',
  )
  assert.ok(menu[0].includes('--omnimux-trending-menu-bg'), '浮层底色必须走带兜底的 Token 链')
  assert.ok(
    styles.includes('--omnimux-trending-menu-bg:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-3'),
    '浮层底色必须有不透明兜底 Token',
  )
  assert.ok(
    !/background:\s*var\(--dsw-alias-bg-elevated\)/.test(styles),
    'session-guide 内任何 background 都不得裸用 --dsw-alias-bg-elevated（计算值会退化成 transparent）',
  )
  assert.ok(
    styles.includes('--omnimux-surface-dialog:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-2'),
    '弹窗/浮层底色必须有不透明兜底 Token',
  )
})

test('trending: i18n 双语键位齐全', () => {
  const keys = [
    'trending.title',
    'trending.subtitle',
    'trending.source.badge',
    'trending.source.hint',
    'trending.card.recreate',
    'trending.metric.engagement',
    'trending.metric.views',
    'trending.loading',
    'trending.empty',
    'trending.range.all',
    'trending.info.range',
    'trending.library.empty',
    'trending.library.emptyHint',
    'trending.library.unavailable',
    'trending.library.unavailableHint',
    'trending.applied',
    'trending.undock',
    'trending.filter.reset',
  ]
  for (const key of keys) {
    assert.equal(typeof guideZh[key], 'string', `中文缺少键位 ${key}`)
    assert.equal(typeof guideEn[key], 'string', `英文缺少键位 ${key}`)
    assert.ok(String(guideZh[key]).trim() && String(guideEn[key]).trim(), `键位 ${key} 不得为空`)
  }

  // trending 命名空间必须整体中英一一对应。
  // 只在源文件里按字符串计数是不够的：两边同时缺失时计数仍等于 2，单边缺失也发现不了。
  const zhKeys = Object.keys(guideZh).filter((key) => key.startsWith('trending.')).sort()
  const enKeys = Object.keys(guideEn).filter((key) => key.startsWith('trending.')).sort()
  assert.ok(zhKeys.length > 0, 'trending 命名空间不得为空')
  assert.deepEqual(zhKeys, enKeys, 'trending 命名空间必须中英一一对应，不得有单边键位')

  // 档位 labelKey 必须都能在字典中解析
  const catalogue = new Set([
    ...TRENDING_VIEW_BUCKETS,
    ...TRENDING_ENGAGEMENT_BUCKETS,
    ...TRENDING_RANGES,
    ...TRENDING_SORTS,
  ].map((b) => b.labelKey).filter(Boolean))

  for (const key of catalogue) {
    assert.equal(typeof guideZh[key], 'string', `档位键位中文缺失 ${key}`)
    assert.equal(typeof guideEn[key], 'string', `档位键位英文缺失 ${key}`)
  }
})
