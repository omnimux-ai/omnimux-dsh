/**
 * @file 采集编排 —— 组装数据源、施加条数硬上限与窗口限流，收口全部异常边界。
 *
 * 分层职责：本文件只负责「把外部世界变成 `TweetRecord[]`」，**一行业务公式都不写**。
 * 全部外部触达都经注入依赖（`run` / `request` / `readFile` / `sleep`），单测零网络零子进程。
 */

import { MAX_TWEETS, clampLimit } from '../config.js'
import { ERROR_CODES, InterceptError, isInterceptError } from '../core/errors.js'
import { fetchTimelineFromHub } from './hub-source.js'
import { fetchTimelineFromOpencli } from './opencli-source.js'
import { normalizeRecords } from './tweet.js'

/**
 * 采集结果（三个数据源共用同一形状）。
 * @typedef {object} TimelineFetchResult
 * @property {import('./tweet.js').TweetRecord[]} records 规范实体
 * @property {'opencli' | 'hub' | 'fixture'} source 实际使用的数据源
 * @property {number} fetchedAtMs 抓取时刻（epoch ms）
 * @property {number} rawCount 源返回的原始条数（截断前）
 * @property {string[]} warnings 全部非致命降级留痕
 */

/** 支持的数据源。 @type {ReadonlyArray<'opencli' | 'hub' | 'fixture'>} */
export const SOURCE_KINDS = Object.freeze(['opencli', 'hub', 'fixture'])

/**
 * 施加条数硬上限（`maxTweets`），超出部分截断并留痕。
 * @param {TimelineFetchResult} result 采集结果
 * @param {{ maxTweets?: number }} config 生效配置
 * @returns {TimelineFetchResult} 新结果（不修改入参）
 */
export function applyCaps(result, config = {}) {
  const maxTweets =
    typeof config.maxTweets === 'number' && Number.isFinite(config.maxTweets)
      ? Math.max(1, Math.trunc(config.maxTweets))
      : MAX_TWEETS

  if (result.records.length <= maxTweets) return result

  return {
    ...result,
    records: result.records.slice(0, maxTweets),
    warnings: result.warnings.concat([
      `采集 ${result.records.length} 条超过单次运行硬上限 ${maxTweets} 条，已截断`,
    ]),
  }
}

/**
 * 从本地夹具文件读取时间线（`--source fixture`，供离线验收与回归使用）。
 * @param {{ fixturePath?: string, limit?: number, nowMs?: number }} options 抓取选项
 * @param {{ readFile: (p: string) => Promise<string>, nowMs?: number }} deps 注入依赖
 * @returns {Promise<TimelineFetchResult>}
 */
export async function fetchTimelineFromFixture(options, deps) {
  const fixturePath = typeof options?.fixturePath === 'string' ? options.fixturePath.trim() : ''
  if (fixturePath === '') {
    throw new InterceptError(ERROR_CODES.ARG_INVALID, '--source fixture 必须同时提供 --fixture <路径>', {
      hint: '例如 --source fixture --fixture plugins/omnimux-intercept/test/fixtures/timeline.json',
    })
  }
  if (typeof deps?.readFile !== 'function') {
    throw new InterceptError(ERROR_CODES.INTERNAL, 'fetchTimelineFromFixture 需要注入 readFile 依赖', {
      hint: '这是内部缺陷：readFile 只在 src/cli.js 装配，请提交 issue',
    })
  }

  const nowMs = options?.nowMs ?? deps?.nowMs
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    throw new InterceptError(ERROR_CODES.INTERNAL, '采集层缺少显式注入的 nowMs', {
      hint: '这是内部缺陷：nowMs 必须由 pipeline.js 单一时钟入口注入（§7.1 时间纪律）',
    })
  }

  let text = ''
  try {
    text = await deps.readFile(fixturePath)
  } catch (error) {
    throw new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, `夹具文件读取失败：${fixturePath}`, {
      hint: '确认 --fixture 路径存在且可读；仓库内置夹具在 plugins/omnimux-intercept/test/fixtures/',
      retryable: false,
      cause: error,
    })
  }

  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new InterceptError(ERROR_CODES.SOURCE_BAD_PAYLOAD, `夹具文件不是合法 JSON：${fixturePath}`, {
      hint: '修正夹具文件的 JSON 语法后重试',
      retryable: false,
      cause: error,
    })
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object' && Array.isArray(/** @type {any} */ (parsed).data)
      ? /** @type {any[]} */ (/** @type {any} */ (parsed).data)
      : null

  if (items === null) {
    throw new InterceptError(ERROR_CODES.SOURCE_BAD_PAYLOAD, '夹具文件既不是数组，也不含 data 数组', {
      hint: '夹具顶层应为记录数组，或形如 { "data": [ ... ] }',
      retryable: false,
    })
  }

  const limit = clampLimit(options?.limit ?? items.length)
  const selected = items.length > limit ? items.slice(0, limit) : items
  const warnings =
    items.length > limit ? [`夹具提供 ${items.length} 条，已按 --limit ${limit} 截断`] : []

  return {
    records: normalizeRecords(selected, nowMs, 'fixture'),
    source: 'fixture',
    fetchedAtMs: nowMs,
    rawCount: items.length,
    warnings,
  }
}

