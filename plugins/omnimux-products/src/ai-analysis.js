/**
 * Landing-page intelligence for the link importer.
 *
 * Two playbooks, one seam. A digital landing page (a product/company site, a
 * SaaS page) is read with the brand-strategy v2 report and answers a full
 * `brand_strategy` object; a physical listing is read with the Gxgen
 * import-from-link v9 playbook and answers the e-commerce field set.
 *
 * The model call goes through the hub seam (`ctx.get('textComplete')` or the
 * `omnimux_text_complete` tool) — this vertical ships no provider client and
 * reads no credential. Every failure here is reported as a degraded answer, not
 * an exception: the caller keeps whatever it extracted itself and the request
 * never turns into a 500.
 */
import { normalizeBrandStrategy } from './brand-strategy.js'
import { renderBrandStrategyV2Prompt, renderPhysicalImportV9Prompt } from './create-prompts.js'
import { fencedBlocks, parseYamlMini } from './yaml-mini.js'

/** Default model for both playbooks. */
export const DEFAULT_TEXT_MODEL = 'gemini-3.8-flash'

export const ANALYSIS_MODES = Object.freeze({
  MODEL: 'model',
  HEURISTIC: 'heuristic',
})

const MAX_MODEL_CHARS = 24000
const MAX_TOKENS_DIGITAL = 6000
const MAX_TOKENS_PHYSICAL = 2000
const CATEGORIES_MAX = 5

/** Software markers a page must carry to go digital without unambiguous evidence. */
const SOFTWARE_MARKER_MIN = 2

/**
 * Product markers (trial hooks excluded) that outrank one price or size. It
 * reads the same list as `SOFTWARE_MARKER_MIN` and has to hold the same value:
 * at two different values, adding a price to a page would flip a verdict that
 * the marker rule had already settled.
 */
const PRODUCT_MARKER_MIN = SOFTWARE_MARKER_MIN

/** Price / size signals that have to appear together to read as a listing. */
const COMMERCE_PRICE_MIN = 2

/** schema.org types that only a software / service site declares. */
const DIGITAL_TYPES = new Set([
  'softwareapplication',
  'webapplication',
  'mobileapplication',
  'webservice',
  'api',
  'saas',
])

/** Any of these means the page is describing goods for sale. */
const COMMERCE_TYPES = new Set([
  'product',
  'individualproduct',
  'productgroup',
  'offer',
  'aggregateoffer',
])

/**
 * Software / service copy that a shop page does not write.
 *
 * Every entry has to be vocabulary only a software or platform product uses.
 * The short words are deliberately absent — `ai`, `cloud`, `bot`, `docs`,
 * `platform` and their Chinese twins (`智能体`, `云服务`): a shop footer or a
 * marketplace navigation bar carries them, and one of those in a navigation bar
 * was enough to route a whole Amazon result page onto the brand playbook.
 */
const SOFTWARE_MARKERS = [
  /\bsaas\b/i,
  /\bapi\b/i,
  /\bsdk\b/i,
  /\bworkflow(s)?\b/i,
  /控制台/,
  /按量计费/,
  /工作流/,
]

/**
 * Marketing hooks a shop writes over a price just as readily (`免费试用 30 天`
 * on a listing). They count as software evidence for a page that quotes no
 * price, and never for one that does.
 */
const SOFTWARE_TRIAL_MARKERS = [
  /免费试用/,
  /申请试用/,
  /预约演示/,
  /\bfree trial\b/i,
  /\bbook a demo\b/i,
  /\brequest a demo\b/i,
]

/**
 * The markers above that cannot be read two ways: a developer address and its
 * counterparts in Chinese, the API handbook, a developer portal, and a hosted
 * product's addressable endpoint (`mcp`). One of these settles a page that
 * showed no commerce signal, the way a developer host does — a docs-only
 * landing page is a software site even though `docs` alone means nothing.
 *
 * `api`, `sdk` and `saas` deliberately stay out: they are product nouns a shop
 * advertises too (`OpenAPI` on a listing, `SDK` in a bundle), so they count
 * toward the marker rule instead of deciding on their own.
 */
