import { OmnimuxError, unwrapAdapterError } from './errors.js'
import { hasChannelEvidence, hasGroupFailoverEvidence } from '../errors/channel-classifier.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { downloadMediaFile } from './job.js'
import { createOpenAiMediaRuntime, pollOpenAiMediaTask } from './protocols/openai-media.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute } from './route.js'
import { mapOmnimuxInput, pickMediaUrl, taskPathFor } from './vendors/omnimux.js'
import {
  assertGuardOutput,
  assertGuardSubmit,
} from '../catalog/contract/submit-guard/index.js'
import { probeMediaAssets } from './asset-probe.js'
import { MEDIA_EXECUTION_BUDGET_MS } from './task-deadline.js'
import { generateSpeech } from './speech.js'
import { hostLocalAssetsIfNeeded, isRemoteGateway } from './gateway-upload.js'
import { resolveRuntimeChoice, resolveMediaProviderChoice, DEFAULT_MEDIA_MODELS } from '../settings/runtime-mode.js'
import { resolveRequestChannelIntent, parseModelAndGroup, isOfficialChannelId } from '../catalog/serving/channel-groups.js'
import { DEFAULT_PROVIDER_ENDPOINTS, BYOK_KEY_REF } from '../byok/http.js'
export { probeMediaAssets } from './asset-probe.js'
export { hostLocalAssetsIfNeeded, uploadMediaToGateway, isLocalMediaSource } from './gateway-upload.js'

const CAPABILITY_TO_KEY = Object.freeze({
  image: 'runtimeMediaImage',
  video: 'runtimeMediaVideo',
  audio: 'runtimeMediaAudio',
})

/**
 * 校验指定 BYOK Provider 条目是否支持目标媒体模态能力。
 *
 * @param {Record<string, unknown> | null | undefined} item
 * @param {'image' | 'video' | 'audio' | string} capability
 * @returns {boolean}
 */
function isByokItemCapabilityMatch(item, capability) {
  if (!item || typeof item !== 'object') return false
  if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
    return item.capabilities.includes(capability)
  }
  if (typeof item.capability === 'string' && item.capability.trim()) {
    return item.capability.trim().toLowerCase() === capability
  }
  const capKey = CAPABILITY_TO_KEY[capability] || ''
  const isCurrentCapTrue = Boolean(item[capability] === true || (capKey && item[capKey] === true))
  const isCurrentCapFalse = Boolean(item[capability] === false || (capKey && item[capKey] === false))
  const hasCapModel = Boolean(
    (item.models && typeof item.models === 'object' && item.models[capability])
    || item[`${capability}Model`]
  )
  if (isCurrentCapFalse) return false
  if (isCurrentCapTrue) return true
  return hasCapModel
}

/**
 * 解析媒体生成请求的最終有效模型 ID。
 *
 * 优先级契约（从高到低）：
 * 1. 消费端显式传入的 `inputModel`（剥离 `@channelGroup` 后缀后的非空模型 ID）；
 * 2. 指定 Provider 对应的特定模型配置（优先匹配 runtimeSettings.byokProviders 中的 provider 配置，其次匹配主媒体 provider 配置）；
 * 3. 全局自定义模型 `runtimeSettings.runtimeKeyModel`；
 * 4. 能力级兜底默认模型 `DEFAULT_MEDIA_MODELS[capability]`。
 *
 * @param {unknown} inputModel - 调用方/画布节点传入的 model 参数（可能带 `@group` 后缀）
 * @param {string} [provider] - 目标提供商标识 ('omnimux' | 'fal' | 'openai' | 'openrouter' | 'siliconflow' | 'custom')
 * @param {'image' | 'video' | 'audio'} capability - 媒体能力类型
 * @param {Record<string, unknown> | undefined} [runtimeSettings] - 运行时设置快照
 * @returns {string} 解析后的有效模型 ID
 */
