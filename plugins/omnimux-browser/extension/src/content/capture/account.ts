/**
 * Account profile capture (spec §3.4): read one social profile page offline.
 *
 * The manual "更新这个账号" flow opens the account's profile in the user's own
 * browser, so the content script already sees the logged-in page. This module
 * turns that page into {@link CapturedAccount}: the profile fields plus the
 * works the page actually rendered. It never fetches, never injects, and never
 * invents a value the page did not show — a missing counter stays `null`, a
 * missing work list stays empty, and a page without a profile answers a
 * failure reason instead of a half-empty account.
 *
 * Two extractor paths, both measured on the live pages (2026-10-21):
 * - TikTok: `#__UNIVERSAL_DATA_FOR_REHYDRATION__` carries
 *   `__DEFAULT_SCOPE__['webapp.user-detail'].userInfo` (user + stats); the
 *   works are the DOM grid cards, whose own text holds views / comments / date.
 * - X: the header DOM carries display name, @handle, bio, followers and
 *   following; works are `article[data-testid="tweet"]` nodes. A signed-out
 *   page shows a "Sign in to X" wall with no articles, which is reported as
 *   `page-incomplete` rather than as a legitimately empty account.
 *
 * @module
 */

import {
  absoluteHttpUrl,
  arrayOf,
  firstHttpUrl,
  firstNonEmpty,
  isoFromDate,
  numberField,
  parseJson,
  recordOf,
  stringField,
  textOf,
  titleFromText,
  uniqueMedia,
} from './helpers.ts'

/** One work found on the account's profile page. */
export interface CapturedAccountPost {
  /** Platform-native id; `''` when the page exposed no id (keyed by URL then). */
  platform_post_id: string
  /** Permanent address of the work, never a tracker redirect. */
  source_url: string
  /** First content line; `''` for a cover-only work. */
  title: string
  content: string
  /** ISO timestamp, or `null` when the card showed no date. */
  posted_at: string | null
  /** Only counters the page rendered; an absent key means the page hid it. */
  stats: { likes?: number, comments?: number, views?: number, shares?: number }
  media: Array<{ type: 'video' | 'image', url: string }>
}

/** One captured account, ready for `POST /plugin-refresh/complete`. */
export interface CapturedAccount {
  platform: 'tiktok' | 'x'
  /** Handle without `@`. */
  handle: string
  nickname: string
  avatar_url: string
  bio: string
  followers: number | null
  following: number | null
  posts_count: number | null
  posts: CapturedAccountPost[]
  captured_at: string
  extractor: 'tiktok-profile' | 'x-profile'
}

/** Outcome of reading a profile page. */
export type AccountCaptureResult =
  | { ok: true, account: CapturedAccount }
  | { ok: false, reason: 'not-profile-page' | 'empty' | 'page-incomplete' }

/** Platforms this module reads. */
type AccountPlatform = CapturedAccount['platform']

/** Works one merged snapshot keeps (spec §3.4 merge contract). */
const MAX_MERGED_POSTS = 60

/** Works one X capture reads at most (spec §3.4). */
const MAX_X_POSTS = 30

/** Host suffixes per platform, matched on a dot boundary. */
const TIKTOK_HOSTS: readonly string[] = ['tiktok.com']
const X_HOSTS: readonly string[] = ['x.com', 'twitter.com']

/**
 * X single-segment paths that are site chrome rather than a profile.
 *
 * Only one-segment paths reach this check (`/home`, `/explore`, …); posts and
 * settings live under two segments and already fail the profile pattern.
 */
const X_RESERVED_PATHS = new Set<string>([
  'i',
  'home',
  'explore',
  'notifications',
  'messages',
  'search',
  'settings',
  'bookmarks',
  'compose',
  'login',
  'logout',
  'signup',
  'tos',
  'privacy',
  'about',
  'download',
  'jobs',
  'help',
  'intent',
  'share',
  'hashtag',
  'premium',
  'verified',
  'lists',
  'communities',
  'topics',
  'moments',
  'account',
])

