/**
 * @file 模型调用装配 —— 三级降级阶梯的「第二 / 第三通道」装配处。
 *
 * - 第一通道：宿主注入的 `complete()`（`omnimux_text_complete` / `ctx.llm.stream`）
 * - 第二通道：HTTP 直连 `/v1/chat/completions`（凭据来自 `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN`
 *   或 `$DSH_HOME/.credentials.yaml`）
 * - 第三通道：内置离线模板（在 `comment-service.js` 内触发）
 *
 * 本文件是 `src/comment/**` 中**唯一允许发 HTTP 请求**的模块，且必须走注入的 `fetcher`，
 * 保证单测可以在零网络下全绿。
 */

import { ERROR_CODES, InterceptError } from '../core/errors.js'

/** 默认 API 基址。 */
export const DEFAULT_BASE_URL = 'https://api.omnimux.ai'

/** 默认模型标识。 */
export const DEFAULT_MODEL = 'omnimux-default'

/** 默认采样上限。 */
export const DEFAULT_MAX_TOKENS = 1024

/**
 * 模型补全函数签名。
 * @typedef {(input: { system: string, prompt: string, maxTokens?: number, signal?: AbortSignal }) => Promise<string>} CompleteFn
 */

/**
 * 从 `.credentials.yaml` 文本中提取 OmniMux 凭据（键名级匹配，不引入 YAML 依赖）。
 * @param {unknown} text 凭据文件原文
 * @returns {string} 凭据值；未找到返回空串
 */
export function parseCredentialsText(text) {
  if (typeof text !== 'string' || text.trim() === '') return ''
  const patterns = [
    /^\s*OMNIMUX_API_KEY\s*:\s*["']?([^"'\s#]+)/m,
    /^\s*OMNIMUX_TOKEN\s*:\s*["']?([^"'\s#]+)/m,
    /^\s*api[_-]?key\s*:\s*["']?([^"'\s#]+)/mi,
    /^\s*omnimux[_-]?api[_-]?key\s*:\s*["']?([^"'\s#]+)/mi,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match?.[1]) return match[1]
  }
  return ''
}

/**
 * 解析可用凭据：环境变量优先，其次 `.credentials.yaml` 注入文本。
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   credentialsText?: string,
 * }} [deps] 注入依赖
 * @returns {string} 凭据；不可用返回空串
 */
export function resolveApiKey(deps = {}) {
  const env = deps.env ?? process.env
  const fromEnv = [env.OMNIMUX_API_KEY, env.OMNIMUX_TOKEN]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value !== '')
  if (fromEnv) return fromEnv
  return parseCredentialsText(deps.credentialsText)
}

/**
 * 创建 HTTP 直连补全函数（第二通道）。
 *
 * 非 2xx 或响应结构异常一律抛 `LLM_UNAVAILABLE`（非致命码，调用方会降级到模板）。
 * @param {{
 *   apiKey: string,
 *   baseUrl?: string,
 *   model?: string,
 *   fetcher: typeof fetch,
 * }} options 装配参数
 * @returns {CompleteFn}
 */
export function createHttpComplete(options) {
  const apiKey = typeof options?.apiKey === 'string' ? options.apiKey : ''
  const baseUrl = (options?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options?.model || DEFAULT_MODEL
  const fetcher = options?.fetcher

  return async function httpComplete(input) {
    if (typeof fetcher !== 'function') {
      throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, 'HTTP 补全通道缺少 fetcher 实现', {
        hint: '这是内部缺陷：fetcher 由 cli.js 或测试注入，请提交 issue',
      })
    }

    const body = JSON.stringify({
      model,
      max_tokens:
        typeof input?.maxTokens === 'number' && Number.isFinite(input.maxTokens)
          ? input.maxTokens
          : DEFAULT_MAX_TOKENS,
      messages: [
        { role: 'system', content: typeof input?.system === 'string' ? input.system : '' },
        { role: 'user', content: typeof input?.prompt === 'string' ? input.prompt : '' },
      ],
    })

    /** @type {any} */
    let response
    try {
      response = await fetcher(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body,
        ...(input?.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, 'HTTP 补全请求发送失败', {
        hint: '检查网络与 OMNIMUX_BASE_URL 配置；不改用第三通道（离线模板）也能出稿',
        cause: error,
      })
    }

    if (response === null || typeof response !== 'object' || typeof response.ok !== 'boolean') {
      throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, 'HTTP 补全返回结构异常', {
        hint: '检查 OMNIMUX_BASE_URL 是否指向兼容 OpenAI 的 /v1/chat/completions 网关',
      })
    }

    if (!response.ok) {
      throw new InterceptError(
        ERROR_CODES.LLM_UNAVAILABLE,
        `HTTP 补全返回 ${response.status}`,
        {
          hint: '确认 OMNIMUX_API_KEY / OMNIMUX_TOKEN 有效且额度充足；不改用第三通道（离线模板）也能出稿',
        },
      )
    }

    /** @type {unknown} */
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, 'HTTP 补全响应不是合法 JSON', {
        hint: '检查网关返回结构是否符合 OpenAI Chat Completions 规范',
        cause: error,
      })
    }

    const content = extractCompletionText(payload)
    if (content === '') {
      throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, 'HTTP 补全返回了空内容', {
        hint: '稍后重试；不改用第三通道（离线模板）也能出稿',
      })
    }
    return content
  }
}

