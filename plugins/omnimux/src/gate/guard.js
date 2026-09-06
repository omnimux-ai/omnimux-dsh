import { OmnimuxError } from '../media/errors.js'

/**
 * List of official tools excluded in MVP mode.
 */
export const MVP_EXCLUDED_OFFICIAL_TOOLS = Object.freeze([
  'omnimux_accounts_list',
  'omnimux_accounts_connect',
  'omnimux_accounts_disconnect',
  'omnimux_publish_presign',
  'omnimux_publish_create',
  'omnimux_publish_get',
  'omnimux_analytics_daily_metrics',
  'omnimux_analytics_best_time',
  'omnimux_analytics_frequency',
  'omnimux_analytics_content_decay',
  'omnimux_analytics_follower_stats',
  'omnimux_analytics_posts',
  'omnimux_analytics_sync_external',
  'omnimux_analytics_inbox',
])

/**
 * Check if a tool belongs to MVP excluded official tools.
 *
 * @param {string} toolName
 * @returns {boolean}
 */
export function isMvpExcludedOfficialTool(toolName) {
  return (
    toolName.startsWith('omnimux_accounts_') ||
    toolName.startsWith('omnimux_publish_') ||
    toolName.startsWith('omnimux_analytics_')
  )
}

/**
 * @param {import('./config.js').parseGateConfig extends (v: any) => infer R ? R : any} [gate]
 * @returns {boolean}
 */
export function isGateActive(gate) {
  if (gate == null) return true
  return gate.enabled !== false
}

/**
 * Checks if a specific media kind (video, image, audio) is enabled.
 * Equivalence rule: gate.media.<kind> === false OR gate.tools.omnimux_<kind>_submit === false => disabled.
 *
 * @param {any} [gate]
 * @param {'video' | 'image' | 'audio' | string} kind
 * @returns {boolean}
 */
export function isMediaEnabled(gate, kind) {
  if (!isGateActive(gate)) return false
  if (gate?.media && gate.media[kind] === false) return false
  const toolName = `omnimux_${kind}_submit`
  if (gate?.tools && gate.tools[toolName] === false) return false
  return true
}

/**
 * Checks if a specific tool is enabled.
 *
 * @param {any} [gate]
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolEnabled(gate, toolName) {
  if (!isGateActive(gate)) return false
  if (gate?.tools && gate.tools[toolName] !== undefined) {
    return gate.tools[toolName] !== false
  }
  if (gate?.mvp && isMvpExcludedOfficialTool(toolName)) {
    return false
  }
  if (toolName === 'omnimux_video_submit') return isMediaEnabled(gate, 'video')
  if (toolName === 'omnimux_image_submit') return isMediaEnabled(gate, 'image')
  if (toolName === 'omnimux_audio_submit') return isMediaEnabled(gate, 'audio')
  return true
}

/**
 * Checks if a specific text complete model is enabled by gate.
 *
 * @param {any} [gate]
 * @param {string} modelId
 * @returns {boolean}
 */
export function isModelEnabled(gate, modelId) {
  if (!isGateActive(gate)) return false
  if (gate?.models?.textComplete && gate.models.textComplete[modelId] === false) {
    return false
  }
  return true
}

/**
 * Asserts that a capability (tool, media, or model) is enabled.
 * Throws an OmnimuxError with code 'capability-disabled' if disabled.
 *
 * @param {any} [gate]
 * @param {string} capabilityName
 * @param {'tool' | 'media' | 'model'} [kind='tool']
 * @throws {OmnimuxError}
 */
export function assertCapabilityEnabled(gate, capabilityName, kind = 'tool') {
  if (kind === 'media') {
    if (!isMediaEnabled(gate, capabilityName)) {
      throw new OmnimuxError(
        'capability-disabled',
        `Media capability '${capabilityName}' is disabled by capability gate`,
      )
    }
    return
  }

  if (kind === 'model') {
    if (!isModelEnabled(gate, capabilityName)) {
      throw new OmnimuxError(
        'capability-disabled',
        `Model '${capabilityName}' on textComplete is disabled by capability gate`,
      )
    }
    return
  }

  // Default: tool
  if (!isToolEnabled(gate, capabilityName)) {
    throw new OmnimuxError(
      'capability-disabled',
      `Capability '${capabilityName}' is disabled by capability gate`,
    )
  }
}
