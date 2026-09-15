/**
 * The platforms this extension adapts to, and everything it knows about each one.
 *
 * This module is the single answer to "what platform is this, and what does that
 * platform mean for the extension". It is pure data plus pure lookups: no DOM is
 * touched at module scope and no `content/**` behaviour is imported, so the
 * background worker can resolve a platform from a URL without pulling the
 * content graph in behind it.
 *
 * Every field here used to be its own `if (platform === …)` chain somewhere in
 * the tree — host detection in seven places, display names in three, page types
 * in five, anchor geometry in three. Adding a platform meant finding all of them.
 * It now means appending one entry.
 *
 * Two fields are declared here but not yet consumed by this stage: `pageTypes`
 * (`detectPageType` reads it, the page sensor still owns its own copy) and
 * `inputSelectors` (`dom-fill.ts` still owns its own `SELECTOR_REGISTRY`). They
 * are recorded now because the entry is the contract a platform is added
 * against; converging the existing callers onto them is the next stage.
 *
 * The brand drawings are *not* declared here — they are read from
 * `panel/platform-marks.ts`, which documents itself as the only owner of that
 * data so a second copy cannot drift. That module imports nothing, so reusing it
 * keeps this file's "no DOM, background-importable" property intact.
 *
 * @module
 */

import { PLATFORM_GLYPHS } from '../panel/platform-marks.ts'
import type { AnchorLayout } from './anchor.ts'

/**
 * Platform vocabulary. Identical to the union `page-sensor` already publishes and
 * the panel already renders, so no value changes meaning.
 */
export type PlatformId = 'twitter' | 'tiktok' | 'zhihu' | 'wechat' | 'generic'

/** Page kinds inside one platform. Identical to `page-sensor`'s vocabulary. */
export type PageType = 'home' | 'profile' | 'status' | 'detail' | 'article' | 'unknown'

/** What a page-type rule may read. */
export interface PageFacts {
  /** Normalised hostname: lowercased, leading `www.` stripped. */
  readonly host: string
  /** `location.pathname`, with the leading slash preserved. */
  readonly pathname: string
  /** The document, for rules that are only decided by what a page rendered. */
  readonly doc: Document
}

/** Returns the page type this rule recognises, or `null` to defer to the next rule. */
export type PageTypeRule = (facts: PageFacts) => PageType | null

/** A glyph the panel draws for a platform. */
export interface PlatformGlyph {
  readonly viewBox: string
  readonly path: string
}

/** A placement rule that needs nothing beyond the mark's own box. */
export type SimpleAnchorStrategy =
  | 'avatar-above'
  | 'side-rail-parking'
  | 'viewport-corner-left'
  | 'viewport-corner-right'

/** A placement rule that stacks the mark above an element the page already renders. */
export interface StackAboveStep {
  readonly strategy: 'stack-above'
  /** Candidate elements, most specific first; the first measurable one answers. */
  readonly selectors: readonly string[]
  /** How many mark-sized slots above that element the mark sits (1 = directly above). */
  readonly rank: number
  /** Gap kept between the mark's bottom edge and whatever is directly below it. */
  readonly gapPx: number
}

/** One step of a placement chain; `null` from a step means "try the next one". */
export type AnchorStep = SimpleAnchorStrategy | StackAboveStep

/** A platform's declared steps for one mark in one layout. */
export type AnchorChain = readonly AnchorStep[]

/** Which step answered. Diagnostics and tests only; never rendered. */
export type AnchorSource = SimpleAnchorStrategy | 'stack-above'

/**
 * One chain per layout, with a `default` for layouts that have no entry.
 *
 * `default` is not a fallback for a mistake: `unknown` is a legal layout (a page
 * with no side rail to identify), and it needs an answer as much as the other one
 * does.
 */
export interface AnchorChainByLayout {
  readonly default: AnchorChain
  readonly byLayout?: Partial<Record<AnchorLayout, AnchorChain>>
}

/** The marks this extension places on a page. */
export type AnchorMark = 'brand' | 'scene'

/** Where one platform's marks belong. */
export interface AnchorSpec {
  /** The always-on brand mark: the draggable FAB and its X drawer column. */
  readonly brand: AnchorChainByLayout
  /** The scene shortcut trigger; `null` when this platform has none. */
  readonly scene: AnchorChainByLayout | null
}

