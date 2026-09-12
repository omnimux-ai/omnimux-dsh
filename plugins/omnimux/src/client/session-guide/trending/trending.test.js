import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  TRENDING_ACCENT_COUNT,
  TRENDING_ENGAGEMENT_BUCKETS,
  TRENDING_INDUSTRIES,
  TRENDING_RANGES,
  TRENDING_REGIONS,
  TRENDING_REVENUE_BUCKETS,
  TRENDING_ROAS_BUCKETS,
  TRENDING_SORTS,
  TRENDING_VIDEOS,
  TRENDING_VIEW_BUCKETS,
  accentIndex,
  buildClonePrompt,
  defaultTrendingFilters,
  filterTrendingVideos,
  findTrendingVideo,
  formatCompactCurrency,
  formatCompactNumber,
  selectTrendingVideos,
  sortTrendingVideos,
} from './trending-data.js'

test('trending: 紧凑数字与货币格式化对齐参考站读数', () => {
  assert.equal(formatCompactCurrency(129000), '$129K')
  assert.equal(formatCompactCurrency(58200000), '$58.2M')
  assert.equal(formatCompactCurrency(1300000), '$1.3M')
  assert.equal(formatCompactCurrency(0), '$0')
  assert.equal(formatCompactCurrency(-5), '$0')

  assert.equal(formatCompactNumber(14520000), '14.52M')
  assert.equal(formatCompactNumber(9530000), '9.53M')
  assert.equal(formatCompactNumber(2400), '2.4K')
  assert.equal(formatCompactNumber(0), '0')
})

test('trending: 格式化跨档必须进位，不得出现 1000K/1000M/1000B', () => {
  // 回归护栏：先除档再四舍五入会把 999_999 推成 999.999K → 1000K
  assert.equal(formatCompactCurrency(999999), '$1M')
  assert.equal(formatCompactCurrency(999999999), '$1B')
  assert.equal(formatCompactCurrency(999999999999), '$1T')
  assert.equal(formatCompactNumber(999999), '1M')
  assert.equal(formatCompactNumber(999999999), '1B')

  // 档位边界两侧各自取正确的单位
  assert.equal(formatCompactCurrency(999), '$999')
  assert.equal(formatCompactCurrency(1000), '$1K')
  assert.equal(formatCompactCurrency(999499), '$999.5K')
  assert.equal(formatCompactCurrency(1000000), '$1M')

  // 任何输入都不得产出四位数读数
  for (const value of [
    999, 1000, 999499, 999999, 1000000, 999999999, 1000000000, 999999999999,
  ]) {
    for (const text of [formatCompactCurrency(value), formatCompactNumber(value)]) {
      assert.ok(
        !/^\$?1000(\.[0-9]+)?[KMBT]$/.test(text),
        `${value} 产出了未归一的读数 ${text}`,
      )
    }
  }
})

test('trending: 样本库结构自洽（唯一 id、必填字段、合法枚举）', () => {
  assert.ok(TRENDING_VIDEOS.length >= 10, '样本量应足以铺满五列两行网格')

  const ids = new Set()
  const regions = new Set(TRENDING_REGIONS.map((r) => r.value).filter(Boolean))
  const industries = new Set(TRENDING_INDUSTRIES.map((i) => i.value).filter(Boolean))
  const archetypes = new Set(['figure', 'comparison', 'macro', 'before-after', 'product-hero', 'unboxing'])

  for (const item of TRENDING_VIDEOS) {
    assert.ok(item.id && typeof item.id === 'string', `样本缺少 id: ${JSON.stringify(item)}`)
    assert.equal(ids.has(item.id), false, `样本 id 重复: ${item.id}`)
    ids.add(item.id)

    assert.ok(regions.has(item.region), `非法 region: ${item.region}`)
    assert.ok(industries.has(item.industry), `非法 industry: ${item.industry}`)
    assert.ok(archetypes.has(item.archetype), `非法 archetype: ${item.archetype}`)
    assert.ok(Number(item.views) > 0, `views 必须为正: ${item.id}`)
    assert.ok(Number(item.revenue) > 0, `revenue 必须为正: ${item.id}`)
    assert.ok(String(item.title || '').length > 0, `title 不可为空: ${item.id}`)
    assert.ok(String(item.product || '').length > 0, `product 不可为空: ${item.id}`)
  }
})

