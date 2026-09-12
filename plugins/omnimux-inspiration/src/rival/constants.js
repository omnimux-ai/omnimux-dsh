/**
 * Single source of truth for the "对标账号" (rival accounts) module.
 *
 * Every threshold, limit, backoff step, candidate payload key, error code and
 * locale-key constant lives here. Sibling `rival-*.js` modules import from this
 * file and must not inline the literal themselves — a scattered literal is how a
 * cost ceiling silently drifts.
 *
 * Dependency rule: this module imports nothing (no `fs`, no `fetch`), so any
 * consumer — Host or client-side test — can load it offline.
 */

/** Platform slugs served by the OmniMux cloud social-data catalog. */
export const RIVAL_PLATFORMS = Object.freeze(['tiktok', 'instagram', 'youtube', 'x'])

/** Directory and file naming. Data and media are two separate trees. */
export const RIVAL_DATA_DIR_NAME = 'rival-accounts'
export const RIVAL_MEDIA_DIR_NAME = 'rival-accounts'
export const RIVAL_MEDIA_KINDS = Object.freeze(['covers', 'avatars', 'videos'])

/** Identifier and URL shape of the module's own namespace. */
export const RIVAL_ID_PREFIX = 'riv_'
export const RIVAL_MEDIA_URL_PREFIX = '/omnimux/inspiration/local/media/'
export const RIVAL_IDENTITY_TAG = 'rival:'

/** Refresh cadence. `0` means "manual only". */
export const REFRESH_INTERVAL_HOURS_DEFAULT = 24
export const REFRESH_INTERVAL_CHOICES = Object.freeze([24, 12, 48, 0])

/**
 * Semantics: an upper bound on the rows a single refresh *processes* from the
 * cloud answer, applied locally. It is not a request parameter — the cloud tool
 * contract carries no row limit (see the design document's open item 5).
 */
export const POSTS_PER_REFRESH = 20

/** Hard cost limits. The first one is the per-refresh cost contract. */
export const LIMIT_CALLS_PER_ACCOUNT_CYCLE = 2
export const LIMIT_CALLS_PER_ACCOUNT_DAY = 4
export const LIMIT_CALLS_GLOBAL_DAY = 50

/** Failure backoff, in minutes; running out of steps is the `error` terminal state. */
export const BACKOFF_MINUTES = Object.freeze([5, 15, 60])

/** Manual refresh rate limits, in minutes. */
export const MANUAL_COOLDOWN_MINUTES = Object.freeze({ single: 10, all: 30 })

export const POSTS_CACHE_MAX_ROWS = 500
export const VIEWS_HISTORY_MAX = 30

/** Scheduler cadence and freshness window. */
export const TICK_INTERVAL_MS = 60_000
export const CLIENT_POLL_INTERVAL_MS = 2_500
export const REFRESH_STALE_AFTER_MS = 120_000

/** Potential (潜力) scoring thresholds — see `rival-potential.js`. */
export const POTENTIAL_MIN_SAMPLES = 3
export const POTENTIAL_VIEWS_MULTIPLIER = 3
export const POTENTIAL_GROWTH_PCT = 50
export const POTENTIAL_GROWTH_MIN_VIEWS = 1000
export const POTENTIAL_LIKE_RATE_MULTIPLIER = 2

/**
 * Refresh states. `queued`/`running` are transient; `backoff` counts failures;
 * `paused` is the budget终态 and `error` stops automatic refresh for that account.
 */
export const REFRESH_STATES = Object.freeze(['idle', 'queued', 'running', 'backoff', 'error', 'paused'])

/** Account identity kinds. `handle-unverified` is the YouTube `@handle`降级 marker. */
export const IDENTITY_KINDS = Object.freeze(['channel_id', 'handle-verified', 'handle-unverified', 'username', 'uid'])

/** Host error codes (HTTP status in parentheses) — see §7.2 of the design document. */
export const RIVAL_ERROR_CODES = Object.freeze({
  UNRECOGNIZED_URL: 'unrecognized-url', // 400
  IDENTITY_UNRESOLVED: 'identity-unresolved', // 422
  ACCOUNT_NOT_FOUND: 'account-not-found', // 404
  POST_NOT_FOUND: 'post-not-found', // 404
  INVALID_INTERVAL: 'invalid-interval', // 400
  MANUAL_COOLDOWN: 'manual-cooldown', // 429
  BUDGET_EXHAUSTED: 'refresh-budget-exhausted', // 429
  CLOUD_ERROR: 'cloud-error', // 502
  NO_CONTENT: 'no-content', // 422
  IDENTITY_UNVERIFIED: 'identity-unverified', // account state, not an HTTP code
  QUOTA_EXCEEDED: 'quota-exceeded', // 402, forwarded from the hub
  NEEDS_OMNIMUX: 'needs-omnimux', // 401, forwarded from the hub
  NO_MEDIA: 'no-media', // 409, "add to session" found nothing to attach
})

/** Budget ledgers a pause can be attributed to. */
export const BUDGET_REASONS = Object.freeze({
  GLOBAL_DAILY_CAP: 'global-daily-cap',
  ACCOUNT_DAILY_CAP: 'account-daily-cap',
  PER_CYCLE_CAP: 'per-cycle-cap',
})

