/** @typedef {'official' | 'agent' | 'key'} RuntimeMode */

export const RUNTIME_MODES = Object.freeze(['official', 'agent', 'key'])

/** Supported native media generation providers */
export const MEDIA_PROVIDERS = Object.freeze(['fal', 'openai', 'openrouter', 'siliconflow', 'custom'])

export const DEFAULT_MEDIA_MODELS = Object.freeze({
  image: 'fal-ai/flux/dev',
  video: 'fal-ai/kling-video/v1/standard',
  audio: 'fal-ai/f5-tts',
})

/** Actions that are bound to the official account and always need sign-in. */
const OFFICIAL_ONLY = new Set(['publish', 'accounts', 'quota', 'inspiration'])

/**
 * Whether an action still needs the official sign-in window.
 *
 * Generation (text/media) never requires the official sign-in window:
 * users can freely generate via local CLI agents or media generation providers.
 * Only explicit account-bound actions (publish, accounts, quota, inspiration)
 * prompt for official sign-in.
 *
 * @param {unknown} settings
 * @param {string | undefined} action
 */
export function requiresOfficialSignIn(settings, action) {
  if (action && OFFICIAL_ONLY.has(action)) return true
  const choice = resolveRuntimeChoice(settings)
  return choice.mode === 'official'
}

/**
 * Resolve whether an agent CLI is chosen and ready for text tasks.
 * @param {unknown} settings
 */
export function resolveAgentChoice(settings) {
  const input = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? /** @type {Record<string, unknown>} */ (settings)
    : {}
  const agentId = typeof input.runtimeAgentId === 'string' ? input.runtimeAgentId.trim() : ''
  const isVerified = input.runtimeAgentVerified === true
  return {
    enabled: Boolean(agentId && isVerified),
    agentId,
    verified: isVerified,
    model: typeof input.runtimeAgentModel === 'string' ? input.runtimeAgentModel.trim() : '',
    reasoning: typeof input.runtimeAgentReasoning === 'string' ? input.runtimeAgentReasoning.trim() : 'default',
  }
}

/**
 * Resolve chosen media generation provider and capability mapping.
 * @param {unknown} settings
 * @param {'image' | 'video' | 'audio'} [capability]
 */
export function resolveMediaProviderChoice(settings, capability) {
  const input = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? /** @type {Record<string, unknown>} */ (settings)
    : {}
  const rawProvider = typeof input.runtimeMediaProvider === 'string' && input.runtimeMediaProvider.trim()
    ? input.runtimeMediaProvider.trim().toLowerCase()
    : 'fal'
  const provider = MEDIA_PROVIDERS.includes(rawProvider) ? rawProvider : 'fal'
  const endpoint = typeof input.runtimeKeyEndpoint === 'string' ? input.runtimeKeyEndpoint.trim() : ''
  const verified = input.runtimeKeyVerified === true

  const capKey = capability === 'image' ? 'runtimeMediaImage'
    : capability === 'video' ? 'runtimeMediaVideo'
    : capability === 'audio' ? 'runtimeMediaAudio'
    : null

  const isCapEnabled = capKey ? input[capKey] === true : true
  // Ready strictly requires passing verification and valid endpoint with http(s) protocol if custom
  const isCustom = provider === 'custom'
  const endpointValid = /^https?:\/\//i.test(endpoint)
  const ready = verified === true && (!isCustom || endpointValid)

  const modelMap = {
    image: (typeof input.runtimeMediaImageModel === 'string' && input.runtimeMediaImageModel.trim()) || DEFAULT_MEDIA_MODELS.image,
    video: (typeof input.runtimeMediaVideoModel === 'string' && input.runtimeMediaVideoModel.trim()) || DEFAULT_MEDIA_MODELS.video,
    audio: (typeof input.runtimeMediaAudioModel === 'string' && input.runtimeMediaAudioModel.trim()) || DEFAULT_MEDIA_MODELS.audio,
  }

  return {
    provider,
    endpoint,
    verified,
    ready,
    isCapEnabled,
    activeModel: capability ? modelMap[capability] : undefined,
  }
}