test('trending: 各维度筛选与组合筛选', () => {
  // 默认态带「近 7 天」窗口，因此基线不是全量；多维度组合测试用全开基线
  const base = { ...defaultTrendingFilters(), range: '' }

  assert.equal(filterTrendingVideos(TRENDING_VIDEOS, base).length, TRENDING_VIDEOS.length, '全开筛选即全量')
  assert.ok(
    filterTrendingVideos(TRENDING_VIDEOS, defaultTrendingFilters()).length < TRENDING_VIDEOS.length,
    '默认态带近 7 天窗口，应比全量少',
  )

  const us = filterTrendingVideos(TRENDING_VIDEOS, { ...base, region: 'US' })
  assert.ok(us.length > 0)
  assert.ok(us.every((it) => it.region === 'US'))

  const apparel = filterTrendingVideos(TRENDING_VIDEOS, { ...base, industry: 'apparel' })
  assert.ok(apparel.length > 0)
  assert.ok(apparel.every((it) => it.industry === 'apparel'))

  const highViews = filterTrendingVideos(TRENDING_VIDEOS, { ...base, views: '10000000' })
  assert.ok(highViews.length > 0)
  assert.ok(highViews.every((it) => it.views >= 10000000))

  const highRevenue = filterTrendingVideos(TRENDING_VIDEOS, { ...base, revenue: '1000000' })
  assert.ok(highRevenue.length > 0)
  assert.ok(highRevenue.every((it) => it.revenue >= 1000000))

  const highEngagement = filterTrendingVideos(TRENDING_VIDEOS, { ...base, engagement: '8' })
  assert.ok(highEngagement.every((it) => it.engagement >= 8))

  const highRoas = filterTrendingVideos(TRENDING_VIDEOS, { ...base, roas: '6' })
  assert.ok(highRoas.every((it) => it.roas >= 6))

  const combined = filterTrendingVideos(TRENDING_VIDEOS, {
    ...base,
    region: 'US',
    industry: 'apparel',
  })
  assert.ok(combined.every((it) => it.region === 'US' && it.industry === 'apparel'))

  const impossible = filterTrendingVideos(TRENDING_VIDEOS, { ...base, region: 'US', industry: 'kitchen' })
  assert.equal(impossible.length, 0, '无交集条件必须返回空集')
})

test('trending: 排序为降序、稳定且不改动入参', () => {
  const source = TRENDING_VIDEOS
  const before = source.map((it) => it.id)

  const byViews = sortTrendingVideos(source, 'views')
  for (let i = 1; i < byViews.length; i += 1) {
    assert.ok(byViews[i - 1].views >= byViews[i].views, '播放量必须降序')
  }

  const byRevenue = sortTrendingVideos(source, 'revenue')
  for (let i = 1; i < byRevenue.length; i += 1) {
    assert.ok(byRevenue[i - 1].revenue >= byRevenue[i].revenue, '营收必须降序')
  }

  assert.deepEqual(source.map((it) => it.id), before, '排序不得改动入参顺序')

  // 相同主键时按 id 升序兜底，保证多次渲染顺序一致
  const tied = [
    { id: 'b', views: 10 },
    { id: 'a', views: 10 },
  ]
  assert.deepEqual(sortTrendingVideos(tied, 'views').map((it) => it.id), ['a', 'b'])
})

test('trending: selectTrendingVideos 先筛后排并可组合扫描器', () => {
  const list = selectTrendingVideos({ ...defaultTrendingFilters(), region: 'ID', sort: 'revenue' })
  assert.ok(list.length > 0)
  assert.ok(list.every((it) => it.region === 'ID'))
  for (let i = 1; i < list.length; i += 1) {
    assert.ok(list[i - 1].revenue >= list[i].revenue)
  }
})

test('trending: 克隆指令模板与参考站同构', () => {
  const item = findTrendingVideo('tr-us-mensfashion-acid-wash')
  assert.ok(item, '样本应可被 id 定位')

  const prompt = buildClonePrompt(item)
  assert.ok(prompt.startsWith('Clone the attached viral ad and create a new video with the following content:'))
  assert.ok(prompt.includes(item.title), '必须原样带入原始文案')
  assert.ok(prompt.includes(item.product), '必须带入替换产品')
  assert.ok(prompt.includes(item.region), '必须带入目标市场')
  assert.ok(prompt.includes('保留原片的钩子节奏'), '必须显式约束结构复用')

  assert.equal(buildClonePrompt(null), '', '空样本返回空串而非抛错')
  assert.equal(findTrendingVideo('not-exist'), null)
})

test('trending: 封面强调色由 id 稳定派生且落在四档内', () => {
  for (const item of TRENDING_VIDEOS) {
    const idx = accentIndex(item.id)
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < TRENDING_ACCENT_COUNT, `accent 越界: ${item.id} -> ${idx}`)
    assert.equal(accentIndex(item.id), idx, '同一 id 必须得到同一档位')
  }
  assert.equal(accentIndex(''), accentIndex(''))
  assert.equal(accentIndex(null), accentIndex(''))
  assert.ok(accentIndex('x') >= 0 && accentIndex('x') < TRENDING_ACCENT_COUNT)
})

