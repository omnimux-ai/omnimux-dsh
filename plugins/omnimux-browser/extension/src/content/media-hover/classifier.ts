/**
 * Post & work media classifier: is this element a creative asset, or page chrome?
 *
 * The hover capsule is offered for *posts*: a photo, a design draft, a video —
 * something a user would want to keep, copy or attach. It must not be offered for
 * the avatar beside a comment, the magnifier in the search bar, a brand badge, or
 * the decorative banner in a page footer.
 *
 * Rendered size alone cannot make that distinction: a 48px profile picture and a
 * 96px reaction sticker both clear the detector's `>= 40px` floor, and a 160px
 * author avatar clears any floor a post image would also clear. The decision
 * therefore reads *context* — the element's own naming, the region it sits in,
 * and the platform-shaped containers around it.
 *
 * The rule is one hard gate with two sides around it:
 *
 * - The **size gate** runs ahead of every context rule. No branch — a status, a
 *   platform feed card, an article — may admit media that is not laid out at post
 *   size, because a 168x94 sidebar thumbnail is a sidebar thumbnail wherever it
 *   happens to be embedded.
 * - {@link isExcludedRegionElement} is the **blacklist** and runs next, because a
 *   creator surface never lives inside `<nav>`, `<header>` or `<footer>`, and an
 *   avatar stays an avatar however large it renders.
 * - The **allowlist** then has to admit the element: a known status media
 *   container, a known platform feed card, or a work-shaped element on an
 *   ordinary page. Nothing is admitted by default.
 *
 * @module
 */

import { mediaKindOf, measureElement } from './payload.ts'

/**
 * Minimum rendered edge length, in CSS pixels, for an image to count as a post.
 *
 * Higher than the detector's `>= 40px` floor on purpose. Feed photos, design
 * drafts and thumbnails are laid out at 160px and above; avatars, emoji, icons
 * and badges live below 120px. Keeping the thresholds separate lets the detector
 * stay permissive about what it can *see* while this layer stays strict about
 * what it will *offer*.
 */
export const MIN_POST_MEDIA_SIZE_PX = 120

/**
 * How far the auxiliary ancestor walk climbs before giving up.
 *
 * Applies to the auxiliary regions only: a header, nav or footer is found by
 * `closest` and is therefore never out of reach.
 */
const ANCESTOR_DEPTH = 24

/**
 * Naming rules for media that is never creative content.
 *
 * Matched case-insensitively as a substring against the element's role-naming
 * attributes — `class`, `id` and `data-testid` — and, through the narrower
 * {@link ALT_TITLE_KEYWORDS}, against `alt` and `title`. Every entry is a word a
 * page uses to name the thing itself, so a post image — whose alt text describes
 * its subject — does not collide with any of them.
 */
export const CHROME_KEYWORDS: readonly string[] = [
  // Identity: a face that represents an account, not a work.
  'avatar',
  'userpic',
  'user-pic',
  'user-photo',
  'user-profile',
  'profile-photo',
  'profile-picture',
  'profile-avatar',
  'gravatar',
  'author-image',
  'authorimg',
  'byline',
  'handle',
  // Chinese surfaces name the same things in their own words; a bilingual page
  // may label an identity image only in `alt` or `title`.
  '头像',
  '图标',
  '标志',
  '徽标',
  '表情',
  '水印',
  '分隔',
  // Controls, marks and decoration.
  'icon',
  'logo',
  'badge',
  'emoji',
  'emoticon',
  'reaction',
  'verified',
  'spinner',
  'loading',
  'placeholder',
  'favicon',
  'sprite',
  'separator',
  'divider',
  'watermark',
  'qrcode',
]

/**
 * Naming rules for the *descriptive* attributes, `alt` and `title`.
 *
 * A class or an id names the widget; `alt` and `title` describe what the picture
 * *shows* — "logo设计作品", "reaction视频封面". Reading the full
 * {@link CHROME_KEYWORDS} list against those two attributes killed legitimate
 * work images whose description merely contained a role word, so only the words
 * that name an identity or a UI mark outright are read from them.
 */
