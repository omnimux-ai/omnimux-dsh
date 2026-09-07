/** Platform capabilities and upstream task mappings; malformed config fails explicitly. */
/** @typedef {'submitted' | 'reviewing' | 'published' | 'failed'} MappedTaskStatus */
/** @typedef {{ media_types?: Array<'video' | 'image'>, max_images?: number } & Partial<Record<`supports_${string}`, boolean>>} PlatformCapabilities */
/**
 * @typedef {object} PublishConfig
 * @property {string | undefined} dataDir
 * @property {string | undefined} accountsOverlayPath
 * @property {Record<string, PlatformCapabilities>} platforms
 * @property {Record<string, MappedTaskStatus>} statusMap
 * @property {number} maxMediaMb
 * @property {number} submitTimeoutSeconds
 */
export class PublishConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'PublishConfigError'
  }
}

/** @type {Readonly<Record<string, PlatformCapabilities>>} */
export const BUILTIN_PLATFORMS = Object.freeze({
  xiaohongshu: { media_types: ['image', 'video'], supports_cover: false, supports_schedule: false, max_images: 18, supports_original_declaration: true, supports_ai_declaration: false },
  douyin: { media_types: ['video', 'image'], supports_cover: true, supports_schedule: true, max_images: 35, supports_original_declaration: true, supports_ai_declaration: true },
  kuaishou: { media_types: ['video', 'image'], supports_cover: true, supports_schedule: false, max_images: 35, supports_original_declaration: true, supports_ai_declaration: false },
  weibo: { media_types: ['image', 'video'], supports_cover: false, supports_schedule: false, max_images: 9, supports_original_declaration: false, supports_ai_declaration: false },
  bilibili: { media_types: ['video'], supports_cover: true, supports_schedule: false, supports_original_declaration: true, supports_ai_declaration: false },
  wechat_channels: { media_types: ['video', 'image'], supports_cover: true, supports_schedule: false, max_images: 9, supports_original_declaration: true, supports_ai_declaration: false },
  tiktok: { media_types: ['video', 'image'], supports_cover: false, supports_schedule: true, max_images: 35, supports_original_declaration: true, supports_ai_declaration: true },
  instagram: { media_types: ['image', 'video'], supports_cover: false, supports_schedule: false, max_images: 10, supports_original_declaration: false, supports_ai_declaration: true },
  youtube: { media_types: ['video'], supports_cover: true, supports_schedule: true, supports_original_declaration: false, supports_ai_declaration: true },
  x: { media_types: ['image', 'video'], supports_cover: false, supports_schedule: false, max_images: 4, supports_original_declaration: false, supports_ai_declaration: true },
})

/** Unknown raw statuses retain the stored task state. @type {Readonly<Record<string, MappedTaskStatus>>} */
export const BUILTIN_STATUS_MAP = Object.freeze({
  scheduled: 'submitted', pending: 'submitted', queued: 'submitted', processing: 'submitted',
  in_progress: 'submitted', publishing: 'submitted', submitted: 'submitted',
  review: 'reviewing', reviewing: 'reviewing', pending_review: 'reviewing', under_review: 'reviewing',
  in_review: 'reviewing', audit: 'reviewing', auditing: 'reviewing',
  published: 'published', success: 'published', done: 'published', completed: 'published',
  failed: 'failed', error: 'failed', rejected: 'failed', reject: 'failed', blocked: 'failed', removed: 'failed', deleted: 'failed',
})

/** @param {string} where @param {unknown} value @param {string} expect @returns {never} */
function fail(where, value, expect) {
  const shown = value === undefined ? 'undefined' : JSON.stringify(value)
  throw new PublishConfigError(`publish config: ${where} must be ${expect}, got ${shown}`)
}

/** @param {unknown} value @param {string} where @returns {Record<string, unknown>} */
function asObject(value, where) {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) fail(where, value, 'an object')
  return /** @type {Record<string, unknown>} */ (value)
}

/** @param {unknown} value @param {string} where @param {number} fallback */
function asPositiveNumber(value, where, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(where, value, 'a positive number')
  return value
}

/** @param {unknown} value @param {string} where */
function asOptionalString(value, where) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') fail(where, value, 'a string')
  return value
}

/**
 * Overrides merge by platform and field; arbitrary supports_* booleans remain supported.
 * @param {Readonly<Record<string, PlatformCapabilities>>} base
 * @param {Record<string, unknown>} override
 * @returns {Record<string, PlatformCapabilities>}
 */
export function deepMergePlatforms(base, override) {
  /** @type {Record<string, PlatformCapabilities>} */
  const out = {}
  for (const [platform, row] of Object.entries(base)) out[platform] = { ...row }
  for (const [platform, rawPatch] of Object.entries(override)) {
    const patch = asObject(rawPatch, `platforms.${platform}`)
    const target = out[platform] || {}
    for (const [key, value] of Object.entries(patch)) {
      const where = `platforms.${platform}.${key}`
      if (key === 'media_types') {
        if (!Array.isArray(value) || value.length === 0 || value.some((v) => v !== 'video' && v !== 'image')) {
          fail(where, value, "a non-empty array of 'video' | 'image'")
        }
        target.media_types = value.map((item) => {
          if (item !== 'video' && item !== 'image') fail(where, item, "'video' | 'image'")
          return item
        })
      } else if (key.startsWith('supports_')) {
        if (typeof value !== 'boolean') fail(where, value, 'a boolean')
        target[/** @type {`supports_${string}`} */ (key)] = value
      } else if (key === 'max_images') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) fail(where, value, 'a positive integer')
        target.max_images = value
      } else {
        fail(where, value, 'one of media_types | supports_cover | supports_schedule | supports_original_declaration | supports_ai_declaration | max_images')
      }
    }
    out[platform] = target
  }
  return out
}

/** @param {unknown} rawValue @returns {Record<string, MappedTaskStatus>} */
function parseStatusMap(rawValue) {
  const raw = asObject(rawValue, 'statusMap')
  if (Object.keys(raw).length === 0) return { ...BUILTIN_STATUS_MAP }
  /** @type {Record<string, MappedTaskStatus>} */
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value !== 'submitted' && value !== 'reviewing' && value !== 'published' && value !== 'failed') {
      fail(`statusMap.${key}`, value, "one of 'submitted' | 'reviewing' | 'published' | 'failed'")
    }
    out[key] = value
  }
  return out
}

/** @param {unknown} value @returns {PublishConfig} */
export function parsePublishConfig(value) {
  const raw = asObject(value, 'the plugin config')
  return {
    dataDir: asOptionalString(raw.dataDir, 'dataDir'),
    accountsOverlayPath: asOptionalString(raw.accountsOverlayPath, 'accountsOverlayPath'),
    platforms: deepMergePlatforms(BUILTIN_PLATFORMS, asObject(raw.platforms, 'platforms')),
    statusMap: parseStatusMap(raw.statusMap),
    maxMediaMb: asPositiveNumber(raw.maxMediaMb, 'maxMediaMb', 512),
    submitTimeoutSeconds: asPositiveNumber(raw.submitTimeoutSeconds, 'submitTimeoutSeconds', 120),
  }
}

/** @type {{ '~standard': { version: 1, vendor: string, validate: (value: unknown) => { value: PublishConfig } | { issues: Array<{ message: string }> } } }} */
export const Config = {
  '~standard': {
    version: 1, vendor: 'omnimux-publish',
    validate(value) {
      try {
        return { value: parsePublishConfig(value) }
      } catch (error) {
        return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
      }
    },
  },
}
