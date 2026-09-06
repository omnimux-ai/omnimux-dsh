/**
 * Default gate configuration.
 * All capabilities are enabled by default.
 */
export const DEFAULT_GATE = Object.freeze({
  enabled: true,
  tools: Object.freeze({}),
  media: Object.freeze({
    video: true,
    image: true,
    audio: true,
  }),
  models: Object.freeze({
    textComplete: Object.freeze({}),
  }),
  plugins: Object.freeze({}),
})

const VALID_MEDIA_KINDS = Object.freeze(['video', 'image', 'audio'])

/**
 * Parses and normalizes the gate configuration object.
 *
 * @param {unknown} value
 * @returns {{
 *   enabled: boolean,
 *   tools: Record<string, boolean>,
 *   media: { video: boolean, image: boolean, audio: boolean },
 *   models: { textComplete: Record<string, boolean> },
 *   plugins: Record<string, unknown>
 * }}
 */
export function parseGateConfig(value) {
  if (value == null) {
    return {
      enabled: true,
      tools: {},
      media: { ...DEFAULT_GATE.media },
      models: { textComplete: {} },
      plugins: {},
    }
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('omnimux: gate config must be an object')
  }

  const raw = /** @type {Record<string, unknown>} */ (value)

  // 1. enabled
  let enabled = true
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== 'boolean') {
      throw new Error('omnimux: gate.enabled must be a boolean')
    }
    enabled = raw.enabled
  }

  // 2. tools
  /** @type {Record<string, boolean>} */
  const tools = {}
  if (raw.tools !== undefined) {
    if (typeof raw.tools !== 'object' || raw.tools === null || Array.isArray(raw.tools)) {
      throw new Error('omnimux: gate.tools must be an object')
    }
    const rawTools = /** @type {Record<string, unknown>} */ (raw.tools)
    for (const [key, val] of Object.entries(rawTools)) {
      if (typeof val !== 'boolean') {
        throw new Error(`omnimux: gate.tools.${key} must be a boolean`)
      }
      tools[key] = val
    }
  }

  // 3. media
  const media = { ...DEFAULT_GATE.media }
  if (raw.media !== undefined) {
    if (typeof raw.media !== 'object' || raw.media === null || Array.isArray(raw.media)) {
      throw new Error('omnimux: gate.media must be an object')
    }
    const rawMedia = /** @type {Record<string, unknown>} */ (raw.media)
    for (const [key, val] of Object.entries(rawMedia)) {
      if (!VALID_MEDIA_KINDS.includes(key)) {
        throw new Error(`omnimux: gate.media.${key} is not a recognized media kind`)
      }
      if (typeof val !== 'boolean') {
        throw new Error(`omnimux: gate.media.${key} must be a boolean`)
      }
      media[/** @type {'video' | 'image' | 'audio'} */ (key)] = val
    }
  }

  // 4. models
  /** @type {{ textComplete: Record<string, boolean> }} */
  const models = { textComplete: {} }
  if (raw.models !== undefined) {
    if (typeof raw.models !== 'object' || raw.models === null || Array.isArray(raw.models)) {
      throw new Error('omnimux: gate.models must be an object')
    }
    const rawModels = /** @type {Record<string, unknown>} */ (raw.models)
    if (rawModels.textComplete !== undefined) {
      if (
        typeof rawModels.textComplete !== 'object' ||
        rawModels.textComplete === null ||
        Array.isArray(rawModels.textComplete)
      ) {
        throw new Error('omnimux: gate.models.textComplete must be an object')
      }
      const rawTextComplete = /** @type {Record<string, unknown>} */ (rawModels.textComplete)
      for (const [key, val] of Object.entries(rawTextComplete)) {
        if (typeof val !== 'boolean') {
          throw new Error(`omnimux: gate.models.textComplete.${key} must be a boolean`)
        }
        models.textComplete[key] = val
      }
    }
  }

  // 5. plugins (reserved namespace for verticals)
  /** @type {Record<string, unknown>} */
  const plugins = {}
  if (raw.plugins !== undefined) {
    if (typeof raw.plugins !== 'object' || raw.plugins === null || Array.isArray(raw.plugins)) {
      throw new Error('omnimux: gate.plugins must be an object')
    }
    Object.assign(plugins, raw.plugins)
  }

  return {
    enabled,
    tools,
    media,
    models,
    plugins,
  }
}