export const ALT_TITLE_KEYWORDS: readonly string[] = [
  // Identity: a face that represents an account, not a work.
  'avatar',
  'userpic',
  'user-pic',
  'user-photo',
  'user-profile',
  'profile-photo',
  'profile-picture',
  'profile-avatar',
  'gravatar',
  'author-image',
  'authorimg',
  'byline',
  'handle',
  '头像',
  '图标',
  '标志',
  '徽标',
  '表情',
  '水印',
  '分隔',
  // Controls, marks and decoration.
  'icon',
  'badge',
  'emoji',
  'emoticon',
  'verified',
  'spinner',
  'loading',
  'placeholder',
  'favicon',
  'sprite',
  'separator',
  'divider',
  'watermark',
  'qrcode',
]

/**
 * Naming rules for *containers* that hold creative work.
 *
 * Matched case-insensitively against a container's `class` / `id` / `data-testid`.
 */
const WORK_CONTAINER_KEYWORDS: readonly string[] = [
  'tweet',
  'note-item',
  'feed',
  'post',
  'article',
  'work',
  'entry',
  'gallery',
  'card',
]

/**
 * Naming rules for the media *element* itself on a creator surface.
 *
 * Kept apart from the container list because the two answer different questions:
 * a container named `card` is a work card, while an image named `thumbnail` is a
 * work image. Mixed into one list, an element-level word could wrongly promote
 * its container.
 */
const WORK_MEDIA_KEYWORDS: readonly string[] = [
  'tweetphoto',
  'tweet-image',
  'videocomponent',
  'video-player',
  'player',
  'thumbnail',
  'thumb',
  'photo',
  'cover',
  'shot',
  'frame',
]

/**
 * Skeleton regions whose media is chrome by construction.
 *
 * A creator surface is never *inside* navigation, a page header or a page footer,
 * so anything found there is page furniture regardless of how large it renders.
 * These are queried with `closest`, which is not depth-limited — see
 * {@link isInsideSkeletonRegion}.
 */
const SKELETON_REGION_SELECTOR = [
  'header',
  'nav',
  'footer',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="contentinfo"]',
].join(', ')

/**
 * Regions that are chrome for the same reason but sit inside the content column.
 *
 * Found by the bounded walk in {@link isInsideAuxiliaryRegion}: a search box, a
 * toolbar or a dialog is reached within a few levels of the media it wraps,
 * unlike a site footer that a template may nest dozens of levels up.
 */
const AUXILIARY_REGION_SELECTOR = [
  '[role="search"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="toolbar"]',
  '[role="dialog"]',
  '[aria-hidden="true"]',
].join(', ')

/**
 * Attribute names read by the role-naming rules.
 *
 * `class` carries the bulk of the signal on ordinary pages; `id` and
 * `data-testid` carry it on component-driven platforms.
 */
const ROLE_ATTRIBUTES: readonly string[] = ['class', 'id', 'data-testid']

/**
 * Attribute names that describe the media itself rather than naming its role.
 *
 * Read against the narrower {@link ALT_TITLE_KEYWORDS} list, never the full
 * chrome list.
 */
const DESCRIPTIVE_ATTRIBUTES: readonly string[] = ['alt', 'title']

/** Test ids and classes that wrap an account identity rather than a work. */
const AVATAR_ANCESTOR_SELECTOR = [
  '[data-testid*="avatar" i]',
  '[data-testid*="user-name" i]',
  '[class*="avatar" i]',
  '[class*="userpic" i]',
  '[class*="user-pic" i]',
  '[class*="gravatar" i]',
  '[class*="user-name" i]',
  '[class*="username" i]',
  '[class*="touxiang" i]',
].join(', ')

/** Containers that mark creative work on an ordinary page. */
const WORK_CONTAINER_SELECTOR = [
  'article',
  '[role="article"]',
  '.post',
  '.posts',
  '.article',
  '.article-content',
  '.entry-content',
  '.post-content',
  '.work',
  '.works',
  '.note',
  '.notes',
  '.feed',
  '.card',
  '.grid-item',
  '[data-testid="tweet"]',
  '[data-testid="tweetPhoto"]',
  '[data-testid="videoComponent"]',
  '[data-testid="videoPlayer"]',
].join(', ')

