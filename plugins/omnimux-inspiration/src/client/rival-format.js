/**
 * Display formatting for the rival workbench.
 *
 * Pure functions with no DOM access, so every branch can be exercised in a unit
 * test instead of through a rendered card.
 */

import { zh } from './locales.js'

/** §3.7 增速数字口径：≥10k 取整 `23k`；1k–10k 保留一位 `1.2k`；<1k 整数 `320`。 */
function velocityRate(vph) {
  const n = Number(vph)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1_000) return `${(Math.round(n / 100) / 10).toFixed(1)}k`
  return String(Math.round(n))
}

/** 相对爆发倍数：一位小数、整数位不带 `.0`（4.2 / 9）。 */
function velocityMultiplier(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  const one = Math.round(n * 10) / 10
  return one === Math.floor(one) ? String(Math.floor(one)) : one.toFixed(1)
}

/**
 * Pill text of a Host-emitted velocity descriptor (§3.3, #3113).
 *
 * The Host ships facts only (`tier` + `vph` or `multiplier`); every visible
 * string goes through the dictionary keys so the zh/en layers keep the same
 * shapes the spec locks. A legacy descriptor that carries `text` verbatim wins
 * — the same passthrough the grid has always honoured. `''` means the pill
 * does not render.
 * @param {Record<string, any> | null | undefined} velocity
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function rivalVelocityText(velocity, t) {
  if (!velocity || typeof velocity !== 'object') return ''
  const direct = String(velocity.text || '')
  if (direct) return direct
  const translate = typeof t === 'function' ? t : (key) => key
  const tier = String(velocity.tier || '')
  const rate = velocityRate(velocity.vph)
  if (tier === 'hot') return rate ? `${translate('rivalFeed.pill.hot')} ${rate}/h` : ''
  if (tier === 'rising') return rate ? `${translate('rivalFeed.pill.rising')} ${rate}/h` : ''
  if (tier === 'watch') return rate ? `${translate('rivalFeed.pill.watch')} ${rate}/h` : ''
  if (tier === 'average') return rate ? `${translate('rivalFeed.pill.average')} ${rate}/h` : ''
  if (tier === 'relative') {
    const multiplier = velocityMultiplier(velocity.multiplier)
    return multiplier ? `${translate('rivalFeed.pill.relative')} ${multiplier}x` : ''
  }
  return ''
}

/**
 * The locale the components are rendering in.
 *
 * NOT the language's source of truth — do not copy this pattern. The real
 * source is `ctx.locale` (`getSnapshot()?.active`, the same seam
 * `composer-commands-i18n.js` and omnimux-video's sidebar use); `apply(ctx)`
 * pins it onto the bound `t` as `t.hostLocale`, and this function reads that
 * first. The dictionary probe below is the fallback for callers that were
 * handed a bare `t` (tests, ad-hoc mounts): it probes `rivalFeed.card.replicate`,
 * whose zh/en values differ.
 * @param {((key: string) => string) | undefined | null} t
 * @returns {'zh' | 'en'}
 */
export function rivalLocaleOf(t) {
  if (typeof t !== 'function') return 'zh'
  const host = t.hostLocale
  if (host) {
    const active = (typeof host.getSnapshot === 'function' ? host.getSnapshot()?.active : host.current) || ''
    if (active) {
      const lower = String(active).toLowerCase()
      // R6-⑧：只认得 zh/en 两个前缀；第三语种（ja/ko/…）不默认 zh，
      // 落回字典探针按实际绑定字典求解，避免日/韩用户拿到中文文案配
      // 中文计数（万 / 天前）的混搭口径。
      if (lower.startsWith('en')) return 'en'
      if (lower.startsWith('zh')) return 'zh'
    }
  }
  const probe = String(t('rivalFeed.card.replicate') || '')
  if (!probe || probe === 'rivalFeed.card.replicate') return 'zh'
  return probe === zh['rivalFeed.card.replicate'] ? 'zh' : 'en'
}

/**
 * Compact count: 12_300 → `1.2万` (zh) / `12.3K` (en).
 * @param {unknown} value
 * @param {'zh' | 'en'} [locale]
 * @returns {string}
 */
export function formatCount(value, locale = 'zh') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const negative = value < 0
  const abs = Math.abs(value)
  const sign = negative ? '-' : ''
  if (locale === 'en') {
    if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}B`
    if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`
    if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}K`
    return String(value)
  }
  if (abs >= 100_000_000) return `${sign}${trim(abs / 100_000_000)}亿`
  if (abs >= 10_000) return `${sign}${trim(abs / 10_000)}万`
  return String(value)
}

/** @param {number} value */
function trim(value) {
  return String(Math.round(value * 10) / 10)
}

/**
 * Engagement count in the spec §3.7 互动量 口径：千分位原值，`≥1万` 用万缩写。
 * 8640 → `8,640`；19640 → `2万`（zh）/ `19.6K`（en）。`--` for unreadable values.
 * @param {unknown} value
 * @param {'zh' | 'en'} [locale]
 * @returns {string}
 */
export function formatEngagementCount(value, locale = 'zh') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (locale === 'en') {
    const abs = Math.abs(value)
    const negative = value < 0
    const sign = negative ? '-' : ''
    if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`
    if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}K`
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000) / 10}万`
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * `0:31` / `1:02:03` for a duration in seconds.
 * @param {unknown} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Relative time such as `3 天前` (zh) / `3d ago` (en). Returns `--` for an
 * unreadable value rather than pretending the post is from today.
 * @param {unknown} iso
 * @param {number} [nowMs]
 * @param {'zh' | 'en'} [locale]
 * @returns {string}
 */
export function formatRelativeTime(iso, nowMs = Date.now(), locale = 'zh') {
  if (typeof iso !== 'string' || !iso) return '--'
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return '--'
  const diffMs = nowMs - at
  const minutes = Math.floor(diffMs / 60_000)
  if (locale === 'en') {
    if (diffMs < 0 || minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
  }
  if (diffMs < 0) return '刚刚'
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}
