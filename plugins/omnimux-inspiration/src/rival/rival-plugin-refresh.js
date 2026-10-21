/**
 * Manual "update this account" over the user's own browser (Issue #3556).
 *
 * Three host endpoints, one one-time token, zero cloud calls:
 *
 * 1. `request` — the app asks for a token; the host mints one, stores it on the
 *    account row and returns the profile URL with `#omnimux-refresh=<token>`.
 * 2. `claim` — the content script, running inside the user's real logged-in
 *    page, trades the token for the account identity it is allowed to write.
 *    Claiming consumes the token's "unused" half.
 * 3. `complete` — the capture comes back and is merged: profile fields,
 *    per-post stats upsert, and the account's refresh timers reset.
 *
 * Why this is a separate module from `rival-accounts-service.js`: the cloud
 * refresh path must stay auditable as "exactly two `omnimux_social_data`
 * calls", and this path must be auditable as "zero". Keeping it beside the
 * cloud path and asserting the remote spy from the outside is how that stays
 * true; importing the remote here at all would be the bug.
 *
 * Contract: `specs/account-plugin-refresh.spec.md` §3.1/§3.3/§3.5.
 *
 * Handlers return the same `{ status, body }` envelope the rival dispatcher
 * already produces, so the route table stays a protocol adapter and the whole
 * state machine can be driven without a socket.
 */

import { randomBytes } from 'node:crypto'
import { POSTS_CACHE_MAX_ROWS, RIVAL_ERROR_CODES } from './constants.js'
import { rivalProfileUrl } from './rival-identity.js'
import { detectPlatformFromUrl, normalizeUrl } from '../url-normalizer.js'

/** Lifetime of a refresh token: two minutes, claim included. */
export const PLUGIN_REFRESH_TTL_MS = 2 * 60 * 1000

/**
 * Platforms the browser capture supports. The content script only runs on
 * these two profile pages (`specs/account-plugin-refresh.spec.md` §3.4), so a
 * token for any other platform could never be claimed and is refused up front.
 */
export const PLUGIN_REFRESH_PLATFORMS = Object.freeze(['tiktok', 'x'])

/** Local error codes (mirrors the module's other codes; not in `constants.js`). */
const CODES = Object.freeze({
  ACCOUNT_NOT_FOUND: RIVAL_ERROR_CODES.ACCOUNT_NOT_FOUND,
  PLATFORM_UNSUPPORTED: RIVAL_ERROR_CODES.PLATFORM_UNSUPPORTED,
  UNKNOWN: 'plugin-refresh-unknown-token',
  EXPIRED: 'plugin-refresh-expired',
  CLAIMED: 'plugin-refresh-already-claimed',
  COMPLETED: 'plugin-refresh-already-completed',
  UNCLAIMED: 'plugin-refresh-not-claimed',
  PLATFORM: 'plugin-refresh-platform-mismatch',
  HANDLE: 'plugin-refresh-handle-mismatch',
  CAPTURE: 'plugin-refresh-invalid-capture',
  PROFILE_URL: 'plugin-refresh-profile-url-missing',
})

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {Record<string, any>} data
 * @param {number} [status]
 */
function ok(data, status = 200) {
  return { status, body: { data } }
}

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function fail(status, code, message) {
  return { status, body: { error: message, code } }
}

/**
 * Clock of the store the handler was given.
 *
 * The store owns the injected clock (`createRivalAccountsStore({ now })`), so
 * the TTL arithmetic here is assertable with the same fixed clock the rest of
 * the module uses — no second `Date.now()` seam that a test would have to fake.
 * @param {{ store: any }} ctx
 * @returns {number}
 */
function nowMs(ctx) {
  return typeof ctx?.store?.now === 'function' ? ctx.store.now() : Date.now()
}

/**
 * The persisted token record of an account, or `null`.
 * @param {Record<string, any> | null | undefined} account
 */
function tokenRecord(account) {
  return isPlainObject(account?.plugin_refresh) ? account.plugin_refresh : null
}

/**
 * Account currently holding `token`, or `null`.
 *
 * The lookup is a full scan because the store has no token index and the
 * account list is a handful of rows; adding a persisted index would be a
 * second source of truth for a value with a two-minute life.
 * @param {any} store
 * @param {unknown} rawToken
 * @returns {Record<string, any> | null}
 */
