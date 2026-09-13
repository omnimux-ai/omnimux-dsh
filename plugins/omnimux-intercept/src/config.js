/**
 * @file 配置与默认值 —— 所有阈值、上限、冷却、超时的唯一定义处（含夹取）。
 *
 * 本文件不属于 `src/core/**`，因此允许读环境变量与 `node:os` / `node:path`；
 * 但**不允许**出现任何业务公式（公式只允许出现在 `src/core/algorithm.js`）。
 */

import os from 'node:os'
import path from 'node:path'

import { ERROR_CODES, InterceptError } from './core/errors.js'

/** `--limit` 下界。 */
export const LIMIT_MIN = 1
/** `--limit` 上界。 */
export const LIMIT_MAX = 200
/** 默认批量（与 OpenCLI `twitter timeline` 的默认值一致）。 */
export const DEFAULT_LIMIT = 20
/** 默认时间线类型。 */
export const DEFAULT_TYPE = 'for-you'
/** 默认排序主键。 */
export const DEFAULT_RANK_BY = 'exposure'
/** 默认最低分级（低于该分级不进入候选清单）。 */
export const DEFAULT_MIN_TIER = 'surging'
/** 默认最低预估曝光（低于该值不进入候选清单）。 */
export const DEFAULT_MIN_EXPOSURE = 0
/** 请求冷却（毫秒）。 */
export const COOLDOWN_MS = 90_000
/** 重试次数（不含首次尝试）。 */
export const RETRY_ATTEMPTS = 3
/** 重试基础延时（毫秒），实际序列为 base * 2^(n-1)。 */
export const RETRY_BASE_DELAY_MS = 1000
/** 子进程超时（毫秒）。 */
export const TIMEOUT_MS = 30_000
/** 单次运行条数硬上限。 */
export const MAX_TWEETS = 200
/** 跨批次抓取强制间隔（毫秒）。 */
export const CHUNK_DELAY_MS = 2000
/** 状态目录名（相对 `$DSH_HOME`）。 */
export const STATE_DIR_NAME = 'omnimux-intercept'
/** 草稿去重表容量上限。 */
export const MAX_DRAFTED_IDS = 500

/**
 * 三档分级，按强度升序。 @type {ReadonlyArray<'normal' | 'surging' | 'viral'>} */
export const TIER_ORDER = Object.freeze(['normal', 'surging', 'viral'])

/** 分级中文标签。 @type {Readonly<Record<string, string>>} */
export const TIER_LABELS = Object.freeze({
  viral: '爆款',
  surging: '飙升',
  normal: '正常',
})

/**
 * 生效配置（`resolveConfig` 的返回值）。
 * @typedef {object} ResolvedConfig
 * @property {number} limit
 * @property {'for-you' | 'following'} type
 * @property {'exposure' | 'pace'} rankBy
 * @property {'normal' | 'surging' | 'viral'} minTier
 * @property {number} minExposure
 * @property {number} cooldownMs
 * @property {number} retryAttempts
 * @property {number} retryBaseDelayMs
 * @property {number} timeoutMs
 * @property {number} maxTweets
 * @property {number} chunkDelayMs
 * @property {'opencli' | 'hub' | 'fixture'} source
 * @property {string} stateRoot
 */

/**
 * 配置覆盖项（调用方可传的子集）。
 * @typedef {object} ConfigOverrides
 * @property {number} [limit]
 * @property {'for-you' | 'following'} [type]
 * @property {'exposure' | 'pace'} [rankBy]
 * @property {'normal' | 'surging' | 'viral'} [minTier]
 * @property {number} [minExposure]
 * @property {number} [cooldownMs]
 * @property {number} [retryAttempts]
 * @property {number} [retryBaseDelayMs]
 * @property {number} [timeoutMs]
 * @property {number} [maxTweets]
 * @property {number} [chunkDelayMs]
 * @property {'opencli' | 'hub' | 'fixture'} [source]
 * @property {string} [stateRoot]
 */

/** 全部默认值（冻结，禁止就地修改）。 @type {Readonly<Omit<ResolvedConfig, 'stateRoot'>>} */
export const DEFAULTS = Object.freeze({
  limit: DEFAULT_LIMIT,
  type: DEFAULT_TYPE,
  rankBy: DEFAULT_RANK_BY,
  minTier: DEFAULT_MIN_TIER,
  minExposure: DEFAULT_MIN_EXPOSURE,
  cooldownMs: COOLDOWN_MS,
  retryAttempts: RETRY_ATTEMPTS,
  retryBaseDelayMs: RETRY_BASE_DELAY_MS,
  timeoutMs: TIMEOUT_MS,
  maxTweets: MAX_TWEETS,
  chunkDelayMs: CHUNK_DELAY_MS,
  source: 'opencli',
})

