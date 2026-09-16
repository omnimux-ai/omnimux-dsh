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
 *
 * Hub-only: never discovers or falls back to local CPA / localhost providers.
 * Credentials come only from explicit input, OMNIMUX_* env, or credentials
 * OMNIMUX_API_KEY/OMNIMUX_TOKEN. Default base is the execution hub.
 * @param {{
 *   model: string,
 *   prompt: string,
 *   system?: string,
 *   maxTokens: number,
 *   mediaParts?: Array<{ type: 'image_url', image_url: { url: string } }>,
 *   candidates?: string[],
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
  let apiKey = (typeof input.apiKey === 'string' && input.apiKey.trim()) || ''
  let baseUrl = (typeof input.baseUrl === 'string' && input.baseUrl.trim()) || ''

  if (!apiKey) {
    apiKey = String(env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN || '').trim()
  }
  if (!baseUrl && env.OMNIMUX_BASE_URL) {
    baseUrl = String(env.OMNIMUX_BASE_URL).trim()
  }

  // Resolve hub key from credentials store only (never CPA / local providers).
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
  const candidates = Array.isArray(input.candidates) && input.candidates.length > 0
    ? input.candidates.slice(0, 4)
    : [input.model]

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
