/**
 * @file 爆速检测算法核心 —— PRD 附录 A 公式的**唯一实现**。
 *
 * 纪律（见系统设计 §7.1）：
 * - 本文件属 `src/core/**`：**不得** import 任何 `node:*` 模块，不得访问 `Date` / `process` / 随机数。
 * - 时间必须由调用方显式注入 `nowMs`，消除时钟依赖，保证单测确定性。
 * - 公式系数**禁止**调参凑测试；运算顺序逐字对齐设计文档 §3.2。
 */

import { clamp, finiteOr, nullToZero } from './metrics.js'

/** 存活小时数下界：1 分钟（`R ≥ 1/60 > 0`，因此不存在除零）。 */
export const HOURS_ALIVE_MIN = 1 / 60
/** 存活小时数上界：48 小时。 */
export const HOURS_ALIVE_MAX = 48

/** 爆款门槛：`j > 8000`。 */
export const VIRAL_PACE_THRESHOLD = 8000
/** 飙升门槛：`1000 ≤ j ≤ 8000`。 */
export const SURGING_PACE_THRESHOLD = 1000

/** 时间衰减上界（`R → 0` 时理论取到，实际因 `R > 0` 取不到）。 */
export const TIME_DECAY_MAX = 6
/** 时间衰减下界（`R ≥ 13.714…` 触底）。 */
export const TIME_DECAY_MIN = 1.2
/** 时间衰减速率：`6 - R * 0.35`。 */
export const TIME_DECAY_RATE = 0.35

/** 时效加成上界（`R → 0`）。 */
export const FRESHNESS_MAX = 1.28
/** 时效加成下界（`R ≥ 13.14…` 触底）。 */
export const FRESHNESS_MIN = 0.55
/** 时效衰减分母：`1.28 - R / 18`。 */
export const FRESHNESS_DIVISOR = 18

/** 竞争折扣基准：`1.14 - log10(replies + 1) * 0.22`。 */
export const COMPETITION_BASE = 1.14
/** 竞争折扣权重。 */
export const COMPETITION_REPLY_WEIGHT = 0.22
/** 竞争折扣上界（`replies = 0` 算得 `1.14`，被夹到此处）。 */
export const COMPETITION_MAX = 1.08
/** 竞争折扣下界（`replies = 2000` 触底）。 */
export const COMPETITION_MIN = 0.42

/** 曝光基准转化率常量。 */
export const EXPOSURE_BASE_RATE = 0.04
/** 曝光预测下限。 */
export const EXPOSURE_FLOOR = 20

/** 一小时对应的毫秒数。 */
const MS_PER_HOUR = 3_600_000

/**
 * 存活小时数：`R = (nowMs - createdAtMs) / 3_600_000`，再夹取到 `[1/60, 48]`。
 *
 * 未来时间戳**不报错**：`rawHours < 0` 时按 `R = 1/60` 计算，并把 `clockSkew` 置为 `true`
 * （调用方据此打 `CLOCK_SKEW_FUTURE` 标记）。
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @param {number} createdAtMs 推文创建时刻（epoch ms）
 * @returns {{ hours: number, rawHours: number, clockSkew: boolean }}
 */
export function toHoursAlive(nowMs, createdAtMs) {
  const now = finiteOr(nowMs, 0)
  const created = finiteOr(createdAtMs, now)
  const rawHours = (now - created) / MS_PER_HOUR
  const hours = clamp(rawHours, HOURS_ALIVE_MIN, HOURS_ALIVE_MAX)
  return { hours, rawHours, clockSkew: rawHours < 0 }
}

/**
 * 三档爆速分级。
 *
 * `j > 8000` → `viral`；`1000 ≤ j ≤ 8000` → `surging`；`j < 1000` → `normal`。
 * 注意 8000 与 1000 都归属 `surging`（闭区间），是分级边界最易写错的两点。
 * @param {number} pace 时速 `j`
 * @returns {'viral' | 'surging' | 'normal'}
 */