/**
 * The status root of an X/Twitter post, in the shapes the site ships.
 *
 * Used as the *scope* of the status rule, never as evidence for it: everything
 * inside a status is judged by {@link TWEET_MEDIA_SELECTOR} alone.
 */
const TWEET_ROOT_SELECTOR = 'article[data-testid="tweet"], [data-testid="tweet"]'

/** The status containers that carry a tweet's photo or player, and nothing else. */
const TWEET_MEDIA_SELECTOR = [
  '[data-testid="tweetPhoto"]',
  '[data-testid="videoComponent"]',
  '[data-testid="videoPlayer"]',
].join(', ')

/** Avatar wrappers inside a status, checked before the status itself admits it. */
const TWEET_AVATAR_SELECTOR = [
  '[data-testid*="avatar" i]',
  '[class*="avatar" i]',
  '[data-testid*="user-name" i]',
].join(', ')

/**
 * Hosts whose cards are creative work by construction.
 *
 * Consulted only when the page actually belongs to that host, so an unrelated
 * site cannot borrow a class name and be admitted. X/Twitter is deliberately
 * absent: its status markup holds an avatar, a display name and a verification
 * badge beside the media, so the status root is not evidence of anything — its
 * own media containers are, and {@link isTweetContext} reads those exclusively.
 */
const WORK_CARD_SELECTOR: Readonly<Record<string, string>> = {
  'xiaohongshu.com': '.note-item, [class*="note-item" i]',
  'weibo.com': '.card-wrap, [class*="Feed_wrap"]',
  'tiktok.com': '[data-e2e="recommend-list-item-container"], [data-e2e="user-post-item"]',
  'youtube.com': 'ytd-rich-item-renderer, ytd-video-renderer, ytd-watch-flexy, ytd-shorts',
  'bilibili.com': '.bili-video-card, .video-card, .small-item, .bili-dyn-item, #bilibili-player',
  'instagram.com': 'article, [role="presentation"]',
}

/** Hosts that ship the status markup {@link TWEET_ROOT_SELECTOR} describes. */
const TWEET_HOSTS: readonly string[] = ['x.com', 'twitter.com']

/**
 * Whether this element should be offered a hover capsule at all.
 *
 * @param element - The `<img>` or `<video>` the pointer resolved to.
 * @param host - Page host used for the platform-card rules. Defaults to the live
 *   document's host; injectable so the rule stays testable and pure.
 * @returns `true` only when the element is a post or work asset on a page.
 */
export function isPostOrWorkMedia(element: Element, host: string = currentHost()): boolean {
  if (mediaKindOf(element) === null) return false
  // The hard gate, ahead of every context rule below. No branch — status,
  // platform card, article — may admit media that is not laid out at post size,
  // so a 168x94 sidebar thumbnail inside a status's photo container is rejected
  // by exactly the same rule that rejects it on an ordinary page.
  if (!satisfiesSizeFloor(element)) return false
  if (isExcludedRegionElement(element)) return false
  return admitsByContext(element, host)
}

/**
 * The blacklist: the element's own naming, the region it sits in, and the avatar
 * wrappers around it.
 *
 * The naming half reads only the element. A post image inside
 * `<div class="post-card">` must not be rejected for a class its container
 * carries, while the region half still walks up — which is what makes
 * `<header class="post-header">` reject everything below it.
 */
export function isExcludedRegionElement(element: Element): boolean {
  if (matchesChromeKeyword(element)) return true
  if (isInsideChromeRegion(element)) return true
  return element.closest(AVATAR_ANCESTOR_SELECTOR) !== null
}

/** Whether the element's own naming marks it as chrome. */
function matchesChromeKeyword(element: Element): boolean {
  return matchesAnyKeyword(element, CHROME_KEYWORDS)
}

