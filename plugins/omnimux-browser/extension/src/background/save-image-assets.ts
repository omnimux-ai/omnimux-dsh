/**
 * Worker-side relay for `DSH_MEDIA_TO_ASSETS`.
 *
 * One image save rides exactly one authenticated local bridge: the socket
 * that completed `hello` and negotiated the `imageAssetSave` capability. No
 * connection, a handshake without the capability, or a send that never left
 * the socket answers `host-unavailable`. A request that went out but lost its
 * final receipt answers `save-unconfirmed` — the host may or may not have
 * committed, so the outcome must not be asserted either way.
 *
 * Success honesty: only the frozen `saved`/`duplicate` receipt with real
 * `assetId`/`fileId`/`lrev` counts. A bare `ok`, an empty result, or any
 * unknown status is unconfirmed, never a save.
 *
 * @module
 */

import type { HoveredMedia } from '../content/media-hover/types.ts'

/** RPC facade shape (what `createRpc` returns). */
export interface SaveImageRpc {
  request(method: string, payload: unknown): Promise<unknown>
}

/** Bridge facts captured by the handler at call time. */
export interface SaveImageTarget {
  rpc: SaveImageRpc | null
  /**
   * The local target bound to one hello generation: the socket that completed
   * hello, its url, and the caps that socket negotiated. `null` when no
   * authenticated socket is live — never a bare `connected` flag whose caps
   * could belong to an older generation.
   */
  localTarget: { generation: number; url: string; caps: Record<string, unknown> | null } | null
  /**
   * The client's current hello generation. A captured target whose
   * generation no longer matches refuses dispatch instead of riding the
   * replacement socket (no cross-generation re-targeting, ever).
   */
  currentHelloGeneration: () => number
  /** UI locale used only for the fallback asset title. */
  locale: 'zh' | 'en'
}

/** The answer handed back to the content script. */
export type SaveImageAssetAnswer =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: { code: 'host-unavailable' | 'save-unconfirmed' } }

/** Host business statuses that mean a definitive failure, per the wire contract. */
const BUSINESS_FAILURE_STATUSES: ReadonlySet<string> = new Set([
  'unavailable',
  'invalid-url',
  'unsupported-image',
  'mime-mismatch',
  'too-large',
  'timeout',
  'http-error',
  'storage-failed',
  'cancelled',
])

const REQUEST_ID_MAX = 128
const URL_MAX = 8192
const TITLE_MAX = 200

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

/** Strict success shape: `saved`/`duplicate` with real asset identities.
 *
 * `lrev` parity with the host parser (`src/protocol.ts`): only a safe
 * non-negative integer is a real library revision — a fractional, negative or
 * out-of-range number is a malformed receipt, hence `save-unconfirmed`.
 */
export function isAssetSaveReceipt(value: unknown): boolean {
  const record = asRecord(value)
  if (record === null) return false
  if (record.status !== 'saved' && record.status !== 'duplicate') return false
  return typeof record.assetId === 'string' && record.assetId.trim() !== ''
    && typeof record.fileId === 'string' && record.fileId.trim() !== ''
    && typeof record.lrev === 'number' && Number.isSafeInteger(record.lrev) && record.lrev >= 0
}

/** A definitive business failure the host reported inside `result`. */
export function isAssetSaveFailure(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value)
  return record !== null && typeof record.status === 'string' && BUSINESS_FAILURE_STATUSES.has(record.status)
}

/** Bounds a request id to the wire contract; generates one when absent. */
export function normalizeSaveRequestId(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '' && value.length <= REQUEST_ID_MAX) return value
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `save-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

/** The display name handed to the host: alt, then page title, then the default. */
function assetTitle(payload: HoveredMedia, locale: 'zh' | 'en'): string | undefined {
  const raw = (payload.alt || payload.pageTitle || '').trim()
  const title = (raw !== '' ? raw : (locale === 'zh' ? '网页图片' : 'Web image')).slice(0, TITLE_MAX)
  return title === '' ? undefined : title
}

/**
 * Extracts an error code from a rejected rpc frame.
 *
 * `createRpc` renders host errors as `"<code>: <message>"`; transport errors
 * of its own carry no code prefix and stay unconfirmed.
 */
function rpcErrorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  const match = /^([a-z][a-z0-9-]{1,40}): /.exec(message)
  return match === null ? null : match[1]!
}

/** Whether the rejection means the frame never left this socket. */
function isUnsentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('not connected') || message.includes('closed before request dispatch')
}

/**
 * Relays one image save to the current paired host.
 *
 * @param target - The bridge facts at press time: rpc facade, connectivity
 *   and the hello-negotiated caps record of this same connection.
 * @param payload - The image payload; `src` must already be an http(s) URL
 *   (the message handler validates it first).
 * @param requestId - The click identity from the content script, bounded by
 *   {@link normalizeSaveRequestId} before the call.
 */
export async function saveImageAssetRpc(
  target: SaveImageTarget,
  payload: HoveredMedia,
  requestId: string,
): Promise<SaveImageAssetAnswer> {
  // The write belongs to the hello generation it was captured under. A
  // replacement socket — same url or another host — is a different target and
  // must never inherit this request.
  if (target.rpc === null || target.localTarget === null) {
    return { ok: false, error: { code: 'host-unavailable' } }
  }
  if (target.currentHelloGeneration() !== target.localTarget.generation) {
    return { ok: false, error: { code: 'host-unavailable' } }
  }
  // An old host without the capability cannot perform this write; that is a
  // missing feature on the connected target, reported as unavailable service.
  if (target.localTarget.caps === null || target.localTarget.caps.imageAssetSave !== true) {
    return { ok: false, error: { code: 'host-unavailable' } }
  }

  const args: Record<string, unknown> = {
    requestId: requestId.slice(0, REQUEST_ID_MAX),
    url: payload.src.slice(0, URL_MAX),
    pageUrl: payload.pageUrl.slice(0, URL_MAX),
  }
  const title = assetTitle(payload, target.locale)
  if (title !== undefined) args.title = title

  const settled = await target.rpc.request('omnimux.saveImageAsset', args).then(
    (value): { ok: true; value: unknown } => ({ ok: true, value }),
    (error): { ok: false; error: unknown } => ({ ok: false, error }),
  )
  if (settled.ok) {
    if (isAssetSaveReceipt(settled.value) || isAssetSaveFailure(settled.value)) {
      return { ok: true, result: settled.value as Record<string, unknown> }
    }
    return { ok: false, error: { code: 'save-unconfirmed' } }
  }
  const code = rpcErrorCode(settled.error)
  if (code !== null && BUSINESS_FAILURE_STATUSES.has(code)) {
    // A definitive business refusal still travels on the outer-ok envelope so
    // the action layer can map it to its frozen feedback wording.
    return { ok: true, result: { status: code } }
  }
  if (isUnsentError(settled.error)) {
    return { ok: false, error: { code: 'host-unavailable' } }
  }
  return { ok: false, error: { code: 'save-unconfirmed' } }
}