export function classifyTier(pace) {
  const j = finiteOr(pace, 0)
  if (j > VIRAL_PACE_THRESHOLD) return 'viral'
  if (j >= SURGING_PACE_THRESHOLD) return 'surging'
  return 'normal'
}

/**
 * 抢评预估曝光拆解。
 *
 * - `timeDecay = clamp(6 - R * 0.35, 1.2, 6)`
 * - `freshnessBonus = clamp(1.28 - R / 18, 0.55, 1.28)`
 * - `competition = clamp(1.14 - Math.log10(replies + 1) * 0.22, 0.42, 1.08)`
 * - `predicted = Math.max(20, Math.round(j * timeDecay * freshnessBonus * competition * 0.04))`
 * @param {number} pace 时速 `j`
 * @param {number} hoursAlive 存活小时 `R`（已夹取）
 * @param {number} replies 回复数
 * @returns {import('./sort.js').ExposureBreakdown} 曝光拆解（`floored = true` 表示命中 20 的预测下限）
 */
export function computeExposure(pace, hoursAlive, replies) {
  const j = finiteOr(pace, 0)
  const hours = finiteOr(hoursAlive, HOURS_ALIVE_MIN)
  const replyCount = Math.max(0, finiteOr(replies, 0))

  const timeDecay = clamp(
    TIME_DECAY_MAX - hours * TIME_DECAY_RATE,
    TIME_DECAY_MIN,
    TIME_DECAY_MAX,
  )
  const freshnessBonus = clamp(
    FRESHNESS_MAX - hours / FRESHNESS_DIVISOR,
    FRESHNESS_MIN,
    FRESHNESS_MAX,
  )
  const competition = clamp(
    COMPETITION_BASE - Math.log10(replyCount + 1) * COMPETITION_REPLY_WEIGHT,
    COMPETITION_MIN,
    COMPETITION_MAX,
  )

  const raw = j * timeDecay * freshnessBonus * competition * EXPOSURE_BASE_RATE
  const predicted = Math.max(EXPOSURE_FLOOR, Math.round(finiteOr(raw, 0)))

  return {
    timeDecay,
    freshnessBonus,
    competition,
    baseRate: EXPOSURE_BASE_RATE,
    predicted,
    floored: !(raw >= EXPOSURE_FLOOR),
  }
}

/**
 * 计算单条推文的全部推导量（可审计，便于回放核对）。
 *
 * `views` 为 `null` 时按 0 参与计算；`R ≥ 1/60` 恒大于 0，不存在除零。
 * @param {import('../collect/tweet.js').TweetRecord} record 规范实体
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @returns {import('./sort.js').TweetStats}
 */
export function computeTweetStats(record, nowMs) {
  const now = finiteOr(nowMs, 0)
  const createdAtMs = finiteOr(record?.createdAtMs, now)
  const { hours, rawHours } = toHoursAlive(now, createdAtMs)

  const views = nullToZero(record?.metrics?.views)
  const replies = nullToZero(record?.metrics?.replies)

  const pace = views / hours

  return {
    hoursAlive: hours,
    hoursAliveRaw: rawHours,
    pace,
    tier: classifyTier(pace),
    exposure: computeExposure(pace, hours, replies),
  }
}

/**
 * 批量打分：把 `TweetRecord[]` 变成 `ScoredTweet[]`。
 *
 * `degraded = true` 表示该条存在任一数据缺陷（anomaly 非空），必须在输出层可见。
 * @param {import('../collect/tweet.js').TweetRecord[]} records 规范实体列表
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @returns {import('./sort.js').ScoredTweet[]}
 */
export function scoreTweets(records, nowMs) {
  const list = Array.isArray(records) ? records : []
  return list.map((record) => {
    const stats = computeTweetStats(record, nowMs)
    const anomalies = Array.isArray(record?.anomalies) ? record.anomalies : []
    return {
      record,
      stats,
      degraded: anomalies.length > 0,
      score: stats.exposure.predicted,
    }
  })
}
