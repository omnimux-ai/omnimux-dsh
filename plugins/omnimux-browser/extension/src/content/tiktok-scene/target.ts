/**
 * Which post a TikTok shortcut acts on.
 *
 * The extension mounts one trigger per page, but the action always targets a
 * single post. TikTok keeps the address bar in step with the video the user is
 * watching — scrolling the For You feed rewrites the URL to that post's own
 * address — so a post address is the strongest signal and the profile grid is
 * the only case that needs a DOM hint.
 *
 * Layer rule: this module owns the decision and nothing else. It takes hrefs,
 * never a `Document`, which is what keeps the precedence testable without
 * pretending jsdom has TikTok's markup.
 *
 * @module
 */

/** The resolved post a shortcut will act on. */
export interface PostTarget {
  /** Canonical `https://www.tiktok.com/@user/video/<id>` address. */
  url: string
  postId: string
}

/** Everything the decision may consult, in precedence order. */
export interface TargetInput {
  /** The address the page is on right now. */
  pageUrl: string
  /** Post the pointer was last over, when the page is a profile grid. */
  hoveredHref?: string | null
  /** First post link found on the page, as the last DOM resort. */
  gridHref?: string | null
}

/** `tiktok.com` and its subdomains; lookalike hosts must not match. */
function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'tiktok.com' || host.endsWith('.tiktok.com')
}

/**
 * Read a post address out of an href.
 *
 * Photo posts share the address shape with videos and are accepted: TikTok
 * serves both from `/@user/(video|photo)/<id>`, and a photo post simply has no
 * direct stream for the export to find — a fact the host reports, not something
 * this function should pre-empt by hiding the shortcut.
 * @param href
 * @returns the canonical target, or `null` when the href is not a post
 */
export function matchPostTarget(href: string): PostTarget | null {
  let url: URL
  try {
    url = new URL(href, 'https://www.tiktok.com')
  } catch {
    return null
  }
  if (!isTikTokHost(url.hostname)) return null
  const match = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d{5,})/)
  if (match === null) return null
  return { url: `https://www.tiktok.com${match[0]}`, postId: match[1] }
}

/** The post id inside an address, or `null` when it carries none. */
export function postIdFromUrl(href: string): string | null {
  return matchPostTarget(href)?.postId ?? null
}

/**
 * The shareable, query-free address of a post.
 *
 * Trackers (`?is_from_webapp=1`) and share tokens (`?_r=1`) are stripped: the
 * host resolves the post from the path alone, and a canonical address is what
 * makes the library's de-duplication recognise the same post pasted twice.
 * @param href
 */
export function canonicalPostUrl(href: string): string | null {
  return matchPostTarget(href)?.url ?? null
}

/** Whether the address belongs to TikTok at all. */
function isTikTokPage(href: string): boolean {
  try {
    return isTikTokHost(new URL(href).hostname)
  } catch {
    return false
  }
}

/**
 * Choose the post the shortcuts act on.
 *
 * A post page always wins — that is the watched video and the user's evident
 * intent. On a profile grid there is no watched post, so the pointer's last
 * target wins over the first tile, which is the one the user was about to act
 * on when they reached for the trigger.
 *
 * The page's own host is checked first: the trigger is only mounted on TikTok,
 * but a decision function that could return a target while sitting on another
 * site is one refactor away from acting on the wrong page.
 * @param input
 * @returns the target, or `null` when this page offers no post to act on
 */
export function resolveTargetPost(input: TargetInput): PostTarget | null {
  if (!isTikTokPage(input.pageUrl)) return null
  const fromPage = matchPostTarget(input.pageUrl)
  if (fromPage !== null) return fromPage
  const fromHover = input.hoveredHref === undefined || input.hoveredHref === null
    ? null
    : matchPostTarget(input.hoveredHref)
  if (fromHover !== null) return fromHover
  const fromGrid = input.gridHref === undefined || input.gridHref === null
    ? null
    : matchPostTarget(input.gridHref)
  return fromGrid
}