/** TikTok profile path: `/@handle`. */
const TIKTOK_PROFILE_PATH_RE = /^\/@([A-Za-z0-9_.]{1,64})\/?$/

/** X profile path: `/<handle>` (X handles are at most 15 characters). */
const X_PROFILE_PATH_RE = /^\/([A-Za-z0-9_]{1,15})\/?$/

/** X permanent post path; media/analytics suffixes are not the post itself. */
const X_STATUS_PATH_RE = /^\/[A-Za-z0-9_]+\/status\/(\d+)\/?$/

/** TikTok work id inside `/video/<digits>`. */
const TIKTOK_VIDEO_ID_RE = /\/video\/(\d+)/

/** TikTok host for resolving the profile's own relative media. */
const TIKTOK_ORIGIN = 'https://www.tiktok.com'

/** A `YYYY/M/D` card date (TikTok renders it at the end of the card text). */
const CARD_DATE_RE = /(\d{4})\/(\d{1,2})\/(\d{1,2})/

/** Durations such as `00:49` are not counters. */
const CARD_DURATION_RE = /\b\d{1,2}:\d{2}\b/g

/** Percentages such as `1.48%` are rates, not counters. */
const CARD_PERCENT_RE = /\d[\d.,]*\s*%/g

/** One counter token, with an optional K/M/B suffix (`1.4M`, `1,286`). */
const CARD_NUMBER_RE = /\d[\d,]*(?:\.\d+)?\s*[KkMmBb]?/g

/** One number inside a profile/counter label (`9,231.2万`, `1,234`). */
const LABEL_NUMBER_RE = /(\d[\d,]*(?:\.\d+)?)\s*([KkMmBb万]|亿)?/

/** Image addresses that are page chrome rather than a work's media. */
const CHROME_IMAGE_RE = /\/profile_images\/|\/emoji\/|\/hashflags\/|\/sprite/i

/** Addresses that cannot be a video. */
const IMAGE_URL_RE = /\.(jpg|jpeg|png|webp|gif|heic)(\?|$)|\/media\/|format=(jpg|jpeg|png|webp|gif)/i

/** Addresses that are a playable video. */
const VIDEO_URL_RE = /\.(mp4|m4v|m3u8|webm)(\?|$)|video\.twimg\.com\/|\/amplify_video\//i

/** X body text carrying the signed-out wall. */
const X_LOGIN_WALL_RE = /sign\s+in\s+to\s+x/i

/* ------------------------------------------------------------------ 地址分类 */

