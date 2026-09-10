import { OmnimuxError } from '../media/errors.js'
import {
  assertGuardOutput,
  assertGuardSubmit,
} from '../catalog/contract/submit-guard/index.js'
import { parseTextConfig, resolveTextRoute } from './catalog.js'
import { completeTextViaChat } from './chat.js'
import { probeTextImage, saveProbedTextImage } from './image.js'
import { loadTextVideo, toVideoImageUrlPart } from './video.js'
import { normalizeTextReferences } from './references.js'

/**
 * One-shot expert completion. Default path: `ctx.llm.stream` (text / image).
 * Video path: bypass stream + attachments and POST chat completions with
 * `image_url` + `data:video/…` (spike-locked protocol). Not a chat turn: no
 * tools, no parent messages, no dest, no poll.
 *
 * SubmitGuard admits every normalized reference and its probed metadata before
 * the attachment store or provider is called. Unsupported media is rejected.
 *
 * @param {{
 *   prompt?: string,
 *   model?: string,
 *   operation?: string,
 *   image?: string,
 *   video?: string,
 *   audio?: string,
 *   audioTrack?: object,
 *   references?: import('./references.js').TextReference[],
 *   system?: string,
 *   maxTokens?: number,
 *   signal?: AbortSignal,
 *   sessionId?: unknown,
 *   env?: Record<string, string | undefined>,
 *   text?: unknown,
 *   gate?: object,
 *   hub?: { gate?: object, text?: unknown },
 *   llm?: { stream: (options: object) => AsyncIterable<object> },
 *   attachments?: { saveImage: Function, imageLimits?: object },
 *   fetcher?: typeof fetch,
 *   apiKey?: string,
 *   baseUrl?: string,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   settings?: { get: (section: string) => any },
 *   assetMeta?: object,
 * }} input
 */
export async function executeOmnimuxText(input) {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) {
    throw new OmnimuxError('omnimux-invalid-request', 'prompt is required')
  }
  const text = parseTextConfig(input.text)
  const references = normalizeTextReferences(input)
  const hasImage = references.some((asset) => asset.type === 'image')
  const hasVideo = references.some((asset) => asset.type === 'video')
  const gate = input.gate ?? input.hub?.gate
  const route = resolveTextRoute({ model: input.model, references }, text, input.env, gate)
  const maxTokens = typeof input.maxTokens === 'number' && Number.isFinite(input.maxTokens) && input.maxTokens > 0
    ? input.maxTokens
    : route.maxTokens
  const system = typeof input.system === 'string' ? input.system.trim() : ''

  if (hasImage && (!input.attachments || typeof input.attachments.saveImage !== 'function')) {
    throw new OmnimuxError('needs-provider', 'image input requires ctx.attachments')
  }
  const probed = []
  const assets = []
  for (const asset of references) {
    const media = asset.type === 'image'
      ? await probeTextImage(asset.pathOrUrl, { attachments: input.attachments, fetcher: input.fetcher, signal: input.signal })
      : asset.type === 'video' ? await loadTextVideo(asset.pathOrUrl, { signal: input.signal, fetcher: input.fetcher }) : null
    if (!media) {
      throw new OmnimuxError('omnimux-invalid-request', `text completion does not support ${asset.type} input`)
    }
    probed.push(media)
    assets.push({ ...asset, mime: media.mediaType, sizeBytes: media.sizeBytes ?? media.bytes })
  }
  const guardPlan = assertGuardSubmit(
    {
      prompt,
      model: route.modelId,
      operation: input.operation,
      assets,
      system,
      maxTokens,
      seam: 'textComplete',
      capability: 'text',
    },
    {
      seam: 'textComplete',
      capability: 'text',
      outputType: 'text',
      gateAllows: gate
        ? (modelId) => {
            const models = gate.models
            if (models && typeof models === 'object' && modelId in models) {
              return models[modelId] !== false
            }
            return true
          }
        : undefined,
    },
  )

  if (hasVideo) {
    const result = await completeTextViaChat({
      model: route.modelId,
      prompt,
      system,
      maxTokens,
      videoPart: toVideoImageUrlPart(probed[0]),
      env: input.env,
      fetcher: input.fetcher,
      signal: input.signal,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      credentials: input.credentials,
      settings: input.settings,
    })
    assertGuardOutput(guardPlan, result, { capability: 'text' })
    return result
  }

  if (!input.llm || typeof input.llm.stream !== 'function') {
    throw new OmnimuxError('needs-provider', 'textComplete requires ctx.llm')
  }
  const content = [{ type: 'text', text: prompt }]
  for (const media of probed) {
    const attachment = await saveProbedTextImage(media, input.attachments)
    content.push({ type: 'image', attachment })
  }
  const options = {
    provider: route.providerId,
    model: route.modelId,
    messages: [{ role: 'user', content }],
    maxTokens,
    ...(system ? { system } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  }
  let assembled = ''
  let finish
  for await (const chunk of input.llm.stream(options)) {
    if (!chunk || typeof chunk !== 'object') continue
    const row = /** @type {Record<string, unknown>} */ (chunk)
    if (row.type === 'text-delta' && typeof row.text === 'string') assembled += row.text
    if (row.type === 'block-end' && row.block && typeof row.block === 'object') {
      const block = /** @type {Record<string, unknown>} */ (row.block)
      if (block.type === 'text' && typeof block.text === 'string' && !assembled) assembled += block.text
    }
    if (row.type === 'finish') finish = row
  }
  const reason = finish && typeof finish.reason === 'object' && finish.reason
    ? /** @type {Record<string, unknown>} */ (finish.reason)
    : undefined
  if (reason?.kind === 'error' || reason?.kind === 'aborted') {
    const failure = reason.failure && typeof reason.failure === 'object'
      ? /** @type {Record<string, unknown>} */ (reason.failure)
      : undefined
    const message = typeof failure?.message === 'string' && failure.message.trim()
      ? failure.message
      : `text complete ${reason.kind}`
    throw new OmnimuxError('omnimux-failed', message)
  }
  if (!assembled.trim()) {
    throw new OmnimuxError('omnimux-invalid-response', 'text complete produced no text')
  }
  const result = { mode: 'live', model: route.modelId, text: assembled }
  assertGuardOutput(guardPlan, result, { capability: 'text' })
  return result
}
