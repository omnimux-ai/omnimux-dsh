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
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'omnimux',
    validate(value) {
      try {
        return { value: parseHubConfig(value) }
      } catch (error) {
        return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
      }
    },
  },
}