/**
 * Whether the element sits inside a region that never holds a creator surface.
 *
 * The skeleton half is a `closest` query, and that is deliberate: a walk bounded
 * by {@link ANCESTOR_DEPTH} let a footer buried 26 levels above the image admit
 * it again. `closest` has no depth limit, so the region decides however deeply a
 * template nests its markup.
 */
function isInsideChromeRegion(element: Element): boolean {
  if (isInsideSkeletonRegion(element)) return true
  return isInsideAuxiliaryRegion(element)
}

/**
 * Whether a header, nav or footer encloses the element.
 *
 * `closest` does not cross shadow boundaries, so the query restarts from the
 * host of each shadow root on the way out: an image inside a web component has
 * no `parentElement` path back to the document, which would hide the region it
 * actually sits in.
 */
function isInsideSkeletonRegion(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = shadowHostOf(node)) {
    if (node.closest(SKELETON_REGION_SELECTOR) !== null) return true
  }
  return false
}

/**
 * Whether the element sits inside one of the auxiliary chrome regions.
 *
 * The walk stops at `<body>`: judging a page by its own `<body>` class would let
 * a theme name like `has-icon-font` silence the feature everywhere.
 */
function isInsideAuxiliaryRegion(element: Element): boolean {
  let node: Element | null = element
  for (let depth = 0; node !== null && depth < ANCESTOR_DEPTH; depth += 1) {
    if (node.localName === 'html' || node.localName === 'body') return false
    if (node.matches(AUXILIARY_REGION_SELECTOR)) return true
    node = parentOf(node)
  }
  return false
}

/**
 * The allowlist: a known X/Twitter status media container, a known platform work
 * card, or a work-shaped container on an ordinary page.
 *
 * A status is checked first and *exclusively*: on X/Twitter the status root
 * admits nothing on its own, so the rules below never get to widen it.
 *
 * @param element - An element already cleared by the size gate and the blacklist.
 * @param host - Page host, already normalised by {@link currentHost}.
 */
function admitsByContext(element: Element, host: string): boolean {
  if (isTweetContext(element, host)) return isTweetMedia(element)
  if (isPlatformWorkCard(element, host)) return true
  return isWorkContainerMedia(element)
}

/**
 * Whether the element sits inside an X/Twitter status, on a host that ships one.
 *
 * @param element - The media element.
 * @param host - Page host.
 */
function isTweetContext(element: Element, host: string): boolean {
  if (!matchesHost(host, TWEET_HOSTS)) return false
  return element.closest(TWEET_ROOT_SELECTOR) !== null
}

/**
 * X/Twitter: the status's own photo or player container, and nothing else.
 *
 * A status is a rich component — avatar, display name, verification badge, emoji,
 * card thumbnail, and on a picture-profile status a full-size portrait — so "it
 * lives inside a tweet" is far too broad a rule. Membership of
 * `[data-testid="tweetPhoto"]`, `[data-testid="videoComponent"]` or
 * `[data-testid="videoPlayer"]` is the only evidence accepted; the status root
 * is a fallback for nothing.
 */
function isTweetMedia(element: Element): boolean {
  if (element.closest(TWEET_AVATAR_SELECTOR) !== null) return false
  return element.closest(TWEET_MEDIA_SELECTOR) !== null
}

/** Whether the element sits inside a feed card on a platform whose cards are work. */
function isPlatformWorkCard(element: Element, host: string): boolean {
  for (const [domain, selector] of Object.entries(WORK_CARD_SELECTOR)) {
    if (!matchesHost(host, [domain])) continue
    if (element.closest(selector) !== null) return true
  }
  return false
}

