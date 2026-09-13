/**
 * Action bridge: the only place the hover overlay talks to the outside world.
 *
 * Layering rule: the overlay, the capsule and the detector never call
 * `chrome.runtime` or `window.postMessage` themselves. Every outbound message
 * passes through this module, so the transports are auditable in one file and
 * replaceable in tests.
 *
 * Hovering still sends nothing. A message leaves this module only after the user
 * presses a capsule icon, which keeps the MV3 service worker asleep while the
 * pointer moves.
 *
 * @module
 */

import { RUNTIME_MESSAGE, TIMING } from './messages.ts'
import { isAttachablePayload } from './payload.ts'
import type { ActionOutcome, HoveredMedia } from './types.ts'
import type { HoverCopy } from './copy.ts'

/**
 * The payload as the outside world should see it.
 *
 * A `blob:` handle resolves nowhere outside the page that minted it, so a
 * non-attachable payload travels as a page reference — with the captured frame
 * kept as the thumbnail — instead of being shipped as a dead link or dropped.
 */
export function outboundMedia(payload: HoveredMedia): HoveredMedia {
  if (isAttachablePayload(payload)) return payload
  return {
    ...payload,
    id: `video:${payload.pageUrl}`,
    src: payload.pageUrl,
    previewSrc: payload.previewSrc !== '' ? payload.previewSrc : payload.pageUrl,
    sourceKind: 'page',
    attachable: true,
  }
}

/** How the workbench delivery ended, so the caller can report the channel. */
export type WorkstationResult = 'attached' | 'unavailable' | 'rejected'

/** Everything the bridge needs from the page and the extension runtime. */
export interface ActionTransport {
  /**
   * Ask the floating workstation to take the media and report the receipt.
   *
   * @returns `'attached'` when the panel confirmed, `'rejected'` when it refused,
   *   and `'unavailable'` when no workstation exists to deliver to.
   */
  deliverToWorkstation(payload: HoveredMedia, timeoutMs: number): Promise<WorkstationResult>
  /** Send a runtime message to the background worker. */
  postToBackground(message: Record<string, unknown>): Promise<unknown>
  /** Write text to the system clipboard. */
  writeClipboard(text: string): Promise<boolean>
  /** Live UI copy for the active locale. */
  copy(): HoverCopy
}

/** The handle `fab-companion.ts` publishes once the workstation is mounted. */
interface WorkstationHandle {
  openWithMedia(payload: HoveredMedia): Promise<boolean>
  isOpen(): boolean
}

/** Reads the workstation handle installed by the companion, if any. */
export function workstationHandle(): WorkstationHandle | null {
  const shell = globalThis as typeof globalThis & { __dshBrowserWorkstation?: WorkstationHandle }
  const handle = shell.__dshBrowserWorkstation
  return handle === undefined ? null : handle
}

/** Creates the browser transport bound to the current page. */
export function browserTransport(copy: () => HoverCopy): ActionTransport {
  return {
    async deliverToWorkstation(payload, timeoutMs) {
      const handle = workstationHandle()
      if (handle === null) return 'unavailable'
      const attached = await withTimeout(handle.openWithMedia(payload), timeoutMs)
      if (attached === null) return 'unavailable'
      return attached ? 'attached' : 'rejected'
    },
    async postToBackground(message) {
      if (typeof chrome === 'undefined' || chrome.runtime?.sendMessage === undefined) return null
      try {
        return await chrome.runtime.sendMessage(message)
      } catch {
        return null
      }
    },
    async writeClipboard(text) {
      try {
        if (navigator.clipboard?.writeText !== undefined) {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch {
        // Permission policy or a non-secure context: fall through to the copy
        // command, the only path available on older embedded webviews.
      }
      return legacyCopy(text)
    },
    copy,
  }
}

/** Await a promise against a budget; `null` means the budget ran out. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T | null): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    setTimeout(() => finish(null), timeoutMs)
    void promise.then(
      (value) => finish(value),
      () => finish(null),
    )
  })
}

/** Select-and-copy fallback used when the async clipboard API is unavailable. */
export function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  area.style.pointerEvents = 'none'
  document.body.appendChild(area)
  try {
    area.select()
    return typeof document.execCommand === 'function' ? document.execCommand('copy') : false
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/**
 * Performs the three capsule shortcuts.
 *
 * Every entry point returns an {@link ActionOutcome} and never throws: the
 * capsule renders the outcome message directly, so a failure has to stay visible
 * to the user instead of becoming an unhandled rejection.
 */
export class MediaActionBridge {
  private readonly transport: ActionTransport

  constructor(transport: ActionTransport) {
    this.transport = transport
  }

  /**
   * Saves the media into the extension-local inspiration library.
   *
   * The write is delegated to the background worker so the storage schema and
   * its de-duplication/cap rules have exactly one owner.
   *
   * The store writes once and answers once: an accepted envelope whose own
   * result reports a rejected write must not reach the capsule as a saved
   * library, because painting the saved mark is the only feedback the user gets.
   */
  async saveToInspiration(payload: HoveredMedia): Promise<ActionOutcome> {
    const hints = this.transport.copy()
    const record = asRecord(await this.transport.postToBackground({
      type: RUNTIME_MESSAGE.mediaToInspiration,
      payload: outboundMedia(payload),
    }))
    if (record?.ok !== true) return { ok: false, status: 'failed', message: hints.failed }
    const outcome = asRecord(record.result)
    if (outcome !== null && outcome.ok === false) {
      return { ok: false, status: 'failed', message: hints.failed }
    }
    return {
      ok: true,
      status: 'saved',
      message: isAttachablePayload(payload) ? hints.done.inspiration : hints.pageReference,
    }
  }

  /**
   * Copies the media address to the system clipboard.
   *
   * A page-scoped video is copied as its page address: the `blob:` handle it
   * carries would paste a link that resolves nowhere.
   */
  async copyToClipboard(payload: HoveredMedia): Promise<ActionOutcome> {
    const hints = this.transport.copy()
    const copied = await this.transport.writeClipboard(outboundMedia(payload).src)
    if (!copied) return { ok: false, status: 'failed', message: hints.failed }
    return {
      ok: true,
      status: 'copied',
      message: isAttachablePayload(payload) ? hints.done.copy : hints.pageReference,
    }
  }

  /**
   * Delivers the media into the conversation.
   *
   * Prefers the floating workstation: its receipt proves the panel accepted the
   * attachment, so the capsule only paints the "added" state on real evidence.
   * When the workstation is missing or silent past the receipt budget, the
   * request falls back to the native side panel, which holds the media until its
   * panel connects.
   */
  async attachToConversation(payload: HoveredMedia): Promise<ActionOutcome> {
    const hints = this.transport.copy()
    const media = outboundMedia(payload)
    const delivered = await this.transport.deliverToWorkstation(media, TIMING.attachReceiptTimeout)
    if (delivered === 'attached') {
      return { ok: true, status: 'attached', message: hints.done.attach, channel: 'workbench' }
    }

    // A workbench that exists but never answered is treated like a missing one:
    // the media must still reach the conversation rather than being dropped.
    const record = asRecord(await this.transport.postToBackground({
      type: RUNTIME_MESSAGE.openAssistantWithMedia,
      payload: media,
    }))
    if (record?.ok !== true) return { ok: false, status: 'failed', message: hints.failed }
    return { ok: true, status: 'attached', message: hints.done.attach, channel: 'side-panel' }
  }
}

function asRecord(value: unknown): { ok?: unknown; result?: unknown } | null {
  return typeof value === 'object' && value !== null ? value as { ok?: unknown; result?: unknown } : null
}