/**
 * Stop a request that the selected runtime has not made available.
 *
 * @param {unknown} settings
 * @param {'text' | 'image' | 'video' | 'audio'} capability
 */
export function assertRuntimeReady(settings, capability) {
  const choice = resolveRuntimeChoice(settings)
  const ready = capability === 'text'
    ? choice.textReady
    : mediaReadyFor(choice, settings, capability)
  if (ready) return choice
  const label = capability === 'text' ? '文字' : '图片、视频和音频'
  throw new Error(`尚未配置${label}，当前运行方式不能使用这一项`)
}

/**
 * 校验指定 BYOK Provider 条目是否支持目标媒体模态能力。
 *
 * @param {Record<string, unknown>} item
 * @param {'image' | 'video' | 'audio'} capability
 * @returns {boolean}
 */
function isByokItemCapabilitySupported(item, capability) {
  if (!item || typeof item !== 'object') return false
  if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
    return item.capabilities.includes(capability)
  }
  const capKey = capability === 'image' ? 'runtimeMediaImage'
    : capability === 'video' ? 'runtimeMediaVideo'
    : capability === 'audio' ? 'runtimeMediaAudio'
    : ''
  const capShort = capability
  if (item[capKey] === false || item[capShort] === false) {
    return false
  }
  if (item[capKey] === true || item[capShort] === true) {
    return true
  }

  // 收敛至模态专属模型判定规则：未显式配置开关时，必须声明该模态的专属模型
  return Boolean(
    (item.models && typeof item.models === 'object' && item.models[capability])
    || item[`${capability}Model`]
  )
}

/**
 * 判断特定媒体能力在当前设置下是否具备可用执行通道。
 * 彻底解除 runtimeMode === 'agent' 对媒体生成的一刀切连坐阻断。
 *
 * @param {{ mode: RuntimeMode, textReady: boolean, mediaReady: boolean }} choice
 * @param {unknown} settings
 * @param {'image' | 'video' | 'audio'} capability
 * @returns {boolean}
 */
