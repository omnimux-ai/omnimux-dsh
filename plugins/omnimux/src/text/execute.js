import { OmnimuxError } from '../media/errors.js'
import {
  assertGuardOutput,
  assertGuardSubmit,
} from '../catalog/contract/submit-guard/index.js'
import { parseTextConfig, resolveTextRoute } from './catalog.js'
import { completeTextViaChat } from './chat.js'
import { probeTextImage, saveProbedTextImage, toImageUrlPart } from './image.js'
import { loadTextVideo, toVideoImageUrlPart } from './video.js'
import { loadTextAudio, toAudioImageUrlPart } from './audio.js'
import { loadTextDocument, toDocumentImageUrlPart } from './document.js'
import { normalizeTextReferences } from './references.js'
import { resolveRuntimeChoice } from '../settings/runtime-mode.js'
import { runAgentText } from '../agents/local.js'

/** Fixed credential reference for the BYOK API key. */
const BYOK_KEY_REF = 'OMNIMUX_BYOK_API_KEY'

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
 *   document?: string,
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
  const hasAudio = references.some((asset) => asset.type === 'audio')
  const hasDocument = references.some((asset) => asset.type === 'document')
  const hasComplexMedia = hasVideo || hasAudio || hasDocument
  const gate = input.gate ?? input.hub?.gate

  // BYOK: the user configured their own key and it tested OK. Text runs
  // directly against their endpoint; the official channel is not consulted.
  const runtimeSettings = input.settings && typeof input.settings.get === 'function'
    ? input.settings.get('omnimux')
    : undefined
  const runtime = resolveRuntimeChoice(runtimeSettings)
  // Chose BYOK but hasn't finished configuring — fail loudly, not silently
  // fall through to the official account.
  if (runtime.mode === 'key' && !runtime.textReady) {
    throw new OmnimuxError('omnimux-unconfigured', '自备密钥尚未配置完成，请在设置中填写地址和模型并测试通过')
  }
  if (runtime.mode === 'agent' && !runtime.textReady) {
    throw new OmnimuxError('omnimux-unconfigured', '本机助手尚未配置完成，请在设置中选择并测试通过')
  }
  const useByok = runtime.mode === 'key' && runtime.textReady
  const useAgent = runtime.mode === 'agent' && runtime.textReady

  // Local agent: text goes to the selected CLI and back. Media references are
  // out of scope for the agent path in this version — only plain text rides it.
  if (useAgent) {
    if (references.length > 0) {
      throw new OmnimuxError('omnimux-invalid-request', '本机助手目前只承接纯文字任务')
    }
    try {
      const agentRun = typeof input.agentRun === 'function' ? input.agentRun : runAgentText
      const agentModel = String(runtimeSettings?.runtimeAgentModel ?? '').trim()
      const text2 = await agentRun({
        id: String(runtimeSettings?.runtimeAgentId ?? ''),
        prompt,
        model: agentModel,
      })
      const result = {
        mode: 'live',
        model: String(runtimeSettings?.runtimeAgentId ?? 'agent'),
        text: text2,
      }
      if (agentModel) {
        result.agentModel = agentModel
      }
      return result
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : String(error)
      throw new OmnimuxError('omnimux-failed', message)
    }
  }

  // The official route — its whitelist, channel plan and submit guard — only
  // applies when the request actually rides it. A BYOK endpoint knows its own
  // model names, so none of that machinery may run for it.
  const route = useByok
    ? null
    : resolveTextRoute({
      model: input.model,
      references,
      strategy: input.strategy,
      group: input.group,
      allowedGroups: input.allowedGroups,
    }, text, input.env, gate)

  const maxTokens = typeof input.maxTokens === 'number' && Number.isFinite(input.maxTokens) && input.maxTokens > 0
    ? input.maxTokens
    : (route ? route.maxTokens : text.maxTokens)
  const system = typeof input.system === 'string' ? input.system.trim() : ''

  if (hasImage && (!input.attachments || typeof input.attachments.saveImage !== 'function')) {
    throw new OmnimuxError('needs-provider', 'image input requires ctx.attachments')
  }
  const probed = []
  const assets = []
  for (const asset of references) {
    const media = asset.type === 'image'
      ? await probeTextImage(asset.pathOrUrl, { attachments: input.attachments, fetcher: input.fetcher, signal: input.signal })
      : asset.type === 'video'
        ? await loadTextVideo(asset.pathOrUrl, { signal: input.signal, fetcher: input.fetcher })
        : asset.type === 'audio'
          ? await loadTextAudio(asset.pathOrUrl, { signal: input.signal, fetcher: input.fetcher })
          : asset.type === 'document'
            ? await loadTextDocument(asset.pathOrUrl, { signal: input.signal, fetcher: input.fetcher })
            : null
    if (!media) {
      throw new OmnimuxError('omnimux-invalid-request', `text completion does not support ${asset.type} input`)
    }
    probed.push(media)
    assets.push({ ...asset, mime: media.mediaType, sizeBytes: media.sizeBytes ?? media.bytes })
  }
  // BYOK models are user-defined; the official submit/output guard does not
  // know them, so it only runs for the official route.
  const guardPlan = useByok
    ? { plan: null, byok: true }
    : assertGuardSubmit(
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

  // BYOK mode: every text request goes directly to the user's endpoint.
  // This runs before the official channel/stream split so it always wins.
  if (useByok) {
    const mediaParts = []
    for (const [index, asset] of references.entries()) {
      const media = probed[index]
      if (!media) continue
      if (asset.type === 'video') mediaParts.push(toVideoImageUrlPart(media))
      else if (asset.type === 'image') mediaParts.push(toImageUrlPart(media))
      else if (asset.type === 'audio') mediaParts.push(toAudioImageUrlPart(media))
      else if (asset.type === 'document') mediaParts.push(toDocumentImageUrlPart(media))
    }
    let byokKey = ''
    if (input.credentials && typeof input.credentials.resolve === 'function') {
      try {
        const hit = await input.credentials.resolve(BYOK_KEY_REF)
        if (hit && typeof hit.value === 'string') byokKey = hit.value.trim()
      } catch { /* fall through */ }
    }
    if (!byokKey) {
      throw new OmnimuxError('omnimux-unconfigured', '自备密钥未找到，请在设置中重新填写')
    }
    const byokEndpoint = typeof runtimeSettings?.runtimeKeyEndpoint === 'string'
      ? runtimeSettings.runtimeKeyEndpoint.trim()
      : ''
    if (!byokEndpoint) {
      throw new OmnimuxError('omnimux-unconfigured', '自备密钥缺少接口地址')
    }
    // The user's endpoint knows their model, not the official directory's.
    // An explicit caller model wins; otherwise the tested runtimeKeyModel goes.
    const explicitModel = typeof input.model === 'string' && input.model.trim()
    const byokModel = explicitModel
      ? input.model.trim()
      : (typeof runtimeSettings?.runtimeKeyModel === 'string' && runtimeSettings.runtimeKeyModel.trim())
    if (!byokModel) {
      throw new OmnimuxError('omnimux-unconfigured', '自备密钥缺少模型名')
    }
    const result = await completeTextViaChat({
      model: byokModel,
      prompt,
      system,
      maxTokens,
      mediaParts,
      env: input.env,
      fetcher: input.fetcher,
      signal: input.signal,
      apiKey: byokKey,
      baseUrl: byokEndpoint,
      credentials: input.credentials,
    })
    if (!guardPlan?.byok) {
      assertGuardOutput(guardPlan, result, { capability: 'text' })
    }
    return result
  }

  // A channel selection cannot ride `ctx.llm.stream`: the harness resolves the
  // model id against the provider's declared list, so `model@group` fails before
  // any request. Routing intent therefore uses the same direct chat path as a
  // video input, which carries the group and its failover candidates.
  const wantsChannels = route.routed && route.candidates.length > 0
  if (hasComplexMedia || wantsChannels) {
    const mediaParts = []
    for (const [index, asset] of references.entries()) {
      // `probed` mirrors `references` by index; the probed entries carry the
      // payload (bytes / packed data URI), the assets carry the input type.
      const media = probed[index]
      if (!media) continue
      if (asset.type === 'video') mediaParts.push(toVideoImageUrlPart(media))
      else if (asset.type === 'image') mediaParts.push(toImageUrlPart(media))
      else if (asset.type === 'audio') mediaParts.push(toAudioImageUrlPart(media))
      else if (asset.type === 'document') mediaParts.push(toDocumentImageUrlPart(media))
    }
    const result = await completeTextViaChat({
      model: route.modelId,
      candidates: route.candidates,
      prompt,
      system,
      maxTokens,
      mediaParts,
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
