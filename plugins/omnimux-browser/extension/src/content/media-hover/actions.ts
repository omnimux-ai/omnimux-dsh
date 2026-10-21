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
 * pointer moves. The second slot saves a real file through the worker's
 * `chrome.downloads` channel; the media address it saves is planned in
 * `download-plan.ts`, never the poster the capsule happens to paint.
 *
 * @module
 */

import { RUNTIME_MESSAGE, TIMING } from './messages.ts'
import { isAttachablePayload } from './payload.ts'
import {
  isXVideoPayload,
  mediaElementFor,
  planMediaDownload,
  xTweetIdForDownload,
} from './download-plan.ts'
import { xVariantsOfTweetResult, type XVideoVariant } from './video-source.ts'
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

/**
 * What the worker knows about the native side panel in this page's window.
 *
 * `unreachable` is not a synonym for `inactive`: a page whose worker did not
 * answer has not proved that no panel is open, and the two states lead to
 * different decisions below.
 */
export type SidePanelState = 'active' | 'inactive' | 'unreachable'

/** Everything the bridge needs from the page and the extension runtime. */
export interface ActionTransport {
  /**
   * Ask the worker whether the native side panel is connected in this window.
   *
   * @returns `'active'` when a panel holds the conversation, `'inactive'` when
   *   the worker answered that none is open, and `'unreachable'` when the
   *   question could not be put to a worker at all.
   */
  sidePanelState(): Promise<SidePanelState>
  /**
   * Ask the floating workstation to take the media and report the receipt.
   *
   * @returns `'attached'` when the panel confirmed, `'rejected'` when it refused,
   *   and `'unavailable'` when no workstation exists to deliver to.
   */
  deliverToWorkstation(payload: HoveredMedia, timeoutMs: number): Promise<WorkstationResult>
  /** Send a runtime message to the background worker. */
  postToBackground(message: Record<string, unknown>): Promise<unknown>
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
  const transport: ActionTransport = {
    async sidePanelState() {
      // The question rides the same background channel as every other capsule
      // request. A page without a worker, or a worker that answers something
      // else entirely, reports `unreachable` rather than a panel it cannot see.
      const record = asRecord(await transport.postToBackground({ type: RUNTIME_MESSAGE.checkSidePanelOpen }))
      if (record?.ok !== true || typeof record.active !== 'boolean') return 'unreachable'
      return record.active ? 'active' : 'inactive'
    },
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
    copy,
  }
  return transport
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

/** The address a video payload is known by: its poster, else its source. */
function xPosterOf(payload: HoveredMedia): string {
  return payload.previewSrc !== '' ? payload.previewSrc : payload.src
}

/** Reads the resource-timing names of this document, or `[]` outside a page. */
function readResourceNames(): readonly string[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
  return performance.getEntriesByType('resource').map((entry) => entry.name)
}

/** The document this bridge runs in, or `null` outside a page. */
function readDocument(): Document | null {
  return typeof document === 'undefined' ? null : document
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
   * Saves the hovered image into the current host's asset library.
   *
   * The worker relays the request to the single paired local host over the
   * authenticated bridge; the success shape it must return is the frozen
   * `saved`/`duplicate` receipt with real asset and file ids. Anything else —
   * an empty result, a bare `ok: true`, a status this build does not know —
   * is an unconfirmed save, never a done mark. The user-facing wording stays
   * verbatim on this side of the wire.
   */
  async saveImageToAssets(payload: HoveredMedia): Promise<ActionOutcome> {
    const hints = this.transport.copy()
    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `save-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    const record = asRecord(await this.transport.postToBackground({
      type: RUNTIME_MESSAGE.mediaToAssets,
      payload,
      requestId,
    }))
    if (record === null) {
      return { ok: false, status: 'failed', message: hints.image.hostUnavailable }
    }
    if (record.ok !== true) {
      const code = asRecord(record.error)?.code
      if (code === 'host-unavailable') {
        return { ok: false, status: 'failed', message: hints.image.hostUnavailable }
      }
      if (code === 'invalid-media' || code === 'invalid-request') {
        return { ok: false, status: 'failed', message: hints.image.unavailable }
      }
      // `save-unconfirmed` and every other transport-level miss land here: the
      // receipt never proved the outcome either way, so the UI must not claim
      // a failure the host may not have seen — or a save it may have done.
      return { ok: false, status: 'failed', message: hints.image.unconfirmed }
    }
    return mapAssetSaveOutcome(record.result, hints)
  }

  /**
   * Downloads the hovered media as a real file.
   *
   * The press is the only point where a video's playable address is resolved:
   * hovering stays cheap, and the poster the capsule paints is never mistaken
   * for the file. An X post's public variants travel through the worker — the
   * syndication endpoint refuses page origins — and the shared planner then
   * decides whether a progressive file exists at all. A page-scoped stream is
   * reported as unavailable instead of saving a playlist or a poster.
   */
  async downloadMedia(payload: HoveredMedia): Promise<ActionOutcome> {
    const hints = this.transport.copy()
    const element = mediaElementFor(payload, readDocument())

    let variants: readonly XVideoVariant[] = []
    if (isXVideoPayload(payload, element)) {
      const tweetId = xTweetIdForDownload(payload, element)
      if (tweetId !== null) {
        const record = asRecord(await withTimeout(
          this.transport.postToBackground({ type: RUNTIME_MESSAGE.xVideoVariants, tweetId }),
          TIMING.xVariantsTimeout,
        ))
        if (record?.ok === true) {
          variants = xVariantsOfTweetResult(record.result, xPosterOf(payload))
        }
      }
    }

    const plan = planMediaDownload({
      payload,
      pageUrl: payload.pageUrl !== ''
        ? payload.pageUrl
        : (typeof location === 'undefined' ? '' : location.href),
      pageTitle: payload.pageTitle,
      element,
      variants,
      entryNames: readResourceNames(),
    })
    if (!plan.ok) {
      return {
        ok: false,
        status: 'failed',
        message: plan.reason === 'video-unavailable' ? hints.downloadUnavailable : hints.unusable,
      }
    }

    const record = asRecord(await withTimeout(this.transport.postToBackground({
      type: RUNTIME_MESSAGE.mediaDownload,
      request: plan.request,
    }), TIMING.downloadStartTimeout))
    if (record?.ok !== true) {
      const code = asRecord(record?.error)?.code
      return {
        ok: false,
        status: 'failed',
        message: code === 'invalid-url' || code === 'invalid-request' ? hints.unusable : hints.downloadFailed,
      }
    }
    return { ok: true, status: 'downloading', message: hints.done.download }
  }

  /**
   * Delivers the media into the conversation.
   *
   * The native side panel wins whenever it is open: the user is already looking
   * at that conversation, and expanding the floating workstation beside it would
   * show the same session twice. A panel state the worker could not answer is
   * treated the same way — it cannot rule a panel out, and the panel channel
   * holds the media either way.
   *
   * Only a positive "no panel is open" lets the floating workstation take the
   * request, and only the workstation's own receipt counts as "added". When no
   * channel can take the media, the request falls back to the side panel, which
   * keeps it until its port connects.
   */
  async attachToConversation(payload: HoveredMedia): Promise<ActionOutcome> {
    const hints = this.transport.copy()
    const media = outboundMedia(payload)

    if (await this.transport.sidePanelState() === 'inactive') {
      const delivered = await this.transport.deliverToWorkstation(media, TIMING.attachReceiptTimeout)
      if (delivered === 'attached') {
        return { ok: true, status: 'attached', message: hints.done.attach, channel: 'workbench' }
      }
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

/**
 * Maps a worker business outcome to the action result the capsule renders.
 *
 * Only a strict `saved`/`duplicate` receipt — non-empty `assetId` and
 * `fileId`, a safe non-negative integer `lrev` (parallel to the host parser
 * in protocol.ts) — counts as a save. Every known failure status
 * resolves to its frozen copy, and anything unrecognised is honestly reported
 * as unconfirmed rather than guessed at.
 */
function mapAssetSaveOutcome(result: unknown, hints: HoverCopy): ActionOutcome {
  const body = asRecord(result)
  const statusName = typeof body?.status === 'string' ? (body.status as string) : ''
  if (statusName === 'saved' || statusName === 'duplicate') {
    const confirmed = body !== null
      && typeof body.assetId === 'string' && body.assetId.trim() !== ''
      && typeof body.fileId === 'string' && body.fileId.trim() !== ''
      && typeof body.lrev === 'number' && Number.isSafeInteger(body.lrev) && body.lrev >= 0
    if (confirmed) {
      return { ok: true, status: 'saved', message: hints.image.done }
    }
    return { ok: false, status: 'failed', message: hints.image.unconfirmed }
  }
  switch (statusName) {
    case 'http-error':
    case 'timeout':
      return { ok: false, status: 'failed', message: hints.image.downloadFailed }
    case 'invalid-url':
    case 'unsupported-image':
    case 'mime-mismatch':
    case 'too-large':
      return { ok: false, status: 'failed', message: hints.image.unavailable }
    case 'unavailable':
    case 'storage-failed':
    case 'cancelled':
      return { ok: false, status: 'failed', message: hints.image.saveFailed }
    default:
      return { ok: false, status: 'failed', message: hints.image.unconfirmed }
  }
}