/** Whether `host` is one of `domains`, or a subdomain of one. */
function matchesHost(host: string, domains: readonly string[]): boolean {
  if (host === '') return false
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

/**
 * Ordinary pages: a work-shaped container or a work-shaped media element, plus a
 * size that only content-sized media reaches.
 *
 * The size half is not optional. The container check alone would admit a
 * decorative banner that a template happened to wrap in `<article>`; the size
 * check alone would admit the 160px author avatar that made this classifier
 * necessary.
 */
function isWorkContainerMedia(element: Element): boolean {
  const anchor = element.closest(WORK_CONTAINER_SELECTOR)
  if (anchor === null) return false
  if (!isWorkContainerNamed(anchor) && !isWorkElementNamed(element)) return false
  return satisfiesSizeFloor(element)
}

/**
 * Whether the element's rendered size is one a post or a work is laid out at.
 *
 * The floor applies to images and videos alike: it is a statement about media
 * size, not about tags, and a player embedded below 120px is a control-sized
 * decoration rather than something a user would keep, copy or attach.
 */
function satisfiesSizeFloor(element: Element): boolean {
  const metric = measureElement(element)
  return metric.width >= MIN_POST_MEDIA_SIZE_PX && metric.height >= MIN_POST_MEDIA_SIZE_PX
}

/** Whether a container's own naming marks it as a work or feed card. */
function isWorkContainerNamed(container: Element): boolean {
  if (matchesAnyKeyword(container, WORK_CONTAINER_KEYWORDS)) return true
  return container.matches('article, [role="article"]')
}

/** Whether the media element's own naming marks it as a work image or player. */
function isWorkElementNamed(element: Element): boolean {
  return matchesAnyKeyword(element, WORK_MEDIA_KEYWORDS)
}

/**
 * Whether any role-naming attribute of an element contains one of `keywords`, or
 * one of its descriptive attributes names an identity or a UI mark.
 *
 * The two attribute families are read against different lists on purpose: a
 * `class` of `logo` declares the element *is* a logo, while an `alt` of
 * "logo设计作品" describes what the picture shows.
 */
function matchesAnyKeyword(element: Element, keywords: readonly string[]): boolean {
  if (matchesIn(element, ROLE_ATTRIBUTES, keywords)) return true
  return matchesIn(element, DESCRIPTIVE_ATTRIBUTES, ALT_TITLE_KEYWORDS)
}

/** Whether any of `attributes` on `element` contains one of `keywords`. */
function matchesIn(
  element: Element,
  attributes: readonly string[],
  keywords: readonly string[],
): boolean {
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute)
    if (value === null) continue
    const haystack = value.toLowerCase()
    if (keywords.some((keyword) => haystack.includes(keyword))) return true
  }
  return false
}

/** The registrable host of the live page, or `''` outside a document. */
function currentHost(): string {
  if (typeof globalThis.location === 'undefined') return ''
  return normalizeHost(globalThis.location.hostname)
}

/**
 * Strips the `www.` prefix from a host.
 *
 * Exported because the detector normalises the host it reads from its own
 * environment with the same rule: two spellings of the same host must not reach
 * two different platform verdicts.
 */
export function normalizeHost(hostname: string): string {
  const host = (hostname || '').toLowerCase()
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * The parent of a node, crossing shadow boundaries.
 *
 * An image inside a web component has no `parentElement` path back to the
 * document, which would hide the region it actually sits in.
 */
function parentOf(node: Element): Element | null {
  const parent = node.parentElement
  if (parent !== null) return parent
  return shadowHostOf(node)
}

/** The host element of the shadow root `node` lives in, or `null` in the main tree. */
function shadowHostOf(node: Element): Element | null {
  const root = node.getRootNode()
  if (root instanceof ShadowRoot) return root.host
  return null
}

/**
 * Names the rule that admitted an element, for audits and diagnostics.
 *
 * @param element - The media element to describe.
 * @param host - Page host used for the platform-card rules; defaults to live.
 * @returns `excluded`, `tweet`, `platform-card`, `work-container`, or `unknown`.
 */
export function describePostMediaContext(element: Element, host: string = currentHost()): string {
  if (isExcludedRegionElement(element)) return 'excluded'
  if (isTweetContext(element, host)) return isTweetMedia(element) ? 'tweet' : 'excluded'
  if (isPlatformWorkCard(element, host)) return 'platform-card'
  if (element.closest(WORK_CONTAINER_SELECTOR) !== null) return 'work-container'
  return 'unknown'
}
