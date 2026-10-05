/**
 * Display formatting for the rival workbench.
 *
 * Pure functions with no DOM access, so every branch can be exercised in a unit
 * test instead of through a rendered card.
 */

import { zh } from './locales.js'

/**
 * The locale the components are rendering in, derived from `t` itself.
 *
 * Components get `t` — a dictionary-bound translator — and no locale prop, so
 * the locale is probed instead of threaded: the plugin registers exactly two
 * dictionaries (zh/en) and `rivalFeed.card.replicate` reads differently in
 * each. Anything that is not the en dictionary renders as zh.
 * @param {((key: string) => string) | undefined | null} t
 * @returns {'zh' | 'en'}
 */
export function rivalLocaleOf(t) {
  if (typeof t !== 'function') return 'zh'
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
