/**
 * Utility, date-formatting and payload-unwrapping functions for analytics.
 */

import { DEFAULT_QUERY, RANGE_DAYS } from './constants.js'

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function num(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {number} value
 * @param {number} digits
 */
export function roundTo(value, digits) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/**
 * Post-list ER: cloud `1.83` means 1.83% → store `0.0183`.
 * Values in (0, 1] are already ratios.
 * @param {unknown} value
 */
export function normalizeErRatio(value) {
  const n = num(value)
  if (n == null) return null
  const ratio = n > 1 ? n / 100 : n
  return roundTo(ratio, 6)
}

/**
 * Cadence chart exception: store percent-points (`2.2` → `2.2%`).
 * Tiny fractions (`0.022`) are treated as ratios and scaled once.
 * @param {unknown} value
 */
export function normalizeErPercentPoints(value) {
  const n = num(value)
  if (n == null) return null
  const points = n > 0 && n <= 0.05 ? n * 100 : n
  return roundTo(points, 4)
}

/**
 * Cloud `day_of_week` 0 = Sunday → dashboard 0 = Monday.
 * @param {number} sundayIndex
 */
export function cloudSundayToMonday(sundayIndex) {
  const d = Number(sundayIndex)
  if (!Number.isInteger(d) || d < 0 || d > 6) return null
  return (d + 6) % 7
}

/**
 * @param {number} score
 * @param {number} maxScore
 */
export function heatmapLevel(score, maxScore) {
  if (!score || score <= 0) return 0
  const ratio = score / (maxScore || 1)
  if (ratio < 0.25) return 1
  if (ratio < 0.50) return 2
  if (ratio < 0.75) return 3
  return 4
}

/**
 * Best-post weight from the frontend contract §0.
 * @param {{ er?: number | null, views?: number | null, shares?: number | null }} row
 */
export function bestPostScore(row) {
  const er = typeof row.er === 'number' ? row.er : 0
  const views = typeof row.views === 'number' ? row.views : 0
  const shares = typeof row.shares === 'number' ? row.shares : 0
  return 0.5 * er + 0.3 * Math.log10(views + 1) + 0.2 * shares
}

/**
 * @param {Date} date
 */
export function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string} iso
 */
export function parseLocalDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Monday of the week containing `iso` (local calendar).
 * @param {string} iso
 */
export function startOfWeekMonday(iso) {
  const date = parseLocalDate(iso)
  if (!date) return iso
  const day = date.getDay()
  const offset = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - offset)
  return ymd(date)
}

/**
 * @param {string} iso
 * @param {string} [locale]
 */
export function dateLabel(iso, locale = 'zh-CN') {
  const date = parseLocalDate(iso)
  if (!date) return iso
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (String(locale).toLowerCase().startsWith('en')) return `${m}/${d}`
  return `${m}月${d}日`
}

/**
 * @param {string} iso
 */
export function publishedLabel(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const ENVELOPE_KEYS = Object.freeze([
  'dailyData', 'platformBreakdown', 'slots', 'frequency',
  'buckets', 'posts', 'accounts', 'timeline',
  'recommended', 'optimalCadence', 'milestones',
])

function isEnvelopePayload(inner) {
  return ENVELOPE_KEYS.some((key) => key in inner)
}

/**
 * Peel `{ data: { … } }` envelopes the cloud sometimes wraps around.
 * @param {unknown} raw
 */
export function unwrap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const row = /** @type {Record<string, unknown>} */ (raw)
  const data = row.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return row
  }
  const inner = /** @type {Record<string, unknown>} */ (data)
  if (isEnvelopePayload(inner)) {
    return inner
  }
  return row
}

/**
 * @param {Record<string, unknown>} [query]
 */
export function normalizeQuery(query = {}) {
  const timeRange = RANGE_DAYS[query.timeRange] ? query.timeRange : '30d'
  const searchQuery = typeof query.searchQuery === 'string' ? query.searchQuery : ''
  const tab = query.tab === 'inbox' ? 'inbox' : 'posting'
  return {
    ...DEFAULT_QUERY,
    ...query,
    platform: query.platform || 'all',
    profileId: query.profileId || 'all',
    source: query.source || 'all',
    timeRange,
    searchQuery,
    tab,
  }
}

/**
 * @param {string} timeRange
 */
export function grainFor(timeRange) {
  return timeRange === '7d' ? 'day' : 'week'
}

/**
 * @param {string} iso
 * @param {'day' | 'week'} grain
 */
export function bucketKey(iso, grain) {
  return grain === 'week' ? startOfWeekMonday(iso) : iso
}

/**
 * @param {string} fromDate
 * @param {string} toDate
 * @param {'day' | 'week'} grain
 */
export function enumerateBuckets(fromDate, toDate, grain) {
  const start = parseLocalDate(fromDate)
  const end = parseLocalDate(toDate)
  if (!start || !end) return []
  /** @type {string[]} */
  const keys = []
  const seen = new Set()
  const cursor = new Date(start)
  while (cursor <= end) {
    const iso = ymd(cursor)
    const key = bucketKey(iso, grain)
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}
