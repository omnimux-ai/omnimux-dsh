/** @typedef {'official' | 'agent' | 'key'} RuntimeMode */

export const RUNTIME_MODES = Object.freeze(['official', 'agent', 'key'])

/** Actions that are bound to the official account and always need sign-in. */
const OFFICIAL_ONLY = new Set(['publish', 'accounts', 'quota', 'inspiration'])

/**
 * Whether an action still needs the official sign-in window.
 *
 * Official mode keeps today's rule. A local agent or custom key can generate
 * without that window. Account-bound actions always need it.
 *
 * @param {unknown} settings
 * @param {string} action
 */
export function requiresOfficialSignIn(settings, action) {
  if (OFFICIAL_ONLY.has(action)) return true
  // Fail safe: an action nobody classified keeps today's rule. Only callers
  // that explicitly declare themselves as generation opt out of the window.
  if (action !== 'generate') return true
  return resolveRuntimeChoice(settings).mode === 'official'
}

/**
 * Stop a request that the selected runtime has not made available.
 *
 * Official and an unset choice pass through. A local agent can only run text.
 * A custom key runs a capability only after its endpoint and verification exist
 * — and media kinds are checked one by one: a key that only covers images never
 * lets a video request slip back to the official channel.
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
 * Whether one media kind is enabled for the resolved choice. Only a verified
 * custom key with that kind ticked passes; the official route and an unset
 * choice are always ready, and a local agent never covers media.
 * @param {ReturnType<typeof resolveRuntimeChoice>} choice
 * @param {unknown} settings
 * @param {string} capability
 */
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
 * What the current runtime choice allows before a request is sent.
 *
 * An unset choice stays official so existing installs keep working. Once the
 * user picks a local agent or their own key, a capability they have not
 * finished is unavailable. It never falls back to the official route.
 *
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
      // A local agent only ever runs text; media stays on its own configuration.
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
