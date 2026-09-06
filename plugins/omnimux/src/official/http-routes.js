import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { DEFAULT_SITE, resolveSiteBaseUrl } from '../auth/omnimux-auth.js'
import { assertLocalWrite } from '../apps/origin.js'
import { OmnimuxError } from '../media/errors.js'
import { connectAccount, disconnectAccount, listAccounts } from './accounts.js'
import {
  getDailyMetrics,
  getBestTimeToPost,
  getPostingFrequency,
  getContentDecay,
  getFollowerStats,
  getPostAnalytics,
  syncExternalPosts,
  getInboxAnalytics,
} from './analytics.js'
import {
  aggregateFollowers,
  aggregateInsights,
  aggregateOverview,
  aggregatePosts,
  aggregateSync,
} from './analytics-aggregate.js'
import { createOfficialClient } from './client.js'
import { DEFAULT_ACCOUNT_AVATARS, parseOfficialConfig } from './config.js'
import { computeStatus, filterRows, localAvatarUrl, pickAccountsView, pickConnectView } from './public-account.js'
import { mergeMeta } from './account-meta.js'
import { requireSocialProvider } from './provider.js'

const ACCOUNTS_PREFIX = '/omnimux/accounts/'

/** In-memory no-op store so a dispatcher assembled without one still works. */
function emptyMetaStore() {
  return {
    read: () => ({}),
    update: (_id, patch) => ({ ...(patch && typeof patch === 'object' ? patch : {}) }),
    remove: () => {},
  }
}

/** Same idea as emptyMetaStore: HTTP still runs when Host did not wire a cache. */
function emptyAvatarStore() {
  return {
    has: () => false,
    get: () => null,
    sourceUrl: () => '',
    localUrlFor: (id) => localAvatarUrl(id),
    remove: () => {},
    putFromUrl: async () => ({ ok: false, reason: 'noop' }),
  }
}

/**
 * @param {unknown} value
 */
function resolveAvatarConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
  const concurrency = typeof source.concurrency === 'number' && Number.isInteger(source.concurrency) && source.concurrency >= 1
    ? source.concurrency
    : DEFAULT_ACCOUNT_AVATARS.concurrency
  return {
    enabled: source.enabled !== false,
    concurrency,
  }
}

/**
 * Pathname → account id for `GET /omnimux/accounts/{id}/avatar`.
 * `{id}` may contain `%2F`; a raw `/` means this is not the avatar route.
 * @param {string} pathname
 */
export function avatarIdFromPath(pathname) {
  if (!pathname.startsWith(ACCOUNTS_PREFIX) || !pathname.endsWith('/avatar')) return ''
  const raw = pathname.slice(ACCOUNTS_PREFIX.length, -'/avatar'.length)
  if (!raw || raw.includes('/') || raw === '..') return ''
  try {
    const decoded = decodeURIComponent(raw)
    if (decoded === '..') return ''
    return decoded
  } catch {
    return ''
  }
}

/**
 * Maps an official request failure to a safe HTTP response.
 * @param {unknown} error
 * @returns {{ status: number, body: Record<string, string> }}
 */
export function mapOfficialError(error) {
  if (error instanceof OmnimuxError && ['invalid-provider', 'account-provider-mismatch', 'post-provider-mismatch'].includes(error.code)) {
    return { status: error.code === 'invalid-provider' ? 400 : 409, body: { error: error.code, message: error.message } }
  }
  if (error instanceof OmnimuxError && error.code === 'quota-exceeded') {
    return { status: 402, body: { error: 'quota-exceeded', message: '当前操作需要更多额度，充值后即可继续使用 OmniMux。' } }
  }
  if (error instanceof OmnimuxError && error.code === 'needs-omnimux') {
    return { status: 401, body: { error: 'needs-omnimux', message: '请先登录 OmniMux。' } }
  }
  return { status: 502, body: { error: error instanceof Error ? error.message : String(error) } }
}

/**
 * Validates a PATCH body against the metadata contract.
 * @param {unknown} body
 * @returns {{ patch: Record<string, string | boolean | null> } | { error: string }}
 */
function parseMetaPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'json object body is required' }
  }
  /** @type {Record<string, string | boolean | null>} */
  const patch = {}
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (body))) {
    if (key === 'group') {
      if (value === null) {
        patch.group = null
      } else if (typeof value === 'string') {
        const trimmed = value.trim()
        patch.group = trimmed === '' ? null : trimmed
      } else {
        return { error: 'group must be a string or null' }
      }
      continue
    }
    if (key === 'agent_usable') {
      if (typeof value !== 'boolean') return { error: 'agent_usable must be a boolean' }
      patch.agent_usable = value
      continue
    }
    return { error: `unexpected field: ${key}` }
  }
  if (!('group' in patch) && !('agent_usable' in patch)) {
    return { error: 'nothing to update' }
  }
  return { patch }
}

/**
 * @param {{
 *   official?: { mount: boolean, accountAvatars?: { enabled?: boolean, concurrency?: number } },
 *   identity?: { require: Function },
 *   store?: { resolve: () => Promise<string | undefined> },
 *   siteBaseUrl?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fetcher?: typeof fetch,
 *   client?: { withPat: Function },
 *   metaStore?: { read: Function, update: Function, remove: Function },
 *   avatarStore?: {
 *     has: Function,
 *     get: Function,
 *     sourceUrl?: Function,
 *     localUrlFor: Function,
 *     remove: Function,
 *     putFromUrl: Function,
 *   },
 * }} [deps]
 */
