/**
 * Captures one X/Twitter post into the {@link TweetCapture} contract.
 *
 * The entry point takes the post's own `article` element, so the capture is
 * testable without a page: a caller resolves the element (the feed, the status
 * detail page, or a card trigger) and this module reads only inside it.
 *
 * Two rules shape every branch here:
 *
 * 1. **Absent means absent.** A counter the page did not render leaves its key
 *    out of `stats` instead of storing a zero. `extractViews` / `extractReplies`
 *    in the velocity module answer `0` for "not found", which is right for the
 *    exposure model they feed and wrong for a stored record, so this module
 *    reuses only their {@link parseMetricValue} and does its own presence test.
 * 2. **One element, one post.** A post nests another post (a quote), and the
 *    header nests the author's avatar. Every lookup therefore excludes the quote
 *    container and the avatar wrapper, and the post's own address comes from the
 *    timestamp link rather than the first `/status/` link in the subtree.
 *
 * @module
 */

import { TWEET_MEDIA_SELECTOR } from '../media-hover/classifier.ts'
import { extractTweetIdAndUrl, parseMetricValue } from '../twitter-velocity/extractor.ts'
import type { PollOption, QuotedTweet, TweetAuthor, TweetCapture, TweetPoll, TweetShape, TweetStats } from './types.ts'

/** Matches a permanent post address; anything else is not a capturable post. */
const STATUS_URL_RE = /\/status\/\d+/

/** Header carrying the author's display name, handle and timestamp. */
const USER_NAME_SELECTOR = '[data-testid="User-Name"]'

/**
 * The avatar wrapper.
 *
 * X suffixes this test id with the account handle (`UserAvatar-Container-kai`),
 * so an exact match finds nothing — measured on the live site: the exact
 * selector matched 0 of 18 avatars on a home feed.
 */
const AVATAR_SELECTOR = '[data-testid^="UserAvatar-Container"]'

/** Verification badge drawn next to the author's name. */
const VERIFIED_SELECTOR = '[data-testid="icon-verified"], [data-testid="verificationBadge"]'

/** The post body. */
const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'

/** The quoted post, in the shape the timeline ships. */
const QUOTE_SELECTOR = '[data-testid="quoteTweet"]'

/**
 * The quoted post in the shape the quote composer ships.
 *
 * `attachments` also wraps a post's own media in some layouts, so it only counts
 * as a quote container when it actually carries a post body.
 */
const ATTACHMENTS_SELECTOR = '[data-testid="attachments"]'

/** Poll container. */
const POLL_SELECTOR = '[data-testid="cardPoll"]'

/** One poll option row. */
const POLL_CHOICE_SELECTOR = '[data-testid="cardPollChoice"], [role="radio"]'

/** External-link preview container. */
const CARD_SELECTOR = '[data-testid="card.wrapper"]'

/** The "someone reposted" line, drawn above the post rather than inside it. */
const SOCIAL_CONTEXT_SELECTOR = '[data-testid="socialContext"]'

/** How many ancestor levels are searched for the repost line. */
const SOCIAL_CONTEXT_DEPTH = 3