export function resolveEffectiveMediaModel(inputModel, provider, capability, runtimeSettings) {
  const { modelId: inputModelId, group: inputGroup } = typeof inputModel === 'string'
    ? parseModelAndGroup(inputModel)
    : { modelId: '', group: null }
  const inputTargetsByok = typeof inputGroup === 'string' && inputGroup.toLowerCase().startsWith('byok-')

  const normProvider = typeof provider === 'string' && provider.trim()
    ? provider.toLowerCase().trim()
    : (inputTargetsByok && typeof inputGroup === 'string' ? inputGroup.slice(5).toLowerCase().trim() : '')

  // 1. 若存在非空的 inputModelId，优先返回调用方显式传入的逻辑模型 ID（剥离 @group 路由后缀）
  if (inputModelId) {
    return inputModelId
  }

  // 2. 检查多 Provider 扩展列表 (byokProviders) 中是否有对应 provider 的模型配置
  // 健壮化：过滤所有匹配记录，严格校验生成模态 capability，优先选取已验证且配置了该模态模型的记录
  if (Array.isArray(runtimeSettings?.byokProviders) && normProvider) {
    const matchedItems = runtimeSettings.byokProviders.filter((item) =>
      item && typeof item === 'object' && typeof item.provider === 'string' && item.provider.toLowerCase().trim() === normProvider
    )
    const hasExplicitModel = (item) => {
      const m = (item.models && typeof item.models === 'object' && item.models[capability])
        || item[`${capability}Model`]
      return typeof m === 'string' && m.trim().length > 0
    }
    const hasAnyModel = (item) => {
      const m = (item.models && typeof item.models === 'object' && item.models[capability])
        || item[`${capability}Model`]
        || item.model
      return typeof m === 'string' && m.trim().length > 0
    }
    const verifiedItems = matchedItems.filter((item) => item.verified === true && isByokItemCapabilityMatch(item, capability))
    const bestMatched = verifiedItems.find(hasExplicitModel)
      || verifiedItems.find(hasAnyModel)
      || null

    if (bestMatched) {
      const capModel = (bestMatched.models && typeof bestMatched.models === 'object' && bestMatched.models[capability])
        || bestMatched[`${capability}Model`]
        || bestMatched.model
      if (typeof capModel === 'string' && capModel.trim()) {
        return capModel.trim()
      }
    }
  }

  const activeMediaProvider = typeof runtimeSettings?.runtimeMediaProvider === 'string' && runtimeSettings.runtimeMediaProvider.trim()
    ? runtimeSettings.runtimeMediaProvider.toLowerCase().trim()
    : 'fal'
  const isMatchingActiveProvider = !normProvider || normProvider === activeMediaProvider

  // 3. 检查主媒体 Provider 中用户显式配置的专属物理模型（如 runtimeMediaVideoModel: '...'）
  const explicitCapKey = `runtimeMedia${capability.charAt(0).toUpperCase() + capability.slice(1)}Model`
  const explicitMainCapModel = isMatchingActiveProvider && typeof runtimeSettings?.[explicitCapKey] === 'string'
    ? runtimeSettings[explicitCapKey].trim()
    : ''
  if (explicitMainCapModel) {
    return explicitMainCapModel
  }

  const mediaChoice = resolveMediaProviderChoice(runtimeSettings, capability)
  const hasMediaProvider = Boolean(runtimeSettings?.runtimeMediaProvider)
  const customModel = typeof runtimeSettings?.runtimeKeyModel === 'string'
    ? runtimeSettings.runtimeKeyModel.trim()
    : ''
  const safeActiveModel = isMatchingActiveProvider && typeof mediaChoice.activeModel === 'string' && mediaChoice.activeModel.trim()
    ? mediaChoice.activeModel.trim()
    : ''

  // 5. 兜底回退：customModel -> safeActiveModel -> DEFAULT_MEDIA_MODELS -> 'default'
  if (hasMediaProvider) {
    return safeActiveModel || customModel || (DEFAULT_MEDIA_MODELS && DEFAULT_MEDIA_MODELS[capability]) || 'default'
  }
  return customModel || safeActiveModel || (DEFAULT_MEDIA_MODELS && DEFAULT_MEDIA_MODELS[capability]) || 'default'
}

export const EXTERNAL_MEDIA_PROVIDERS = Object.freeze(['byok', 'fal', 'openai', 'openrouter', 'siliconflow', 'custom'])

/**
 * 判定指定的媒体提供商是否属于外部/BYOK 提供商（豁免官方 SubmitGuard 目录契约）
 * @param {unknown} providerId
 * @returns {boolean}
 */
export function isExternalMediaProvider(providerId) {
  return typeof providerId === 'string' && EXTERNAL_MEDIA_PROVIDERS.includes(providerId.toLowerCase().trim())
}

const CAPABILITY_SEAM = Object.freeze({
  video: 'videoGenerate',
  image: 'imageGenerate',
  audio: 'audioGenerate',
})

