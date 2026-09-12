/**
 * The module's only outbound path.
 *
 * Cost contract: one refresh cycle calls the cloud exactly twice — `user` once
 * and `posts` once — and this module is where that becomes enforceable rather
 * than aspirational. It deliberately does NOT go through the import pipeline's
 * `createSocialFetcher`, which carries a free public fallback: a fallback that
 * fires makes the number of outbound requests depend on runtime conditions, and
 * this module's whole budget story ("2 calls per account per cycle") relies on
 * that number being fixed.
 *
 * A `createCostGuard` wraps the tool so the *third* call in one cycle throws
 * instead of quietly spending more quota, and the same counter the guard uses is
 * reported back to the caller (`calls_used`) so the budget ledger and the guard
 * are two independent records of the same fact.
 *
 * Error classification: `needs-omnimux` / `quota-exceeded` are the hub's own
 * gates and are re-thrown as codes the HTTP layer forwards verbatim; anything
 * else is a cloud failure. The hub's code travels on `err.code` for an
 * `OmnimuxError` and sometimes only inside the message, so both are inspected.
 */

import { mapRivalPosts, mapRivalUser, isEmptyPayload, isNoContentSentinel } from './rival-parsers.js'
import {
  CLOUD_CAPABILITY_POSTS,
  CLOUD_CAPABILITY_USER,
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  RIVAL_ERROR_CODES,
} from './constants.js'

/** Tool name of the hub's social-data seam. */
export const SOCIAL_DATA_TOOL = 'omnimux_social_data'

/** Message the module raises when the seam is missing. */
export const TOOL_MISSING_MESSAGE = 'OmniMux 社媒解析工具 (omnimux_social_data) 未就绪，请检查 omnimux 插件是否加载'

/** Whether a thrown value is one of the hub's own account/quota gates. */
const HUB_GATE_CODES = new Set([RIVAL_ERROR_CODES.NEEDS_OMNIMUX, RIVAL_ERROR_CODES.QUOTA_EXCEEDED, 'omnimux-unconfigured'])

export class RivalRemoteError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ callsUsed?: number, cause?: unknown }} [meta]
   */
  constructor(code, message, meta = {}) {
    super(message)
    this.name = 'RivalRemoteError'
    this.code = code
    this.calls_used = typeof meta.callsUsed === 'number' ? meta.callsUsed : 0
    this.cause = meta.cause
  }
}

/**
 * Classify a thrown cloud error into one of the module's codes.
 *
 * The hub signals these as `err.code`, as a `{ code }` field inside the error
 * object, or only in a message such as `[quota-exceeded] ...`; all three are
 * read, because misclassifying the account gate as a generic cloud failure would
 * burn the retry budget on a request that can never succeed.
 * @param {unknown} err
 * @returns {string}
 */
export function classifyRemoteError(err) {
  const candidates = []
  if (err && typeof err === 'object') {
    const record = /** @type {Record<string, any>} */ (err)
    if (typeof record.code === 'string') candidates.push(record.code)
    if (typeof record.error === 'string') candidates.push(record.error)
    if (record.body && typeof record.body === 'object' && typeof record.body.error === 'string') {
      candidates.push(record.body.error)
    }
    if (typeof record.status === 'number') {
      if (record.status === 401) candidates.push(RIVAL_ERROR_CODES.NEEDS_OMNIMUX)
      if (record.status === 402) candidates.push(RIVAL_ERROR_CODES.QUOTA_EXCEEDED)
    }
    if (typeof record.message === 'string') candidates.push(record.message)
    if (typeof record.detail === 'string') candidates.push(record.detail)
  } else if (typeof err === 'string') {
    candidates.push(err)
  }
  for (const candidate of candidates) {
    const text = String(candidate)
    if (text.includes(RIVAL_ERROR_CODES.QUOTA_EXCEEDED)) return RIVAL_ERROR_CODES.QUOTA_EXCEEDED
    if (text.includes(RIVAL_ERROR_CODES.NEEDS_OMNIMUX) || text.includes('请先登录 OmniMux') || text.includes('需要登录 OmniMux')) {
      return RIVAL_ERROR_CODES.NEEDS_OMNIMUX
    }
    if (text.includes(TOOL_MISSING_MESSAGE) || text.includes(`${SOCIAL_DATA_TOOL} 未就绪`)) {
      return RIVAL_ERROR_CODES.CLOUD_ERROR
    }
  }
  return RIVAL_ERROR_CODES.CLOUD_ERROR
}

/**
 * Wrap one refresh cycle's cloud calls in a hard counter.
 *
 * @param {{ limit?: number, onViolation?: (info: { calls: number }) => void }} [opts]
 * @returns {{ wrap: (execute: (args: Record<string, any>) => Promise<any>) => (args: Record<string, any>) => Promise<any>, calls: () => number, reset: () => void }}
 */
