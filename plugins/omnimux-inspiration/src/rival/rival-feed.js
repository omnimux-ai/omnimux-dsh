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
 * - `feedVelocity` is the only place the growth pill is derived (Issue #3113):
 *   three credibility tiers — measured samples, publish-to-now average, then a
 *   relative-to-account-median proxy. The Host emits facts only
 *   (`tier`/`confidence`/`vph`/`multiplier`/`samples_at`); the pill text and
 *   the tier prefixes are the client's dictionary keys, never Host strings.
 */

import {
  RIVAL_MEDIA_DIR_NAME,
  RIVAL_MEDIA_URL_PREFIX,
  RIVAL_VELOCITY_RANK_FAMILY,
  RIVAL_VELOCITY_TIER_WATCH,
} from './constants.js'

/** Default page size of the feed endpoint. */
export const FEED_PAGE_SIZE = 20

/** 规格 §3.3：实测增速要求最早/最晚有效采样间隔 ≥1.5h。 */
export const VELOCITY_MIN_SAMPLE_SPAN_MS = 1.5 * 3600_000
/** 规格 §3.3 分级阈值：>20k 爆款 / ≥1k 飙升 / ≥200 观察 / <200 不渲染。 */
export const VELOCITY_TIER_HOT = 20_000
export const VELOCITY_TIER_RISING = 1_000
/** §3.3 速率族下限：真源在 constants.js，此处 re-export 保持既有引用路径。 */
export const VELOCITY_TIER_WATCH = RIVAL_VELOCITY_TIER_WATCH
/** PRD §5.1 C 档：views ≥ 3× 账号历史播放中位数才记为「该号 Nx」。 */
export const VELOCITY_RELATIVE_MIN_MULTIPLIER = 3

/** @param {unknown} value */
function buildViewsHistory(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => entry && typeof entry === 'object'
      && typeof entry.at === 'string' && typeof entry.views === 'number'
      && Number.isFinite(entry.views))
    .map((entry) => ({ at: entry.at, views: entry.views }))
}

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
 * Median view count of an account's posts — the baseline of the relative
 * confidence tier. `0` when nothing readable exists: a median of zero would
 * make every post an infinite outlier, so callers treat it as "no baseline".
 * @param {Array<Record<string, any>>} posts
 * @returns {number}
 */
export function feedMedianViews(posts) {
  const values = (Array.isArray(posts) ? posts : [])
    .map((row) => row?.stats?.views)
    .filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
  if (values.length === 0) return 0
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle]
}

/**
 * Display tier of an hourly rate, or `''` when the rate is below the watch
 * band (§3.3: `<200` renders no pill).
 * @param {number} vph
 * @returns {'' | 'hot' | 'rising' | 'watch'}
 */
function velocityTier(vph) {
  if (vph > VELOCITY_TIER_HOT) return 'hot'
  if (vph >= VELOCITY_TIER_RISING) return 'rising'
  if (vph >= VELOCITY_TIER_WATCH) return 'watch'
  return ''
}

/**
 * The one growth signal a feed row carries (Issue #3113).
 *
 * Credibility degrades strictly: measured — publish-to-now average — relative
 * to the account's own median. Every failure mode (short sample span, views
 * rollback, unparseable or future timestamps, missing baseline) degrades to
 * the next tier instead of throwing or fabricating a number; `null` means the
 * card renders no pill and the velocity sort sinks it to the end. A rate that
 * computes but lands below the §3.3 display floor is one of those failure
 * modes too: the floor rejects the *rate family* only — it never vetoes the
 * relative family, so a below-floor measured or average rate degrades onward
 * instead of short-circuiting to `null` (PM 裁定甲案, #3113 修复轮 R3).
 *
 * The Host emits facts only. `samples_at` carries the two endpoints the
 * measured tier was read from (oldest→newest); the detail dialog and the pill
 * text are the client's to format.
 * @param {Record<string, any>} post  a stored post row or a feed row
 * @param {{ now?: string | number, medianViews?: number }} [opts]
 * @returns {{ confidence: 'measured'|'average'|'relative', tier: string,
 *   vph?: number, multiplier?: number, samples_at?: [string, string] } | null}
 */
