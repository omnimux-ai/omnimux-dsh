/**
 * 爆款对标真源接入：从灵感库（omnimux-inspiration）拉取可复刻的对标视频。
 *
 * 数据只走 Host HTTP 这一层（`/omnimux/inspiration/local`），不 import 灵感库内部模块——
 * 插件之间没有私有导入，且灵感库没装时这条链路必须能干净地降级。
 *
 * 这里只做两件事：把灵感库行**如实**映射成卡片行（缺字段就是缺，不补默认值），
 * 以及从真实数据推导「哪些筛选维度真的有数据」。没有数据的维度不得出现在工具栏里。
 */
import { TRENDING_VIEW_BUCKETS } from './trending-data.js'

/** 灵感库本地库列表接口。 */
export const TRENDING_LOCAL_PATH = '/omnimux/inspiration/local'
/** 灵感社区云端精选灵感库接口（包含全量海量对标视频）。 */
export const TRENDING_CLOUD_PATH = '/omnimux/inspiration'
/** 兼容既有单路径常量的别名。 */
export const TRENDING_SOURCE_PATH = TRENDING_LOCAL_PATH
/** 默认双源聚合：同时拉取本地录入库与云端精选库，对齐灵感社区「全部」大盘数据。 */
export const DEFAULT_TRENDING_SOURCES = Object.freeze([TRENDING_LOCAL_PATH, TRENDING_CLOUD_PATH])
/**
 * 一次拉取的窗口大小。
 *
 * 窗口是「按播放量取前 N 条」，各维度的过滤在服务端先算再取窗口，
 * 因此窗口内的分布与筛选一致；互动率门槛在客户端对窗口内结果再过滤。
 * 库变大到需要翻页时，这里是唯一的改动点。
 */
export const TRENDING_SOURCE_PAGE_SIZE = 48

/** 拉取结果状态。 */
export const TRENDING_SOURCE_STATUS = {
  ready: 'ready',
  /** 接口通、库里也确实没有内容。 */
  empty: 'empty',
  /** 接口通、库里本来有内容，只是当前筛选条件把它筛空了。 */
  filtered: 'filtered',
  unavailable: 'unavailable',
}

/**
 * 封面路径归一：本地库给的是 `/omnimux/inspiration/local/media/…`，
 * 云目录给的是 `/api/inspiration/v1/media/…`，历史行也可能直接给绝对 URL 或裸 key。
 * 规则与灵感库前端的 `pickCoverSrc` 保持一致（复制而不 import）。
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeCoverUrl(raw) {
  if (typeof raw !== 'string' || raw === '') return ''
  if (raw.includes('..')) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/omnimux/inspiration/local/media/')) return raw
  if (raw.startsWith('/omnimux/inspiration/media/')) return raw
  if (raw.startsWith('/api/inspiration/v1/media/')) {
    return `/omnimux/inspiration/media/${raw.slice('/api/inspiration/v1/media/'.length)}`
  }
  return `/omnimux/inspiration/media/${raw.replace(/^\/+/, '')}`
}

/** @param {unknown} value */
function readFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * 播放量：灵感库把计数放在 `stats`，也有历史行放在顶层。
 *
 * 读不到**返回 null，不返回 0**——「不知道播放量」与「播放量是 0」是两件事：
 * 卡片要把前者显示成 `—`，塌成 0 会让两种状态在界面上再也分不出来。
 * @param {object | null | undefined} row
 * @returns {number | null}
 */
export function readViews(row) {
  const stats = row?.stats && typeof row.stats === 'object' ? row.stats : {}
  const value = readFiniteNumber(stats.views) ?? readFiniteNumber(row?.views)
  return value !== null && value > 0 ? value : null
}

/**
 * 互动率（百分比数值）：(点赞 + 评论 + 分享) ÷ 播放量 × 100。
 *
 * 缺计数按 0 计（平台没给不等于有互动），缺播放量则返回 null——
 * 没有分母就算不出率，宁可标成未知也不编一个数。
 * @param {object | null | undefined} row
 * @returns {number | null}
 */