export function createCostGuard(opts = {}) {
  const limit = typeof opts.limit === 'number' ? opts.limit : LIMIT_CALLS_PER_ACCOUNT_CYCLE
  let calls = 0
  return {
    wrap(execute) {
      return async (args) => {
        calls += 1
        if (calls > limit) {
          if (typeof opts.onViolation === 'function') opts.onViolation({ calls })
          throw new RivalRemoteError(
            RIVAL_ERROR_CODES.CLOUD_ERROR,
            `COST CONTRACT VIOLATION: 单账号单次刷新最多 ${limit} 次云端调用，已发出第 ${calls} 次`,
            { callsUsed: calls },
          )
        }
        return execute(args)
      }
    },
    calls: () => calls,
    reset() {
      calls = 0
    },
  }
}

/**
 * @param {{ getTool?: (name: string) => any, now?: () => number, limitCallsPerCycle?: number }} [opts]
 */
export function createRivalRemote(opts = {}) {
  const getTool = typeof opts.getTool === 'function' ? opts.getTool : () => undefined
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
  const limit = typeof opts.limitCallsPerCycle === 'number' ? opts.limitCallsPerCycle : LIMIT_CALLS_PER_ACCOUNT_CYCLE

  /**
   * Resolve the hub seam, or throw the actionable "tool not ready" error.
   */
  function resolveTool() {
    const tool = getTool(SOCIAL_DATA_TOOL)
    if (!tool || typeof tool.execute !== 'function') {
      throw new RivalRemoteError(RIVAL_ERROR_CODES.CLOUD_ERROR, TOOL_MISSING_MESSAGE)
    }
    return tool
  }

  return {
    /** @type {string} */
    toolName: SOCIAL_DATA_TOOL,

    /**
     * Create the per-cycle budget of cloud calls. The caller owns its lifetime:
     * one guard per account per refresh, never shared across accounts.
     */
    createCycle(cycleOpts = {}) {
      const guard = createCostGuard({
        limit,
        onViolation: cycleOpts.onViolation,
      })
      const tool = resolveTool()
      const execute = guard.wrap((args) => tool.execute(args))
      return {
        calls: guard.calls,
        /**
         * `user` call — 1 of the 2.
         * @param {{ platform: string, value: string }} args
         */
        async fetchUser({ platform, value }) {
          const raw = await execute({ platform, capability: CLOUD_CAPABILITY_USER, id: value })
          const data = raw && typeof raw === 'object' ? raw.data : undefined
          if (isEmptyPayload(data)) {
            return {
              status: 'empty',
              profile: null,
              field_probe: {},
              raw: { platform, capability: CLOUD_CAPABILITY_USER, model: raw?.model, field: raw?.field, value: raw?.value },
            }
          }
          const mapped = mapRivalUser(data)
          return { status: 'ok', profile: mapped.profile, field_probe: mapped.field_probe }
        },
        /**
         * `posts` call — 2 of the 2.
         *
         * The posts answer is the one place where "the cloud has nothing" and
         * "the account has nothing" arrive in the same shape, and they must not
         * be collapsed: an empty *list* is a successful refresh with no new rows
         * (the account may simply be new), while the sentinel is the cloud
         * reporting no content at all. Only the second is a `no-content`
         * failure — treating the first as one would back off, then terminal-error
         * a perfectly healthy new account. See `isNoContentSentinel`.
         * @param {{ platform: string, value: string }} args
         */
        async fetchPosts({ platform, value }) {
          const raw = await execute({ platform, capability: CLOUD_CAPABILITY_POSTS, id: value })
          const data = raw && typeof raw === 'object' ? raw.data : undefined
          if (isNoContentSentinel(data)) {
            return {
              status: 'no-content',
              rows: [],
              field_probe: {},
              raw: { platform, capability: CLOUD_CAPABILITY_POSTS, model: raw?.model, field: raw?.field, value: raw?.value },
            }
          }
          if (isEmptyPayload(data)) {
            return { status: 'empty', rows: [], field_probe: {} }
          }
          const mapped = mapRivalPosts(data, { platform })
          return { status: 'ok', rows: mapped.rows, field_probe: mapped.field_probe }
        },
      }
    },

    /** Exposed for tests and for the `field_probe` provenance note. */
    classifyError: classifyRemoteError,
    now,
  }
}

/**
 * Whether an error means the module must stop refreshing this account until the
 * user acts (the unverified-identity terminal state).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isIdentityUnverified(err) {
  if (err instanceof RivalRemoteError) return err.code === RIVAL_ERROR_CODES.IDENTITY_UNVERIFIED
  const code = err && typeof err === 'object' ? /** @type {any} */ (err).code : undefined
  return code === RIVAL_ERROR_CODES.IDENTITY_UNVERIFIED
}