export function feedVelocity(post, opts = {}) {
  const now = typeof opts.now === 'number' && Number.isFinite(opts.now)
    ? opts.now
    : Date.parse(typeof opts.now === 'string' ? opts.now : '')
  if (!Number.isFinite(now)) return null
  const views = post?.stats?.views
  const viewsReadable = typeof views === 'number' && Number.isFinite(views)

  // A · measured: ≥2 valid samples spanning ≥1.5h, oldest→newest. A views
  // rollback is a data anomaly, never a negative speed — degrade, don't sign
  // it (and never crash on malformed history entries). A sample stamped in
  // the future degrades the same way an unparseable one does: a clock lying
  // forward is still a clock lying.
  const samples = buildViewsHistory(post?.metrics?.views_history ?? post?.views_history)
    .map((entry) => ({ at: Date.parse(entry.at), views: entry.views }))
    .filter((entry) => Number.isFinite(entry.at) && entry.at <= now)
    .sort((a, b) => a.at - b.at)
  if (samples.length >= 2) {
    const first = samples[0]
    const last = samples[samples.length - 1]
    const span = last.at - first.at
    const delta = last.views - first.views
    // 回滚检测必须逐对看相邻采样，不能只看首末：`1000 → 500 → 1500` 的
    // 端点 delta 为正，只看端点会把一段含回滚的历史签成 measured，与上面
    // 「degrade, don't sign it」的约定相反（R3-M-C）。
    let hasRollback = false
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].views < samples[i - 1].views) {
        hasRollback = true
        break
      }
    }
    if (span >= VELOCITY_MIN_SAMPLE_SPAN_MS && delta >= 0 && !hasRollback) {
      const vph = (delta / span) * 3600_000
      const tier = velocityTier(vph)
      if (tier) {
        return {
          confidence: 'measured',
          tier,
          vph: Math.round(vph * 10) / 10,
          samples_at: [new Date(first.at).toISOString(), new Date(last.at).toISOString()],
        }
      }
      // 低于 200/h 下限：「未产出速率族胶囊」是 A 档的一种失败形态——
      // 不 return null，照 B 档同构继续下沉走 C 档判定（PM 裁定甲案：
      // 200/h 是跨账号绝对门，只否决速率族，不兼任相对族否决器）。
    }
  }

  // B · publish-to-now average. A post with an unreadable or future timestamp
  // has no age to divide by — degrade, never divide by a negative or zero.
  if (viewsReadable) {
    const bornAt = Date.parse(text(post?.posted_at))
    const ageFrom = Number.isFinite(bornAt) ? bornAt : Date.parse(text(post?.first_seen_at))
    const ageMs = Number.isFinite(ageFrom) ? now - ageFrom : NaN
    if (Number.isFinite(ageMs) && ageMs > 0) {
      const vph = (views / ageMs) * 3600_000
      // 「<200 不渲染」是对速率族胶囊存在性的规定，A/B 两档一致适用
      // 且后果一致——落空即继续下沉（PM 终验 §7.3 + 本轮甲案裁定）：
      // 均速 33/h 一类噪音胶囊既不构成「值得看」的判断，又会让唯一
      // 带色信号贬值；规格给的兜底出口是仅指标行累计播放。
      if (vph >= VELOCITY_TIER_WATCH) {
        return {
          confidence: 'average',
          tier: 'average',
          vph: Math.round(vph * 10) / 10,
        }
      }
      // 低于下限不落 B 档，继续走 C 档判定——相对中位数的爆发信号
      // 仍是合法信号（倍数族不受 200/h 约束）。
    }

    // C · relative to the account's own median. Only a real baseline and a
    // real outlier qualify — a multiplier below the burst gate reads as no
    // signal rather than as a small badge.
    const median = typeof opts.medianViews === 'number' && Number.isFinite(opts.medianViews)
      ? opts.medianViews
      : 0
    if (median > 0) {
      const multiplier = views / median
      if (multiplier >= VELOCITY_RELATIVE_MIN_MULTIPLIER) {
        return {
          confidence: 'relative',
          tier: 'relative',
          multiplier: Math.round(multiplier * 10) / 10,
        }
      }
    }
  }
  return null
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
    ratio: Number.isFinite(post?.ratio) ? post.ratio : null,
    stats: {
      views: feedViews(post),
      likes: typeof post?.stats?.likes === 'number' ? post.stats.likes : 0,
      comments: typeof post?.stats?.comments === 'number' ? post.stats.comments : 0,
      shares: typeof post?.stats?.shares === 'number' ? post.stats.shares : 0,
    },
    cover_src: coverSrc,
    cover_key: coverSrc,
    cover_url: text(post?.cover_url),
    // 增速原料不随行下发：mergeAccountPosts 把原始 post 传给 feedVelocity
    //（需要全账号中位数，计算在第二阶段），wire 行只带 velocity 结论——
    // views_history/first_seen_at 透传只增 wire 体积（四轴 M5 死载荷）。
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
 *   now?: string | number,
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

  // Pass 2 — build the rows, now that every count is final. The velocity tier
  // needs two things only this stage knows: the clock (`now`, injected so the
  // feed never reads wall time inside a pure function) and each account's
  // median views over ITS OWN cached list — the relative tier's baseline is
  // the account's history, not the filtered slice.
  //
  // The median is computed ONCE per account, not once per row (R3-M-B):
  // `feedMedianViews` sorts the account's whole cached list (up to
  // POSTS_CACHE_MAX_ROWS), so calling it inside the map re-sorts the same
  // history once for every visible row of that account — O(rows × posts log
  // posts) per feed request, on a poll that fires every few seconds.
  const now = input?.now ?? new Date().toISOString()
  const medianByAccount = new Map()
  for (const { account } of kept) {
    if (medianByAccount.has(account.id)) continue
    medianByAccount.set(account.id, feedMedianViews(postsByAccount[account.id]))
  }
  return kept.map(({ post, account }) => {
    const row = toFeedRow(post, account)
    row.account = toAccountRef(account, counts.get(account.id) || 0)
    row.velocity = feedVelocity(post, {
      now,
      medianViews: medianByAccount.get(account.id),
    })
    return row
  })
}

