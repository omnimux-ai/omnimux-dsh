/**
 * @file plugins/omnimux-video-preview/src/breakdown/timeUtils.js
 * Video breakdown time parsing and formatting utilities.
 */

/**
 * Normalizes seconds into mm:ss format.
 * @param {number} sec
 * @returns {string}
 */
export function formatTime(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Format a shot range string like "0:03 - 0:04".
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function formatTimeRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`
}

/**
 * Parse start and end seconds from matched regex groups.
 * @param {RegExpMatchArray} m
 * @returns {{ startSec: number, endSec: number }}
 */
function parseMatchedSeconds(m) {
  const hasMinute1 = m[1] !== undefined
  const hasMinute2 = m[3] !== undefined
  if (!hasMinute1 && !hasMinute2) {
    return {
      startSec: parseInt(m[2], 10),
      endSec: parseInt(m[4], 10),
    }
  }

  const m1 = hasMinute1 ? parseInt(m[1], 10) : 0
  const s1 = parseInt(m[2], 10)
  const m2 = hasMinute2 ? parseInt(m[3], 10) : 0
  const s2 = parseInt(m[4], 10)
  return {
    startSec: m1 * 60 + s1,
    endSec: m2 * 60 + s2,
  }
}

const TIME_RANGE_REGEX = new RegExp('(?:(\\d+):)?(\\d+)\\s*[-~至到]\\s*(?:(\\d+):)?(\\d+)')

/**
 * Extract time column and parsed seconds from table row columns.
 * @param {Array<string>} cols
 * @returns {{ timeCol: string, startSec: number, endSec: number }}
 */
export function extractTimeRange(cols) {
  for (const col of cols) {
    const m = col.match(TIME_RANGE_REGEX)
    if (!m) continue
    const { startSec, endSec } = parseMatchedSeconds(m)
    return { timeCol: col, startSec, endSec }
  }
  return { timeCol: '', startSec: 0, endSec: 0 }
}