export function readEngagement(row) {
  const views = readViews(row)
  if (!(views > 0)) return null
  const stats = row?.stats && typeof row.stats === 'object' ? row.stats : {}
  const sum = ['likes', 'comments', 'shares']
    .map((key) => readFiniteNumber(stats[key]) ?? 0)
    .reduce((total, value) => total + value, 0)
  return (sum / views) * 100
}

/**
 * 结构要点：优先取拆解里的钩子高亮，退回钩子、摘要。
 * 去掉 Markdown 强调符与多余空白，并截断到可读长度。
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function readStructure(row) {
  const raw = row?.deconstruction || row?.analysis
  const dec = raw && typeof raw === 'object' ? raw : null
  const candidate = [dec?.hook_highlight, dec?.hook, dec?.summary, dec?.target_goal]
    .find((value) => typeof value === 'string' && value.trim() !== '')
  if (!candidate) return ''
  const text = String(candidate)
    .replace(/^[#\s*I|:\-\.]+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

/**
 * 入库行距今天数：只能从真实的发布时间推。
 * 读不到、解析不了、或是未来时间（时钟/数据异常）一律 null，宁可没有这个维度。
 * @param {unknown} value
 * @param {number} [nowMs]
 * @returns {number | null}
 */
export function readAgeDays(value, nowMs = Date.now()) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return null
  const days = Math.floor((nowMs - at) / 86400000)
  return days >= 0 ? days : null
}

/**
 * 灵感库行 → 卡片行。字段缺失一律置空，不补默认值。
 * @param {object | null | undefined} row
 * @param {number} [nowMs]
 * @returns {object | null}
 */
export function mapSourceItem(row, nowMs = Date.now()) {
  if (!row || typeof row !== 'object') return null
  const id = row.id != null && String(row.id).trim() !== '' ? String(row.id).trim() : ''
  if (!id) return null
  const region = String(row.country_code || '').trim().toUpperCase()
  const industry = String(row.category || '').trim()
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string' && tag !== '') : []
  return {
    id,
    title: String(row.title || '').trim(),
    region: region || '',
    industry,
    tags,
    views: readViews(row),
    engagement: readEngagement(row),
    days: readAgeDays(row.posted_at || row.published_at, nowMs),
    cover: normalizeCoverUrl(row.cover_url || row.cover_key),
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : '',
    structure: readStructure(row),
    product: '',
    angle: '',
  }
}

/**
 * 播放量档位也由数据推导：**只保留真能把结果切小的档位**。
 *
 * 库里所有行都 >10M 时，四个阈值任选结果完全一样——那就是本模块要防的假控件；
 * 此时 views 维度整体不成立，工具栏也不该出现这个下拉。
 * @param {Array<object>} items
 * @param {Array<{ value: string, labelKey?: string, label?: string }>} [buckets]
 * @returns {Array<object>}
 */
export function deriveViewBuckets(items, buckets = TRENDING_VIEW_BUCKETS) {
  const list = Array.isArray(items) ? items : []
  const views = list
    .map((item) => Number(item?.views))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (views.length === 0) return []
  const min = Math.min(...views)
  const usable = buckets.filter((bucket) => bucket.value === '' || Number(bucket.value) > min)
  // 只剩默认档时它筛不掉任何东西，等于没有这个维度
  return usable.length > 1 ? usable : []
}

/**
 * 从真实数据推导可用维度。工具栏只渲染这里为真的维度，
 * 否则就会出现「控件能点、数据不变」的假控件。
 * @param {Array<object>} items
 * @returns {{ region: boolean, industry: boolean, views: boolean, engagement: boolean, range: boolean }}
 */
export function deriveDimensions(items) {
  const list = Array.isArray(items) ? items : []
  return {
    region: list.some((item) => Boolean(item?.region)),
    industry: list.some((item) => Boolean(item?.industry)),
    views: deriveViewBuckets(list).length > 0,
    engagement: list.some((item) => Number.isFinite(item?.engagement)),
    range: list.some((item) => Number.isFinite(item?.days)),
  }
}

