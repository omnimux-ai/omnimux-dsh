import { OmnimuxError } from '../media/errors.js'

/** Complete catalog. Model ids match OmniMux social-data L3 pages. */
export const SOCIAL_DATA_CATALOG = Object.freeze({
  tiktok: Object.freeze({
    video: 'tiktok-video',
    user: 'tiktok-user',
    posts: 'tiktok-posts',
    search: 'tiktok-search',
    shop_product_link: 'tiktok-shop-product-link',
    shop_product: 'tiktok-shop-product-v3',
    shop_product_v1: 'tiktok-shop-product',
    shop_search: 'tiktok-shop-search',
    shop_seller_products: 'tiktok-shop-seller-products',
    shop_reviews: 'tiktok-shop-reviews',
    shop_shop_link: 'tiktok-shop-shop-link',
    shop_reviews_v2: 'tiktok-shop-reviews-v2',
    shop_categories: 'tiktok-shop-categories',
    shop_category_products: 'tiktok-shop-category-products',
    shop_live_products: 'tiktok-shop-live-products',
    shop_live_products_v2: 'tiktok-shop-live-products-v2',
    shop_creator: 'tiktok-shop-creator',
    live_room_id: 'tiktok-live-room-id',
    shop_search_v2: 'tiktok-shop-search-v2',
    shop_search_suggest: 'tiktok-shop-search-suggest',
    shop_seller_products_v2: 'tiktok-shop-seller-products-v2',
    creator_milestones: 'tiktok-creator-milestones',
    creator_search_insights: 'tiktok-creator-search-insights',
    creator_search_detail: 'tiktok-creator-search-detail',
    creator_search_trend: 'tiktok-creator-search-trend',
    creator_search_videos: 'tiktok-creator-search-videos',
  }),
  instagram: Object.freeze({
    post: 'instagram-post',
    user: 'instagram-user',
    posts: 'instagram-posts',
    search: 'instagram-search',
  }),
  youtube: Object.freeze({
    video: 'youtube-video',
    user: 'youtube-user',
    posts: 'youtube-posts',
    search: 'youtube-search',
  }),
  x: Object.freeze({
    tweet: 'x-tweet',
    user: 'x-user',
    posts: 'x-posts',
    search: 'x-search',
  }),
})

/**
 * Official docs put business params as top-level Chat Completions body fields
 * (not inside `messages`). Values come from tool `url` / `id` / `query`.
 *
 * Shop product detail needs both product_id and region — see
 * SOCIAL_DATA_EXTRA_FIELDS.
 */
export const SOCIAL_DATA_BUSINESS_FIELDS = Object.freeze({
  'tiktok/video': 'aweme_id',
  'tiktok/user': 'uniqueId',
  'tiktok/posts': 'unique_id',
  'tiktok/search': 'keyword',
  'tiktok/shop_product_link': 'share_link',
  'tiktok/shop_product': 'product_id',
  'tiktok/shop_product_v1': 'product_id',
  'tiktok/shop_search': 'search_word',
  'tiktok/shop_seller_products': 'seller_id',
  'tiktok/shop_reviews': 'product_id',
  'tiktok/shop_shop_link': 'share_link',
  'tiktok/shop_reviews_v2': 'product_id',
  'tiktok/shop_categories': 'region',
  'tiktok/shop_category_products': 'category_id',
  'tiktok/shop_live_products': 'room_id',
  'tiktok/shop_live_products_v2': 'room_id',
  'tiktok/shop_creator': 'creator_uid',
  'tiktok/live_room_id': 'live_room_url',
  'tiktok/shop_search_v2': 'search_word',
  'tiktok/shop_search_suggest': 'search_word',
  'tiktok/shop_seller_products_v2': 'seller_id',
  'tiktok/creator_milestones': 'user_id',
  'tiktok/creator_search_insights': 'keyword',
  'tiktok/creator_search_detail': 'query_id_str',
  'tiktok/creator_search_trend': 'query_id_str',
  'tiktok/creator_search_videos': 'keyword',
  'instagram/post': 'url',
  'instagram/user': 'username',
  'instagram/posts': 'username',
  'instagram/search': 'query',
  'youtube/video': 'video_id',
  'youtube/user': 'channel_id',
  'youtube/posts': 'channel_id',
  'youtube/search': 'search_query',
  'x/tweet': 'tweet_id',
  'x/user': 'screen_name',
  'x/posts': 'screen_name',
  'x/search': 'keyword',
})

