import { OmnimuxError } from '../media/errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'

/**
 * Two-lane HTTP for official-only tools. Never returns PAT or sk- to callers.
 * @param {{
 *   fetcher?: typeof fetch,
 *   siteBaseUrl: string,
 *   apiBaseUrl?: string,
 *   resolveApiKey: () => Promise<string | undefined> | string | undefined,
 *   resolveAccess: () => Promise<{ token: string, userId?: string | number }>,
 * }} deps
 */
export function createOfficialClient(deps) {
  const fetcher = deps.fetcher ?? fetch
  const siteBaseUrl = String(deps.siteBaseUrl || '').replace(/\/+$/, '')
  const apiBaseUrl = String(deps.apiBaseUrl || 'https://api.omnimux.ai').replace(/\/+$/, '')

  /**
   * @param {string} base
   * @param {string} path
   * @param {{ method?: string, headers?: Record<string, string>, body?: unknown }} [opts]
   */
  async function request(base, path, opts = {}) {
    const method = opts.method || 'GET'
    const response = await fetcher(`${base}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    let json = null
    try {
      json = await response.json()
    } catch {
      json = {}
    }
    assertPublic(json)
    if (!response.ok) {
      if (['invalid-provider', 'account-provider-mismatch', 'post-provider-mismatch'].includes(json?.code)) {
        throw new OmnimuxError(json.code, pickErrorMessage(json) || json.code, { status: response.status })
      }
      const classification = classifyQuotaFailure({ status: response.status, body: json })
      if (classification.kind === 'needs-omnimux') {
        throw new OmnimuxError('needs-omnimux', classification.message, { status: response.status })
      }
      if (classification.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classification.message, { status: response.status, details: classification })
      }
      const message = pickErrorMessage(json) || `official request failed (HTTP ${response.status})`
      throw new OmnimuxError('omnimux-request-failed', message, { status: response.status })
    }
    return json
  }

  async function withSk(path, opts = {}) {
    const key = await deps.resolveApiKey()
    if (!key || !String(key).trim()) {
      throw new OmnimuxError('omnimux-unconfigured', 'set OMNIMUX_API_KEY or OMNIMUX_TOKEN')
    }
    return request(apiBaseUrl, path, {
      ...opts,
      headers: { authorization: `Bearer ${String(key).trim()}`, ...opts.headers },
    })
  }

  async function withPat(path, opts = {}) {
    const access = await deps.resolveAccess()
    if (!access?.token) {
      throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
    }
    /** @type {Record<string, string>} */
    const headers = { authorization: `Bearer ${access.token}` }
    if (access.userId != null && String(access.userId)) {
      headers['New-Api-User'] = String(access.userId)
    }
    return request(siteBaseUrl, path, {
      ...opts,
      headers: { ...headers, ...opts.headers },
    })
  }

  /**
   * PAT request that returns the raw Response (for media streams). Never
   * JSON-parses the body. 401/403 still throw needs-omnimux so the Host
   * surface can open the login gate.
   * @param {string} path
   * @param {{ method?: string, headers?: Record<string, string> }} [opts]
   */
  async function withPatRaw(path, opts = {}) {
    const access = await deps.resolveAccess()
    if (!access?.token) {
      throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
    }
    /** @type {Record<string, string>} */
    const headers = { authorization: `Bearer ${access.token}` }
    if (access.userId != null && String(access.userId)) {
      headers['New-Api-User'] = String(access.userId)
    }
    const method = opts.method || 'GET'
    const response = await fetcher(`${siteBaseUrl}${path}`, {
      method,
      headers: { ...headers, ...opts.headers },
    })
    if (response.status === 402) {
      throw new OmnimuxError('quota-exceeded', '当前操作需要更多额度，充值后即可继续使用 OmniMux。')
    }
    if (response.status === 401 || response.status === 403) {
      throw new OmnimuxError('needs-omnimux', `official request unauthorized (HTTP ${response.status})`)
    }
    return response
  }

  return { withSk, withPat, withPatRaw }
}

/**
 * @param {unknown} json
 */
export function assertPublic(json) {
  const text = JSON.stringify(json)
  if (/access_token|"sk-/.test(text)) {
    throw new OmnimuxError('omnimux-invalid-response', 'refused to emit a secret')
  }
}

/**
 * @param {unknown} json
 */
function pickErrorMessage(json) {
  if (!json || typeof json !== 'object') return ''
  const row = /** @type {Record<string, unknown>} */ (json)
  const data = row.data && typeof row.data === 'object' ? /** @type {Record<string, unknown>} */ (row.data) : {}
  const errVal = row.error || row.message || data.error || data.message
  if (errVal && typeof errVal === 'object') {
    const errObj = /** @type {Record<string, unknown>} */ (errVal)
    return String(errObj.message || errObj.code || errObj.type || JSON.stringify(errVal))
  }
  return String(errVal || '')
}
