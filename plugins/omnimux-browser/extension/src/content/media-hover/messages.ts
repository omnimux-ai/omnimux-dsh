/**
 * Message protocol constants and visual contracts for the hover assistant.
 *
 * Single source of truth: layer stacking, capsule and tooltip visual specs and
 * the debounce/timing budgets, so no other module repeats a magic number.
 * User-facing copy lives in `copy.ts`; the stylesheet in `styles.css`.
 *
 * @module
 */

import type { CapsuleAnchorPolicy } from './types.ts'

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
  /**
   * Content → background: persist the current image as a real file in the
   * paired host's asset library. Sent only when the save intent resolved to
   * an image; videos and unknown types never ride this message.
   */
  mediaToAssets: 'DSH_MEDIA_TO_ASSETS',
  /**
   * Content → background: is the native side panel already connected in this
   * window? Answered before anything opens, so the floating workstation is only
   * ever used when the side panel is not.
   */
  checkSidePanelOpen: 'DSH_CHECK_SIDE_PANEL_OPEN',
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
  /**
   * Fully rounded pill ends on every stage; `999px` reads as `height / 2` at any
   * band height, which is the same rounding the reference implementation (the
   * YouMind image toolbar) uses.
   */
  borderRadius: 999,
  /**
   * Stage-two height, and the band the placement reserves for *both* stages: the
   * collapsed circle is drawn inside it, so opening the pill grows sideways into
   * space the geometry has already accounted for and never crosses a viewport edge.
   *
   * 24px micro-baseline: identical to the YouMind hover button, so both pills sit
   * at the same height over the same media.
   */
  height: 24,
  /**
   * Stage one, the collapsed circle: the brand trigger alone.
   * `24 × 24`, matching the YouMind idle button exactly.
   *
   * The drawn box is 24px while {@link haloWidth} adds 2.5px on every side, so the
   * circle's *total* span — ring included — is exactly 29px.
   */
  collapsedWidth: 24,
  collapsedHeight: 24,
  collapsedRadius: 12,
  /**
   * Stage two, the expanded row, sized to the YouMind toolbar:
   * 3 x 24px circular icon buttons + 2 x 4px gaps + 2 x 24px row padding = 128px.
   * The icon buttons touch the band edges like the reference pill does.
   */
  width: 128,
  paddingX: 24,
  /**
   * Width of the translucent halo the pill casts on every side.
   */
  haloWidth: 2.5,
  /**
   * The `collapsedWidth → width` opening animation. The stylesheet owns the
   * transition; this is the same duration on the JavaScript side, where it ends
   * the window in which the action row may not take the pointer. Matches the
   * reference toolbar's 250ms ease-out-expo.
   */
  openMs: 250,
  /** Gap between two action icons in the expanded row: strictly 4px. */
  iconGap: 4,
  blur: 'blur(24px) saturate(140%)',
  /**
   * Translucent rim. Media behind the pill can be a white studio shot or a black
   * night frame, so the edge itself has to carry contrast instead of relying on
   * the frosted fill alone.
   */
  border: '1px solid rgba(255,255,255,0.28)',
  /** Lit top edge, inset so the rim reads as a highlight rather than a stroke. */
  sheen: 'inset 0 1px 0 rgba(255,255,255,0.35)',
  shadow:
    '0 0 0 2.5px rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.35)',
  /**
   * Inset from the media's bottom-left corner. 14px matches the reference
   * implementation's `left + 14` / `bottom - 38` anchor, so our pill lands in
   * the same spot over the same media.
   */
  inset: 14,
  /**
   * Action-button hit box: strictly a 24px perfect circle (`border-radius: 50%`),
   * the same `sm` icon button the reference toolbar uses.
   */
  iconSize: 24,
  /** Rendered size of the glyph inside an action button: 14px. */
  iconGlyphSize: 14,
  /**
   * Hit box of the stage-one brand trigger inside the circle: the full 24px pill
   * face, like the reference's fully-clickable 24px button.
   */
  brandSize: 24,
  /**
   * Rendered size of the brand silhouette, centred in the 24px hit box. At 18px
   * the ghost's ink fills roughly 71% of the circle, matching the reference
   * icon's visual weight.
   */
  brandIconSize: 18,
  /** Flips the capsule left when the media sits against the right edge. */
  edgeMargin: 8,
} as const

/**
 * Video-only capsule anchoring.
 *
 * A video's bottom-left corner belongs to the player: Bilibili, YouTube and X
 * all park the play/pause control there, so a pill drawn anywhere near it is
 * one slip away from swallowing the click meant for "play". The video pill lives
 * in the top-right corner instead, the quietest corner of most players.
 */
export const VIDEO_ANCHOR_SPEC = {
  /** Default gap between the media's right edge and the pill's right edge. */
  offsetX: 14,
  /** Gap kept past the left edge of a measured top-right control. */
  minClearance: 4,
  /** Band the right inset may move within, whatever a probe reports. */
  offsetXRange: [14, 96] as const,
  /** Gap between the media's top edge and the pill's top edge. */
  offsetY: 14,
  /** Control probe point: media `(right - probeInsetX, top + probeInsetY)`. */
  probeInsetX: 24,
  probeInsetY: 24,
  /** Largest edge length that still counts as player chrome rather than content. */
  controlMaxSize: 80,
  /** How long one element's probe result stays valid. */
  cacheMs: 1000,
} as const

