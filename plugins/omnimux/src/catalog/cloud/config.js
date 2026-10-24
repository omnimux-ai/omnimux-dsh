/**
 * Gateway catalog refresh settings (P1a).
 *
 * Mirrors `src/apps/config.js`: a validated `Config` field, an https URL that
 * must match the site host, and injected TTL/timeout. The difference from the
 * Apps catalog is the default: membership must come from the gateway, so
 * `remote` defaults to **true**. Offline machines still work from the bundled
 * snapshot, and a failed refresh keeps the previous one.
 */

import { resolveSiteBaseUrl } from '../../auth/omnimux-auth.js'

export const DEFAULT_CATALOG = Object.freeze({
  remote: true,
  pricingUrl: '',
  ttlSeconds: 21600,
  timeoutMs: 5000,
  bundledDir: '',
})

/** Path the hub reads for membership. Anonymous-readable on the gateway. */
export const PRICING_PATH = '/api/pricing'

/**
 * @param {unknown} value
 * @param {string} [siteBaseUrl]
 * @returns {{ remote: boolean, pricingUrl: string, ttlSeconds: number, timeoutMs: number, bundledDir: string }}
 */
export function parseCatalogConfig(value, siteBaseUrl) {
  if (value == null) return { ...DEFAULT_CATALOG }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('omnimux: catalog config must be an object')
  }
  const input = /** @type {Record<string, unknown>} */ (value)
  const remote = input.remote == null ? DEFAULT_CATALOG.remote : input.remote
  if (typeof remote !== 'boolean') {
    throw new Error('omnimux: catalog.remote must be a boolean')
  }
  const ttlSeconds = input.ttlSeconds == null ? DEFAULT_CATALOG.ttlSeconds : Number(input.ttlSeconds)
  const timeoutMs = input.timeoutMs == null ? DEFAULT_CATALOG.timeoutMs : Number(input.timeoutMs)
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 0) {
    throw new Error('omnimux: catalog.ttlSeconds must be a non-negative integer')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('omnimux: catalog.timeoutMs must be a positive integer')
  }
  const pricingUrl = input.pricingUrl == null ? '' : String(input.pricingUrl).trim()
  if (pricingUrl) {
    let parsed
    try {
      parsed = new URL(pricingUrl)
    } catch {
      throw new Error('omnimux: catalog.pricingUrl must be an https URL')
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('omnimux: catalog.pricingUrl must be an https URL')
    }
    if (parsed.host !== new URL(resolveSiteBaseUrl(siteBaseUrl)).host) {
      throw new Error('omnimux: catalog.pricingUrl host must match siteBaseUrl')
    }
  }
  const bundledDir = input.bundledDir == null ? '' : String(input.bundledDir).trim()
  return { remote, pricingUrl, ttlSeconds, timeoutMs, bundledDir }
}

/**
 * Resolve the effective pricing URL: explicit override wins, otherwise the
 * site base plus the public pricing path.
 *
 * @param {{ pricingUrl?: string }} catalog
 * @param {string} siteBaseUrl
 */
export function resolvePricingUrl(catalog, siteBaseUrl) {
  const override = typeof catalog?.pricingUrl === 'string' ? catalog.pricingUrl.trim() : ''
  if (override) return override
  return `${resolveSiteBaseUrl(siteBaseUrl)}${PRICING_PATH}`
}