/** One platform's whole adaptation surface. */
export interface PlatformEntry {
  readonly id: PlatformId

  /**
   * Panel display names. `full` is what the page context reports; `short` is the
   * tight form a chip can carry. Both existing strings are preserved verbatim so
   * this field removes the conflict without changing any copy.
   */
  readonly label: { readonly full: string; readonly short: string }

  /**
   * Registrable host suffixes this platform owns. Matched as
   * `host === suffix || host.endsWith('.' + suffix)` against a normalised host:
   * subdomains are included, and `notx.com` is not X.
   */
  readonly hosts: readonly string[]

  /** Page-type rules, most specific first. `null` from every rule means `'unknown'`. */
  readonly pageTypes: readonly PageTypeRule[]

  /** Glyph for the panel. Never falls back to X; see the `generic` entry. */
  readonly glyph: PlatformGlyph

  /**
   * Input-field selectors for `dom-fill`, most specific first. The `generic`
   * entry's list is always appended by the caller, so `generic` is mandatory.
   */
  readonly inputSelectors: readonly string[]

  /** Where this platform's marks belong. */
  readonly anchor: AnchorSpec
}

/** Reserved first segments that name an X route rather than a handle. */
const X_RESERVED_SEGMENTS = [
  'home',
  'explore',
  'notifications',
  'messages',
  'settings',
  'i',
  'compose',
  'search',
  'tos',
  'privacy',
  'logout',
]

/** X profile tab suffixes: `/<handle>/<tab>` is still the handle's page. */
const X_PROFILE_TABS = ['with_replies', 'highlights', 'media', 'likes']

/** Path segments of a pathname, empty ones dropped. */
function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/**
 * X's page types, most specific first.
 *
 * @param facts
 */
function twitterPageType(facts: PageFacts): PageType | null {
  const { pathname } = facts
  if (pathname.includes('/status/')) return 'status'
  if (pathname === '/home' || pathname === '/' || pathname === '') return 'home'
  if (pathname.startsWith('/i/articles')) return 'article'
  const segments = segmentsOf(pathname)
  if (segments.length === 1 && !X_RESERVED_SEGMENTS.includes(segments[0].toLowerCase())) return 'profile'
  if (segments.length === 2 && X_PROFILE_TABS.includes(segments[1])) return 'profile'
  return null
}

/**
 * TikTok's page types.
 *
 * @param facts
 */
function tiktokPageType(facts: PageFacts): PageType | null {
  const { pathname } = facts
  if (pathname.includes('/video/') || pathname.includes('/photo/')) return 'detail'
  if (pathname.includes('/@') && !pathname.includes('/video/')) return 'profile'
  if (pathname === '/' || pathname === '' || pathname.includes('/foryou') || pathname.includes('/explore')) return 'home'
  return null
}

/**
 * Zhihu's page types. Always answers: everything that is not a question, a post
 * or a home page on Zhihu is an article.
 *
 * @param facts
 */
function zhihuPageType(facts: PageFacts): PageType {
  const { pathname } = facts
  if (pathname.includes('/question/') || pathname.includes('/p/')) return 'status'
  if (pathname.includes('/people/')) return 'profile'
  if (pathname === '/' || pathname === '') return 'home'
  return 'article'
}

/**
 * WeChat article pages.
 *
 * The path carries the article id only on the legacy route; the modern route is
 * a bare `/s` with the id in the query, and the share pages that rewrite the
 * address still render the article title node. Both are read, because either one
 * alone loses a real page.
 *
 * @param facts
 */
function wechatPageType(facts: PageFacts): PageType | null {
  if (facts.pathname.includes('/s')) return 'article'
  if (facts.doc.getElementById('activity-name') !== null) return 'article'
  return null
}

/**
 * A page nobody claimed: a main content region is an article, a site root is a
 * home page, anything else stays unknown rather than guessed.
 *
 * @param facts
 */
function genericPageType(facts: PageFacts): PageType | null {
  if (facts.doc.querySelector('article, .post-content, main') !== null) return 'article'
  if (facts.pathname === '/' || facts.pathname === '') return 'home'
  return null
}

