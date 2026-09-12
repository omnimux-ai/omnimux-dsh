import { getCanonicalItemKey } from './url-normalizer.js'

const OEMBED_TIMEOUT_MS = 8000
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * `GET` a public JSON endpoint with a hard timeout.
 * Any failure (network, timeout, non-JSON, non-2xx) resolves to null;
 * the fallback chain must never throw into the import flow.
 * @param {string} endpoint absolute http(s) URL
 * @returns {Promise<Record<string, any> | null>}
 */
async function fetchJson(endpoint) {
  try {
    const resp = await fetch(endpoint, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
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
 * @param {string} url
 * @returns {Promise<Record<string, any> | null>}
 */
async function resolveTikTok(url) {
  const tikwm = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)
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

  const oembed = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
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
 * @returns {Promise<Record<string, any> | null>}
 */
async function resolveYouTube(url) {
  const oembed = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
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
 * @returns {Promise<Record<string, any> | null>}
 */
async function resolveTweet(url) {
  const oembed = await fetchJson(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&format=json`)
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
 * @param {{ platform: string, capability?: string, url: string }} params
 * @returns {Promise<Record<string, any> | null>}
 */
export async function fallbackResolveSocial({ platform, capability = 'video', url }) {
  if (!url || typeof url !== 'string') return null

  const resolved = resolvePlatform(platform, url)
  if (resolved === 'tiktok') return resolveTikTok(url)
  if (resolved === 'youtube') return resolveYouTube(url)
  if (resolved === 'x') return resolveTweet(url)

  // instagram / facebook / threads / unknown: no public unauthenticated endpoint.
  return null
}