/**
 * @param {string} capability
 * @param {{
 *   prompt?: string,
 *   dest: string,
 *   duration?: number,
 *   image?: string,
 *   speech?: string,
 *   audio?: string,
 *   references?: Array<{ role?: string, type: string, pathOrUrl: string, [key: string]: unknown }>,
 *   audioTrack?: { role?: string, type: string, pathOrUrl: string, [key: string]: unknown },
 *   voice?: string,
 *   style?: string,
 *   instrumental?: boolean,
 *   speed?: number,
 *   format?: string,
 *   aspectRatio?: string,
 *   resolution?: string,
 *   sound?: boolean,
 *   seed?: number,
 *   watermark?: boolean,
 *   outputFormat?: string,
 *   referenceTaskType?: string,
 *   generationType?: string,
 *   returnLastFrame?: boolean,
 *   webSearch?: boolean,
 *   nsfwCheck?: boolean,
 *   fileUrl?: string,
 *   linkUrl?: string,
 *   provider?: string,
 *   model?: string,
 *   operation?: string,
 *   image_tail?: string,
 *   imageTail?: string,
 *   taskId?: string,
 *   submittedAt?: number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   wait?: boolean,
 *   signal?: AbortSignal,
 *   env?: Record<string, string | undefined>,
 *   media?: unknown,
 *   fetcher?: typeof fetch,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   runtime?: { execute: (req: object) => Promise<{ taskId?: string, outputs: Array<{ type: string, url?: string }> }> },
 * }} input
 */
const KNOWN_CAPABILITIES = Object.freeze(['image', 'video', 'audio'])

