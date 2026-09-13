/**
 * Where the cloud asset catalog's *metadata* comes from.
 *
 * The catalog is a static paginated tree — `manifest.json`, a flat
 * `index.json`, and per-scope `page-NNNN.json` shards — and it exists in two
 * places: the production gateway that Caddy serves straight off disk, and the
 * copy mounted next to this plugin that the local Host answers under
 * /omnimux/assets/cloud. The gateway is authoritative and always current, so it
 * is tried first; the local copy is the fallback that keeps the cloud tab
 * working offline, on installs that cannot reach the gateway, and while a
 * catalog rebuild is still on its way.
 *
 * Only metadata moves. Media bytes stay on the Host proxy: a `file:` locator can
 * only be resolved against the machine that holds the assets, and a remote
 * locator is already a public CDN URL that the Host redirects to. Saving to the
 * local library is likewise a Host write, never a gateway call.
 *
 * Configuration, highest priority first:
 *   1. `globalThis.__OMNIMUX_CLOUD_ASSETS_BASE_URL__` — runtime override
 *   2. `CLOUD_ASSETS_BASE_URL` in the build environment — inlined into the
 *      bundle by scripts/build-client.mjs
 *   3. `DEFAULT_CLOUD_ASSETS_BASE_URL`
 *
 * The values `local`, `off`, `host`, `none`, the Host route prefix itself, and
 * an empty string pin the local Host proxy and skip the probe entirely.
 */

/** Production gateway base URL, without a trailing slash. */
export const DEFAULT_CLOUD_ASSETS_BASE_URL = 'https://omnimux.ai/cloud-assets-catalog'

/**
 * Sentinel for "read from the local Host". Deliberately the empty string so a
 * URL builder only has one thing to test.
 */
export const LOCAL_CLOUD_BASE_URL = ''

/** Prefix of the Host routes that serve the catalog mounted in this install. */
export const LOCAL_CLOUD_ROUTE = '/omnimux/assets/cloud'

/** Configured values that mean "stay local". */
const LOCAL_ALIASES = new Set(['local', 'off', 'host', 'none'])

/**
 * Normalize a configured base URL to a URL without a trailing slash, or to the
 * local sentinel. An unrecognized value is kept as given: it is probed like any
 * other base, and a typo fails the probe and falls back to local rather than
 * silently reading something else.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCloudBaseUrl(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '')
  if (raw === '' || raw === LOCAL_CLOUD_ROUTE || LOCAL_ALIASES.has(raw.toLowerCase())) {
    return LOCAL_CLOUD_BASE_URL
  }
  return raw
}

/**
 * `CLOUD_ASSETS_BASE_URL` inlined at build time. `typeof` on an identifier the
 * bundler did not replace is safe, so an uninjected build reports the empty
 * string instead of throwing.
 * @returns {string}
 */
function injectedCloudBaseUrl() {
  return typeof __CLOUD_ASSETS_BASE_URL__ === 'string' ? __CLOUD_ASSETS_BASE_URL__ : ''
}

/**
 * The base URL this build or session is configured with, or the production
 * gateway when nothing is configured.
 * @param {any} [scope] global object; overridden by tests
 * @returns {string}
 */
export function configuredCloudBaseUrl(scope = globalThis) {
  const runtime = scope?.__OMNIMUX_CLOUD_ASSETS_BASE_URL__
  if (typeof runtime === 'string' && runtime.trim() !== '') return normalizeCloudBaseUrl(runtime)
  const injected = injectedCloudBaseUrl()
  if (injected !== '') return normalizeCloudBaseUrl(injected)
  return DEFAULT_CLOUD_ASSETS_BASE_URL
}

/**
 * @param {string} base local sentinel or gateway base URL
 * @param {string} relPath path inside the catalog
 */
function cloudFileUrl(base, relPath) {
  return base === LOCAL_CLOUD_BASE_URL
    ? `${LOCAL_CLOUD_ROUTE}/${relPath}`
    : `${base}/${relPath}`
}

/**
 * @param {string} base
 * @returns {string}
 */
export function cloudManifestUrl(base) {
  return cloudFileUrl(base, 'manifest.json')
}

/**
 * @param {string} base
 * @param {string} scope `category` or `category/sub_category`
 * @param {number} page zero-based
 * @returns {string}
 */
export function cloudPageUrl(base, scope, page) {
  const safeScope = String(scope).split('/').map(encodeURIComponent).join('/')
  return cloudFileUrl(base, `${safeScope}/page-${String(page).padStart(4, '0')}.json`)
}

/**
 * Can this base actually serve the catalog?
 *
 * A reachability check is not enough: an origin that answers unknown paths with
 * a single-page-app shell returns 200 and HTML, which would be parsed as a
 * manifest and render an empty cloud tab. So the response has to look like
 * JSON. A failed probe is not an error — it is the signal to read the local
 * copy.
 * @param {string} base
 * @returns {Promise<boolean>}
 */
async function probeCloudManifest(base) {
  if (typeof fetch !== 'function') return false
  try {
    const response = await fetch(cloudManifestUrl(base), { cache: 'no-store' })
    if (!response.ok) return false
    const type = String(response.headers?.get?.('content-type') ?? '')
    return type === '' || type.includes('json')
  } catch {
    return false
  }
}

/**
 * @typedef {{ resolve: (opts?: { force?: boolean }) => Promise<string> }} CloudSource
 */

/**
 * A memoized base-URL decision. The probe is a network round trip and its answer
 * only changes when the gateway comes back, which `force` covers.
 * @param {{ baseUrl?: string, probe?: (base: string) => Promise<boolean> }} [deps]
 * @returns {CloudSource}
 */
export function createCloudSource(deps = {}) {
  const configured = typeof deps.baseUrl === 'string' ? deps.baseUrl : configuredCloudBaseUrl()
  const probe = deps.probe ?? probeCloudManifest

  if (configured === LOCAL_CLOUD_BASE_URL) {
    return { resolve: () => Promise.resolve(LOCAL_CLOUD_BASE_URL) }
  }

  /** @type {Promise<string> | null} */
  let pending = null

  return {
    resolve(opts = {}) {
      if (opts.force === true) pending = null
      if (pending === null) {
        pending = Promise.resolve()
          .then(() => probe(configured))
          .then(
            (ok) => (ok ? configured : LOCAL_CLOUD_BASE_URL),
            () => LOCAL_CLOUD_BASE_URL,
          )
      }
      return pending
    },
  }
}

/** @type {CloudSource | null} */
let source = null

/**
 * The base URL the cloud tab should read metadata from. Resolved once per
 * session; `force` re-probes after a manual refresh.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export function resolveCloudBase(opts = {}) {
  if (source === null) source = createCloudSource()
  return source.resolve(opts)
}

/**
 * Replace the session source. Tests use it to pin a base without touching the
 * environment; a Host that knows its own gateway can use it to override one.
 * Pass nothing to go back to the configured default.
 * @param {CloudSource | null} [next]
 */
export function setCloudSource(next = null) {
  source = next
}
