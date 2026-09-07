import { OmnimuxError } from './errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { assertGuardOutput, assertGuardSubmit } from '../catalog/contract/submit-guard/index.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute } from './route.js'
import { pickTranscriptionText, TRANSCRIPTION_PATH } from './vendors/omnimux.js'
import { loadAudioBytes } from './stt-audio.js'

export { loadAudioBytes, mediaFromAudioMagic, durationFromAudioBytes } from './stt-audio.js'

/** Route capability key for speech-to-text (audio bytes in, text out). */
export const STT_CAPABILITY = 'stt'

/**
 * Speech-to-text execution: one synchronous multipart POST, no task poll.
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
  const audio = await loadAudioBytes(input.audio, {
    fetcher: input.fetcher,
    apiKey: input.apiKey,
    signal: input.signal,
  })
  const responseFormat = input.response_format || 'json'
  const form = new FormData()
  form.append('file', new Blob([audio.bytes], { type: audio.contentType }), audio.filename)
  form.append('model', input.route.modelId)
  if (typeof input.language === 'string' && input.language.trim()) {
    form.append('language', input.language.trim())
  }
  form.append('response_format', responseFormat)

  const fetcher = input.fetcher ?? fetch
  const headers = {
    accept: ['json', 'verbose_json'].includes(responseFormat) ? 'application/json' : 'text/plain, application/json',
    ...(input.apiKey?.trim() ? { authorization: `Bearer ${input.apiKey.trim()}` } : {}),
  }
  const url = `${input.route.baseUrl}/${TRANSCRIPTION_PATH}`
  let response
  try {
    response = await fetcher(url, {
      method: 'POST', headers, body: form,
      ...(input.signal ? { signal: input.signal } : {}),
    })
  } catch (error) {
    if (input.signal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', 'speech-to-text request aborted')
    }
    throw error
  }

  // A Response body is single-use, including a failed json() parse.
  let body = null
  try {
    const raw = await response.text()
    const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? ''
    if (contentType.startsWith('text/') || contentType.includes('subrip')) body = raw
    else {
      try { body = JSON.parse(raw) } catch { body = raw }
    }
  } catch {
    throw new OmnimuxError('omnimux-invalid-response', 'speech-to-text response could not be read')
  }
  if (!response.ok) {
    const classified = classifyQuotaFailure({ status: response.status, body })
    if (classified.kind === 'quota-exceeded') {
      throw new OmnimuxError('quota-exceeded', classified.message, { status: response.status, details: classified })
    }
    if (classified.kind === 'needs-omnimux') {
      throw new OmnimuxError('needs-omnimux', classified.message, { status: response.status })
    }
    throw new OmnimuxError('omnimux-request-failed', `speech-to-text request failed (HTTP ${response.status})`, { status: response.status })
  }

  const text = typeof body === 'string' ? body : pickTranscriptionText(body)
  if (!text?.trim()) {
    throw new OmnimuxError('omnimux-invalid-response', 'speech-to-text response carried no text')
  }
  return { mode: 'live', model: input.route.modelId, text }
}