/** Refresh states that will not schedule themselves again until the user acts. */
export const TERMINAL_REFRESH_STATES = Object.freeze(['error'])

/** Cloud capability names of the social-data tool. */
export const CLOUD_CAPABILITY_USER = 'user'
export const CLOUD_CAPABILITY_POSTS = 'posts'

/**
 * Account-level and post-level fields an envelope is probed for. Order is the
 * probe order: the first key that carries a usable value wins and its name is
 * recorded in `field_probe`.
 *
 * Only keys the plugin already reads elsewhere (the import pipeline's envelope
 * unwrapping) are listed. This is a *probe*, not a guess: a key that never fires
 * stays `null` in `field_probe` and is reported back instead of being silently
 * replaced by an invented default.
 */
export const POST_FIELD_CANDIDATES = Object.freeze({
  id: Object.freeze(['id', 'post_id', 'aweme_id', 'shortCode', 'shortcode', 'pk', 'cid', 'tweet_id', 'rest_id', 'videoId']),
  short_code: Object.freeze(['shortCode', 'shortcode', 'code', 'aweme_id', 'pk', 'tweet_id', 'rest_id']),
  url: Object.freeze(['url', 'post_url', 'share_url', 'webVideoUrl', 'permalink', 'link', 'expanded_url']),
  title: Object.freeze(['title', 'desc', 'description', 'name', 'text']),
  text: Object.freeze(['text', 'desc', 'description', 'content', 'caption', 'full_text', 'title']),
  posted_at: Object.freeze(['create_time', 'createTime', 'taken_at', 'taken_at_timestamp', 'timestamp', 'created_at', 'publishedAt', 'publish_time', 'date']),
  cover_url: Object.freeze(['cover_url', 'cover', 'thumbnail_url', 'thumbnail', 'origin_cover', 'display_url', 'thumbnail_src', 'image_url', 'first_frame']),
  video_url: Object.freeze(['video_url', 'play_url', 'download_url', 'downloadAddr', 'play_addr', 'video_link', 'playAddr']),
  duration: Object.freeze(['duration', 'video_duration', 'length', 'videoDuration', 'duration_seconds']),
  type: Object.freeze(['type', 'media_type', 'mediaType', 'aweme_type', 'post_type']),
  views: Object.freeze(['view_count', 'play_count', 'views', 'viewCount', 'playCount', 'video_view_count']),
  likes: Object.freeze(['digg_count', 'like_count', 'favorite_count', 'likes', 'likeCount', 'diggCount', 'likes_count']),
  comments: Object.freeze(['comment_count', 'reply_count', 'comments', 'commentCount', 'replyCount']),
  shares: Object.freeze(['share_count', 'retweet_count', 'repost_count', 'shares', 'shareCount', 'retweetCount']),
  saves: Object.freeze(['collect_count', 'save_count', 'saves', 'collectCount', 'bookmark_count']),
  images: Object.freeze(['images', 'image_versions2', 'video_versions', 'photo_images', 'pictures']),
})

/** Account-level field candidates, probed from the `user` capability answer. */
export const USER_FIELD_CANDIDATES = Object.freeze({
  nickname: Object.freeze(['nickname', 'nick_name', 'name', 'full_name', 'display_name', 'title']),
  avatar_url: Object.freeze(['avatar_url', 'avatar', 'avatar_larger', 'avatar_thumb', 'profile_pic_url', 'profile_picture', 'thumbnail']),
  bio: Object.freeze(['signature', 'bio', 'description', 'desc', 'biography', 'channel_description']),
  followers: Object.freeze(['follower_count', 'followers', 'followerCount', 'subscriber_count', 'subscriberCount', 'fans', 'fans_count', 'edge_followed_by']),
  posts_count: Object.freeze(['video_count', 'aweme_count', 'post_count', 'media_count', 'videosCount', 'posts_count']),
  external_id_canonical: Object.freeze(['channel_id', 'id', 'sec_uid', 'uid', 'rest_id', 'user_id', 'pk']),
})

/** Locale keys the Host-side modules must be able to name without a locale import. */
export const RIVAL_LOCALE_KEYS = Object.freeze({
  IDENTITY_HANDLE_UNVERIFIED: 'rivalAccounts.identity.handleUnverifiedHint',
  SKIP_BUDGET: 'rivalAccounts.skip.budget',
  SKIP_COOLDOWN: 'rivalAccounts.skip.cooldown',
  SKIP_ACCOUNT_ERROR: 'rivalAccounts.skip.accountError',
  ERROR_CLOUD: 'rivalAccounts.error.cloud',
  ERROR_LOGIN: 'rivalAccounts.error.login',
  ERROR_TOOL_MISSING: 'rivalAccounts.error.toolMissing',
})

/** Marker written into `field_probe` when a candidate key never fired. */
export const FIELD_PROBE_MISS = null

/**
 * Keys the hub's empty sentinel carries (`{ text: null }`). An envelope whose
 * keys are all in here has no content, so a refresh must classify it as
 * `no-content` instead of storing an empty post list.
 */
export const EMPTY_PAYLOAD_KEYS = Object.freeze(['text', 'code', 'message', 'msg', 'status'])

/** Cloud-file extension table used when a media URL carries no usable suffix. */
export const DEFAULT_COVER_EXT = '.jpg'
export const DEFAULT_VIDEO_EXT = '.mp4'
