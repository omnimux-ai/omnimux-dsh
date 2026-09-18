/**
 * TikTok Shop link import via OmniMux hub social-data models
 * (tiktok-shop-product-link / tiktok-shop-product-v3 / tiktok-shop-product).
 *
 * Domain plugins never call TikHub directly and never hold TikHub keys —
 * only hub.socialData (omnimux_social_data) with OMNIMUX_API_KEY.
 */

const SHOP_HOST_RE = /(?:^|\.)shop\.tiktok\.com$/i
const PRODUCT_PATH_RE = /\/(?:pdp|product)\/(\d{5,})/i

/**
 * @param {string} url
 */
export function isTikTokShopProductUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return false
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (!SHOP_HOST_RE.test(u.hostname)) return false
    return PRODUCT_PATH_RE.test(u.pathname) || /\/view\/product\//i.test(u.pathname)
  } catch {
    return SHOP_HOST_RE.test(raw) && PRODUCT_PATH_RE.test(raw)
  }
}

/**
 * @param {string} url
 */
export function extractShopProductId(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^\d{5,}$/.test(raw)) return raw
  const m = raw.match(PRODUCT_PATH_RE)
  return m?.[1] || ''
}

/**
 * @param {string} url
 */
export function extractShopRegion(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const q = u.searchParams.get('region')
    if (q && /^[a-zA-Z]{2}$/.test(q)) return q.toUpperCase()
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] && /^[a-z]{2}$/i.test(parts[0]) && (parts[1] === 'pdp' || parts[1] === 'view')) {
      return parts[0].toUpperCase()
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
 * @param {unknown} value
 * @returns {string}
 */
function asText(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * Walk object tree with a visitor.
 * @param {unknown} obj
 * @param {(path: string, value: unknown) => void} visit
 * @param {string} [path]
 */
function walk(obj, visit, path = '$') {
  visit(path, obj)
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (let i = 0; i < Math.min(obj.length, 80); i += 1) walk(obj[i], visit, `${path}[${i}]`)
    return
  }
  for (const [k, v] of Object.entries(obj)) walk(v, visit, `${path}.${k}`)
}

/**
 * Map gateway product detail payload into importer page-ish fields.
 * @param {unknown} data
 * @param {{ url: string, productId?: string, region?: string }} meta
 */
export function mapShopDetailToFields(data, meta) {
  const root = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {}
  /** @type {string} */
  let name = ''
  /** @type {string} */
  let brand = ''
  /** @type {string} */
  let sale = ''
  /** @type {string} */
  let origin = ''
  /** @type {string} */
  let currency = ''
  /** @type {string} */
  let discount = ''
  /** @type {string[]} */
  const images = []
  /** @type {string[]} */
  const bullets = []

  // Prefer structured product_info when present (V3 shape)
  let productInfo = null
  walk(root, (path, value) => {
    if (productInfo) return
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const row = /** @type {Record<string, unknown>} */ (value)
      if (row.product_info && typeof row.product_info === 'object') productInfo = row.product_info
      if (row.product_model && typeof row.product_model === 'object' && row.product_model) {
        // already inside product_info sometimes
      }
    }
  })

  const pinfo = productInfo && typeof productInfo === 'object'
    ? /** @type {Record<string, unknown>} */ (productInfo)
    : root
  const pm = pinfo.product_model && typeof pinfo.product_model === 'object'
    ? /** @type {Record<string, unknown>} */ (pinfo.product_model)
    : pinfo
  const seller = pinfo.seller_model && typeof pinfo.seller_model === 'object'
    ? /** @type {Record<string, unknown>} */ (pinfo.seller_model)
    : {}

  name = asText(pm.name) || asText(pm.title) || asText(pm.product_name)
  brand = asText(seller.shop_name) || asText(seller.seller_name) || asText(pm.brand)

  const promo = pinfo.promotion_model && typeof pinfo.promotion_model === 'object'
    ? /** @type {Record<string, unknown>} */ (pinfo.promotion_model)
    : {}
  const prices = promo.promotion_product_price && typeof promo.promotion_product_price === 'object'
    ? /** @type {Record<string, unknown>} */ (promo.promotion_product_price)
    : {}
  const minp = prices.min_price && typeof prices.min_price === 'object'
    ? /** @type {Record<string, unknown>} */ (prices.min_price)
    : {}
  sale = asText(minp.sale_price_format) || asText(minp.single_product_price_format)
  origin = asText(minp.origin_price_format) || asText(minp.raw_origin_price_format)
  currency = asText(minp.currency_symbol) || asText(minp.currency_name)
  discount = asText(minp.discount_format) || asText(minp.reduce_price_format)

  // images from product_model.images
  const rawImages = Array.isArray(pm.images) ? pm.images : []
  for (const it of rawImages) {
    if (typeof it === 'string' && it.startsWith('http')) {
      images.push(it)
      continue
    }
    if (it && typeof it === 'object') {
      const row = /** @type {Record<string, unknown>} */ (it)
      /** @type {string[]} */
      const cands = []
      for (const v of Object.values(row)) {
        if (typeof v === 'string' && v.startsWith('http')) cands.push(v)
        if (Array.isArray(v)) {
          for (const x of v) if (typeof x === 'string' && x.startsWith('http')) cands.push(x)
        }
      }
      cands.sort((a, b) => scoreImage(b) - scoreImage(a))
      if (cands[0]) images.push(cands[0])
    }
  }

  // description bullets
  const desc = pm.description
  if (typeof desc === 'string' && desc.trim()) bullets.push(desc.trim().slice(0, 80))
  if (Array.isArray(desc)) {
    for (const block of desc.slice(0, 8)) {
      if (!block || typeof block !== 'object') continue
      const t = asText(/** @type {Record<string, unknown>} */ (block).text)
      if (t) bullets.push(t.slice(0, 80))
    }
  }

  // fallbacks via walk if structured miss
  if (!name) {
    walk(root, (path, value) => {
      if (name) return
      const key = path.split('.').pop() || ''
      if ((key === 'name' || key === 'title' || key === 'product_name') && typeof value === 'string' && value.length > 3 && value.length < 300) {
        if (!/explore more|top reviewed/i.test(value)) name = value.trim()
      }
    })
  }
  if (!sale) {
    walk(root, (path, value) => {
      if (sale) return
      if (path.endsWith('sale_price_format') && typeof value === 'string' && /\d/.test(value)) sale = value
    })
  }
  if (!currency) {
    walk(root, (path, value) => {
      if (currency) return
      if ((path.endsWith('currency_symbol') || path.endsWith('currency_name')) && typeof value === 'string') currency = value
    })
  }
  if (images.length === 0) {
    const seen = new Set()
    walk(root, (_path, value) => {
      if (typeof value !== 'string' || !value.startsWith('http')) return
      if (!/(?:jpg|jpeg|png|webp|tos-|tiktokcdn|ibyteimg)/i.test(value)) return
      if (/avatar|thumb_video|video\/tos/i.test(value)) return
      const key = (value.match(/\/([0-9a-f]{16,})~/) || [])[1] || value.split('?')[0]
      if (seen.has(key)) return
      seen.add(key)
      images.push(value)
    })
  }

  const uniqImages = dedupeImages(images).slice(0, 8)
  const priceText = sale
    ? `${currency && !sale.includes(currency) ? currency : ''}${sale}`.trim()
    : ''
  const promotion = [discount, origin ? `was ${currency}${origin}` : ''].filter(Boolean).join(' · ')

  return {
    name: name || `TikTok Shop ${meta.productId || 'product'}`,
    brand,
    price: priceText || sale,
    promotion,
    selling_points: bullets.slice(0, 6).join('\n'),
    features: bullets.slice(0, 12).join('\n'),
    target_audience: '',
    sku: asText(meta.productId),
    link: meta.url,
    categories: brand ? [brand] : [],
    images: uniqImages,
    // page-shaped extras for importer merge path
    title: name,
    text: [name, brand, priceText, ...bullets].filter(Boolean).join('\n'),
    product_id: meta.productId || extractShopProductId(meta.url),
    region: meta.region || extractShopRegion(meta.url) || 'SG',
  }
}

