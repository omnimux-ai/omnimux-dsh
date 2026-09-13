/**
 * Delivery of one shortcut to the background worker, and the reading of its
 * reply.
 *
 * The content script has no other way to reach the host, so this module owns the
 * whole round trip: which message a menu row becomes, and how a reply becomes an
 * outcome the menu can render. Both directions are pure enough to test without a
 * browser, which is the point — a malformed reply must surface as "the host is
 * not reachable", never as a half-rendered row.
 *
 * @module
 */

import { TIKTOK_RUNTIME_MESSAGE } from './messages.ts'
import type { TiktokAction } from './copy.ts'
import type { ExportOutcome } from '../../background/media-export.ts'

/** Delivers one runtime message and answers with whatever the worker replied. */
export type ShortcutSender = (message: Record<string, unknown>) => Promise<unknown>

/** The worker's envelope around a shortcut answer. */
function envelopeOf(response: unknown): ExportOutcome | null {
  if (typeof response !== 'object' || response === null) return null
  const result = (response as { result?: unknown }).result
  if (typeof result !== 'object' || result === null) return null
  const outcome = result as Partial<ExportOutcome>
  if (typeof outcome.ok !== 'boolean') return null
  if (typeof outcome.code !== 'string') return null
  return outcome as ExportOutcome
}

/**
 * Read the worker's reply.
 *
 * Anything that is not a well-formed outcome is reported as `unreachable`: the
 * only way to get here without one is a worker that could not answer, and
 * guessing at a partial payload would put invented text in front of the user.
 * @param response
 */
export function readExportOutcome(response: unknown): ExportOutcome {
  return envelopeOf(response) ?? { ok: false, code: 'unreachable' }
}

/** The default transport: the extension's own runtime channel. */
function defaultSender(message: Record<string, unknown>): Promise<unknown> {
  if (typeof chrome === 'undefined' || chrome.runtime?.sendMessage === undefined) {
    return Promise.reject(new Error('runtime messaging unavailable'))
  }
  return chrome.runtime.sendMessage(message)
}

/**
 * Ask the background worker to perform one shortcut.
 *
 * `save` is its own message rather than a download with a flag: it writes to the
 * library and never touches the Downloads folder, and keeping the two apart is
 * what lets each answer mean exactly one thing.
 * @param action
 * @param url canonical post address
 * @param send overridable transport, for tests
 */
export async function sendTiktokShortcut(
  action: TiktokAction,
  url: string,
  send: ShortcutSender = defaultSender,
): Promise<ExportOutcome> {
  const message = action === 'save'
    ? { type: TIKTOK_RUNTIME_MESSAGE.saveToInspiration, payload: { url } }
    : { type: TIKTOK_RUNTIME_MESSAGE.fetchMedia, payload: { url, kind: action } }
  try {
    return readExportOutcome(await send(message))
  } catch {
    // A closed channel (worker asleep, extension reloaded) rejects the promise.
    return { ok: false, code: 'unreachable' }
  }
}
