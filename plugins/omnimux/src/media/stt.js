import { OmnimuxError } from './errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { assertGuardOutput, assertGuardSubmit } from '../catalog/contract/submit-guard/index.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute } from './route.js'
import { pickTranscriptionText, TRANSCRIPTION_PATH } from './vendors/omnimux.js'
import { isPublicAudioUrl, loadAudioBytes } from './stt-audio.js'

export { loadAudioBytes, mediaFromAudioMagic, durationFromAudioBytes } from './stt-audio.js'

/** Route capability key for speech-to-text (audio bytes in, text out). */
export const STT_CAPABILITY = 'stt'
const URL_FIRST_MODELS = new Set(['doubao-asr-bigmodel', 'seedasr-auc'])
const FILE_UPLOAD_MODEL = 'whisper-1'
const URL_REQUIRED_ERROR = /audio url is required|URL-first mode/i

/**
 * Speech-to-text execution: synchronous multipart response, no task poll.
 * @param {{
 *   audio: string,
 *   model?: string,
 *   operation?: string,
 *   provider?: string,
 *   language?: string,
 *   response_format?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt',
 *   signal?: AbortSignal,
 *   env?: Record<string, string | undefined>,
 *   media?: unknown,
 *   fetcher?: typeof fetch,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 * }} input
 * @returns {Promise<{ mode: 'live', model: string, text: string }>}
 */
export async function executeOmnimuxSpeechToText(input) {
  if (!input || typeof input.audio !== 'string' || !input.audio.trim()) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio is required (absolute path, http(s) URL, or data URI)')
  }
  const media = parseMediaConfig(input.media)
  const route = resolveMediaRoute(STT_CAPABILITY, input, media, input.env)
  const guardPlan = assertGuardSubmit(
    {
      model: route.modelId,
      operation: input.operation ?? 'speech_to_text',
      audio: input.audio.trim(),
      language: input.language,
      response_format: input.response_format || 'json',
      seam: 'speechToText',
      capability: 'stt',
    },
    { seam: 'speechToText', capability: 'stt', outputType: 'text' },
  )
  const auth = await resolveMediaAuth(route, {
    env: input.env,
    store: input.store,
    credentials: input.credentials,
  })
  const result = await transcribeSpeechToTextRequest({
    route: { ...route, modelId: guardPlan.modelId },
    apiKey: auth.apiKey,
    audio: guardPlan.logicalPayload.audio,
    language: input.language,
    response_format: guardPlan.vendorPayload.response_format ?? input.response_format,
    fetcher: input.fetcher,
    signal: input.signal,
  })
  assertGuardOutput(guardPlan, result, { capability: 'stt' })
  return result
}

/**
 * Internal wire primitive; callers must pass SubmitGuard before entering.
 * Whisper is the file-transport fallback for admitted STT requests (#780),
 * not a change to model listing or the user's saved selection.
 * @param {{
 *   route: Pick<ReturnType<typeof resolveMediaRoute>, 'baseUrl' | 'modelId'>,
 *   apiKey?: string,
 *   audio: string,
 *   language?: string,
 *   response_format?: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<{ mode: 'live', model: string, text: string }>}
 */
