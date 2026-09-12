/**
 * Display formatting for the rival workbench.
 *
 * Pure functions with no DOM access, so every branch can be exercised in a unit
 * test instead of through a rendered card.
 */

/**
 * Compact count: 12_300 → `1.2万` (zh) / `12.3K` (en).
 * @param {unknown} value
 * @param {'zh' | 'en'} [locale]
 * @returns {string}
 */
export function formatCount(value, locale = 'zh') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const negative = value < 0
  const abs = Math.abs(value)
  const sign = negative ? '-' : ''
  if (locale === 'en') {
    if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}B`
    if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`
    if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}K`
    return String(value)
  }
  if (abs >= 100_000_000) return `${sign}${trim(abs / 100_000_000)}亿`
  if (abs >= 10_000) return `${sign}${trim(abs / 10_000)}万`
  return String(value)
}

/** @param {number} value */
function trim(value) {
  return String(Math.round(value * 10) / 10)
}

/**
 * `0:31` / `1:02:03` for a duration in seconds.
 * @param {unknown} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Relative time such as `3 天前`. Returns `--` for an unreadable value rather
 * than pretending the post is from today.
 * @param {unknown} iso
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatRelativeTime(iso, nowMs = Date.now()) {
  if (typeof iso !== 'string' || !iso) return '--'
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return '--'
  const diffMs = nowMs - at
  if (diffMs < 0) return '刚刚'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

/**
 * The `±X%` reading of a monitor delta.
 *
 * `null` means "no previous value to compare against" — the first refresh is a
 * baseline — and it must render as such, never as `+0%`.
 * @param {unknown} delta
 * @returns {{ text: string, tone: 'up' | 'down' | 'flat' | 'baseline' }}
 */
export function formatDelta(delta) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return { text: '', tone: 'baseline' }
  if (delta === 0) return { text: '0%', tone: 'flat' }
  const sign = delta > 0 ? '+' : ''
  return { text: `${sign}${trim(delta)}%`, tone: delta > 0 ? 'up' : 'down' }
}

/**
 * Locale key of a refresh state, so the card and the status banner agree.
 * @param {unknown} state
 * @returns {string}
 */
export function stateKey(state) {
  const known = ['idle', 'queued', 'running', 'backoff', 'error', 'paused']
  const value = typeof state === 'string' && known.includes(state) ? state : 'idle'
  return `rivalAccounts.state.${value}`
}

/**
 * Locale key of a refresh interval choice.
 * @param {unknown} hours
 * @returns {string}
 */
export function intervalKey(hours) {
  if (hours === 0) return 'rivalAccounts.interval.manual'
  return `rivalAccounts.interval.${[24, 12, 48].includes(hours) ? hours : 24}`
}

/**
 * Locale key of the activity level an analysis reported.
 * @param {unknown} level
 * @returns {string}
 */
export function activityKey(level) {
  const known = ['low', 'medium', 'high']
  return known.includes(level) ? `rivalAccounts.activity.${level}` : 'rivalAccounts.activity.unknown'
}

/**
 * Platform label key, reusing the module's existing platform names.
 * @param {unknown} platform
 * @returns {string}
 */
export function platformKey(platform) {
  const value = typeof platform === 'string' ? platform.trim().toLowerCase() : ''
  return value ? `platform.${value}` : 'platform.all'
}

/**
 * Shape of a post card, derived once so the panel and any future consumer agree.
 * @param {Record<string, any>} post
 * @returns {{
 *   id: string, title: string, text: string, url: string,
 *   postedAt: string, postedAtText: string, type: string,
 *   durationText: string, hasVideo: boolean, inLibrary: boolean,
 *   stats: Array<{ key: string, label: string, value: string }>,
 *   potential: { flagged: boolean, rules: string[], reasonKeys: string[] },
 * }}
 */
export function toPostView(post, nowMs = Date.now()) {
  const stats = post?.stats || {}
  return {
    id: String(post?.id || ''),
    title: String(post?.title || post?.text || post?.url || post?.id || ''),
    text: String(post?.text || ''),
    url: String(post?.url || ''),
    postedAt: String(post?.posted_at || ''),
    postedAtText: formatRelativeTime(post?.posted_at, nowMs),
    type: String(post?.type || 'text'),
    durationText: formatDuration(post?.duration),
    hasVideo: Boolean(post?.video_local_path || post?.video_url),
    inLibrary: Boolean(post?.in_library),
    stats: [
      { key: 'views', label: 'rivalAccounts.post.views', value: formatCount(stats.views) },
      { key: 'likes', label: 'rivalAccounts.post.likes', value: formatCount(stats.likes) },
      { key: 'comments', label: 'rivalAccounts.post.comments', value: formatCount(stats.comments) },
      { key: 'shares', label: 'rivalAccounts.post.shares', value: formatCount(stats.shares) },
    ],
    potential: {
      flagged: post?.potential?.flagged === true,
      rules: Array.isArray(post?.potential?.rules) ? post.potential.rules : [],
      reasonKeys: Array.isArray(post?.potential?.reason_keys) ? post.potential.reason_keys : [],
    },
  }
}

/**
 * Shape of an account card.
 * @param {Record<string, any>} account
 * @param {number} [nowMs]
 * @returns {{
 *   id: string, handle: string, displayName: string, platform: string,
 *   platformKey: string, tags: string[], followersText: string,
 *   updatedText: string, stateKey: string, intervalKey: string,
 *   errorCode: string | null, errorMessage: string | null,
 *   identityHintKey: string | null, potentialCount: number,
 * }}
 */
export function toAccountView(account, nowMs = Date.now()) {
  const identityUnverified = account?.error_code === 'identity-unverified'
  return {
    id: String(account?.id || ''),
    handle: String(account?.handle || ''),
    displayName: String(account?.nickname || account?.handle || account?.external_id || ''),
    platform: String(account?.platform || ''),
    platformKey: platformKey(account?.platform),
    tags: Array.isArray(account?.tags) ? account.tags : [],
    followersText: formatCount(account?.followers),
    updatedText: formatRelativeTime(account?.last_refresh_at, nowMs),
    stateKey: stateKey(account?.refresh_state),
    intervalKey: intervalKey(account?.refresh_interval_hours),
    errorCode: account?.error_code ?? null,
    errorMessage: account?.error_message ?? null,
    identityHintKey: identityUnverified ? 'rivalAccounts.identity.handleUnverifiedHint' : null,
    potentialCount: Number(account?.potential_post_count) || 0,
  }
}