/**
 * 地区档位由数据推导：库里只有 US/TH 时不得凭空出现 GB/VN/DE。
 * @param {Array<object>} items
 * @returns {Array<{ value: string, label?: string, labelKey?: string }>}
 */
export function deriveRegionOptions(items) {
  return deriveOptions(items, 'region', 'trending.region.all')
}

/**
 * 类目档位同样由数据推导：类目是用户自己的词表，不能拿一套固定枚举去套。
 * @param {Array<object>} items
 * @returns {Array<{ value: string, label?: string, labelKey?: string }>}
 */
export function deriveIndustryOptions(items) {
  return deriveOptions(items, 'industry', 'trending.industry.all')
}

/**
 * @param {Array<object>} items
 * @param {'region' | 'industry'} key
 * @param {string} allKey
 */
function deriveOptions(items, key, allKey) {
  const list = Array.isArray(items) ? items : []
  const values = [...new Set(list.map((item) => String(item?.[key] || '')).filter(Boolean))].sort()
  return [{ value: '', labelKey: allKey }, ...values.map((value) => ({ value, label: value }))]
}

/**
 * 档位并集：**只增不减**。
 *
 * 筛选后服务端只回命中行，若档位跟着当前页重算，选了「地区=TH」之后 US 档位就消失了，
 * 用户再也换不回别的地区；档位必须记住见过的全部取值。同理维度一旦成立就不该再消失。
 * @param {Array<{ value: string, label?: string, labelKey?: string }>} [previous]
 * @param {Array<{ value: string, label?: string, labelKey?: string }>} [next]
 */
export function unionOptions(previous = [], next = []) {
  const map = new Map()
  for (const option of [...(previous || []), ...(next || [])]) {
    if (option && !map.has(option.value)) map.set(option.value, option)
  }
  return [...map.values()].sort((a, b) => {
    if (a.value === '') return -1
    if (b.value === '') return 1
    return String(a.value).localeCompare(String(b.value))
  })
}

/** 空能力集：还没拿到任何数据时的工具栏形态。 */
export const EMPTY_CAPABILITIES = {
  dimensions: { region: false, industry: false, views: false, engagement: false, range: false },
  regionOptions: [],
  industryOptions: [],
  viewOptions: [],
}

/**
 * 把一次加载结果并入既有能力集（单调）。
 * @param {{ dimensions: object, regionOptions: Array<object>, industryOptions: Array<object>, viewOptions: Array<object> }} previous
 * @param {Array<object>} items
 */
export function mergeCapabilities(previous, items) {
  const next = {
    dimensions: deriveDimensions(items),
    regionOptions: deriveRegionOptions(items),
    industryOptions: deriveIndustryOptions(items),
    viewOptions: deriveViewBuckets(items),
  }
  const base = previous || EMPTY_CAPABILITIES
  return {
    dimensions: Object.fromEntries(
      Object.keys(next.dimensions).map((key) => [
        key,
        Boolean(base.dimensions?.[key]) || next.dimensions[key],
      ]),
    ),
    regionOptions: unionOptions(base.regionOptions, next.regionOptions),
    industryOptions: unionOptions(base.industryOptions, next.industryOptions),
    viewOptions: unionOptions(base.viewOptions, next.viewOptions),
  }
}

/**
 * 组装拉取 query。地区 / 类目 / 播放量下界交给服务端先过滤再取窗口，
 * 保证窗口内的分布与用户选择一致（互动率没有服务端参数，在客户端再筛）。
 * @param {object} [filters]
 * @returns {string}
 */
export function buildSourceQuery(filters = {}) {
  const query = new URLSearchParams()
  query.set('sort', 'views')
  query.set('page_size', String(TRENDING_SOURCE_PAGE_SIZE))
  if (filters.type) query.set('type', String(filters.type))
  const country = String(filters.region || '').trim()
  if (country) query.set('country', country)
  const category = String(filters.industry || '').trim()
  if (category) query.set('category', category)
  const minViews = Number(filters.views)
  if (Number.isFinite(minViews) && minViews > 0) query.set('views_min', String(minViews))
  return query.toString()
}

