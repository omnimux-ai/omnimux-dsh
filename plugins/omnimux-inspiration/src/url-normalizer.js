/**
 * Normalizes URLs and extracts platform-specific canonical keys
 * to prevent duplicate social media inspirations.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igsh',
  'is_from_webapp',
  'sender_device',
  'sender_web_id',
  'feature',
  'si',
  't',
  's',
  'ref',
  'source',
  'share_app_id',
  'share_item_id',
  'share_link_id',
])

/**
 * Host substring -> platform mapping. Host-based (not full-URL) matching keeps
 * `fb.watch` and `threads.com` distinct from unrelated query strings.
 * Single source of truth: both `detectPlatformFromUrl` and the HTTP route layer
 * import from here.
 */
export const PLATFORM_PATTERNS = [
  { test: 'tiktok.com', platform: 'tiktok' },
  { test: 'instagram.com', platform: 'instagram' },
  { test: 'youtube.com', platform: 'youtube' },
  { test: 'youtu.be', platform: 'youtube' },
  { test: 'x.com', platform: 'x' },
  { test: 'twitter.com', platform: 'x' },
  { test: 'facebook.com', platform: 'facebook' },
  { test: 'fb.watch', platform: 'facebook' },
  { test: 'fb.com', platform: 'facebook' },
  { test: 'threads.net', platform: 'threads' },
  { test: 'threads.com', platform: 'threads' },
]

/** Backwards-compatible alias for the shared pattern table. */
export const KNOWN_PLATFORM_PATTERNS = PLATFORM_PATTERNS

/**
 * Clean tracking query parameters and lowercase domain.
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    parsed.protocol = parsed.protocol.toLowerCase()
    parsed.hostname = parsed.hostname.toLowerCase()

    // Canonicalize common host aliases
    if (parsed.hostname === 'twitter.com' || parsed.hostname === 'www.twitter.com' || parsed.hostname === 'mobile.twitter.com') {
      parsed.hostname = 'x.com'
    }
    if (parsed.hostname === 'www.x.com' || parsed.hostname === 'mobile.x.com') {
      parsed.hostname = 'x.com'
    }
    if (parsed.hostname === 'm.tiktok.com' || parsed.hostname === 'vt.tiktok.com' || parsed.hostname === 'vm.tiktok.com') {
      // keep subdomain if shortlink, but clean query
    }
    if (parsed.hostname === 'm.facebook.com' || parsed.hostname === 'web.facebook.com') {
      parsed.hostname = 'www.facebook.com'
    }
    if (parsed.hostname === 'm.threads.net') {
      parsed.hostname = 'www.threads.net'
    }

    const paramsToRemove = []
    for (const key of parsed.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        paramsToRemove.push(key)
      }
    }
    for (const key of paramsToRemove) {
      parsed.searchParams.delete(key)
    }

    // Remove trailing slash from pathname if not root
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }

    return parsed.toString()
  } catch {
    return trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '')
  }
}

const FACEBOOK_VIDEO_PATTERNS = [
  /facebook\.com\/(?:[^/?#]+\/videos|videos)\/(\d{6,})/i,
  /facebook\.com\/reel\/(\d{6,})/i,
  /facebook\.com\/(?:watch|video\.php)\?(?:[^#]*&)?v=(\d{6,})/i,
]

/**
 * Extract the canonical Facebook video identity.
 * Falls back to the `fb.watch` short code when no numeric video id is present.
 * @param {string} clean normalized URL
 * @returns {{ id: string, canonicalUrl: string } | null}
 */
function facebookVideoKey(clean) {
  for (const pattern of FACEBOOK_VIDEO_PATTERNS) {
    const match = clean.match(pattern)
    if (match && match[1]) {
      return { id: match[1], canonicalUrl: `https://www.facebook.com/watch/?v=${match[1]}` }
    }
  }
  const shortMatch = clean.match(/fb\.watch\/([A-Za-z0-9_-]{4,})/i)
  if (shortMatch && shortMatch[1]) {
    return { id: shortMatch[1], canonicalUrl: `https://fb.watch/${shortMatch[1]}` }
  }
  return null
}

/**
 * Extract platform slug from hostname or URL (e.g. www.bilibili.com -> bilibili).
 * Strips www. / m. / mobile. prefixes, multi-part and single TLDs.
 * @param {string} hostname
 * @returns {string}
 */
export function extractDomainSlug(hostname) {
  if (!hostname || typeof hostname !== 'string') return ''
  let host = hostname.toLowerCase().trim()
  if (host.includes('://') || host.includes('/')) {
    try {
      const parsed = new URL(host.includes('://') ? host : `https://${host}`)
      host = parsed.hostname.toLowerCase()
    } catch {
      host = host.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0]
    }
  }
  host = host.split(':')[0]
  host = host.replace(/^(www\d*|mobile|m)\./i, '')

  // 互斥分支：剥离多级 TLD 与单级 TLD
  const multiTldRegex = /\.(com|co|net|org|edu|gov)\.[a-z]{2}$/i
  if (multiTldRegex.test(host)) {
    host = host.replace(multiTldRegex, '')
  } else {
    host = host.replace(/\.[a-z0-9-]+$/i, '')
  }

  if (!host) return ''
  const parts = host.split('.')
  const rawSlug = parts[parts.length - 1]
  const slug = rawSlug ? rawSlug.replace(/[^a-z0-9_-]/g, '') : ''
  return slug || ''
}