/** Input fields the fill engine may write into on X. */
const TWITTER_INPUTS = [
  '[data-testid="tweetTextarea_0"]',
  '[data-testid="tweetTextarea_0_label"] div[role="textbox"]',
  '[data-testid="dm-composer-textarea"]',
  'div[data-testid^="tweetTextarea"]',
  'div[role="textbox"][contenteditable="true"]',
  'textarea[data-testid="tweetTextarea_0"]',
  'textarea',
]

/** Input fields the fill engine may write into on TikTok. */
const TIKTOK_INPUTS = [
  'div[data-e2e="comment-input"] [contenteditable="true"]',
  'div[data-e2e="comment-input"] textarea',
  'div[contenteditable="true"][data-placeholder]',
  'div[role="textbox"][contenteditable="true"]',
  'textarea[placeholder*="comment" i]',
  'textarea[placeholder*="评论" i]',
  'textarea',
]

/**
 * Input fields any site offers. Appended by the caller on every platform, so it
 * must stay the last word rather than the only word.
 */
const GENERIC_INPUTS = [
  'div[contenteditable="true"]:focus',
  'textarea:focus',
  'div[role="textbox"][contenteditable="true"]',
  'div[contenteditable="true"]',
  'textarea[name*="comment" i]',
  'textarea[name*="reply" i]',
  'textarea',
]

/**
 * The drawing for sites with no brand of their own.
 *
 * Zhihu and WeChat are detected platforms with no checked drawing yet. They are
 * pointed at the web mark *explicitly, here* — not left to a fallback — because
 * "we have no logo for this" must be a decision in the table, not an accident of
 * a missing key.
 */
const WEB_GLYPH: PlatformGlyph = PLATFORM_GLYPHS.generic

/**
 * X (formerly Twitter).
 *
 * The brand chain is the drawer column: the mark stacks itself above the Grok
 * drawer when it is open, then above the chat drawer, and otherwise parks in the
 * lower-right corner. The two `stack-above` steps reproduce the geometry this
 * feature shipped with, pixel for pixel — `rank` and `gapPx` are the whole of it.
 */
const TWITTER_ENTRY: PlatformEntry = {
  id: 'twitter',
  label: { full: 'X (formerly Twitter)', short: 'X' },
  hosts: ['x.com', 'twitter.com'],
  pageTypes: [twitterPageType],
  glyph: PLATFORM_GLYPHS.twitter,
  inputSelectors: TWITTER_INPUTS,
  anchor: {
    brand: {
      default: [
        { strategy: 'stack-above', selectors: ['[data-testid="GrokDrawerHeader"]'], rank: 1, gapPx: 12 },
        { strategy: 'stack-above', selectors: ['[data-testid="chat-drawer-main"]'], rank: 2, gapPx: 12 },
        'viewport-corner-right',
      ],
    },
    scene: null,
  },
}

/**
 * TikTok.
 *
 * The scene trigger has one target and one answer: directly above the signed-in
 * avatar. The chain is therefore the same in both layouts — the desktop page puts
 * that avatar at the foot of the left navigation rail, the portrait page puts it
 * in the right-hand action bar, and the anchor layer finds it either way.
 *
 * What the layout key still decides is the fallback, and only that: a rail page
 * with no readable avatar parks where the avatar would have been, while a page
 * that identified itself as neither parks in the lower-left corner. Both values
 * are the ones this feature shipped with.
 *
 * The brand chain does *not* vary by layout: the FAB keeps the lower-right corner
 * it has always had. Reading the trigger's position from the light DOM is not
 * possible — its host is a 0x0 positioned container (`tiktok-scene/menu.ts`), so a
 * `stack-above` step on it could never fire.
 */
const TIKTOK_ENTRY: PlatformEntry = {
  id: 'tiktok',
  label: { full: 'TikTok', short: 'TT' },
  hosts: ['tiktok.com'],
  pageTypes: [tiktokPageType],
  glyph: PLATFORM_GLYPHS.tiktok,
  inputSelectors: TIKTOK_INPUTS,
  anchor: {
    brand: { default: ['viewport-corner-right'] },
    scene: {
      default: ['avatar-above', 'viewport-corner-left'],
      byLayout: {
        'side-rail': ['avatar-above', 'side-rail-parking'],
      },
    },
  },
}