async function fetchSourcePayload(fetchImpl, url, signal) {
  try {
    const res = await fetchImpl(url, { signal })
    if (!res || !res.ok) {
      return { ok: false, status: res?.status ?? 0, reason: `http-${res?.status ?? 0}` }
    }
    let payload
    try {
      payload = await res.json()
    } catch {
      return { ok: false, status: res.status, reason: 'bad-json' }
    }
    const data = payload && typeof payload === 'object' && payload.data ? payload.data : payload
    const rows = Array.isArray(data?.items) ? data.items : null
    if (!rows) return { ok: false, status: res.status, reason: 'bad-shape' }
    return { ok: true, rows, total: readFiniteNumber(data?.total) ?? rows.length }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: error?.name === 'AbortError' ? 'aborted' : 'network',
    }
  }
}

/**
 * 从灵感库拉取可复刻对标视频（双源聚合：本地库 + 云端精选库）。
 *
 * 三种结果都要能被调用方区分：`ready`（有数据）/ `empty`（接口通但库里没有）/
 * `unavailable`（接口不通、灵感库没装或未登录）。任何异常都收敛成 `unavailable`，
 * 绝不让板块崩，也绝不回落到编造的样本。
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   filters?: object,
 *   signal?: AbortSignal,
 *   sourcePath?: string,
 *   sourcePaths?: string[],
 * }} [opts]
 * @returns {Promise<{ status: string, items: Array<object>, total: number, reason?: string }>}
 */
export async function loadTrendingItems(opts = {}) {
  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) return { status: TRENDING_SOURCE_STATUS.unavailable, items: [], total: 0, reason: 'no-fetch' }

  const sourcePaths = opts.sourcePaths || (opts.sourcePath ? [opts.sourcePath] : DEFAULT_TRENDING_SOURCES)

  const outcomes = await Promise.all(
    sourcePaths.map((basePath) => {
      const isCloud = basePath === TRENDING_CLOUD_PATH
      const query = buildSourceQuery(isCloud ? { ...opts.filters, type: 'video' } : (opts.filters || {}))
      const url = `${basePath}?${query}`
      return fetchSourcePayload(fetchImpl, url, opts.signal)
    }),
  )

  const aborted = outcomes.some((o) => !o.ok && o.reason === 'aborted')
  if (aborted) {
    return { status: TRENDING_SOURCE_STATUS.unavailable, items: [], total: 0, reason: 'aborted' }
  }

  const okOutcomes = outcomes.filter((o) => o.ok)
  if (okOutcomes.length === 0) {
    const firstReason = outcomes[0]?.reason || 'network'
    return { status: TRENDING_SOURCE_STATUS.unavailable, items: [], total: 0, reason: firstReason }
  }

  const combinedRows = []
  const seenIds = new Set()
  const seenUrls = new Set()

  for (const outcome of okOutcomes) {
    for (const row of outcome.rows) {
      if (!row || typeof row !== 'object') continue
      const id = row.id != null ? String(row.id).trim() : ''
      const url = typeof row.source_url === 'string' ? row.source_url.trim() : ''
      if (id && seenIds.has(id)) continue
      if (url && seenUrls.has(url)) continue
      if (id) seenIds.add(id)
      if (url) seenUrls.add(url)
      combinedRows.push(row)
    }
  }

  const items = combinedRows.map((row) => mapSourceItem(row)).filter(Boolean)
  const total = items.length

  const applied = String(opts.filters?.region || '').trim() !== ''
    || String(opts.filters?.industry || '').trim() !== ''
    || Number(opts.filters?.views) > 0
  const emptyStatus = applied ? TRENDING_SOURCE_STATUS.filtered : TRENDING_SOURCE_STATUS.empty

  return {
    status: items.length > 0 ? TRENDING_SOURCE_STATUS.ready : emptyStatus,
    items,
    total,
  }
}
