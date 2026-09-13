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
  /** Expanded-row radius; `height / 2` keeps both of its ends perfectly round. */
  borderRadius: 16,
  /**
   * Stage-two height, and the band the placement reserves for *both* stages: the
   * collapsed circle is drawn inside it, so opening the pill grows sideways into
   * space the geometry has already accounted for and never crosses a viewport edge.
   *
   * `32` is the project's control-height baseline, which is also why the two
   * stages now share one band: the circle folds into the row it becomes.
   */
  height: 32,
  /**
   * Stage one, the collapsed circle: the brand trigger alone.
   * `32 × 32` with a `16px` radius is a perfect circle.
   *
   * The drawn box is 32px while {@link haloWidth} adds 4px on every side, so the
   * circle's *total* span — ring included — is exactly 40px.
   */
  collapsedWidth: 32,
  collapsedHeight: 32,
  collapsedRadius: 16,
  /**
   * Stage two, the expanded row: 3 x 20px circular icon buttons + 2 x 6px gaps +
   * 2 x 6px row padding = 84px.
   * Every gap, padding, and vertical margin is strictly 6px:
   * (32 - 20) / 2 = 6px above and below, 6px at left/right edges, and 6px between
   * buttons. The two end buttons form exact concentric circles with the pill's
   * 16px rounded ends, completely eliminating corner clipping and visual overflow.
   */
  width: 84,
  paddingX: 6,
  /**
   * Width of the translucent halo the pill casts on every side.
   *
   * This is the pill's one edge that never depends on what is underneath it, so
   * it is part of the geometry contract rather than a decoration: a 32px circle
   * plus `2 x 4px` spans exactly 40px of the page.
   */
  haloWidth: 4,
  /**
   * The `collapsedWidth → width` opening animation. The stylesheet owns the
   * transition; this is the same duration on the JavaScript side, where it ends
   * the window in which the action row may not take the pointer.
   */
  openMs: 220,
  /** Gap between two action icons in the expanded row: strictly 6px. */
  iconGap: 6,
  blur: 'blur(24px) saturate(140%)',
  /**
   * Translucent rim. Media behind the pill can be a white studio shot or a black
   * night frame, so the edge itself has to carry contrast instead of relying on
   * the frosted fill alone.
   */
  border: '1px solid rgba(255,255,255,0.28)',
  /** Lit top edge, inset so the rim reads as a highlight rather than a stroke. */
  sheen: 'inset 0 1px 0 rgba(255,255,255,0.35)',
  /**
   * Three translucent rings: the wide {@link haloWidth} outer halo and the inset
   * top sheen separate the pill from bright media, while the deep drop shadow
   * separates it from dark media. Video artwork moves under the pill and swings
   * from blown-out highlights to near-black shadows within a single second, so the
   * halo is the only edge the pill can rely on: it stays wide enough to survive
   * both, and `32 + 2 x 4` is what makes the circle span exactly 40px.
   */
  shadow:
    '0 0 0 4px rgba(255,255,255,0.22), 0 2px 10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.35)',
  /** Inset from the media's bottom-left corner. */
  inset: 10,
  /**
   * Action-button hit box: strictly a 20px perfect circle (`border-radius: 50%`).
   * Inside the 32px band (R=16), a 20px circle (r=10) centered at (16, 16)
   * creates a constant 6px breathing margin in EVERY direction (top, bottom,
   * and along the rounded cap), ensuring zero corner protrusion or overflow.
   */
  iconSize: 20,
  /** Rendered size of the glyph inside an action button: 13px. */
  iconGlyphSize: 13,
  /**
   * Hit box of the stage-one brand trigger inside the circle. Unlike the icon
   * buttons this box is not the band itself: a full-band trigger would put its
   * hover fill, and the ripple that follows a press, right up against the circle's
   * rounded edge.
   */
  brandSize: 24,
  /**
   * Rendered size of the brand silhouette, centred in the 24px hit box. The glyph
   * has to stay smaller than its box to read as a mark rather than a disc, but it
   * is the one thing the 40px circle carries — so it is scaled with the circle
   * instead of being pinned small.
   */
  brandIconSize: 18,
  /** Flips the capsule left when the media sits against the right edge. */
  edgeMargin: 8,
} as const

/**
 * Video-only capsule anchoring.
 *
 * A video's bottom-left corner belongs to the player, not to the page: the
 * native or custom control cluster (play/pause, mute, elapsed time) sits there,
 * so the image anchor would paint the pill straight over the play button. Every
 * constant below exists to push the pill clear of that cluster.
 */
export const VIDEO_ANCHOR_SPEC = {
  /**
   * Default left inset: clears a typical ~48px play control and lands 52px from
   * the media's left edge, which is the close, comfortable gap the shot demands.
   */
  offsetX: 52,
  /**
   * Gap kept past a measured play control's right edge.
   *
   * Zero is deliberate. A player's control box is mostly padding around its
   * glyph, so a pill starting at the box's right edge already reads as clear of
   * the button, and the wider gap an oversized clearance used to force was what
   * pushed the pill away from the button it belongs next to. It also keeps the
   * band floor real: the inset can still reach `offsetXRange[0]` when a probe
   * reports a control that ends at the media's 48px mark.
   */
  minClearance: 0,
  /** Band the left inset is allowed to move within, whatever a probe reports. */
  offsetXRange: [48, 96] as const,
  /** Default gap between the media's bottom edge and the capsule's bottom edge. */
  offsetY: 8,
  /** Band the bottom inset is allowed to move within, whatever a probe reports. */
  offsetYRange: [6, 12] as const,
  /** Play-control probe point: media `(left + probeInsetX, bottom - probeInsetY)`. */
  probeInsetX: 24,
  probeInsetY: 24,
  /** Largest edge length that still counts as player chrome rather than content. */
  controlMaxSize: 80,
  /** How long one element's probe result stays valid. */
  cacheMs: 1000,
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
  left: number
  top: number
  alignment: CapsuleAlignment
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

  const preferredLeft = anchor.left + policy.offsetX
  const fitsAtAnchor = preferredLeft + width_ <= width - margin

  // `mirror` flips the pill to the media's opposite edge. `clamp` keeps the
  // left-hand bias the video anchor asks for and slides the pill back inside
  // instead, because a video's right edge is the other half of its control bar.
  const targetLeft = fitsAtAnchor || policy.overflow === 'clamp'
    ? preferredLeft
    : anchor.right - policy.offsetX - width_

  const left = clamp(targetLeft, margin, Math.max(margin, width - width_ - margin))
  const top = anchor.bottom - policy.offsetY - height_

  // The transform origin follows the pill: it only reads as "right" once the
  // pill has actually been pushed left of the corner it was anchored to, which
  // is what keeps the opening animation growing into free space.
  const alignment: CapsuleAlignment = left < preferredLeft - 0.5 ? 'right' : 'left'

  return {
    left,
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
