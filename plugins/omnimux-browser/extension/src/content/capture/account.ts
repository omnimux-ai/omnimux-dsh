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
 * Three extractor paths:
 * - TikTok: `#__UNIVERSAL_DATA_FOR_REHYDRATION__` carries
 *   `__DEFAULT_SCOPE__['webapp.user-detail'].userInfo` (user + stats); the
 *   works are the DOM grid cards, whose own text holds views / comments / date.
 *   Measured on the live page (2026-10-21).
 * - X: the header DOM carries display name, @handle, bio, followers and
 *   following; works are `article[data-testid="tweet"]` nodes. A signed-out
 *   page shows a "Sign in to X" wall with no articles, which is reported as
 *   `page-incomplete` rather than as a legitimately empty account. Measured on
 *   the live page (2026-10-21).
 * - 小红书: `window.__INITIAL_STATE__.user` holds the Pinia user store —
 *   `userPageData` (basicInfo + interactions) and `notes` (`[tab[], …]`). The
 *   field names follow the opencli 小红书 adapter and the browser-act profile
 *   skill, both exercised against a logged-in page; every reader below tries
 *   several candidate keys and answers `null`/`''` instead of guessing. The
 *   profile grid is the DOM fallback. The live page itself still needs a human
 *   logged-in regression (spec §7) — this module never fetches anything.
 *
 * @module
 */

import {
  absoluteHttpUrl,
  arrayOf,
  findDeepObject,
  firstHttpUrl,
  firstNonEmpty,
  isoFromDate,
  numberField,
  parseJson,
  recordOf,
  scriptTexts,
  stringField,
  textOf,
  titleFromText,
  uniqueMedia,
  valueAfterMarker,
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
  stats: { likes?: number, comments?: number, views?: number, shares?: number, collects?: number }
  media: Array<{ type: 'video' | 'image', url: string }>
}

/** One captured account, ready for `POST /plugin-refresh/complete`. */
export interface CapturedAccount {
  platform: 'tiktok' | 'x' | 'xiaohongshu'
  /** Handle without `@`; 小红书 uses the numeric profile uid. */
  handle: string
  nickname: string
  avatar_url: string
  bio: string
  followers: number | null
  following: number | null
  posts_count: number | null
  posts: CapturedAccountPost[]
  captured_at: string
  extractor: 'tiktok-profile' | 'x-profile' | 'xiaohongshu-profile'
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
const XIAOHONGSHU_HOSTS: readonly string[] = ['xiaohongshu.com']

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

/**
 * 小红书 profile path: `/user/profile/<uid>`, uid is 24 hex characters.
 *
 * `/explore/<id>`, `/login`, `/search` and the rest of the site are not
 * profiles; the uid is lower-cased so the handle matches the host's comparison.
 */
const XIAOHONGSHU_PROFILE_PATH_RE = /^\/user\/profile\/([0-9a-fA-F]{24})\/?$/

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
  if (hostMatches(hostname, XIAOHONGSHU_HOSTS)) return 'xiaohongshu'
  return null
}

/** Handle of a profile path, or `''` when the path is not a profile. */
function profileHandleOf(url: URL, platform: AccountPlatform): string {
  const pathname = url.pathname
  if (platform === 'tiktok') {
    const match = TIKTOK_PROFILE_PATH_RE.exec(pathname)
    return match === null ? '' : match[1]
  }
  if (platform === 'xiaohongshu') {
    const match = XIAOHONGSHU_PROFILE_PATH_RE.exec(pathname)
    return match === null ? '' : match[1].toLowerCase()
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

/* ------------------------------------------------------------------ 小红书 */

/** 小红书 host for the note addresses built below. */
const XIAOHONGSHU_ORIGIN = 'https://www.xiaohongshu.com'

/** Note id inside a profile card's `/explore/<id>` link. */
const XIAOHONGSHU_EXPLORE_PATH_RE = /\/explore\/([0-9a-fA-F]{24})/

/** Note id inside a profile card's `/user/profile/<uid>/<id>` link. */
const XIAOHONGSHU_CARD_PATH_RE = /\/user\/profile\/[0-9a-fA-F]{24}\/([0-9a-fA-F]{24})/

/** A counter as the page wrote it (`1234`, `1.2万`, `3.4K`), or `null`. */
function countOf(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
  }
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/[,\s]/g, '')
  if (text === '') return null
  // A trailing `+` marks a desensitized lower bound (风控下的 `10+`/`1万+`), not a
  // count: storing it as an exact number would fabricate precision.
  if (/[+＋]$/.test(text)) return null
  const match = /^(\d+(?:\.\d+)?)([万wWkKmM亿])?$/.exec(text)
  if (match === null) return null
  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  switch ((match[2] ?? '').toLowerCase()) {
    case '万':
    case 'w':
      return Math.round(base * 10_000)
    case '亿':
      return Math.round(base * 100_000_000)
    case 'k':
      return Math.round(base * 1_000)
    case 'm':
      return Math.round(base * 1_000_000)
    default:
      return Math.round(base)
  }
}

