/** @typedef {'official' | 'agent' | 'key'} RuntimeMode */

export const RUNTIME_MODES = Object.freeze(['official', 'agent', 'key'])

/** Supported native media generation providers */
export const MEDIA_PROVIDERS = Object.freeze(['fal', 'openai', 'openrouter', 'custom'])

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
  // Ready strictly requires passing verification
  const ready = verified === true

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

function mediaReadyFor(choice, settings, capability) {
  if (choice.mode === 'official') return true
  if (choice.mode !== 'key' || !choice.textReady) return false
  const input = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? /** @type {Record<string, unknown>} */ (settings)
    : {}
  const flag = capability === 'image' ? 'runtimeMediaImage'
    : capability === 'video' ? 'runtimeMediaVideo'
    : capability === 'audio' ? 'runtimeMediaAudio'
    : ''
  return flag !== '' && input[flag] === true
}

/**
 * Unified runtime overview with backward-compatibility for tests and runtime checks.
 * @param {unknown} settings
 * @returns {{
 *   mode: RuntimeMode,
 *   textReady: boolean,
 *   mediaReady: boolean,
 *   reason?: 'unconfigured',
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
    return {
      mode,
      textReady: agentReady,
      mediaReady: false,
      ...(agentReady ? {} : { reason: 'unconfigured' }),
    }
  }

  const endpointReady = typeof input.runtimeKeyEndpoint === 'string' && input.runtimeKeyEndpoint.trim().length > 0
    && typeof input.runtimeKeyModel === 'string' && input.runtimeKeyModel.trim().length > 0
    && input.runtimeKeyVerified === true
  const mediaReady = endpointReady
    && (input.runtimeMediaImage === true || input.runtimeMediaVideo === true || input.runtimeMediaAudio === true)

  return {
    mode,
    textReady: endpointReady,
    mediaReady,
    ...((endpointReady && mediaReady) ? {} : { reason: 'unconfigured' }),
  }
}
