/**
 * Official embed URLs for monitored posts (#3462).
 *
 * The detail dialog plays a post through the platform's own embed instead of a
 * static cover: TikTok/Instagram pages are often HEIC/portrait and cannot be
 * rendered as a plain <img> in Chromium, and X/YouTube already publish a
 * first-class embed. Pure string parsing so it is unit-testable offline.
 */

/**
 * @param {Record<string, any>} card
 * @returns {string|null} official iframe src, or null when the platform/url is unknown
 */
export function rivalEmbedUrl(card) {
  const platform = String(card?.source_platform || card?.account?.platform || '').toLowerCase()
  const raw = String(card?.source_url || card?.url || '')
  let url = null
  if (raw) {
    try { url = new URL(raw) } catch { url = null }
  }
  const fallbackId = String(card?.id || card?.post_id || '').split(':').pop() || ''
  const host = url?.hostname?.toLowerCase() || ''
  const protocolOk = !url || url.protocol === 'http:' || url.protocol === 'https:'
  const allowed = platform === 'tiktok' ? ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(host)
    : platform === 'x' || platform === 'twitter' ? ['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host)
      : platform === 'youtube' ? ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)
        : platform === 'instagram' ? ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(host)
          : false
  // A URL on a wrong host or a non-http scheme is not evidence for this
  // platform; the card's own numeric id may still resolve for TikTok/X below.
  if (raw && (!protocolOk || !allowed)) return null

  if (platform === 'tiktok') {
    const match = raw.match(/\/(?:video|photo|v)\/(\d+)/) || raw.match(/share_item_id=(\d+)/) || raw.match(/\/player\/v1\/(\d+)/)
    const id = match?.[1] || (/^\d+$/.test(fallbackId) ? fallbackId : '')
    return id ? `https://www.tiktok.com/player/v1/${encodeURIComponent(id)}` : null
  }
  if (platform === 'x' || platform === 'twitter') {
    const match = raw.match(/\/status(?:es)?\/(\d+)/)
    const id = match?.[1] || (/^\d+$/.test(fallbackId) ? fallbackId : '')
    return id ? `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(id)}` : null
  }
  if (platform === 'youtube') {
    let id = ''
    if (url) {
      if (url.hostname.includes('youtu.be')) id = url.pathname.split('/').filter(Boolean)[0] || ''
      else if (url.searchParams.get('v')) id = url.searchParams.get('v')
      else {
        const match = url.pathname.match(/\/(?:shorts|embed)\/([^/?#]+)/)
        id = match?.[1] || ''
      }
    }
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0` : null
  }
  if (platform === 'instagram') {
    const match = raw.match(/\/(p|reel|tv)\/([^/?#]+)/)
    return match ? `https://www.instagram.com/${match[1]}/${encodeURIComponent(match[2])}/embed/` : null
  }
  return null
}

/** X/Instagram embeds the whole card (header/body/actions), not one media box. */
export function rivalEmbedIsCard(card) {
  const platform = String(card?.source_platform || card?.account?.platform || '').toLowerCase()
  return platform === 'x' || platform === 'twitter' || platform === 'instagram'
}

/**
 * Player aspect ratio for media-style embeds (TikTok/YouTube): the measured
 * post ratio when sane, otherwise a platform-appropriate default.
 * @param {Record<string, any>} card
 * @returns {number} width / height
 */
export function rivalEmbedAspectRatio(card) {
  const ratio = Number(card?.ratio)
  if (Number.isFinite(ratio) && ratio >= 0.4 && ratio <= 2.5) return ratio
  const platform = String(card?.source_platform || card?.account?.platform || '').toLowerCase()
  if (platform === 'youtube' || platform === 'x' || platform === 'twitter') return 16 / 9
  return 9 / 16
}