/**
 * Plain value behind a Pinia ref.
 *
 * `window.__INITIAL_STATE__.user` is a Pinia store: `userPageData` and `notes`
 * arrive either as the raw object or wrapped in `{ _value: … }` (and Vue's
 * `{ value: … }`) depending on the page build, so every reader unwraps first.
 */
function piniaValue(value: unknown): unknown {
  const record = recordOf(value)
  if (record === null) return value
  if ('_value' in record) return record['_value']
  if ('value' in record) return record['value']
  return value
}

/** `window.__INITIAL_STATE__` from the inline scripts, or `null`. */
function xiaohongshuStateOf(doc: Document): Record<string, unknown> | null {
  for (const text of scriptTexts(doc)) {
    if (!text.includes('__INITIAL_STATE__')) continue
    const raw = valueAfterMarker(text, '__INITIAL_STATE__')
    if (raw === null) continue
    // The state carries `undefined` literals, which are not valid JSON; the
    // substitution only affects this fallback branch (same as xiaohongshu.ts).
    const record = recordOf(parseJson(raw.replace(/\bundefined\b/g, 'null')))
    if (record !== null) return record
  }
  return null
}

/** The profile page's Pinia `user` store, or `null` when the page carries none. */
function xiaohongshuUserStoreOf(doc: Document): Record<string, unknown> | null {
  return recordOf(piniaValue(xiaohongshuStateOf(doc)?.['user']))
}

/** Counters of the profile header, keyed by `type` and by `name`. */
function xiaohongshuInteractionCountsOf(
  pageData: Record<string, unknown> | null,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of arrayOf(piniaValue(pageData?.['interactions']))) {
    const record = recordOf(piniaValue(entry))
    if (record === null) continue
    const value = countOf(record['count'] ?? record['i18nCount'] ?? record['i18n_count'])
    if (value === null) continue
    for (const key of [stringField(record, ['type']), stringField(record, ['name'])]) {
      const normalized = key.toLowerCase()
      if (normalized !== '' && !counts.has(normalized)) counts.set(normalized, value)
    }
  }
  return counts
}

/** First counter stored under one of `keys`, or `null`. */
function xiaohongshuCounterOf(counts: Map<string, number>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = counts.get(key)
    if (value !== undefined) return value
  }
  return null
}

/** First readable image address among `keys` of `record`, or `null`. */
function xiaohongshuImageOf(
  record: Record<string, unknown> | null,
  keys: readonly string[],
  base: string,
): string | null {
  if (record === null) return null
  for (const key of keys) {
    const url = firstHttpUrl(record[key], base)
    if (url !== null) return url
  }
  return null
}

/** Profile fields read from `userPageData`, or `null` when the store has none. */
interface XiaohongshuProfile {
  nickname: string
  avatar_url: string
  bio: string
  followers: number | null
  following: number | null
  posts_count: number | null
}

/**
 * Profile fields of `userPageData`, or `null` when the page carries none.
 *
 * Field names come from the opencli adapter and the browser-act profile skill
 * (both run against a logged-in profile): `basicInfo.nickname` / `imageb` /
 * `desc`, and `interactions` — `[{ type: 'fans' | 'follows' | 'interaction',
 * name: '粉丝' | '关注' | '获赞与收藏', count: '1234' }]`. Several candidate keys
 * are tried per field and a missing one stays `null`/`''` — the header's
 * desensitized `10+` is a lower bound and is not stored as a count.
 */
