import { OmnimuxError } from '../media/errors.js'

const DEFAULT_CHAT_BASE = 'https://api.omnimux.ai/v1'
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * One-shot chat-completions call used when `textComplete` carries a `video`
 * input. Bypasses `ctx.llm.stream` / attachments because harness ImageMediaType
 * cannot store video MIME. Still not a parallel chat tool: no tools, no parent
 * history, same whitelist + return shape as the stream path.
 * @param {{
 *   model: string,
 *   prompt: string,
 *   system?: string,
 *   maxTokens: number,
 *   videoPart: { type: 'image_url', image_url: { url: string } },
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 *   apiKey?: string,
 *   baseUrl?: string,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   settings?: { get: (section: string) => any },
 * }} input
 */
export async function completeTextViaChat(input) {
  const env = input.env ?? process.env
  const explicitBaseUrl = Boolean(input.baseUrl || env.OMNIMUX_BASE_URL)
  const explicitInputKey = typeof input.apiKey === 'string' && input.apiKey.trim().length > 0
  let apiKey = (typeof input.apiKey === 'string' && input.apiKey.trim()) || ''
  let baseUrl = (typeof input.baseUrl === 'string' && input.baseUrl.trim()) || ''
  let targetModel = input.model

  if (!apiKey) {
    apiKey = String(env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN || '').trim()
  }
  if (!baseUrl && env.OMNIMUX_BASE_URL) {
    baseUrl = String(env.OMNIMUX_BASE_URL).trim()
  }

  // 若未直接提供 key，尝试从 credentials 解析官方 key
  if (!apiKey && input.credentials && typeof input.credentials.resolve === 'function') {
    for (const ref of ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']) {
      try {
        const hit = await input.credentials.resolve(ref)
        const val = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
        if (val) {
          apiKey = val
          break
        }
      } catch {}
    }
  }

  // 若仍缺少 key 或 baseUrl，自适应读取本地/中枢配置好的模型提供商 (如 cpa)
  if (!apiKey || !baseUrl) {
    const discovered = await discoverLocalChatProvider({
      env,
      credentials: input.credentials,
      settings: input.settings,
      model: targetModel,
    })
    if (discovered) {
      const adoptedLocalBase = !explicitBaseUrl && Boolean(discovered.baseUrl)
      if (adoptedLocalBase) baseUrl = discovered.baseUrl
      // 关键修复：当 baseUrl 采用本地发现的提供商时，apiKey 必须配套使用该本地提供商的 key，
      // 避免携带 credentials 中外部的 OMNIMUX_API_KEY 打到本地导致 401 Invalid API key。
      if (adoptedLocalBase || !apiKey) {
        if (!explicitInputKey && discovered.apiKey) apiKey = discovered.apiKey
      }
      if (discovered.model) targetModel = discovered.model
    }
  }

  if (!apiKey) {
    throw new OmnimuxError('omnimux-unconfigured', 'set OMNIMUX_API_KEY or OMNIMUX_TOKEN')
  }
  baseUrl = normalizeBaseUrl(baseUrl || DEFAULT_CHAT_BASE)
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) {
    throw new OmnimuxError('omnimux-invalid-request', 'prompt is required')
  }
  if (!input.videoPart || input.videoPart.type !== 'image_url') {
    throw new OmnimuxError('omnimux-invalid-request', 'video part must be image_url')
  }
  const url = input.videoPart.image_url?.url
  if (typeof url !== 'string' || !url.startsWith('data:video/')) {
    throw new OmnimuxError('omnimux-invalid-request', 'video part url must be data:video/…')
  }
  const system = typeof input.system === 'string' ? input.system.trim() : ''
  /** @type {Array<{ role: string, content: unknown }>} */
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      input.videoPart,
    ],
  })
  const body = {
    model: targetModel,
    max_tokens: input.maxTokens,
    messages,
  }
  const fetcher = input.fetcher ?? fetch
  let response
  try {
    response = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': DEFAULT_UA,
      },
      body: JSON.stringify(body),
      ...(input.signal ? { signal: input.signal } : {}),
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new OmnimuxError('omnimux-aborted', 'text complete aborted')
    }
    throw new OmnimuxError(
      'omnimux-failed',
      `text complete transport failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok) {
    const message = pickErrorMessage(payload) || `text complete HTTP ${response.status}`
    if (response.status === 401 || response.status === 403) {
      throw new OmnimuxError('omnimux-unconfigured', message)
    }
    throw new OmnimuxError('omnimux-failed', message)
  }
  const text = extractAssistantText(payload)
  if (!text.trim()) {
    throw new OmnimuxError('omnimux-invalid-response', 'text complete produced no text')
  }
  return { mode: 'live', model: input.model, text }
}

/**
 * @param {string} value
 */
function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '')
  if (!trimmed) return DEFAULT_CHAT_BASE
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

/**
 * @param {unknown} payload
 */
export function extractAssistantText(payload) {
  const row = payload && typeof payload === 'object' ? /** @type {Record<string, unknown>} */ (payload) : {}
  const choices = Array.isArray(row.choices) ? row.choices : []
  const first = choices[0] && typeof choices[0] === 'object'
    ? /** @type {Record<string, unknown>} */ (choices[0])
    : undefined
  const message = first?.message && typeof first.message === 'object'
    ? /** @type {Record<string, unknown>} */ (first.message)
    : undefined
  const content = message?.content ?? first?.text
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part === 'object' && /** @type {any} */ (part).type === 'text')
      .map((part) => String(/** @type {any} */ (part).text || ''))
      .join('\n')
  }
  return ''
}

/**
 * @param {unknown} json
 */
function pickErrorMessage(json) {
  if (!json || typeof json !== 'object') return ''
  const row = /** @type {Record<string, unknown>} */ (json)
  const err = row.error
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && typeof /** @type {any} */ (err).message === 'string') {
    return /** @type {any} */ (err).message
  }
  return String(row.message || '')
}

/**
 * Discover a configured LLM provider from settings / credentials / disk
 * when OMNIMUX_API_KEY is not directly exported.
 * @param {{
 *   env: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   settings?: { get: (section: string) => any },
 *   model: string,
 * }} opts
 */
async function discoverLocalChatProvider(opts) {
  const { env, credentials, settings, model } = opts

  let providers = undefined
  try {
    if (settings && typeof settings.get === 'function') {
      const piAi = settings.get('llm-pi-ai')
      if (piAi && typeof piAi === 'object' && piAi.providers && typeof piAi.providers === 'object') {
        providers = piAi.providers
      }
    }
  } catch {}

  if (!providers && (env.DSH_HOME || settings || credentials)) {
    try {
      const { readFileSync, existsSync } = await import('node:fs')
      const { join } = await import('node:path')
      const { homedir } = await import('node:os')
      const { parse } = await import('yaml')
      const candidates = [
        env.DSH_HOME ? join(env.DSH_HOME, 'settings.yaml') : '',
        join(homedir(), '.omnimux-dev', 'settings.yaml'),
        join(homedir(), '.dsh', 'settings.yaml'),
      ].filter(Boolean)
      for (const p of candidates) {
        if (existsSync(p)) {
          const content = readFileSync(p, 'utf8')
          const doc = parse(content)
          if (doc?.['llm-pi-ai']?.providers) {
            providers = doc['llm-pi-ai'].providers
            break
          }
        }
      }
    } catch {}
  }

  if (!providers || typeof providers !== 'object') return undefined

  let matchedProvider = undefined
  let mappedModel = undefined

  // 优先匹配本地端点 (如 cpa / localhost / 127.0.0.1)
  const entries = Object.entries(providers).sort(([aKey, a], [bKey, b]) => {
    const aLocal = aKey === 'cpa' || /localhost|127\.0\.0\.1/.test(a?.baseURL || '') ? 1 : 0
    const bLocal = bKey === 'cpa' || /localhost|127\.0\.0\.1/.test(b?.baseURL || '') ? 1 : 0
    return bLocal - aLocal
  })

  for (const [key, p] of entries) {
    if (!p || typeof p !== 'object' || !p.baseURL) continue
    const models = Array.isArray(p.models) ? p.models : []
    const hit = models.find(m => m && (m.id === model || m.id === `${model}-high` || m.id?.startsWith(model)))
    if (hit) {
      matchedProvider = p
      mappedModel = hit.id
      break
    }
    if (key === 'cpa' || p.api === 'openai-completions') {
      if (!matchedProvider) matchedProvider = p
    }
  }

  if (!matchedProvider || !matchedProvider.baseURL) return undefined

  const apiKeyEnv = matchedProvider.apiKeyEnv || 'CPA_API_KEY'
  let resolvedKey = String(env[apiKeyEnv] || '').trim()

  if (!resolvedKey && credentials && typeof credentials.resolve === 'function') {
    try {
      const hit = await credentials.resolve(apiKeyEnv)
      if (hit && typeof hit.value === 'string') resolvedKey = hit.value.trim()
    } catch {}
  }

  if (!resolvedKey && matchedProvider.apiKey) {
    resolvedKey = String(matchedProvider.apiKey).trim()
  }

  if (!resolvedKey) {
    try {
      const { readFileSync, existsSync } = await import('node:fs')
      const { join } = await import('node:path')
      const { homedir } = await import('node:os')
      const { parse } = await import('yaml')
      const candidates = [
        env.DSH_HOME ? join(env.DSH_HOME, '.credentials.yaml') : '',
        join(homedir(), '.omnimux-dev', '.credentials.yaml'),
        join(homedir(), '.dsh', '.credentials.yaml'),
      ].filter(Boolean)
      for (const p of candidates) {
        if (existsSync(p)) {
          const doc = parse(readFileSync(p, 'utf8'))
          const refVal = doc?.refs?.[apiKeyEnv] || doc?.refs?.OMNIMUX_API_KEY
          if (typeof refVal === 'string' && refVal.trim()) {
            resolvedKey = refVal.trim()
            break
          }
        }
      }
    } catch {}
  }

  return {
    baseUrl: String(matchedProvider.baseURL).trim(),
    apiKey: resolvedKey || 'local-key',
    model: mappedModel || model,
  }
}