/** Parsed URL, or `null` for empty / malformed input. */
function urlOf(href: string): URL | null {
  const value = (href || '').trim()
  if (value === '') return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Lower-cased host without the trailing dot, as the platform tables use. */
function hostnameOf(url: URL): string {
  const hostname = url.hostname.toLowerCase()
  return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname
}

/** Whether `hostname` is `host` or one of its subdomains. */
function hostMatches(hostname: string, hosts: readonly string[]): boolean {
  for (const host of hosts) {
    if (hostname === host || hostname.endsWith(`.${host}`)) return true
  }
  return false
}

/** Platform of a page host, or `null` when the host is not a supported one. */
function platformOf(hostname: string): AccountPlatform | null {
  if (hostMatches(hostname, TIKTOK_HOSTS)) return 'tiktok'
  if (hostMatches(hostname, X_HOSTS)) return 'x'
  return null
}

/** Handle of a profile path, or `''` when the path is not a profile. */
function profileHandleOf(url: URL, platform: AccountPlatform): string {
  const pathname = url.pathname
  if (platform === 'tiktok') {
    const match = TIKTOK_PROFILE_PATH_RE.exec(pathname)
    return match === null ? '' : match[1]
  }
  const match = X_PROFILE_PATH_RE.exec(pathname)
  if (match === null) return ''
  const handle = match[1]
  return X_RESERVED_PATHS.has(handle.toLowerCase()) ? '' : handle
}

/** A failed read, made explicit at each call site. */
function failure(reason: 'not-profile-page' | 'empty' | 'page-incomplete'): AccountCaptureResult {
  return { ok: false, reason }
}

/* ------------------------------------------------------------------ 通用读数 */

/** Case-insensitive handle key used for merge equality. */
function handleKey(handle: string): string {
  return (handle || '').trim().replace(/^@+/, '').toLowerCase()
}

/** Key one work is deduplicated by; the URL covers a work without an id. */
function postKey(post: CapturedAccountPost): string {
  return post.platform_post_id !== '' ? post.platform_post_id : post.source_url
}

/** ISO timestamp from a rendered date string, or `null`. */
function isoTimeOf(raw: string | null | undefined): string | null {
  const value = (raw || '').trim()
  if (value === '') return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/**
 * Counter from a rendered label (`1,234` / `1.2K` / `1.2M` / `1.2万` / `1.2亿`).
 *
 * Returns `null` — not `0` — when the label carries no number, so an absent
 * counter is never stored as a real zero.
 */
function counterOf(text: string): number | null {
  const match = LABEL_NUMBER_RE.exec(text || '')
  if (match === null) return null
  const value = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  switch ((match[2] || '').toLowerCase()) {
    case 'k':
      return Math.round(value * 1_000)
    case 'm':
      return Math.round(value * 1_000_000)
    case 'b':
      return Math.round(value * 1_000_000_000)
    case '万':
      return Math.round(value * 10_000)
    case '亿':
      return Math.round(value * 100_000_000)
    default:
      return Math.round(value)
  }
}

/** Counter of the first node matching `selector`, read from its label or text. */
function counterNear(scope: ParentNode, selector: string): number | null {
  const node = scope.querySelector(selector)
  if (node === null) return null
  const label = node.getAttribute('aria-label')
  if (label !== null && label.trim() !== '') {
    const value = counterOf(label)
    if (value !== null) return value
  }
  return counterOf(textOf(node))
}

/** Distinct works by {@link postKey}, first occurrence wins. */
function dedupePosts(posts: readonly CapturedAccountPost[]): CapturedAccountPost[] {
  const seen = new Set<string>()
  const kept: CapturedAccountPost[] = []
  for (const post of posts) {
    const key = postKey(post)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(post)
  }
  return kept
}

/** Newest first; works without a date sort last. */
function comparePosts(a: CapturedAccountPost, b: CapturedAccountPost): number {
  const left = a.posted_at ?? ''
  const right = b.posted_at ?? ''
  if (left === right) return 0
  if (left === '') return 1
  if (right === '') return -1
  return left < right ? 1 : -1
}

/** Sorted copy of `posts` (newest first). */
function sortedPosts(posts: readonly CapturedAccountPost[]): CapturedAccountPost[] {
  return posts.slice().sort(comparePosts)
}

/* ------------------------------------------------------------------ TikTok */

/** The TikTok JSON island's `__DEFAULT_SCOPE__`, or `null` when unreadable. */
function tiktokScopeOf(doc: Document): Record<string, unknown> | null {
  const script = doc.querySelector<HTMLScriptElement>('script#__UNIVERSAL_DATA_FOR_REHYDRATION__')
  const parsed = parseJson(script?.textContent ?? '')
  return recordOf(recordOf(parsed)?.['__DEFAULT_SCOPE__'])
}

/** `webapp.user-detail` of the TikTok scope, or `null`. */
function tiktokUserDetailOf(doc: Document): Record<string, unknown> | null {
  const scope = tiktokScopeOf(doc)
  return recordOf(scope?.['webapp.user-detail'])
}

/** Card metrics encoded in a TikTok grid card's text. */
interface TiktokCardMetrics {
  views?: number
  comments?: number
  posted_at: string | null
}

/** A `YYYY/M/D` card date as an ISO timestamp, or `null` for an invalid date. */
function tiktokDateOf(text: string): string | null {
  const match = CARD_DATE_RE.exec(text)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return parsed.toISOString()
}

/** One counter token, or `null` for a decimal rate such as `68.18`. */
function cardCounterOf(raw: string): number | null {
  const token = raw.trim()
  const match = /^(\d[\d,]*(?:\.\d+)?)\s*([KkMmBb]?)$/.exec(token)
  if (match === null) return null
  const digits = match[1].replace(/,/g, '')
  const suffix = match[2]
  // A plain decimal is an engagement rate, not a count.
  if (suffix === '' && digits.includes('.')) return null
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  switch (suffix.toLowerCase()) {
    case 'k':
      return Math.round(value * 1_000)
    case 'm':
      return Math.round(value * 1_000_000)
    case 'b':
      return Math.round(value * 1_000_000_000)
    default:
      return Math.round(value)
  }
}

/**
 * Visible metrics of a TikTok grid card.
 *
 * Measured card text: `1.4M 1,286 1.48% 00:49 68.18 2026/10/10` — views first,
 * comments second, then the engagement rate, duration, a bare rate and the
 * date. Rates, durations and the date are removed before counting so the first
 * two remaining counters are views and comments.
 */
function tiktokCardMetricsOf(text: string): TiktokCardMetrics {
  const postedAt = tiktokDateOf(text)
  const cleaned = text
    .replace(CARD_DATE_RE, ' ')
    .replace(CARD_DURATION_RE, ' ')
    .replace(CARD_PERCENT_RE, ' ')
  const counters: number[] = []
  for (const token of cleaned.match(CARD_NUMBER_RE) ?? []) {
    const value = cardCounterOf(token)
    if (value !== null) counters.push(value)
  }
  const metrics: TiktokCardMetrics = { posted_at: postedAt }
  const views = counters.at(0)
  const comments = counters.at(1)
  if (views !== undefined) metrics.views = views
  if (comments !== undefined) metrics.comments = comments
  return metrics
}

/** Media of one TikTok work: the cover image, then the video address itself. */
function tiktokMediaOf(
  cover: string | null,
  videoUrl: string,
): Array<{ type: 'video' | 'image', url: string }> {
  const media: Array<{ type: 'video' | 'image', url: string }> = []
  if (cover !== null) media.push({ type: 'image', url: cover })
  media.push({ type: 'video', url: videoUrl })
  return uniqueMedia(media)
}

/** Account handle encoded in a TikTok work address, or `''`. */
function tiktokHandleOfHref(href: string): string {
  const match = /\/@([^/]+)\/video\//.exec(href)
  return match === null ? '' : match[1]
}

/** Works from the profile's DOM grid (`div[data-e2e="user-post-item"]`). */
function tiktokPostsFromDom(
  doc: Document,
  pageHref: string,
  fallbackHandle: string,
): CapturedAccountPost[] {
  const posts: CapturedAccountPost[] = []
  for (const item of doc.querySelectorAll<HTMLElement>('div[data-e2e="user-post-item"]')) {
    const anchor = item.querySelector<HTMLAnchorElement>('a[href*="/video/"]')
    const absolute = absoluteHttpUrl(anchor?.getAttribute('href'), pageHref)
    if (absolute === null) continue
    const idMatch = TIKTOK_VIDEO_ID_RE.exec(absolute)
    const id = idMatch === null ? '' : idMatch[1]
    const handle = firstNonEmpty(tiktokHandleOfHref(absolute), fallbackHandle)
    const sourceUrl = id === ''
      ? absolute
      : absoluteHttpUrl(`/@${handle}/video/${id}`, TIKTOK_ORIGIN) ?? absolute
    const image = item.querySelector<HTMLImageElement>('img[src]')
    const cover = absoluteHttpUrl(image?.getAttribute('src'), pageHref)
    const content = firstNonEmpty(
      image?.getAttribute('alt'),
      anchor?.getAttribute('title'),
    )
    const metrics = tiktokCardMetricsOf(textOf(item))
    const stats: CapturedAccountPost['stats'] = {}
    if (metrics.views !== undefined) stats.views = metrics.views
    if (metrics.comments !== undefined) stats.comments = metrics.comments
    posts.push({
      platform_post_id: id,
      source_url: sourceUrl,
      title: titleFromText(content),
      content,
      posted_at: metrics.posted_at,
      stats,
      media: tiktokMediaOf(cover, sourceUrl),
    })
  }
  return dedupePosts(posts)
}

/** One work from a TikTok item struct (the shape the detail pages hydrate). */
function tiktokPostFromStruct(
  item: Record<string, unknown>,
  pageHref: string,
  fallbackHandle: string,
): CapturedAccountPost | null {
  const id = stringField(item, ['id'])
  if (id === '') return null
  const author = recordOf(item['author'])
  const handle = firstNonEmpty(stringField(author, ['uniqueId', 'unique_id']), fallbackHandle)
  const sourceUrl = absoluteHttpUrl(`/@${handle}/video/${id}`, TIKTOK_ORIGIN) ?? pageHref
  const video = recordOf(item['video'])
  const cover = firstHttpUrl(video?.['cover'], pageHref)
  const playUrl = firstHttpUrl(video?.['playAddr'] ?? video?.['play_addr'], pageHref)
  const statsRecord = recordOf(item['stats'])
  const stats: CapturedAccountPost['stats'] = {}
  const likes = numberField(statsRecord, ['diggCount', 'digg_count'])
  const comments = numberField(statsRecord, ['commentCount', 'comment_count'])
  const views = numberField(statsRecord, ['playCount', 'play_count'])
  const shares = numberField(statsRecord, ['shareCount', 'share_count'])
  if (likes !== undefined) stats.likes = likes
  if (comments !== undefined) stats.comments = comments
  if (views !== undefined) stats.views = views
  if (shares !== undefined) stats.shares = shares
  const content = stringField(item, ['desc'])
  return {
    platform_post_id: id,
    source_url: sourceUrl,
    title: titleFromText(content),
    content,
    posted_at: isoFromDate(item['createTime'] ?? item['create_time']) ?? null,
    stats,
    media: tiktokMediaOf(cover, playUrl ?? sourceUrl),
  }
}

/** Works from the profile JSON's optional `itemList` (DOM has none). */
function tiktokPostsFromJson(
  itemList: readonly unknown[],
  pageHref: string,
  fallbackHandle: string,
): CapturedAccountPost[] {
  const posts: CapturedAccountPost[] = []
  for (const entry of itemList) {
    const record = recordOf(entry)
    if (record === null) continue
    const item = recordOf(record['itemStruct']) ?? record
    const post = tiktokPostFromStruct(item, pageHref, fallbackHandle)
    if (post !== null) posts.push(post)
  }
  return dedupePosts(posts)
}

/** Profile fallback from the rendered DOM (no JSON island). */
interface TiktokDomProfile {
  nickname: string
  avatar_url: string
  bio: string
}

/** Rendered profile header, or `null` when the page shows no `h1` title. */
function tiktokDomProfileOf(doc: Document, pageHref: string): TiktokDomProfile | null {
  const title = doc.querySelector('h1[data-e2e="user-title"], h1')
  const nickname = textOf(title)
  if (nickname === '') return null
  const avatarImage = doc.querySelector<HTMLImageElement>(
    '[data-e2e="user-avatar"] img, img[data-e2e="user-avatar"]',
  )
  const avatarUrl = absoluteHttpUrl(avatarImage?.getAttribute('src'), pageHref) ?? ''
  return {
    nickname,
    avatar_url: avatarUrl,
    bio: textOf(doc.querySelector('[data-e2e="user-bio"]')),
  }
}

/** Reads a TikTok profile page. */
function captureTiktok(
  doc: Document,
  url: URL,
  urlHandle: string,
  capturedAt: string,
): AccountCaptureResult {
  const pageHref = url.href
  const detail = tiktokUserDetailOf(doc)
  const userInfo = recordOf(detail?.['userInfo'])
  const user = recordOf(userInfo?.['user'])
  const stats = recordOf(userInfo?.['stats'])
  const handle = firstNonEmpty(stringField(user, ['uniqueId', 'unique_id']), urlHandle)
  const domPosts = tiktokPostsFromDom(doc, pageHref, handle)
  const itemList = arrayOf(detail?.['itemList'] ?? userInfo?.['itemList'])
  const jsonPosts = tiktokPostsFromJson(itemList, pageHref, handle)
  // The live page hydrates no itemList; the DOM grid is the measured source.
  const posts = domPosts.length > 0 ? domPosts : jsonPosts

  if (user !== null) {
    const avatar = firstNonEmpty(
      stringField(user, ['avatarLarger', 'avatar_larger']),
      stringField(user, ['avatarMedium', 'avatar_medium']),
      stringField(user, ['avatarThumb', 'avatar_thumb']),
    )
    return {
      ok: true,
      account: {
        platform: 'tiktok',
        handle,
        nickname: stringField(user, ['nickname']),
        avatar_url: absoluteHttpUrl(avatar, TIKTOK_ORIGIN) ?? '',
        bio: stringField(user, ['signature']),
        followers: numberField(stats, ['followerCount', 'follower_count']) ?? null,
        following: numberField(stats, ['followingCount', 'following_count']) ?? null,
        posts_count: numberField(stats, ['videoCount', 'video_count']) ?? null,
        posts,
        captured_at: capturedAt,
        extractor: 'tiktok-profile',
      },
    }
  }

  const domProfile = tiktokDomProfileOf(doc, pageHref)
  if (domProfile === null) return failure('empty')
  return {
    ok: true,
    account: {
      platform: 'tiktok',
      // DOM fallback keeps the URL handle and leaves counters absent: the
      // rendered header does not carry them in a readable shape here.
      handle: urlHandle,
      nickname: domProfile.nickname,
      avatar_url: domProfile.avatar_url,
      bio: domProfile.bio,
      followers: null,
      following: null,
      posts_count: null,
      posts,
      captured_at: capturedAt,
      extractor: 'tiktok-profile',
    },
  }
}

/* ------------------------------------------------------------------ X */

/** Profile header fields read from the X DOM. */
interface XProfile {
  handle: string
  nickname: string
  avatar_url: string
  bio: string
  followers: number | null
  following: number | null
}

/** Whether the page carries X's signed-out wall. */
function hasXLoginWall(doc: Document): boolean {
  return X_LOGIN_WALL_RE.test(textOf(doc.body))
}

/** Avatar address of the profile header, or `''`. */
function xAvatarOf(doc: Document, pageHref: string): string {
  const image = doc.querySelector<HTMLImageElement>('[data-testid^="UserAvatar-Container"] img')
    ?? doc.querySelector<HTMLImageElement>('img[src*="/profile_images/"]')
  return absoluteHttpUrl(image?.getAttribute('src'), pageHref) ?? ''
}

/** Profile header fields, or `null` when the page shows no profile header. */
function xProfileOf(doc: Document, urlHandle: string, pageHref: string): XProfile | null {
  const header = doc.querySelector('[data-testid="UserName"]')
  if (header === null) return null
  const headerText = textOf(header)
  const handleMatch = /@([A-Za-z0-9_]+)/.exec(headerText)
  const headerHandle = handleMatch === null ? '' : handleMatch[1]
  const nickname = handleMatch === null
    ? headerText
    : headerText.slice(0, handleMatch.index).trim()
  return {
    handle: firstNonEmpty(headerHandle, urlHandle),
    nickname,
    avatar_url: xAvatarOf(doc, pageHref),
    bio: textOf(doc.querySelector('[data-testid="UserDescription"]')),
    followers: counterNear(doc, 'a[href$="/followers"], a[href$="/verified_followers"]'),
    following: counterNear(doc, 'a[href$="/following"]'),
  }
}

/** Permanent post path of one X article, or `null` for a non-post card. */
function xStatusOf(article: HTMLElement, pageHref: string): { id: string, url: string } | null {
  for (const anchor of article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')) {
    const absolute = absoluteHttpUrl(anchor.getAttribute('href'), pageHref)
    if (absolute === null) continue
    const parsed = new URL(absolute)
    if (!X_STATUS_PATH_RE.test(parsed.pathname)) continue
    const idMatch = /\/status\/(\d+)\/?$/.exec(parsed.pathname)
    if (idMatch === null) continue
    parsed.search = ''
    parsed.hash = ''
    return { id: idMatch[1], url: parsed.href }
  }
  return null
}

/** Counters of one X article, from the action bar's accessible labels. */
function xStatsOf(article: HTMLElement): CapturedAccountPost['stats'] {
  const stats: CapturedAccountPost['stats'] = {}
  const comments = counterNear(article, '[data-testid="reply"]')
  const shares = counterNear(article, '[data-testid="retweet"]')
  const likes = counterNear(article, '[data-testid="like"]')
  const views = counterNear(article, '[data-testid="analytics"], a[href*="/analytics"]')
  if (comments !== null) stats.comments = comments
  if (shares !== null) stats.shares = shares
  if (likes !== null) stats.likes = likes
  if (views !== null) stats.views = views
  return stats
}

/** Media type of one address, falling back to the container that carried it. */
function xMediaTypeOf(url: string, container: 'video' | 'image'): 'video' | 'image' {
  if (VIDEO_URL_RE.test(url)) return 'video'
  if (IMAGE_URL_RE.test(url)) return 'image'
  return container
}

/** Media inside one X article; the author avatar and quoted post are excluded. */
function xMediaOf(article: HTMLElement, pageHref: string): CapturedAccountPost['media'] {
  const media: CapturedAccountPost['media'] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined, container: 'video' | 'image'): void => {
    const url = absoluteHttpUrl(raw, pageHref)
    if (url === null || seen.has(url) || CHROME_IMAGE_RE.test(url)) return
    seen.add(url)
    media.push({ type: xMediaTypeOf(url, container), url })
  }
  const excluded = (element: Element): boolean =>
    element.closest('[data-testid="Tweet-User-Avatar"], [data-testid="quoteTweet"]') !== null
  for (const image of article.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com"]')) {
    if (excluded(image)) continue
    push(image.getAttribute('src'), 'image')
  }
  for (const video of article.querySelectorAll<HTMLVideoElement>('video')) {
    if (excluded(video)) continue
    push(video.getAttribute('poster'), 'image')
    push(video.getAttribute('src'), 'video')
    for (const source of video.querySelectorAll('source')) push(source.getAttribute('src'), 'video')
  }
  for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href*=".mp4"]')) {
    if (excluded(link)) continue
    push(link.getAttribute('href'), 'video')
  }
  return media
}