/** Counter rows, with the wording each one carries in its accessible label. */
const COUNTERS: readonly { readonly key: keyof TweetStats, readonly testId: string, readonly label: RegExp }[] = [
  { key: 'likes', testId: 'like', label: /([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:喜欢|赞|likes?)/i },
  { key: 'shares', testId: 'retweet', label: /([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:转帖|转推|reposts?|retweets?)/i },
  { key: 'comments', testId: 'reply', label: /([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:回复|repl(?:y|ies))/i },
]

/** Views live on the analytics link and the action bar, not on a button. */
const VIEWS_RE = /([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:次查看|次观看|views?)/i

/** Trailing share a poll option row renders. */
const POLL_PCT_RE = /(\d+(?:[.,]\d+)?)\s*%/

/** Total vote count a poll renders. */
const POLL_VOTES_RE = /([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:票|votes?)/i

/** Remaining time a poll renders. */
const POLL_LEFT_RE = /(?:剩余|还剩|remaining)\s*([^\s|]+)|(\d+\s*(?:天|小时|分钟|days?|hours?|minutes?))/i

/**
 * The container holding the post this element is nested in, if any.
 *
 * The composer's quote card is the only case where the nested post arrives
 * wrapped in `attachments`, and that wrapper also appears around a post's own
 * media — hence the post-body test.
 */
function quoteRootOf(article: HTMLElement): HTMLElement | null {
  const direct = article.querySelector<HTMLElement>(QUOTE_SELECTOR)
  if (direct !== null) return direct
  const attachments = article.querySelector<HTMLElement>(ATTACHMENTS_SELECTOR)
  if (attachments !== null && attachments.querySelector(TWEET_TEXT_SELECTOR) !== null) return attachments
  return null
}

/** Whether `element` belongs to the quoted post rather than to the post itself. */
function isQuoted(quoteRoot: HTMLElement | null, element: Element): boolean {
  return quoteRoot !== null && quoteRoot.contains(element)
}

/** Normalised text of a node, or `''`. */
function textOf(node: Element | null | undefined): string {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim()
}

/**
 * Handle without its `@`, read from the profile link the header carries.
 *
 * The link is the reliable source: the handle is also drawn as text, but its
 * position inside the header varies with the account's display name.
 */
function handleOf(scope: Element | null): string {
  const link = scope?.querySelector<HTMLAnchorElement>('a[role="link"][href^="/"]')
  const href = link?.getAttribute('href') || ''
  return href.replace(/^\/+/, '').split('/')[0] || ''
}

/**
 * Display name, separated from the handle the header renders beside it.
 *
 * The header's text runs together (`Kai@buildwithkai·2h`), so the handle is cut
 * out by position; when no handle resolved, the name ends at the first `@` or
 * the `·` separator that precedes the timestamp.
 */
function displayNameOf(scope: Element | null, handle: string): string {
  const raw = textOf(scope)
  if (raw === '') return ''
  if (handle !== '') {
    const at = raw.indexOf(`@${handle}`)
    if (at > 0) return raw.slice(0, at).trim()
  }
  const cut = raw.search(/[@·]/)
  return (cut > 0 ? raw.slice(0, cut) : raw).trim()
}

/**
 * Avatar address, upscaled from the small variant the header ships.
 *
 * The header serves a size-suffixed file (`.../9ldc4i_i_x96.jpg`); only a
 * profile image is rewritten, since a media address carries no such suffix and
 * rewriting one would break it.
 */
function avatarOf(scope: Element | null): string {
  const src = scope?.querySelector<HTMLImageElement>(`${AVATAR_SELECTOR} img`)?.getAttribute('src') || ''
  if (!src.includes('profile_images')) return src
  return src.replace(/_[A-Za-z0-9_]+\.(jpg|jpeg|png|webp)$/i, '_400x400.$1')
}

/** Whether a verification badge is drawn outside the quoted post. */
function verifiedOf(article: HTMLElement, quoteRoot: HTMLElement | null): boolean {
  for (const badge of article.querySelectorAll(VERIFIED_SELECTOR)) {
    if (!isQuoted(quoteRoot, badge)) return true
  }
  return false
}

/** The author of the post, or of the quoted post when `scope` is the quote card. */
function authorOf(scope: Element | null, verified: boolean): TweetAuthor {
  const nameEl = scope?.querySelector(USER_NAME_SELECTOR) ?? null
  const handle = handleOf(nameEl)
  return { name: displayNameOf(nameEl, handle), handle, avatar: avatarOf(scope ?? null), verified }
}

/** The post body, skipping the quoted post's own body. */
function bodyOf(article: HTMLElement, quoteRoot: HTMLElement | null): string {
  for (const el of article.querySelectorAll(TWEET_TEXT_SELECTOR)) {
    if (!isQuoted(quoteRoot, el)) return (el.textContent || '').trim()
  }
  return ''
}

/** Resolves the address a media container stands for. */
function mediaUrlOf(container: Element): string {
  const video = container.querySelector('video')
  if (video !== null) return video.poster || video.currentSrc || video.src || ''
  return container.querySelector('img')?.getAttribute('src') || ''
}

/**
 * Media containers of the post itself, in document order.
 *
 * Deliberately not deduplicated: a video is one media drawn by two containers
 * (the player and the still that previews it) sharing one address, so collapsing
 * by address here would leave only the still and report a video as a photo.
 */
function mediaContainersOf(article: HTMLElement, quoteRoot: HTMLElement | null): Element[] {
  const containers: Element[] = []
  for (const container of article.querySelectorAll(TWEET_MEDIA_SELECTOR)) {
    if (isQuoted(quoteRoot, container)) continue
    if (container.closest(AVATAR_SELECTOR) !== null) continue
    if (mediaUrlOf(container) === '') continue
    containers.push(container)
  }
  return containers
}

/** The distinct addresses the given containers stand for, in first-seen order. */
function uniqueUrls(containers: readonly Element[]): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const container of containers) {
    const url = mediaUrlOf(container)
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

/** Whether a media container holds a player rather than a still image. */
function isVideoContainer(container: Element): boolean {
  return container.matches('[data-testid="videoComponent"], [data-testid="videoPlayer"]')
}

/** Reads one counter, leaving the key out when the page did not render it. */
function counterOf(article: HTMLElement, testId: string, label: RegExp): number | undefined {
  const button = article.querySelector(`[data-testid="${testId}"]`)
  if (button === null) return undefined
  for (const source of [button.getAttribute('aria-label') || '', button.textContent || '']) {
    const match = source.match(label)
    if (match !== null) return parseMetricValue(match[1])
  }
  return undefined
}

/** Views, from the analytics link or the action bar's accessible label. */
function viewsOf(article: HTMLElement): number | undefined {
  const analytics = article.querySelector('a[href*="/analytics"]')
  const group = article.querySelector('div[role="group"]')
  for (const source of [textOf(analytics), analytics?.getAttribute('aria-label') || '', group?.getAttribute('aria-label') || '']) {
    const match = source.match(VIEWS_RE)
    if (match !== null) return parseMetricValue(match[1])
  }
  return undefined
}

/** Counters the page rendered. Absent keys stay absent. */
function statsOf(article: HTMLElement): TweetStats {
  const stats: TweetStats = {}
  for (const { key, testId, label } of COUNTERS) {
    const value = counterOf(article, testId, label)
    if (value !== undefined) stats[key] = value
  }
  const views = viewsOf(article)
  if (views !== undefined) stats.views = views
  return stats
}

/** ISO timestamp, or `null` — the page's own value, never a stand-in. */
function postedAtOf(article: HTMLElement): string | null {
  const raw = article.querySelector('time[datetime]')?.getAttribute('datetime') || ''
  if (raw === '') return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

/** The quoted post, when the post nests one. */
function quotedOf(quoteRoot: HTMLElement | null): QuotedTweet | undefined {
  if (quoteRoot === null) return undefined
  const text = textOf(quoteRoot.querySelector(TWEET_TEXT_SELECTOR))
  const handle = handleOf(quoteRoot.querySelector(USER_NAME_SELECTOR))
  const name = displayNameOf(quoteRoot.querySelector(USER_NAME_SELECTOR), handle)
  if (text === '' && name === '' && handle === '') return undefined
  const media = quoteRoot.querySelector(TWEET_MEDIA_SELECTOR)
  const coverUrl = media !== null ? mediaUrlOf(media) : ''
  const author: TweetAuthor = {
    name,
    handle,
    avatar: avatarOf(quoteRoot),
    verified: quoteRoot.querySelector(VERIFIED_SELECTOR) !== null,
  }
  return coverUrl === '' ? { author, text } : { author, text, coverUrl }
}

/**
 * The poll the page rendered, when the option rows parse.
 *
 * X does not document this markup and the repository carried no selector for it,
 * so a structure this parser cannot read yields no poll at all and the post
 * degrades to its media shape instead of shipping half-parsed options.
 */
function pollOf(article: HTMLElement, quoteRoot: HTMLElement | null): TweetPoll | undefined {
  const root = article.querySelector<HTMLElement>(POLL_SELECTOR)
  if (root === null || isQuoted(quoteRoot, root)) return undefined
  const options: PollOption[] = []
  for (const choice of root.querySelectorAll(POLL_CHOICE_SELECTOR)) {
    const raw = textOf(choice)
    const match = raw.match(POLL_PCT_RE)
    if (match === null) continue
    const label = raw.replace(POLL_PCT_RE, '').trim()
    if (label === '') continue
    options.push({ label, pct: Number(match[1].replace(',', '.')) })
  }
  if (options.length < 2) return undefined
  const all = textOf(root)
  const votes = all.match(POLL_VOTES_RE)
  const left = all.match(POLL_LEFT_RE)
  const closesAt = left !== null ? (left[1] || left[2] || '').trim() : ''
  return {
    options,
    votes: votes !== null ? parseMetricValue(votes[1]) : 0,
    ...(closesAt === '' ? {} : { closesAt }),
  }
}

/**
 * The "someone reposted" line for this post, which the page draws above the
 * `article` rather than inside it.
 *
 * The line is only accepted when it sits outside every post and inside a
 * container that also holds this one: a sibling post's repost line would
 * otherwise be read as this post's.
 */
function repostContextOf(article: HTMLElement): Element | null {
  let node = article.parentElement
  for (let depth = 0; depth < SOCIAL_CONTEXT_DEPTH && node !== null; depth += 1) {
    const context = node.querySelector(SOCIAL_CONTEXT_SELECTOR)
    if (context !== null && context.closest('article') === null && context.parentElement?.contains(article)) return context
    node = node.parentElement
  }
  return null
}

/** Whether the page framed this post as someone else's repost. */
function isRepost(article: HTMLElement): boolean {
  const context = repostContextOf(article)
  if (context === null) return false
  return /转推|转帖|reposted|retweeted/i.test(textOf(context))
}

/** The shape the card will render, decided from what the post actually shows. */
function shapeOf(input: {
  readonly article: HTMLElement
  readonly quoteRoot: HTMLElement | null
  readonly containers: readonly Element[]
  readonly poll: TweetPoll | undefined
  readonly reposted: boolean
}): TweetShape {
  if (input.reposted) return 'repost'
  if (input.quoteRoot !== null) return 'quote'
  if (input.poll !== undefined) return 'poll'
  // The video test reads every container while the photo count reads distinct
  // stills: a player and its preview still share one address, so counting
  // containers would call a single photo a gallery.
  if (input.containers.some(isVideoContainer)) return 'video'
  const photos = uniqueUrls(input.containers.filter((container) => !isVideoContainer(container))).length
  if (photos >= 2) return 'gallery'
  if (photos === 1) return 'photo'
  const card = input.article.querySelector(CARD_SELECTOR)
  if (card !== null && !isQuoted(input.quoteRoot, card)) return 'link'
  return 'text'
}

/**
 * Captures the post rooted at `article`.
 *
 * @param article the post's own `article[data-testid="tweet"]` element
 * @returns the capture, or `null` when the element is not a post with a
 *   permanent address — a caller must treat `null` as "not capturable" rather
 *   than saving a partially read post.
 */
export function extractTweetCapture(article: HTMLElement): TweetCapture | null {
  const { url } = extractTweetIdAndUrl(article)
  if (!STATUS_URL_RE.test(url)) return null

  const quoteRoot = quoteRootOf(article)
  const containers = mediaContainersOf(article, quoteRoot)
  const mediaUrls = uniqueUrls(containers)
  const quoted = quotedOf(quoteRoot)
  const poll = pollOf(article, quoteRoot)
  const reposted = isRepost(article)
  const shape = shapeOf({ article, quoteRoot, containers, poll, reposted })
  const coverUrl = mediaUrls[0] || quoted?.coverUrl || ''

  return {
    shape,
    url,
    text: bodyOf(article, quoteRoot),
    author: authorOf(article, verifiedOf(article, quoteRoot)),
    postedAt: postedAtOf(article),
    mediaUrls,
    coverUrl,
    stats: statsOf(article),
    ...(quoted === undefined ? {} : { quoted }),
    ...(poll === undefined ? {} : { poll }),
  }
}
