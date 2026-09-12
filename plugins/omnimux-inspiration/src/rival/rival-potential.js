/**
 * Potential (潜力) rules R1–R4 and the statistics they need.
 *
 * Pure functions: no `fs`, no `fetch`, no clock — the caller passes `now`. Every
 * rule is explainable and reported as a reason key, because a flagged post the
 * user cannot understand is worse than an unflagged one.
 *
 * Sample-size and division guards are part of the contract: a single viral post
 * on a fresh account, or an account whose median view count is 0, must not flag
 * everything it owns.
 */

import {
  POTENTIAL_GROWTH_MIN_VIEWS,
  POTENTIAL_GROWTH_PCT,
  POTENTIAL_LIKE_RATE_MULTIPLIER,
  POTENTIAL_MIN_SAMPLES,
  POTENTIAL_VIEWS_MULTIPLIER,
} from './constants.js'

/** Reason-key suffix of each rule, resolved through `rivalAccounts.potential.*`. */
export const POTENTIAL_RULES = Object.freeze(['R1', 'R2', 'R3', 'R4'])

/** @param {string} rule */
export function ruleReasonKey(rule) {
  return `rivalAccounts.potential.${rule.toLowerCase()}`
}

/**
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  const list = (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b)
  if (list.length === 0) return 0
  const middle = Math.floor(list.length / 2)
  return list.length % 2 === 0 ? (list[middle - 1] + list[middle]) / 2 : list[middle]
}

/**
 * @param {number[]} values
 * @returns {number}
 */
export function mean(values) {
  const list = (Array.isArray(values) ? values : []).filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (list.length === 0) return 0
  return list.reduce((total, value) => total + value, 0) / list.length
}

/**
 * Newest-first rows, with unparseable publication times last (never dropped:
 * a post with an unreadable date still deserves to be scored by its peers).
 * @param {Record<string, any>[]} rows
 * @returns {Record<string, any>[]}
 */
function byPostedAtDesc(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
    const left = Date.parse(String(a?.posted_at || ''))
    const right = Date.parse(String(b?.posted_at || ''))
    if (Number.isNaN(left) && Number.isNaN(right)) return 0
    if (Number.isNaN(left)) return 1
    if (Number.isNaN(right)) return -1
    return right - left
  })
}

/**
 * @param {Record<string, any>} row
 * @returns {number | null}
 */
function viewsOf(row) {
  const views = row?.stats?.views
  return typeof views === 'number' && Number.isFinite(views) ? views : null
}

/**
 * @param {Record<string, any>} row
 * @returns {number | null}
 */
function likesOf(row) {
  const likes = row?.stats?.likes
  return typeof likes === 'number' && Number.isFinite(likes) ? likes : null
}

/**
 * Score one row against the account's own baseline.
 *
 * @param {Record<string, any>} row
 * @param {{
 *   medianViews: number,
 *   medianLikes: number | null,
 *   olderMedianViews: number | null,
 *   sampleSize: number,
 * }} baseline
 * @returns {{ flagged: boolean, rules: string[], reason_keys: string[] }}
 */
export function scoreRuleSet(row, baseline) {
  const rules = []
  const views = viewsOf(row)
  const likes = likesOf(row)

  // R1 — an outlier against the account's own median view count.
  if (
    views !== null
    && baseline.sampleSize >= POTENTIAL_MIN_SAMPLES
    && baseline.medianViews > 0
    && views >= baseline.medianViews * POTENTIAL_VIEWS_MULTIPLIER
  ) {
    rules.push('R1')
  }

  // R2 — a viral post: far above the recent baseline in absolute terms too.
  // The sample guard is repeated here on purpose: with fewer than
  // `POTENTIAL_MIN_SAMPLES` rows there is no baseline to be above, and a fresh
  // account's first post would otherwise flag itself.
  if (
    views !== null
    && baseline.sampleSize >= POTENTIAL_MIN_SAMPLES
    && views >= POTENTIAL_GROWTH_MIN_VIEWS
    && baseline.medianViews > 0
  ) {
    const growth = ((views - baseline.medianViews) / baseline.medianViews) * 100
    if (growth >= POTENTIAL_GROWTH_PCT) rules.push('R2')
  }

  // R3 — engagement quality: the like rate runs well above the account's own.
  if (
    views !== null
    && views > 0
    && likes !== null
    && baseline.medianLikes !== null
    && baseline.medianViews > 0
    && baseline.medianLikes > 0
    && baseline.sampleSize >= POTENTIAL_MIN_SAMPLES
  ) {
    const likeRate = likes / views
    const baselineRate = baseline.medianLikes / baseline.medianViews
    if (baselineRate > 0 && likeRate >= baselineRate * POTENTIAL_LIKE_RATE_MULTIPLIER) rules.push('R3')
  }

  // R4 — an outlier against the *older* half of the account's own history.
  if (
    views !== null
    && baseline.olderMedianViews !== null
    && baseline.olderMedianViews > 0
    && baseline.sampleSize >= POTENTIAL_MIN_SAMPLES
    && views >= baseline.olderMedianViews * POTENTIAL_VIEWS_MULTIPLIER
  ) {
    rules.push('R4')
  }

  return {
    flagged: rules.length > 0,
    rules,
    reason_keys: rules.map((rule) => ruleReasonKey(rule)),
  }
}

/**
 * Baseline of an account: medians over all rows, plus the median of the older
 * half used by R4.
 * @param {Record<string, any>[]} rows
 * @returns {{ medianViews: number, medianLikes: number | null, olderMedianViews: number | null, sampleSize: number }}
 */
export function computeBaseline(rows) {
  const ordered = byPostedAtDesc(rows)
  const withViews = ordered.filter((row) => viewsOf(row) !== null)
  const views = withViews.map((row) => /** @type {number} */ (viewsOf(row)))
  const likes = ordered.map((row) => likesOf(row)).filter((value) => value !== null)
  const olderHalf = withViews.slice(Math.ceil(withViews.length / 2))
  return {
    medianViews: median(views),
    medianLikes: likes.length > 0 ? median(/** @type {number[]} */ (likes)) : null,
    olderMedianViews: olderHalf.length > 0 ? median(olderHalf.map((row) => /** @type {number} */ (viewsOf(row)))) : null,
    sampleSize: ordered.length,
  }
}

/**
 * Flag the given rows against their own account's baseline.
 *
 * @param {Record<string, any>[]} rows
 * @param {{ now?: string }} [opts]
 * @returns {Record<string, any>[]} the rows, each with a fresh `potential`
 */
export function markPotential(rows, opts = {}) {
  const baseline = computeBaseline(rows)
  const scoredAt = opts.now || new Date().toISOString()
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    potential: {
      ...scoreRuleSet(row, baseline),
      scored_at: scoredAt,
      score: null,
    },
  }))
}