/** One work from an X article, or `null` when the article is not a post. */
function xPostOf(article: HTMLElement, pageHref: string): CapturedAccountPost | null {
  const status = xStatusOf(article, pageHref)
  if (status === null) return null
  const content = textOf(article.querySelector('[data-testid="tweetText"]'))
  const time = article.querySelector('time[datetime]')?.getAttribute('datetime')
  return {
    platform_post_id: status.id,
    source_url: status.url,
    title: titleFromText(content),
    content,
    posted_at: isoTimeOf(time),
    stats: xStatsOf(article),
    media: xMediaOf(article, pageHref),
  }
}

/** Reads an X profile page. */
function captureX(
  doc: Document,
  url: URL,
  urlHandle: string,
  capturedAt: string,
): AccountCaptureResult {
  const pageHref = url.href
  const articles = doc.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
  // A signed-out page renders the wall instead of the timeline; reporting it as
  // an empty account would make the host overwrite good data with nothing.
  if (articles.length === 0 && hasXLoginWall(doc)) return failure('page-incomplete')
  const profile = xProfileOf(doc, urlHandle, pageHref)
  if (profile === null) return failure('empty')
  const posts: CapturedAccountPost[] = []
  for (const article of articles) {
    const post = xPostOf(article, pageHref)
    if (post !== null) posts.push(post)
  }
  return {
    ok: true,
    account: {
      platform: 'x',
      handle: profile.handle,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      followers: profile.followers,
      following: profile.following,
      // X's profile header renders no total-post counter.
      posts_count: null,
      posts: dedupePosts(posts).slice(0, MAX_X_POSTS),
      captured_at: capturedAt,
      extractor: 'x-profile',
    },
  }
}