/**
 * Detect social platform from URL. Known platforms take precedence,
 * and unknown valid URLs are dynamically self-registered by domain slug.
 * Fallback to 'unknown' for invalid or unparseable URLs.
 * @param {string} url
 * @returns {string}
 */
export function detectPlatformFromUrl(url) {
  if (!url || typeof url !== 'string') return 'unknown'
  const trimmed = url.trim()
  if (!trimmed) return 'unknown'
  const lower = trimmed.toLowerCase()

  const hit = PLATFORM_PATTERNS.find((entry) => lower.includes(entry.test))
  if (hit) return hit.platform

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'unknown'
    }
    const hostname = parsed.hostname.toLowerCase()
    if (!hostname || !hostname.includes('.')) {
      return 'unknown'
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return 'unknown'
    }
    const slug = extractDomainSlug(hostname)
    return slug || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Extract platform and unique canonical key from social URL.
 * @param {string} rawUrl
 * @returns {{ platform: string, key: string, canonicalUrl: string }}
 */
export function getCanonicalItemKey(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { platform: 'unknown', key: '', canonicalUrl: '' }
  const clean = normalizeUrl(rawUrl)
  if (!clean) return { platform: 'unknown', key: '', canonicalUrl: '' }

  // 1. TikTok video: /@user/video/(\d+) or /v/(\d+)
  const tiktokMatch = clean.match(/tiktok\.com\/(?:@[^/]+\/video|v)\/(\d{15,25})/i)
  if (tiktokMatch && tiktokMatch[1]) {
    return {
      platform: 'tiktok',
      key: `tiktok:video:${tiktokMatch[1]}`,
      canonicalUrl: `https://www.tiktok.com/@creator/video/${tiktokMatch[1]}`,
    }
  }

  // 2. Instagram: /reel/([a-zA-Z0-9_-]+) or /p/([a-zA-Z0-9_-]+) or /reels/([a-zA-Z0-9_-]+)
  const igMatch = clean.match(/instagram\.com\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/i)
  if (igMatch && igMatch[1]) {
    return {
      platform: 'instagram',
      key: `instagram:media:${igMatch[1]}`,
      canonicalUrl: `https://www.instagram.com/p/${igMatch[1]}`,
    }
  }

  // 3. YouTube: /watch?v=(ID) or youtu.be/(ID) or /shorts/(ID)
  const ytMatch = clean.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i)
  if (ytMatch && ytMatch[1]) {
    return {
      platform: 'youtube',
      key: `youtube:video:${ytMatch[1]}`,
      canonicalUrl: `https://www.youtube.com/watch?v=${ytMatch[1]}`,
    }
  }

  // 4. X / Twitter: /user/status/(\d+)
  const xMatch = clean.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i)
  if (xMatch && xMatch[1]) {
    return {
      platform: 'x',
      key: `x:tweet:${xMatch[1]}`,
      canonicalUrl: `https://x.com/i/status/${xMatch[1]}`,
    }
  }

  // 5. Facebook: /videos/<id>, /watch/?v=<id>, /reel/<id>, fb.watch/<code>
  if (/facebook\.com|fb\.watch|fb\.com/i.test(clean)) {
    const facebook = facebookVideoKey(clean)
    if (facebook) {
      return {
        platform: 'facebook',
        key: `facebook:video:${facebook.id}`,
        canonicalUrl: facebook.canonicalUrl,
      }
    }
  }

  // 6. Threads: /@user/post/<code> or /t/<code>
  const threadsMatch = clean.match(/threads\.(?:net|com)\/(?:@[^/?#]+\/post|t)\/([A-Za-z0-9_-]+)/i)
  if (threadsMatch && threadsMatch[1]) {
    return {
      platform: 'threads',
      key: `threads:post:${threadsMatch[1]}`,
      canonicalUrl: `https://www.threads.net/t/${threadsMatch[1]}`,
    }
  }

  // 7. Dynamic self-registered platform from URL (known platforms above take precedence)
  const detected = detectPlatformFromUrl(clean || rawUrl)
  if (detected && detected !== 'unknown') {
    return {
      platform: detected,
      key: `${detected}:url:${clean}`,
      canonicalUrl: clean,
    }
  }

  // Generic fallback
  return {
    platform: 'unknown',
    key: `url:${clean}`,
    canonicalUrl: clean,
  }
}

/**
 * Check if two URLs represent the exact same social media content.
 * @param {string} urlA
 * @param {string} urlB
 * @returns {boolean}
 */
export function isSameSocialContent(urlA, urlB) {
  if (!urlA || !urlB) return false
  if (urlA.trim() === urlB.trim()) return true

  const keyA = getCanonicalItemKey(urlA)
  const keyB = getCanonicalItemKey(urlB)

  if (keyA.key && keyB.key && keyA.key === keyB.key) {
    return true
  }

  return normalizeUrl(urlA) === normalizeUrl(urlB)
}
