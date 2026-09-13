/**
 * Link importer: one landing-page URL in, one canonical product draft out.
 *
 * Two fetch tracks, each independently degradable:
 *   reader — OmniMux reader gateway `POST {base}/v1/reader` (model
 *            `jina-reader-v1`) answered as text/plain markdown.
 *   direct — plain GET of the landing page, reading <title>, meta,
 *            OpenGraph, Twitter card and JSON-LD (`Product` / `Offer` /
 *            `BreadcrumbList`) blocks.
 *
 * The output field contract mirrors the Gxgen import playbook already vendored
 * at `prompts/physical/import-from-link.v9.txt` — name, selling_points,
 * features, target_audience, brand, price, sku, promotion, link, categories,
 * images. `price` keeps that playbook's rule: the lowest numeric value, no
 * currency symbol. Digital offerings never carry price / sku / promotion,
 * matching the library rule that those are physical-only fields.
 *
 * Server-side only: no hub internals are imported, the reader request goes over
 * the documented public HTTP contract.
 */

/** Canonical import field order — the draft shape this module always returns. */
export const IMPORT_FIELD_KEYS = Object.freeze([
  'name',
  'selling_points',
  'features',
  'target_audience',
  'brand',
  'price',
  'sku',
  'promotion',
  'link',
  'categories',
  'images',
])

export const READER_MODEL = 'jina-reader-v1'
export const DEFAULT_READER_BASE = 'https://api.omnimux.ai/v1'
export const DEFAULT_TIMEOUT_MS = 12000

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 OmniMuxProducts/0.1'
const READER_USER_AGENT = 'OmniMuxProducts/0.1 (omnimux_products_import; +https://omnimux.ai)'
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

const MAX_TEXT_CHARS = 512 * 1024
const NAME_MAX = 40
const CATEGORIES_MAX = 5
const IMAGES_MAX = 8
const BULLET_MIN = 4
const BULLET_MAX = 80

/** Query params that never identify a product page. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^yclid$/i,
  /^msclkid$/i,
  /^igshid$/i,
  /^spm$/i,
  /^scm$/i,
  /^ref_src$/i,
  /^_ga$/i,
  /^mc_(cid|eid)$/i,
]

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

/** Phrases that mark a running promotion rather than ordinary copy. */
const PROMO_PATTERNS = [
  /\b\d{1,2}%\s*off\b/i,
  /\bsave\s+\d/i,
  /\bcoupon\b/i,
  /\bdiscount\b/i,
  /\bpromo(?:tion)?\b/i,
  /\bdeal\b/i,
  /\bfree shipping\b/i,
  /\bflash sale\b/i,
  /限时|满减|满\d+减|折扣|优惠|促销|秒杀|立减|特价|赠品|包邮|优惠券|券后|到手价/,
]

/**
 * @typedef {object} ImportedProduct
 * @property {string} name
 * @property {string} selling_points
 * @property {string} features
 * @property {string} target_audience
 * @property {string} brand
 * @property {string} price
 * @property {string} sku
 * @property {string} promotion
 * @property {string} link
 * @property {string[]} categories
 * @property {string[]} images
 */

/**
 * @typedef {object} ParsedPage
 * @property {string} title
 * @property {string} canonical
 * @property {Record<string, string[]>} meta
 * @property {Record<string, unknown>[]} nodes
 * @property {string[]} images
 * @property {string[]} bullets
 * @property {string} text
 */

export class LinkImportError extends Error {
  /**
   * @param {'invalid-url' | 'link-import-failed' | 'link-import-empty'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'LinkImportError'
    this.code = code
  }
}

/**
 * @param {string | undefined} raw
 * @param {string} [base]
 * @returns {string}
 */
export function resolveReaderBaseUrl(raw, base = DEFAULT_READER_BASE) {
  const value = String(raw || base).replace(/\/+$/, '')
  if (!value) return base
  if (/\/v1$/i.test(value)) return value
  return `${value}/v1`
}

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host.includes(':')) return host === '::1' || /^(fc|fd|fe80)/.test(host)
  return PRIVATE_V4.some((pattern) => pattern.test(host))
}

