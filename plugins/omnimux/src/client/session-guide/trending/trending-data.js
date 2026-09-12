/**
 * Trending Videos, Ready to Replicate — 数据集与纯函数筛选/排序/克隆 Prompt 组装。
 *
 * 逆向自 TopView AI Marketer 的 Trending 板块（2026-09-12 ego-browser 实测）：
 * 卡片以 9:16 竖屏承载「国家/地区 + 预估营收 + 播放量 + 2 行文案」，
 * 点击 Recreate 后由吸底输入框接管复刻意图。
 *
 * 数据保持纯声明：所有派生（筛选、排序、格式化、Prompt 组装）都是可单测的纯函数。
 */

/** 数据契约版本，随字段结构调整，便于缓存与灰度判别。 */
export const TRENDING_DATA_VERSION = 1

/** 国家/地区筛选档位（对应卡片左上角胶囊）。 */
export const TRENDING_REGIONS = [
  { value: '', labelKey: 'trending.region.all' },
  { value: 'US', label: 'US' },
  { value: 'GB', label: 'GB' },
  { value: 'ID', label: 'ID' },
  { value: 'TH', label: 'TH' },
  { value: 'VN', label: 'VN' },
  { value: 'DE', label: 'DE' },
]

/** 行业类目筛选档位。 */
export const TRENDING_INDUSTRIES = [
  { value: '', labelKey: 'trending.industry.all' },
  { value: 'apparel', labelKey: 'trending.industry.apparel' },
  { value: 'home', labelKey: 'trending.industry.home' },
  { value: 'beauty', labelKey: 'trending.industry.beauty' },
  { value: 'digital', labelKey: 'trending.industry.digital' },
  { value: 'outdoor', labelKey: 'trending.industry.outdoor' },
  { value: 'kitchen', labelKey: 'trending.industry.kitchen' },
]

/** 播放量档位（含下界，单位：次）。 */
export const TRENDING_VIEW_BUCKETS = [
  { value: '', labelKey: 'trending.views.all' },
  { value: '100000', labelKey: 'trending.views.100k' },
  { value: '1000000', labelKey: 'trending.views.1m' },
  { value: '5000000', labelKey: 'trending.views.5m' },
  { value: '10000000', labelKey: 'trending.views.10m' },
]

/** 预估营收档位（含下界，单位：美元）。 */
export const TRENDING_REVENUE_BUCKETS = [
  { value: '', labelKey: 'trending.revenue.all' },
  { value: '100000', labelKey: 'trending.revenue.100k' },
  { value: '1000000', labelKey: 'trending.revenue.1m' },
  { value: '10000000', labelKey: 'trending.revenue.10m' },
]

/** 互动率档位（含下界，单位：百分比）。 */
export const TRENDING_ENGAGEMENT_BUCKETS = [
  { value: '', labelKey: 'trending.engagement.all' },
  { value: '4', labelKey: 'trending.engagement.4' },
  { value: '6', labelKey: 'trending.engagement.6' },
  { value: '8', labelKey: 'trending.engagement.8' },
]

/** ROAS 档位（含下界，单位：倍）。 */
export const TRENDING_ROAS_BUCKETS = [
  { value: '', labelKey: 'trending.roas.all' },
  { value: '2', labelKey: 'trending.roas.2' },
  { value: '4', labelKey: 'trending.roas.4' },
  { value: '6', labelKey: 'trending.roas.6' },
]

/** 统计时间窗档位。 */
export const TRENDING_RANGES = [
  { value: '7', labelKey: 'trending.range.d7' },
  { value: '30', labelKey: 'trending.range.d30' },
  { value: '90', labelKey: 'trending.range.d90' },
]

/** 排序档位。 */
export const TRENDING_SORTS = [
  { value: 'views', labelKey: 'trending.sort.views' },
  { value: 'revenue', labelKey: 'trending.sort.revenue' },
  { value: 'engagement', labelKey: 'trending.sort.engagement' },
  { value: 'roas', labelKey: 'trending.sort.roas' },
]

/**
 * 筛选默认态。
 *
 * 注意 `range` 默认为近 7 天（与参考站 "Last 7 days" 一致），因此默认视图
 * 本来就只呈现 7 天内的样本，不是「全量」。需要全量请显式传 `range: ''`。
 */
