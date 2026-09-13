/**
 * @file 安全护栏 —— 唯一「敢拦人」的地方：请求冷却、指数退避、窗口限流。
 *
 * 本文件不属于 `src/core/**`：允许使用 `setTimeout` 等宿主能力，
 * 但**不允许**出现任何业务公式（公式只允许出现在 `src/core/algorithm.js`）。
 * 时钟仍然由调用方注入 `nowMs`，保证单测确定性。
 */

import { COOLDOWN_MS, RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from './config.js'
import { isInterceptError, isRetryableError } from './core/errors.js'

/**
 * 冷却判定结果。
 * @typedef {object} GuardDecision
 * @property {boolean} allowed 是否放行
 * @property {'cooldown-active' | 'window-limit'} [reason] 拒绝原因
 * @property {number} [waitMs] 还需等待的毫秒数
 * @property {number} [lastRunAtMs] 上次运行时刻（epoch ms）
 */

/**
 * 抖动比例：±20%。
 */
export const JITTER_RATIO = 0.2

/**
 * 默认休眠实现。
 * @param {number} ms 毫秒
 * @returns {Promise<void>}
 */
export function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms))
  })
}

/**
 * 计算第 `retryIndex` 次重试的退避延时（含 ±20% 抖动）。
 *
 * `retryIndex` 从 1 开始：`1000 / 2000 / 4000`（base = 1000）。
 * @param {number} retryIndex 第几次重试（1 起）
 * @param {number} baseDelayMs 基础延时
 * @param {() => number} random 随机数发生器（注入以便测试确定化）
 * @returns {number} 实际延时（毫秒，四舍五入后的非负整数）
 */
export function computeBackoffDelay(retryIndex, baseDelayMs, random) {
  const index = Number.isFinite(retryIndex) && retryIndex > 0 ? Math.trunc(retryIndex) : 1
  const base = Number.isFinite(baseDelayMs) && baseDelayMs > 0 ? baseDelayMs : RETRY_BASE_DELAY_MS
  const raw = base * 2 ** (index - 1)
  const sample = typeof random === 'function' ? random() : 0.5
  const factor = 1 + (sample * 2 - 1) * JITTER_RATIO
  return Math.max(0, Math.round(raw * factor))
}

/**
 * 冷却闸：距上次运行不足 `cooldownMs` 时拒绝运行。
 *
 * 时钟回拨（`nowMs < lastRunAtMs`）也判为冷却中，等待时间按绝对值累加，
 * 避免「系统时间被改小 → 绕过冷却」。
 * @param {{ lastRunAtMs?: number | null }} state 持久化状态
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @param {{ cooldownMs?: number }} config 生效配置
 * @returns {GuardDecision}
 */
export function checkCooldown(state, nowMs, config) {
  const lastRunAtMs = state?.lastRunAtMs
  const rawCooldown = config?.cooldownMs
  const cooldownMs =
    typeof rawCooldown === 'number' && Number.isFinite(rawCooldown) ? rawCooldown : COOLDOWN_MS

  if (typeof lastRunAtMs !== 'number' || !Number.isFinite(lastRunAtMs)) {
    return { allowed: true }
  }
  if (cooldownMs <= 0) return { allowed: true, lastRunAtMs }

  const now = Number.isFinite(nowMs) ? nowMs : 0
  const elapsed = now - lastRunAtMs
  if (elapsed >= cooldownMs) return { allowed: true, lastRunAtMs }

  return {
    allowed: false,
    reason: 'cooldown-active',
    waitMs: cooldownMs - elapsed,
    lastRunAtMs,
  }
}

/**
 * 把冷却判定翻译成用户可读的一行提示（T05 交付标准逐字断言该文案）。
 *
 * 形如：`距上次运行 87 秒，冷却 90 秒；加 --force 强制`
 * @param {GuardDecision} decision 冷却判定
 * @param {{ cooldownMs?: number, nowMs?: number }} context 生效配置与当前时刻
 * @returns {string}
 */
export function describeCooldown(decision, context) {
  const cooldownMs = Number.isFinite(context?.cooldownMs)
    ? Number(context.cooldownMs)
    : COOLDOWN_MS
  const nowMs = Number.isFinite(context?.nowMs) ? Number(context.nowMs) : 0
  const lastRunAtMs = Number.isFinite(decision?.lastRunAtMs)
    ? Number(decision.lastRunAtMs)
    : nowMs
  const elapsedSec = Math.max(0, Math.round((nowMs - lastRunAtMs) / 1000))
  const cooldownSec = Math.round(cooldownMs / 1000)
  return `距上次运行 ${elapsedSec} 秒，冷却 ${cooldownSec} 秒；加 --force 强制`
}

/**
 * 指数退避重试。仅对 `isRetryable` 判定为可重试的错误重试。
 *
 * 语义：`attempts` 为**重试次数**（不含首次尝试），故总调用次数为 `attempts + 1`；
 * `attempts = 3` 时休眠序列为 `[1000, 2000, 4000]`（±抖动），第 4 次失败后不再重试。
 * @template T
 * @param {() => Promise<T>} fn 待执行操作
 * @param {{
 *   attempts?: number,
 *   baseDelayMs?: number,
 *   isRetryable?: (error: unknown) => boolean,
 *   sleep?: (ms: number) => Promise<void>,
 *   random?: () => number,
 *   onRetry?: (info: { attempt: number, delayMs: number, error: unknown }) => void,
 * }} [options]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const attempts = Number.isFinite(options.attempts)
    ? Math.max(0, Math.trunc(Number(options.attempts)))
    : RETRY_ATTEMPTS
  const baseDelayMs = Number.isFinite(options.baseDelayMs)
    ? Number(options.baseDelayMs)
    : RETRY_BASE_DELAY_MS
  const isRetryable =
    typeof options.isRetryable === 'function' ? options.isRetryable : isRetryableError
  const sleep = typeof options.sleep === 'function' ? options.sleep : defaultSleep
  const random = typeof options.random === 'function' ? options.random : Math.random
  const onRetry = options.onRetry

  let lastError
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const canRetry = attempt < attempts && isRetryable(error)
      if (!canRetry) throw error
      const delayMs = computeBackoffDelay(attempt + 1, baseDelayMs, random)
      if (typeof onRetry === 'function') {
        onRetry({ attempt: attempt + 1, delayMs, error })
      }
      await sleep(delayMs)
    }
  }
  throw lastError
}

/**
 * 跨批次抓取的窗口限流：两批之间强制间隔 `chunkDelayMs`。
 * @param {{ chunkDelayMs?: number }} config 生效配置
 * @param {(ms: number) => Promise<void>} [sleep] 休眠实现
 * @returns {Promise<void>}
 */
export async function respectChunkDelay(config, sleep) {
  const delay = Number.isFinite(config?.chunkDelayMs) ? Number(config.chunkDelayMs) : 0
  if (delay <= 0) return
  const wait = typeof sleep === 'function' ? sleep : defaultSleep
  await wait(delay)
}

/**
 * 判断错误是否为可重试的 `InterceptError`（对外复用，方便装配层统一判定）。
 * @param {unknown} error
 * @returns {boolean}
 */
export function shouldRetry(error) {
  if (!isInterceptError(error)) return false
  return isRetryableError(error)
}