/* ------------------------------------------------------------------ 入口 */

/**
 * Captures the account whose profile page `doc` shows.
 *
 * @param doc the page document
 * @param href the page address (a `#omnimux-refresh=` hash is harmless: only
 *   the path classifies the page)
 * @returns the account, or an explicit failure reason
 */
export function captureAccount(doc: Document, href: string): AccountCaptureResult {
  const url = urlOf(href)
  if (url === null) return failure('not-profile-page')
  const platform = platformOf(hostnameOf(url))
  if (platform === null) return failure('not-profile-page')
  const handle = profileHandleOf(url, platform)
  if (handle === '') return failure('not-profile-page')
  const capturedAt = new Date().toISOString()
  return platform === 'tiktok'
    ? captureTiktok(doc, url, handle, capturedAt)
    : captureX(doc, url, handle, capturedAt)
}

/* ------------------------------------------------------------------ 合并 */

/** One post merged into an existing entry: the newer scan updates its stats. */
function mergePost(
  previous: CapturedAccountPost | undefined,
  next: CapturedAccountPost,
): CapturedAccountPost {
  if (previous === undefined) return next
  return {
    platform_post_id: next.platform_post_id !== '' ? next.platform_post_id : previous.platform_post_id,
    source_url: next.source_url !== '' ? next.source_url : previous.source_url,
    title: next.title !== '' ? next.title : previous.title,
    content: next.content !== '' ? next.content : previous.content,
    posted_at: next.posted_at ?? previous.posted_at,
    // Per-counter update: counts the page hid this time keep their last value
    // instead of being wiped by an incomplete scan.
    stats: Object.assign({}, previous.stats, next.stats),
    media: next.media.length > 0 ? next.media : previous.media,
  }
}

