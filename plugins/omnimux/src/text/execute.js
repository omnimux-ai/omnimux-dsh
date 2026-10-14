import { OmnimuxError } from '../media/errors.js'
import {
  assertGuardOutput,
  assertGuardSubmit,
} from '../catalog/contract/submit-guard/index.js'
import { parseTextConfig, resolveTextRoute, CHAT_MODEL_IDS } from './catalog.js'
import { completeTextViaChat } from './chat.js'
import { probeTextImage, saveProbedTextImage, toImageUrlPart } from './image.js'
import { loadTextVideo, toVideoImageUrlPart } from './video.js'
import { loadTextAudio, toAudioImageUrlPart } from './audio.js'
import { loadTextDocument, toDocumentImageUrlPart } from './document.js'
import { normalizeTextReferences } from './references.js'
import { resolveScenarioChoice, readScenarioSettings, assertScenarioRequestIntent } from '../settings/runtime-mode.js'
import { parseModelAndGroup, resolveRequestChannelIntent } from '../catalog/serving/channel-groups.js'
import { runAgentText } from '../agents/local.js'
import { buildModelCatalog } from '../catalog/list.js'

/** 识别已知思考通道引导词/纯思考断言的前缀特征 */
const REASONING_PREAMBLE_RE = /^(?:i['’]?m\s+thinking\s+through|let\s+me\s+think|thinking\s+process|thought\s*:)/i

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
/**
 * Parse a stored `omnimux.toolModel` value ('provider:modelId').
 * @param {unknown} value
 * @returns {{ provider: string, model: string } | null}
 */
function parseToolModel(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'auto') return null
  const sep = trimmed.indexOf(':')
  // The provider key never contains a colon, but a session model id can
  // (Ollama-style tags like 'llama3.1:8b'): split on the FIRST separator only
  // and let the non-empty halves decide validity.
  if (sep < 0) return { provider: '', model: '' }
  return { provider: trimmed.slice(0, sep).trim(), model: trimmed.slice(sep + 1).trim() }
}

export async function executeOmnimuxText(input) {
  if (input.model === '@agent' || input.model === '@local') {
    const alias = input.model.slice(1)
    if (input.group && !['agent', 'local'].includes(input.group)) throw new OmnimuxError('omnimux-invalid-request', '本机助手与所选渠道相互冲突')
    if (Array.isArray(input.allowedGroups) && input.allowedGroups.length
      && !input.allowedGroups.some((group) => group === 'agent' || group === 'local')) throw new OmnimuxError('omnimux-invalid-request', '本机助手不在允许渠道范围内')
    input = { ...input, model: undefined, group: alias }
  }
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

  // Tool-model bypass: a configured `omnimux.toolModel` pins the request to one
  // session-reachable provider:model pair and streams through ctx.llm — the
  // same stack a conversation uses — instead of the runtimeMode routing below.
  // Video/audio/document references must skip this lane: ctx.llm.stream
  // attachments cannot carry a video MIME, so the tool-model channel
  // physically cannot serve them and the multimodal route below has to run.
  try { assertScenarioRequestIntent(input) }
  catch (cause) { throw new OmnimuxError('omnimux-invalid-request', cause.message) }
  const requestedIntent = resolveRequestChannelIntent(input)
  const toolModelUsable = references.every((asset) => asset.type === 'image')
    && !input.model && !requestedIntent.requestedChannel && !requestedIntent.effectiveChannel
  const toolModel = toolModelUsable
    ? parseToolModel(input.toolModel
      ?? readScenarioSettings(input.settings).toolModel)
    : null
  if (toolModel !== null) {
    if (!toolModel.provider || !toolModel.model) {
      const storedRaw = typeof input.toolModel === 'string' ? input.toolModel
        : readScenarioSettings(input.settings).toolModel
      const stored = typeof storedRaw === 'string' ? storedRaw.trim() : ''
      throw new OmnimuxError('omnimux-unconfigured',
        `工具模型不可用${stored ? `（${stored}）` : ''}，请在设置中重新选择`)
    }
    if (references.some((asset) => asset.type !== 'image')) {
      throw new OmnimuxError('omnimux-invalid-request',
        'tool model only accepts text and image input')
    }
    if (!input.llm || typeof input.llm.stream !== 'function') {
      throw new OmnimuxError('needs-provider', 'textComplete requires ctx.llm')
    }
    const probedTool = []
    for (const asset of references) {
      if (!input.attachments || typeof input.attachments.saveImage !== 'function') {
        throw new OmnimuxError('needs-provider', 'image input requires ctx.attachments')
      }
      probedTool.push(await probeTextImage(asset.pathOrUrl, {
        attachments: input.attachments, fetcher: input.fetcher, signal: input.signal,
      }))
    }
    const toolContent = [{ type: 'text', text: prompt }]
    for (const media of probedTool) {
      const attachment = await saveProbedTextImage(media, input.attachments)
      toolContent.push({ type: 'image', attachment })
    }
    const toolResult = await streamTextReply(input.llm, {
      provider: toolModel.provider,
      model: toolModel.model,
      prompt,
      system: typeof input.system === 'string' ? input.system.trim() : '',
      maxTokens: typeof input.maxTokens === 'number' && Number.isFinite(input.maxTokens) && input.maxTokens > 0
        ? input.maxTokens : text.maxTokens,
      content: toolContent,
      signal: input.signal,
      sessionId: input.sessionId,
    })
    // Report the stored composite so callers can see which provider ran it.
    return { ...toolResult, model: `${toolModel.provider}:${toolModel.model}` }
  }

  const runtimeSettings = readScenarioSettings(input.settings)
  const scenario = references.length ? 'analysis' : 'text'
  const { modelId: inputModelId } = parseModelAndGroup(input.model)
  const channelIntent = requestedIntent
  const targetChannel = String(channelIntent.requestedChannel || channelIntent.effectiveChannel || '').toLowerCase().trim()
  const isExplicitAgent = targetChannel === 'agent' || targetChannel === 'local'
  const explicitOfficial = channelIntent.isOfficialChannel
    || Boolean(inputModelId && CHAT_MODEL_IDS.includes(inputModelId) && !targetChannel)
  let scenarioSettings = runtimeSettings
  if (channelIntent.isByokChannel || isExplicitAgent || explicitOfficial) {
    const binding = channelIntent.isByokChannel
      ? { channel: 'byok', provider: channelIntent.byokProvider }
      : { channel: isExplicitAgent ? 'agent' : 'official' }
    scenarioSettings = { ...runtimeSettings,
      scenarioBindings: { ...runtimeSettings.scenarioBindings, [scenario]: binding } }
  }
  const choice = resolveScenarioChoice(scenarioSettings, scenario)
  if (targetChannel && !channelIntent.isByokChannel && !isExplicitAgent && !channelIntent.isOfficialChannel) {
    throw new OmnimuxError('unknown-group', '所选文字渠道不可用')
  }
  if (!choice.configured) throw new OmnimuxError('omnimux-unconfigured', choice.reason || '此用途尚未配置')
  const useByok = choice.channel === 'byok'
  const useAgent = choice.channel === 'agent'
  if (useAgent && references.length) throw new OmnimuxError('omnimux-invalid-request', '本机助手只承接纯文字，请配置素材理解服务')
  const isOfficialRequest = choice.channel === 'official'
  if (isOfficialRequest && !input.env) input = { ...input, env: process.env }

  // Local agent: text goes to the selected CLI and back. Media references are
  // out of scope for the agent path in this version — only plain text rides it.
  if (useAgent) {
    if (references.length > 0) {
      throw new OmnimuxError('omnimux-invalid-request', '本机助手目前只承接纯文字任务')
    }
    try {
      const agentRun = typeof input.agentRun === 'function' ? input.agentRun : runAgentText
      const agentModel = inputModelId || String(runtimeSettings?.runtimeAgentModel ?? '').trim()
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
  let officialText = text
  if (isOfficialRequest && !input.model && runtimeSettings.defaultTextModel) {
    const catalog = buildModelCatalog({ text, gate, env: input.env || {}, settingsDefaults: runtimeSettings })
    const savedDefault = catalog.defaults.text
    const compatible = catalog.text.find((row) => row.id === savedDefault)
    if (compatible && references.every((asset) => compatible.input?.includes(asset.type))) officialText = { ...text, defaultModel: savedDefault }
    else if (references.length === 0 && savedDefault) officialText = { ...text, defaultModel: savedDefault }
  }
  const route = useByok
    ? null
    : resolveTextRoute({
      model: input.model,
      references,
      strategy: input.strategy,
      group: input.group,
      allowedGroups: input.allowedGroups,
    }, officialText, input.env, gate)

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
      // Tests may inject a fixture catalog; production callers pass nothing.
      index: input.catalogIndex,
      specsDir: input.specsDir,
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
    const hit = await input.credentials?.resolve?.(choice.credentialRef)
    const byokKey = typeof hit?.value === 'string' ? hit.value.trim() : ''
    if (!byokKey) {
      throw new OmnimuxError('omnimux-unconfigured', '自备密钥未找到，请在设置中重新填写')
    }
    const byokEndpoint = choice.endpoint
    if (!byokEndpoint) {
      throw new OmnimuxError('omnimux-unconfigured', '自备密钥缺少接口地址')
    }
    // The user's endpoint knows their model, not the official directory's.
    // An explicit caller model wins; otherwise the tested runtimeKeyModel goes.
    const byokModel = (typeof input.model === 'string' ? input.model.split('@')[0].trim() : '') || choice.model
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
  const result = await streamTextReply(input.llm, {
    provider: route.providerId,
    model: route.modelId,
    prompt,
    system,
    maxTokens,
    content,
    signal: input.signal,
    sessionId: input.sessionId,
  })
  assertGuardOutput(guardPlan, result, { capability: 'text' })
  return result
}

/**
 * Collect one ctx.llm.stream completion into the textComplete result shape.
 *
 * Shared by the catalog route (provider=hub default) and the tool-model bypass
 * (provider=session provider key) so reasoning-channel filtering, finish-error
 * mapping, and the empty-body guard stay identical on both paths.
 *
 * @param {{ stream: (options: object) => AsyncIterable<object> }} llm
 * @param {{ provider: string, model: string, prompt: string, system: string, maxTokens: number, content: Array<object>, signal?: AbortSignal, sessionId?: unknown }} input
 */
async function streamTextReply(llm, input) {
  const options = {
    provider: input.provider,
    model: input.model,
    messages: [{ role: 'user', content: input.content }],
    maxTokens: input.maxTokens,
    ...(input.system ? { system: input.system } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  }
  let assembled = ''
  let sawReasoning = false
  let finish
  for await (const chunk of llm.stream(options)) {
    if (!chunk || typeof chunk !== 'object') continue
    const row = /** @type {Record<string, unknown>} */ (chunk)
    // Reasoning is a separate channel: it must never accumulate into the body,
    // otherwise a thinking preamble ships as the business answer.
    if (typeof row.type === 'string' && (row.type === 'reasoning-delta' || row.type === 'reasoning'
      || row.type === 'thinking-delta' || row.type === 'thinking')) {
      sawReasoning = true
      continue
    }
    if (row.type === 'text-delta' && typeof row.text === 'string') assembled += row.text
    if (row.type === 'block-end' && row.block && typeof row.block === 'object') {
      const block = /** @type {Record<string, unknown>} */ (row.block)
      if (block.type === 'reasoning' || block.type === 'thinking') {
        sawReasoning = true
        continue
      }
      if (block.type === 'text' && typeof block.text === 'string') {
        // A closed text block is authoritative for its own content: prefer it
        // over whatever partial deltas preceded it, especially if preceding deltas
        // only held reasoning preambles.
        const trimmedCurrent = assembled.trim()
        if (!trimmedCurrent || REASONING_PREAMBLE_RE.test(trimmedCurrent) || block.text.length > assembled.length) {
          assembled = block.text
        }
      }
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
  const trimmedFinal = assembled.trim()
  if (!trimmedFinal || (REASONING_PREAMBLE_RE.test(trimmedFinal) && trimmedFinal.length < 120)) {
    throw new OmnimuxError('omnimux-invalid-response', (sawReasoning || REASONING_PREAMBLE_RE.test(trimmedFinal))
      ? '模型只返回了思考过程，没有给出正文，请重试或降低推理等级'
      : 'text complete produced no text')
  }
  return { mode: 'live', model: input.model, text: assembled }
}