export function defaultTrendingFilters() {
  return {
    region: '',
    industry: '',
    views: '',
    revenue: '',
    engagement: '',
    roas: '',
    range: '7',
    sort: 'views',
  }
}

/**
 * 爆款对标视频样本库。
 * `prompt` 为点击 Recreate 后吸底输入框自动灌装的复刻指令正文；
 * `cover` 为可选真实封面地址，缺省时由 TrendingCover 以矢量方式绘制。
 */
export const TRENDING_VIDEOS = [
  {
    id: 'tr-us-mensfashion-acid-wash',
    region: 'US',
    industry: 'apparel',
    archetype: 'figure',
    views: 14520000,
    revenue: 129000,
    engagement: 7.4,
    roas: 5.1,
    days: 3,
    title: 'Finally some stylish cotton shirts made for the big guys #mensfashion #acidwashtshirts',
    product: '大码男士水洗棉衬衫',
    angle: '身材包容性开场 + 真人试穿对比',
  },
  {
    id: 'tr-us-mattress-bamboo',
    region: 'US',
    industry: 'home',
    archetype: 'comparison',
    views: 11870000,
    revenue: 155000,
    engagement: 6.8,
    roas: 4.6,
    days: 5,
    title: 'the bamboo makes all the difference #mattresstopper',
    product: '竹纤维床垫软垫',
    angle: '三方同屏横向对比 + 体感差异放大',
  },
  {
    id: 'tr-id-zipper-resleting',
    region: 'ID',
    industry: 'apparel',
    archetype: 'macro',
    views: 11200000,
    revenue: 58200000,
    engagement: 9.1,
    roas: 7.2,
    days: 2,
    title: 'Zipper Resleting Universal #resleting #resletinguniversal #resletingsebaguna',
    product: '万能拉链修复套件',
    angle: '极微距痛点特写 + 一次性解决演示',
  },
  {
    id: 'tr-id-korean-knit-pants',
    region: 'ID',
    industry: 'apparel',
    archetype: 'figure',
    views: 9530000,
    revenue: 52500000,
    engagement: 8.3,
    roas: 6.4,
    days: 4,
    title: 'Simpel manis dan secakep ini — Pants Knit Celana Panjang Korean Adem Melar',
    product: '韩版冰丝弹力针织长裤',
    angle: '悬挂垂坠质感 + 上身弹力拉伸实测',
  },
  {
    id: 'tr-th-liquid-detergent-stain',
    region: 'TH',
    industry: 'home',
    archetype: 'before-after',
    views: 8940000,
    revenue: 1300000,
    engagement: 7.9,
    roas: 5.5,
    days: 6,
    title: 'คราบผ้าพับจากเป็นผ้าใหญ่มาก — น้ำยาซักผ้าเข้มข้นสูตรใหม่',
    product: '高浓缩护色洗衣液',
    angle: '陈旧顽固污渍现场去渍 + 前后分屏',
  },
  {
    id: 'tr-vn-mini-vacuum',
    region: 'VN',
    industry: 'digital',
    archetype: 'product-hero',
    views: 7320000,
    revenue: 480000,
    engagement: 6.5,
    roas: 4.2,
    days: 3,
    title: 'Máy hút bụi cầm tay nhỏ gọn cho mọi ngóc ngách trong xe hơi',
    product: '车载手持迷你吸尘器',
    angle: '缝隙极限吸尘 + 吸力可视化风道',
  },
  {
    id: 'tr-de-mystery-dumpling',
    region: 'DE',
    industry: 'kitchen',
    archetype: 'unboxing',
    views: 6180000,
    revenue: 340000,
    engagement: 8.8,
    roas: 3.9,
    days: 8,
    title: 'Mystery Dumpling Box — 24 Überraschungen zum Selbermachen',
    product: '盲盒式手工饺子套装',
    angle: '悬念开箱 + 逐层揭示口感反馈',
  },
  {
    id: 'tr-us-lip-oil-glow',
    region: 'US',
    industry: 'beauty',
    archetype: 'macro',
    views: 5640000,
    revenue: 275000,
    engagement: 9.4,
    roas: 5.8,
    days: 2,
    title: 'The lip oil that replaced my entire lip routine #lipgloss #glowup',
    product: '唇部精华油',
    angle: '唇部微距光泽质感 + 一步替代多步',
  },
  {
    id: 'tr-gb-trail-running-shoe',
    region: 'GB',
    industry: 'outdoor',
    archetype: 'before-after',
    views: 4890000,
    revenue: 610000,
    engagement: 5.9,
    roas: 3.4,
    days: 11,
    title: 'Grip tested on wet slate — the trail shoe that does not slip',
    product: '越野跑湿滑抓地跑鞋',
    angle: '湿地路面极限刹车 + 鞋底纹路剖解',
  },
  {
    id: 'tr-us-desk-organizer',
    region: 'US',
    industry: 'digital',
    archetype: 'product-hero',
    views: 4210000,
    revenue: 198000,
    engagement: 6.1,
    roas: 4.8,
    days: 7,
    title: 'My desk went from chaos to calm in 90 seconds #desksetup',
    product: '模块化桌面理线收纳',
    angle: '凌乱到秩序 90 秒延时 + 单手操作演示',
  },
  {
    id: 'tr-th-aroma-diffuser',
    region: 'TH',
    industry: 'home',
    archetype: 'before-after',
    views: 3760000,
    revenue: 152000,
    engagement: 7.2,
    roas: 4.4,
    days: 9,
    title: 'กลิ่นห้องเปลี่ยนทันทีใน 10 วินาที — เครื่องพ่นหอมอโรม่า',
    product: '冷雾香薰机',
    angle: '雾化可视化 + 10 秒气味反差',
  },
  {
    id: 'tr-id-sunscreen-stick',
    region: 'ID',
    industry: 'beauty',
    archetype: 'product-hero',
    views: 3120000,
    revenue: 1240000,
    engagement: 8.6,
    roas: 6.1,
    days: 1,
    title: 'Sunscreen stick yang nggak bikin lengket — ringan banget!',
    product: '便携防晒棒',
    angle: '旋转涂抹特写 + 不黏腻肤感测试',
  },
]