/**
 * Normalize a pasted link into the URL this module will fetch.
 *
 * A bare `example.com/p/1` is upgraded to https, then the hash, the tracking
 * params and any embedded credentials are dropped. Loopback / private hosts are
 * refused so this local-only route cannot be pointed at the machine's own
 * network.
 *
 * @param {unknown} raw
 * @returns {string}
 * @throws {LinkImportError} code `invalid-url`
 */
export function normalizeImportUrl(raw) {
  const text = String(raw ?? '').trim()
  if (!text) throw new LinkImportError('invalid-url', 'a page url is required')
  let parsed = null
  try {
    parsed = new URL(text)
  } catch {
    try {
      parsed = new URL(`https://${text}`)
    } catch {
      throw new LinkImportError('invalid-url', 'the page url is not a valid url')
    }
  }
  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new LinkImportError('invalid-url', 'only http and https links are supported')
  }
  if (!parsed.hostname) throw new LinkImportError('invalid-url', 'the page url has no host')
  if (parsed.username || parsed.password) {
    throw new LinkImportError('invalid-url', 'the page url must not embed credentials')
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new LinkImportError('invalid-url', 'the page url points at a private host')
  }
  parsed.hash = ''
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) parsed.searchParams.delete(key)
  }
  const query = parsed.searchParams.toString()
  return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`
}

/**
 * Reader gateway markdown header:
 *
 *   Title: Example Domain
 *   URL Source: https://example.com/
 *   Markdown Content:
 *   # Example Domain
 *
 * @param {unknown} text
 * @returns {{ title: string, markdown: string }}
 */
export function parseReaderMarkdown(text) {
  const markdown = String(text ?? '').replace(/^\uFEFF/, '')
  if (!markdown.trim()) return { title: '', markdown: '' }
  const titleLine = /^Title:\s*(.+)\s*$/m.exec(markdown)
  const heading = /^#\s+(.+)\s*$/m.exec(markdown)
  const title = pickTitle(titleLine?.[1]) || pickTitle(heading?.[1])
  return { title, markdown }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function pickTitle(value) {
  const title = String(value ?? '').trim()
  if (!title) return ''
  if (/^(untitled|no title|-)$/i.test(title)) return ''
  return title
}

/**
 * Parse one HTML document into everything the mapper needs.
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {ParsedPage}
 */
export function parseHtmlDocument(html, baseUrl) {
  const source = String(html ?? '')
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(source)?.[1] ?? source
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const meta = extractMetaTags(head)
  const canonicalTag = /<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(head)?.[0] ?? ''
  const canonical = absoluteUrl(attrOf(canonicalTag, 'href'), baseUrl)
  const nodes = extractJsonLdNodes(source)
  const images = [...extractMarkdownImages(source), ...extractImgTags(source)]
  const bullets = extractListItems(source)
  return {
    title: cleanText(titleTag),
    canonical,
    meta,
    nodes,
    images,
    bullets,
    text: htmlToText(source),
  }
}

/**
 * Every `<meta>` in the document, keyed by its `name` / `property` / `itemprop`.
 * Repeated keys (og:image) keep every value, in document order.
 *
 * @param {string} html
 * @returns {Record<string, string[]>}
 */
export function extractMetaTags(html) {
  /** @type {Record<string, string[]>} */
  const meta = {}
  const tags = String(html ?? '').match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const key = attrOf(tag, 'property') || attrOf(tag, 'name') || attrOf(tag, 'itemprop')
    const content = attrOf(tag, 'content')
    if (!key || !content) continue
    const normalized = key.trim().toLowerCase()
    if (!normalized) continue
    const list = meta[normalized] ?? []
    list.push(content)
    meta[normalized] = list
  }
  return meta
}

/**
 * Flatten every `application/ld+json` block into a node list, walking `@graph`
 * and nested objects. Unparsable blocks are skipped, never thrown.
 *
 * @param {string} html
 * @returns {Record<string, unknown>[]}
 */
export function extractJsonLdNodes(html) {
  const blocks = String(html ?? '').match(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []
  /** @type {Record<string, unknown>[]} */
  const nodes = []
  for (const block of blocks) {
    const body = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(block)?.[1] ?? ''
    const parsed = parseJsonLoose(body)
    if (parsed === null) continue
    walkJson(parsed, nodes)
  }
  return nodes
}

/**
 * Tolerant JSON.parse: strips HTML comments and trailing commas.
 * @param {string} raw
 * @returns {unknown}
 */
function parseJsonLoose(raw) {
  const text = String(raw ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * @param {unknown} value
 * @param {Record<string, unknown>[]} out
 */
function walkJson(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, out)
    return
  }
  if (!value || typeof value !== 'object') return
  const row = /** @type {Record<string, unknown>} */ (value)
  out.push(row)
  for (const child of Object.values(row)) {
    if (child && typeof child === 'object') walkJson(child, out)
  }
}

/**
 * @param {string} tag
 * @param {string} name
 * @returns {string}
 */
function attrOf(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const match = pattern.exec(String(tag ?? ''))
  if (!match) return ''
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim()
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    const named = ENTITIES[body.toLowerCase()]
    return named === undefined ? whole : named
  })
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function cleanText(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u200b\u200e\u200f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} html
 * @returns {string}
 */
function htmlToText(html) {
  return cleanText(
    String(html ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' '),
  )
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractListItems(html) {
  const items = String(html ?? '').match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) ?? []
  return items.map((item) => cleanText(item.replace(/<\/?li\b[^>]*>/gi, ''))).filter(Boolean)
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractImgTags(html) {
  const tags = String(html ?? '').match(/<img\b[^>]*>/gi) ?? []
  return tags.map((tag) => attrOf(tag, 'src') || attrOf(tag, 'data-src')).filter(Boolean)
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function extractMarkdownImages(text) {
  const images = []
  const source = String(text ?? '')
  const pattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match = pattern.exec(source)
  while (match) {
    images.push(match[1])
    match = pattern.exec(source)
  }
  return images
}

/**
 * @param {unknown} raw
 * @param {string} baseUrl
 * @returns {string}
 */
function absoluteUrl(raw, baseUrl) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  if (/^data:/i.test(text)) return ''
  try {
    return new URL(text, baseUrl || undefined).toString()
  } catch {
    return ''
  }
}

/**
 * @param {Record<string, string[]>} meta
 * @param {string[]} keys
 * @returns {string[]}
 */
function metaAll(meta, keys) {
  const out = []
  for (const key of keys) {
    for (const value of meta[key] ?? []) {
      const text = cleanText(value)
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * @param {Record<string, string[]>} meta
 * @param {string[]} keys
 * @returns {string}
 */
function metaOne(meta, keys) {
  return metaAll(meta, keys)[0] ?? ''
}

/**
 * @param {...unknown} values
 * @returns {string}
 */
function firstOf(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

/**
 * Split a page title into a product name and the trailing site name.
 * @param {unknown} raw
 * @returns {{ name: string, siteName: string }}
 */
export function cleanTitle(raw) {
  const text = cleanText(raw)
  if (!text) return { name: '', siteName: '' }
  let candidate = text
  let siteName = ''
  for (const separator of [' | ', ' |', '｜', ' – ', ' — ', ' - ', ' :: ', ' · ']) {
    if (!candidate.includes(separator)) continue
    const parts = candidate.split(separator).map((part) => part.trim()).filter(Boolean)
    if (parts.length < 2) continue
    const head = parts[0]
    const tail = parts[parts.length - 1]
    if (head.length >= 3) {
      candidate = head
      siteName = tail
    } else {
      candidate = parts.slice(1).join(' ')
    }
    break
  }
  return {
    name: capText(stripDecorations(candidate), NAME_MAX),
    siteName: capText(stripDecorations(siteName), NAME_MAX),
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripDecorations(text) {
  return String(text ?? '')
    .replace(/^[\s"'“”‘’«»【】[\]()]+/, '')
    .replace(/[\s"'“”‘’«»【】\](]+$/, '')
    .trim()
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function capText(text, max) {
  const value = String(text ?? '').trim()
  if (value.length <= max) return value
  const slice = value.slice(0, max)
  const breakAt = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('，'), slice.lastIndexOf(','))
  return (breakAt > max * 0.6 ? slice.slice(0, breakAt) : slice).trim()
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function dedupe(values) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    const key = String(value).toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

/**
 * Join short phrases with the separator that matches the script.
 * @param {string[]} phrases
 * @returns {string}
 */
function joinPhrases(phrases) {
  const list = dedupe(phrases.map((phrase) => cleanText(phrase)).filter(Boolean))
  if (list.length === 0) return ''
  const cjk = list.some((phrase) => /[\u4e00-\u9fff]/.test(phrase))
  return list.join(cjk ? '，' : ', ')
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  return String(text ?? '')
    .split(/[\n\r]+|(?<=[。！？!?;；])|(?<=\.)\s+/)
    .map((row) => cleanText(row))
    .filter(Boolean)
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitPhrases(text) {
  return String(text ?? '')
    .split(/[,，、;；|·•\n\r]+/)
    .map((row) => cleanText(row))
    .filter(Boolean)
}

/**
 * Markdown bullets that look like product content. Navigation rows and
 * pure links are dropped.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function markdownBullets(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    const match = /^\s{0,3}(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line)
    if (!match) continue
    const text = cleanText(match[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'))
    if (text.length < BULLET_MIN || text.length > BULLET_MAX) continue
    if (/^(home|menu|skip|share|login|sign in|cart|search|首页|登录|注册|购物车|菜单)$/i.test(text)) continue
    out.push(text)
  }
  return out
}

/**
 * Bullets that follow a selling / feature heading.
 * @param {string} markdown
 * @returns {string[]}
 */
function headingBullets(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/)
  const wanted = /(卖点|亮点|特点|优势|功能|特色|规格|参数|feature|highlight|benefit|why (?:choose|buy)|specification|what(?:'s| is) inside)/i
  const anyHeading = /^\s{0,3}#{1,6}\s+\S/
  let collecting = false
  const out = []
  for (const line of lines) {
    if (anyHeading.test(line)) {
      collecting = wanted.test(line)
      continue
    }
    if (!collecting) continue
    const match = /^\s{0,3}(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line)
    if (!match) continue
    const text = cleanText(match[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'))
    if (text.length < BULLET_MIN || text.length > BULLET_MAX) continue
    out.push(text)
  }
  return out
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function typesOf(value) {
  if (!value || typeof value !== 'object') return []
  const raw = /** @type {Record<string, unknown>} */ (value)['@type']
  if (typeof raw === 'string') return [raw.toLowerCase()]
  if (Array.isArray(raw)) return raw.filter((row) => typeof row === 'string').map((row) => row.toLowerCase())
  return []
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function textsOf(value) {
  if (typeof value === 'string') return [cleanText(value)]
  if (typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((row) => textsOf(row))
  if (value && typeof value === 'object') {
    const row = /** @type {Record<string, unknown>} */ (value)
    return [row.name, row.url, row['@id']].flatMap((inner) => textsOf(inner))
  }
  return []
}

/**
 * @param {Record<string, unknown>[]} nodes
 * @returns {string[]}
 */
function imageUrlsOf(nodes) {
  const urls = []
  for (const node of nodes) {
    if (!typesOf(node).some((type) => ['product', 'individualproduct', 'imageobject'].includes(type))) continue
    const candidates = [
      ...textsOf(node.image),
      ...textsOf(node.logo),
      ...textsOf(node.thumbnailUrl),
    ]
    urls.push(...candidates.filter((row) => /^https?:\/\//i.test(row)))
  }
  return urls
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function parsePriceNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  const text = String(raw ?? '').replace(/[^\d.,]/g, '')
  if (!text) return null
  const normalized = text.replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatPrice(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

/**
 * @param {unknown[]} values
 * @returns {number | null}
 */
function pickLowest(values) {
  let lowest = null
  for (const value of values) {
    const number = parsePriceNumber(value)
    if (number === null) continue
    if (lowest === null || number < lowest) lowest = number
  }
  return lowest
}

/**
 * Prices written in the page text, always anchored on a currency marker so
 * plain numbers never match.
 *
 * @param {string} text
 * @returns {string[]}
 */
function currencyMatches(text) {
  const source = String(text ?? '')
  const out = []
  const patterns = [
    /(?:[$€£¥₩₹]|\bUSD\b|\bEUR\b|\bCNY\b|\bRMB\b|\bJPY\b|\bGBP\b|\bAUD\b|\bCAD\b)\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi,
    /(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(?:元|美元|欧元|日元|英镑|USD|EUR|CNY|RMB|JPY|GBP)/gi,
  ]
  for (const pattern of patterns) {
    let match = pattern.exec(source)
    while (match) {
      out.push(match[1])
      match = pattern.exec(source)
    }
  }
  return out
}

/**
 * Lowest numeric price, Gxgen rule. Structured data wins over page text.
 *
 * @param {Record<string, unknown>[]} nodes
 * @param {Record<string, string[]>} meta
 * @param {string} text
 * @returns {string}
 */
export function extractPrice(nodes, meta, text) {
  const structured = []
  for (const node of nodes) {
    if (!typesOf(node).some((type) => ['offer', 'aggregateoffer', 'product'].includes(type))) continue
    for (const key of ['price', 'lowPrice', 'highPrice', 'priceSpecification']) {
      const value = node[key]
      if (value && typeof value === 'object') {
        const inner = /** @type {Record<string, unknown>} */ (value)
        structured.push(inner.price, inner.lowPrice)
        continue
      }
      structured.push(value)
    }
  }
  const fromStructured = pickLowest(structured)
  if (fromStructured !== null) return formatPrice(fromStructured)

  const fromMeta = pickLowest(metaAll(meta, ['product:price:amount', 'og:price:amount', 'itemprop:price', 'price']))
  if (fromMeta !== null) return formatPrice(fromMeta)

  const fromText = pickLowest(currencyMatches(text))
  return fromText === null ? '' : formatPrice(fromText)
}

/**
 * Segment names from JSON-LD category / breadcrumb / meta keywords.
 *
 * @param {Record<string, unknown>[]} nodes
 * @param {Record<string, string[]>} meta
 * @returns {string[]}
 */
export function extractCategories(nodes, meta) {
  const out = []
  for (const node of nodes) {
    if (typesOf(node).includes('breadcrumblist')) {
      const items = Array.isArray(node.itemListElement) ? node.itemListElement : []
      const names = items.map((item) => {
        if (!item || typeof item !== 'object') return ''
        const row = /** @type {Record<string, unknown>} */ (item)
        if (row.name) return cleanText(row.name)
        return cleanText(textsOf(row.item)[0] ?? '')
      })
      for (const name of names.slice(1)) out.push(name)
      continue
    }
    for (const key of ['category', 'articleSection', 'productCategory']) {
      const value = node[key]
      if (typeof value === 'string') {
        out.push(...value.split(/\s*>\s*|\s*\/\s*/).map((row) => cleanText(row)))
      } else if (Array.isArray(value)) {
        out.push(...value.flatMap((row) => (typeof row === 'string' ? row.split(/\s*>\s*/) : [])))
      }
    }
  }
  out.push(...splitPhrases(metaOne(meta, ['product:category', 'article:section'])))
  const generic = /^(home|首页|shop|store|all products|全部商品|产品)$/i
  const cleaned = dedupe(
    out
      .map((row) => cleanText(row))
      .filter((row) => row.length >= 2 && row.length <= 24 && !generic.test(row)),
  )
  return cleaned.slice(0, CATEGORIES_MAX)
}

/**
 * Assemble the canonical draft. Reader markdown supplies the narrative fields;
 * structured HTML metadata wins on identity fields (brand / sku / price /
 * categories / images) because a landing page states those explicitly.
 *
 * @param {{
 *   url: string,
 *   kind?: 'physical' | 'digital',
 *   reader?: { title: string, markdown: string } | null,
 *   page?: ParsedPage | null,
 * }} input
 * @returns {ImportedProduct}
 */
export function buildProductFields(input) {
  const { url, kind = 'physical', reader = null, page = null } = input
  const digital = kind === 'digital'
  const meta = page?.meta ?? {}
  const nodes = page?.nodes ?? []
  const markdown = reader?.markdown ?? ''
  const description = metaOne(meta, ['og:description', 'description', 'twitter:description', 'itemprop:description'])
  const pageText = [description, page?.text ?? '', markdown].filter(Boolean).join('\n')

  const title = cleanTitle(
    firstOf(reader?.title, page?.title, metaOne(meta, ['og:title', 'twitter:title', 'itemprop:name'])),
  )

  const bullets = [
    ...headingBullets(markdown),
    ...(page?.bullets ?? []),
    ...markdownBullets(markdown),
  ]
  const structuredProps = collectAdditionalProperties(nodes)
  const sentences = splitSentences(description)

  const sellingPoints = joinPhrases(pickSellingPoints({ bullets, structuredProps, sentences }))
  const features = joinPhrases(pickFeatures({ bullets, structuredProps, description }))

  const audience = firstOf(
    audienceFromJsonLd(nodes),
    metaOne(meta, ['product:audience', 'audience', 'og:audience']),
    audienceFromText(pageText),
  )

  const brand = firstOf(
    brandFromJsonLd(nodes),
    metaOne(meta, ['product:brand', 'og:brand', 'brand', 'itemprop:brand']),
    title.siteName,
    metaOne(meta, ['og:site_name', 'application-name']),
  )

  const sku = digital
    ? ''
    : firstOf(skuFromJsonLd(nodes), metaOne(meta, ['product:retailer_item_id', 'itemprop:sku', 'sku', 'mpn']))

  const price = digital ? '' : extractPrice(nodes, meta, pageText)
  const promotion = digital ? '' : promotionFromText(pageText)

  const images = dedupe(
    [
      ...imageUrlsOf(nodes),
      ...metaAll(meta, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image', 'image_src']),
      ...(page?.images ?? []),
      ...extractMarkdownImages(markdown),
    ]
      .map((row) => absoluteUrl(row, url))
      .filter((row) => /^https?:\/\//i.test(row)),
  ).slice(0, IMAGES_MAX)

  return {
    name: title.name,
    selling_points: capText(sellingPoints, 400),
    features: capText(features, 1000),
    target_audience: capText(audience, 200),
    brand: capText(brand, NAME_MAX),
    price,
    sku: capText(sku, 64),
    promotion: capText(promotion, 200),
    link: url,
    categories: extractCategories(nodes, meta),
    images,
  }
}

/**
 * @param {{ bullets: string[], structuredProps: { name: string, value: string }[], sentences: string[] }} input
 * @returns {string[]}
 */
function pickSellingPoints(input) {
  const fromBullets = input.bullets.map((row) => capText(row, 32)).filter((row) => row.length >= 2)
  if (fromBullets.length > 0) return fromBullets.slice(0, 5)

  const fromProps = input.structuredProps
    .map((row) => capText(row.name && row.value ? `${row.name}: ${row.value}` : row.name || row.value, 32))
    .filter((row) => row.length >= 2)
  if (fromProps.length > 0) return fromProps.slice(0, 5)

  // Description fallback: keep the clause readable instead of chopping it at
  // the bullet-sized cap.
  return input.sentences
    .flatMap((row) => splitPhrases(row))
    .map((row) => capText(row, 60))
    .filter((row) => row.length >= 2)
    .slice(0, 5)
}

/**
 * @param {{ bullets: string[], structuredProps: { name: string, value: string }[], description: string }} input
 * @returns {string[]}
 */
function pickFeatures(input) {
  const fromProps = input.structuredProps
    .map((row) => (row.name && row.value ? `${row.name}: ${row.value}` : row.name || row.value))
    .map((row) => capText(row, 60))
    .filter((row) => row.length >= 2)
  if (fromProps.length > 0) return fromProps.slice(0, 8)

  const fromBullets = input.bullets.map((row) => capText(row, 60)).filter((row) => row.length >= 2)
  if (fromBullets.length > 0) return fromBullets.slice(0, 8)

  const description = cleanText(input.description)
  return description ? [capText(description, 300)] : []
}

/**
 * @param {Record<string, unknown>[]} nodes
 * @returns {{ name: string, value: string }[]}
 */
function collectAdditionalProperties(nodes) {
  const out = []
  for (const node of nodes) {
    const rows = node.additionalProperty
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const entry = /** @type {Record<string, unknown>} */ (row)
      out.push({ name: cleanText(entry.name), value: cleanText(entry.value) })
    }
  }
  return out
}

/**
 * @param {Record<string, unknown>[]} nodes
 * @returns {string}
 */
function brandFromJsonLd(nodes) {
  for (const node of nodes) {
    const types = typesOf(node)
    if (!types.some((type) => ['product', 'individualproduct', 'brand', 'organization'].includes(type))) continue
    const brand = node.brand ?? (types.includes('brand') ? node.name : undefined)
    const text = textsOf(brand)[0] ?? ''
    if (text) return text
  }
  return ''
}

/**
 * schema.org audience values are objects (PeopleAudience.audienceType) as often
 * as they are plain strings.
 * @param {unknown} value
 * @returns {string}
 */
function audienceText(value) {
  if (Array.isArray(value)) return audienceText(value[0])
  if (value && typeof value === 'object') {
    const row = /** @type {Record<string, unknown>} */ (value)
    return firstOf(row.audienceType, row.name, row.description, row.value)
  }
  return cleanText(value)
}

/**
 * @param {Record<string, unknown>[]} nodes
 * @returns {string}
 */
function audienceFromJsonLd(nodes) {
  for (const node of nodes) {
    const types = typesOf(node)
    if (types.includes('peopleaudience') || types.includes('audience')) {
      const own = audienceText(node)
      if (own) return own
      continue
    }
    if (!types.some((type) => ['product', 'individualproduct'].includes(type))) continue
    const text = audienceText(node.audience)
    if (text) return text
  }
  return ''
}

/**
 * @param {Record<string, unknown>[]} nodes
 * @returns {string}
 */
function skuFromJsonLd(nodes) {
  for (const node of nodes) {
    if (!typesOf(node).some((type) => ['product', 'individualproduct'].includes(type))) continue
    for (const key of ['sku', 'mpn', 'gtin13', 'gtin12', 'gtin', 'productID']) {
      const text = textsOf(node[key])[0] ?? ''
      if (text) return text
    }
  }
  for (const node of nodes) {
    if (!typesOf(node).includes('offer')) continue
    const text = textsOf(node.sku ?? node.mpn)[0] ?? ''
    if (text) return text
  }
  return ''
}

/**
 * Shortest phrase that reads as a running promotion. The phrase is cut out of
 * the page text around the keyword, so a promo buried in a long paragraph still
 * comes back as a short, usable line.
 * @param {string} text
 * @returns {string}
 */
export function promotionFromText(text) {
  const source = cleanText(text)
  if (!source) return ''
  const hits = []
  for (const pattern of PROMO_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
    const expression = new RegExp(pattern.source, flags)
    let match = expression.exec(source)
    while (match) {
      hits.push(promotionWindow(source, match.index, match[0].length))
      match = expression.exec(source)
    }
  }
  const cleaned = dedupe(hits.map((row) => row.trim()).filter((row) => row.length >= 2 && row.length <= 80))
  cleaned.sort((a, b) => a.length - b.length)
  return cleaned[0] ?? ''
}

/**
 * Window around a keyword match: the enclosing clause when there is one, else a
 * short word-aligned span, always capped so the phrase stays on one line.
 * @param {string} source
 * @param {number} index
 * @param {number} length
 * @returns {string}
 */
function promotionWindow(source, index, length) {
  const limit = 80
  const boundary = /[。！？!?;；\n，,]/
  let start = index
  let bounded = false
  for (let cursor = index; cursor > 0 && index - cursor < 40; cursor -= 1) {
    if (boundary.test(source[cursor - 1])) {
      start = cursor
      bounded = true
      break
    }
  }
  if (!bounded) {
    start = Math.max(0, index - 20)
    while (start > 0 && !/\s/.test(source[start - 1])) start -= 1
  }
  let end = Math.min(source.length, index + length)
  while (end < source.length && !boundary.test(source[end])) end += 1
  if (end - start > limit) end = start + limit
  return cleanText(source.slice(start, end))
}

/**
 * "Ideal for …" style audience statements already written on the page.
 * @param {string} text
 * @returns {string}
 */
function audienceFromText(text) {
  const pattern = /(?:适合|适用于|专为|适用人群|适合人群|面向)[^\n。！？]{2,40}|(?:ideal|perfect|designed|made)\s+for\s+[^\n.!?]{2,60}/i
  const match = pattern.exec(String(text ?? ''))
  if (!match) return ''
  return cleanText(match[0]).replace(/^[,，\s]+/, '')
}

/**
 * A draft nobody can use is a failure, not an empty success: the form needs a
 * name plus at least some copy.
 *
 * @param {ImportedProduct} fields
 * @returns {boolean}
 */
export function isUsableImport(fields) {
  return Boolean(fields.name || fields.selling_points || fields.features)
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function readerKeyOf(env) {
  return String(env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN || '').trim()
}

/**
 * @param {typeof fetch} fetcher
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function withTimeout(fetcher, url, init, timeoutMs) {
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined
  return fetcher(url, signal ? { ...init, signal } : init)
}

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readCapped(response) {
  if (typeof response.text !== 'function') return ''
  const value = String((await response.text()) ?? '')
  return value.length > MAX_TEXT_CHARS ? value.slice(0, MAX_TEXT_CHARS) : value
}

/**
 * Reader track: clean markdown through the OmniMux reader gateway.
 * Unconfigured or unsuccessful reads return null — the direct track still runs.
 *
 * @param {{ url: string, env: Record<string, string | undefined>, fetcher: typeof fetch, timeoutMs: number }} input
 * @returns {Promise<{ reader: { title: string, markdown: string } | null, note: string }>}
 */
async function readViaReaderGateway(input) {
  const key = readerKeyOf(input.env)
  if (!key) return { reader: null, note: 'reader skipped: no OMNIMUX_API_KEY' }
  const base = resolveReaderBaseUrl(input.env.OMNIMUX_BASE_URL)
  try {
    const response = await withTimeout(input.fetcher, `${base}/reader`, {
      method: 'POST',
      headers: {
        accept: 'text/plain, application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'user-agent': READER_USER_AGENT,
      },
      body: JSON.stringify({ model: READER_MODEL, url: input.url }),
    }, input.timeoutMs)
    if (!response.ok) return { reader: null, note: `reader responded HTTP ${String(response.status)}` }
    const parsed = parseReaderMarkdown(await readCapped(response))
    if (!parsed.markdown.trim()) return { reader: null, note: 'reader returned empty markdown' }
    return { reader: parsed, note: '' }
  } catch (error) {
    return { reader: null, note: `reader failed: ${String(error instanceof Error ? error.message : error)}` }
  }
}

/**
 * Direct track: fetch the landing page and parse its own metadata.
 *
 * @param {{ url: string, fetcher: typeof fetch, timeoutMs: number }} input
 * @returns {Promise<ParsedPage>}
 */
async function readViaDirectFetch(input) {
  const response = await withTimeout(input.fetcher, input.url, {
    method: 'GET',
    redirect: 'follow',
    headers: { accept: ACCEPT_HTML, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', 'user-agent': USER_AGENT },
  }, input.timeoutMs)
  if (!response.ok) {
    throw new LinkImportError('link-import-failed', `the page responded HTTP ${String(response.status)}`)
  }
  const html = await readCapped(response)
  if (!html.trim()) throw new LinkImportError('link-import-empty', 'the page returned an empty body')
  return parseHtmlDocument(html, input.url)
}

/**
 * Import a product draft from one landing-page link.
 *
 * @param {{
 *   url: unknown,
 *   kind?: 'physical' | 'digital',
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   timeoutMs?: number,
 * }} args
 * @returns {Promise<ImportedProduct>}
 * @throws {LinkImportError}
 */
export async function importProductFromUrl(args) {
  const url = normalizeImportUrl(args?.url)
  const kind = args?.kind === 'digital' ? 'digital' : 'physical'
  const env = args?.env ?? (typeof process !== 'undefined' ? process.env : {})
  const fetcher = args?.fetcher ?? (typeof fetch === 'function' ? fetch : null)
  if (!fetcher) throw new LinkImportError('link-import-failed', 'no fetch implementation is available')
  const timeoutMs = Number.isFinite(args?.timeoutMs) ? Number(args.timeoutMs) : DEFAULT_TIMEOUT_MS

  const readerAttempt = await readViaReaderGateway({ url, env, fetcher, timeoutMs })

  let page = null
  let directError = ''
  try {
    page = await readViaDirectFetch({ url, fetcher, timeoutMs })
  } catch (error) {
    directError = String(error instanceof Error ? error.message : error)
  }

  if (!readerAttempt.reader && !page) {
    const notes = [readerAttempt.note, directError ? `page failed: ${directError}` : ''].filter(Boolean)
    throw new LinkImportError('link-import-failed', notes.join('; ') || 'the page could not be read')
  }

  const fields = buildProductFields({ url, kind, reader: readerAttempt.reader, page })
  if (!isUsableImport(fields)) {
    throw new LinkImportError('link-import-empty', 'no product information was found on the page')
  }
  return fields
}
