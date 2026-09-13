/**
 * Link importer: one landing-page URL in, one canonical product draft out.
 *
 * Two tracks, one answer. The page is read twice over: the hub's Jina Reader
 * (`omnimux_page_fetch`) returns clean Markdown for the model, and the vertical's
 * own guarded GET keeps the structured extraction exact — `<title>`, meta,
 * OpenGraph, Twitter card, JSON-LD (`Product` / `Offer` / `BreadcrumbList`) and
 * the list items / body copy the page renders. Either read may fail on its own;
 * the draft is assembled from whatever came back.
 *
 * The model then reads that text through the hub's one-shot `textComplete` seam,
 * with `gemini-3.8-flash` by default: a digital / brand site is decomposed by the
 * brand-strategy v2 playbook into six strategy modules, a physical listing is
 * extracted by the Gxgen import-from-link v9 playbook. Without a hub, or when the
 * model fails, the draft falls back to the local extraction above and says so —
 * the request is never turned into an error by a missing model.
 *
 * The output field contract mirrors the Gxgen import playbook already vendored
 * at `prompts/physical/import-from-link.v9.txt` — name, selling_points,
 * features, target_audience, brand, price, sku, promotion, link, categories,
 * images. `price` keeps that playbook's rule: the lowest numeric value, no
 * currency symbol. Digital offerings never carry price / sku / promotion,
 * matching the library rule that those are physical-only fields.
 *
 * Server-side only, and self-contained by contract: this vertical opens no
 * OmniMux HTTP client and reads no `OMNIMUX_*` credential — the hub holds the key
 * and does the call ([hub contract](../../../../docs/contracts/hub.md)).
 */
import { ANALYSIS_MODES, analyzeLandingPage, isDigitalLandingPage, normalizeHub } from './ai-analysis.js'

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

/**
 * Keys `importProductFromUrl` adds on top of the canonical field set: the kind
 * the page turned out to be, the six-module strategy an all-model digital import
 * produced, and how the draft was read.
 */
export const IMPORT_DRAFT_EXTRA_KEYS = Object.freeze(['kind', 'brand_strategy', 'analysis'])

export const DEFAULT_TIMEOUT_MS = 12000

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 OmniMuxProducts/0.1'
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

const MAX_TEXT_CHARS = 512 * 1024
const MAX_REDIRECTS = 5
const NAME_MAX = 40
const CATEGORIES_MAX = 5
const IMAGES_MAX = 8
const BULLET_MIN = 4
const BULLET_MAX = 80

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

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

/**
 * Phrases that mark a running promotion rather than ordinary copy.
 */
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
 * Marketing decorations that wrap a real product name. A bracketed prefix is
 * dropped as one block (brackets included) so no orphan `】` survives;
 * unbracketed store phrases are dropped only when they lead the string and
 * something readable remains.
 */
const MARKETING_WORDS = [
  '官方旗舰店', '官方旗舰', '官方自营', '官方直销', '官方商城', '品牌官方店', '官方店',
  '天猫旗舰店', '天猫官方', '天猫推荐', '京东自营', '旗舰店', '专营店', '专卖店',
  '正品保证', '官方正品', '新品首发', '新品上市', '爆款推荐', '限时特惠', '限时秒杀', '今日特价',
  '官方', '自营', '新品', '新款', '正品', '爆款', '热卖', '热销', '旗舰',
  'official store', 'official', 'new arrival', 'new', 'hot sale', 'hot', 'best seller', 'bestseller',
  'sale', 'flash sale', 'limited time', 'limited', 'free shipping', 'featured', 'top rated',
].join('|')

/** The whole decoration on its own — `[Official]`, `【新品】`. */
const MARKETING_WORD = new RegExp(`^(?:${MARKETING_WORDS})$`, 'i')

/** A decoration leading a longer string — `官方旗舰店 轻氧羽绒服`. */
const MARKETING_LEAD = new RegExp(`^(?:${MARKETING_WORDS})(?![\\u4e00-\\u9fff\\w])`, 'i')