export async function executeOmnimuxMedia(capability, input) {
  if (!KNOWN_CAPABILITIES.includes(capability)) {
    throw new OmnimuxError('omnimux-invalid-request', `不支持的媒体能力类型: ${capability}，仅支持 image/video/audio`)
  }
  if (!input || typeof input !== 'object') {
    throw new OmnimuxError('omnimux-invalid-request', 'input must be an object')
  }
  if (!input.dest) {
    throw new OmnimuxError('omnimux-invalid-request', 'dest is required')
  }
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : ''
  let media = parseMediaConfig(input.media)

  const runtime = resolveRuntimeChoice(input.runtimeSettings)
  const mediaChoice = resolveMediaProviderChoice(input.runtimeSettings, capability)

  const channelIntent = resolveRequestChannelIntent(input)
  const { isByokChannel, isOfficialChannel, byokProvider } = channelIntent

  if (isByokChannel && !byokProvider) {
    throw new OmnimuxError('omnimux-invalid-request', 'BYOK 渠道名称不合法或缺少提供商标识')
  }

  const hasExplicitUnknownChannel = Boolean(
    channelIntent.requestedChannel
    && !isOfficialChannel
    && !isByokChannel,
  )
  if (hasExplicitUnknownChannel) {
    throw new OmnimuxError('unknown-group', `所选渠道分组不可用（${channelIntent.requestedChannel}）`)
  }

  // 对无渠道偏好但配置了媒体 Provider 为 custom 的分支，若端点为空增加非空拦截
  if (!isOfficialChannel && !isByokChannel && (mediaChoice.provider === 'custom' || input.runtimeSettings?.runtimeMediaProvider === 'custom') && !mediaChoice.endpoint) {
    throw new OmnimuxError('omnimux-unconfigured', `${mediaChoice.provider || 'custom'} 媒体端点未配置，请在设置中填写`)
  }

  // 提取与当前模态匹配且已验证的 BYOK 记录，用于缺少显式渠道时的提供商解析
  const matchedImplicitByokItem = Array.isArray(input.runtimeSettings?.byokProviders)
    ? input.runtimeSettings.byokProviders.find((item) =>
        item && typeof item === 'object' && item.verified === true
        && typeof item.provider === 'string' && item.provider.trim()
        && isByokItemCapabilityMatch(item, capability)
      ) || null
    : null
  const implicitByokProvider = matchedImplicitByokItem ? matchedImplicitByokItem.provider.toLowerCase().trim() : ''

  if (runtime.mode === 'agent' && !isOfficialChannel && !isByokChannel && !mediaChoice.ready && !implicitByokProvider) {
    throw new OmnimuxError('omnimux-unconfigured', '本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方')
  }

  // 渠道分组白名单与混杂渠道 Fail-Closed 阻断：拦截未知渠道分组并杜绝官方与 BYOK 渠道混用
  if (Array.isArray(input.allowedGroups) && input.allowedGroups.length > 0) {
    const normalizedAllowedGroups = input.allowedGroups
      .map((g) => (typeof g === 'string' ? g.toLowerCase().trim() : ''))
      .filter(Boolean)
    const hasAllowedByok = normalizedAllowedGroups.some((g) => g.startsWith('byok-'))
    const hasAllowedOfficial = normalizedAllowedGroups.some((g) => !g.startsWith('byok-') && isOfficialChannelId(g))
    const unknownAllowed = normalizedAllowedGroups.filter((g) => !g.startsWith('byok-') && !isOfficialChannelId(g))
    if (unknownAllowed.length > 0) {
      throw new OmnimuxError('unknown-group', `所选渠道分组不可用（${unknownAllowed.join(', ')}）`)
    }
    if (hasAllowedByok && hasAllowedOfficial) {
      throw new OmnimuxError('unknown-group', '所选渠道包含冲突的渠道分组')
    }
  }

  // Media Generation Providers (fal.ai, OpenAI, OpenRouter, or custom key).
  // When configured and verified, requests route directly to the chosen media provider.
  // Local agent CLI handles conversation text and coexists peacefully without blocking media.
  const isCustomKeyReady = runtime.mode === 'key'
    && !(typeof input.runtimeSettings?.runtimeMediaProvider === 'string' && input.runtimeSettings.runtimeMediaProvider.trim())
    && typeof input.runtimeSettings?.runtimeKeyEndpoint === 'string'
    && input.runtimeSettings.runtimeKeyEndpoint.trim().length > 0
    && input.runtimeSettings?.runtimeKeyVerified === true
  const hasReadyByokProvider = Boolean(implicitByokProvider)
  const shouldRouteByok = isByokChannel || (!isOfficialChannel && runtime.mode !== 'official' && (mediaChoice.ready || isCustomKeyReady || hasReadyByokProvider))

  if (shouldRouteByok) {
    let configuredMainProvider = ''
    if (typeof input.runtimeSettings?.runtimeMediaProvider === 'string' && input.runtimeSettings.runtimeMediaProvider.trim()) {
      configuredMainProvider = input.runtimeSettings.runtimeMediaProvider.toLowerCase().trim()
    } else if (runtime.mode === 'key' && typeof input.runtimeSettings?.runtimeKeyEndpoint === 'string' && input.runtimeSettings.runtimeKeyEndpoint.trim()) {
      configuredMainProvider = 'custom'
    }

    const isMainCapEnabled = Boolean(mediaChoice.isCapEnabled)
    let fallbackProvider = ''
    if (!isMainCapEnabled && implicitByokProvider) {
      // 缺少显式渠道时，如果主媒体提供商当前模态未启用，但 byokProviders 中存在模态匹配且已验证的项，安全选用该 implicitByokProvider
      fallbackProvider = implicitByokProvider
    } else {
      const isMainReady = isCustomKeyReady || Boolean(mediaChoice.ready)
      if (isMainReady) {
        fallbackProvider = configuredMainProvider || mediaChoice.provider
      } else if (implicitByokProvider) {
        fallbackProvider = implicitByokProvider
      } else {
        fallbackProvider = configuredMainProvider || mediaChoice.provider
      }
    }

    const rawProvider = (byokProvider || fallbackProvider || '').toLowerCase().trim()
    if (!rawProvider) {
      throw new OmnimuxError('omnimux-invalid-request', '缺少有效的媒体生成提供商')
    }
    const provider = rawProvider

    // 检查对应的 BYOK provider 是否已在配置中验证（当 runtimeMediaProvider 缺失时严禁静默回退到 fal）
    const isMainVerified = Boolean(configuredMainProvider && configuredMainProvider === provider)
      && input.runtimeSettings?.runtimeKeyVerified === true
    const byokCandidates = Array.isArray(input.runtimeSettings?.byokProviders)
      ? input.runtimeSettings.byokProviders.filter((item) =>
          item && typeof item === 'object' && typeof item.provider === 'string'
          && item.provider.toLowerCase().trim() === provider
        )
      : []
    // 优先选取通过验证且具备该模态能力的记录，避免前置失效记录遮蔽后置有效记录
    // 仅当通过验证且真实具备该模态能力时才作为 matchedByokItem，否则置为 null 以回退至主渠道 isMainVerified
    const matchedByokItem = byokCandidates.find((item) => {
      if (item.verified !== true) return false
      return isByokItemCapabilityMatch(item, capability)
    }) || null
    const hasVerifiedByokCandidate = byokCandidates.some((item) => item && typeof item === 'object' && item.verified === true)
    const isByokListVerified = Boolean(matchedByokItem && matchedByokItem.verified === true)

    if (!isMainVerified && !isByokListVerified) {
      if (hasVerifiedByokCandidate) {
        throw new OmnimuxError('omnimux-unconfigured', `媒体生成提供商未开启${capability === 'image' ? '图片' : capability === 'video' ? '视频' : '音频'}，请在设置中勾选`)
      }
      throw new OmnimuxError('omnimux-unconfigured', `自备渠道 ${provider} 未配置或未通过验证，请在设置中完成配置与验证`)
    }

    let capKey = ''
    if (capability === 'image') {
      capKey = 'runtimeMediaImage'
    } else if (capability === 'video') {
      capKey = 'runtimeMediaVideo'
    } else if (capability === 'audio') {
      capKey = 'runtimeMediaAudio'
    }
    const capShort = capability
    let isByokCapEnabled = false
    if (matchedByokItem) {
      // 对齐模态能力判定：直接复用 isByokItemCapabilityMatch
      isByokCapEnabled = isByokItemCapabilityMatch(matchedByokItem, capability)
    } else if (isMainVerified && (!isByokChannel || !hasVerifiedByokCandidate)) {
      // 回退至主渠道 isMainVerified 路径：
      // 1. 非显式指定 BYOK 渠道时（!isByokChannel）：模态不匹配记录绝不遮蔽主提供商
      // 2. 虽指定了 BYOK 渠道但 byokProviders 中无对应已验证记录（!hasVerifiedByokCandidate）：主配置即为该 provider 的真源
      const isKeyDirect = runtime.mode === 'key' && !input.runtimeSettings?.runtimeMediaProvider
      if (isKeyDirect) {
        const endpointValid = typeof input.runtimeSettings?.runtimeKeyEndpoint === 'string'
          && input.runtimeSettings.runtimeKeyEndpoint.trim().length > 0
        const isVerified = input.runtimeSettings?.runtimeKeyVerified === true
        isByokCapEnabled = Boolean(mediaChoice.isCapEnabled && endpointValid && isVerified)
      } else {
        isByokCapEnabled = Boolean(mediaChoice.isCapEnabled)
      }
    }

    if (!isByokCapEnabled) {
      throw new OmnimuxError('omnimux-unconfigured', `媒体生成提供商未开启${capability === 'image' ? '图片' : capability === 'video' ? '视频' : '音频'}，请在设置中勾选`)
    }

    // 模型配置层级的有效性独立判定：确保解析得到非空的有效模型，消除死代码
    const effectiveModel = resolveEffectiveMediaModel(input.model, provider, capability, input.runtimeSettings)
    if (!effectiveModel || !effectiveModel.trim()) {
      throw new OmnimuxError('omnimux-unconfigured', `${provider} 媒体模型未配置，请在设置中指定`)
    }

    const defaultEndpoint = DEFAULT_PROVIDER_ENDPOINTS[provider] || ''
    const endpoint = (matchedByokItem && typeof matchedByokItem.endpoint === 'string' && matchedByokItem.endpoint.trim())
      || (isMainVerified ? mediaChoice.endpoint : '')
      || defaultEndpoint

    const usesCustomEndpoint = endpoint !== defaultEndpoint
    const needsHttpEndpoint = provider === 'custom' || !DEFAULT_PROVIDER_ENDPOINTS[provider] || usesCustomEndpoint
    if (needsHttpEndpoint && !/^https?:\/\//i.test(endpoint)) {
      throw new OmnimuxError('omnimux-unconfigured', `${provider} 媒体端点未配置或协议不合法，请在设置中填写 http(s) 地址`)
    }

    const keyRef = `OMNIMUX_MEDIA_KEY_${provider.toUpperCase()}`
    let providerKey = ''
    if (input.credentials && typeof input.credentials.resolve === 'function') {
      try {
        const hit = await input.credentials.resolve(keyRef)
        if (hit && typeof hit.value === 'string' && hit.value.trim()) providerKey = hit.value.trim()
      } catch { /* fall through */ }
      if (!providerKey && (provider === 'fal' || provider === 'custom')) {
        try {
          const hit = await input.credentials.resolve(BYOK_KEY_REF)
          if (hit && typeof hit.value === 'string' && hit.value.trim()) providerKey = hit.value.trim()
        } catch { /* fall through */ }
      }
    }
    // 严格限制仅从服务端凭据库或服务侧环境安全读取，绝不信任客户端 payload 的 input.env
    if (!providerKey) {
      const serverEnvVal = typeof process.env[keyRef] === 'string' ? process.env[keyRef].trim() : ''
      if (serverEnvVal) {
        providerKey = serverEnvVal
      } else if (provider === 'fal' || provider === 'custom') {
        const byokEnvVal = typeof process.env[BYOK_KEY_REF] === 'string' ? process.env[BYOK_KEY_REF].trim() : ''
        if (byokEnvVal) {
          providerKey = byokEnvVal
        }
      }
    }
    if (!providerKey) {
      throw new OmnimuxError('omnimux-unconfigured', `${provider} 媒体 API 密钥未找到，请在设置中填写`)
    }

    media = {
      ...media,
      providers: {
        ...media.providers,
        [provider]: {
          protocol: 'openai-media',
          baseUrl: endpoint,
          apiKeyEnv: keyRef,
          models: {
            [capability]: effectiveModel,
          },
        },
        byok: {
          protocol: 'openai-media',
          baseUrl: endpoint,
          apiKeyEnv: keyRef,
          models: {
            [capability]: effectiveModel,
          },
        },
      },
    }
    const safeEnv = { ...(input.env ?? {}) }
    delete safeEnv.OMNIMUX_API_KEY
    delete safeEnv.OMNIMUX_TOKEN
    input = {
      ...input,
      provider,
      model: effectiveModel,
      env: {
        ...safeEnv,
        [keyRef]: providerKey,
        ...(provider === 'fal' ? { [BYOK_KEY_REF]: providerKey } : {}),
      },
    }
  }

  const route = resolveMediaRoute(capability, input, media, input.env)

  // taskId poll/finish: skip initial asset SubmitGuard and do not resubmit.
  if (taskId) {
    const auth = await resolveMediaAuth(route, {
      env: input.env,
      store: input.store,
      credentials: input.credentials,
    })
    return finishMediaTask(capability, route, { ...input, taskId, authKey: auth.apiKey })
  }

  const prompt = typeof input.prompt === 'string' ? input.prompt : ''
  const seam = CAPABILITY_SEAM[capability] ?? capability
  const assets = await probeMediaAssets(input, { capability, seam })

  // Media providers (fal, openai, openrouter, siliconflow, custom, byok) are external endpoints.
  // Skip the submit guard for them; the endpoint decides what it accepts.
  const isByok = isExternalMediaProvider(route.providerId)
  let guardPlan = null
  if (isByok) {
    guardPlan = {
      plan: null,
      byok: true,
      prompt,
      modelId: route.modelId,
      // A BYOK endpoint speaks the generic speech shape; ride the synchronous
      // channel unless the caller named another operation.
      operationId: typeof input.operation === 'string' && input.operation.trim()
        ? input.operation.trim()
        : (capability === 'audio' ? 'text_to_speech' : undefined),
    }
  } else {
    guardPlan = assertGuardSubmit(
    {
      prompt,
      model: route.modelId,
      operation: input.operation,
      speech: input.speech,
      duration: input.duration,
      voice: input.voice,
      style: input.style,
      instrumental: input.instrumental,
      speed: input.speed,
      format: input.format,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      sound: input.sound,
      seed: input.seed,
      watermark: input.watermark,
      outputFormat: input.outputFormat,
      referenceTaskType: input.referenceTaskType,
      generationType: input.generationType,
      returnLastFrame: input.returnLastFrame,
      webSearch: input.webSearch,
      nsfwCheck: input.nsfwCheck,
      fileUrl: input.fileUrl,
      linkUrl: input.linkUrl,
      assets,
      capability,
      seam,
    },
    {
      seam,
      capability,
      outputType: capability === 'video' || capability === 'image' || capability === 'audio' ? capability : undefined,
    },
  )
  }

  const auth = await resolveMediaAuth(route, {
    env: input.env,
    store: input.store,
    credentials: input.credentials,
  })

  const wait = input.wait !== false
  const mappedInput = mapOmnimuxInput(capability, {
    prompt: guardPlan.prompt,
    model: guardPlan.modelId,
    duration: input.duration,
    image: input.image,
    speech: input.speech,
    audio: input.audio,
    references: input.references,
    audioTrack: input.audioTrack,
    voice: input.voice,
    style: input.style,
    instrumental: input.instrumental,
    speed: input.speed,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    operation: guardPlan.operationId,
    guardPlan,
  })

  if (capability === 'audio' && guardPlan.operationId === 'text_to_speech') {
    return generateSpeech({
      route, guardPlan, payload: mappedInput, apiKey: auth.apiKey,
      dest: input.dest, fetcher: input.fetcher, signal: input.signal,
    })
  }

  const shouldHost = (input.uploadLocalAssets ?? !input.runtime) && isRemoteGateway(route.baseUrl) && Boolean(auth.apiKey)
  const finalInput = shouldHost
    ? await hostLocalAssetsIfNeeded(mappedInput, {
      baseUrl: route.baseUrl,
      apiKey: auth.apiKey,
      fetcher: input.fetcher,
      signal: input.signal,
    })
    : mappedInput

  let result
  const isChannelRouting = Boolean(route.group || route.candidates?.some((c) => c.includes('@')))
  const candidates = (route.candidates && route.candidates.length > 0 ? route.candidates : [route.modelId])
    .slice(0, isChannelRouting ? 4 : 2)
  for (const [attempt, candidate] of candidates.entries()) {
    let submitted = false
    // A candidate carries routing intent as `model@wireGroup`. The group travels
    // as its own header, so the model id sent upstream must be the bare id — not
    // the candidate string, which the gateway would read as an unknown model.
    const { modelId: candidateModelId, group: candidateGroup } = splitRoutingCandidate(candidate)
    const runtime = input.runtime ?? createProtocolRuntime(
      { ...route, modelId: candidateModelId || route.modelId, group: candidateGroup ?? route.group, taskPath: taskPathFor(capability, route.modelId) },
      input.fetcher, auth.apiKey, () => { submitted = true },
    )
    try {
      result = await runtime.execute({
        providerId: route.providerId,
        modelId: `${route.providerId}-${capability}`,
        input: { ...finalInput, model: candidateModelId || candidate },
        // Covers submit *and* the poll this same call performs when it waits
        // (`metadata.wait`): the outer budget must sit above the poll deadline,
        // otherwise runtime-kit's own abort replaces `omnimux-task-timeout`.
        timeoutMs: MEDIA_EXECUTION_BUDGET_MS,
        metadata: { wait },
        ...(input.signal ? { signal: input.signal } : {}),
      })
      break
    } catch (error) {
      const unwrapped = unwrapAdapterError(error)
      const classified = classifyQuotaFailure({ error, cause: error, message: error?.message })
      if (classified.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classified.message)
      }
      // A group plan may still succeed on its next group when this one is
      // forbidden or does not serve the model. A plain alias fallback must not:
      // "model not found" tells the alias nothing new, so it keeps the narrow
      // channel-evidence rule.
      const channelUnavailable = unwrapped?.code === 'CHANNEL_UNAVAILABLE'
        || (isChannelRouting ? hasGroupFailoverEvidence(unwrapped) : hasChannelEvidence(unwrapped))
      if (channelUnavailable && classified.kind === 'needs-omnimux') {
        throw new OmnimuxError(classified.code, classified.message)
      }
      if (channelUnavailable && !submitted && !input.signal?.aborted && attempt + 1 < candidates.length) continue
      throw unwrapped
    }
  }

  if (!guardPlan?.byok) {
    assertGuardOutput(guardPlan, result, { capability })
  }

  const url = result.outputs.find((item) => item.type === capability)?.url
  const submittedId = result.taskId ?? null
  if (!wait && !url) {
    if (!submittedId) {
      throw new OmnimuxError('omnimux-invalid-response', 'submit returned no task_id')
    }
    return { mode: 'submitted', taskId: submittedId, url: null }
  }
  if (!url) {
    throw new OmnimuxError('omnimux-invalid-response', `runtime completed without a ${capability} url`)
  }
  await downloadMediaFile({
    dest: input.dest,
    url,
    capability,
    apiKey: auth.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
  })
  return { mode: 'live', taskId: submittedId, url }
}