/** Id of the page-level host the overlay mounts; hit tests skip it. */
export const MEDIA_OVERLAY_HOST_ID = 'omnimux-media-hover-root'

/**
 * Hover-region contract: the card area that keeps the capsule alive.
 *
 * Moving inside this region never hides the capsule; leaving it is the only
 * pointer-driven hide signal.
 */
export const HOVER_REGION = {
  /** Uniform breathing room around the media box, in CSS px. */
  pad: 12,
  /** Extra clearance added around the capsule while it is visible. */
  capsulePad: 8,
  /** Ancestor walk limit when resolving the card container. */
  maxAncestorDepth: 6,
  /** How far a candidate ancestor may exceed the media box on any side. */
  ancestorSlackPx: 32,
  /** Largest card/media ratio accepted on either axis. */
  ancestorMaxScale: 1.5,
  /** Constant term in the card-size bound. */
  ancestorMaxExtraPx: 64,
  /** Cache lifetime for a resolved region probe, in ms. */
  cacheMs: 1000,
} as const

/** Timing budget. Values are rendered in the tooltip labels and copy. */
export const TIMING = {
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
  /** Idle timeout when shown but user never interacts with the capsule. */
  idleDismiss: 3500,
} as const

/** Longest tooltip label rendered, in characters. */
export const TOOLTIP_MAX_CHARS = 260

/** Storage contract for the local inspiration library. */
export const INSPIRATION_STORE = {
  key: 'dshMediaInspiration',
  /** Newest-first cap; the oldest record is evicted past this count. */
  limit: 500,
} as const

/** Which side the capsule opens from: its transform origin. */
export type CapsuleAlignment = 'left' | 'right'

/**
 * The anchor every non-video media kind uses.
 *
 * `offsetX` / `offsetY` read `CAPSULE_SPEC.inset`, so an image keeps the exact
 * placement the two-stage contract has always produced, and `mirror` keeps the
 * established "flip to the right edge when the left corner does not fit" rule.
 */
export const IMAGE_ANCHOR_POLICY: CapsuleAnchorPolicy = {
  offsetX: CAPSULE_SPEC.inset,
  offsetY: CAPSULE_SPEC.inset,
  overflow: 'mirror',
}

/** Computed capsule geometry in viewport coordinates. */
export interface CapsuleGeometry {
  /** Left edge of the reserved (expanded) footprint. */
  left: number
  top: number
  alignment: CapsuleAlignment
  /**
   * Which edge of the footprint is pinned. `right` means the pill must be
   * positioned by its right edge so stage two grows leftwards from the corner.
   */
  edge: CapsuleAlignment
}

/**
 * Computes the fixed-position geometry of the data-driven capsule (`.omnimux-add-bar`).
 *
 * This is the single source of the placement rule *and* the flip decision. An
 * earlier revision also decided the flip inside the overlay, with a second copy
 * of the same comparison; the two disagreed as soon as a media kind wanted its
 * own inset, so the overlay now reads `alignment` from here instead.
 *
 * @param anchor - The media element's bounding rect.
 * @param metrics - Capsule pixel size, measured after mount (0 before layout).
 * @param width - Viewport width in CSS pixels.
 * @param height - Viewport height in CSS pixels.
 * @param policy - Where the pill sits relative to the anchor; defaults to the
 *   image policy, which is byte-for-byte the historical placement.
 */
export function computeCapsuleGeometry(
  anchor: { left: number; top: number; right: number; bottom: number },
  metrics: { width: number; height: number },
  width: number,
  height: number,
  policy: CapsuleAnchorPolicy = IMAGE_ANCHOR_POLICY,
): CapsuleGeometry {
  const width_ = Math.max(0, metrics.width)
  const height_ = Math.max(0, metrics.height)
  const margin = CAPSULE_SPEC.edgeMargin
  const maxLeft = Math.max(margin, width - width_ - margin)
  const maxTop = Math.max(margin, height - height_ - margin)

  if (policy.corner === 'top-right') {
    const preferredLeft = anchor.right - policy.offsetX - width_
    return {
      left: clamp(preferredLeft, margin, maxLeft),
      top: clamp(anchor.top + policy.offsetY, margin, maxTop),
      alignment: 'right',
      edge: 'right',
    }
  }

  const preferredLeft = anchor.left + policy.offsetX
  const fitsAtAnchor = preferredLeft + width_ <= width - margin

  // `mirror` flips the pill to the media's opposite edge; `clamp` slides it back
  // inside instead.
  const targetLeft = fitsAtAnchor || policy.overflow === 'clamp'
    ? preferredLeft
    : anchor.right - policy.offsetX - width_

  const left = clamp(targetLeft, margin, maxLeft)
  const top = anchor.bottom - policy.offsetY - height_

  // The transform origin follows the pill: it only reads as "right" once the
  // pill has actually been pushed left of the corner it was anchored to, which
  // is what keeps the opening animation growing into free space.
  const alignment: CapsuleAlignment = left < preferredLeft - 0.5 ? 'right' : 'left'

  return {
    left,
    top: clamp(top, margin, maxTop),
    alignment,
    edge: 'left',
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}
