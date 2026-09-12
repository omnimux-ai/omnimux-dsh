/**
 * Agent-facing tools of the rival-accounts module.
 *
 * Names carry the plugin's `inspiration_` prefix (the existing six tools use it)
 * so they cannot be confused with `omnimux-accounts`, which owns the user's own
 * publishing accounts — this module monitors *other* people's accounts.
 *
 * Error semantics are uniform across the six tools, and each one is a sentence
 * the Agent can relay: not logged in, out of cloud quota, seam not loaded,
 * record missing. "No work done" is never an error — a refresh that the budget
 * refuses returns `{ queued: [], skipped: [...] }`, because an Agent has to be
 * able to tell "nothing happened" from "it failed".
 */

import { RIVAL_ERROR_CODES, RIVAL_LOCALE_KEYS } from './constants.js'
import { RivalRemoteError, TOOL_MISSING_MESSAGE } from './rival-remote.js'
import { RivalServiceError } from './rival-accounts-service.js'

/** Names registered here; `src/index.js` mirrors this list. */
export const RIVAL_TOOL_NAMES = Object.freeze([
  'inspiration_rival_accounts',
  'inspiration_rival_posts',
  'inspiration_rival_post',
  'inspiration_rival_posts_add_to_session',
  'inspiration_rival_to_inspiration',
  'inspiration_rival_refresh',
])

export const LOGIN_REQUIRED_MESSAGE = '需要登录 OmniMux 账号，请在 设置 → 个人资料 中登录'
export const QUOTA_EXHAUSTED_MESSAGE = '云端额度不足，请稍后重试或在设置中查看额度'

/**
 * @param {unknown} err
 * @returns {Error}
 */
export function toToolError(err) {
  if (err instanceof RivalServiceError) {
    if (err.code === RIVAL_ERROR_CODES.ACCOUNT_NOT_FOUND) return new Error(`对标账号不存在 (account not found): ${extractId(err.message)}`)
    if (err.code === RIVAL_ERROR_CODES.POST_NOT_FOUND) return new Error(`对标帖子不存在 (post not found): ${extractId(err.message)}`)
    if (err.code === RIVAL_ERROR_CODES.NEEDS_OMNIMUX) return new Error(LOGIN_REQUIRED_MESSAGE)
    if (err.code === RIVAL_ERROR_CODES.QUOTA_EXCEEDED) return new Error(QUOTA_EXHAUSTED_MESSAGE)
    return new Error(err.message)
  }
  if (err instanceof RivalRemoteError) {
    if (err.code === RIVAL_ERROR_CODES.QUOTA_EXCEEDED) return new Error(QUOTA_EXHAUSTED_MESSAGE)
    if (err.code === RIVAL_ERROR_CODES.NEEDS_OMNIMUX) return new Error(LOGIN_REQUIRED_MESSAGE)
    if (err.message === TOOL_MISSING_MESSAGE) return new Error(TOOL_MISSING_MESSAGE)
    return new Error(err.message)
  }
  if (err instanceof Error) {
    const code = typeof (/** @type {any} */ (err).code) === 'string' ? /** @type {any} */ (err).code : ''
    if (code === RIVAL_ERROR_CODES.QUOTA_EXCEEDED) return new Error(QUOTA_EXHAUSTED_MESSAGE)
    if (code === RIVAL_ERROR_CODES.NEEDS_OMNIMUX) return new Error(LOGIN_REQUIRED_MESSAGE)
    // `code` decides; the message is only consulted when the hub raised a bare
    // string. Matching on the text alone would rewrite an unrelated error whose
    // message happens to mention the seam tool.
    if (!code && err.message.includes(TOOL_MISSING_MESSAGE)) return new Error(TOOL_MISSING_MESSAGE)
    return err
  }
  return new Error(String(err))
}

/**
 * @param {string} message
 * @returns {string}
 */
function extractId(message) {
  const index = message.lastIndexOf(':')
  return index === -1 ? message : message.slice(index + 1).trim()
}

/** @param {unknown} value */
function safeJsonOutput(value) {
  if (value === undefined || value === null) return {}
  return JSON.parse(JSON.stringify(value, (_key, item) => (item === undefined ? null : item)))
}