/**
 * 紧凑金额格式化：129000 → $129K，58200000 → $58.2M。
 *
 * 先按档缩放到 [1, 1000) 区间再取有效位；缩放值四舍五入后一旦回到 1000
 * （例如 999_999 → 999.999K），必须向上一档进位，否则会输出 `$1000K` 这种
 * 未归一的读数。
 *
 * @param {number} value
 * @returns {string}
 */
export function formatCompactCurrency(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '$0'
  const scaled = scaleToUnit(n)
  return `$${trimZero(scaled.value)}${scaled.unit}`
}

/**
 * 紧凑计数格式化：14520000 → 14.52M。
 * @param {number} value
 * @returns {string}
 */
export function formatCompactNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  const scaled = scaleToUnit(n)
  return `${trimZero(scaled.value)}${scaled.unit}`
}

const COMPACT_UNITS = [
  { threshold: 1_000_000_000_000, divisor: 1_000_000_000_000, unit: 'T' },
  { threshold: 1_000_000_000, divisor: 1_000_000_000, unit: 'B' },
  { threshold: 1_000_000, divisor: 1_000_000, unit: 'M' },
  { threshold: 1_000, divisor: 1_000, unit: 'K' },
]

/**
 * 把原始数值换算成「有效读数 + 单位后缀」，并保证进位后的读数仍落在 [1, 1000)。
 *
 * @param {number} n 正有限数
 * @returns {{ value: number, unit: string }}
 */
function scaleToUnit(n) {
  let index = COMPACT_UNITS.findIndex((entry) => n >= entry.threshold)
  if (index < 0) return { value: n, unit: '' }

  let scaled = n / COMPACT_UNITS[index].divisor
  // 四舍五入可能把读数推回 1000（999_999 → 999.999K → 1000K），此时升一档重算。
  if (Math.round(scaled) >= 1000 && index > 0) {
    index -= 1
    scaled = n / COMPACT_UNITS[index].divisor
  }
  return { value: scaled, unit: COMPACT_UNITS[index].unit }
}

/**
 * 保留有效小数位并去掉多余的尾随零（14.52 → "14.52"，1.30 → "1.3"，129.0 → "129"）。
 * 入参已由 scaleToUnit 归一到 [1, 1000)，因此 1000 只会作为进位判定值出现。
 */