/**
 * @param {string} url
 * @returns {number}
 */
function scoreImage(url) {
  let s = 0
  if (url.includes('1000:1000')) s += 5
  if (url.includes('origin')) s += 4
  if (url.includes('p16-')) s += 1
  if (/\.jpe?g/i.test(url)) s += 2
  return s
}

/**
 * @param {string[]} urls
 */
function dedupeImages(urls) {
  const seen = new Set()
  const out = []
  for (const u of urls) {
    const key = (u.match(/\/([0-9a-f]{16,})~/) || [])[1] || u.split('?')[0]
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u)
  }
  return out
}

/**
 * Fetch shop product detail through hub.socialData.
 * @param {{
 *   url: string,
 *   socialData: (args: Record<string, unknown>) => Promise<unknown>,
 * }} input
 */
export async function fetchTikTokShopProductViaHub(input) {
  if (typeof input.socialData !== 'function') {
    throw new Error('hub socialData seam unavailable')
  }
  const url = String(input.url || '').trim()
  if (!isTikTokShopProductUrl(url)) {
    throw new Error('not a TikTok Shop product url')
  }
  let productId = extractShopProductId(url)
  const region = extractShopRegion(url) || 'SG'

  if (!productId) {
    const linked = await input.socialData({
      platform: 'tiktok',
      capability: 'shop_product_link',
      url,
    })
    productId = pickProductIdFromLinkResult(linked) || ''
  }

  if (!productId) {
    throw new Error('could not resolve TikTok Shop product_id')
  }

  /** @type {unknown} */
  let detail = null
  /** @type {string} */
  let modelUsed = 'tiktok-shop-product-v3'
  try {
    detail = await input.socialData({
      platform: 'tiktok',
      capability: 'shop_product',
      id: productId,
      url,
      region,
    })
  } catch (error) {
    modelUsed = 'tiktok-shop-product'
    detail = await input.socialData({
      platform: 'tiktok',
      capability: 'shop_product_v1',
      id: productId,
      url,
      region,
    })
  }

  const payload = unwrapSocialData(detail)
  const fields = mapShopDetailToFields(payload, { url, productId, region })
  return {
    productId,
    region,
    model: modelUsed,
    fields,
    raw: payload,
  }
}

/**
 * @param {unknown} result
 */
function unwrapSocialData(result) {
  if (!result || typeof result !== 'object') return result
  const row = /** @type {Record<string, unknown>} */ (result)
  if (row.data !== undefined) return row.data
  return result
}

/**
 * @param {unknown} result
 */
function pickProductIdFromLinkResult(result) {
  const data = unwrapSocialData(result)
  if (!data || typeof data !== 'object') return ''
  const row = /** @type {Record<string, unknown>} */ (data)
  const id = asText(row.product_id) || asText(row.productId)
  if (id) return id
  // sometimes nested
  let found = ''
  walk(data, (_p, v) => {
    if (found) return
    if (typeof v === 'string' && /^\d{10,}$/.test(v)) found = v
  })
  return found
}
