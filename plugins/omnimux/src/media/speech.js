import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { assertGuardOutput } from '../catalog/contract/submit-guard/index.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { OmnimuxError } from './errors.js'
import { assertDownloadedMediaType } from './job.js'
import { SPEECH_TASK_DEADLINE_MS } from './task-deadline.js'
import { SPEECH_PATH } from './vendors/omnimux.js'

/**
 * Internal synchronous transport; executeOmnimuxMedia admits and maps first.
 * @param {{
 *   route: { baseUrl: string, modelId: string },
 *   guardPlan: import('../catalog/contract/submit-guard/guard.js').GuardPlan,
 *   payload: Record<string, unknown>,
 *   apiKey: string,
 *   dest: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Promise<{ mode: 'live', model: string, duration?: number, url?: string, dest: string }>}
 */
export async function generateSpeech(input) {
  // Speech keeps its historical 10-minute budget; the polled media path uses a
  // longer one (see task-deadline.js). Named here so neither path hardcodes it.
  const timeout = AbortSignal.timeout(SPEECH_TASK_DEADLINE_MS)
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout
  const fetcher = input.fetcher ?? fetch
  try {
    signal.throwIfAborted()
    const response = await fetcher(`${input.route.baseUrl}/${SPEECH_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/*',
        ...(input.apiKey.trim() ? { authorization: `Bearer ${input.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({ ...input.payload, model: input.route.modelId }),
      signal,
    })
    if (response.status !== 200) {
      let body
      try { body = await response.text() } catch { body = null }
      const classified = classifyQuotaFailure({ status: response.status, body })
      throw new OmnimuxError(
        classified.kind === 'other' ? 'omnimux-request-failed' : classified.code,
        classified.kind === 'other' ? `speech request failed (HTTP ${response.status})` : classified.message,
        { status: response.status, details: classified },
      )
    }
    const mime = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    assertDownloadedMediaType(mime, 'audio')
    const bytes = Buffer.from(await response.arrayBuffer())
    signal.throwIfAborted()
    assertGuardOutput(input.guardPlan, {
      mode: 'live', outputs: [{ type: 'audio', mime, bytes }],
    }, { capability: 'audio' })

    const headerDuration = response.headers.get('x-audio-duration')
    const durationValue = headerDuration?.trim() ? Number(headerDuration) : NaN
    const duration = Number.isFinite(durationValue) && durationValue >= 0 ? durationValue : undefined
    const url = response.headers.get('x-audio-url') || undefined
    await mkdir(dirname(input.dest), { recursive: true })
    await writeFile(input.dest, bytes, { signal })
    return { mode: 'live', model: input.route.modelId, duration, url, dest: input.dest }
  } catch (error) {
    if (input.signal?.aborted) throw new OmnimuxError('omnimux-aborted', 'speech request aborted')
    if (timeout.aborted) throw new OmnimuxError('omnimux-request-failed', 'speech request timed out')
    if (error instanceof OmnimuxError) throw error
    throw new OmnimuxError('omnimux-request-failed', 'speech generation or file write failed', { cause: error })
  }
}
