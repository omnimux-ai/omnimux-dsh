/**
 * @file 配置与默认值 —— 限额、超时、缓存、存储目录的唯一定义处。
 * 允许读环境变量与 node:path；不含业务公式。
 */

import path from 'node:path'

/** limit 下界。 */
export const LIMIT_MIN = 1
/** limit 上界（防风控与超长输出）。 */
export const LIMIT_MAX = 50
/** 默认条数。 */
export const DEFAULT_LIMIT = 15
/** 采集子进程超时（毫秒）。 */
export const HARVEST_TIMEOUT_MS = 60_000
/** 登录等待超时（毫秒）：人工在浏览器完成登录，给足时间。 */
export const LOGIN_TIMEOUT_MS = 300_000
/** whoami 登录态缓存（毫秒）。 */
export const STATUS_CACHE_TTL_MS = 60_000
/** 状态目录名（相对 $DSH_HOME）。 */
export const STATE_DIR_NAME = 'omnimux-social-harvest'

/**
 * 夹取 limit 到 [LIMIT_MIN, LIMIT_MAX]。
 * @param {unknown} value
 * @returns {number}
 */
export function clampLimit(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : DEFAULT_LIMIT
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, n))
}

/**
 * 插件状态根目录：$DSH_HOME/omnimux-social-harvest（产品自建目录，符合基线）。
 * @returns {string}
 */
export function stateDir() {
  const home = process.env.DSH_HOME
  if (!home) throw new Error('omnimux-social-harvest requires explicit DSH_HOME')
  return path.join(home, STATE_DIR_NAME)
}