/** 空值显示符（`views: null` 与 `0` 不可互换）。 */
export const EMPTY_DISPLAY = '—'

/**
 * 判断值是否为有限数字（类型谓词，供 tsc 收窄）。
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 把任意数值夹取到 `[min, max]`；非有限值回退到 `min`。
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampNumber(value, min, max) {
  if (!isFiniteNumber(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * 构造 `--limit` 的参数错误（消息文本被 T01 交付标准逐字断言）。
 * @returns {InterceptError}
 */
function limitError() {
  return new InterceptError(
    ERROR_CODES.ARG_INVALID,
    `参数 --limit 必须是 ${LIMIT_MIN}..${LIMIT_MAX} 的整数`,
    {
      hint: `例如 --limit ${DEFAULT_LIMIT}；允许范围 ${LIMIT_MIN}~${LIMIT_MAX}`,
    },
  )
}

/**
 * 解析并校验 `--limit`，非法输入抛 `ARG_INVALID`。
 * @param {unknown} raw
 * @returns {number}
 */
export function parseLimit(raw) {
  if (isFiniteNumber(raw) && Number.isInteger(raw)) {
    if (raw < LIMIT_MIN || raw > LIMIT_MAX) throw limitError()
    return raw
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (parsed >= LIMIT_MIN && parsed <= LIMIT_MAX) return parsed
    }
  }
  throw limitError()
}

/**
 * 把任意值夹取为合法 `limit`（用于内部默认值，不抛错）。
 * @param {unknown} value
 * @returns {number}
 */
export function clampLimit(value) {
  const numeric = typeof value === 'string' ? Number(value) : value
  const base = isFiniteNumber(numeric) ? Math.trunc(numeric) : DEFAULT_LIMIT
  return clampNumber(base, LIMIT_MIN, LIMIT_MAX)
}

/**
 * 解析状态根目录：优先 `$DSH_HOME`，否则 `~/.dsh`。
 * @param {Record<string, string | undefined>} [env]
 * @returns {string} 绝对路径，形如 `/Users/x/.dsh/omnimux-intercept`
 */
export function resolveStateRoot(env = process.env) {
  const fromEnv = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  const base = fromEnv || path.join(os.homedir(), '.dsh')
  return path.join(base, STATE_DIR_NAME)
}

/**
 * 三档分级的强度序号（越大越强）。
 * @param {unknown} tier
 * @returns {number} `0..2`；未知分级返回 `-1`
 */
export function tierRank(tier) {
  return TIER_ORDER.indexOf(/** @type {'normal'|'surging'|'viral'} */ (tier))
}

/**
 * 判断某分级是否达到最低分级要求（`--min-tier`）。
 * @param {unknown} tier 当前分级
 * @param {unknown} minTier 最低分级
 * @returns {boolean}
 */
export function meetsMinTier(tier, minTier) {
  const current = tierRank(tier)
  const floor = tierRank(minTier)
  if (floor < 0) return true
  return current >= 0 && current >= floor
}

/**
 * 校验并归一 `--type`。
 * @param {unknown} raw
 * @returns {'for-you' | 'following'}
 */
export function parseTimelineType(raw) {
  if (raw === 'following' || raw === 'for-you') return raw
  throw new InterceptError(
    ERROR_CODES.ARG_INVALID,
    '参数 --type 必须是 for-you 或 following',
    { hint: '例如 --type for-you（默认）或 --type following' },
  )
}

/**
 * 校验并归一 `--rank-by`。
 * @param {unknown} raw
 * @returns {'exposure' | 'pace'}
 */
export function parseRankBy(raw) {
  if (raw === 'exposure' || raw === 'pace') return raw
  throw new InterceptError(
    ERROR_CODES.ARG_INVALID,
    '参数 --rank-by 必须是 exposure 或 pace',
    { hint: '例如 --rank-by exposure（默认，按预估曝光）或 --rank-by pace（按时速）' },
  )
}

