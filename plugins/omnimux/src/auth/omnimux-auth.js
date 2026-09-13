/** OmniMux device-login HTTP. PAT never appears in returned public objects. */

export const CREDENTIAL_REF = 'OMNIMUX_ACCESS_TOKEN'
export const DEFAULT_SITE = 'https://omnimux.ai'
export const CLIENT_NAME = 'omnimux'
export const QUOTA_PER_USD = 500000
export const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

const PROFILE_KEYS = ['id', 'username', 'display_name', 'group', 'quota_usd', 'used_quota_usd', 'role', 'is_admin']

/**
 * @param {string} base
 * @param {string} path
 */
export function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '')
  const p = String(path || '')
  if (!p) return b
  return p.startsWith('/') ? b + p : `${b}/${p}`
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveSiteBaseUrl(raw) {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_SITE
  return value.replace(/\/+$/, '')
}

/**
 * Public profile only. Drops token, email, oauth, aff, stripe, permissions.
 * @param {unknown} self
 * @returns {{ id?: number | string, username?: string, display_name?: string, group?: string, quota_usd: number | null, used_quota_usd: number | null }}
 */
export function stripProfile(self) {
  const row = self && typeof self === 'object' ? /** @type {Record<string, unknown>} */ (self) : {}
  const quota = typeof row.quota === 'number' ? row.quota / QUOTA_PER_USD : null
  const used = typeof row.used_quota === 'number' ? row.used_quota / QUOTA_PER_USD : null
  /** @type {Record<string, unknown>} */
  const out = {
    quota_usd: quota,
    used_quota_usd: used,
  }
  if (row.id != null) out.id = /** @type {number | string} */ (row.id)
  if (typeof row.username === 'string') out.username = row.username
  if (typeof row.display_name === 'string') out.display_name = row.display_name
  if (typeof row.group === 'string') out.group = row.group
  if (typeof row.role === 'number') {
    out.role = row.role
    out.is_admin = row.role >= 10
  }
  for (const key of Object.keys(out)) {
    if (!PROFILE_KEYS.includes(key)) delete out[key]
  }
  return /** @type {typeof out} */ (out)
}

/**
 * @param {unknown} json
 */
export function parseDeviceCodeResponse(json) {
  const body = json && typeof json === 'object' ? /** @type {Record<string, unknown>} */ (json) : {}
  const data = body.data && typeof body.data === 'object'
    ? /** @type {Record<string, unknown>} */ (body.data)
    : {}
  const ok = body.success !== false
    && typeof data.device_code === 'string'
    && data.device_code
    && typeof data.user_code === 'string'
    && data.user_code
  if (!ok) {
    return { ok: false, message: String(body.message || body.error || 'device code request failed') }
  }
  const verificationUri = String(data.verification_uri_complete || data.verification_uri || '')
  if (!verificationUri) return { ok: false, message: 'device code response missing verification url' }
  return {
    ok: true,
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUrl: verificationUri,
    expiresIn: Number(data.expires_in) || 900,
    intervalSec: Math.max(1, Number(data.interval) || 5),
  }
}

/**
 * @param {unknown} json
 */
export function parseDeviceTokenResponse(json) {
  const body = json && typeof json === 'object' ? /** @type {Record<string, unknown>} */ (json) : {}
  const data = body.data && typeof body.data === 'object'
    ? /** @type {Record<string, unknown>} */ (body.data)
    : {}
  if (body.success && typeof data.access_token === 'string' && data.access_token) {
    return {
      kind: 'success',
      accessToken: String(data.access_token),
      userId: data.user_id != null ? String(data.user_id) : '',
      username: typeof data.username === 'string' ? data.username : '',
    }
  }
  const code = String(body.code || '')
  if (code === 'authorization_pending') {
    return { kind: 'pending', intervalSec: body.interval ? Number(body.interval) : undefined }
  }
  if (code === 'slow_down') {
    return { kind: 'slow_down', intervalSec: body.interval ? Number(body.interval) : undefined }
  }
  if (code === 'access_denied') return { kind: 'denied' }
  if (code === 'expired_token' || code === 'invalid_grant') return { kind: 'expired' }
  return { kind: 'error', message: String(body.message || body.error || 'device token poll failed') }
}

/**
 * @param {{ fetcher: typeof fetch, url: string, method?: string, headers?: Record<string, string>, body?: unknown }} req
 */
export async function requestJson(req) {
  const response = await req.fetcher(req.url, {
    method: req.method ?? 'POST',
    headers: { Accept: 'application/json', ...req.headers },
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, ok: response.ok, json }
}

/**
 * @param {{ fetcher?: typeof fetch, siteBaseUrl: string, clientName?: string }} opts
 */
export async function startDeviceLogin(opts) {
  const fetcher = opts.fetcher ?? fetch
  const siteBaseUrl = resolveSiteBaseUrl(opts.siteBaseUrl)
  const result = await requestJson({
    fetcher,
    url: joinUrl(siteBaseUrl, '/api/user/device/code'),
    headers: { 'Content-Type': 'application/json' },
    body: { client_name: opts.clientName || CLIENT_NAME },
  })
  const parsed = parseDeviceCodeResponse(result.json)
  if (!parsed.ok) {
    const error = new Error(parsed.message)
    error.code = 'device_code_failed'
    throw error
  }
  return { ...parsed, siteBaseUrl }
}

/**
 * @param {{ fetcher?: typeof fetch, siteBaseUrl: string, deviceCode: string }} opts
 */
export async function pollDeviceToken(opts) {
  const fetcher = opts.fetcher ?? fetch
  const result = await requestJson({
    fetcher,
    url: joinUrl(resolveSiteBaseUrl(opts.siteBaseUrl), '/api/user/device/token'),
    headers: { 'Content-Type': 'application/json' },
    body: { device_code: opts.deviceCode, grant_type: GRANT_TYPE },
  })
  if (result.status >= 400 && result.status < 500 && parseDeviceTokenResponse(result.json).kind === 'error') {
    return { kind: 'denied', message: `HTTP ${result.status}` }
  }
  return parseDeviceTokenResponse(result.json)
}

/**
 * @param {{ fetcher?: typeof fetch, siteBaseUrl: string, token: string, userId?: string }} opts
 */
export async function fetchSelf(opts) {
  const fetcher = opts.fetcher ?? fetch
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${opts.token}` }
  if (opts.userId) headers['New-Api-User'] = String(opts.userId)
  const result = await requestJson({
    fetcher,
    url: joinUrl(resolveSiteBaseUrl(opts.siteBaseUrl), '/api/user/self'),
    method: 'GET',
    headers,
  })
  if (result.status === 401) {
    const error = new Error('authentication failed')
    error.code = 'token_invalid'
    throw error
  }
  if (!result.ok) {
    const error = new Error(`self request failed (HTTP ${result.status})`)
    error.code = 'self_failed'
    throw error
  }
  const body = result.json && typeof result.json === 'object'
    ? /** @type {Record<string, unknown>} */ (result.json)
    : {}
  const data = body.data && typeof body.data === 'object' ? body.data : body
  return stripProfile(data)
}

/**
 * Public status payload. Never includes a token.
 * @param {{ loggedIn: boolean, verified?: boolean | null, siteBaseUrl: string, profile?: ReturnType<typeof stripProfile> | null }} input
 */
export function publicStatus(input) {
  const profile = input.profile ?? null
  return {
    logged_in: input.loggedIn,
    verified: input.verified ?? null,
    base_url: input.siteBaseUrl,
    ...profile === null ? {} : profile,
  }
}
