/**
 * Use-case orchestration for the rival-accounts module.
 *
 * This is where the pieces meet: identity parsing (import + dedup), one refresh
 * cycle under the cost contract, the post list, "add to session" payloads and
 * "convert to inspiration". Every dependency is injected, so the whole service
 * runs offline and the cost contract can be asserted from the outside.
 *
 * The refresh body lives here rather than in the scheduler: the scheduler owns
 * *when* a refresh runs, this owns *what* it does, and reading them side by side
 * is how the "exactly two cloud calls" rule stays auditable.
 */

import { detectInputKind, parseRivalIdentity, rivalIdentityValue } from './rival-identity.js'
import { advanceMetrics, averageRecentViews, buildAccountProfile, computeAnalysis, computeMonitor } from './rival-analyze.js'
import { markPotential } from './rival-potential.js'
import { rivalMediaFilename, rivalMediaUrl } from './rival-paths.js'
import { RivalRemoteError } from './rival-remote.js'
import {
  BUDGET_REASONS,
  CLIENT_POLL_INTERVAL_MS,
  IDENTITY_KINDS,
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  POSTS_PER_REFRESH,
  REFRESH_INTERVAL_CHOICES,
  RIVAL_ERROR_CODES,
  RIVAL_LOCALE_KEYS,
} from './constants.js'

export class RivalServiceError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   * @param {{ reason?: string, detail?: unknown }} [meta]
   */
  constructor(code, message, status = 400, meta = {}) {
    super(message)
    this.name = 'RivalServiceError'
    this.code = code
    this.status = status
    this.reason = meta.reason
    this.detail = meta.detail
  }
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {number} nowMs
 * @param {number} hours
 * @returns {string | null}
 */
function nextRefreshAt(nowMs, hours) {
  if (!(hours > 0)) return null
  return new Date(nowMs + hours * 3_600_000).toISOString()
}

/**
 * @param {{
 *   store: any,
 *   remote: any,
 *   paths?: any,
 *   now?: () => number,
 *   importUrl?: (payload: { url: string, tags?: string[], auto_analyze?: boolean }) => Promise<any>,
 * }} deps
 */