/**
 * Sortable position of a row's velocity descriptor as a [family, value]
 * tuple (#3113, 分桶).
 *
 * 二元组族序而非数值基数：速率族（`vph >= VELOCITY_TIER_WATCH`，与
 * 客户端谓词/文案共享的同一个 200/h 地板）恒先于相对族（任何
 * `multiplier > 0`），两者恒先于无信号。上一版 `1e9 + vph` 的基数
 * 方案给相对族 multiplier 设了一个隐含上界——multiplier > 1e9 + vph
 * 时相对族会压过速率族；二元组比较把这个软边界换成硬保证。而更早
 * 的 `vph > 0` 门则会把宿主不可产出的 (0,200) 手造描述排进速率族——
 * 入桶门与渲染门必须同值。
 * @param {Record<string, any>} row
 * @returns {[number, number]} `[family, value]`; family per `RIVAL_VELOCITY_RANK_FAMILY`
 */
function velocityRankKey(row) {
  const velocity = row?.velocity
  if (!velocity || typeof velocity !== 'object') return [RIVAL_VELOCITY_RANK_FAMILY.none, 0]
  if (Number.isFinite(velocity.vph) && velocity.vph >= VELOCITY_TIER_WATCH) {
    return [RIVAL_VELOCITY_RANK_FAMILY.rate, velocity.vph]
  }
  if (Number.isFinite(velocity.multiplier) && velocity.multiplier > 0) {
    return [RIVAL_VELOCITY_RANK_FAMILY.relative, velocity.multiplier]
  }
  return [RIVAL_VELOCITY_RANK_FAMILY.none, 0]
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
  const byVelocity = sort === 'velocity'
  return list.sort((a, b) => {
    if (byViews) {
      const left = feedViews(a)
      const right = feedViews(b)
      if (right !== left) return right - left
    } else if (byVelocity) {
      const left = velocityRankKey(a)
      const right = velocityRankKey(b)
      if (right[0] !== left[0]) return right[0] - left[0]
      if (right[1] !== left[1]) return right[1] - left[1]
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