export function createOfficialDispatcher(deps = {}) {
  const env = deps.env ?? process.env
  const official = deps.official ?? parseOfficialConfig(undefined)
  const siteBaseUrl = resolveSiteBaseUrl(deps.siteBaseUrl || env.OMNIMUX_SITE_URL || DEFAULT_SITE)
  const metaStore = deps.metaStore ?? emptyMetaStore()
  const avatarStore = deps.avatarStore ?? emptyAvatarStore()
  const avatarCfg = resolveAvatarConfig(official.accountAvatars)
  const client = deps.client ?? createOfficialClient({
    fetcher: deps.fetcher,
    siteBaseUrl,
    apiBaseUrl: (env.OMNIMUX_BASE_URL || 'https://api.omnimux.ai/v1').replace(/\/v1\/?$/, ''),
    resolveApiKey: () => env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN,
    async resolveAccess() {
      if (!deps.identity || typeof deps.identity.require !== 'function') {
        throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      }
      const profile = await deps.identity.require()
      const token = await deps.store?.resolve()
      if (!token) {
        throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      }
      return { token, userId: profile.id }
    },
  })

  /** @type {Set<string>} */
  const inflight = new Set()
  /** @type {Array<{ id: string, url: string }>} */
  const fillQueue = []
  let fillActive = 0

  /**
   * Fire-and-forget CDN fetch. Failures never surface on GET list.
   * @param {string} id
   * @param {string} url
   */
  function enqueueFill(id, url) {
    if (!avatarCfg.enabled) return
    if (typeof avatarStore.putFromUrl !== 'function') return
    if (inflight.has(id)) return
    inflight.add(id)
    fillQueue.push({ id, url })
    pumpFill()
  }

  function pumpFill() {
    while (fillActive < avatarCfg.concurrency && fillQueue.length > 0) {
      const job = fillQueue.shift()
      if (!job) break
      fillActive += 1
      Promise.resolve(avatarStore.putFromUrl(job.id, job.url))
        .catch(() => {})
        .finally(() => {
          inflight.delete(job.id)
          fillActive -= 1
          pumpFill()
        })
    }
  }

  /**
   * Rewrite cached rows to the same-origin byte route and enqueue misses.
   * Runs on the unfiltered view so `?platform=` does not skip cache fills.
   * @param {Array<Record<string, unknown>>} rows
   */
  function rewriteAvatars(rows) {
    if (!avatarCfg.enabled) return
    for (const row of rows) {
      const id = String(row.id)
      const remote = typeof row.avatar_url === 'string' ? row.avatar_url : ''
      const cachedUrl = typeof avatarStore.sourceUrl === 'function' ? String(avatarStore.sourceUrl(id) || '') : ''
      if (avatarStore.has(id) && (cachedUrl === '' || remote === '' || cachedUrl === remote)) {
        row.avatar_url = avatarStore.localUrlFor(id)
      } else if (/^https:\/\//i.test(remote)) {
        enqueueFill(id, remote)
      }
    }
  }

  /**
   * @param {{ method: string, url: string, body?: unknown, origin?: string, referer?: string, secFetchSite?: string }} req
   */
  async function dispatch(req) {
    if (!official.mount) return { status: 404, body: { error: 'not found' } }
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = req.method.toUpperCase()
    const path = url.pathname
    const avatarId = avatarIdFromPath(path)
    const looksLikeAvatar = path.startsWith(ACCOUNTS_PREFIX) && path.endsWith('/avatar')
    if (looksLikeAvatar) {
      if (method !== 'GET') return { status: 405, body: { error: 'method not allowed' } }
      if (!avatarCfg.enabled || !avatarId) return { status: 404, body: { error: 'not found' } }
      try {
        if (!deps.identity || typeof deps.identity.require !== 'function') {
          throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
        }
        await deps.identity.require()
      } catch (error) {
        return mapOfficialError(error)
      }
      const hit = avatarStore.get(avatarId)
      if (!hit || !Buffer.isBuffer(hit.buffer)) return { status: 404, body: { error: 'not found' } }
      return {
        status: 200,
        raw: true,
        body: hit.buffer,
        headers: {
          'Content-Type': hit.mimeType,
          'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
          'Content-Length': String(hit.buffer.length),
        },
      }
    }
    if (method !== 'GET') {
      try {
        assertLocalWrite(req)
      } catch (error) {
        return { status: 403, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }
    try {
      if (method === 'GET' && path === '/omnimux/accounts') {
        const provider = requireSocialProvider(url.searchParams.get('provider'))
        const raw = await listAccounts(client, { provider })
        const meta = metaStore.read()
        const view = pickAccountsView(raw, { meta, now: Date.now() })
        rewriteAvatars(view.accounts)
        return {
          status: 200,
          body: {
            accounts: filterRows(view.accounts, {
              platform: url.searchParams.get('platform') || '',
              group: url.searchParams.get('group') || '',
            }),
          },
        }
      }
      if (method === 'POST' && path === '/omnimux/accounts') {
        const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
        const platform = typeof body.platform === 'string' ? body.platform.trim() : ''
        if (!platform) return { status: 400, body: { error: 'platform is required' } }
        const redirect = typeof body.redirect_url === 'string' ? body.redirect_url.trim() : ''
        if (redirect && !/^https:\/\//i.test(redirect)) {
          return { status: 400, body: { error: 'redirect_url must be https' } }
        }
        const raw = await connectAccount(client, {
          provider: body.provider,
          platform,
          redirect_url: redirect || undefined,
        })
        return { status: 200, body: pickConnectView(raw) }
      }
      if (method === 'PATCH' && path.startsWith(ACCOUNTS_PREFIX)) {
        const id = decodeURIComponent(path.slice(ACCOUNTS_PREFIX.length))
        if (!id || id.includes('/')) return { status: 400, body: { error: 'id is required' } }
        const parsed = parseMetaPatch(req.body)
        if ('error' in parsed) return { status: 400, body: { error: parsed.error } }
        const provider = requireSocialProvider(url.searchParams.get('provider'))
        const raw = await listAccounts(client, { provider })
        const siteRow = pickAccountsView(raw).accounts.find((row) => String(row.id) === id)
        if (!siteRow) throw new OmnimuxError('account-provider-mismatch', 'account is not available in this provider')
        const meta = metaStore.update(id, parsed.patch)
        const account = mergeMeta(siteRow, meta)
        account.status = computeStatus(account, Date.now())
        return { status: 200, body: { account } }
      }
      if (method === 'DELETE' && path.startsWith(ACCOUNTS_PREFIX)) {
        const id = decodeURIComponent(path.slice(ACCOUNTS_PREFIX.length))
        if (!id || id.includes('/')) return { status: 400, body: { error: 'id is required' } }
        await disconnectAccount(client, { id, provider: url.searchParams.get('provider') })
        metaStore.remove(id)
        avatarStore.remove(id)
        return { status: 200, body: { ok: true } }
      }

      // --- Analytics dashboard facade (UI view model) ---
      if (method === 'GET' && path === '/omnimux/analytics/overview') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await aggregateOverview(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/insights') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await aggregateInsights(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/followers') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await aggregateFollowers(client, query)
        return { status: 200, body: data }
      }
      if (method === 'POST' && path === '/omnimux/analytics/sync') {
        const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
        const data = await aggregateSync(client, body)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/sync') {
        const now = Date.now()
        return {
          status: 200,
          body: {
            syncStatus: {
              lastSyncedAt: now,
              nextSyncAt: now + 3_600_000,
              syncIntervalMs: 3_600_000,
              syncing: false,
              lastError: null,
            },
          },
        }
      }

      // --- Analytics raw PAT passthrough (Agent / debug) ---
      if (method === 'GET' && path === '/omnimux/analytics/daily-metrics') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await getDailyMetrics(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/best-time-to-post') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await getBestTimeToPost(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/posting-frequency') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await getPostingFrequency(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/content-decay') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await getContentDecay(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/follower-stats') {
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await getFollowerStats(client, query)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path === '/omnimux/analytics/posts') {
        const query = Object.fromEntries(url.searchParams.entries())
        if (query.timeRange) {
          const data = await aggregatePosts(client, query)
          return { status: 200, body: data }
        }
        const data = await getPostAnalytics(client, query)
        return { status: 200, body: data }
      }
      if (method === 'POST' && path === '/omnimux/analytics/sync-external-posts') {
        const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
        const data = await syncExternalPosts(client, body)
        return { status: 200, body: data }
      }
      if (method === 'GET' && path.startsWith('/omnimux/analytics/inbox/')) {
        const capability = path.slice('/omnimux/analytics/inbox/'.length)
        const query = Object.fromEntries(url.searchParams.entries())
        const data = await getInboxAnalytics(client, capability, query)
        return { status: 200, body: data }
      }
    } catch (error) {
      return mapOfficialError(error)
    }
    return { status: 404, body: { error: 'not found' } }
  }

  return { dispatch }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createOfficialDispatcher>} dispatcher
 */
export function registerOfficialRoutes(webServer, dispatcher) {
  const disposeAccounts = webServer.register({
    kind: 'prefix',
    path: '/omnimux/accounts',
    async handler(req, res) {
      try {
        const wantsBody = req.method === 'POST' || req.method === 'PATCH'
        const body = wantsBody ? await readJsonBody(req) : undefined
        if (wantsBody && body === null) {
          sendJson(res, 400, { error: 'invalid json' })
          return
        }
        const result = await dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || '/omnimux/accounts',
          body,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
        })
        if (result.raw) {
          res.writeHead(result.status, result.headers || { 'Content-Type': 'application/octet-stream' })
          res.end(result.body)
          return
        }
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal error' })
      }
    },
  })

  const disposeAnalytics = webServer.register({
    kind: 'prefix',
    path: '/omnimux/analytics',
    async handler(req, res) {
      try {
        const wantsBody = req.method === 'POST' || req.method === 'PATCH'
        const body = wantsBody ? await readJsonBody(req) : undefined
        if (wantsBody && body === null) {
          sendJson(res, 400, { error: 'invalid json' })
          return
        }
        const result = await dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || '/omnimux/analytics',
          body,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
        })
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal error' })
      }
    },
  })

  return () => {
    disposeAccounts()
    disposeAnalytics()
  }
}

/**
 * @param {{ headers?: Record<string, string | string[] | undefined> }} req
 * @param {string} name
 */
function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}