/**
 * Poll a task by id and download its artifact — the hub's reconcile entry.
 *
 * Issue #1382: this path reads no process-local state (the hub keeps no task
 * ledger), which is exactly why it can finish a task submitted by a *previous*
 * process. What it gained here is a bound and an anchor: `submittedAt` (the
 * persisted first-submit time) fixes the deadline so a restart cannot restart
 * the clock, and past that deadline the call fails immediately without issuing
 * a single request.
 *
 * @param {string} capability
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {{
 *   dest: string,
 *   taskId: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 *   authKey?: string,
 *   env?: Record<string, string | undefined>,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   submittedAt?: number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} input
 */
export async function finishMediaTask(capability, route, input) {
  let apiKey = input.authKey
  if (apiKey === undefined) {
    const auth = await resolveMediaAuth(route, {
      env: input.env,
      store: input.store,
      credentials: input.credentials,
    })
    apiKey = auth.apiKey
  }
  const done = await pollOpenAiMediaTask({
    fetcher: input.fetcher ?? fetch,
    baseUrl: route.baseUrl,
    apiKey,
    taskId: input.taskId,
    capability,
    // Submit and reconcile must address the same task route; an audio model
    // served on the shared video task endpoint carries its own path.
    taskPath: taskPathFor(capability, route.modelId),
    signal: input.signal,
    // This is the reconcile entry a canvas node reports through, so it opts into
    // the detail read that names a terminal failure's cause (Issue #2092).
    resolveFailureReason: true,
    ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
    ...(input.deadlineMs !== undefined ? { deadlineMs: input.deadlineMs } : {}),
    ...(input.pollIntervalMs !== undefined ? { pollIntervalMs: input.pollIntervalMs } : {}),
    ...(input.requestTimeoutMs !== undefined ? { requestTimeoutMs: input.requestTimeoutMs } : {}),
    ...(input.sleep !== undefined ? { sleep: input.sleep } : {}),
  })
  const url = pickMediaUrl(done)
  if (!url) {
    throw new OmnimuxError('omnimux-invalid-response', `task ${input.taskId} completed without a ${capability} url`)
  }
  // A poll has no original submit operation to recover, but it still crosses
  // the output boundary. Validate the completed result shape here; the
  // download layer below validates the response MIME before it writes bytes.
  assertGuardOutput(
    { operation: { output: { type: capability } } },
    { mode: 'live', outputs: [{ type: capability, url }] },
    { capability },
  )
  await downloadMediaFile({
    dest: input.dest,
    url,
    capability,
    apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
  })
  return { mode: 'live', taskId: input.taskId, url }
}

