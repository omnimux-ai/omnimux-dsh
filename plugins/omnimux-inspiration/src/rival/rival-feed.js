/**
 * Aggregation rules of the 账号监控作品流.
 *
 * The feed is the *cross-account* view of the monitored accounts: one merged,
 * sorted, paginated list of posts, each carrying its author. Every rule here is
 * a pure function with no `fs` and no network, so the ordering, the filtering
 * and the cover fallback chain are asserted in a unit test instead of through a
 * rendered grid.
 *
 * Two of these rules exist because a second implementation would drift:
 *
 * - `feedCoverSrc` is the *only* place a post's cover address is derived. Three
 *   storage shapes exist (downloaded on disk, local file mapped to a Host URL,
 *   still remote) and the client must never assemble a URL out of a path.
 * - `row_id` is `${account_id}:${post_id}`; the same post id can exist on two
 *   accounts and a React key collision would drop a card silently.
 */

import { RIVAL_MEDIA_DIR_NAME, RIVAL_MEDIA_URL_PREFIX } from './constants.js'

/** Default page size of the feed endpoint. */
export const FEED_PAGE_SIZE = 20

/** Upper bound of `page_size`, so one request cannot ask for the whole cache. */
export const FEED_PAGE_SIZE_MAX = 60

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Basename of a path-like value, restricted to characters a media file name may
 * contain. '' when there is nothing usable — a value that could climb out of the
 * media root must yield no URL at all.
 * @param {unknown} value
 * @returns {string}
 */
export function feedFileBasename(value) {
  const raw = text(value).trim()
  if (!raw || raw.includes('..')) return ''
  const tail = raw.split(/[\\/]/).pop() ?? ''
  return /^[A-Za-z0-9._-]+$/.test(tail) ? tail : ''
}

/**
 * Host-relative URL of a post's locally downloaded cover.
 *
 * '' for a row with no local file, and also for one whose recorded path is
 * unusable: guessing a file name for a path this function refused to trust would
 * turn a rejected path into a request anyway. `feedCoverSrc` falls through to
 * the next source instead.
 * @param {Record<string, any>} post
 * @returns {string}
 */
export function localCoverUrl(post) {
  const file = feedFileBasename(post?.cover_local_path)
  if (!file) return ''
  return `${RIVAL_MEDIA_URL_PREFIX}${RIVAL_MEDIA_DIR_NAME}/covers/${file}`
}

/**
 * The single source of a feed row's cover address.
 *
 * Priority: what the Host already downloaded → the local file mapped through the
 * media route → the remote original. An empty answer is a real answer: the card
 * falls back to its placeholder branch, which is better than an address that
 * 404s.
 * @param {Record<string, any>} post
 * @returns {string}
 */
export function feedCoverSrc(post) {
  const downloaded = text(post?.cover_http_url).trim()
  if (downloaded) return downloaded
  const local = text(post?.cover_local_path).trim() ? localCoverUrl(post) : ''
  if (local) return local
  return text(post?.cover_url).trim()
}

/**
 * Display title of a post, with the same fallback order the library rows use.
 * @param {Record<string, any>} post
 * @returns {string}
 */
export function feedTitle(post) {
  const title = text(post?.title).trim()
  if (title) return title
  const body = text(post?.text).trim()
  if (body) return body
  const url = text(post?.url).trim()
  if (url) return url
  return text(post?.id)
}

/**
 * Timestamp of a post as a number, `NaN` when it cannot be read.
 * @param {Record<string, any>} post
 * @returns {number}
 */
export function feedPostedAt(post) {
  return Date.parse(text(post?.posted_at))
}

/**
 * View count of a post; `-1` sorts every unreadable row to the end.
 * @param {Record<string, any>} post
 * @returns {number}
 */
export function feedViews(post) {
  const views = post?.stats?.views
  return typeof views === 'number' && Number.isFinite(views) ? views : -1
}

/**
 * Author block embedded in every feed row.
 *
 * Denormalized on purpose: the grid renders a card with zero follow-up lookups,
 * and a row that outlives its account still knows whose post it was.
 * @param {Record<string, any>} account
 * @param {number} postCount
 */
export function toAccountRef(account, postCount) {
  return {
    id: text(account?.id),
    nickname: text(account?.nickname),
    handle: text(account?.handle),
    platform: text(account?.platform),
    avatar_url: text(account?.avatar_url),
    profile_url: text(account?.profile_url),
    post_count: Number.isFinite(postCount) ? postCount : 0,
  }
}

/**
 * One aggregated feed row.
 * @param {Record<string, any>} post
 * @param {Record<string, any>} account
 * @returns {Record<string, any>}
 */
