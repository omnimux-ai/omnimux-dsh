/**
 * Pure client-side formatting helpers.
 */

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) return '—'
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

/**
 * Locale-aware relative time; falls back to a local date-time string.
 * @param {string} iso
 * @param {number} [now]
 */
export function formatRelative(iso, now = Date.now()) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  const deltaSec = Math.round((time - now) / 1000)
  const abs = Math.abs(deltaSec)
  if (abs >= 86400 * 30) return new Date(time).toLocaleString()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return rtf.format(Math.trunc(deltaSec), 'second')
  if (abs < 3600) return rtf.format(Math.trunc(deltaSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.trunc(deltaSec / 3600), 'hour')
  return rtf.format(Math.trunc(deltaSec / 86400), 'day')
}

/**
 * 健壮可靠的相对时间格式化（“多少时间前”）：
 * - 支持 ISO 字符串、时间戳毫秒数字、Date 实例
 * - 容忍客户端/服务端微小时钟正负偏差（< 60 秒均归为“刚刚”）
 * - 纯净可靠的相对时间阶梯（Time Ago 规范）：
 *   - < 60秒：刚刚
 *   - < 60分钟：N分钟前
 *   - < 24小时：N小时前
 *   - < 30天：N天前（包含 1天前）
 *   - < 12个月：N个月前
 *   - >= 1年：N年前
 * - 支持 options.showYesterday: true 时，将 24~48 小时间隔特别转为“昨天”
 * - 非法值（null, undefined, NaN, 非法字符串）安全防御回退为空字符串，绝不抛错
 *
 * @param {string | number | Date | null | undefined} input
 * @param {number | { now?: number, showYesterday?: boolean }} [opts] 可选自定义基准时间或配置选项
 * @returns {string}
 */
export function formatTimeAgo(input, opts) {
  if (input == null || input === '') return ''
  let time = 0
  if (typeof input === 'number') {
    time = input
  } else if (input instanceof Date) {
    time = input.getTime()
  } else {
    time = Date.parse(String(input))
  }
  if (!Number.isFinite(time)) return ''

  const now = typeof opts === 'number' ? opts : (opts?.now ?? Date.now())
  const showYesterday = typeof opts === 'object' ? Boolean(opts?.showYesterday) : false
  const diffSec = Math.floor((now - time) / 1000)

  // 容忍未来 10 秒内的微小时钟偏差
  if (diffSec < 60) {
    return '刚刚'
  }
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60))
    return `${mins}分钟前`
  }
  if (diffSec < 86400) {
    const hours = Math.max(1, Math.floor(diffSec / 3600))
    return `${hours}小时前`
  }

  const days = Math.max(1, Math.floor(diffSec / 86400))
  if (showYesterday && days === 1) {
    return '昨天'
  }

  if (days < 30) {
    return `${days}天前`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${Math.max(1, months)}个月前`
  }

  const years = Math.floor(days / 365)
  return `${Math.max(1, years)}年前`
}

/**
 * Locale-aware absolute date-time.
 * @param {string} iso
 */
export function formatDateTime(iso) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleString()
}

const TYPE_BY_EXT = {
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.heic', '.tiff']),
  video: new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv']),
  audio: new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.aiff']),
  document: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.rtf']),
  html: new Set(['.html', '.htm']),
  json: new Set(['.json', '.jsonl', '.ndjson']),
}

/**
 * Client-side copy of the extension → type-bucket mapping (the host scanner
 * already tags rows; this covers client-only cases such as chips).
 * @param {string} ext lowercase extension including the dot
 * @returns {'image' | 'video' | 'audio' | 'document' | 'html' | 'json' | 'other'}
 */
export function extToBucket(ext) {
  for (const [bucket, exts] of Object.entries(TYPE_BY_EXT)) {
    if (exts.has(ext)) return /** @type {any} */ (bucket)
  }
  return 'other'
}

/**
 * @param {string} type
 */
export function bucketLabelKey(type) {
  return `type.${type}`
}
