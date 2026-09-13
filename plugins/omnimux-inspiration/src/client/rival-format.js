/**
 * Display formatting for the rival workbench.
 *
 * Pure functions with no DOM access, so every branch can be exercised in a unit
 * test instead of through a rendered card.
 */

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
 * Relative time such as `3 天前`. Returns `--` for an unreadable value rather
 * than pretending the post is from today.
 * @param {unknown} iso
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatRelativeTime(iso, nowMs = Date.now()) {
  if (typeof iso !== 'string' || !iso) return '--'
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return '--'
  const diffMs = nowMs - at
  if (diffMs < 0) return '刚刚'
  const minutes = Math.floor(diffMs / 60_000)
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
