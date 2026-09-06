import { OmnimuxError } from '../media/errors.js'
import lifecycle from '../plugin-lifecycle.json' with { type: 'json' }
import release from '../release-channel.json' with { type: 'json' }

const lifecycleEntries = Object.entries(lifecycle)
if (lifecycleEntries.length === 0 || lifecycleEntries.some(([pluginId, entry]) => (
  !pluginId || entry?.stage !== 'alpha' || !Array.isArray(entry.toolPrefixes) ||
  entry.toolPrefixes.some(prefix => typeof prefix !== 'string' || prefix.length === 0)
))) {
  throw new Error('omnimux: invalid plugin lifecycle registry')
}
if (release?.channel !== 'development' && release?.channel !== 'production') {
  throw new Error('omnimux: invalid packaged release channel')
}

const ALPHA_TOOL_PREFIXES = Object.freeze(lifecycleEntries.flatMap(([, entry]) => entry.toolPrefixes))

/** @param {string} toolName */
export function isAlphaTool(toolName) {
  return ALPHA_TOOL_PREFIXES.some(prefix => toolName.startsWith(prefix))
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
  if (release.channel === 'production' && isAlphaTool(toolName)) return false
  if (gate?.tools && gate.tools[toolName] === false) return false
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