function findAccountByToken(store, rawToken) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : ''
  if (!token) return null
  const rows = typeof store.listAccounts === 'function' ? store.listAccounts() : []
  return rows.find((row) => tokenRecord(row)?.token === token) || null
}

/**
 * Whether a token record is past its TTL at `atMs`.
 *
 * A record without a parseable `expires_at` is treated as expired: a token
 * whose lifetime cannot be proven must not be accepted.
 * @param {{ expires_at?: unknown } | null} record
 * @param {number} atMs
 */
function isExpired(record, atMs) {
  const expires = Date.parse(String(record?.expires_at || ''))
  return Number.isNaN(expires) || expires <= atMs
}

/**
 * Comparison form of a handle: no `@`, lower case, trimmed.
 * @param {unknown} value
 * @returns {string}
 */
function normalizedHandle(value) {
  return typeof value === 'string' ? value.trim().replace(/^@+/, '').toLowerCase() : ''
}

/**
 * The account's own handle in comparison form.
 * `external_id` is the fallback because it carries the same `@name` identity
 * for the two supported platforms and a hand-edited row may omit `handle`.
 * @param {Record<string, any>} account
 */
function accountHandle(account) {
  return normalizedHandle(account.handle) || normalizedHandle(account.external_id)
}

/**
 * Profile URL a token should open: the stored page when there is one, otherwise
 * the canonical page built from platform + identity.
 * @param {Record<string, any>} account
 * @returns {string}
 */
function profilePageUrl(account) {
  const resolved = rivalProfileUrl(account)
  if (resolved) return resolved
  const handle = normalizedHandle(account.handle) || normalizedHandle(account.external_id)
  if (!handle) return ''
  if (account.platform === 'x') return `https://x.com/@${handle}`
  if (account.platform === 'tiktok') return `https://www.tiktok.com/@${handle}`
  return ''
}

/**
 * Platform slug of a claimed/complete page URL, or `''` when unparseable.
 * `x.com` and `twitter.com` both answer `x`.
 * @param {unknown} url
 * @returns {string}
 */
function pagePlatform(url) {
  const platform = detectPlatformFromUrl(typeof url === 'string' ? url : '')
  return platform === 'unknown' ? '' : platform
}

/**
 * One-time tokens that have been completed.
 *
 * After a successful `complete` the account row no longer carries the token
 * (`plugin_refresh = null`, §3.5), which would make a replayed claim look like
 * a token that never existed (404). A short-lived tombstone instead answers
 * "already used" (409), which is the truthful answer and what the extension's
 * failure copy distinguishes. Keyed per store so a second dispatcher in the
 * same process cannot inherit another world's tokens; entries drop at the
 * token's own expiry, so this never grows without bound.
 * @type {WeakMap<object, Map<string, number>>}
 */
const completedTokens = new WeakMap()

/**
 * @param {any} store
 * @returns {Map<string, number>}
 */
function tombstonesOf(store) {
  let map = completedTokens.get(store)
  if (!map) {
    map = new Map()
    completedTokens.set(store, map)
  }
  return map
}

/**
 * @param {any} store
 * @param {string} token
 * @param {number} expiresAtMs
 */
function rememberCompletedToken(store, token, expiresAtMs) {
  tombstonesOf(store).set(token, Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + PLUGIN_REFRESH_TTL_MS)
}

/**
 * Whether `token` is a completed (but still unexpired) token.
 * @param {any} store
 * @param {string} token
 * @param {number} atMs
 * @returns {boolean}
 */
function isCompletedToken(store, token, atMs) {
  const map = tombstonesOf(store)
  const expiresAt = map.get(token)
  if (expiresAt === undefined) return false
  if (expiresAt <= atMs) {
    map.delete(token)
    return false
  }
  return true
}

/**
 * Non-empty text or `undefined`, for the "empty never overwrites" rule.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function nonEmptyText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * Integer or `undefined`; a fractional or string count is ignored rather than
 * coerced, because a wrong follower count is worse than a stale one.
 * @param {unknown} value
 * @returns {number | undefined}
 */