/** Zhihu: identity only. No scene trigger, no dedicated drawing, corner-parked. */
const ZHIHU_ENTRY: PlatformEntry = {
  id: 'zhihu',
  label: { full: '知乎 · Zhihu', short: '知乎' },
  hosts: ['zhihu.com'],
  pageTypes: [zhihuPageType],
  glyph: WEB_GLYPH,
  inputSelectors: GENERIC_INPUTS,
  anchor: { brand: { default: ['viewport-corner-right'] }, scene: null },
}

/** WeChat official-account articles: identity only, same shape as Zhihu. */
const WECHAT_ENTRY: PlatformEntry = {
  id: 'wechat',
  label: { full: '微信公众号', short: '公众号' },
  hosts: ['weixin.qq.com', 'mp.weixin.qq.com'],
  pageTypes: [wechatPageType],
  glyph: WEB_GLYPH,
  inputSelectors: GENERIC_INPUTS,
  anchor: { brand: { default: ['viewport-corner-right'] }, scene: null },
}

/**
 * Anything else.
 *
 * Always present, never matched by host: `dom-fill` dereferences the generic
 * list unconditionally, so a missing entry would be a throw rather than a
 * degraded render.
 */
const GENERIC_ENTRY: PlatformEntry = {
  id: 'generic',
  label: { full: 'Web', short: 'Web' },
  hosts: [],
  pageTypes: [genericPageType],
  glyph: WEB_GLYPH,
  inputSelectors: GENERIC_INPUTS,
  anchor: { brand: { default: ['viewport-corner-right'] }, scene: null },
}

/**
 * Every platform this extension adapts to. Exactly one entry per `PlatformId`,
 * and `generic` is last because it is the entry nothing matches its way to.
 */
export const PLATFORM_REGISTRY: readonly PlatformEntry[] = [
  TWITTER_ENTRY,
  TIKTOK_ENTRY,
  ZHIHU_ENTRY,
  WECHAT_ENTRY,
  GENERIC_ENTRY,
]

/**
 * Normalise a hostname so two spellings of the same site compare equal.
 *
 * @param host raw `location.hostname`, or a host parsed from a URL
 * @returns the lowercased host with one leading `www.` removed
 */
export function normalizePlatformHost(host: string): string {
  const lower = host.trim().toLowerCase()
  return lower.startsWith('www.') ? lower.slice(4) : lower
}

/**
 * Whether a normalised host belongs to a suffix.
 *
 * The dot matters: `endsWith(suffix)` alone would hand `nottiktok.com` to
 * TikTok, and a page controls its own hostname.
 * @param host normalised hostname
 * @param suffix registrable suffix from an entry
 */
function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`)
}

/**
 * The entry that owns a host, or the generic entry.
 *
 * @param hostname raw `location.hostname`, or a host parsed from a URL
 */
export function platformForHost(hostname: string): PlatformEntry {
  const host = normalizePlatformHost(hostname)
  for (const entry of PLATFORM_REGISTRY) {
    for (const suffix of entry.hosts) {
      if (hostMatches(host, suffix)) return entry
    }
  }
  return GENERIC_ENTRY
}

/** The entry for a known id. */
export function platformById(id: PlatformId): PlatformEntry {
  const found = PLATFORM_REGISTRY.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`unknown platform id: ${id}`)
  return found
}

/**
 * Page type for one platform on one page, or `'unknown'` when no rule claims it.
 *
 * @param entry the platform, as resolved from the host
 * @param pathname `location.pathname`
 * @param doc the document, for rules decided by what the page rendered
 */
export function detectPageType(entry: PlatformEntry, pathname: string, doc: Document): PageType {
  const facts: PageFacts = { host: entry.hosts[0] ?? '', pathname, doc }
  for (const rule of entry.pageTypes) {
    const answer = rule(facts)
    if (answer !== null) return answer
  }
  return 'unknown'
}

/**
 * The chain a platform declares for one mark in one layout.
 *
 * @param spec the platform's anchor spec
 * @param mark which of the platform's marks is being placed
 * @param layout the layout the page was read as
 * @returns the declared chain, or `null` when this platform has no such mark at all
 */
export function anchorChainFor(
  spec: AnchorSpec,
  mark: AnchorMark,
  layout: AnchorLayout,
): AnchorChain | null {
  const byLayout = mark === 'brand' ? spec.brand : spec.scene
  if (byLayout === null) return null
  return byLayout.byLayout?.[layout] ?? byLayout.default
}
