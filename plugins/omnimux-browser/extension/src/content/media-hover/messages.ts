/**
 * Message protocol constants and visual contracts for the hover assistant.
 *
 * Single source of truth: layer stacking, capsule and tooltip visual specs and
 * the debounce/timing budgets, so no other module repeats a magic number.
 * User-facing copy lives in `copy.ts`; the stylesheet in `styles.css`.
 *
 * @module
 */

/** Identity attached to every content-script message; receivers validate it. */
export const CONTENT_MESSAGE_SOURCE = 'omnimux-content-script'

/** Web `postMessage` types exchanged with the workbench iframe. */
export const BRIDGE_MESSAGE = {
  /** Content → iframe: full page context, including the sniffed media list. */
  pageContextUpdate: 'PAGE_CONTEXT_UPDATE',
  /** Content → iframe: the sniffed media list. */
  mediaSniffedResult: 'MEDIA_SNIFFED_RESULT',
  /** iframe → Content: request a context refresh. */
  getPageContext: 'GET_PAGE_CONTEXT',
  /** Content → iframe: attach media as a draft attachment and focus the composer. */
  mediaAttachRequest: 'MEDIA_ATTACH_REQUEST',
  /** iframe → Content: attach receipt, drives the capsule check/copy state. */
  mediaAttachResult: 'MEDIA_ATTACH_RESULT',
  /** Panel/internals → Content: expand the workstation and deliver the media. */
  activateWorkbenchWithMedia: 'ACTIVATE_WORKBENCH_WITH_MEDIA',
} as const

/** `chrome.runtime` message types exchanged with the background worker. */
export const RUNTIME_MESSAGE = {
  /** Content → background: persist one media record into the inspiration library. */
  mediaToInspiration: 'DSH_MEDIA_TO_INSPIRATION',
  /** Content → background: side-panel fallback plus a pending-media stash. */
  openAssistantWithMedia: 'DSH_OPEN_ASSISTANT_WITH_MEDIA',
  /** Content → background: hand the stashed media to a freshly opened panel. */
  mediaAttachRequest: 'DSH_MEDIA_ATTACH_REQUEST',
} as const

/** Layer stacking. The host matches the existing FAB; each child adds a layer. */
export const OVERLAY_Z = {
  host: 2147483647,
  capsule: 2147483646,
  tooltip: 2147483645,
} as const

/** The pure-white tooltip above the capsule icons. */
export const TOOLTIP_SPEC = {
  background: '#FFFFFF',
  color: '#0A0A0B',
  fontWeight: 600,
  fontSize: 12,
  lineHeight: '16px',
  padding: '6px 10px',
  borderRadius: '8px',
  maxWidth: 220,
  /** Downward pointing tail; `left` aligns with the hovered icon's centre. */
  arrow: { size: 5, side: 'bottom' },
  shadow: '0 6px 20px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.18)',
  /** Gap between the tail tip and the icon's top edge. */
  offsetY: 8,
  /** Smallest distance kept from a viewport edge. */
  viewportMargin: 8,
} as const

/** The dark frosted pill that carries the shortcut icons. */
export const CAPSULE_SPEC = {
  background: 'rgba(30,32,38,0.95)',
  backgroundColor: '#1e2026',
  backgroundAlpha: 0.95,
  borderRadius: 18,
  height: 36,
  /**
   * Stage one, the collapsed circle: the brand trigger alone.
   * `36 × 36` with an `18px` radius is a perfect circle.
   */
  collapsedWidth: 36,
  /**
   * Stage two, the expanded row: 3 x 30px icons + 2 x 4px gaps +
   * 2 x 6px padding + 2 x 1px border.
   */
  width: 112,
  paddingX: 6,
  /**
   * The `collapsedWidth → width` opening animation. The stylesheet owns the
   * transition; this is the same duration on the JavaScript side, where it ends
   * the window in which the action row may not take the pointer.
   */
  openMs: 220,
  /** Gap between two action icons in the expanded row. */
  iconGap: 4,
  blur: 'blur(24px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.14)',
  sheen: 'inset 0 1px 0 rgba(255,255,255,0.20)',
  shadow: '0 8px 26px rgba(0,0,0,0.42), inset 0 0 0 0.5px rgba(255,255,255,0.06)',
  /** Inset from the media's bottom-left corner. */
  inset: 10,
  iconSize: 30,
  /** Hit box of the stage-one brand trigger inside the circle. */
  brandSize: 28,
  /** Rendered size of the brand silhouette. */
  brandIconSize: 20,
  /** Flips the capsule left when the media sits against the right edge. */
  edgeMargin: 8,
} as const

/** Timing budget. Values are rendered in the tooltip labels and copy. */
export const TIMING = {
  /** Pointer must rest this long on a media element before the capsule shows. */
  enterDebounce: 150,
  /** Grace period after `mouseleave` during which entering the capsule cancels the hide. */
  leaveGrace: 150,
  /**
   * Buffer between the pointer leaving the capsule and the fold-back, so the
   * diagonal trip from an action icon back to the brand circle never flickers.
   */
  collapseGrace: 220,
  /** Receipt window for the workbench attach request. */
  attachReceiptTimeout: 800,
  /** Instant check feedback on the copy icon. */
  copyCheckFlash: 600,
  /** Lifetime of an error tooltip. */
  errorDismiss: 3000,
  /** Cache expiry for a candidate that the pointer has left. */
  candidateIdle: 2000,
} as const

/** Longest tooltip label rendered, in characters. */
export const TOOLTIP_MAX_CHARS = 260

/** Storage contract for the local inspiration library. */
export const INSPIRATION_STORE = {
  key: 'dshMediaInspiration',
  /** Newest-first cap; the oldest record is evicted past this count. */
  limit: 500,
} as const

/** Ghost-capsule placement relative to the media's bottom-left corner. */
export type CapsuleAlignment = 'left' | 'right'

/** Computed capsule geometry in viewport coordinates. */
export interface CapsuleGeometry {
  left: number
  top: number
  alignment: CapsuleAlignment
}

/**
 * Computes the fixed-position geometry of the data-driven capsule (`.omnimux-add-bar`).
 *
 * @param anchor - The media element's bounding rect.
 * @param metrics - Capsule pixel size, measured after mount (0 before layout).
 * @param width - Viewport width in CSS pixels.
 * @param height - Viewport height in CSS pixels.
 */
export function computeCapsuleGeometry(
  anchor: { left: number; top: number; right: number; bottom: number },
  metrics: { width: number; height: number },
  width: number,
  height: number,
): CapsuleGeometry {
  const width_ = Math.max(0, metrics.width)
  const height_ = Math.max(0, metrics.height)
  const margin = CAPSULE_SPEC.edgeMargin

  const fitsLeft = anchor.left + CAPSULE_SPEC.inset + width_ <= width - margin
  const preferredLeft = fitsLeft
    ? anchor.left + CAPSULE_SPEC.inset
    : anchor.right - CAPSULE_SPEC.inset - width_
  const top = anchor.bottom - CAPSULE_SPEC.inset - height_
  const alignment: CapsuleAlignment = fitsLeft ? 'left' : 'right'

  return {
    left: clamp(preferredLeft, margin, Math.max(margin, width - width_ - margin)),
    top: clamp(top, margin, Math.max(margin, height - height_ - margin)),
    alignment,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}
