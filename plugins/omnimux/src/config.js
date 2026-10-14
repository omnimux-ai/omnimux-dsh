import z from '@deepseek-ai/schemastery'
import { parseReferenceStorageConfig } from './reference-storage/config.js'
import { SETTINGS_DEFAULTS, parseSettingsSection } from './settings/schema.js'
import { parseAppsConfig } from './apps/config.js'
import { DEFAULT_SITE, resolveSiteBaseUrl } from './auth/omnimux-auth.js'
import { parseBrandConfig } from './brand/config.js'
import { parseGateConfig } from './gate/config.js'
import { parseMediaConfig } from './media/route.js'
import { parseOfficialConfig } from './official/config.js'
import { parseTextConfig } from './text/catalog.js'

/**
 * @param {unknown} value
 */
export function parseHubConfig(value) {
  const brand = parseBrandConfig(value)
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
  return {
    ...brand,
    hmrTransport: 'websocket',
    media: parseMediaConfig(raw.media),
    official: parseOfficialConfig(raw.official),
    apps: parseAppsConfig(
      raw.apps,
      resolveSiteBaseUrl(
        typeof raw.siteBaseUrl === 'string' && raw.siteBaseUrl.trim()
          ? raw.siteBaseUrl
          : process.env.OMNIMUX_SITE_URL || DEFAULT_SITE,
      ),
    ),
    text: parseTextConfig(raw.text),
    gate: parseGateConfig(raw.gate),
  }
}

/**
 * @type {{ '~standard': { version: 1, vendor: string, validate: (value: unknown) => { value: ReturnType<typeof parseHubConfig> } | { issues: Array<{ message: string }> } } }}
 */
const ordinaryKeys = ['siteBaseUrl', 'clientName', 'productName', 'logoSvg', 'wordmarkText', 'replaceHeroMark', 'hidePreviewBadge', 'rewriteWelcome', 'heroHeadline', 'heroHeadlineFit', 'heroHeadlineMaxPx', 'heroHeadlineMinPx', 'media', 'official', 'apps', 'text', 'gate', 'hmrTransport']
const fields = Object.fromEntries(ordinaryKeys.map(key => [key, z.any()]))
fields.referenceStorage = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().default(''),
  bucket: z.string().default(''),
  region: z.string().default('auto'),
  publicBaseUrl: z.string().default(''),
  credentialId: z.string().default(''),
}).default(parseReferenceStorageConfig(undefined)).volatile()
for (const [key, fallback] of Object.entries(SETTINGS_DEFAULTS)) {
  if (key === 'referenceStorage') continue
  const field = typeof fallback === 'boolean' ? z.boolean() : typeof fallback === 'string' ? z.string() : Array.isArray(fallback) ? z.array(z.any()) : z.object({})
  fields[key] = field.default(fallback).volatile()
}
const formSchema = z.object(fields)
export const Config = formSchema
Object.defineProperty(Config, '~standard', { value: {
  version: 1,
  vendor: 'omnimux',
  validate(value) {
    try {
      const parsed = formSchema(value)
      const ordinary = parseHubConfig(value)
      const storage = parsed.referenceStorage?.get ? parsed.referenceStorage.get() : parsed.referenceStorage
      parseReferenceStorageConfig(storage)
      const settingsValues = Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, parsed[key]?.get ? parsed[key].get() : parsed[key]]))
      const scanSettings = value => {
        if (!value || typeof value !== 'object') return
        for (const [key, entry] of Object.entries(value)) {
          if (/^(?:apiKey|secretAccessKey|accessKeyId|password|token|secret|sessionToken)$/i.test(key)) throw new Error('访问凭据必须单独安全保存')
          scanSettings(entry)
        }
      }
      scanSettings(settingsValues)
      parseSettingsSection(settingsValues)
      const liveFields = Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, parsed[key]]))
      return { value: Object.assign({}, ordinary, liveFields) }
    } catch (error) {
      return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
    }
  },
} })