function trimZero(n) {
  const fixed = n >= 1000 ? String(Math.round(n)) : n.toFixed(n >= 100 ? 1 : 2)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

/** 把档位字符串解析成下界数字；空串或非法值返回 0。 */
function toLowerBound(raw) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * 按筛选条件过滤。
 *
 * 七个维度必须全部真实参与过滤：地区、行业、播放量、预估营收、互动率、ROAS、
 * 统计时间窗（range ↔ 样本 days）。少一个就会出现「控件能点、数据不变」的假控件。
 *
 * @param {Array<object>} videos
 * @param {object} filters
 * @returns {Array<object>}
 */
export function filterTrendingVideos(videos, filters) {
  const list = Array.isArray(videos) ? videos : []
  const f = filters && typeof filters === 'object' ? filters : {}
  const minViews = toLowerBound(f.views)
  const minRevenue = toLowerBound(f.revenue)
  const minEngagement = toLowerBound(f.engagement)
  const minRoas = toLowerBound(f.roas)
  const maxDays = toLowerBound(f.range)

  return list.filter((item) => {
    if (!item) return false
    if (f.region && item.region !== f.region) return false
    if (f.industry && item.industry !== f.industry) return false
    if (minViews && !(Number(item.views) >= minViews)) return false
    if (minRevenue && !(Number(item.revenue) >= minRevenue)) return false
    if (minEngagement && !(Number(item.engagement) >= minEngagement)) return false
    if (minRoas && !(Number(item.roas) >= minRoas)) return false
    // 时间窗是「上限」语义：样本距今天数超过窗口即排除
    if (maxDays && !(Number(item.days) <= maxDays)) return false
    return true
  })
}

/**
 * 排序（降序），返回新数组，不改动入参。
 * @param {Array<object>} videos
 * @param {string} sortKey
 * @returns {Array<object>}
 */
export function sortTrendingVideos(videos, sortKey) {
  const list = Array.isArray(videos) ? videos.slice() : []
  const key = sortKey || 'views'
  return list.sort((a, b) => {
    const av = Number(a?.[key])
    const bv = Number(b?.[key])
    const safeA = Number.isFinite(av) ? av : 0
    const safeB = Number.isFinite(bv) ? bv : 0
    if (safeB !== safeA) return safeB - safeA
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

/**
 * 先筛后排，供视图一次性消费。
 * @param {object} filters
 * @param {Array<object>} [videos]
 * @returns {Array<object>}
 */
export function selectTrendingVideos(filters, videos = TRENDING_VIDEOS) {
  return sortTrendingVideos(filterTrendingVideos(videos, filters), filters?.sort)
}

/**
 * 克隆指令模板。与 TopView 实测文案保持同构：
 *   Clone the attached viral ad and create a new video with the following content:
 *
 *   <原始文案>
 *
 * @param {object} item
 * @returns {string}
 */
export function buildClonePrompt(item) {
  if (!item || typeof item !== 'object') return ''
  const lines = [
    'Clone the attached viral ad and create a new video with the following content:',
    '',
  ]
  const title = String(item.title || '').trim()
  if (title) lines.push(title)

  const meta = []
  if (item.product) meta.push(`产品：${item.product}`)
  if (item.region) meta.push(`目标市场：${item.region}`)
  if (item.angle) meta.push(`可复用角度：${item.angle}`)
  if (meta.length) {
    lines.push('', ...meta)
  }
  lines.push('', '保留原片的钩子节奏、信息递进与转化落点，替换为我的产品后重新生成。')
  return lines.join('\n')
}

/** 定位单条样本；找不到返回 null。 */
export function findTrendingVideo(id, videos = TRENDING_VIDEOS) {
  const list = Array.isArray(videos) ? videos : []
  return list.find((item) => item && item.id === id) || null
}

/**
 * 强调色档位数（对应 CSS 中的 --omnimux-trending-accent-0..3）。
 */
export const TRENDING_ACCENT_COUNT = 4

/**
 * 由 id 派生的稳定强调色档（0..3），避免同屏卡片配色撞车。
 * 放在纯数据层而非 JSX，保证可被 node:test 直接消费。
 * @param {string} id
 * @returns {number}
 */
export function accentIndex(id) {
  const raw = String(id || '')
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 100000
  }
  return hash % TRENDING_ACCENT_COUNT
}
