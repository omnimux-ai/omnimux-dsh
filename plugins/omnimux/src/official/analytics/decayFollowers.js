/**
 * Content decay curves and follower audience evolution analytics.
 */

import { DECAY_WINDOWS, PLATFORMS } from './constants.js'
import { dateLabel, num, unwrap } from './formatters.js'

function resolveDecayWindowPct(winKey, byKey) {
  if (winKey === 'publish') {
    return byKey.has('publish') ? byKey.get('publish') : 0
  }
  return byKey.has(winKey) ? byKey.get(winKey) : null
}

function buildDecayWindows(incoming) {
  const byKey = new Map()
  for (const row of incoming) {
    const key = String(row.bucket_label || row.key || '')
    const pctVal = row.avg_pct_of_final !== undefined ? row.avg_pct_of_final : row.pct
    byKey.set(key, num(pctVal))
  }

  return DECAY_WINDOWS.map((win, order) => ({
    order,
    key: win.key,
    labelZh: win.labelZh,
    labelEn: win.labelEn,
    pct: resolveDecayWindowPct(win.key, byKey),
  }))
}

function findWindowKeyByThreshold(windows, threshold) {
  const hit = windows.find((w) => typeof w.pct === 'number' && w.pct >= threshold)
  return hit ? hit.key : ''
}

function labelOfDecayWindow(key) {
  const win = DECAY_WINDOWS.find((w) => w.key === key)
  return win ? win.labelZh : key
}

function deriveDecayMilestones(milestonesSrc, windows) {
  const halfExplicit = milestonesSrc.half_engagement_by || milestonesSrc.halfEngagementBy || ''
  const eightyExplicit = milestonesSrc.eighty_percent_within || milestonesSrc.eightyPercentWithin || ''
  const halfKey = String(halfExplicit) || findWindowKeyByThreshold(windows, 50)
  const eightyKey = String(eightyExplicit) || findWindowKeyByThreshold(windows, 80)

  const halfLabelZh = halfKey ? `半数互动在发布后 ${labelOfDecayWindow(halfKey)}内产生` : ''
  const eightyLabelZh = eightyKey ? `80% 互动集中在 ${labelOfDecayWindow(eightyKey)}长尾期` : ''

  return {
    halfEngagementBy: halfKey,
    eightyPercentWithin: eightyKey,
    halfLabelZh,
    eightyLabelZh,
  }
}

/**
 * @param {unknown} raw
 */
export function mapDecay(raw) {
  const body = unwrap(raw) || {}
  const incoming = Array.isArray(body.buckets) ? body.buckets : []
  const windows = buildDecayWindows(incoming)
  const milestonesSrc = body.milestones && typeof body.milestones === 'object' ? body.milestones : {}
  const milestones = deriveDecayMilestones(milestonesSrc, windows)

  return {
    windows,
    milestones,
  }
}

function buildAccountPlatformMap(accounts) {
  const idToPlatform = new Map()
  for (const row of accounts) {
    if (row.accountId && row.platform) {
      idToPlatform.set(String(row.accountId), String(row.platform).toLowerCase())
    }
  }
  return idToPlatform
}

function resolvePlatformKey(key, idToPlatform) {
  const mapped = idToPlatform.get(key)
  if (mapped) return mapped
  if (PLATFORMS.includes(/** @type {any} */ (key))) {
    return key
  }
  return null
}

function buildPointBreakdown(src, idToPlatform) {
  /** @type {Record<string, number | null>} */
  const breakdown = {}
  for (const [key, value] of Object.entries(src)) {
    const platform = resolvePlatformKey(key, idToPlatform)
    if (!platform) continue
    const n = num(value) || 0
    breakdown[platform] = (breakdown[platform] || 0) + n
  }
  return breakdown
}

function buildFollowerTimeline(timelineSrc, idToPlatform) {
  return timelineSrc.map((point) => {
    const date = String(point.date || '').slice(0, 10)
    const src = point.breakdown && typeof point.breakdown === 'object' ? point.breakdown : {}
    const breakdown = buildPointBreakdown(src, idToPlatform)
    return {
      date,
      label: dateLabel(date),
      total: num(point.total),
      breakdown,
    }
  })
}

function calcTotalFollowers(accounts, current, timeline) {
  if (accounts.length > 0) {
    return current
  }
  const lastPoint = timeline.length > 0 ? timeline[timeline.length - 1] : null
  const lastTotal = lastPoint ? lastPoint.total : null
  return lastTotal !== undefined ? lastTotal : null
}

/**
 * @param {unknown} raw
 */
export function mapFollowers(raw) {
  const body = unwrap(raw) || {}
  const accounts = Array.isArray(body.accounts) ? body.accounts : []
  const idToPlatform = buildAccountPlatformMap(accounts)

  const current = accounts.reduce((acc, row) => acc + (num(row.currentFollowers) || 0), 0)
  const growth = accounts.reduce((acc, row) => acc + (num(row.growth) || 0), 0)
  const platforms = [...new Set(accounts.map((row) => String(row.platform || '').toLowerCase()).filter(Boolean))]

  const timelineSrc = Array.isArray(body.timeline) ? body.timeline : []
  const timeline = buildFollowerTimeline(timelineSrc, idToPlatform)
  const totalFollowers = calcTotalFollowers(accounts, current, timeline)
  const followerDiff = accounts.length > 0 ? growth : null

  return {
    totalFollowers,
    followerDiff,
    platforms,
    timeline,
  }
}
