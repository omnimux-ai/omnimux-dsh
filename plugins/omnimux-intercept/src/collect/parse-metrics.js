/**
 * @file 脏数值字符串解析（`1.2k` / `3.4m` / `1.1b` / `12.7万` / `1,234`）。
 *
 * 解析失败**返回 `null` 且不吞错**：静默转 0 会把爆款判成哑帖，是本系统最严重的业务事故。
 * 归零动作发生在算法层（`nullToZero`），并必须伴随 `VIEWS_UNPARSEABLE` 标记透传到输出层。
 *
 * 本文件属 `src/collect/**`，但**是纯函数**：零 I/O、零时钟、零子进程，可被 `core` 之外的任何层复用。
 */

/**
 * 单位后缀 → 乘数。同时支持半角（k/m/b）与中文（万/千/亿）以及 `w`（中文语境下的「万」）。
 * @type {Readonly<Record<string, number>>}
 */
export const UNIT_MULTIPLIERS = Object.freeze({
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  b: 1_000_000_000,
  B: 1_000_000_000,
  w: 10_000,
  W: 10_000,
  千: 1_000,
  万: 10_000,
  亿: 100_000_000,
})

/**
 * 语义上等于「源未提供」的占位值（统一按 VIEWS_MISSING 处理，而非解析失败）。
 * @type {ReadonlySet<string>}
 */
export const MISSING_PLACEHOLDERS = Object.freeze(
  new Set(['', '—', '–', '-', '--', 'n/a', 'na', 'null', 'undefined', 'none', 'nan', '无']),
)

/** 纯数字形状（已剥离单位与分隔符）。 */
const NUMERIC_SHAPE = /^[+-]?\d+(?:\.\d+)?$/

/**
 * 全角字符 → 半角（数字、逗号、句点、正负号）。中文单位不受影响。
 * @param {string} text
 * @returns {string}
 */
export function toHalfWidth(text) {
  return text
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\uFF0C/g, ',')
    .replace(/\uFF0E/g, '.')
    .replace(/\uFF0B/g, '+')
    .replace(/\uFF0D/g, '-')
    .replace(/\u3000/g, ' ')
}

/**
 * 判断原始值是否**语义上缺失**（字段不存在 / null / 空串 / 占位符）。
 * 缺失 → `VIEWS_MISSING`；非缺失但解析不出 → `VIEWS_UNPARSEABLE`。
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isMissingValue(raw) {
  if (raw === null || raw === undefined) return true
  if (typeof raw === 'string') {
    return MISSING_PLACEHOLDERS.has(toHalfWidth(raw).trim().toLowerCase())
  }
  return false
}

/**
 * 解析脏数值：`'1.2k' → 1200`、`'3.4m' → 3400000`、`'12.7万' → 127000`、`'1,234' → 1234`。
 *
 * 返回 `null` 的全部情形：空串 / 占位符 / 非数字串 / 负数 / 非有限数 / 不支持的类型。
 * @param {unknown} raw
 * @returns {number | null} 非负整数，或 `null`
 */
export function parseMetric(raw) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null
    return Math.round(raw)
  }
  if (typeof raw === 'bigint') {
    if (raw < 0n) return null
    const numeric = Number(raw)
    return Number.isFinite(numeric) ? numeric : null
  }
  if (typeof raw !== 'string') return null

  let text = toHalfWidth(raw).trim()
  if (text === '') return null
  if (MISSING_PLACEHOLDERS.has(text.toLowerCase())) return null

  // 千分位逗号、下划线、空白一律剥离。
  text = text.replace(/[\s,_]/g, '')
  if (text === '') return null

  let multiplier = 1
  const suffix = text.slice(-1)
  if (Object.prototype.hasOwnProperty.call(UNIT_MULTIPLIERS, suffix)) {
    multiplier = UNIT_MULTIPLIERS[suffix] ?? 1
    text = text.slice(0, -1)
  }

  if (!NUMERIC_SHAPE.test(text)) return null

  const base = Number(text)
  if (!Number.isFinite(base)) return null

  const value = base * multiplier
  if (!Number.isFinite(value) || value < 0) return null

  return Math.round(value)
}

/**
 * 解析并给出数据缺陷标记（数据面只有 `views` 有专属标记，见 `DataAnomaly` 联合类型）。
 * @param {unknown} raw
 * @returns {{ value: number | null, anomaly: 'VIEWS_MISSING' | 'VIEWS_UNPARSEABLE' | null }}
 */
export function parseMetricWithAnomaly(raw) {
  const value = parseMetric(raw)
  if (value !== null) return { value, anomaly: null }
  return {
    value: null,
    anomaly: isMissingValue(raw) ? 'VIEWS_MISSING' : 'VIEWS_UNPARSEABLE',
  }
}

/**
 * 解析点赞 / 转推 / 回复等指标：解析不出就是 `null`（源未提供），不编造 0。
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseOptionalMetric(raw) {
  return parseMetric(raw)
}