function integerOrUndefined(value) {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/**
 * Profile half of `complete`: only fields the capture actually carries.
 * @param {Record<string, any>} capture
 * @returns {Record<string, any>}
 */
function profilePatch(capture) {
  const patch = {}
  for (const key of ['nickname', 'avatar_url', 'bio']) {
    const value = nonEmptyText(capture[key])
    if (value !== undefined) patch[key] = value
  }
  for (const key of ['followers', 'posts_count']) {
    const value = integerOrUndefined(capture[key])
    if (value !== undefined) patch[key] = value
  }
  return patch
}

/**
 * Identity used for a captured post: the platform's own id, else its canonical
 * URL (§3.5 "按 platform_post_id（无则 canonical URL）upsert").
 * @param {Record<string, any>} post
 * @returns {string}
 */
function capturedPostId(post) {
  const raw = post.platform_post_id
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return normalizeUrl(typeof post.source_url === 'string' ? post.source_url : '')
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function nullableCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Rows handed to the store's `commitPluginRefresh`.
 *
 * The store's row builder owns the persisted shape; this only maps the capture
 * vocabulary (`content`, `source_url`, `platform_post_id`) onto it and drops
 * rows that carry no usable identity rather than writing an `''`-id row.
 * @param {unknown} posts
 * @returns {Record<string, any>[]}
 */
function capturedPostRows(posts) {
  if (!Array.isArray(posts)) return []
  const rows = []
  // The capture is a first-screen sample, never a full history; the cache bound
  // also caps how much work a crafted payload can ask of one request.
  for (const post of posts.slice(0, POSTS_CACHE_MAX_ROWS)) {
    if (!isPlainObject(post)) continue
    const id = capturedPostId(post)
    if (!id) continue
    const stats = isPlainObject(post.stats) ? post.stats : {}
    rows.push({
      id,
      url: typeof post.source_url === 'string' ? post.source_url : '',
      title: typeof post.title === 'string' ? post.title : '',
      text: typeof post.content === 'string' ? post.content : '',
      posted_at: nonEmptyText(post.posted_at) ?? null,
      stats: {
        likes: nullableCount(stats.likes),
        comments: nullableCount(stats.comments),
        views: nullableCount(stats.views),
        shares: nullableCount(stats.shares),
      },
    })
  }
  return rows
}

/**
 * §3.1: mint a one-time token for one account and return the URL to open.
 * @param {{ store: any, accountId?: string }} ctx
 */
export function handlePluginRefreshRequest(ctx) {
  const store = ctx?.store
  const accountId = typeof ctx?.accountId === 'string' ? ctx.accountId : ''
  const account = accountId && typeof store?.getAccount === 'function' ? store.getAccount(accountId) : null
  if (!account) {
    return fail(404, CODES.ACCOUNT_NOT_FOUND, `对标账号不存在 (account not found): ${accountId}`)
  }
  if (!PLUGIN_REFRESH_PLATFORMS.includes(account.platform)) {
    return fail(400, CODES.PLATFORM_UNSUPPORTED, '仅 TikTok / X 账号支持浏览器插件更新')
  }
  const pageUrl = profilePageUrl(account).split('#')[0]
  if (!pageUrl) {
    return fail(422, CODES.PROFILE_URL, '该账号缺少主页地址，无法发起浏览器插件更新')
  }
  const at = nowMs(ctx)
  const token = randomBytes(16).toString('hex')
  const createdAt = new Date(at).toISOString()
  const expiresAt = new Date(at + PLUGIN_REFRESH_TTL_MS).toISOString()
  // One write, one row: a second request for the same account replaces the
  // token in place, and the previous one stops existing at the same instant
  // (§2 J6).
  store.updateAccount(account.id, {
    plugin_refresh: { token, created_at: createdAt, expires_at: expiresAt, claimed_at: null },
  })
  return ok({ token, url: `${pageUrl}#omnimux-refresh=${token}`, expires_at: expiresAt }, 201)
}

/**
 * §3.3: the page proved it is the right account; consume the unused half.
 * @param {{ store: any, body?: Record<string, any> }} ctx
 */
export function handlePluginRefreshClaim(ctx) {
  const store = ctx?.store
  const body = isPlainObject(ctx?.body) ? ctx.body : {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const at = nowMs(ctx)
  if (!token) return fail(404, CODES.UNKNOWN, '刷新令牌不存在或已失效')
  const account = findAccountByToken(store, token)
  if (!account) {
    if (isCompletedToken(store, token, at)) {
      return fail(409, CODES.COMPLETED, '该刷新令牌已完成回写，请在 OmniMux 重新发起更新')
    }
    return fail(404, CODES.UNKNOWN, '刷新令牌不存在或已失效')
  }
  const record = tokenRecord(account)
  if (isExpired(record, at)) {
    return fail(410, CODES.EXPIRED, '刷新令牌已过期，请在 OmniMux 重新发起更新')
  }
  if (record.claimed_at) {
    return fail(409, CODES.CLAIMED, '该刷新令牌已被使用，请在 OmniMux 重新发起更新')
  }
  const platform = pagePlatform(body.page_url)
  if (platform && platform !== account.platform) {
    return fail(409, CODES.PLATFORM, '页面平台与目标账号不一致')
  }
  const handle = normalizedHandle(body.handle)
  if (!handle || handle !== accountHandle(account)) {
    return fail(409, CODES.HANDLE, '页面账号与目标账号不一致，请确认打开的是该账号主页')
  }
  const pageUrl = nonEmptyText(body.page_url) ?? profilePageUrl(account)
  const claimed = store.updateAccount(account.id, {
    plugin_refresh: { ...record, claimed_at: new Date(at).toISOString() },
  })
  return ok({
    account_id: claimed.id,
    platform: claimed.platform,
    handle: claimed.handle,
    page_url: pageUrl,
  })
}

/**
 * §3.5: merge the capture and reset the account's refresh timers.
 *
 * No remote, scheduler or budget call is reachable from here — that is the
 * point of the whole flow, and the test asserts it with a remote spy.
 * @param {{ store: any, body?: Record<string, any> }} ctx
 */
export function handlePluginRefreshComplete(ctx) {
  const store = ctx?.store
  const body = isPlainObject(ctx?.body) ? ctx.body : {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const at = nowMs(ctx)
  if (!token) return fail(404, CODES.UNKNOWN, '刷新令牌不存在或已失效')
  const account = findAccountByToken(store, token)
  if (!account) {
    if (isCompletedToken(store, token, at)) {
      return fail(409, CODES.COMPLETED, '该刷新令牌已完成回写，请在 OmniMux 重新发起更新')
    }
    return fail(404, CODES.UNKNOWN, '刷新令牌不存在或已失效')
  }
  const record = tokenRecord(account)
  if (isExpired(record, at)) {
    return fail(410, CODES.EXPIRED, '刷新令牌已过期，请在 OmniMux 重新发起更新')
  }
  if (!record.claimed_at) {
    return fail(409, CODES.UNCLAIMED, '刷新令牌尚未认领，无法回写')
  }
  if (!isPlainObject(body.account)) {
    return fail(400, CODES.CAPTURE, '缺少采集数据 (account)')
  }
  const capture = body.account
  const capturePlatform = typeof capture.platform === 'string' ? capture.platform.trim().toLowerCase() : ''
  if (capturePlatform && capturePlatform !== account.platform) {
    return fail(409, CODES.PLATFORM, '采集数据平台与目标账号不一致')
  }
  const handle = normalizedHandle(capture.handle)
  if (!handle || handle !== accountHandle(account)) {
    return fail(409, CODES.HANDLE, '采集数据账号与目标账号不一致，请确认打开的是该账号主页')
  }

  const intervalHours = Number(account.refresh_interval_hours)
  const hasSchedule = Number.isFinite(intervalHours) && intervalHours > 0
  const accountPatch = {
    ...profilePatch(capture),
    last_checked_at: new Date(at).toISOString(),
    last_refresh_at: new Date(at).toISOString(),
    refresh_state: 'idle',
    consecutive_failures: 0,
    error_code: null,
    error_message: null,
    // `0` means "manual only" (constants.js), so it stays unscheduled exactly
    // as `rival-accounts-service.js` writes it.
    next_auto_refresh_at: hasSchedule ? new Date(at + intervalHours * 3_600_000).toISOString() : null,
    plugin_refresh: null,
  }
  const result = store.commitPluginRefresh(account.id, {
    rows: capturedPostRows(capture.posts),
    accountPatch,
    platform: account.platform,
    externalId: account.external_id,
  })
  rememberCompletedToken(store, token, Date.parse(String(record.expires_at || '')))
  return ok({
    updated_posts: result.updated_posts,
    new_posts: result.new_posts,
    account: result.account,
  })
}