function xiaohongshuProfileOf(
  pageData: Record<string, unknown> | null,
  pageHref: string,
): XiaohongshuProfile | null {
  if (pageData === null) return null
  const basic = recordOf(piniaValue(pageData['basicInfo'] ?? pageData['basic_info']))
  if (basic === null) return null
  const counts = xiaohongshuInteractionCountsOf(pageData)
  return {
    nickname: stringField(basic, ['nickname', 'nickName', 'nick_name', 'name']),
    avatar_url: xiaohongshuImageOf(
      basic,
      ['imageb', 'imageB', 'images', 'image', 'avatar', 'avatarUrl', 'avatar_url'],
      pageHref,
    ) ?? '',
    bio: stringField(basic, ['desc', 'description', 'sign']),
    followers: xiaohongshuCounterOf(counts, ['fans', '粉丝', 'followers']),
    following: xiaohongshuCounterOf(counts, ['follows', '关注', 'following']),
    // The profile header renders no note total on the measured page build; the
    // page data sometimes carries one, so it is read but never invented.
    posts_count: countOf(pageData['noteNum'] ?? pageData['noteCount'] ?? pageData['note_count'])
      ?? countOf(basic['noteNum'] ?? basic['noteCount'] ?? basic['note_count']),
  }
}

/** The profile's `notes` store as `[tab[], …]` groups, or `[]` when absent. */
function xiaohongshuNoteGroupsOf(userStore: Record<string, unknown>): unknown[] {
  const notes = piniaValue(userStore['notes'])
  // Measured shape is `[tab[], tab[], …]`. Some page builds hand back a
  // numeric-keyed object map instead (the browser-act skill reads `notes[0]`
  // as that map), so a plain record is spread into one group per value.
  if (Array.isArray(notes)) return notes
  const record = recordOf(notes)
  return record === null ? [] : Object.values(record)
}

/** Whether the store hydrated its note list yet (either shape counts). */
function xiaohongshuNotesReady(userStore: Record<string, unknown> | null): boolean {
  if (userStore === null) return false
  const notes = piniaValue(userStore['notes'])
  return Array.isArray(notes) || recordOf(notes) !== null
}

/** One note card flattened out of its tab group and its `noteCard` wrapper. */
interface XiaohongshuNoteCard {
  /** The group entry (`{ noteCard, xsecToken }`) the card came from. */
  entry: Record<string, unknown>
  /** The card itself (`{ noteId, displayTitle, interactInfo, cover, … }`). */
  card: Record<string, unknown>
}

/** Every `{ noteCard }` entry of every tab, in page order. */
function xiaohongshuNoteCardsOf(userStore: Record<string, unknown>): XiaohongshuNoteCard[] {
  const cards: XiaohongshuNoteCard[] = []
  for (const group of xiaohongshuNoteGroupsOf(userStore)) {
    const unwrapped = piniaValue(group)
    // A tab is an array of entries; a page build that hands back a numeric-keyed
    // object map (the shape the browser-act skill reads as `notes[0]`) is walked
    // by its values instead.
    const entries = Array.isArray(unwrapped) ? unwrapped : Object.values(recordOf(unwrapped) ?? {})
    for (const item of entries) {
      const entry = recordOf(piniaValue(item))
      if (entry === null) continue
      const card = recordOf(piniaValue(entry['noteCard'] ?? entry['note_card'])) ?? entry
      cards.push({ entry, card })
    }
  }
  return cards
}

/** Note address: the tokenized `/explore/` page, else the profile-scoped one. */
function xiaohongshuNoteUrl(uid: string, noteId: string, xsecToken: string): string {
  if (xsecToken !== '') {
    return `${XIAOHONGSHU_ORIGIN}/explore/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_user`
  }
  return `${XIAOHONGSHU_ORIGIN}/user/profile/${uid}/${noteId}`
}

