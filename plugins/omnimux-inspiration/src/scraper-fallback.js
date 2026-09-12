import { getCanonicalItemKey } from './url-normalizer.js'

/**
 * Public no-key fallback resolver for social links.
 *
 * NETWORK EGRESS: this module sends the URL the user is importing to
 * third-party public endpoints — `www.tikwm.com` (TikTok stream resolver),
 * `www.tiktok.com`, `www.youtube.com` and `publish.twitter.com` (oEmbed). The
 * request carries the post URL and a browser user agent, and nothing else: no
 * credentials, no API keys and no library content. Set
 * `OMNIMUX_INSPIRATION_SOCIAL_FALLBACK=off` to keep every imported URL on this
 * machine; the import then relies on the OmniMux cloud resolver alone. The same
 * behaviour is documented in the plugin README.
 */

const OEMBED_TIMEOUT_MS = 8000

/**
 * Total wall-clock budget for one fallback resolution. TikTok needs two serial
 * requests, so per-request timeouts alone could block the import for twice the
 * per-request budget; the shared deadline keeps the worst case bounded.
 */
const FALLBACK_BUDGET_MS = 10_000

/** Local switch for the outbound requests above. */
export const FALLBACK_SWITCH_ENV = 'OMNIMUX_INSPIRATION_SOCIAL_FALLBACK'

const DISABLING_VALUES = new Set(['off', '0', 'false', 'no'])

