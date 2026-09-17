/**
 * The three page surfaces this extension owns, described once.
 *
 * A surface is one place the extension puts something on a page. Three kinds
 * exist (`brand-fab`, `scene-fixed`, `media-trigger`) and until now each was
 * implemented on its own: the floating ball read its corner from the platform
 * anchor table, the TikTok trigger carried its own mount gate, and the hover
 * capsule invented a fourth set of rules. The differences between them are real
 * — anchoring, reveal, and what the mark opens — but every one of them is a
 * value in this file rather than a branch in three modules.
 *
 * Pure declarations and pure maths live here so a placement can be tested
 * without a browser; `media-trigger.ts` and the platform tables are the callers.
 *
 * @module
 */

/** The three kinds of page surface. */
export type SurfaceKind = 'brand-fab' | 'scene-fixed' | 'media-trigger'

/** A rectangle inside the container a surface is placed against. */
export type SurfaceCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Which surface kinds exist, in the order the panel documents them. */
export const SURFACE_KINDS: readonly SurfaceKind[] = ['brand-fab', 'scene-fixed', 'media-trigger']

/**
 * Size presets.
 *
 * `md` is the shipped size of each kind; `px` on a `SurfaceSize` overrides the
 * preset, which is what "default / customisable" means for a caller.
 */
export type SurfaceSizePreset = 'sm' | 'md' | 'lg'

export interface SurfaceSize {
  readonly preset: SurfaceSizePreset
  /** Explicit pixel size; when present it wins over `preset`. */
  readonly px?: number
}

/** The pixel size of one `media-trigger` preset, before any override. */
export const MEDIA_TRIGGER_SIZE_PX: Readonly<Record<SurfaceSizePreset, number>> = {
  sm: 28,
  md: 34,
  lg: 42,
}

/** Smallest and largest `px` override a caller may ask for. */
export const SURFACE_SIZE_FLOOR_PX = 18
export const SURFACE_SIZE_CEILING_PX = 72

/** Gap kept between a surface and the container edge it hugs. */
export const SURFACE_INSET_PX = 8

/**
 * How a surface appears.
 *
 * `always` is the shipped behaviour of the ball and of the TikTok trigger.
 * `hover-container` is the card rule: nothing is on screen until the pointer
 * rests on the work the surface belongs to.
 */
export type SurfaceReveal = 'always' | 'hover-container'

/** What the mark opens once it is on screen. */
export type SurfaceExpand = 'none' | 'hover-self' | 'click'

/** Placement strategies, one per anchoring idea. */
export type SurfacePlacement =
  /** A corner of the viewport; the ball's default, optionally draggable. */
  | { readonly strategy: 'viewport-corner', readonly corner: SurfaceCorner, readonly draggable: boolean }
  /** An anchor chain resolved against page geometry; the scene trigger's. */
  | { readonly strategy: 'anchor', readonly mark: 'scene' }
  /** A corner inside the element the surface belongs to; the card trigger's. */
  | { readonly strategy: 'container-corner', readonly corner: SurfaceCorner }

/** Everything a surface declares about itself. */
export interface SurfaceDescriptor {
  readonly kind: SurfaceKind
  readonly size: SurfaceSize
  readonly reveal: SurfaceReveal
  readonly expand: SurfaceExpand
  readonly placement: SurfacePlacement
}

/**
 * The pixel size a descriptor resolves to.
 *
 * An override is clamped rather than trusted: a caller asking for 4px or 400px
 * would otherwise place a mark that cannot be clicked or that covers the page.
 *
 * @param size the declared size
 * @param presets the kind's preset table
 */
export function resolveSurfaceSizePx(
  size: SurfaceSize,
  presets: Readonly<Record<SurfaceSizePreset, number>>,
): number {
  const base = size.px ?? presets[size.preset]
  if (!Number.isFinite(base)) return presets.md
  return Math.min(SURFACE_SIZE_CEILING_PX, Math.max(SURFACE_SIZE_FLOOR_PX, Math.round(base)))
}

/** Offsets, in CSS px, from the container's top-left corner. */
export interface SurfaceOffset {
  readonly left: number
  readonly top: number
}

/**
 * Where a mark sits inside a container of a known size.
 *
 * Returned as offsets from the container's top-left rather than as
 * `left/right/bottom` CSS pairs so a caller can set one property pair and keep
 * the other axis free; both axes are always computed here.
 *
 * @param corner which corner to hug
 * @param container the container's measured box
 * @param mark the mark's own size in px
 * @param inset gap kept from the container edge; defaults to {@link SURFACE_INSET_PX}
 */
export function resolveContainerCornerOffset(
  corner: SurfaceCorner,
  container: { readonly width: number, readonly height: number },
  mark: number,
  inset: number = SURFACE_INSET_PX,
): SurfaceOffset {
  const right = corner === 'top-right' || corner === 'bottom-right'
  const bottom = corner === 'bottom-left' || corner === 'bottom-right'
  return {
    left: right ? Math.max(0, container.width - mark - inset) : inset,
    top: bottom ? Math.max(0, container.height - mark - inset) : inset,
  }
}

/**
 * Which way a toolbar opens for a mark in `corner`.
 *
 * The toolbar must grow into the page, so it opens away from the edge the mark
 * hugs: a mark in a right-hand corner opens leftwards, and one in a left-hand
 * corner opens rightwards. Vertical alignment follows the same rule.
 */
export function resolveToolbarSide(corner: SurfaceCorner): {
  readonly horizontal: 'left' | 'right'
  readonly vertical: 'top' | 'bottom'
} {
  const right = corner === 'top-right' || corner === 'bottom-right'
  const bottom = corner === 'bottom-left' || corner === 'bottom-right'
  return { horizontal: right ? 'left' : 'right', vertical: bottom ? 'top' : 'bottom' }
}