export function toFeedRow(post, account) {
  const accountId = text(account?.id)
  const postId = text(post?.id)
  const coverSrc = feedCoverSrc(post)
  return {
    id: postId,
    row_id: `${accountId}:${postId}`,
    account_id: accountId,
    title: feedTitle(post),
    text: text(post?.text),
    url: text(post?.url),
    type: text(post?.type),
    posted_at: text(post?.posted_at),
    duration: typeof post?.duration === 'number' ? post.duration : null,
    stats: {
      views: feedViews(post),
      likes: typeof post?.stats?.likes === 'number' ? post.stats.likes : 0,
      comments: typeof post?.stats?.comments === 'number' ? post.stats.comments : 0,
      shares: typeof post?.stats?.shares === 'number' ? post.stats.shares : 0,
    },
    cover_src: coverSrc,
    cover_key: coverSrc,
    cover_url: text(post?.cover_url),
    source_platform: text(account?.platform),
    in_library: post?.in_library === true,
    inspiration_id: post?.inspiration_id ?? null,
    account: toAccountRef(account, 0),
  }
}

/**
 * Whether a row matches the keyword filter.
 *
 * The search box of this tab says「搜索监控账号的作品」, so it matches the post
 * *and* its author: a user typing an account name expects that account's works.
 * @param {Record<string, any>} post
 * @param {Record<string, any>} account
 * @param {unknown} query
 * @returns {boolean}
 */
export function matchesFeedQuery(post, account, query) {
  const q = text(query).trim().toLowerCase()
  if (!q) return true
  const haystack = [
    post?.title,
    post?.text,
    post?.url,
    account?.nickname,
    account?.handle,
    account?.external_id,
  ]
  return haystack.some((value) => text(value).toLowerCase().includes(q))
}

/**
 * Merge every account's cached posts into one filtered row list.
 *
 * Order of operations: keyword filter, platform filter, then the join that
 * attaches each post to its author and counts the author's rows within the
 * filter. Counting after the filters is what makes「N 个作品」on the account row
 * agree with what the grid shows.
 *
 * @param {{
 *   accounts: Array<Record<string, any>>,
 *   postsByAccount: Record<string, Array<Record<string, any>>>,
 *   q?: string,
 *   platform?: string,
 * }} input
 * @returns {Array<Record<string, any>>}
 */
export function mergeAccountPosts(input) {
  const accounts = Array.isArray(input?.accounts) ? input.accounts : []
  const postsByAccount = input?.postsByAccount || {}
  const platform = text(input?.platform).trim()
  const q = input?.q

  // Pass 1 — keep what the filters accept, and count it per account. Counting
  // the survivors rather than the cache is what makes「N 个作品」on an account
  // row agree with the number of cards the same filter puts on screen.
  /** @type {Array<{ post: Record<string, any>, account: Record<string, any> }>} */
  const kept = []
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const account of accounts) {
    if (platform && text(account.platform) !== platform) continue
    const posts = Array.isArray(postsByAccount[account.id]) ? postsByAccount[account.id] : []
    for (const post of posts) {
      if (!post || typeof post !== 'object') continue
      if (!matchesFeedQuery(post, account, q)) continue
      counts.set(account.id, (counts.get(account.id) || 0) + 1)
      kept.push({ post, account })
    }
  }

  // Pass 2 — build the rows, now that every count is final.
  return kept.map(({ post, account }) => {
    const row = toFeedRow(post, account)
    row.account = toAccountRef(account, counts.get(account.id) || 0)
    return row
  })
}

/**
 * Sort rows in place-free fashion: `posted_at` (default) or `views`, both
 * descending, ties broken by `id` descending so the order is stable across
 * requests and pagination cannot repeat or skip a row.
 * @param {Array<Record<string, any>>} rows
 * @param {unknown} sort
 * @returns {Array<Record<string, any>>}
 */
export function sortFeedRows(rows, sort = 'posted_at') {
  const list = Array.isArray(rows) ? rows.slice() : []
  const byViews = sort === 'views'
  return list.sort((a, b) => {
    if (byViews) {
      const left = feedViews(a)
      const right = feedViews(b)
      if (right !== left) return right - left
    } else {
      const left = feedPostedAt(a)
      const right = feedPostedAt(b)
      if (Number.isNaN(left) && !Number.isNaN(right)) return 1
      if (!Number.isNaN(left) && Number.isNaN(right)) return -1
      if (!Number.isNaN(left) && !Number.isNaN(right) && right !== left) return right - left
    }
    const leftId = text(a.id)
    const rightId = text(b.id)
    if (leftId === rightId) return 0
    return leftId < rightId ? 1 : -1
  })
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} max
 * @returns {number}
 */
function pageNumber(value, fallback, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(Math.floor(parsed), max)
}

/**
 * One page of the feed.
 * @param {Array<Record<string, any>>} rows
 * @param {unknown} page
 * @param {unknown} pageSize
 */
export function paginateFeed(rows, page, pageSize) {
  const list = Array.isArray(rows) ? rows : []
  const current = pageNumber(page, 1, Number.MAX_SAFE_INTEGER)
  const size = pageNumber(pageSize, FEED_PAGE_SIZE, FEED_PAGE_SIZE_MAX)
  const start = (current - 1) * size
  const items = list.slice(start, start + size)
  return {
    items,
    total: list.length,
    page: current,
    page_size: size,
    has_more: start + size < list.length,
  }
}