/**
 * 校验并归一 `--min-tier`。
 * @param {unknown} raw
 * @returns {'normal' | 'surging' | 'viral'}
 */
export function parseMinTier(raw) {
  if (raw === 'normal' || raw === 'surging' || raw === 'viral') return raw
  throw new InterceptError(
    ERROR_CODES.ARG_INVALID,
    '参数 --min-tier 必须是 normal、surging 或 viral',
    { hint: '例如 --min-tier surging（默认）' },
  )
}

/**
 * 解析并校验 `--min-exposure`（预估曝光下限，非负整数）。
 * @param {unknown} raw
 * @returns {number}
 */
export function parseMinExposure(raw) {
  const numeric = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (isFiniteNumber(numeric) && Number.isInteger(numeric) && numeric >= 0) {
    return numeric
  }
  throw new InterceptError(
    ERROR_CODES.ARG_INVALID,
    '参数 --min-exposure 必须是大于等于 0 的整数',
    { hint: '例如 --min-exposure 100；默认 0 表示不过滤' },
  )
}

/**
 * 校验并归一数据源（`--source`）。
 * @param {unknown} raw
 * @returns {'opencli' | 'hub' | 'fixture'}
 */
export function parseSource(raw) {
  if (raw === 'opencli' || raw === 'hub' || raw === 'fixture') return raw
  throw new InterceptError(
    ERROR_CODES.ARG_INVALID,
    '参数 --source 必须是 opencli、hub 或 fixture',
    { hint: '例如 --source opencli（默认）；测试可用 --source fixture --fixture <路径>' },
  )
}

/**
 * 解析并校验 `--format`。
 * @param {unknown} raw
 * @returns {'table' | 'json' | 'genui' | 'md'}
 */
export function parseFormat(raw) {
  if (raw === 'table' || raw === 'json' || raw === 'genui' || raw === 'md') return raw
  throw new InterceptError(
    ERROR_CODES.ARG_INVALID,
    '参数 --format 必须是 table、json、genui 或 md',
    { hint: '例如 --format table（默认）；--format genui 输出看板 spec' },
  )
}

/**
 * 组装生效配置：默认值 → 覆盖值 → 夹取。
 * @param {ConfigOverrides} [overrides]
 * @param {Record<string, string | undefined>} [env]
 * @returns {ResolvedConfig}
 */
export function resolveConfig(overrides = {}, env = process.env) {
  const stateRoot =
    typeof overrides.stateRoot === 'string' && overrides.stateRoot.trim()
      ? overrides.stateRoot.trim()
      : resolveStateRoot(env)

  return {
    limit: clampLimit(overrides.limit ?? DEFAULTS.limit),
    type: overrides.type === 'following' ? 'following' : DEFAULT_TYPE,
    rankBy: overrides.rankBy === 'pace' ? 'pace' : DEFAULT_RANK_BY,
    minTier: tierRank(overrides.minTier) >= 0 ? /** @type {'normal'|'surging'|'viral'} */ (overrides.minTier) : DEFAULT_MIN_TIER,
    minExposure: clampNumber(
      isFiniteNumber(overrides.minExposure) ? overrides.minExposure : DEFAULT_MIN_EXPOSURE,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    cooldownMs: clampNumber(overrides.cooldownMs ?? COOLDOWN_MS, 0, Number.MAX_SAFE_INTEGER),
    retryAttempts: clampNumber(
      isFiniteNumber(overrides.retryAttempts) ? Math.trunc(overrides.retryAttempts) : RETRY_ATTEMPTS,
      0,
      10,
    ),
    retryBaseDelayMs: clampNumber(overrides.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS, 0, 600_000),
    timeoutMs: clampNumber(overrides.timeoutMs ?? TIMEOUT_MS, 1, 600_000),
    maxTweets: clampNumber(overrides.maxTweets ?? MAX_TWEETS, 1, 10_000),
    chunkDelayMs: clampNumber(overrides.chunkDelayMs ?? CHUNK_DELAY_MS, 0, 600_000),
    source: parseSourceQuietly(overrides.source),
    stateRoot,
  }
}

/**
 * 宽容版数据源归一（配置装配用，不抛错）。
 * @param {unknown} raw
 * @returns {'opencli' | 'hub' | 'fixture'}
 */
function parseSourceQuietly(raw) {
  if (raw === 'hub' || raw === 'fixture' || raw === 'opencli') return raw
  return 'opencli'
}