/** Video address inside a video note, or `null` when the card carries none. */
function xiaohongshuVideoUrlOf(card: Record<string, unknown>, pageHref: string): string | null {
  const video = recordOf(card['video'])
  if (video === null) return null
  const stream = findDeepObject(video, (record) => record['masterUrl'] !== undefined
    || record['master_url'] !== undefined
    || record['backupUrls'] !== undefined)
  return firstHttpUrl(
    stream?.['masterUrl'] ?? stream?.['master_url'] ?? stream?.['backupUrls'],
    pageHref,
  )
}

/** One note from a `notes` card, or `null` when it carries no note id. */
function xiaohongshuPostFromCard(
  note: XiaohongshuNoteCard,
  pageHref: string,
  uid: string,
): CapturedAccountPost | null {
  const { entry, card } = note
  const noteId = firstNonEmpty(
    stringField(card, ['noteId', 'note_id']),
    stringField(entry, ['id', 'noteId', 'note_id']),
  )
  if (noteId === '') return null
  const xsecToken = firstNonEmpty(
    stringField(entry, ['xsecToken', 'xsec_token']),
    stringField(card, ['xsecToken', 'xsec_token']),
  )
  const content = stringField(card, ['desc', 'description'])
  const title = firstNonEmpty(
    titleFromText(stringField(card, ['displayTitle', 'display_title', 'title'])),
    titleFromText(content),
  )
  const interact = recordOf(piniaValue(card['interactInfo'] ?? card['interact_info']))
  const stats: CapturedAccountPost['stats'] = {}
  const likes = countOf(interact?.['likedCount'] ?? interact?.['liked_count'] ?? interact?.['likes'])
  const comments = countOf(interact?.['commentCount'] ?? interact?.['comment_count'])
  const collects = countOf(interact?.['collectedCount'] ?? interact?.['collected_count'])
  if (likes !== null) stats.likes = likes
  if (comments !== null) stats.comments = comments
  if (collects !== null) stats.collects = collects
  const cover = firstHttpUrl(card['cover'], pageHref)
  const media: CapturedAccountPost['media'] = []
  if (cover !== null) media.push({ type: 'image', url: cover })
  if (stringField(card, ['type']).toLowerCase() === 'video') {
    const videoUrl = xiaohongshuVideoUrlOf(card, pageHref)
    if (videoUrl !== null) media.push({ type: 'video', url: videoUrl })
  }
  return {
    platform_post_id: noteId,
    source_url: xiaohongshuNoteUrl(uid, noteId, xsecToken),
    title,
    content,
    posted_at: isoFromDate(
      card['time'] ?? card['createTime'] ?? card['create_time'] ?? card['publishTime'],
    ) ?? null,
    stats,
    media: uniqueMedia(media),
  }
}

/** Notes from the profile's inline state. */
function xiaohongshuPostsFromState(
  userStore: Record<string, unknown>,
  pageHref: string,
  uid: string,
): CapturedAccountPost[] {
  const posts: CapturedAccountPost[] = []
  for (const note of xiaohongshuNoteCardsOf(userStore)) {
    const post = xiaohongshuPostFromCard(note, pageHref, uid)
    if (post !== null) posts.push(post)
  }
  return dedupePosts(posts)
}

/** Permalink of one rendered card, read from its own href (token preserved). */
function xiaohongshuCardLinkOf(
  card: Element,
  pageHref: string,
): { noteId: string, url: string } | null {
  const candidates: { noteId: string, url: string, token: string }[] = []
  for (const anchor of card.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    // The raw href is used as-is: a hand-built address would drop the note's
    // `xsec_token`, and 小红书 refuses to open a note without it.
    const absolute = absoluteHttpUrl(anchor.getAttribute('href'), pageHref)
    if (absolute === null) continue
    const parsed = new URL(absolute)
    const match = XIAOHONGSHU_EXPLORE_PATH_RE.exec(parsed.pathname)
      ?? XIAOHONGSHU_CARD_PATH_RE.exec(parsed.pathname)
    if (match === null) continue
    parsed.hash = ''
    candidates.push({
      noteId: match[1],
      url: parsed.href,
      token: parsed.searchParams.get('xsec_token') ?? '',
    })
  }
  const first = candidates.at(0)
  if (first === undefined) return null
  // The measured card renders a bare `/explore/<id>` link plus a visible link
  // carrying the token (shaped `/user/profile/<author>/<id>?xsec_token=…`). The
  // tokenized address is the one that opens the note, so it wins — but only
  // when it is about this card's note.
  const tokenized = candidates.find(
    (candidate) => candidate.token !== '' && candidate.noteId === first.noteId,
  )
  return tokenized ?? first
}

