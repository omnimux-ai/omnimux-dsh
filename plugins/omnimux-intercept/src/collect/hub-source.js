/**
 * @file OmniMux hub 社媒数据降级适配。
 *
 * 仅在主源（OpenCLI）不可用、或调用方显式要求按单条/指定作者取数时使用。
 * 主链路不依赖它，避免引入 key 依赖。
 *
 * 契约：宿主工具 `omnimux_social_data`（`docs/contracts/hub.md`），
 * `platform=x` + capability `x/tweet` / `x/user-tweets`，返回 `{code, data}` 信封。
 *
 * 本文件**不直接调用宿主**：一律经注入的 `request` 触达，单测注入假实现即可全绿。
 */

import { DEFAULT_LIMIT, clampLimit } from '../config.js'
import { ERROR_CODES, InterceptError } from '../core/errors.js'
import { normalizeRecords } from './tweet.js'

/** 宿主工具名（hub seam）。 */
export const HUB_TOOL_NAME = 'omnimux_social_data'

/** 平台标识。 */
export const HUB_PLATFORM = 'x'

/** 首页时间线对应的 capability。 */
export const HUB_TIMELINE_CAPABILITY = 'x/user-tweets'

/** 单条推文对应的 capability。 */
export const HUB_TWEET_CAPABILITY = 'x/tweet'

/**
 * 构造 hub 请求参数。
 * @param {{ limit?: number, type?: 'for-you' | 'following', author?: string, tweetId?: string }} [options] 抓取选项
 * @returns {{ platform: string, capability: string, params: Record<string, unknown> }} 请求参数
 */
export function buildHubRequest(options = {}) {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT)
  const params = /** @type {Record<string, unknown>} */ ({
    limit,
    timeline: options.type === 'following' ? 'following' : 'for-you',
  })
  if (typeof options.author === 'string' && options.author.trim() !== '') {
    params.author = options.author.trim()
  }
  if (typeof options.tweetId === 'string' && options.tweetId.trim() !== '') {
    params.tweetId = options.tweetId.trim()
  }

  return {
    platform: HUB_PLATFORM,
    capability:
      typeof options.tweetId === 'string' && options.tweetId.trim() !== ''
        ? HUB_TWEET_CAPABILITY
        : HUB_TIMELINE_CAPABILITY,
    params,
  }
}

/**
 * 拆开 `{code, data}` 信封，取出记录数组。
 *
 * `code !== 0` 一律抛 `SOURCE_UNAVAILABLE`（**不返回空数组**）。
 * @param {unknown} payload 宿主返回原文
 * @returns {unknown[]} 记录数组
 */
export function unwrapEnvelope(payload) {
  if (Array.isArray(payload)) return payload
  if (payload === null || typeof payload !== 'object') {
    throw new InterceptError(ERROR_CODES.SOURCE_BAD_PAYLOAD, 'OmniMux 社媒数据返回结构无法识别', {
      hint: '确认宿主 omnimux 插件已启用且版本支持 omnimux_social_data；或改用 --source opencli',
      retryable: false,
    })
  }

  const envelope = /** @type {Record<string, unknown>} */ (payload)
  const code = envelope.code

  if (typeof code === 'number' && code !== 0) {
    const message = typeof envelope.message === 'string' ? envelope.message : `code=${code}`
    throw new InterceptError(
      ERROR_CODES.SOURCE_UNAVAILABLE,
      `OmniMux 社媒数据不可用：${message}`,
      {
        hint: '检查宿主 omnimux 插件的社媒数据通道（密钥/额度），或改用 --source opencli',
        retryable: true,
      },
    )
  }

  const data = envelope.data ?? envelope
  if (Array.isArray(data)) return data
  if (data !== null && typeof data === 'object') {
    const record = /** @type {Record<string, unknown>} */ (data)
    for (const key of ['items', 'tweets', 'results', 'list']) {
      if (Array.isArray(record[key])) return /** @type {unknown[]} */ (record[key])
    }
    // 单条推文场景：data 本身就是一条记录。
    return [data]
  }

  throw new InterceptError(ERROR_CODES.SOURCE_BAD_PAYLOAD, 'OmniMux 社媒数据返回的 data 不是数组', {
    hint: '确认 capability 与 platform 参数正确（platform=x）；或改用 --source opencli',
    retryable: false,
  })
}

/**
 * 经注入的 `request` 从 hub 取数并归一为 `TweetRecord[]`。
 * @param {{
 *   limit?: number,
 *   type?: 'for-you' | 'following',
 *   author?: string,
 *   tweetId?: string,
 *   nowMs?: number,
 * }} options 抓取选项（`nowMs` 必填，由 pipeline 的单一入口注入）
 * @param {{
 *   request: (tool: string, args: object) => Promise<unknown>,
 *   nowMs?: number,
 * }} deps 注入依赖
 * @returns {Promise<{
 *   records: import('./tweet.js').TweetRecord[],
 *   source: 'hub',
 *   fetchedAtMs: number,
 *   rawCount: number,
 *   warnings: string[],
 * }>}
 */
export async function fetchTimelineFromHub(options, deps) {
  if (typeof deps?.request !== 'function') {
    throw new InterceptError(
      ERROR_CODES.INTERNAL,
      'fetchTimelineFromHub 需要注入 request 依赖',
      { hint: '这是内部缺陷：request 由宿主或 cli.js 装配，请提交 issue' },
    )
  }

  const candidate = options?.nowMs ?? deps?.nowMs
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new InterceptError(ERROR_CODES.INTERNAL, '采集层缺少显式注入的 nowMs', {
      hint: '这是内部缺陷：nowMs 必须由 pipeline.js 单一时钟入口注入（§7.1 时间纪律）',
    })
  }

  const limit = clampLimit(options?.limit ?? DEFAULT_LIMIT)
  const request = buildHubRequest({ ...options, limit })

  /** @type {unknown} */
  let payload
  try {
    payload = await deps.request(HUB_TOOL_NAME, request)
  } catch (error) {
    if (error instanceof InterceptError) throw error
    throw new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, '调用 OmniMux 社媒数据失败', {
      hint: '确认宿主 omnimux 插件已启用；或改用 --source opencli',
      retryable: true,
      cause: error,
    })
  }

  const items = unwrapEnvelope(payload)
  const warnings = []
  let selected = items
  if (items.length > limit) {
    selected = items.slice(0, limit)
    warnings.push(`hub 返回 ${items.length} 条，已按 --limit ${limit} 截断`)
  }

  return {
    records: normalizeRecords(selected, candidate, 'hub'),
    source: 'hub',
    fetchedAtMs: candidate,
    rawCount: items.length,
    warnings,
  }
}