/**
 * 从 OpenAI 兼容响应中取正文。
 * @param {unknown} payload 响应体
 * @returns {string}
 */
export function extractCompletionText(payload) {
  if (payload === null || typeof payload !== 'object') return ''
  const choices = /** @type {Record<string, unknown>} */ (payload).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0]
  if (first === null || typeof first !== 'object') return ''
  const message = /** @type {Record<string, unknown>} */ (first).message
  if (message !== null && typeof message === 'object') {
    const content = /** @type {Record<string, unknown>} */ (message).content
    if (typeof content === 'string') return content
  }
  const text = /** @type {Record<string, unknown>} */ (first).text
  return typeof text === 'string' ? text : ''
}

/**
 * 把宿主工具（`omnimux_text_complete`）包成 `CompleteFn`（第一通道）。
 * @param {{ textComplete: (input: { system: string, prompt: string, maxTokens?: number }) => Promise<unknown> }} deps 宿主能力
 * @returns {CompleteFn}
 */
export function createHostComplete(deps) {
  const textComplete = deps?.textComplete
  return async function hostComplete(input) {
    if (typeof textComplete !== 'function') {
      throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, '宿主补全通道不可用', {
        hint: '宿主未提供 omnimux_text_complete；不改用第三通道（离线模板）也能出稿',
      })
    }
    const result = await textComplete({
      system: typeof input?.system === 'string' ? input.system : '',
      prompt: typeof input?.prompt === 'string' ? input.prompt : '',
      ...(typeof input?.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
    })
    if (typeof result === 'string') return result
    if (result !== null && typeof result === 'object') {
      const text = /** @type {Record<string, unknown>} */ (result).text
      if (typeof text === 'string') return text
    }
    throw new InterceptError(ERROR_CODES.LLM_UNAVAILABLE, '宿主补全返回结构无法识别', {
      hint: '宿主返回值应为字符串或 { text: string }',
    })
  }
}

/**
 * 解析可用的模型补全通道（第二通道装配）。
 *
 * 返回 `null` 表示「不可用」——此时调用方直接走第三通道（离线模板），**不是错误**。
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   credentialsText?: string,
 *   baseUrl?: string,
 *   model?: string,
 * }} [deps] 注入依赖
 * @returns {CompleteFn | null}
 */
export function resolveCompleteChannel(deps = {}) {
  const apiKey = resolveApiKey(deps)
  if (apiKey === '') return null
  const fetcher = deps.fetcher
  if (typeof fetcher !== 'function') return null
  return createHttpComplete({
    apiKey,
    ...(deps.baseUrl ? { baseUrl: deps.baseUrl } : {}),
    ...(deps.model ? { model: deps.model } : {}),
    fetcher,
  })
}