/** Cover image of one rendered card, or `null`.
 *
 * The card's own cover comes first (`.cover img`); a bare first-image scan is
 * the fallback, and it skips the author avatar the card may render above the
 * cover — an avatar as `cover_url` would show the wrong picture on every row.
 */
function xiaohongshuCardCoverOf(card: Element, pageHref: string): { url: string | null, alt: string } {
  const cover = card.querySelector<HTMLImageElement>('.cover img, a.cover img, .note-cover img')
  const image = cover ?? Array.from(card.querySelectorAll<HTMLImageElement>('img[src], img[data-src]'))
    .find((candidate) => {
      const src = candidate.getAttribute('src') ?? candidate.getAttribute('data-src') ?? ''
      return !/avatar|profile_images/i.test(src)
    })
  const url = absoluteHttpUrl(
    image?.getAttribute('src') ?? image?.getAttribute('data-src'),
    pageHref,
  )
  return { url, alt: image?.getAttribute('alt') ?? '' }
}

/**
 * The profile grid's card selector.
 *
 * `section.note-item` is the measured class; `section:has(a[href*="/explore/"])`
 * catches a build that renames it. `:has()` throws a SyntaxError where it is
 * unsupported (rather than matching nothing), so it is only used when the
 * engine advertises it — a capture must never die on a selector.
 */
function xiaohongshuCardSelector(doc: Document): string {
  const supportsHas = doc.defaultView?.CSS?.supports?.('selector(:has(a))') === true
  return supportsHas
    ? 'section.note-item, section:has(a[href*="/explore/"])'
    : 'section.note-item'
}

/** Notes from the rendered profile grid (`section.note-item`). */
function xiaohongshuPostsFromDom(
  doc: Document,
  pageHref: string,
): CapturedAccountPost[] {
  const posts: CapturedAccountPost[] = []
  const cards = doc.querySelectorAll<HTMLElement>(xiaohongshuCardSelector(doc))
  for (const card of cards) {
    const link = xiaohongshuCardLinkOf(card, pageHref)
    if (link === null) continue
    const { url: cover, alt } = xiaohongshuCardCoverOf(card, pageHref)
    const content = firstNonEmpty(
      textOf(card.querySelector('.footer .title, .title, a.title')),
      alt,
    )
    const stats: CapturedAccountPost['stats'] = {}
    const likes = counterOf(textOf(card.querySelector('.like-wrapper .count, .like-wrapper')))
    if (likes !== null) stats.likes = likes
    const media: CapturedAccountPost['media'] = []
    if (cover !== null) media.push({ type: 'image', url: cover })
    const video = absoluteHttpUrl(card.querySelector<HTMLVideoElement>('video')?.getAttribute('src'), pageHref)
    if (video !== null) media.push({ type: 'video', url: video })
    posts.push({
      platform_post_id: link.noteId,
      source_url: link.url,
      title: titleFromText(content),
      content,
      // The rendered card carries no publish time.
      posted_at: null,
      stats,
      media: uniqueMedia(media),
    })
  }
  return dedupePosts(posts)
}

/**
 * Counter rendered as `<number><label>` in the page text (`1.2万 粉丝`).
 *
 * 小红书 renders the header counters as `关注` / `粉丝` / `获赞与收藏` on
 * `xiaohongshu.com` and as `Follow` / `Followers` / `Likes and saves` on the
 * English build, so both label sets are accepted. {@link countOf} still drops a
 * desensitized `10+`, which keeps a signed-out header from becoming a count.
 */
function xiaohongshuLabeledCounterOf(text: string, label: string): number | null {
  const match = new RegExp(`([0-9][0-9.,]*\\s*[万wWkKmM亿]?)\\s*(?:${label})`).exec(text)
  if (match === null) return null
  return countOf(match[1].replace(/\s+/g, ''))
}