/** One snapshot normalized to the merge contract (deduped, newest first, capped). */
function normalizeSnapshot(snapshot: CapturedAccount): CapturedAccount {
  const slots = new Map<string, CapturedAccountPost>()
  for (const post of snapshot.posts) {
    const key = postKey(post)
    slots.set(key, mergePost(slots.get(key), post))
  }
  return {
    platform: snapshot.platform,
    handle: snapshot.handle,
    nickname: snapshot.nickname,
    avatar_url: snapshot.avatar_url,
    bio: snapshot.bio,
    followers: snapshot.followers,
    following: snapshot.following,
    posts_count: snapshot.posts_count,
    posts: sortedPosts(Array.from(slots.values())).slice(0, MAX_MERGED_POSTS),
    captured_at: snapshot.captured_at,
    extractor: snapshot.extractor,
  }
}

/**
 * Merges one account scan into the previous snapshot.
 *
 * Same account (handle, case-insensitive, `@` ignored): works are deduplicated
 * by platform post id with the newer scan updating counters, profile fields use
 * the newer non-empty value, and the list keeps the newest 60 works. A
 * different account, or no previous snapshot, yields the normalized new scan.
 *
 * @param base the previous snapshot, or `null` for the first scan
 * @param next the scan just captured
 * @returns a new snapshot; neither argument is mutated
 */
export function mergeAccountSnapshots(
  base: CapturedAccount | null,
  next: CapturedAccount,
): CapturedAccount {
  const incoming = normalizeSnapshot(next)
  if (base === null) return incoming
  if (base.platform !== incoming.platform) return incoming
  if (handleKey(base.handle) !== handleKey(incoming.handle)) return incoming
  const slots = new Map<string, CapturedAccountPost>()
  for (const post of base.posts) slots.set(postKey(post), post)
  for (const post of incoming.posts) {
    const key = postKey(post)
    slots.set(key, mergePost(slots.get(key), post))
  }
  return {
    platform: incoming.platform,
    handle: firstNonEmpty(incoming.handle, base.handle),
    nickname: firstNonEmpty(incoming.nickname, base.nickname),
    avatar_url: firstNonEmpty(incoming.avatar_url, base.avatar_url),
    bio: firstNonEmpty(incoming.bio, base.bio),
    followers: incoming.followers ?? base.followers,
    following: incoming.following ?? base.following,
    posts_count: incoming.posts_count ?? base.posts_count,
    posts: sortedPosts(Array.from(slots.values())).slice(0, MAX_MERGED_POSTS),
    captured_at: incoming.captured_at,
    extractor: incoming.extractor,
  }
}
