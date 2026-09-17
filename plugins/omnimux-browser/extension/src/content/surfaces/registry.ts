/**
 * Which surfaces each platform puts on which page.
 *
 * The registry answers one question — "what belongs on this page?" — and every
 * mount site asks it rather than carrying its own gate. Before this module the
 * answer was spread over three: the TikTok trigger hard-coded two pathnames, the
 * hover capsule consulted a host whitelist plus a per-host video exception, and
 * the FAB was simply always on.
 *
 * A platform declares a *baseline* (kinds every one of its pages gets) and, when
 * it needs one, a per-page-type delta. Only TikTok needs a delta today; the
 * other entries exist so the table is the single answer for every host rather
 * than a TikTok special case with a fallback bolted beside it.
 *
 * @module
 */

import type { PageType } from '../../platform/registry.ts'
import type { SurfaceCorner, SurfaceDescriptor, SurfaceKind, SurfaceSizePreset } from './types.ts'

/** What the registry is asked about one page. */
export interface SurfacePageFacts {
  /** Platform id from the platform table (`tiktok`, `twitter`, …). */
  readonly platform: string
  /** Page type from the platform table; `unknown` when no rule claimed it. */
  readonly pageType: PageType
  /**
   * The page's path, when the caller has it.
   *
   * One rule is path-based rather than type-based: the platform table reports
   * TikTok's `/explore` as `home`, but explore is a grid of other people's work
   * and the scene mark — which answers "what am I watching right now?" — has
   * nothing to answer there. Encoding that as a path test here keeps the
   * platform table untouched and the disagreement in one place.
   */
  readonly pathname?: string
}

/** One kind's placement override for a page type. */
export interface SurfaceOverride {
  readonly corner?: SurfaceCorner
  readonly sizePreset?: SurfaceSizePreset
  readonly sizePx?: number
}

/** A page's surface allowance: the kinds that belong there, and any overrides. */
export interface SurfaceAllowance {
  readonly kinds: readonly SurfaceKind[]
  readonly overrides?: Readonly<Partial<Record<SurfaceKind, SurfaceOverride>>>
}

/**
 * TikTok's allowances, resolved by path.
 *
 * Path is the authority here rather than the page type, because the page type
 * cannot separate the pages that need different surfaces: the platform table
 * reports `/following` and `/search` as the same `unknown`, yet the first is a
 * feed — where the scene mark answers "what am I watching?" — and the second is
 * a grid of other people's work, where it has nothing to answer and the card
 * mark does. The page type is still consulted, but only where no path rule
 * claims the page.
 */
const TIKTOK_FEED: SurfaceAllowance = { kinds: ['brand-fab', 'scene-fixed'] }
const TIKTOK_GRID: SurfaceAllowance = {
  kinds: ['brand-fab', 'media-trigger'],
  overrides: { 'media-trigger': { corner: 'top-right', sizePreset: 'md' } },
}

const TIKTOK_PATH_RULES: readonly { readonly matches: (path: string) => boolean, readonly allowance: SurfaceAllowance }[] = [
  // A single post, open full-screen or in the browse overlay.
  { matches: (p) => p.includes('/video/') || p.includes('/photo/'), allowance: TIKTOK_FEED },
  { matches: (p) => p.startsWith('/@'), allowance: TIKTOK_GRID },
  { matches: (p) => p === '' || p === '/' || p === '/foryou' || p === '/following', allowance: TIKTOK_FEED },
  { matches: (p) => p.startsWith('/search') || p.startsWith('/explore'), allowance: TIKTOK_GRID },
]

/** The allowance the page type alone claims, when no path rule does. */
const TIKTOK_BY_PAGE_TYPE: Readonly<Partial<Record<PageType, SurfaceAllowance>>> = {
  home: TIKTOK_FEED,
  detail: TIKTOK_FEED,
  profile: TIKTOK_GRID,
  // A path no rule claimed — messages, settings, a live room — gets the ball
  // and nothing else. Guessing "grid" here would decorate pages with no work on
  // them, which is how a surface nobody asked for appears.
  unknown: { kinds: ['brand-fab'] },
}

/** Platforms whose pages get the ball and nothing else. */
const BRAND_ONLY_PLATFORMS: readonly string[] = ['twitter', 'zhihu', 'wechat', 'generic']

/** Platforms the extension adapts to at all; anything else is `generic`. */
const ALLOWANCE_BY_PLATFORM: Readonly<Record<string, Readonly<Partial<Record<PageType, SurfaceAllowance>>>>> = {
  tiktok: TIKTOK_BY_PAGE_TYPE,
}

/** Every page gets the ball. Nothing else is implicit. */
const BRAND_BASELINE: SurfaceAllowance = { kinds: ['brand-fab'] }

/**
 * The surfaces that belong on one page.
 *
 * Unknown platforms answer with the ball alone rather than with a guess: a
 * surface that appears where nobody asked for it is worse than one that is
 * missing, because the user cannot turn it off.
 *
 * @param facts the page's platform, page type, and (optionally) path
 */
export function surfaceAllowanceFor(facts: SurfacePageFacts): SurfaceAllowance {
  if (BRAND_ONLY_PLATFORMS.includes(facts.platform)) return BRAND_BASELINE
  const byPage = ALLOWANCE_BY_PLATFORM[facts.platform]
  if (byPage === undefined) return BRAND_BASELINE
  if (facts.platform === 'tiktok') {
    const path = (facts.pathname ?? '').toLowerCase()
    const rule = TIKTOK_PATH_RULES.find((candidate) => candidate.matches(path))
    if (rule !== undefined) return rule.allowance
  }
  return byPage[facts.pageType] ?? BRAND_BASELINE
}

/** Whether one kind belongs on this page. */
export function surfaceAllowed(facts: SurfacePageFacts, kind: SurfaceKind): boolean {
  return surfaceAllowanceFor(facts).kinds.includes(kind)
}

/** The placement override a page declares for one kind, if any. */
export function surfaceOverrideFor(
  facts: SurfacePageFacts,
  kind: SurfaceKind,
): SurfaceOverride | undefined {
  return surfaceAllowanceFor(facts).overrides?.[kind]
}

/**
 * The media-trigger descriptor for a page.
 *
 * Returns `null` when the kind does not belong on this page at all, so a caller
 * mounts by asking once instead of checking the gate and then the overrides. The
 * `reveal` value is the product rule the user confirmed: nothing is on screen
 * until the pointer rests on the work.
 *
 * @param facts the page's platform and page type
 */
export function mediaTriggerFor(facts: SurfacePageFacts): SurfaceDescriptor | null {
  if (!surfaceAllowed(facts, 'media-trigger')) return null
  const override = surfaceOverrideFor(facts, 'media-trigger')
  return {
    kind: 'media-trigger',
    size: { preset: override?.sizePreset ?? 'md', px: override?.sizePx },
    reveal: 'hover-container',
    expand: 'hover-self',
    placement: { strategy: 'container-corner', corner: override?.corner ?? 'top-right' },
  }
}

/**
 * The scene-trigger descriptor for a page, or `null` when it has none.
 *
 * The descriptor carries no geometry of its own: a scene mark positions itself
 * from the platform anchor chain, which is the layer that already measures the
 * rail and survives the desktop/portrait layout split.
 */
export function sceneTriggerFor(facts: SurfacePageFacts): SurfaceDescriptor | null {
  if (!surfaceAllowed(facts, 'scene-fixed')) return null
  return {
    kind: 'scene-fixed',
    size: { preset: 'md' },
    reveal: 'always',
    expand: 'hover-self',
    placement: { strategy: 'anchor', mark: 'scene' },
  }
}