/**
 * Navigation chrome. These rows are real links on a real page, so they must
 * never be read back as selling points, features, brands or categories.
 */
const NAVIGATION_WORDS = [
  'home', 'homepage', 'home page', 'main', 'main page', 'menu', 'main menu', 'navigation', 'nav',
  'skip to content', 'skip to main content', 'skip to content',
  'search', 'login', 'log in', 'sign in', 'signin', 'sign up', 'signup', 'register', 'registration',
  'cart', 'shopping cart', 'my cart', 'view cart', 'basket', 'checkout',
  'my account', 'account', 'profile', 'my orders', 'orders', 'wishlist', 'my wishlist',
  'favorites', 'favourites', 'all products', 'all items', 'all', 'shop all', 'shop', 'store', 'products', 'product',
  'category', 'categories', 'collections', 'collection', 'contact', 'contact us', 'help', 'help center',
  'customer service', 'support', 'faq', 'about', 'about us', 'blog', 'news', 'sitemap',
  'close', 'back', 'next', 'previous', 'prev', 'share', 'follow us', 'follow', 'subscribe',
  'language', 'currency', 'more', 'loading', 'copyright',
  '首页', '主页', '网站首页', '官网首页', '登录', '登陆', '登录/注册', '注册', '注册/登录',
  '我的', '我的账户', '我的账号', '我的订单', '个人中心', '会员中心', '购物车', '购物袋', '加入购物车',
  '全部商品', '所有商品', '商品分类', '分类', '菜单', '导航', '主导航', '搜索',
  '客服', '在线客服', '联系客服', '联系我们', '帮助', '帮助中心',
  '关于我们', '关于', '收藏', '我的收藏', '设置', '返回', '关闭', '更多', '语言', '货币',
  '分享', '关注', '订阅', '版权所有',
]

const NAVIGATION_SET = new Set(NAVIGATION_WORDS)

/** Category segments that only name the catalogue root. */
const GENERIC_CATEGORY = /^(?:home|首页|shop|store|all products|全部商品|产品|商品)$/i

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
 * Canonical form of a url host, so two spellings of the same address cannot
 * pass as two different hosts: surrounding brackets, trailing root dots, a
 * zone id and letter case all drop out.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeHostname(raw) {
  let host = String(raw ?? '').trim().toLowerCase()
  host = host.replace(/^\[/, '').replace(/\]$/, '')
  host = host.split('%')[0]
  while (host.endsWith('.')) host = host.slice(0, -1)
  return host
}

/**
 * Expand an IPv6 literal into eight 16-bit groups. A trailing dotted quad
 * (`::ffff:127.0.0.1`) folds into the last two groups. Returns null when the
 * literal cannot be understood — an unreadable address is never fetched.
 *
 * @param {string} host
 * @returns {number[] | null}
 */