const SOFTWARE_STRONG_MARKERS = [
  /\bdocumentation\b/i,
  /\bdevelopers?\b/i,
  /\bmcp\b/i,
  /开发者文档/,
  /开发者中心/,
  /开发者平台/,
  /开放平台/,
  /API文档/i,
]

/**
 * Shopping controls. One hit settles the page as a listing: nothing but a shop
 * writes a cart control, a stock badge, a seller credit or a buyer review, so
 * these do not wait for a second signal.
 *
 * The cart control is written in the language of the storefront, so the common
 * ones are all here; an unknown locale still reaches the price rule.
 */
const COMMERCE_CONTROLS = [
  /\badd to (?:cart|bag|basket|trolley)\b/i,
  /\bbuy (?:it )?now\b/i,
  /\bin den warenkorb\b/i,
  /\bajouter au panier\b/i,
  /\ba(?:ñ|n)adir al carrito\b/i,
  /\baggiungi al carrello\b/i,
  /\btoevoegen aan winkelwagen\b/i,
  /カートに入れる/,
  /장바구니(?:에)? (?:담기|넣기)/,
  /в корзину/,
  /sepete ekle/i,
  /立即购买/,
  /加入购物车/,
  /马上抢/,
  /\bin stock\b/i,
  /\bsold by\b/i,
  /\bcustomer reviews?\b/i,
  /\bsign in to see price\b/i,
  /\bfree shipping\b/i,
  /包邮/,
]

/**
 * Shopping evidence a software page writes too: a price, or the size a physical
 * product is named by. Both are weak signals, so `hasCommerceEvidence` only
 * lets them decide together — and never when the page carried an unambiguous
 * developer marker of its own.
 *
 * The currency is written in many ways — `$10.99`, `10,00 €`, `CHF 99.00` —
 * so both placements are matched, and each pattern captures the whole amount:
 * `$10.99` and `$19.99` are two prices, not one that shares a leading digit.
 */
const COMMERCE_PRICES = [
  /[¥￥]\s?\d[\d,.]*/g,
  /[$€£₺]\s?\d[\d,.]*/g,
  /\d[\d,.]*\s?(?:人民币|美元|欧元|日元|韩元|卢布|里拉|元|円|€|£|₺|\$)/g,
  /\d[\d,.]*\s?(?:USD|EUR|GBP|CHF|CNY|RMB|JPY|KRW|TRY|TL|RUB|AUD|CAD|NZD|SEK|HKD|SGD)\b/g,
  /\b(?:USD|EUR|GBP|CHF|CNY|RMB|JPY|KRW|TRY|TL|RUB|AUD|CAD|NZD|SEK|HKD|SGD)\s?\d[\d,.]*/g,
  /(?:^|[^\w.])\d+(?:[.,]\d+)?\s?(?:毫升|公升|升|公斤|千克|克|厘米|毫米|英寸|平方米|寸|斤)/g,
  /(?:^|[^\w.])\d+(?:[.,]\d+)?\s?(?:ml|cl|dl|mm|cm|km|kg|oz|lb|lbs|inch|inches|in)\.?(?![\w%])/gi,
  /(?:^|[^\w.])\d+(?:[.,]\d+)?\s(?:g|lb)\.?(?![\w%])/gi,
]

/**
 * The shapes above are also ordinary prose, and the copy is not edited to hide
 * that — each candidate is judged in its own context instead, so real evidence
 * such as `6 in the box` survives while `1 in 3 users` does not.
 *
 * A unit followed by a word is a sentence rather than a measurement; `元` is a
 * currency unit and the first character of 元旦, 元宵 and 元数据; and a unit
 * behind `#`, `No.` or `第` is a rank (`Ranked #1 in G2`). Bare currency codes
 * (`CAD`, `TL`, `TRY`) are not read at all: in English prose they are words.
 */