export function createRivalAccountsService(deps) {
  const store = deps.store
  const remote = deps.remote
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const importUrl = typeof deps.importUrl === 'function' ? deps.importUrl : null

  /**
   * One refresh cycle: `user` (call 1), then `posts` (call 2), then local
   * marking and aggregation. No other cloud access exists on this path.
   *
   * The per-cycle cost guard throws on a third call, so a future edit that
   * "just needs one more lookup" fails loudly here instead of quietly spending
   * quota.
   *
   * Two "nothing came back" answers are distinguished on purpose: the `user`
   * sentinel and the `posts` sentinel are `no-content` failures, while an empty
   * `posts` list is a successful refresh with no new rows — a brand-new account
   * must not be backed off into the terminal `error` state for having no posts.
   * @param {{ account: Record<string, any> }} input
   */
  async function runCycle({ account }) {
    const cycle = remote.createCycle({})
    const value = rivalIdentityValue(account)
    let user
    try {
      user = await cycle.fetchUser({ platform: account.platform, value })
    } catch (err) {
      throw withCalls(err, cycle.calls())
    }
    if (user.status === 'empty') {
      throw new RivalRemoteError(RIVAL_ERROR_CODES.NO_CONTENT, '云端未返回该账号资料', { callsUsed: cycle.calls() })
    }
    let posts
    try {
      posts = await cycle.fetchPosts({ platform: account.platform, value })
    } catch (err) {
      throw withCalls(err, cycle.calls())
    }
    // The cloud answered with its no-content sentinel: there is nothing to
    // store, so the cycle is a `no-content` failure (design §7.2). An empty
    // *list* is not this case — it is a successful refresh with no new rows.
    if (posts.status === 'no-content') {
      throw new RivalRemoteError(RIVAL_ERROR_CODES.NO_CONTENT, '云端未返回该账号的动态内容', { callsUsed: cycle.calls() })
    }
    const rows = (posts.rows || []).slice(0, POSTS_PER_REFRESH)
    const marked = markPotential(rows, { now: new Date(now()).toISOString() })
    const written = store.writePosts(account.id, marked, {
      platform: account.platform,
      externalId: value,
      fieldProbe: { ...user.field_probe, ...posts.field_probe },
    })
    const analysis = computeAnalysis(written.items, { now: new Date(now()).toISOString() })
    const profile = user.profile || {}
    const nextIdentityKind = account.external_id_kind === 'handle-unverified'
      ? (IDENTITY_KINDS.includes('handle-verified') ? 'handle-verified' : account.external_id_kind)
      : account.external_id_kind
    return {
      ok: true,
      calls_used: cycle.calls(),
      accountPatch: {
        nickname: profile.nickname || account.nickname,
        bio: profile.bio || account.bio,
        followers: profile.followers ?? account.followers,
        posts_count: profile.posts_count ?? account.posts_count,
        external_id_kind: nextIdentityKind,
        external_id_canonical: profile.external_id_canonical || account.external_id_canonical,
        analysis,
        metrics: advanceMetrics(account, {
          followers: profile.followers ?? account.followers,
          posts_count: profile.posts_count ?? account.posts_count,
          avg_views_recent: averageRecentViews(written.items, 10),
        }),
      },
    }
  }

  /**
   * Attach the call count to an error on its way to the scheduler.
   * @param {unknown} err
   * @param {number} calls
   */
  function withCalls(err, calls) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (typeof (/** @type {any} */ (error).calls_used) !== 'number') {
      /** @type {any} */ (error).calls_used = calls
    }
    if (error.code === undefined) {
      /** @type {any} */ (error).code = RIVAL_ERROR_CODES.CLOUD_ERROR
    }
    return error
  }

  // The scheduler is injected: it owns queueing, backoff and budget, while this
  // module owns what one refresh actually does (`runCycle` below).
  const scheduler = deps.scheduler

  /**
   * Classify a pasted URL for the import dialog (E3).
   *
   * The refusal is the *error*, not a field on the answer: the dialog shows an
   * `unknown` URL by rendering this error's `body.error`, so nothing about the
   * refusal needs to survive into a successful return value.
   * @param {unknown} url
   */
  function classifyInput(url) {
    const result = detectInputKind(url)
    if (result.kind === 'unknown') {
      throw new RivalServiceError(RIVAL_ERROR_CODES.UNRECOGNIZED_URL, '无法识别的链接，请输入社媒主页或内容链接', 400)
    }
    return {
      kind: result.kind,
      platform: result.platform,
      ...(result.identity ? { external_id: result.identity.external_id } : {}),
      ...(result.identity ? { handle: result.identity.handle } : {}),
    }
  }

  /**
   * Import an account (E2).
   *
   * The row is stored before any cloud call, so a cloud failure never loses the
   * record the user just created. A duplicate answers `existing: true` without
   * touching the cloud at all (requirement 2).
   * @param {{ url?: string, tags?: string[], background?: boolean, force?: boolean }} args
   */
  async function importAccount(args = {}) {
    const identity = parseRivalIdentity(args.url)
    if (!identity) {
      throw new RivalServiceError(
        RIVAL_ERROR_CODES.IDENTITY_UNRESOLVED,
        '未能从该链接解析出账号身份，请使用账号主页链接',
        422,
      )
    }
    const existing = store.findAccount(identity.platform, identity.external_id)
    if (existing) {
      const hasPosts = store.readPosts(existing.id).length > 0
      if (args.force === true && !hasPosts) {
        const queued = scheduler.enqueue({ account_id: existing.id, mode: 'first' })
        return { account: existing, existing: true, is_duplicate: true, job: queued.queued ? 'running' : queued.status }
      }
      return { account: existing, existing: true, is_duplicate: true, job: null }
    }
    const account = store.addAccount({
      platform: identity.platform,
      external_id: identity.external_id,
      external_id_kind: identity.external_id_kind,
      handle: identity.handle,
      profile_url: identity.profile_url,
      tags: Array.isArray(args.tags) ? args.tags : [],
      refresh_interval_hours: store.readConfig().refresh_interval_hours,
      refresh_state: 'idle',
      next_auto_refresh_at: new Date(now()).toISOString(),
    })
    if (args.background === false) return { account, existing: false, is_duplicate: false, job: null }
    const queued = scheduler.enqueue({ account_id: account.id, mode: 'first' })
    if (queued.status === 'budget') {
      return { account: store.getAccount(account.id) || account, existing: false, is_duplicate: false, job: 'paused' }
    }
    return { account, existing: false, is_duplicate: false, job: queued.queued ? 'running' : queued.status }
  }

  /**
   * @param {string} id
   * @returns {Record<string, any>}
   */
  function requireAccount(id) {
    const account = store.getAccount(id)
    if (!account) throw new RivalServiceError(RIVAL_ERROR_CODES.ACCOUNT_NOT_FOUND, `对标账号不存在 (account not found): ${id}`, 404)
    return account
  }

  /**
   * @param {string} accountId
   * @param {string} postId
   * @returns {Record<string, any>}
   */
  function requirePost(accountId, postId) {
    requireAccount(accountId)
    const post = store.findPost(accountId, postId)
    if (!post) throw new RivalServiceError(RIVAL_ERROR_CODES.POST_NOT_FOUND, `对标帖子不存在 (post not found): ${postId}`, 404)
    return post
  }

  /**
   * The post list (E12), with the potential filter (requirement 6).
   * @param {string} accountId
   * @param {{ only_potential?: boolean | string, limit?: number | string, sort?: string }} [filter]
   */
  function listPosts(accountId, filter = {}) {
    const account = requireAccount(accountId)
    const cached = store.readPostsFile(accountId)
    const onlyPotential = filter.only_potential === true || filter.only_potential === '1' || filter.only_potential === 'true'
    let items = cached.items
    if (onlyPotential) items = items.filter((row) => row?.potential?.flagged)
    const sort = filter.sort === 'views' ? 'views' : 'posted_at'
    items = items.slice().sort((a, b) => {
      if (sort === 'views') {
        const left = typeof a?.stats?.views === 'number' ? a.stats.views : -1
        const right = typeof b?.stats?.views === 'number' ? b.stats.views : -1
        if (right !== left) return right - left
      }
      const left = Date.parse(String(a?.posted_at || ''))
      const right = Date.parse(String(b?.posted_at || ''))
      if (Number.isNaN(left) && Number.isNaN(right)) return 0
      if (Number.isNaN(left)) return 1
      if (Number.isNaN(right)) return -1
      return right - left
    })
    const limit = Number(filter.limit)
    const page = Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items
    return { account, items: page, total: items.length, carry_over: cached.carry_over, field_probe: cached.field_probe }
  }

  /**
   * @param {string} accountId
   * @returns {{ account: Record<string, any>, analysis: Record<string, any>, monitor: Record<string, any> }}
   */
  function detail(accountId) {
    const account = requireAccount(accountId)
    const rows = store.readPosts(accountId)
    return {
      account,
      analysis: account.analysis?.computed_at ? account.analysis : computeAnalysis(rows, { now: new Date(now()).toISOString() }),
      monitor: computeMonitor(account),
      profile: buildAccountProfile(account, rows),
    }
  }

  /**
   * @param {string} accountId
   * @param {{ tags?: string[], refresh_interval_hours?: number }} patch
   */
  function patchAccount(accountId, patch = {}) {
    requireAccount(accountId)
    const next = {}
    if (patch.tags !== undefined) {
      if (!Array.isArray(patch.tags)) {
        throw new RivalServiceError('invalid-tags', 'tags 必须是字符串数组', 400)
      }
      next.tags = patch.tags.filter((tag) => typeof tag === 'string' && tag)
    }
    if (patch.refresh_interval_hours !== undefined) {
      const hours = Number(patch.refresh_interval_hours)
      if (!REFRESH_INTERVAL_CHOICES.includes(hours)) {
        throw new RivalServiceError(
          RIVAL_ERROR_CODES.INVALID_INTERVAL,
          `刷新间隔必须是 ${REFRESH_INTERVAL_CHOICES.join(' / ')} 之一`,
          400,
        )
      }
      next.refresh_interval_hours = hours
      next.next_auto_refresh_at = nextRefreshAt(now(), hours)
      if (hours > 0 && store.getAccount(accountId)?.refresh_state === 'paused') next.refresh_state = 'idle'
    }
    return store.updateAccount(accountId, next)
  }

  /**
   * @param {string} accountId
   */
  function removeAccount(accountId) {
    requireAccount(accountId)
    store.removeAccount(accountId)
    return { removed: true }
  }

  /**
   * @param {string} accountId
   * @param {{ manual?: boolean }} [opts]
   */
  function refreshAccount(accountId, opts = {}) {
    requireAccount(accountId)
    const result = scheduler.refreshAccount(accountId, { manual: opts.manual !== false })
    if (result.status === 'cooldown') {
      throw new RivalServiceError(RIVAL_ERROR_CODES.MANUAL_COOLDOWN, '手动刷新过于频繁，请稍后再试', 429, { reason: 'cooldown' })
    }
    if (result.status === 'budget') {
      // The reason names the ledger that refused: `account-daily-cap` for this
      // account's own allowance, `global-daily-cap` for the shared one. The UI
      // shows it verbatim, so a refusal is never silent.
      const snapshot = scheduler.snapshot()
      const perAccount = (snapshot.per_account_paused || []).find((entry) => entry.id === accountId)
      throw new RivalServiceError(RIVAL_ERROR_CODES.BUDGET_EXHAUSTED, '刷新额度已用尽，请稍后再试', 429, {
        reason: perAccount?.reason || snapshot.paused.reason || BUDGET_REASONS.ACCOUNT_DAILY_CAP,
      })
    }
    return {
      account_id: accountId,
      job: 'running',
      cloud_calls_planned: LIMIT_CALLS_PER_ACCOUNT_CYCLE,
      status: result.status,
    }
  }

  /**
   * @param {{ manual?: boolean }} [opts]
   */
  function refreshAll(opts = {}) {
    const result = scheduler.refreshAll({ manual: opts.manual !== false })
    return { queued: result.queued, skipped: result.skipped }
  }

  /**
   * `GET /rival-accounts` (E1).
   * @param {{ q?: string, platform?: string, refresh_state?: string }} [filter]
   */
  function listAccounts(filter = {}) {
    let items = store.listAccounts()
    const q = typeof filter.q === 'string' ? filter.q.trim().toLowerCase() : ''
    if (q) {
      items = items.filter((account) => [account.nickname, account.handle, account.external_id]
        .some((value) => String(value || '').toLowerCase().includes(q)))
    }
    if (filter.platform) items = items.filter((account) => account.platform === filter.platform)
    if (filter.refresh_state) items = items.filter((account) => account.refresh_state === filter.refresh_state)
    const config = store.readConfig()
    return {
      items: items.map((account) => withSummary(account)),
      total: items.length,
      config_summary: {
        refresh_interval_hours: config.refresh_interval_hours,
        posts_per_refresh: config.posts_per_refresh,
        limits: config.limits,
        poll_interval_ms: CLIENT_POLL_INTERVAL_MS,
      },
    }
  }

  /**
   * @param {Record<string, any>} account
   */
  function withSummary(account) {
    const rows = store.readPosts(account.id)
    return {
      ...account,
      latest_post_at: rows[0]?.posted_at ?? null,
      potential_post_count: rows.filter((row) => row?.potential?.flagged).length,
      post_count: rows.length,
    }
  }

  /**
   * The payload the client mounts into the conversation (E13 sibling).
   *
   * `relativePath` is an `@` file reference, so it must point at a real file: the
   * local video when one was downloaded, the local cover otherwise, and the post
   * URL as a last resort. `previewUrl` is a Host-relative URL built from the
   * media route — never from a filesystem path.
   * @param {string} accountId
   * @param {string} postId
   * @param {{ preferVideo?: boolean }} [opts]
   */
  function buildAttachmentPayload(accountId, postId, opts = {}) {
    const post = requirePost(accountId, postId)
    const account = requireAccount(accountId)
    const localVideo = typeof post.video_local_path === 'string' ? post.video_local_path : ''
    const localCover = typeof post.cover_local_path === 'string' ? post.cover_local_path : ''
    const wantVideo = opts.preferVideo === true
    const relativePath = wantVideo ? (localVideo || localCover) : (localCover || localVideo)
    if (!relativePath) {
      throw new RivalServiceError(
        RIVAL_ERROR_CODES.NO_MEDIA,
        '该帖无可用媒体，请改用「转成灵感」',
        409,
        { reason: 'no-media' },
      )
    }
    const usingVideo = Boolean(localVideo) && relativePath === localVideo
    const previewUrl = typeof post.cover_http_url === 'string' && post.cover_http_url ? post.cover_http_url : ''

    return {
      sourcePlugin: 'omnimux-inspiration',
      kind: 'rival_post',
      entityId: post.id,
      title: post.title || post.text || post.url || post.id,
      extension: usingVideo ? 'MP4' : 'JPG',
      relativePath,
      previewUrl,
      ...(usingVideo && typeof post.duration === 'number' ? { duration: post.duration } : {}),
      metadata: {
        rival_post_id: post.id,
        rival_account_id: account.id,
        platform: account.platform,
        handle: account.handle,
        stats: post.stats,
        source_url: post.url || account.profile_url,
        text: post.text,
        cover_http_url: previewUrl,
        media_mode: usingVideo ? 'video' : 'cover',
      },
    }
  }

  /**
   * Deterministic local media target of a post, so a second click reuses the
   * file already on disk instead of downloading it again.
   * @param {string} postId
   * @param {'cover' | 'video'} kind
   */
  function mediaTarget(postId, kind) {
    return {
      filename: rivalMediaFilename(postId, kind === 'video' ? '.mp4' : '.jpg'),
      url: rivalMediaUrl(kind === 'video' ? 'videos' : 'covers', rivalMediaFilename(postId, kind === 'video' ? '.mp4' : '.jpg')),
    }
  }

  /**
   * Convert a post into the inspiration library (E13) through the existing
   * import pipeline.
   *
   * @param {string} accountId
   * @param {string} postId
   * @param {{ tags?: string[], auto_analyze?: boolean }} [opts]
   */
  async function toInspiration(accountId, postId, opts = {}) {
    const post = requirePost(accountId, postId)
    if (post.in_library && post.inspiration_id) {
      return { post_id: post.id, inspiration_id: post.inspiration_id, already_in_library: true }
    }
    const url = post.url
    if (!url) {
      throw new RivalServiceError('post-url-missing', '该帖子缺少原帖链接，无法导入灵感库', 422)
    }
    if (!importUrl) {
      throw new RivalServiceError('import-unavailable', '灵感导入链路未就绪', 503)
    }
    const result = await importUrl({
      url,
      tags: Array.isArray(opts.tags) ? opts.tags : [],
      auto_analyze: opts.auto_analyze !== false,
    })
    const inspirationId = result?.body?.data?.id ?? result?.data?.id ?? null
    const updated = store.updatePost(accountId, postId, {
      inspiration_id: inspirationId,
      in_library: true,
    })
    return {
      post_id: post.id,
      inspiration_id: inspirationId,
      import_status: result?.status === 202 ? 'importing' : 'ready',
      job: result?.status === 202 ? 'running' : 'done',
      post: updated,
    }
  }

  /**
   * @param {string} accountId
   */
  function monitor(accountId) {
    return computeMonitor(requireAccount(accountId))
  }

  /**
   * @param {string} accountId
   * @returns {{ analysis: Record<string, any> }}
   */
  function analyze(accountId) {
    const account = requireAccount(accountId)
    const rows = store.readPosts(accountId)
    // Pure local aggregation: no cloud call, no budget consumption.
    return { analysis: computeAnalysis(rows, { now: new Date(now()).toISOString() }), account_id: account.id }
  }

  return {
    scheduler,
    store,
    remote,
    runCycle,
    classifyInput,
    importAccount,
    listAccounts,
    withSummary,
    detail,
    patchAccount,
    removeAccount,
    refreshAccount,
    refreshAll,
    listPosts,
    buildAttachmentPayload,
    mediaTarget,
    toInspiration,
    monitor,
    analyze,
    requireAccount,
    requirePost,
    /** Locale key the UI shows when an account identity could not be verified. */
    identityHintKey: RIVAL_LOCALE_KEYS.IDENTITY_HANDLE_UNVERIFIED,
  }
}

export { isPlainObject }
