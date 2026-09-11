/**
 * Heatmap and posting cadence strategy generators.
 */

import {
  CADENCE_BRACKETS,
  DAY_LABELS_EN,
  DAY_LABELS_ZH,
  PLATFORM_LABEL,
} from './constants.js'
import {
  cloudSundayToMonday,
  heatmapLevel,
  normalizeErPercentPoints,
  num,
  unwrap,
} from './formatters.js'
import { emptyHeatmap } from './emptyStates.js'

function isValidHour(hour) {
  if (!Number.isInteger(hour)) return false
  return hour >= 0 && hour <= 23
}

function resolveRawField(item, primaryKey, fallbackKey) {
  if (item[primaryKey] !== undefined) return item[primaryKey]
  return item[fallbackKey]
}

function parseSlotItem(slot) {
  const rawDay = resolveRawField(slot, 'day_of_week', 'dayOfWeek')
  const day = cloudSundayToMonday(rawDay)
  if (day === null) return null

  const hour = Number(slot.hour)
  if (!isValidHour(hour)) return null

  const rawScore = resolveRawField(slot, 'avg_engagement', 'score')
  const score = num(rawScore) || 0

  const rawPostCount = resolveRawField(slot, 'post_count', 'postCount')
  const postCount = num(rawPostCount) || 0

  return { day, hour, score, postCount }
}

function fillHeatmapCells(slots, cells) {
  let maxScore = 0
  for (const slot of slots) {
    const parsed = parseSlotItem(slot)
    if (!parsed) continue
    const { day, hour, score, postCount } = parsed
    if (score > maxScore) {
      maxScore = score
    }
    cells[day * 24 + hour] = { dayOfWeek: day, hour, score, level: 0, postCount }
  }
  for (const cell of cells) {
    cell.level = heatmapLevel(cell.score, maxScore)
  }
  return maxScore
}

function formatRecommendedItem(item) {
  const rawDay = resolveRawField(item, 'day_of_week', 'dayOfWeek')
  const day = cloudSundayToMonday(rawDay)
  const hour = Number(item.hour)
  const score = num(item.score) || 0
  if (day === null || !Number.isInteger(hour)) return null
  const hh = String(hour).padStart(2, '0')
  return {
    dayOfWeek: day,
    hour,
    score,
    labelZh: `${DAY_LABELS_ZH[day]} ${hh}:00 · 互动指数 ${score}`,
    labelEn: `${DAY_LABELS_EN[day]} ${hh}:00 · score ${score}`,
  }
}

function fallbackTopRecommended(cells) {
  const ranked = cells
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const recommended = []
  for (const cell of ranked) {
    const hh = String(cell.hour).padStart(2, '0')
    recommended.push({
      dayOfWeek: cell.dayOfWeek,
      hour: cell.hour,
      score: cell.score,
      labelZh: `${DAY_LABELS_ZH[cell.dayOfWeek]} ${hh}:00 · 互动指数 ${cell.score}`,
      labelEn: `${DAY_LABELS_EN[cell.dayOfWeek]} ${hh}:00 · score ${cell.score}`,
    })
  }
  return recommended
}

function buildRecommendedList(recommendedSrc, cells) {
  const recommended = []
  for (const item of recommendedSrc) {
    const row = formatRecommendedItem(item)
    if (row) {
      recommended.push(row)
    }
  }
  if (recommended.length === 0) {
    return fallbackTopRecommended(cells)
  }
  return recommended
}

/**
 * @param {unknown} raw
 */
export function mapHeatmap(raw) {
  const body = unwrap(raw) || {}
  const slots = Array.isArray(body.slots) ? body.slots : []
  const cells = emptyHeatmap().cells
  const maxScore = fillHeatmapCells(slots, cells)
  const recommendedSrc = Array.isArray(body.recommended) ? body.recommended : []
  const recommended = buildRecommendedList(recommendedSrc, cells)

  return {
    cells,
    maxScore,
    recommended,
    dayLabelsZh: DAY_LABELS_ZH.slice(),
    dayLabelsEn: DAY_LABELS_EN.slice(),
  }
}

function recordCadenceRow(byPlatform, row) {
  const platform = String(row.platform || '').toLowerCase()
  if (!platform) return
  const bracket = String(row.posts_per_week || row.bracket || '')
  const idx = CADENCE_BRACKETS.indexOf(/** @type {any} */ (bracket))
  if (idx < 0) return
  const series = byPlatform.get(platform) || CADENCE_BRACKETS.map(() => null)
  const rawEr = row.avg_engagement_rate !== undefined ? row.avg_engagement_rate : row.er
  series[idx] = normalizeErPercentPoints(rawEr)
  byPlatform.set(platform, series)
}

function buildCadenceSeries(frequency) {
  const byPlatform = new Map()
  for (const row of frequency) {
    recordCadenceRow(byPlatform, row)
  }
  return [...byPlatform.entries()].map(([platform, erPercentPoints]) => ({
    platform,
    erPercentPoints,
  }))
}

function formatSingleOptimal(platform, row) {
  const bracket = String(row.recommendation || row.bracket || '')
  const erPercent = normalizeErPercentPoints(row.er)
  const label = PLATFORM_LABEL[platform] || platform
  const erText = erPercent !== null ? erPercent : '-'
  return {
    platform,
    bracket,
    erPercent,
    labelZh: `${label} ${bracket.replace('/wk', '篇/周')} · 互动率 ${erText}%`,
    labelEn: `${label} ${bracket} · ER ${erText}%`,
  }
}

function findBestErBracket(erPercentPoints) {
  let bestIdx = -1
  let best = -1
  erPercentPoints.forEach((value, idx) => {
    if (typeof value === 'number' && value > best) {
      best = value
      bestIdx = idx
    }
  })
  return { bestIdx, best }
}

function fallbackBestCadence(series) {
  const optimal = []
  for (const item of series) {
    const { bestIdx, best } = findBestErBracket(item.erPercentPoints)
    if (bestIdx >= 0) {
      const bracket = CADENCE_BRACKETS[bestIdx]
      const label = PLATFORM_LABEL[item.platform] || item.platform
      optimal.push({
        platform: item.platform,
        bracket,
        erPercent: best,
        labelZh: `${label} ${bracket.replace('/wk', '篇/周')} · 互动率 ${best}%`,
        labelEn: `${label} ${bracket} · ER ${best}%`,
      })
    }
  }
  return optimal
}

function extractOptimalCadence(optimalSrc, series) {
  const optimal = []
  for (const [platform, info] of Object.entries(optimalSrc)) {
    const row = info && typeof info === 'object' ? /** @type {Record<string, unknown>} */ (info) : {}
    optimal.push(formatSingleOptimal(platform, row))
  }
  if (optimal.length === 0) {
    return fallbackBestCadence(series)
  }
  return optimal
}

/**
 * @param {unknown} raw
 */
export function mapCadence(raw) {
  const body = unwrap(raw) || {}
  const frequency = Array.isArray(body.frequency) ? body.frequency : []
  const series = buildCadenceSeries(frequency)
  const optimalSrc = body.optimalCadence && typeof body.optimalCadence === 'object'
    ? body.optimalCadence
    : {}
  const optimal = extractOptimalCadence(optimalSrc, series)

  return {
    brackets: CADENCE_BRACKETS.slice(),
    series,
    optimal,
  }
}
