import { readFileSync, statSync } from 'node:fs'
import { OmnimuxError } from '../media/errors.js'
import { fetchSelf, publicStatus, resolveSiteBaseUrl } from './omnimux-auth.js'

/**
 * Shared identity read. Never returns a token.
 * @param {{
 *   store: ReturnType<typeof import('./store.js').createTokenStore>,
 *   siteBaseUrl: string,
 *   fetcher?: typeof fetch,
 * }} deps
 */
export function createIdentity(deps) {
  const siteBaseUrl = resolveSiteBaseUrl(deps.siteBaseUrl)
  const fetcher = deps.fetcher ?? fetch

  /**
   * @param {{ verify?: boolean }} [opts]
   */
  async function load(opts = {}) {
    const verify = opts.verify === true
    const info = await deps.store.describe()
    if (!info.configured) {
      return { kind: 'unsigned', body: publicStatus({ loggedIn: false, verified: null, siteBaseUrl }) }
    }
    const cached = deps.store.readProfileCache()
    if (!verify) {
      if (typeof deps.store.isExpired === 'function' && deps.store.isExpired()) {
        return {
          kind: 'token_invalid',
          body: publicStatus({ loggedIn: false, verified: false, siteBaseUrl, profile: cached }),
        }
      }
      if (hasPublicProfile(cached)) {
        return {
          kind: 'cached',
          body: publicStatus({ loggedIn: true, verified: null, siteBaseUrl, profile: cached }),
        }
      }
      // Token is shared (CLI/App) but this home has no public profile yet.
      // Fall through to /self so the settings card and cloud sidebar fill in.
    }
    const token = await deps.store.resolve()
    if (!token) {
      return { kind: 'unsigned', body: publicStatus({ loggedIn: false, verified: false, siteBaseUrl }) }
    }
    try {
      const profile = await fetchSelf({
        fetcher,
        siteBaseUrl,
        token,
      })
      deps.store.writeProfileCache(profile)
      if (profile && profile.id != null && typeof deps.store.writeConfig === 'function') {
        deps.store.writeConfig({ userId: String(profile.id), baseUrl: siteBaseUrl })
      }
      if (typeof deps.store.clearExpired === 'function') {
        deps.store.clearExpired()
      }
      return {
        kind: 'verified',
        body: publicStatus({ loggedIn: true, verified: true, siteBaseUrl, profile }),
      }
    } catch (error) {
      const invalid = error instanceof Error && error.code === 'token_invalid'
      if (invalid) {
        if (typeof deps.store.markExpired === 'function') {
          deps.store.markExpired()
        }
        return {
          kind: 'token_invalid',
          body: publicStatus({ loggedIn: false, verified: false, siteBaseUrl, profile: cached }),
        }
      }
      if (!verify) {
        return {
          kind: 'cached',
          body: publicStatus({ loggedIn: true, verified: false, siteBaseUrl, profile: cached }),
        }
      }
      return {
        kind: 'self_failed',
        body: publicStatus({ loggedIn: false, verified: false, siteBaseUrl }),
      }
    }
  }

  /**
   * @param {{ verify?: boolean }} [opts]
   */
  async function status(opts = {}) {
    const loaded = await load(opts)
    assertPublic(loaded.body)
    return loaded.body
  }

  /**
   * @param {{ verify?: boolean }} [opts]
   */
  async function require(opts = {}) {
    const body = await status(opts)
    if (!body.logged_in) {
      throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
    }
    return body
  }

  /**
   * Canonical local account only. Env/credential-only identity remains unknown.
   * @returns {{ logged_in: boolean, verified: null, base_url: string, id?: string | number }}
   */
  function getSnapshot() {
    const unknown = { logged_in: false, verified: null, base_url: siteBaseUrl }
    try {
      if (process.env.OMNIMUX_ACCESS_TOKEN?.trim() || deps.store.isExpired?.() !== false) return unknown
      const secretsStat = statSync(deps.store.secretsPath)
      const secrets = JSON.parse(readFileSync(deps.store.secretsPath, 'utf8'))
      const active = ownValue(ownValue(secrets, 'slots'), ownValue(secrets, 'active_slot'))
      const tokenPresent = [ownValue(secrets, 'access_token'), ownValue(active, 'access_token')]
        .some(value => typeof value === 'string' && value.trim() !== '')
      if (!tokenPresent) return unknown
      const profileStat = statSync(deps.store.profilePath)
      if (!secretsStat.isFile() || !profileStat.isFile() || profileStat.mtimeMs < secretsStat.mtimeMs) return unknown
      const id = ownValue(deps.store.readProfileCache(), 'id')
      const userId = ownValue(deps.store.readConfig(), 'user_id')
      if (!stableId(id) || !stableId(userId) || String(id).trim() !== String(userId).trim()) return unknown
      return { logged_in: true, verified: null, base_url: siteBaseUrl, id }
    } catch {
      // Missing, unreadable or malformed canonical evidence is not an authenticated account.
      return unknown
    }
  }

  return { load, status, require, getSnapshot }
}

/** @param {unknown} row @param {unknown} key */
function ownValue(row, key) {
  if (!row || typeof row !== 'object' || typeof key !== 'string') return undefined
  return Object.getOwnPropertyDescriptor(row, key)?.value
}

/** @param {unknown} value @returns {value is string | number} */
function stableId(value) {
  return (typeof value === 'string' && value.trim() !== '') ||
    (typeof value === 'number' && Number.isFinite(value))
}

/**
 * @param {unknown} profile
 */
function hasPublicProfile(profile) {
  if (!profile || typeof profile !== 'object') return false
  const row = /** @type {Record<string, unknown>} */ (profile)
  if (row.id != null && String(row.id).trim() !== '') return true
  if (typeof row.username === 'string' && row.username.trim() !== '') return true
  if (typeof row.display_name === 'string' && row.display_name.trim() !== '') return true
  return false
}

/**
 * @param {unknown} body
 */
export function assertPublic(body) {
  const text = JSON.stringify(body)
  if (/access_token|"sk-/.test(text)) {
    throw new OmnimuxError('omnimux-invalid-response', 'refused to emit a secret')
  }
}
