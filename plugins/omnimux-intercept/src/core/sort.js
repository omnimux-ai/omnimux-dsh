/**
 * @file 稳定双键排序 —— 保证同一输入在任何机器上产出同序（可做快照回归）。
 *
 * 主键：预估曝光（`exposure`）或时速（`pace`），降序；
 * 兜底键：`id` 的 Unicode 码点升序（**不用** `localeCompare`，避免 ICU 版本差异导致跨机不同序）。
 *
 * 本文件属 `src/core/**`：不得 import 任何 `node:*` 模块，不得访问时钟。
 */

/**
 * @typedef {import('../collect/tweet.js').TweetRecord} TweetRecord
 *
 * @typedef {object} ExposureBreakdown
 * @property {number} timeDecay `clamp(6 - R * 0.35, 1.2, 6)`
 * @property {number} freshnessBonus `clamp(1.28 - R / 18, 0.55, 1.28)`
 * @property {number} competition `clamp(1.14 - log10(replies + 1) * 0.22, 0.42, 1.08)`
 * @property {number} baseRate 常量 0.04
 * @property {number} predicted `max(20, round(...))`
 * @property {boolean} floored true = 命中 20 下限（诊断用）
 *
 * @typedef {object} TweetStats
 * @property {number} hoursAlive 存活小时 `R`（已夹取到 `[1/60, 48]`）
 * @property {number} hoursAliveRaw 未经夹取的原始差值（诊断用）
 * @property {number} pace 时速 `j = views / R`
 * @property {'viral' | 'surging' | 'normal'} tier 三档分级
 * @property {ExposureBreakdown} exposure 曝光拆解
 *
 * @typedef {object} ScoredTweet
 * @property {TweetRecord} record 规范实体
 * @property {TweetStats} stats 推导统计
 * @property {boolean} degraded 任一 anomaly 存在
 * @property {number} score = `stats.exposure.predicted`
 */

/**
 * 码点序字符串比较（确定性，不依赖 ICU）。
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} `-1 | 0 | 1`
 */
export function compareCodePoints(a, b) {
  const left = typeof a === 'string' ? a : String(a ?? '')
  const right = typeof b === 'string' ? b : String(b ?? '')
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * 取排序主键值。
 * @param {ScoredTweet} row 打分结果
 * @param {'exposure' | 'pace'} by 排序主键
 * @returns {number}
 */
export function primaryKey(row, by) {
  if (by === 'pace') {
    const pace = row?.stats?.pace
    return typeof pace === 'number' && Number.isFinite(pace) ? pace : 0
  }
  const score = row?.score
  return typeof score === 'number' && Number.isFinite(score) ? score : 0
}

/**
 * 主键降序 + `id` 升序兜底。
 * @param {ScoredTweet} a
 * @param {ScoredTweet} b
 * @param {'exposure' | 'pace'} by
 * @returns {number}
 */
function compareRows(a, b, by) {
  const left = primaryKey(a, by)
  const right = primaryKey(b, by)
  if (left !== right) return right - left
  return compareCodePoints(a?.record?.id, b?.record?.id)
}

/**
 * 稳定排序：不改动入参数组，返回新数组。
 * @param {ScoredTweet[]} rows 打分结果
 * @param {'exposure' | 'pace'} by 排序主键
 * @returns {ScoredTweet[]} 新数组（降序；同分按 `id` 升序）
 */
export function rankTweets(rows, by = 'exposure') {
  const list = Array.isArray(rows) ? rows.slice() : []
  const key = by === 'pace' ? 'pace' : 'exposure'
  list.sort((a, b) => compareRows(a, b, key))
  return list
}

/**
 * 按分级拆桶（保持入参顺序，不再排序）。
 * @param {ScoredTweet[]} rows 打分结果
 * @returns {{ viral: ScoredTweet[], surging: ScoredTweet[], normal: ScoredTweet[] }}
 */
export function splitByTier(rows) {
  /** @type {ScoredTweet[]} */
  const viral = []
  /** @type {ScoredTweet[]} */
  const surging = []
  /** @type {ScoredTweet[]} */
  const normal = []
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    const tier = row?.stats?.tier
    if (tier === 'viral') viral.push(row)
    else if (tier === 'surging') surging.push(row)
    else normal.push(row)
  }
  return { viral, surging, normal }
}
