/**
 * @file 数值归一与空值语义 —— `null` 与 `0` 在此严格区分。
 *
 * `null` = 「源未提供」；`0` = 「源明确给了 0」。
 * 两者进入算法时都按 0 参与计算，但输出层必须显示为 `—` 与 `0` 两种不同结果。
 *
 * 本文件属 `src/core/**`：不得 import 任何 `node:*` 模块，不得访问时钟。
 */

/** 空值显示符。 */
export const EMPTY_DISPLAY = '—'

/**
 * 判断值是否为有限数字（字符串不在此列，字符串走 `parseMetric`）。
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 把值归一为有限数字；任何非有限数字一律返回 `null`。
 * @param {unknown} value
 * @returns {number | null}
 */
export function safeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return null
}

/**
 * 把数值夹取到 `[min, max]`。非有限值回退到 `min`（保证输出恒可计算）。
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  const numeric = safeNumber(value)
  if (numeric === null) return min
  if (numeric < min) return min
  if (numeric > max) return max
  return numeric
}

/**
 * 把 `null` / 非法值按 0 处理（仅用于参与计算，不改变原始实体）。
 * @param {unknown} value
 * @returns {number}
 */
export function nullToZero(value) {
  return safeNumber(value) ?? 0
}

/**
 * 输出前的有限性兜底：非法值按契约回退到 `fallback`。
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export function finiteOr(value, fallback) {
  return safeNumber(value) ?? fallback
}

/**
 * 数值展示：超过 1 万用「万」，保留 1 位小数并去掉多余的 `.0`。
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatNumber(value) {
  const numeric = safeNumber(value)
  if (numeric === null) return EMPTY_DISPLAY
  const absolute = Math.abs(numeric)
  if (absolute >= 10_000) {
    const scaled = numeric / 10_000
    const text = scaled.toFixed(1)
    return `${text.endsWith('.0') ? text.slice(0, -2) : text}万`
  }
  return String(Math.round(numeric))
}