/**
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {typeof fetch} [fetcher]
 * @param {string} [apiKey]
 * @param {(taskId: string) => void} [onSubmitted]
 */
function createProtocolRuntime(route, fetcher, apiKey = route.apiKey, onSubmitted) {
  if (route.protocol === 'openai-media') {
    return createOpenAiMediaRuntime({
      fetcher,
      apiKey: apiKey || '',
      baseUrl: route.baseUrl,
      providerId: route.providerId,
      modelId: route.modelId,
      capability: route.capability,
      group: route.group,
      taskPath: route.taskPath,
      onSubmitted,
    })
  }
  throw new OmnimuxError('unknown-protocol', `unsupported media protocol '${route.protocol}'`)
}

/**
 * Split a routing candidate `model@wireGroup` into its two halves.
 *
 * Routing candidates are *gateway* ids, not product ids: `gatewayCandidates`
 * deliberately keeps every upstream-accepted spelling (e.g. `seedance-2-0-fast`
 * and `seedance-2.0-fast`) so the alias retry can walk them in order. Resolving
 * the candidate through the product-id normalizer would collapse those spellings
 * into one and silently drop the retry, so this split stays literal.
 *
 * @param {unknown} candidate
 * @returns {{ modelId: string, group: string | null }}
 */
function splitRoutingCandidate(candidate) {
  const raw = typeof candidate === 'string' ? candidate.trim() : ''
  if (!raw) return { modelId: '', group: null }
  const atIndex = raw.indexOf('@')
  if (atIndex <= 0) return { modelId: raw, group: null }
  const modelId = raw.slice(0, atIndex).trim()
  const group = raw.slice(atIndex + 1).trim()
  if (!modelId) return { modelId: raw, group: null }
  return { modelId, group: group || null }
}