export function mediaReadyFor(choice, settings, capability) {
  // 1. 官方模式下默认放行，由下层 resolveMediaAuth 检验官方登录态或 Token
  if (choice.mode === 'official') return true

  const input = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? /** @type {Record<string, unknown>} */ (settings)
    : {}

  // 2. 检查独立配置的主媒体 Provider (BYOK: fal / openai / openrouter / custom)
  const mediaChoice = resolveMediaProviderChoice(settings, capability)
  if (mediaChoice.ready && mediaChoice.isCapEnabled) {
    // 纯媒体自建端点门禁：当显式配置媒体提供商为 custom 时，仅校验端点非空与 verified，不强制要求文本模型就绪
    const isPureMediaCustom = typeof input.runtimeMediaProvider === 'string'
      && input.runtimeMediaProvider.trim().toLowerCase() === 'custom'
    if (isPureMediaCustom) {
      return Boolean(mediaChoice.verified && /^https?:\/\//i.test(mediaChoice.endpoint.trim()))
    }

    // 若未显式配置 runtimeMediaProvider 且为 key 模式，属于统一 Key 模式，必须要求文本模型就绪
    const isKeyDirect = choice.mode === 'key' && (typeof input.runtimeMediaProvider !== 'string' || !input.runtimeMediaProvider.trim())
    if (isKeyDirect) {
      return choice.textReady
    }

    return true
  }

  // 3. 检查多 Provider 扩展列表 (byokProviders)
  if (Array.isArray(input.byokProviders)) {
    for (const item of input.byokProviders) {
      if (item && typeof item === 'object' && item.verified === true) {
        const itemProvider = typeof item.provider === 'string' ? item.provider.toLowerCase().trim() : ''
        if (!MEDIA_PROVIDERS.includes(itemProvider)) {
          continue
        }
        const itemEndpoint = typeof item.endpoint === 'string' ? item.endpoint.trim() : ''
        // 若为 custom provider，必须强制检查端点 endpoint 是否以 http:// 或 https:// 开头，未配置或协议非法直接跳过
        if (itemProvider === 'custom' && !/^https?:\/\//i.test(itemEndpoint)) {
          continue
        }

        if (isByokItemCapabilitySupported(item, capability)) {
          return true
        }
      }
    }
  }

  // 4. 若用户在 settings 中显式允许官方通道兜底，在放行前必须严格校验用户的真实验证状态
  // 坚决禁止在 settings 载荷中信任客户端可控的 officialToken / token，放行仅严格校验 isUserVerified 与凭据闭环
  if (input.allowOfficialMediaFallback === true) {
    const isAgentVerified = choice.mode === 'agent' && choice.textReady === true
    const isKeyVerified = choice.mode === 'key' && choice.textReady === true
    const isByokVerified = Array.isArray(input.byokProviders) && input.byokProviders.some((p) => {
      if (!p || typeof p !== 'object' || p.verified !== true) return false
      const pProvider = typeof p.provider === 'string' ? p.provider.toLowerCase().trim() : ''
      if (!MEDIA_PROVIDERS.includes(pProvider)) return false
      if (pProvider === 'custom') {
        const hasEndpoint = typeof p.endpoint === 'string' && /^https?:\/\//i.test(p.endpoint.trim())
        if (!hasEndpoint) return false
      }
      return isByokItemCapabilitySupported(p, capability)
    })
    const isIndependentMediaVerified = Boolean(
      typeof input.runtimeMediaProvider === 'string'
      && input.runtimeMediaProvider.trim()
      && mediaChoice.ready
      && mediaChoice.isCapEnabled
    )
    const isUserVerified = isAgentVerified || isKeyVerified || isByokVerified || isIndependentMediaVerified
    if (isUserVerified) {
      return true
    }
  }

  return false
}

/**
 * Unified runtime overview with backward-compatibility for tests and runtime checks.
 * @param {unknown} settings
 * @returns {{
 *   mode: RuntimeMode,
 *   textReady: boolean,
 *   mediaReady: boolean,
 *   reason?: 'unconfigured',
 *   textReason?: 'unconfigured',
 *   mediaReason?: 'unconfigured',
 * }}
 */
export function resolveRuntimeChoice(settings) {
  const input = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? /** @type {Record<string, unknown>} */ (settings)
    : {}
  const raw = typeof input.runtimeMode === 'string' ? input.runtimeMode.trim() : ''
  const mode = RUNTIME_MODES.includes(raw) ? /** @type {RuntimeMode} */ (raw) : 'official'

  if (mode === 'official') {
    return { mode, textReady: true, mediaReady: true }
  }
  if (mode === 'agent') {
    const agentReady = typeof input.runtimeAgentId === 'string' && input.runtimeAgentId.trim().length > 0
      && input.runtimeAgentVerified === true
    const baseChoice = { mode, textReady: agentReady, mediaReady: false }
    const mediaReady = mediaReadyFor(baseChoice, settings, 'image')
      || mediaReadyFor(baseChoice, settings, 'video')
      || mediaReadyFor(baseChoice, settings, 'audio')
    const res = {
      mode,
      textReady: agentReady,
      mediaReady,
    }
    if (!agentReady) {
      res.reason = 'unconfigured'
      res.textReason = 'unconfigured'
    }
    if (!mediaReady) {
      res.mediaReason = 'unconfigured'
    }
    return res
  }

  const endpointReady = typeof input.runtimeKeyEndpoint === 'string' && input.runtimeKeyEndpoint.trim().length > 0
    && typeof input.runtimeKeyModel === 'string' && input.runtimeKeyModel.trim().length > 0
    && input.runtimeKeyVerified === true
  const baseChoice = { mode, textReady: endpointReady, mediaReady: false }
  const mediaReady = mediaReadyFor(baseChoice, settings, 'image')
    || mediaReadyFor(baseChoice, settings, 'video')
    || mediaReadyFor(baseChoice, settings, 'audio')

  const res = {
    mode,
    textReady: endpointReady,
    mediaReady,
  }
  if (!endpointReady || !mediaReady) {
    res.reason = 'unconfigured'
  }
  if (!endpointReady) {
    res.textReason = 'unconfigured'
  }
  if (!mediaReady) {
    res.mediaReason = 'unconfigured'
  }
  return res
}