const COMMERCE_NOISE = [
  // `1 in 3 users` is a ratio and `1 in the box` names no size; `5 in the box`
  // and `12 in a case` are a pack size, so the noun decides, not the unit.
  /^\d+(?:[.,]\d+)?\s?in\s(?:\d|the)\b/i,
  /^\d+\s?(?:the|a|an|this|that|our|its|per)\b/i,
  /^(?:of|no\.?|#)\s?\d/i,
]

/** The characters that make `元` the first character of a word instead of a currency unit. */
const YUAN_WORDS = /[旦宵月日数素组器件表类格式字码]/

/**
 * Is this candidate real evidence, or a piece of prose that happens to look
 * like a price or a size?
 *
 * @param {string} candidate The matched text.
 * @param {string} before The character that precedes it, when there is one.
 * @param {string} after The character that follows it, when there is one.
 * @returns {boolean}
 */
function isShoppingUnit(candidate, before, after) {
  if (COMMERCE_NOISE.some((pattern) => pattern.test(candidate))) return false
  // A rank reads `#1 in G2`, `No. 3 in the list`, `第 1 名`.
  if (/[#第]$/.test(before)) return false
  if (/\bNo\.$/i.test(before)) return false
  // …and `元` opens 元旦, 元宵 and 元数据 as often as it names a yuan.
  if (/元$/.test(candidate) && YUAN_WORDS.test(after)) return false
  return true
}

/**
 * The hostname of a URL, with or without a scheme. A caller can hand the
 * classifier the raw text a user typed (`www.OmniMux.ai`).
 *
 * A host has to carry a dot and a letter — without that check `new URL` reads
 * any first word (`not a url` → `not`) as a host — and a trailing root dot
 * (`omnimux.ai.`) is dropped, the way the importer's own host normaliser does.
 *
 * @param {string} value
 * @returns {string}
 */
function hostnameOf(value) {
  const raw = text(value)
  if (!raw) return ''
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      const hostname = new URL(candidate).hostname.toLowerCase().replace(/\.+$/, '')
      if (/^[a-z0-9.-]*[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(hostname)) return hostname
    } catch {
      // Not this shape — try the next candidate.
    }
  }
  return ''
}

/**
 * Hosts that name a shop. A `.ai` TLD is the weakest evidence the host rule
 * has — an AI-era storefront registers one too — so a host whose name says
 * `shop.`, `store.`, `cart.`, `checkout.` or `ecommerce` takes it back. It does
 * not touch a developer subdomain: `docs.` and `console.` stay documentation
 * whatever the TLD.
 */
const COMMERCE_HOSTS = /(?:^|\.)(?:shop|store|storefront|cart|checkout|buy|ecommerce|e-commerce)\.|ecommerce/

/**
 * Hosts only a software / service product uses: a `.ai` domain, or the docs /
 * api / console / developer subdomain a product site puts in front of its
 * documentation. `app.`, `portal.`, `dashboard.` and `platform.` are shop hosts
 * as often as software hosts, so they no longer decide.
 *
 * The host is evidence, never a verdict: `isDigitalLandingPage` only reaches it
 * once the page showed no commerce signal at all.
 *
 * @param {string} value
 * @returns {boolean}
 */
function digitalHost(value) {
  const hostname = hostnameOf(value)
  if (!hostname) return false
  if (/(?:^|\.)(?:docs|api|console|developer|developers)\./.test(hostname)) return true
  return /\.ai$/.test(hostname) && !COMMERCE_HOSTS.test(hostname)
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
export function normalizeHub(value) {
  if (!value || typeof value !== 'object') return null
  const hub = /** @type {{ textComplete?: unknown, pageFetch?: unknown }} */ (value)
  const out = {}
  if (typeof hub.textComplete === 'function') out.textComplete = hub.textComplete
  if (typeof hub.pageFetch === 'function') out.pageFetch = hub.pageFetch
  return Object.keys(out).length > 0 ? out : null
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function textList(value) {
  if (!Array.isArray(value)) return ''
  return value.map((row) => text(row)).filter((row) => row !== '').join('，')
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function priceText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const raw = text(value)
  if (!raw) return ''
  const digits = raw.replace(/[^\d.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '.')
  const parsed = Number.parseFloat(digits)
  if (!Number.isFinite(parsed) || parsed <= 0) return ''
  return Number.isInteger(parsed) ? String(parsed) : String(Number(parsed.toFixed(2)))
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function categoryList(value) {
  const rows = []
  const push = (raw) => {
    const value = text(raw)
    if (!value) return
    for (const part of value.split(/[,，、;；|/·>\n]+/)) {
      const row = part.trim()
      if (row.length >= 2 && row.length <= 24) rows.push(row)
    }
  }
  if (Array.isArray(value)) value.forEach(push)
  else push(value)

  const seen = new Set()
  const out = []
  for (const row of rows) {
    const key = row.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
    if (out.length >= CATEGORIES_MAX) break
  }
  return out
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function jsonLdTypes(page) {
  const nodes = Array.isArray(page?.nodes) ? page.nodes : []
  const out = []
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const raw = /** @type {Record<string, unknown>} */ (node)['@type']
    if (typeof raw === 'string') out.push(raw.toLowerCase())
    else if (Array.isArray(raw)) out.push(...raw.filter((row) => typeof row === 'string').map((row) => row.toLowerCase()))
  }
  return out
}

/**
 * @param {import('./link-importer.js').ParsedPage | null} page
 * @returns {string}
 */
function pageCopy(page) {
  const meta = page?.meta ?? {}
  const parts = [page?.title ?? '']
  for (const key of ['description', 'og:description', 'twitter:description']) {
    const value = meta[key] ?? []
    // The parser always hands over an array; a direct caller may not.
    if (Array.isArray(value)) for (const row of value) parts.push(row)
    else parts.push(value)
  }
  parts.push(page?.text ?? '')
  return parts.filter((part) => typeof part === 'string' && part !== '').join('\n')
}

/**
 * The distinct prices and sizes the copy names.
 *
 * Duplicates are dropped: the same `$10/month` in the title and in the meta
 * description is one price, not two, while a result grid naming `$10.99` and
 * `$19.99` names two. Prose that happens to look like a unit (`1 in 3 users`,
 * `Ranked #1 in G2`, `2025 元旦`) is rejected in its own context rather than
 * deleted from the copy.
 *
 * @param {string} copy
 * @returns {string[]}
 */
function shoppingUnits(copy) {
  const units = new Set()
  for (const pattern of COMMERCE_PRICES) {
    for (const match of copy.matchAll(pattern)) {
      // A size rail starts with the character before the number to keep `x1in`
      // out, so the candidate is trimmed before it is judged.
      const candidate = match[0].trim()
      if (!candidate) continue
      const before = copy[match.index - 1] ?? ''
      const after = copy[match.index + match[0].length] ?? ''
      if (!isShoppingUnit(candidate, before, after)) continue
      units.add(candidate.replace(/\s+/g, '').toLowerCase())
    }
  }
  return [...units]
}

/**
 * Page copy that names goods for sale. Structured data is the strongest form of
 * this evidence, but a marketplace result page often ships none at all, so the
 * wording is read as well. Anything here outranks every software signal.
 *
 * A cart control, a stock badge, a seller credit or a buyer review decides on
 * its own. A price or a size is weak evidence on its own — a SaaS page
 * advertises `Starting at $10 per month` — so it decides when the copy names
 * two of them, or one of them and the page carries no software evidence of its
 * own: a shop page writes no `documentation` or `开发者文档`, and a SaaS pricing
 * page does.
 *
 * @param {import('./link-importer.js').ParsedPage | null} page
 * @param {{ strong: boolean, hits: number, productHits: number }} software
 * @returns {boolean}
 */
function hasCommerceEvidence(page, software) {
  const copy = pageCopy(page)
  if (!copy) return false
  if (COMMERCE_CONTROLS.some((pattern) => pattern.test(copy))) return true
  const units = shoppingUnits(copy)
  if (units.length >= COMMERCE_PRICE_MIN) return true
  if (units.length === 0) return false
  // One price or size against a page that names its own product: the listing
  // wins, because vague platform words are what a shop footer is full of. Two
  // product markers — the same number the marker rule uses — or one unambiguous
  // developer marker make it a software page quoting a price. A trial hook never
  // does, because a shop advertises one over a price too.
  if (software.strong) return false
  return software.productHits < PRODUCT_MARKER_MIN
}

/**
 * The software / developer evidence in the copy: the unambiguous markers that
 * settle the page on their own, and how many markers of any kind it carries.
 *
 * @param {import('./link-importer.js').ParsedPage | null} page
 * @returns {{ strong: boolean, hits: number }}
 */
function softwareEvidence(page) {
  const copy = pageCopy(page)
  if (!copy) return { strong: false, hits: 0 }
  const markers = [...SOFTWARE_MARKERS, ...SOFTWARE_TRIAL_MARKERS]
  return {
    strong: SOFTWARE_STRONG_MARKERS.some((pattern) => pattern.test(copy)),
    hits: markers.filter((pattern) => pattern.test(copy)).length,
    // The subset a price cannot outrank: product nouns, not trial hooks.
    productHits: SOFTWARE_MARKERS.filter((pattern) => pattern.test(copy)).length,
  }
}

/**
 * Which playbook does this page belong to?
 *
 * An explicit `kind: 'digital'` wins outright — the user said so.
 *
 * E-commerce outranks everything the page itself can claim. A schema.org
 * Product / Offer type, a single shopping control (a cart button, a stock
 * badge, a seller credit, buyer reviews), or two price / size signals settle
 * the page as a listing whatever host it sits on: a `.ai` domain, `api.` /
 * `console.` subdomain, an AI-heavy title and ten software markers cannot move
 * a shop page onto the brand playbook.
 *
 * Only a page with no commerce evidence at all is read as a software / brand
 * site, and then only on real evidence: a software schema type, a developer
 * host (`*.ai`, `docs.`, `api.`, `console.`, `developer.`), one unambiguous
 * developer marker (a developer address, portal, console or API handbook), or
 * two software markers of any kind.
 *
 * A defaulted `kind: 'physical'` never vetoes that evidence. The form ships the
 * switch on physical, so for a page that advertises no goods the page decides,
 * not the default: that is what routes a SaaS / brand site to the brand
 * playbook without the user touching the switch first.
 *
 * @param {{ kind?: 'physical' | 'digital', page?: object | null, url?: string }} input
 * @returns {boolean}
 */
export function isDigitalLandingPage(input) {
  const kind = input?.kind
  if (kind === 'digital') return true
  const page = input?.page ?? null
  const types = jsonLdTypes(page)
  if (types.some((type) => COMMERCE_TYPES.has(type))) return false
  const software = softwareEvidence(page)
  if (hasCommerceEvidence(page, software)) return false
  if (types.some((type) => DIGITAL_TYPES.has(type))) return true
  // A URL the caller passed that names no host (`not a url`) leaves the page's
  // own canonical as the only host evidence there is.
  const url = text(input?.url)
  if (digitalHost(hostnameOf(url) ? url : text(page?.canonical))) return true
  if (software.strong) return true
  return software.hits >= SOFTWARE_MARKER_MIN
}

/**
 * The text handed to the model: heading, summary, then the cleanest body copy
 * available (hub Markdown when the hub read the page, extracted text otherwise).
 *
 * @param {{ title?: unknown, markdown?: unknown, page?: object | null }} input
 * @returns {string}
 */
export function composePageContent(input) {
  const page = input?.page ?? null
  const meta = page?.meta ?? {}
  const heading = text(input?.title) || text(page?.title)
  const summary = text(meta['og:description']?.[0]) || text(meta.description?.[0])
  const body = text(input?.markdown) || text(page?.text)
  const blocks = []
  if (heading) blocks.push(`# ${heading}`)
  if (summary && summary !== heading) blocks.push(summary)
  if (body) blocks.push(body)
  const merged = blocks.join('\n\n')
  return merged.length > MAX_MODEL_CHARS ? merged.slice(0, MAX_MODEL_CHARS) : merged
}

/**
 * The text body of one hub completion answer, whichever shape it arrives in.
 *
 * @param {unknown} result
 * @returns {string}
 */
export function extractModelText(result) {
  if (typeof result === 'string') return result.trim()
  if (!result || typeof result !== 'object') return ''
  const row = /** @type {Record<string, unknown>} */ (result)
  for (const key of ['text', 'content', 'output', 'markdown', 'answer', 'message', 'pageContent']) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const choices = row.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0]
    if (first && typeof first === 'object') {
      const message = /** @type {Record<string, unknown>} */ (first).message
      if (message && typeof message === 'object') {
        const content = /** @type {Record<string, unknown>} */ (message).content
        if (typeof content === 'string' && content.trim()) return content.trim()
      }
    }
  }
  return ''
}

/**
 * Parse whatever the answer wrapped its report in: a fenced block, bare JSON, or
 * bare YAML.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
export function extractStructuredPayload(value) {
  const source = String(value ?? '').trim()
  if (!source) return null
  const blocks = fencedBlocks(source)
  const candidates = [
    ...blocks.filter((block) => block.lang === 'yaml' || block.lang === 'yml').map((block) => block.body),
    ...blocks.filter((block) => block.lang === 'json').map((block) => block.body),
    ...blocks.map((block) => block.body),
    source,
  ]
  for (const candidate of candidates) {
    const parsed = parsePayload(candidate)
    if (parsed) return parsed
  }
  return null
}

/**
 * @param {string} candidate
 * @returns {Record<string, unknown> | null}
 */
function parsePayload(candidate) {
  const body = String(candidate ?? '').trim()
  if (!body) return null
  try {
    const json = JSON.parse(body)
    if (json && typeof json === 'object' && !Array.isArray(json)) return /** @type {Record<string, unknown>} */ (json)
  } catch {
    // Not JSON — the playbook asks for YAML.
  }
  try {
    const yaml = parseYamlMini(body)
    if (yaml && typeof yaml === 'object' && !Array.isArray(yaml)) return /** @type {Record<string, unknown>} */ (yaml)
  } catch {
    return null
  }
  return null
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return /** @type {Record<string, unknown>} */ (value)
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>[]}
 */
function plainList(value) {
  if (!Array.isArray(value)) return []
  return value.map((row) => plain(row)).filter((row) => Object.keys(row).length > 0)
}

/**
 * Turn a persisted-shaped brand strategy into the flat draft fields the form
 * shows next to the strategy panel.
 *
 * @param {ReturnType<typeof normalizeBrandStrategy>} strategy
 * @returns {{ name: string, selling_points: string, features: string, target_audience: string, brand: string, categories: string[] }}
 */
export function mapBrandStrategyToDraft(strategy) {
  const basic = plain(strategy?.brand_basic_info)
  const company = plain(basic.company)
  const product = plain(basic.product)
  const identity = plain(strategy?.identity_and_product)
  const market = plain(strategy?.market_and_competition)
  const angles = plainList(strategy?.content_angles)
  const segments = plainList(market.customer_segments)

  const selling = [text(identity.core_identity), textList(identity.unique_advantage)]
    .filter((row) => row !== '')
    .join('，')
  const features = [textList(identity.product_offering), textList(identity.solutions)]
    .filter((row) => row !== '')
    .join('，')
  const audience = textList(segments.map((row) => row.name))
    || textList(angles.map((row) => row.target_audience))

  return {
    name: text(product.name) || text(company.name),
    selling_points: selling,
    features,
    target_audience: audience,
    brand: text(company.name),
    categories: categoryList(product.category),
  }
}

/**
 * Map the v9 JSON answer onto the draft fields.
 *
 * @param {Record<string, unknown>} payload
 * @returns {{ name: string, selling_points: string, features: string, target_audience: string, brand: string, price: string, sku: string, promotion: string, categories: string[] }}
 */
export function mapPhysicalPayloadToDraft(payload) {
  const body = plain(payload)
  const features = text(body.features)
  const description = text(body.description)
  return {
    name: text(body.name),
    selling_points: text(body.selling_points) || text(body.sellingPoints),
    // The playbook asks for a description the form has no field for; it becomes
    // the feature copy only when the answer carried no features of its own.
    features: features || description,
    target_audience: text(body.target_audience) || text(body.targetAudience),
    brand: text(body.brand),
    price: priceText(body.price ?? plain(body.offers).price),
    sku: text(body.sku),
    promotion: text(body.promotion),
    categories: categoryList(body.categories ?? body.category),
  }
}

/**
 * @param {string} message
 * @param {'digital' | 'physical'} kind
 * @returns {{ mode: string, model: null, reason: string, kind: string, brand_strategy: null, fields: null }}
 */
function degraded(message, kind) {
  return {
    mode: ANALYSIS_MODES.HEURISTIC,
    model: null,
    reason: message,
    kind,
    brand_strategy: null,
    fields: null,
  }
}

/**
 * Read one landing page with the model, through the hub seam.
 *
 * Never throws: an unavailable seam, a model failure or an unreadable answer all
 * come back as a degraded result carrying the reason.
 *
 * @param {{
 *   hub?: Record<string, unknown> | null,
 *   kind?: 'digital' | 'physical',
 *   url?: string,
 *   page?: object | null,
 *   markdown?: string,
 *   title?: string,
 *   model?: string,
 *   language?: string,
 *   reason?: string,
 * }} input
 * @returns {Promise<{ mode: string, model: string | null, reason: string | null, kind: 'digital' | 'physical', brand_strategy: object | null, fields: object | null }>}
 */
export async function analyzeLandingPage(input) {
  const hub = normalizeHub(input?.hub)
  const digital = isDigitalLandingPage({ kind: input?.kind, page: input?.page, url: input?.url })
  const kind = digital ? 'digital' : 'physical'
  if (!hub || typeof hub.textComplete !== 'function') {
    return degraded('宿主未提供大模型通道（omnimux 未装载或未配置密钥）', kind)
  }
  const pageContent = composePageContent({
    title: input?.title,
    markdown: input?.markdown,
    page: input?.page,
  })
  if (!pageContent) return degraded('页面正文为空，未提交给模型', kind)

  const model = text(input?.model) || DEFAULT_TEXT_MODEL
  const prompt = digital
    ? renderBrandStrategyV2Prompt({ language: text(input?.language) || '中文', pageContent })
    : renderPhysicalImportV9Prompt({ url: text(input?.url), pageContent })

  try {
    const answer = await hub.textComplete({
      model,
      prompt,
      maxTokens: digital ? MAX_TOKENS_DIGITAL : MAX_TOKENS_PHYSICAL,
      reason: text(input?.reason) || 'omnimux-products import-from-link analysis',
    })
    const answerText = extractModelText(answer)
    if (!answerText) return degraded('模型未返回可用内容', kind)
    const payload = extractStructuredPayload(answerText)
    if (!payload) return degraded('模型回答未包含可解析的结构化报告', kind)

    if (!digital) {
      const fields = mapPhysicalPayloadToDraft(payload)
      if (!fields.name && !fields.selling_points && !fields.features) {
        return degraded('模型回答未包含商品字段', kind)
      }
      return { mode: ANALYSIS_MODES.MODEL, model, reason: null, kind, brand_strategy: null, fields }
    }

    let strategy = null
    try {
      strategy = normalizeBrandStrategy(payload)
    } catch (error) {
      return degraded(`品牌拆解报告无法规范化：${messageOf(error)}`, kind)
    }
    if (!strategy) return degraded('品牌拆解报告为空，未产生可用战略模块', kind)
    return {
      mode: ANALYSIS_MODES.MODEL,
      model,
      reason: null,
      kind,
      brand_strategy: strategy,
      fields: mapBrandStrategyToDraft(strategy),
    }
  } catch (error) {
    return degraded(`大模型调用失败：${messageOf(error)}`, kind)
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error ?? 'unknown error')
}