/**
 * 采集入口：按 `source` 分派，主源失败时可选降级到 hub。
 *
 * 降级**必须留痕**（`warnings` 记录降级原因），不允许静默降级。
 * @param {{
 *   source?: 'opencli' | 'hub' | 'fixture',
 *   limit?: number,
 *   type?: 'for-you' | 'following',
 *   nowMs?: number,
 *   timeoutMs?: number,
 *   maxTweets?: number,
 *   chunkDelayMs?: number,
 *   fixturePath?: string,
 *   allowHubFallback?: boolean,
 *   signal?: AbortSignal,
 * }} options 抓取选项
 * @param {{
 *   run?: (argv: string[], options: { timeoutMs: number, signal?: AbortSignal }) => Promise<{ stdout: string, stderr: string, code: number }>,
 *   request?: (tool: string, args: object) => Promise<unknown>,
 *   readFile?: (p: string) => Promise<string>,
 *   sleep?: (ms: number) => Promise<void>,
 *   nowMs?: number,
 * }} deps 注入依赖
 * @returns {Promise<TimelineFetchResult>}
 */
export async function fetchTimeline(options, deps = {}) {
  const source = options?.source ?? 'opencli'
  const config = { maxTweets: options?.maxTweets ?? MAX_TWEETS }

  if (source === 'fixture') {
    const result = await fetchTimelineFromFixture(options, {
      readFile: /** @type {(p: string) => Promise<string>} */ (deps.readFile),
      ...(deps.nowMs === undefined ? {} : { nowMs: deps.nowMs }),
    })
    return applyCaps(result, config)
  }

  if (source === 'hub') {
    const result = await fetchTimelineFromHub(options, {
      request: /** @type {(tool: string, args: object) => Promise<unknown>} */ (deps.request),
      ...(deps.nowMs === undefined ? {} : { nowMs: deps.nowMs }),
    })
    return applyCaps(result, config)
  }

  try {
    const result = await fetchTimelineFromOpencli(options, {
      run: /** @type {any} */ (deps.run),
      ...(deps.nowMs === undefined ? {} : { nowMs: deps.nowMs }),
    })
    return applyCaps(result, config)
  } catch (error) {
    const canFallback =
      options?.allowHubFallback !== false &&
      typeof deps.request === 'function' &&
      isInterceptError(error) &&
      (error.code === ERROR_CODES.SOURCE_UNAVAILABLE || error.code === ERROR_CODES.SOURCE_AUTH)

    if (!canFallback) throw error

    const primary = /** @type {InterceptError} */ (error)
    const fallback = await fetchTimelineFromHub(options, {
      request: /** @type {(tool: string, args: object) => Promise<unknown>} */ (deps.request),
      ...(deps.nowMs === undefined ? {} : { nowMs: deps.nowMs }),
    })

    return applyCaps(
      {
        ...fallback,
        warnings: fallback.warnings.concat([
          `主数据源 OpenCLI 不可用（${primary.code}：${primary.message}），已降级到 OmniMux hub 社媒数据`,
        ]),
      },
      config,
    )
  }
}
