/**
 * 爆款对标板块的纯派生层：档位、筛选、排序、格式化、克隆指令组装。
 *
 * 卡片行本身来自灵感库真源（见 `trending-source.js`）——这里没有样本库、
 * 没有兜底假数据：任何维度在数据里缺失，就既不出现档位也不参与排序。
 * 所有函数保持纯粹，可被 node:test 直接消费。
 */

import { sortTrendingByRecommendation } from './recommendation-engine.js'

/**
 * 数据契约版本，随字段结构调整，便于缓存与灰度判别。
 *
 * v2：下线 `revenue` / `roas` 两个无数据源维度（卡片指标、筛选档位、排序档位）。
 * v3：下线手写样本库，卡片行改由灵感库真源提供；地区/类目档位改由数据推导。
 */
export const TRENDING_DATA_VERSION = 3

/** 播放量档位（含下界，单位：次）。 */
export const TRENDING_VIEW_BUCKETS = [
  { value: '', labelKey: 'trending.views.all' },
  { value: '100000', labelKey: 'trending.views.100k' },
  { value: '1000000', labelKey: 'trending.views.1m' },
  { value: '5000000', labelKey: 'trending.views.5m' },
  { value: '10000000', labelKey: 'trending.views.10m' },
]

/**
 * 互动率档位（含下界，单位：百分比）。
 *
 * 按真实库分布定标：本地库实测 (赞+评+转) ÷ 播放量落在 0.27%~4.21%，
 * 早期样本时代的 4/6/8% 接上真数据后会几乎筛空。
 */
export const TRENDING_ENGAGEMENT_BUCKETS = [
  { value: '', labelKey: 'trending.engagement.all' },
  { value: '0.5', labelKey: 'trending.engagement.0_5' },
  { value: '1', labelKey: 'trending.engagement.1' },
  { value: '2', labelKey: 'trending.engagement.2' },
]

/** 统计时间窗档位（按入库行的发布时间距今）。必须留一个空档，否则选了窗就回不去。 */
export const TRENDING_RANGES = [
  { value: '', labelKey: 'trending.range.all' },
  { value: '7', labelKey: 'trending.range.d7' },
  { value: '30', labelKey: 'trending.range.d30' },
  { value: '90', labelKey: 'trending.range.d90' },
]

/** 排序档位。 */
export const TRENDING_SORTS = [
  { value: 'recommend', labelKey: 'trending.sort.recommend' },
  { value: 'views', labelKey: 'trending.sort.views' },
  { value: 'engagement', labelKey: 'trending.sort.engagement' },
]

/**
 * 筛选默认态：所有阈值档留空（不过滤），时间窗留空（不按时间缩窗）。
 */
export function defaultTrendingFilters() {
  return {
    region: '',
    industry: '',
    views: '',
    engagement: '',
    range: '',
    sort: 'recommend',
  }
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

/**
 * 互动率读数：7.4 → "7.4%"，8 → "8%"。
 *
 * 展示口径是百分比数值而不是小数比例；非有限值与非正值一律按 0 处理，
 * 不足 0.05 的读数四舍五入后同样显示 0%，不会渲染出 `NaN%`。
 *
 * @param {number} value
 * @returns {string}
 */
export function formatEngagementPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0%'
  return `${Number(n.toFixed(1))}%`
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
 * 按筛选条件过滤。**只过滤**：地区 / 类目 / 播放量下界 / 互动率下界 / 时间窗上限。
 *
 * 时间窗是「上限」语义，且没有发布时间的行一律排除——窗口筛选意味着
 * 「确证在这段时间内发布」，没有日期就不能算在窗口内，不能靠猜。
 *
 * @param {Array<object>} items
 * @param {object} filters
 * @returns {Array<object>}
 */
export function filterTrendingVideos(items, filters) {
  const list = Array.isArray(items) ? items : []
  const f = filters && typeof filters === 'object' ? filters : {}
  const minViews = toLowerBound(f.views)
  const minEngagement = toLowerBound(f.engagement)
  const maxDays = toLowerBound(f.range)

  return list.filter((item) => {
    if (!item) return false
    if (f.region && item.region !== f.region) return false
    if (f.industry && item.industry !== f.industry) return false
    if (minViews && !(Number(item.views) >= minViews)) return false
    if (minEngagement && !(Number(item.engagement) >= minEngagement)) return false
    if (maxDays) {
      // 只有真实数值才算「有发布时间」：Number(null) === 0 会把未知日期误判成「今天」
      const days = typeof item.days === 'number' && Number.isFinite(item.days) ? item.days : null
      if (days === null || days > maxDays) return false
    }
    return true
  })
}

/**
 * 排序（降序），返回新数组，不改动入参。
 * 主键缺失（NaN/null）一律当 0，排到末尾；同值时按 id 升序兜底，保证渲染顺序稳定。
 * @param {Array<object>} items
 * @param {string} sortKey
 * @returns {Array<object>}
 */
export function sortTrendingVideos(items, sortKey) {
  const list = Array.isArray(items) ? items.slice() : []
  const key = sortKey || 'recommend'
  if (key === 'recommend') {
    return sortTrendingByRecommendation(list)
  }
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
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function selectTrendingVideos(filters, items) {
  return sortTrendingVideos(filterTrendingVideos(items, filters), filters?.sort)
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