/** Profile fallback from the rendered header (no inline state). */
function xiaohongshuDomProfileOf(doc: Document, pageHref: string): XiaohongshuProfile | null {
  const header = doc.querySelector('.user-info')
  const nickname = textOf(doc.querySelector('.user-info .user-name, .user-name, .user-info h1'))
  const bio = textOf(doc.querySelector('.user-desc, .user-info .desc'))
  const avatar = doc.querySelector<HTMLImageElement>('.user-info img, .avatar-wrapper img')
  const avatarUrl = absoluteHttpUrl(avatar?.getAttribute('src'), pageHref) ?? ''
  if (nickname === '' && bio === '' && avatarUrl === '') return null
  // The counters sit in the header row, not necessarily inside `.user-info`, so
  // the text of the header and then the whole page is searched.
  const text = `${textOf(header)} ${textOf(doc.body)}`
  // The note total is the `笔记` tab's own label (`笔记・12`); no other element
  // on the page carries it.
  const noteTab = /笔记\s*[・·]?\s*([0-9][0-9.,]*\s*[万wWkKmM亿]?)/.exec(text)
  return {
    nickname,
    avatar_url: avatarUrl,
    bio,
    followers: xiaohongshuLabeledCounterOf(text, '粉丝|Followers'),
    following: xiaohongshuLabeledCounterOf(text, '关注|Follow(?!ers)'),
    posts_count: noteTab === null ? null : countOf(noteTab[1].replace(/\s+/g, '')),
  }
}

/** Reads a 小红书 profile page. */
function captureXiaohongshu(
  doc: Document,
  url: URL,
  uid: string,
  capturedAt: string,
): AccountCaptureResult {
  const pageHref = url.href
  const userStore = xiaohongshuUserStoreOf(doc)
  const pageData = userStore === null
    ? null
    : recordOf(piniaValue(userStore['userPageData'] ?? userStore['user_page_data']))
  // `notes` appears only once the store hydrated; a store without it is a page
  // still loading, not an account without notes.
  const notesReady = xiaohongshuNotesReady(userStore)
  const statePosts = userStore === null
    ? []
    : xiaohongshuPostsFromState(userStore, pageHref, uid)
  const posts = statePosts.length > 0
    ? statePosts
    : xiaohongshuPostsFromDom(doc, pageHref)
  const profile = xiaohongshuProfileOf(pageData, pageHref)
    ?? xiaohongshuDomProfileOf(doc, pageHref)
  // Nothing readable at all — no hydrated store and no grid — is a login wall or
  // a half-loaded page; it must never be reported as an empty account.
  if (posts.length === 0 && (profile === null || !notesReady)) return failure('page-incomplete')
  return {
    ok: true,
    account: {
      platform: 'xiaohongshu',
      // The uid from the address is the account's identity; the host compares
      // it with the imported row's handle.
      handle: uid,
      nickname: profile?.nickname ?? '',
      avatar_url: profile?.avatar_url ?? '',
      bio: profile?.bio ?? '',
      followers: profile?.followers ?? null,
      following: profile?.following ?? null,
      posts_count: profile?.posts_count ?? null,
      // Same normalization as the other platforms: deduped by note id, newest
      // first, capped at the merge contract's bound.
      posts: sortedPosts(dedupePosts(posts)).slice(0, MAX_MERGED_POSTS),
      captured_at: capturedAt,
      extractor: 'xiaohongshu-profile',
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
  // A 小红书 profile request without a session is redirected to `/login`; that
  // path carries no uid, and calling it "not a profile" would hide the real
  // reason (the user is signed out) from the account row.
  if (platform === 'xiaohongshu' && url.pathname.startsWith('/login')) {
    return failure('page-incomplete')
  }
  const handle = profileHandleOf(url, platform)
  if (handle === '') return failure('not-profile-page')
  const capturedAt = new Date().toISOString()
  if (platform === 'tiktok') return captureTiktok(doc, url, handle, capturedAt)
  if (platform === 'xiaohongshu') return captureXiaohongshu(doc, url, handle, capturedAt)
  return captureX(doc, url, handle, capturedAt)
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