/** Optional extra top-level body fields beyond the primary business field. */
export const SOCIAL_DATA_EXTRA_FIELDS = Object.freeze({
  'tiktok/shop_product': Object.freeze(['region']),
  'tiktok/shop_product_v1': Object.freeze(['region']),
  'tiktok/shop_search': Object.freeze(['region']),
  'tiktok/shop_seller_products': Object.freeze(['region']),
  'tiktok/shop_reviews': Object.freeze(['region']),
  'tiktok/shop_reviews_v2': Object.freeze(['region']),
  'tiktok/shop_search_v2': Object.freeze(['region']),
  'tiktok/shop_search_suggest': Object.freeze(['region']),
  'tiktok/shop_seller_products_v2': Object.freeze(['region']),
  'tiktok/shop_category_products': Object.freeze(['region']),
  'tiktok/shop_live_products': Object.freeze(['author_id']),
  'tiktok/shop_live_products_v2': Object.freeze(['author_id']),
})

const DEFAULT_SHOP_REGION = 'SG'

/**
 * @param {{ platform?: string, capability?: string, id?: string, url?: string, query?: string, region?: string }} args
 */
export function resolveSocialDataModel(args) {
  const platform = String(args.platform || '').trim()
  const capability = String(args.capability || '').trim()
  const model = SOCIAL_DATA_CATALOG[platform]?.[capability]
  if (!model) {
    throw new OmnimuxError(
      'omnimux-invalid-request',
      `unsupported social data pair ${platform || '?'}/${capability || '?'}`,
    )
  }
  const field = SOCIAL_DATA_BUSINESS_FIELDS[`${platform}/${capability}`]
  if (!field) {
    throw new OmnimuxError(
      'omnimux-invalid-request',
      `missing business field mapping for ${platform}/${capability}`,
    )
  }
  const value = resolveBusinessValue({ platform, capability, field, args })
  if (!value) {
    throw new OmnimuxError(
      'omnimux-invalid-request',
      `url, id, or query is required for ${platform}/${capability} (maps to ${field})`,
    )
  }
  const extras = resolveExtraFields({ platform, capability, args, value })
  return { model, platform, capability, field, value, extras }
}

/**
 * @param {{
 *   platform: string,
 *   capability: string,
 *   field: string,
 *   args: { id?: string, url?: string, query?: string, region?: string },
 * }} input
 */
export function resolveBusinessValue(input) {
  const id = String(input.args.id || '').trim()
  const url = String(input.args.url || '').trim()
  const query = String(input.args.query || '').trim()
  const { platform, capability, field } = input

  if (field === 'url') return url || id || ''
  if (field === 'share_link') return normalizeShopShareLink(url || id || query || '')
  if (field === 'region') return resolveShopRegion(input.args) || id || query || url || DEFAULT_SHOP_REGION
  if (field === 'live_room_url') return url || id || query || ''
  if (field === 'query' || field === 'keyword' || field === 'search_query' || field === 'search_word') {
    return query || id || url || ''
  }

  if (platform === 'x' && capability === 'tweet') {
    return extractTweetId(id) || extractTweetId(url) || id || ''
  }
  if (platform === 'tiktok' && capability === 'video') {
    return extractDigitsId(id) || extractTikTokAwemeId(url) || id || ''
  }
  if (platform === 'youtube' && capability === 'video') {
    return extractYouTubeVideoId(id) || extractYouTubeVideoId(url) || id || ''
  }
  if (platform === 'youtube' && (capability === 'user' || capability === 'posts')) {
    return extractYouTubeChannelId(id) || extractYouTubeChannelId(url) || id || url || ''
  }
  if (platform === 'tiktok' && (
    capability === 'shop_product' ||
    capability === 'shop_product_v1' ||
    capability === 'shop_reviews' ||
    capability === 'shop_reviews_v2'
  )) {
    return extractDigitsId(id) || extractTikTokShopProductId(url) || extractDigitsId(query) || id || ''
  }

  // profile / channel / seller style fields prefer bare id, then url/query fallback
  return id || query || url || ''
}

/**
 * @param {{
 *   platform: string,
 *   capability: string,
 *   args: { id?: string, url?: string, query?: string, region?: string, author_id?: string, authorId?: string },
 *   value: string,
 * }} input
 * @returns {Record<string, string>}
 */
export function resolveExtraFields(input) {
  const keys = SOCIAL_DATA_EXTRA_FIELDS[`${input.platform}/${input.capability}`] || []
  /** @type {Record<string, string>} */
  const out = {}
  for (const key of keys) {
    if (key === 'region') {
      const region = resolveShopRegion(input.args)
      if (region) out.region = region
    }
    if (key === 'author_id') {
      out.author_id = String(input.args?.author_id ?? input.args?.authorId ?? '0').trim()
    }
  }
  return out
}

/**
 * @param {{ id?: string, url?: string, query?: string, region?: string }} args
 */