/**
 * Whether the outbound fallback resolvers may run.
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isSocialFallbackEnabled(env = /** @type {any} */ (process).env) {
  const raw = String(env?.[FALLBACK_SWITCH_ENV] ?? '').trim().toLowerCase()
  return !DISABLING_VALUES.has(raw)
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * `GET` a public JSON endpoint with a hard timeout drawn from the shared budget.
 * Any failure (network, timeout, non-JSON, non-2xx) resolves to null;
 * the fallback chain must never throw into the import flow.
 * @param {string} endpoint absolute http(s) URL
 * @param {number} deadline epoch ms after which no request may start
 * @returns {Promise<Record<string, any> | null>}
 */
async function fetchJson(endpoint, deadline) {
  const budget = Math.min(OEMBED_TIMEOUT_MS, deadline - Date.now())
  if (budget <= 0) return null
  try {
    const resp = await fetch(endpoint, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(budget),
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return json && typeof json === 'object' ? json : null
  } catch {
    return null
  }
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Strip tags from an oEmbed `html` block and decode the entities it commonly uses. */
function textFromHtml(html) {
  return asText(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** Handle embedded in an oEmbed `author_url`, e.g. https://x.com/creator -> creator. */
function handleFromAuthorUrl(authorUrl) {
  const match = asText(authorUrl).match(/(?:x|twitter|youtube|instagram)\.com\/@?([^/?#]+)/i)
  return match && match[1] ? match[1] : ''
}

/**
 * Resolve the platform from the caller hint, falling back to URL detection.
 * @param {string} platform
 * @param {string} url
 * @returns {string}
 */
function resolvePlatform(platform, url) {
  if (platform && platform !== 'unknown') return platform
  const detected = getCanonicalItemKey(url).platform
  return detected === 'unknown' ? '' : detected
}

/**
 * TikTok: tikwm direct stream resolver, then the official oEmbed for title/cover.
 * Both requests share one deadline, so a slow resolver cannot double the wait.
 * @param {string} url
 * @param {number} deadline
 * @returns {Promise<Record<string, any> | null>}
 */
async function resolveTikTok(url, deadline) {
  const tikwm = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, deadline)
  const payload = tikwm && tikwm.data ? tikwm.data : null
  if (payload) {
    const videoUrl = payload.play || payload.wmplay || payload.hdplay || (Array.isArray(payload.videos) ? payload.videos[0] : '')
    if (videoUrl) {
      return {
        platform: 'tiktok',
        capability: 'video',
        data: {
          title: payload.title || url,
          text: payload.title || '',
          cover_url: payload.cover || payload.origin_cover || '',
          video_url: videoUrl,
          author: payload.author ? {
            id: String(payload.author.id || ''),
            handle: String(payload.author.unique_id || ''),
            name: String(payload.author.nickname || ''),
            avatar: String(payload.author.avatar || ''),
          } : {},
          stats: {
            likes: Number(payload.digg_count) || 0,
            comments: Number(payload.comment_count) || 0,
            shares: Number(payload.share_count) || 0,
            views: Number(payload.play_count) || 0,
          },
        },
      }
    }
  }

  const oembed = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, deadline)
  if (oembed && oembed.title) {
    return {
      platform: 'tiktok',
      capability: 'video',
      data: {
        title: oembed.title,
        text: oembed.title,
        cover_url: oembed.thumbnail_url || '',
        video_url: '',
        author: {
          name: oembed.author_name || '',
          handle: oembed.author_unique_id || '',
        },
      },
    }
  }
  return null
}

/**
 * YouTube: public oEmbed returns title / author / cover but never a video stream,
 * which is a normal outcome that degrades the import to a link item.
 * @param {string} url
 * @param {number} deadline
 * @returns {Promise<Record<string, any> | null>}
 */
async function resolveYouTube(url, deadline) {
  const oembed = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, deadline)
  if (!oembed) return null
  const title = asText(oembed.title)
  const coverUrl = asText(oembed.thumbnail_url)
  const authorName = asText(oembed.author_name)
  if (!title && !coverUrl && !authorName) return null
  return {
    platform: 'youtube',
    capability: 'video',
    data: {
      title,
      text: title,
      cover_url: coverUrl,
      video_url: '',
      author: {
        name: authorName,
        handle: handleFromAuthorUrl(oembed.author_url),
      },
    },
  }
}

/**
 * X / Twitter: publish oEmbed returns author and post text (no media stream).
 * @param {string} url
 * @param {number} deadline
 * @returns {Promise<Record<string, any> | null>}
 */
async function resolveTweet(url, deadline) {
  const oembed = await fetchJson(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&format=json`, deadline)
  if (!oembed) return null
  const authorName = asText(oembed.author_name)
  const tweetText = asText(oembed.text) || textFromHtml(oembed.html)
  if (!authorName && !tweetText) return null
  const firstLine = tweetText.split('\n').map((line) => line.trim()).filter(Boolean)[0] || ''
  return {
    platform: 'x',
    capability: 'tweet',
    data: {
      title: firstLine,
      text: tweetText,
      cover_url: '',
      video_url: '',
      author: {
        name: authorName,
        handle: handleFromAuthorUrl(oembed.author_url),
      },
    },
  }
}

/**
 * Fallback direct resolver for social media video links.
 * Provides resilient extraction when the cloud gateway upstream scraper
 * encounters 422 / rate-limits. Every branch is best-effort: a failure
 * resolves to null instead of throwing into the import flow.
 *
 * Instagram, Facebook and Threads expose no public unauthenticated metadata
 * endpoint, so they deliberately return null here and let the caller report
 * an actionable message.
 * @param {{ platform: string, capability?: string, url: string, allowNetwork?: boolean }} params
 * @returns {Promise<Record<string, any> | null>}
 */
export async function fallbackResolveSocial({ platform, capability = 'video', url, allowNetwork }) {
  if (!url || typeof url !== 'string') return null
  const networkAllowed = allowNetwork ?? isSocialFallbackEnabled()
  if (!networkAllowed) return null

  const resolved = resolvePlatform(platform, url)
  if (resolved !== 'tiktok' && resolved !== 'youtube' && resolved !== 'x') {
    // instagram / facebook / threads / unknown: no public unauthenticated endpoint.
    return null
  }

  const deadline = Date.now() + FALLBACK_BUDGET_MS
  if (resolved === 'tiktok') return resolveTikTok(url, deadline)
  if (resolved === 'youtube') return resolveYouTube(url, deadline)
  return resolveTweet(url, deadline)
}