/** @param {Record<string, unknown>} fields */
function objectParams(fields) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(fields)) {
    const { required: isRequired, ...rest } = /** @type {any} */ (spec)
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * Register the six tools on a DSH tools service.
 * @param {{ register: (tool: object) => unknown }} tools
 * @param {any} service result of `createRivalAccountsService`
 */
export function registerRivalTools(tools, service) {
  tools.register({
    name: 'inspiration_rival_accounts',
    description: 'List the monitored rival accounts with platform, handle, follower count, refresh state and how many of their posts are flagged as potential.',
    parameters: objectParams({
      q: { type: 'string', description: 'Filter by nickname or handle substring' },
      platform: { type: 'string', description: 'tiktok | instagram | youtube | x' },
      refresh_state: { type: 'string', description: 'idle | queued | running | backoff | error | paused' },
      limit: { type: 'number', description: 'Max accounts to return (default 20)' },
    }),
    output: jsonOut,
    async execute(args = {}) {
      try {
        const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 20
        const page = service.listAccounts({ q: args.q, platform: args.platform, refresh_state: args.refresh_state })
        const accounts = page.items.slice(0, limit).map((account) => ({
          id: account.id,
          platform: account.platform,
          handle: account.handle,
          nickname: account.nickname,
          followers: account.followers,
          tags: account.tags,
          refresh_state: account.refresh_state,
          last_refresh_at: account.last_refresh_at,
          latest_post_at: account.latest_post_at,
          potential_post_count: account.potential_post_count,
        }))
        return safeJsonOutput({ count: accounts.length, accounts })
      } catch (err) {
        throw toToolError(err)
      }
    },
  })

  tools.register({
    name: 'inspiration_rival_posts',
    description: 'List the cached posts of one rival account, optionally filtered to the ones flagged as potential (R1-R4). Identify the account by id, or by platform plus handle.',
    parameters: objectParams({
      account_id: { type: 'string', description: 'Rival account id (riv_...)' },
      platform: { type: 'string', description: 'Used with handle when account_id is not known' },
      handle: { type: 'string', description: 'Account handle, e.g. @foo' },
      only_potential: { type: 'boolean', description: 'Return only posts flagged as potential' },
      limit: { type: 'number', description: 'Max posts to return (default 20)' },
      sort: { type: 'string', description: 'posted_at (default) | views' },
    }),
    output: jsonOut,
    async execute(args = {}) {
      try {
        const accountId = resolveAccountId(service, args)
        const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 20
        const page = service.listPosts(accountId, {
          only_potential: args.only_potential === true,
          limit,
          sort: args.sort,
        })
        const posts = page.items.map((post) => ({
          id: post.id,
          account_id: post.account_id,
          title: post.title,
          text: post.text,
          url: post.url,
          posted_at: post.posted_at,
          type: post.type,
          duration: post.duration,
          stats: post.stats,
          potential: {
            flagged: post.potential?.flagged === true,
            rules: post.potential?.rules || [],
            reason_keys: post.potential?.reason_keys || [],
          },
        }))
        return safeJsonOutput({ count: posts.length, carry_over: page.carry_over, posts })
      } catch (err) {
        throw toToolError(err)
      }
    },
  })

  tools.register({
    name: 'inspiration_rival_post',
    description: 'Get one rival post with its account: media urls, stats, potential rules and whether it is already in the inspiration library.',
    parameters: objectParams({
      account_id: { type: 'string', required: true, description: 'Rival account id (riv_...)' },
      post_id: { type: 'string', required: true, description: 'Post id inside that account' },
    }),
    output: jsonOut,
    async execute(args = {}) {
      try {
        const accountId = String(args.account_id || '')
        const postId = String(args.post_id || '')
        const post = service.requirePost(accountId, postId)
        const account = service.requireAccount(accountId)
        return safeJsonOutput({
          post,
          account: {
            id: account.id,
            platform: account.platform,
            handle: account.handle,
            nickname: account.nickname,
            followers: account.followers,
          },
        })
      } catch (err) {
        throw toToolError(err)
      }
    },
  })

  tools.register({
    name: 'inspiration_rival_posts_add_to_session',
    description: 'Build the session attachment payload of one rival post so the user can mount it into the active conversation from the workbench. Server-side payload only: mounting happens in the UI, and this tool never sends a message.',
    parameters: objectParams({
      account_id: { type: 'string', required: true, description: 'Rival account id (riv_...)' },
      post_id: { type: 'string', required: true, description: 'Post id inside that account' },
      prefer_video: { type: 'boolean', description: 'Prefer the downloaded video over the cover when both exist' },
    }),
    output: jsonOut,
    async execute(args = {}) {
      try {
        const attachment = service.buildAttachmentPayload(
          String(args.account_id || ''),
          String(args.post_id || ''),
          { preferVideo: args.prefer_video === true },
        )
        return safeJsonOutput({
          ok: true,
          attachment,
          note: 'server-side payload only; the workbench button performs the mount',
        })
      } catch (err) {
        throw toToolError(err)
      }
    },
  })

  tools.register({
    name: 'inspiration_rival_to_inspiration',
    description: 'Import one rival post into the local inspiration library through the existing import-url pipeline, so it can be deconstructed and reused.',
    parameters: objectParams({
      account_id: { type: 'string', required: true, description: 'Rival account id (riv_...)' },
      post_id: { type: 'string', required: true, description: 'Post id inside that account' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the new inspiration row' },
      auto_analyze: { type: 'boolean', description: 'Run the AI five-dimension breakdown (default true)' },
    }),
    output: jsonOut,
    async execute(args = {}) {
      try {
        const result = await service.toInspiration(
          String(args.account_id || ''),
          String(args.post_id || ''),
          { tags: args.tags, auto_analyze: args.auto_analyze !== false },
        )
        return safeJsonOutput({
          inspiration_id: result.inspiration_id,
          import_status: result.import_status,
          job: result.job,
        })
      } catch (err) {
        throw toToolError(err)
      }
    },
  })

  tools.register({
    name: 'inspiration_rival_refresh',
    description: 'Queue a refresh of one rival account or of all of them. The per-account cloud budget is enforced: a refresh that the budget refuses returns an empty queue with a reason instead of failing.',
    parameters: objectParams({
      account_id: { type: 'string', description: 'Rival account id; omit and set all=true to refresh every account' },
      all: { type: 'boolean', description: 'Refresh every account (default false)' },
      manual: { type: 'boolean', description: 'Treat this as a user-initiated refresh and apply the manual cooldown (default true)' },
    }),
    output: jsonOut,
    async execute(args = {}) {
      try {
        const manual = args.manual !== false
        let queued = []
        let skipped = []
        if (args.all === true || !args.account_id) {
          const result = service.refreshAll({ manual })
          queued = result.queued
          skipped = result.skipped
        } else {
          const accountId = String(args.account_id)
          service.requireAccount(accountId)
          const result = service.scheduler.enqueue({ account_id: accountId, mode: manual ? 'manual' : 'auto' })
          if (result.queued) queued = [accountId]
          else if (result.reason_key) skipped = [{ id: accountId, reason_key: result.reason_key }]
        }
        const snapshot = service.scheduler.snapshot()
        const limits = snapshot.budget_limits || {}
        const remaining = Math.max(
          0,
          (limits.cloud_calls_global_per_day || 0) - (snapshot.budget_used?.global_calls || 0),
        )
        return safeJsonOutput({ queued, skipped, budget_remaining: remaining })
      } catch (err) {
        throw toToolError(err)
      }
    },
  })
}

/**
 * Resolve `account_id`, or look the account up by `platform` + `handle`.
 * @param {any} service
 * @param {{ account_id?: string, platform?: string, handle?: string }} args
 * @returns {string}
 */
export function resolveAccountId(service, args) {
  if (args.account_id) return String(args.account_id)
  const platform = String(args.platform || '').trim().toLowerCase()
  const handle = String(args.handle || '').trim()
  if (platform && handle) {
    const found = service.store.findAccount(platform, handle.startsWith('@') ? handle : `@${handle}`)
      || service.store.findAccount(platform, handle)
    if (found) return found.id
  }
  throw new RivalServiceError(RIVAL_ERROR_CODES.ACCOUNT_NOT_FOUND, `对标账号不存在 (account not found): ${handle || platform || ''}`, 404)
}

/**
 * The locale keys the six tools talk about, exported so a test can assert the
 * "no work done" answer carries the same key the UI shows.
 */
export const RIVAL_TOOL_LOCALE_KEYS = Object.freeze({
  SKIP_BUDGET: RIVAL_LOCALE_KEYS.SKIP_BUDGET,
  SKIP_COOLDOWN: RIVAL_LOCALE_KEYS.SKIP_COOLDOWN,
  SKIP_ACCOUNT_ERROR: RIVAL_LOCALE_KEYS.SKIP_ACCOUNT_ERROR,
})