test('trending: 档位定义完整且与筛选语义一致', () => {
  for (const buckets of [
    TRENDING_REGIONS,
    TRENDING_INDUSTRIES,
    TRENDING_VIEW_BUCKETS,
    TRENDING_REVENUE_BUCKETS,
    TRENDING_ENGAGEMENT_BUCKETS,
    TRENDING_ROAS_BUCKETS,
  ]) {
    assert.equal(buckets[0].value, '', '每个筛选维度都必须提供「不限」档')
    for (const bucket of buckets.slice(1)) {
      assert.ok(bucket.value !== '', '非默认档位必须携带下界值')
      assert.ok(
        bucket.labelKey || bucket.label,
        `非默认档位必须提供 labelKey 或 label: ${JSON.stringify(bucket)}`,
      )
    }
  }
  assert.ok(TRENDING_RANGES.every((r) => r.value && r.labelKey))
  assert.ok(TRENDING_SORTS.every((s) => s.value && s.labelKey))
  assert.deepEqual(TRENDING_SORTS.map((s) => s.value), ['views', 'revenue', 'engagement', 'roas'])
})

function read(rel) {
  return fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf-8')
}

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
  assert.ok(
    !sessionGuide.includes('clickSend'),
    '不得代用户发送：仅预填输入框，发送权归用户',
  )
})

test('trending: 下拉浮层底色不得依赖未定义 Token（透明菜单回归护栏）', () => {
  const styles = read('../styles.js')
  const menu = styles.match(/\.omnimux-trending-select-menu \{[\s\S]*?\n\}/)
  assert.ok(menu, '必须存在下拉菜单样式块')

  assert.ok(
    !/background:var\(--dsw-alias-bg-elevated\);/.test(menu[0]),
    '浮层底色不得裸用 var(--dsw-alias-bg-elevated)：该 Token 在本 Host 主题未定义，会退化成全透明',
  )
  assert.ok(
    menu[0].includes('--omnimux-trending-menu-bg'),
    '浮层底色必须走带兜底的 Token 链',
  )
  assert.ok(
    styles.includes('--omnimux-trending-menu-bg:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-3'),
    '浮层底色必须有不透明兜底 Token',
  )

  // 同一根因、同一文件：其余浮层（弹窗主体 / 分栏 / 提示条 / 卡片）也不得裸用该未定义 Token
  assert.ok(
    !/background:\s*var\(--dsw-alias-bg-elevated\)/.test(styles),
    'session-guide 内任何 background 都不得裸用 --dsw-alias-bg-elevated（计算值会退化成 transparent）',
  )
  assert.ok(
    styles.includes('--omnimux-surface-dialog:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-2'),
    '弹窗/浮层底色必须有不透明兜底 Token',
  )
})

test('trending: 默认档位文案不带「不限」，工具栏不显示命中计数', () => {
  const catalog = read('../catalog.js')
  const bar = read('./TrendingFilterBar.jsx')
  const styles = read('../styles.js')

  for (const key of [
    'trending.views.all',
    'trending.revenue.all',
    'trending.engagement.all',
    'trending.roas.all',
  ]) {
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

test('trending: i18n 双语键位齐全', () => {
  const catalog = read('../catalog.js')
  const keys = [
    'trending.title',
    'trending.subtitle',
    'trending.card.recreate',
    'trending.metric.revenue',
    'trending.metric.views',
    'trending.empty',
    'trending.applied',
    'trending.undock',
    'trending.filter.reset',
  ]
  for (const key of keys) {
    const occurrences = catalog.split(`"${key}":`).length - 1
    assert.equal(occurrences, 2, `键位 ${key} 必须在中英双语中各出现一次（实际 ${occurrences} 次）`)
  }

  // 档位 labelKey 必须都能在字典中解析
  const catalogue = new Set([
    ...TRENDING_REGIONS,
    ...TRENDING_INDUSTRIES,
    ...TRENDING_VIEW_BUCKETS,
    ...TRENDING_REVENUE_BUCKETS,
    ...TRENDING_ENGAGEMENT_BUCKETS,
    ...TRENDING_ROAS_BUCKETS,
    ...TRENDING_RANGES,
    ...TRENDING_SORTS,
  ].map((b) => b.labelKey).filter(Boolean))

  for (const key of catalogue) {
    const occurrences = catalog.split(`"${key}":`).length - 1
    assert.equal(occurrences, 2, `档位键位 ${key} 必须在中英双语中各出现一次（实际 ${occurrences} 次）`)
  }
})