export async function transcribeSpeechToTextRequest(input) {
  const publicUrl = isPublicAudioUrl(input.audio) ? input.audio.trim() : ''
  const modelId = !publicUrl && URL_FIRST_MODELS.has(input.route.modelId) ? FILE_UPLOAD_MODEL : input.route.modelId
  const responseFormat = input.response_format || 'json'
  const fetcher = input.fetcher ?? fetch
  const headers = {
    accept: ['json', 'verbose_json'].includes(responseFormat) ? 'application/json' : 'text/plain, application/json',
    ...(input.apiKey?.trim() ? { authorization: `Bearer ${input.apiKey.trim()}` } : {}),
  }
  const url = `${input.route.baseUrl}/${TRANSCRIPTION_PATH}`
  /** @type {Awaited<ReturnType<typeof loadAudioBytes>> | undefined} */
  let audio

  /** @param {string} effectiveModel @param {string} audioUrl */
  async function submit(effectiveModel, audioUrl) {
    input.signal?.throwIfAborted()
    const form = new FormData()
    // Known URL-first models do not need a local download or a redundant upload.
    if (!audioUrl || !URL_FIRST_MODELS.has(effectiveModel)) {
      audio ??= await loadAudioBytes(input.audio, {
        fetcher, apiKey: input.apiKey, signal: input.signal,
      })
      form.append('file', new Blob([audio.bytes], { type: audio.contentType }), audio.filename)
    }
    if (audioUrl) {
      form.append('url', audioUrl)
      form.append('audio_url', audioUrl)
    }
    form.append('model', effectiveModel)
    if (typeof input.language === 'string' && input.language.trim()) {
      form.append('language', input.language.trim())
    }
    form.append('response_format', responseFormat)
    input.signal?.throwIfAborted()
    const response = await fetcher(url, {
      method: 'POST', headers, body: form,
      ...(input.signal ? { signal: input.signal } : {}),
    })
    const body = await readTranscriptionBody(response)
    input.signal?.throwIfAborted()
    if (!response.ok) {
      const classified = classifyQuotaFailure({ status: response.status, body })
      if (classified.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classified.message, { status: response.status, details: classified })
      }
      if (classified.kind === 'needs-omnimux' || classified.kind === 'channel-unavailable') {
        throw new OmnimuxError(classified.code, classified.message, { status: response.status })
      }
      const detail = pickTranscriptionError(body)
      if (effectiveModel !== FILE_UPLOAD_MODEL && URL_REQUIRED_ERROR.test(detail)) {
        // Retry once, with bytes only; never resubmit a rejected URL-first payload.
        return submit(FILE_UPLOAD_MODEL, '')
      }
      const message = safeTranscriptionError(detail, input.apiKey)
      throw new OmnimuxError('omnimux-request-failed',
        `speech-to-text request failed (HTTP ${response.status})${message ? `: ${message}` : ''}`,
        { status: response.status })
    }
    const text = typeof body === 'string' ? body : pickTranscriptionText(body)
    if (!text?.trim()) {
      throw new OmnimuxError('omnimux-invalid-response', 'speech-to-text response carried no text')
    }
    return { mode: /** @type {const} */ ('live'), model: effectiveModel, text }
  }

  try {
    return await submit(modelId, publicUrl)
  } catch (error) {
    if (input.signal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', 'speech-to-text request aborted')
    }
    throw error
  }
}

/** @param {Response} response @returns {Promise<unknown>} */
async function readTranscriptionBody(response) {
  // A Response body is single-use, including a failed json() parse.
  let raw
  try {
    raw = await response.text()
  } catch {
    throw new OmnimuxError('omnimux-invalid-response', 'speech-to-text response could not be read')
  }
  const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? ''
  if (response.ok && (contentType.startsWith('text/') || contentType.includes('subrip'))) return raw
  try { return JSON.parse(raw) } catch { return raw }
}

/** @param {unknown} body @param {number} [depth] @returns {string} */
function pickTranscriptionError(body, depth = 0) {
  if (depth > 5 || body == null) return ''
  if (typeof body === 'string') return body.trim()
  if (typeof body !== 'object' || Array.isArray(body)) return ''
  for (const field of ['error', 'message', 'detail', 'data']) {
    const message = pickTranscriptionError(body[field], depth + 1)
    if (message) return message
  }
  return ''
}

/** @param {string} message @param {string} [apiKey] */
function safeTranscriptionError(message, apiKey) {
  let safe = apiKey?.trim() ? message.replaceAll(apiKey.trim(), '[redacted]') : message
  safe = safe.replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|pat)-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/\s+/g, ' ').trim()
  return safe.slice(0, 1024)
}