function expandIpv6(host) {
  let text = normalizeHostname(host)
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (dotted) {
    const bytes = dotted[1].split('.').map((part) => Number.parseInt(part, 10))
    if (bytes.some((byte) => !Number.isFinite(byte) || byte > 255)) return null
    const hi = ((bytes[0] << 8) | bytes[1]).toString(16)
    const lo = ((bytes[2] << 8) | bytes[3]).toString(16)
    text = `${text.slice(0, dotted.index)}${hi}:${lo}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = 8 - head.length - tail.length
  if (fill < 0) return null
  const groups = [...head, ...new Array(halves.length === 2 ? fill : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const out = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    out.push(Number.parseInt(group, 16))
  }
  return out
}

/**
 * The IPv4 an IPv6 literal carries, when it carries one: IPv4-mapped
 * (`::ffff:0:0/96`), IPv4-compatible (`::/96`) and NAT64 (`64:ff9b::/96`).
 *
 * @param {number[]} groups
 * @returns {number[] | null}
 */
function ipv4InsideIpv6(groups) {
  const low = groups.slice(6)
  const quad = [(low[0] >> 8) & 0xff, low[0] & 0xff, (low[1] >> 8) & 0xff, low[1] & 0xff]
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff)) return quad
  const nat64 = [0x64, 0xff9b, 0, 0, 0, 0]
  if (groups.slice(0, 6).every((group, index) => group === nat64[index])) return quad
  return null
}

/**
 * Read a host that is written as a number rather than a dotted quad
 * (`2130706433`, `0x7f000001`, `0177.0.0.1`, `127.1`).
 *
 * @param {string} host
 * @returns {{ bytes: number[], canonical: boolean } | null}
 */
function numericIpv4(host) {
  const parts = host.split('.')
  if (parts.length > 4) return null
  const numbers = []
  for (const part of parts) {
    if (/^0[xX][0-9a-f]+$/.test(part)) {
      numbers.push(Number.parseInt(part.slice(2), 16))
      continue
    }
    if (/^0[0-7]+$/.test(part)) {
      numbers.push(Number.parseInt(part.slice(1), 8))
      continue
    }
    if (/^\d+$/.test(part)) {
      numbers.push(Number.parseInt(part, 10))
      continue
    }
    return null
  }
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null
  const last = Number(numbers.pop())
  const byteCount = 4 - numbers.length
  if (numbers.some((value) => value > 255)) return null
  if (last >= 2 ** (8 * byteCount)) return null
  const bytes = [...numbers]
  for (let shift = byteCount - 1; shift >= 0; shift -= 1) bytes.push((last >> (8 * shift)) & 0xff)
  const canonical = parts.length === 4
    && parts.every((part) => /^\d{1,3}$/.test(part) && !/^0\d/.test(part))
  return { bytes, canonical }
}

/**
 * @param {number[]} bytes
 * @returns {boolean}
 */
function isBlockedIpv4(bytes) {
  const [a, b] = bytes
  if (bytes.every((byte) => byte === 0)) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

/**
 * @param {number[]} groups
 * @returns {boolean}
 */
function isBlockedIpv6(groups) {
  if (groups.every((group) => group === 0)) return true
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true
  const first = groups[0]
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xff00) === 0xff00) return true
  if (first === 0x2001 && groups[1] === 0x0db8) return true
  return false
}

/**
 * Should this host be refused as a fetch target?
 *
 * Loopback, private, link-local, CGNAT, multicast and reserved ranges are all
 * refused, in every spelling: trailing root dots (`localhost.`), IPv4-mapped
 * IPv6 (`::ffff:7f00:1`), IPv4-compatible and NAT64 literals, and hosts written
 * as a bare decimal / hex / octal number. A non-canonical numeric host is
 * refused outright — no product page is published at `0177.0.0.1`.
 *
 * @param {unknown} hostname
 * @returns {boolean}
 */
export function isPrivateHost(hostname) {
  const host = normalizeHostname(hostname)
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.localdomain')) return true
  if (host.endsWith('.internal') || host.endsWith('.home.arpa')) return true
  if (host.includes(':')) {
    const groups = expandIpv6(host)
    if (!groups) return true
    if (isBlockedIpv6(groups)) return true
    const quad = ipv4InsideIpv6(groups)
    return quad === null ? false : isBlockedIpv4(quad)
  }
  const numeric = numericIpv4(host)
  if (!numeric) return false
  if (!numeric.canonical) return true
  return isBlockedIpv4(numeric.bytes)
}

/**
 * The legality and private-host guard every fetch target passes: the pasted
 * link, and then each redirect hop in turn.
 *
 * @param {URL} parsed
 * @param {string} subject
 * @throws {LinkImportError} code `invalid-url`
 */
function assertAllowedUrl(parsed, subject) {
  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new LinkImportError('invalid-url', `${subject} is not an http(s) address`)
  }
  if (!parsed.hostname) throw new LinkImportError('invalid-url', `${subject} has no host`)
  if (parsed.username || parsed.password) {
    throw new LinkImportError('invalid-url', `${subject} must not embed credentials`)
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new LinkImportError('invalid-url', `${subject} points at a private host`)
  }
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
  assertAllowedUrl(parsed, 'the page url')
  parsed.hash = ''
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) parsed.searchParams.delete(key)
  }
  const query = parsed.searchParams.toString()
  return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`
}

/**
 * Resolve one `Location` header and run it through the same guard as the
 * pasted link. A hop into a private network is refused before any socket opens.
 *
 * @param {string} location
 * @param {string} baseUrl
 * @returns {string}
 * @throws {LinkImportError}
 */
function resolveRedirectTarget(location, baseUrl) {
  let parsed = null
  try {
    parsed = new URL(String(location ?? '').trim(), baseUrl)
  } catch {
    throw new LinkImportError('invalid-url', 'the redirect target is not a valid url')
  }
  assertAllowedUrl(parsed, 'the redirect target')
  return parsed.toString()
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
 * Is this string pure site chrome rather than page content? Bare nav labels and
 * separator-joined rows of them ("首页 / 登录", "Home | Cart") both qualify.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isNavigationText(raw) {
  const text = cleanText(raw)
  if (!text) return true
  const normalized = text
    .toLowerCase()
    .replace(/[|/·•>»:：\-—–]+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  if (!normalized) return true
  if (NAVIGATION_SET.has(normalized)) return true
  const segments = normalized.split('/').map((segment) => segment.trim()).filter(Boolean)
  if (segments.length > 1 && segments.every((segment) => NAVIGATION_SET.has(segment))) return true
  return false
}

/**
 * Should a leading bracketed block be treated as decoration rather than part of
 * the product name? Curated marketing words always go; a short Latin tag
 * (`[Official]`, `(Hot)`) goes; a CJK name in brackets (`【轻氧羽绒服】`) and a
 * size/count marker (`[3-pack]`) stay.
 *
 * @param {string} inner
 * @returns {boolean}
 */
function isDecorationBlock(inner) {
  const text = cleanText(inner)
  if (!text) return true
  if (MARKETING_WORD.test(text)) return true
  if (/[0-9]/.test(text)) return false
  if (!/^[\x20-\x7e]+$/.test(text)) return false
  return text.length <= 12
}

/**
 * Drop marketing decorations from the front of a title: whole bracketed blocks
 * (`【官方旗舰】`, `[官方自营]`, `（天猫推荐）`) and leading unbracketed store
 * phrases. Stripping a block removes its closing bracket with it, so no orphan
 * `】` is left behind.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function stripMarketingPrefixes(raw) {
  let text = cleanText(raw)
  for (let guard = 0; guard < 6; guard += 1) {
    const bracketed = /^([【\[(（])([^】\])）]{1,24})([】\])）])\s*/.exec(text)
    if (bracketed && isDecorationBlock(bracketed[2])) {
      text = text.slice(bracketed[0].length).trim()
      continue
    }
    const bare = MARKETING_LEAD.exec(text)
    if (bare && text.length - bare[0].length >= 2) {
      text = text.slice(bare[0].length).replace(/^[\s\-—–·|丨:：,，、]+/, '').trim()
      continue
    }
    break
  }
  return text
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripDecorations(text) {
  const stripped = stripMarketingPrefixes(text)
  return stripped
    // A surviving block keeps its own brackets (`[3-pack] Socks`), but a stray
    // closing bracket left by a half-removed decoration does not survive.
    .replace(/^[\s"'“”‘’«»】\]）)]+/, '')
    .replace(/[\s"'“”‘’«»【\[（(]+$/, '')
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
 * Split a page title into a product name and the trailing site name.
 * @param {unknown} raw
 * @returns {{ name: string, siteName: string }}
 */
export function cleanTitle(raw) {
  const text = cleanText(raw)
  if (!text) return { name: '', siteName: '' }
  let candidate = stripMarketingPrefixes(text)
  let siteName = ''
  for (const separator of [' | ', ' |', '｜', ' – ', ' — ', ' - ', ' :: ', ' · ']) {
    if (!candidate.includes(separator)) continue
    const parts = candidate.split(separator).map((part) => part.trim()).filter(Boolean)
    if (parts.length < 2) continue
    const head = parts[0]
    const tail = parts[parts.length - 1]
    if (isNavigationText(head) || head.length >= 3) {
      // The head is the product slot: a nav label there means this title names
      // no product, and the tail is the site name.
      candidate = head
      siteName = tail
    } else {
      candidate = parts.slice(1).join(' ')
    }
    break
  }
  const name = capText(stripDecorations(candidate), NAME_MAX)
  const site = capText(stripDecorations(siteName), NAME_MAX)
  return {
    name: isNavigationText(name) ? '' : name,
    siteName: isNavigationText(site) ? '' : site,
  }
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
 * A phrase worth putting in the draft: long enough to say something, and not
 * site chrome.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
function isProductPhrase(raw) {
  const text = cleanText(raw)
  if (text.length < 2) return false
  return !isNavigationText(text)
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
  const images = extractImgTags(source)
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
 * List rows that read as content. Navigation entries (`首页`, `登录`, `购物车`,
 * `Home`, `Cart`, …) and pure links are dropped here so nothing downstream can
 * mistake them for selling points.
 *
 * @param {string} html
 * @returns {string[]}
 */
function extractListItems(html) {
  const items = String(html ?? '').match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) ?? []
  const out = []
  for (const item of items) {
    const text = cleanText(item.replace(/<\/?li\b[^>]*>/gi, ''))
    if (!isProductPhrase(text)) continue
    out.push(text)
  }
  return out
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
 * First value that carries information. Site chrome never qualifies, so a
 * `<title>… | Store</title>` tail cannot come back as a brand.
 *
 * @param {...unknown} values
 * @returns {string}
 */
function firstOf(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text && !isNavigationText(text)) return text
  }
  return ''
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
 * The product copy stated by structured data, used when the page head has no
 * description of its own.
 *
 * @param {Record<string, unknown>[]} nodes
 * @returns {string}
 */
function descriptionFromJsonLd(nodes) {
  const wanted = ['product', 'individualproduct', 'offer', 'aggregateoffer', 'website']
  for (const node of nodes) {
    if (!typesOf(node).some((type) => wanted.includes(type))) continue
    const text = cleanText(typeof node.description === 'string' ? node.description : '')
    if (text.length >= 12) return text
  }
  return ''
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
  const cleaned = dedupe(
    out
      .map((row) => cleanText(row))
      .filter((row) => row.length >= 2 && row.length <= 24 && !GENERIC_CATEGORY.test(row) && !isNavigationText(row)),
  )
  return cleaned.slice(0, CATEGORIES_MAX)
}

/**
 * Assemble the canonical draft from the parsed document.
 *
 * @param {{
 *   url: string,
 *   kind?: 'physical' | 'digital',
 *   page?: ParsedPage | null,
 * }} input
 * @returns {ImportedProduct}
 */
export function buildProductFields(input) {
  const { url, kind = 'physical', page = null } = input
  const digital = kind === 'digital'
  const meta = page?.meta ?? {}
  const nodes = page?.nodes ?? []

  const description = firstOf(
    metaOne(meta, ['og:description', 'description', 'twitter:description', 'itemprop:description']),
    descriptionFromJsonLd(nodes),
  )
  const pageText = [description, page?.text ?? ''].filter(Boolean).join('\n')

  const title = cleanTitle(
    firstOf(page?.title, metaOne(meta, ['og:title', 'twitter:title', 'itemprop:name'])),
  )

  const bullets = (page?.bullets ?? []).filter(isProductPhrase)
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
  const fromBullets = input.bullets
    .filter(isProductPhrase)
    .map((row) => capText(row, 32))
    .filter(isProductPhrase)
  if (fromBullets.length > 0) return fromBullets.slice(0, 5)

  const fromProps = input.structuredProps
    .map((row) => capText(row.name && row.value ? `${row.name}: ${row.value}` : row.name || row.value, 32))
    .filter(isProductPhrase)
  if (fromProps.length > 0) return fromProps.slice(0, 5)

  // Description fallback: keep the clause readable instead of chopping it at
  // the bullet-sized cap.
  return input.sentences
    .flatMap((row) => splitPhrases(row))
    .filter(isProductPhrase)
    .map((row) => capText(row, 60))
    .filter(isProductPhrase)
    .slice(0, 5)
}

/**
 * @param {{ bullets: string[], structuredProps: { name: string, value: string }[], description: string }} input
 * @returns {string[]}
 */
function pickFeatures(input) {
  const fromProps = input.structuredProps
    .map((row) => (row.name && row.value ? `${row.name}: ${row.value}` : row.name || row.value))
    .filter(isProductPhrase)
    .map((row) => capText(row, 60))
    .filter(isProductPhrase)
  if (fromProps.length > 0) return fromProps.slice(0, 8)

  const fromBullets = input.bullets
    .filter(isProductPhrase)
    .map((row) => capText(row, 60))
    .filter(isProductPhrase)
  if (fromBullets.length > 0) return fromBullets.slice(0, 8)

  const description = cleanText(input.description)
  return isProductPhrase(description) && description.length >= 12 ? [capText(description, 300)] : []
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
 * A draft nobody can use is a failure, not an empty success. The name must be a
 * real product name — never a nav label — and something else must have been
 * read: copy, offer data or product detail. A page whose entire content was
 * site chrome therefore fails instead of reporting a hollow success.
 *
 * @param {ImportedProduct} fields
 * @returns {boolean}
 */
export function isUsableImport(fields) {
  const name = cleanText(fields?.name)
  if (!name || isNavigationText(name)) return false
  const hasCopy = Boolean(cleanText(fields?.selling_points) || cleanText(fields?.features))
  const hasOffer = Boolean(cleanText(fields?.price) || cleanText(fields?.sku))
  const hasDetail = Boolean(cleanText(fields?.brand)) || (fields?.categories ?? []).length > 0
  return hasCopy || hasOffer || hasDetail
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
 * @param {Response} response
 * @param {string} name
 * @returns {string}
 */
function headerOf(response, name) {
  const headers = response?.headers
  if (!headers) return ''
  if (typeof headers.get === 'function') return String(headers.get(name) ?? '').trim()
  const value = headers[name] ?? headers[name.toLowerCase()]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Follow the page's own redirect chain, one manually validated hop at a time.
 * Every hop runs through the same legality and private-host guard as the pasted
 * link, so a public URL cannot bounce this local-only route into the machine's
 * network. A transport failure (DNS, reset, timeout) is a read failure and is
 * reported as one, never as an internal error.
 *
 * @param {{ url: string, fetcher: typeof fetch, timeoutMs: number }} input
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
async function fetchPageDocument(input) {
  let target = input.url
  const visited = new Set([target])
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await withTimeout(input.fetcher, target, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: ACCEPT_HTML, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', 'user-agent': USER_AGENT },
      }, input.timeoutMs)
      const status = Number(response?.status ?? 0)
      if (REDIRECT_STATUSES.has(status)) {
        const location = headerOf(response, 'location')
        if (!location) {
          throw new LinkImportError('link-import-failed', `the page redirected with HTTP ${String(status)} but sent no target`)
        }
        const next = resolveRedirectTarget(location, target)
        if (visited.has(next)) throw new LinkImportError('link-import-failed', 'the page redirected in a loop')
        visited.add(next)
        target = next
        continue
      }
      if (!response.ok) {
        throw new LinkImportError('link-import-failed', `the page responded HTTP ${String(status)}`)
      }
      const html = await readCapped(response)
      if (!html.trim()) throw new LinkImportError('link-import-empty', 'the page returned an empty body')
      return { html, finalUrl: target }
    }
  } catch (error) {
    if (error instanceof LinkImportError) throw error
    throw new LinkImportError('link-import-failed', `the page could not be read: ${messageOf(error)}`)
  }
  throw new LinkImportError('link-import-failed', 'the page redirected too many times')
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error ?? 'unknown error')
}

/**
 * Ask the hub to read the page (OmniMux Jina Reader, markdown out). A missing
 * seam or a failed read is not an error here: the caller still has its own GET.
 *
 * @param {{ hub: Record<string, unknown> | null, url: string }} input
 * @returns {Promise<{ pageContent: string, title: string } | null>}
 */
async function readViaHub(input) {
  if (!input.hub || typeof input.hub.pageFetch !== 'function') return null
  try {
    const answer = await input.hub.pageFetch(input.url)
    const row = answer && typeof answer === 'object' ? /** @type {Record<string, unknown>} */ (answer) : {}
    const pageContent = typeof row.pageContent === 'string' ? row.pageContent.trim() : ''
    if (!pageContent) return null
    return { pageContent, title: typeof row.title === 'string' ? row.title.trim() : '' }
  } catch {
    return null
  }
}

/**
 * The vertical's own guarded GET. Kept as a promise-returning step so both page
 * reads can run together and fail independently.
 *
 * @param {{ url: string, fetcher: typeof fetch | null, timeoutMs: number }} input
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
async function readPageDocument(input) {
  if (!input.fetcher) throw new LinkImportError('link-import-failed', 'no fetch implementation is available')
  return fetchPageDocument({ url: input.url, fetcher: input.fetcher, timeoutMs: input.timeoutMs })
}

/**
 * A page known only as Markdown: no document head, no structured data, just the
 * body text. Name, audience phrasing and promo lines still read out of it.
 *
 * @param {{ pageContent: string, title: string }} hubPage
 * @returns {ParsedPage}
 */
function pageFromMarkdown(hubPage) {
  return {
    title: cleanText(hubPage.title),
    canonical: '',
    meta: {},
    nodes: [],
    images: [],
    bullets: [],
    text: cleanText(hubPage.pageContent),
  }
}

/**
 * Read one page both ways at once: the hub returns clean Markdown for the model,
 * the guarded GET keeps structured extraction exact. Either read may fail alone;
 * the draft is assembled from whatever came back.
 *
 * @param {{ url: string, fetcher: typeof fetch | null, timeoutMs: number, hub: Record<string, unknown> | null }} input
 * @returns {Promise<{ page: ParsedPage, markdown: string, title: string, finalUrl: string }>}
 * @throws {LinkImportError} neither read produced a page
 */
async function readPageSource(input) {
  const [hubSettled, fetchSettled] = await Promise.allSettled([
    readViaHub({ hub: input.hub, url: input.url }),
    readPageDocument(input),
  ])
  const hubPage = hubSettled.status === 'fulfilled' ? hubSettled.value : null
  const fetched = fetchSettled.status === 'fulfilled' ? fetchSettled.value : null

  if (fetched) {
    const page = parseHtmlDocument(fetched.html, input.url)
    return {
      page,
      markdown: hubPage?.pageContent ?? '',
      title: hubPage?.title || page.title,
      finalUrl: fetched.finalUrl,
    }
  }
  if (hubPage) {
    const page = pageFromMarkdown(hubPage)
    return { page, markdown: hubPage.pageContent, title: hubPage.title || page.title, finalUrl: input.url }
  }
  if (fetchSettled.status === 'rejected') throw fetchSettled.reason
  throw new LinkImportError('link-import-failed', 'the page could not be read')
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
 * Model fields land on top of the local extraction: what the model named wins,
 * what it left empty keeps the value the document itself gave. A strategy turns
 * the draft into a digital one.
 *
 * @param {ImportedProduct} fields
 * @param {{ mode?: string, model?: string | null, reason?: string | null, kind?: string, brand_strategy?: object | null, fields?: object | null }} analysis
 * @param {{ url: string, kind: 'physical' | 'digital' }} input
 * @returns {ImportedProduct & { kind: string, brand_strategy: object | null, analysis: { mode: string, model: string | null, reason: string | null } }}
 */
export function mergeAnalysisDraft(fields, analysis, input) {
  const out = { ...fields }
  const draft = analysis?.fields && typeof analysis.fields === 'object'
    ? /** @type {Record<string, unknown>} */ (analysis.fields)
    : null

  if (draft) {
    for (const key of ['name', 'selling_points', 'features', 'target_audience', 'brand', 'price', 'sku', 'promotion']) {
      const value = asText(draft[key])
      if (value) out[key] = value
    }
    const categories = Array.isArray(draft.categories) ? draft.categories.map(asText).filter(Boolean) : []
    if (categories.length > 0) out.categories = dedupe(categories).slice(0, CATEGORIES_MAX)
  }

  out.name = capText(out.name, NAME_MAX)
  out.selling_points = capText(out.selling_points, 400)
  out.features = capText(out.features, 1000)
  out.target_audience = capText(out.target_audience, 200)
  out.brand = capText(out.brand, NAME_MAX)
  out.sku = capText(out.sku, 64)
  out.promotion = capText(out.promotion, 200)
  out.link = input.url

  return {
    ...out,
    kind: analysis?.kind === 'digital' ? 'digital' : input.kind,
    brand_strategy: analysis?.brand_strategy ?? null,
    analysis: {
      mode: analysis?.mode ?? ANALYSIS_MODES.HEURISTIC,
      model: analysis?.model ?? null,
      reason: analysis?.reason ?? null,
    },
  }
}

/**
 * Import a product draft from one landing-page link.
 *
 * @param {{
 *   url: unknown,
 *   kind?: 'physical' | 'digital',
 *   model?: string,
 *   language?: string,
 *   hub?: { textComplete?: Function, pageFetch?: Function } | null,
 *   fetcher?: typeof fetch,
 *   timeoutMs?: number,
 * }} args
 * @returns {Promise<ImportedProduct & { kind: string, brand_strategy: object | null, analysis: object }>}
 * @throws {LinkImportError}
 */
export async function importProductFromUrl(args) {
  const url = normalizeImportUrl(args?.url)
  const requestedKind = args?.kind === 'digital' ? 'digital' : 'physical'
  const fetcher = args?.fetcher ?? (typeof fetch === 'function' ? fetch : null)
  const timeoutMs = Number.isFinite(args?.timeoutMs) ? Number(args.timeoutMs) : DEFAULT_TIMEOUT_MS
  const hub = normalizeHub(args?.hub)

  const source = await readPageSource({ url, fetcher, timeoutMs, hub })
  // A page that advertises no goods at all is a brand / software site, even when
  // the form was left on the physical default.
  const kind = isDigitalLandingPage({ kind: requestedKind, page: source.page }) ? 'digital' : 'physical'

  const fields = buildProductFields({ url, kind, page: source.page })
  const analysis = await analyzeLandingPage({
    hub,
    kind,
    url,
    page: source.page,
    markdown: source.markdown,
    title: source.title,
    model: args?.model,
    language: args?.language,
  })
  const draft = mergeAnalysisDraft(fields, analysis, { url, kind })
  if (!isUsableImport(draft)) {
    throw new LinkImportError('link-import-empty', 'no product information was found on the page')
  }
  return draft
}
