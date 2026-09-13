/**
 * Type contracts for the page-media hover assistant.
 *
 * The module is shared by the detection layer (pointer → element), the overlay
 * layer (Shadow DOM capsule + white tooltip) and the action layer (inspiration
 * library / clipboard / conversation attach).
 *
 * The contract is re-declared in the panel (`App.tsx`) rather than imported from
 * this bundle: the two surfaces ship separately and must not share a module.
 *
 * @module
 */

/**
 * Normalised hovered media payload.
 *
 * Every URL field is absolute: the content script resolves relative sources
 * against `location.href` before the payload leaves the detector, because the
 * workbench iframe would otherwise resolve them against its own extension origin
 * and fail. The same shape travels through `chrome.runtime` to the panel, which
 * re-validates it on arrival.
 */
export interface HoveredMedia {
  /** Stable per-view identity: `<kind>:<src>`, truncated to a bounded length. */
  id: string
  type: MediaKind
  /** Absolute media address. */
  src: string
  /** Thumbnail address: the video poster, or `src` when no poster exists. */
  previewSrc: string
  pageUrl: string
  pageTitle: string
  /** Rendered size in CSS pixels. */
  width: number
  height: number
  /** Intrinsic size, used by downstream pixel-budget checks. */
  naturalWidth: number
  naturalHeight: number
  alt: string
  capturedAt: number
  /**
   * Which rung of the source ladder produced {@link src}.
   *
   * Optional because the payload crosses `chrome.runtime`: a record written by
   * an older build, or one replayed from the store, carries no rung, and a
   * reader must fall back to the `direct` rung rather than reject the record.
   */
  sourceKind?: MediaSourceKind
  /** Whether {@link src} can be re-fetched outside the page. Defaults to `true`. */
  attachable?: boolean
}

/** How a media element can be materialised downstream. */
export type MediaKind = 'image' | 'video'

/**
 * Which rung of the source ladder produced a media address.
 *
 * Ordered by reusability rather than by discovery order: `direct` and `poster`
 * are ordinary URLs the workbench can fetch on its own, `frame` is an inline
 * capture that carries its own pixels, and `blob` / `page` are page-scoped
 * references that only mean something inside the tab they came from.
 */
export type MediaSourceKind = 'direct' | 'poster' | 'frame' | 'blob' | 'page'

/** One resolved media address, with the rung and the reach that produced it. */
export interface MediaSourceResolution {
  /** The address recorded as the media's identity; `''` when nothing resolved. */
  src: string
  /** What to paint as the thumbnail; falls back to {@link src}. */
  previewSrc: string
  kind: MediaSourceKind
  /** Whether the workbench may re-fetch {@link src} from its own origin. */
  attachable: boolean
}

/** What to do when the capsule does not fit at its preferred corner. */
export type CapsuleOverflowPolicy = 'mirror' | 'clamp'

/**
 * Where the pill sits relative to a media element, per media kind.
 *
 * Modelled as data rather than as an `if` at each call site: the placement rule
 * and the flip decision are read from the same object, so a new media kind is
 * one more policy instead of one more branch inside the geometry.
 */
export interface CapsuleAnchorPolicy {
  /** Horizontal inset from the anchor corner. */
  offsetX: number
  /** Vertical inset from the media's bottom edge. */
  offsetY: number
  /** `mirror` flips to the opposite corner; `clamp` slides back inside instead. */
  overflow: CapsuleOverflowPolicy
}

/** The three shortcuts the capsule offers, in capsule order. */
export type MediaActionKind = 'inspiration' | 'copy' | 'attach'

/** Lifecycle of one hover session. */
export type OverlayPhase = 'idle' | 'pending' | 'shown' | 'interactive' | 'hidden'

/** Outcome discriminator returned by every action handler. */
export type ActionStatus = 'saved' | 'copied' | 'attached' | 'failed'

/** A hoverable element resolved from a pointer event. */
export interface HoverCandidate {
  element: Element
  payload: HoveredMedia
  /** `Date.now()` of the last pointer hit, used for cache expiry. */
  lastSeenAt: number
  /** Set when the element turned ineligible (detached or resized below 40px). */
  disabled: boolean
}

/** Result of one shortcut invocation. */
export interface ActionOutcome {
  ok: boolean
  status: ActionStatus
  /** Operator-facing text, rendered inside the white tooltip. */
  message: string
  /** Which transport carried an attach request. */
  channel?: 'workbench' | 'side-panel'
}

/** Rect-like geometry accepted by the placement helpers. */
export interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** Viewport box used to clamp the tooltip inside the visible area. */
export interface ViewportBox {
  width: number
  height: number
  /** Minimum distance kept from every viewport edge. */
  margin: number
}

/** Computed tooltip geometry. */
export interface TooltipPlacement {
  left: number
  top: number
  side: 'above' | 'below'
  flipped: boolean
}

/** Fully populated overlay state; `patch` merges into it. */
export interface OverlayState {
  phase: OverlayPhase
  activeId: string
  busyAction: MediaActionKind | null
  saved: boolean
  copied: boolean
  attached: boolean
}

/** The message a capsule icon press dispatches. */
export interface CapsuleActionEvent {
  action: MediaActionKind
  element: HTMLButtonElement
}
