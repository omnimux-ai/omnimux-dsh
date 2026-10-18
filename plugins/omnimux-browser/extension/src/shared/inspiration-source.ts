/** Match the host library's existing URL normalization and content identities. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'igsh',
  'is_from_webapp', 'sender_device', 'sender_web_id', 'feature', 'si', 't', 's', 'ref', 'source',
  'share_app_id', 'share_item_id', 'share_link_id',
])
const domainIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

/** A usable request address. X is identified by the immutable post id, never its author handle. */
export function canonicalInspirationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (domainIs(url.hostname, 'x.com') || domainIs(url.hostname, 'twitter.com')) {
      const post = /^\/[A-Za-z0-9_]+\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/.exec(url.pathname)
      return post ? `https://x.com/i/status/${post[1]}` : null
    }
    if (['m.facebook.com', 'web.facebook.com'].includes(url.hostname)) url.hostname = 'www.facebook.com'
    if (url.hostname === 'm.threads.net') url.hostname = 'www.threads.net'
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
    }
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1)
    return url.href
  } catch { return null }
}

/** Strict host + path parsing prevents a URL embedded inside a query from becoming its identity. */
function sourceKey(value: unknown): string | null {
  const normalized = canonicalInspirationUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  const host = url.hostname
  const path = url.pathname
  let match: RegExpExecArray | null
  if (domainIs(host, 'x.com')) return `x:tweet:${/^\/i\/status\/(\d+)$/.exec(path)![1]}`
  if (domainIs(host, 'tiktok.com') && (match = /^\/(?:@[^/]+\/video|v)\/(\d{15,25})(?:\.html)?$/i.exec(path))) return `tiktok:video:${match[1]}`
  if (domainIs(host, 'instagram.com') && (match = /^\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)$/i.exec(path))) return `instagram:media:${match[1]}`
  if (domainIs(host, 'youtube.com') || domainIs(host, 'youtu.be')) {
    const id = domainIs(host, 'youtu.be') ? /^\/([a-zA-Z0-9_-]{11})$/.exec(path)?.[1]
      : path === '/watch' && url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : /^\/shorts\/([a-zA-Z0-9_-]{11})$/.exec(path)?.[1]
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return `youtube:video:${id}`
  }
  if (domainIs(host, 'facebook.com')) {
    const id = /^\/(?:[^/?#]+\/videos|videos|reel)\/(\d{6,})$/i.exec(path)?.[1]
      ?? (/^\/(?:watch|video\.php)$/i.test(path) && url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : null)
    if (id && /^\d{6,}$/.test(id)) return `facebook:video:${id}`
  }
  if (domainIs(host, 'fb.watch') && (match = /^\/([A-Za-z0-9_-]{4,})$/.exec(path))) return `facebook:video:${match[1]}`
  if ((domainIs(host, 'threads.net') || domainIs(host, 'threads.com')) && (match = /^\/(?:@[^/?#]+\/post|t)\/([A-Za-z0-9_-]+)$/i.exec(path))) return `threads:post:${match[1]}`
  return `url:${normalized}`
}

export function sameInspirationSource(left: unknown, right: unknown): boolean {
  const key = sourceKey(left)
  return key !== null && key === sourceKey(right)
}
