/**
 * Defer real session creation until the first prompt.
 *
 * The panel calls `session.create` as soon as it connects, but a session that
 * is opened and never used should leave zero trace in the store/GUI. This
 * wrapper answers `session.create` with a provisional id (minted locally,
 * nothing persisted), serves `session.history` for provisional ids as empty,
 * and materializes the real session — same id, original create payload — on
 * the first `session.prompt` for that id. Abandoned provisional ids are
 * pruned after {@link PROVISIONAL_TTL_MS}.
 *
 * Materialization is also exposed on demand, because `session.prompt` is no
 * longer the only Host call that needs a persisted session: pinning a
 * text-generation model calls `session.selectModel`, which the Host resolves
 * against a real session (Issue #3629).
 *
 * @module @yuxianglin/dsh-bridge-browser/src/session-deferral
 */

import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import type { BrowserHostApi, HostRpcCall, HostRpcResult } from './host-api.ts'
import { isRecord } from './host-api.ts'

/** Provisional entries older than this are dropped on the next create. */
const PROVISIONAL_TTL_MS = 30 * 60_000

interface ProvisionalEntry {
  /** The original create payload, replayed at materialization (keeps cwd/workspaceId). */
  payload: Record<string, unknown>
  createdAt: number
}

/** On-demand materialization seam for sessions this wrapper minted provisionally. */
export interface SessionDeferral {
  /** Wrapped API: provisional creates, synthetic history, materialize-on-prompt. */
  readonly api: BrowserHostApi
  /** Whether `sessionId` is a provisional id minted by this wrapper. */
  isProvisional(sessionId: string): boolean
  /**
   * Materialize one provisional session by replaying its stored create payload,
   * so a Host RPC that needs a persisted session (e.g. `session.selectModel`)
   * can address it. A no-op for ids this wrapper never minted; concurrent
   * callers share one admission.
   * @param sessionId - id the panel is about to address.
   * @throws when the create replay fails, so the caller can surface the cause.
   */
  materialize(sessionId: string): Promise<void>
}

/**
 * Wrap the gateway sessions API so `session.create` returns a provisional id
 * without creating anything, and expose the on-demand materialization seam.
 *
 * @param api - Gateway API implementation.
 * @param enabled - Whether deferral is active; false means real creates already
 *   ran, so there is nothing to materialize and no wrapper to return.
 * @param imageLimits - actual host image capability, used for the synthetic
 *   empty history before the deferred Session exists.
 * @returns the wrapper, or `undefined` when deferral is disabled.
 */
export function createSessionDeferral(
  api: BrowserHostApi,
  enabled: boolean,
  imageLimits?: ImageAttachmentLimits,
): SessionDeferral | undefined {
  if (!enabled) return undefined

  const provisional = new Map<string, ProvisionalEntry>()
  const materializing = new Map<string, Promise<HostRpcResult>>()

  const prune = (): void => {
    const cutoff = Date.now() - PROVISIONAL_TTL_MS
    for (const [id, entry] of provisional) {
      if (entry.createdAt < cutoff) provisional.delete(id)
    }
  }

  const mintedId = (payload: Record<string, unknown>): string =>
    typeof payload.sessionId === 'string' ? payload.sessionId : `session-${crypto.randomUUID()}`

  /**
   * Replay one provisional create. Concurrent callers share a single admission,
   * so a pin and the prompt that follows it cannot create the session twice.
   */
  const materializeEntry = (
    sessionId: string,
    entry: ProvisionalEntry,
    signal: AbortSignal,
  ): Promise<HostRpcResult> => {
    const existing = materializing.get(sessionId)
    if (existing !== undefined) return existing
    const pending = api.call({
      rpcId: crypto.randomUUID(),
      method: 'session.create',
      payload: { ...entry.payload, sessionId },
      signal,
    })
    materializing.set(sessionId, pending)
    void pending.then(
      () => { materializing.delete(sessionId) },
      () => { materializing.delete(sessionId) },
    )
    return pending
  }

  const materialize = async (sessionId: string): Promise<void> => {
    const entry = provisional.get(sessionId)
    if (entry === undefined) return
    const created = await materializeEntry(sessionId, entry, new AbortController().signal)
    if (!created.ok) {
      throw new Error(`browser bridge: could not materialize session ${sessionId}: ${created.error.message}`)
    }
    provisional.delete(sessionId)
  }

  const wrapped: BrowserHostApi = {
    async call(call: HostRpcCall): Promise<HostRpcResult> {
      if (call.method === 'session.create') {
        if (!isRecord(call.payload)) {
          return { ok: false, error: { code: 'bad-request', message: 'session.create payload must be an object', details: {} } }
        }
        prune()
        const sessionId = mintedId(call.payload)
        provisional.set(sessionId, { payload: { ...call.payload }, createdAt: Date.now() })
        return { ok: true, value: { sessionId } }
      }
      if (call.method === 'session.history') {
        const sessionId = sessionIdOf(call.payload)
        if (sessionId === undefined || !provisional.has(sessionId)) return api.call(call)
        return {
          ok: true,
          value: {
            events: [],
            hasMore: false,
            ...(imageLimits === undefined
              ? {}
              : { projections: { asOfSeq: -1, values: { imageLimits } } }),
          },
        }
      }
      if (call.method !== 'session.prompt') return api.call(call)
      const sessionId = sessionIdOf(call.payload)
      if (sessionId === undefined) return api.call(call)
      const entry = provisional.get(sessionId)
      if (entry === undefined) return api.call(call)
      // The prompt path and the on-demand seam share one replay.
      const created = await materializeEntry(sessionId, entry, call.signal)
      if (!created.ok) return created
      provisional.delete(sessionId)
      return api.call(call)
    },
    events: signal => api.events(signal),
    respond: (rpcId, result, signal) => api.respond(rpcId, result, signal),
  }

  return {
    api: wrapped,
    isProvisional: sessionId => provisional.has(sessionId),
    materialize,
  }
}

/**
 * Wrap the gateway sessions API so `session.create` returns a provisional id
 * without creating anything; the real session materializes on the first
 * `session.prompt` for that id.
 *
 * @param api - Gateway API implementation.
 * @param enabled - Whether deferral is active; false returns the API untouched.
 * @param imageLimits - actual host image capability, used for the synthetic
 *   empty history before the deferred Session exists.
 * @returns the original API when disabled, otherwise the wrapped API.
 */
export function withSessionDeferral(
  api: BrowserHostApi,
  enabled: boolean,
  imageLimits?: ImageAttachmentLimits,
): BrowserHostApi {
  return createSessionDeferral(api, enabled, imageLimits)?.api ?? api
}

function sessionIdOf(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return typeof payload.sessionId === 'string' ? payload.sessionId : undefined
}