export function resolveShopRegion(args) {
  const explicit = String(args.region || '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(explicit)) return explicit
  const fromUrl = extractShopRegion(String(args.url || args.id || args.query || ''))
  if (fromUrl) return fromUrl
  return DEFAULT_SHOP_REGION
}

/**
 * Prefer a view/product link for the gateway product-link model: plain sg/pdp
 * share links often 400 upstream.
 * @param {string} value
 */
export function normalizeShopShareLink(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const productId = extractTikTokShopProductId(raw)
  if (!productId) return raw
  if (/shop\.tiktok\.com\/view\/product\//i.test(raw)) return raw
  const region = (extractShopRegion(raw) || DEFAULT_SHOP_REGION).toLowerCase()
  return `https://shop.tiktok.com/view/product/${productId}?region=${region}&locale=en`
}

/**
 * @param {string} value
 */
export function extractTikTokShopProductId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{5,}$/.test(raw)) return raw
  const match = raw.match(/\/(?:pdp|product)\/(\d{5,})/i)
  return match?.[1] || ''
}

/**
 * @param {string} value
 */
export function extractShopRegion(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const q = u.searchParams.get('region')
    if (q && /^[a-zA-Z]{2}$/.test(q)) return q.toUpperCase()
    const hostPath = u.pathname
    const m = hostPath.match(/^\/([a-z]{2})\//i)
    if (m) return m[1].toUpperCase()
    // shop.tiktok.com/sg/pdp/...
    const hostSeg = u.hostname
    if (/shop\.tiktok\.com$/i.test(hostSeg)) {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] && /^[a-z]{2}$/i.test(parts[0]) && (parts[1] === 'pdp' || parts[1] === 'view')) {
        return parts[0].toUpperCase()
      }
    }
  } catch {
    const m = raw.match(/[?&]region=([a-zA-Z]{2})\b/)
    if (m) return m[1].toUpperCase()
    const p = raw.match(/shop\.tiktok\.com\/([a-z]{2})\//i)
    if (p) return p[1].toUpperCase()
  }
  return ''
}

/**
 * @param {string} value
 */
export function extractTweetId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{5,}$/.test(raw)) return raw
  const match = raw.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i)
  return match?.[1] || ''
}

/**
 * @param {string} value
 */
export function extractTikTokAwemeId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{5,}$/.test(raw)) return raw
  const match = raw.match(/\/video\/(\d+)/i)
  return match?.[1] || ''
}

/**
 * @param {string} value
 */
export function extractYouTubeVideoId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^[\w-]{6,}$/.test(raw) && !raw.includes('://')) return raw
  try {
    const u = new URL(raw)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split('/')[0] || ''
    }
    const v = u.searchParams.get('v')
    if (v) return v
    const parts = u.pathname.split('/').filter(Boolean)
    const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live')
    if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1]
  } catch {
    return ''
  }
  return ''
}

/**
 * Extract channel ID or handle from YouTube channel URL or bare id.
 * @param {string} value
 */
export function extractYouTubeChannelId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(UC[\w-]{20,}|@[\w.-]+)$/.test(raw) && !raw.includes('://')) return raw
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const segments = u.pathname.split('/').filter(Boolean)
    if (segments[0] === 'channel' && segments[1]) return segments[1]
    if (segments[0]?.startsWith('@')) return segments[0]
    if ((segments[0] === 'c' || segments[0] === 'user') && segments[1]) return `@${segments[1]}`
    if (
      segments.length === 1 &&
      u.hostname.toLowerCase().endsWith('youtube.com') &&
      !['feed', 'watch', 'shorts', 'live', 'results', 'playlist'].includes(segments[0])
    ) {
      return `@${segments[0]}`
    }
  } catch {}
  return raw
}

/**
 * @param {string} value
 */
function extractDigitsId(value) {
  const raw = String(value || '').trim()
  return /^\d{5,}$/.test(raw) ? raw : ''
}

/**
 * @param {{ withSk: Function }} client
 * @param {{ platform?: string, capability?: string, id?: string, url?: string, query?: string, region?: string }} args
 */
export async function fetchSocialData(client, args) {
  const { model, platform, capability, field, value, extras } = resolveSocialDataModel(args)
  const raw = await client.withSk('/v1/chat/completions', {
    method: 'POST',
    body: {
      model,
      messages: [{ role: 'user', content: '.' }],
      [field]: value,
      ...(extras && typeof extras === 'object' ? extras : {}),
    },
  })
  return {
    platform,
    capability,
    model,
    field,
    value,
    extras: extras || {},
    data: pickSocialPayload(raw),
  }
}

/**
 * Live OmniMux social-data often returns a TikHub-style envelope `{ code, data }`
 * rather than OpenAI `choices[].message.content`. Prefer `data`, then chat JSON.
 * @param {unknown} raw
 */
export function pickSocialPayload(raw) {
  const row = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  if (row.data && typeof row.data === 'object') return row.data

  const choices = Array.isArray(row.choices) ? row.choices : []
  const message = choices[0] && typeof choices[0] === 'object'
    ? /** @type {Record<string, unknown>} */ (choices[0]).message
    : undefined
  const content = message && typeof message === 'object'
    ? /** @type {Record<string, unknown>} */ (message).content
    : undefined
  if (typeof content === 'string' && content.trim()) {
    try {
      return JSON.parse(content)
    } catch {
      return { text: content }
    }
  }
  return { text: null }
}
