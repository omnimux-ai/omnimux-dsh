import { OmnimuxError } from '../media/errors.js'
import { hasChannelEvidence, hasGroupFailoverEvidence } from '../errors/channel-classifier.js'

const DEFAULT_CHAT_BASE = 'https://api.omnimux.ai/v1'
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * One-shot chat-completions call used when `textComplete` cannot use
 * `ctx.llm.stream`: a `video` input (harness ImageMediaType cannot store video
 * MIME) or an explicit channel-group selection (`llm.stream` resolves a
 * declared model id, so it cannot carry `model@group`). Still not a parallel
 * chat tool: no tools, no parent history, same whitelist + return shape as the
 * stream path.
 * @param {{
 *   model: string,
 *   prompt: string,
 *   system?: string,
 *   maxTokens: number,
 *   mediaParts?: Array<{ type: 'image_url', image_url: { url: string } }>,
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
  let hasDiscoveredLocalModel = false

  if (!apiKey) {
    apiKey = String(env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN || '').trim()
  }
  if (!baseUrl && env.OMNIMUX_BASE_URL) {
    baseUrl = String(env.OMNIMUX_BASE_URL).trim()
  }

  // 若未直接提供 key，尝试从 credentials 解析官方中枢 key
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

  // Hub-first：已有执行中枢凭证时，固定中枢 base，禁止被本机 CPA 劫持
  // （视频五维深拆等路径缺 OMNIMUX_BASE_URL 时，旧逻辑会 adopt 127.0.0.1:8317）。
  if (apiKey && !baseUrl && !explicitBaseUrl) {
    baseUrl = DEFAULT_CHAT_BASE
  }

  // 仅当中枢凭证仍不可用时，才回退发现本机/其它 provider（如 CPA）
  if (!apiKey) {
    const discovered = await discoverChatProviderFallback({
      env,
      credentials: input.credentials,
      settings: input.settings,
      model: targetModel,
    })
    if (discovered) {
      if (!explicitBaseUrl && discovered.baseUrl) baseUrl = discovered.baseUrl
      if (!explicitInputKey && discovered.apiKey) apiKey = discovered.apiKey
      if (discovered.model && discovered.model !== input.model) {
        targetModel = discovered.model
        hasDiscoveredLocalModel = true
      }
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
  const mediaParts = Array.isArray(input.mediaParts) ? input.mediaParts : []
  for (const part of mediaParts) {
    const partUrl = part?.type === 'image_url' ? part.image_url?.url : undefined
    if (typeof partUrl !== 'string' || !/^data:(?:image\/|video\/|audio\/|application\/pdf[;,])/.test(partUrl)) {
      throw new OmnimuxError('omnimux-invalid-request', 'media part url must be a valid data URI (image, video, audio, or PDF)')
    }
  }
  const system = typeof input.system === 'string' ? input.system.trim() : ''
  /** @type {Array<{ role: string, content: unknown }>} */
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      ...mediaParts,
    ],
  })
  const fetcher = input.fetcher ?? fetch
  const candidates = (hasDiscoveredLocalModel && targetModel !== input.model)
    ? [targetModel]
    : (Array.isArray(input.candidates) && input.candidates.length > 0
      ? input.candidates.slice(0, 4)
      : [targetModel])

  let lastError
  for (const [attempt, candidateModel] of candidates.entries()) {
    const body = {
      model: candidateModel,
      max_tokens: input.maxTokens,
      messages,
    }
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
      if (attempt + 1 < candidates.length && !input.signal?.aborted) {
        continue
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
      // 401 pins the credential, not the channel; a group switch cannot fix it.
      if (response.status === 401) {
        throw new OmnimuxError('omnimux-unconfigured', message)
      }
      // One chat completion carries no task handle, so a retry cannot double-charge.
      // A grouped plan may switch groups on permission/unknown-model wording; a
      // single-model request keeps the narrower channel-evidence rule.
      const groupSwitch = candidates.some((candidate) => candidate.includes('@'))
        ? hasGroupFailoverEvidence({ status: response.status, body: payload, message })
        : hasChannelEvidence({ status: response.status, body: payload, message })
      const retryableStatus = response.status === 503 || response.status === 429
      if ((groupSwitch || retryableStatus) && attempt + 1 < candidates.length && !input.signal?.aborted) {
        continue
      }
      if (response.status === 403) {
        throw new OmnimuxError('omnimux-unconfigured', message)
      }
      throw new OmnimuxError('omnimux-failed', message)
    }
    const text = extractAssistantText(payload)
    if (!text.trim()) {
      throw new OmnimuxError('omnimux-invalid-response', 'text complete produced no text')
    }
    const out = { mode: 'live', model: input.model, text }
    if (candidateModel !== input.model) {
      out.routedModel = candidateModel
    }
    return out
  }
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
 * Fallback provider discovery when the hub key is absent.
 * Prefers the OmniMux hub route when present; otherwise local CPA / openai-completions.
 * @param {{
 *   env: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   settings?: { get: (section: string) => any },
 *   model: string,
 * }} opts
 */
async function discoverChatProviderFallback(opts) {
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

  // Hub-first among declared providers; local CPA only after hub miss.
  const entries = Object.entries(providers).sort(([aKey, a], [bKey, b]) => {
    const rank = (key, row) => {
      if (key === 'omnimux' || /api\.omnimux\.ai/i.test(row?.baseURL || '')) return 0
      if (key === 'cpa' || /localhost|127\.0\.0\.1/.test(row?.baseURL || '')) return 2
      return 1
    }
    return rank(aKey, a) - rank(bKey, b)
  })

  /** @type {Array<{ key: string, provider: any, mappedModel?: string, modelHit: boolean }>} */
  const ranked = []
  for (const [key, p] of entries) {
    if (!p || typeof p !== 'object' || !p.baseURL) continue
    const models = Array.isArray(p.models) ? p.models : []
    const hit = models.find(m => m && (m.id === model || m.id === `${model}-high` || m.id?.startsWith(model)))
    if (hit) {
      ranked.push({ key, provider: p, mappedModel: hit.id, modelHit: true })
      continue
    }
    if (key === 'omnimux' || key === 'cpa' || p.api === 'openai-completions') {
      ranked.push({ key, provider: p, modelHit: false })
    }
  }
  // Prefer exact model hits, keeping hub-before-local order within each tier.
  ranked.sort((a, b) => Number(b.modelHit) - Number(a.modelHit))

  for (const candidate of ranked) {
    const matchedProvider = candidate.provider
    const matchedKey = candidate.key
    const apiKeyEnv = matchedProvider.apiKeyEnv
      || (matchedKey === 'omnimux' || /api\.omnimux\.ai/i.test(String(matchedProvider.baseURL))
        ? 'OMNIMUX_API_KEY'
        : 'CPA_API_KEY')
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

    // Disk credential scan only when no credentials API was injected; otherwise
    // tests and host-injected stores would be shadowed by ~/.omnimux-dev keys.
    if (!resolvedKey && !(credentials && typeof credentials.resolve === 'function')) {
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
            const refVal = doc?.refs?.[apiKeyEnv]
            if (typeof refVal === 'string' && refVal.trim()) {
              resolvedKey = refVal.trim()
              break
            }
          }
        }
      } catch {}
    }

    // Skip providers with no usable key so hub-without-key yields to CPA.
    if (!resolvedKey) continue

    return {
      baseUrl: String(matchedProvider.baseURL).trim(),
      apiKey: resolvedKey,
      model: candidate.mappedModel || model,
    }
  }

  return undefined
}
