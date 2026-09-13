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
 * Copy that reads like a software / brand site rather than a shop listing. Each
 * entry is one marker; a page needs at least two of them, so one stray marketing
 * word can never move a shop page onto the brand playbook.
 */
const SOFTWARE_COPY = [
  /\bsaas\b/i,
  /\bapi\b/i,
  /\bsubscription\b/i,
  /\bfree trial\b/i,
  /\bbook a demo\b/i,
  /\brequest a demo\b/i,
  /\bdeveloper(s)? (?:docs|platform)\b/i,
  /\bworkspace\b/i,
  /订阅/,
  /免费试用/,
  /预约演示/,
  /申请试用/,
  /开发者文档/,
  /解决方案/,
  /企业版/,
  /开放平台/,
]

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
    for (const value of meta[key] ?? []) parts.push(value)
  }
  parts.push(page?.text ?? '')
  return parts.filter(Boolean).join('\n')
}

/**
 * Which playbook does this page belong to?
 *
 * An explicit `kind` wins. Otherwise structured data decides first (a page that
 * declares a schema.org Product is a listing), and only a page with no commerce
 * vocabulary is read as a software / brand site — and then only on real evidence
 * (a software schema type, or at least two software-copy markers).
 *
 * @param {{ kind?: 'physical' | 'digital', page?: object | null }} input
 * @returns {boolean}
 */
export function isDigitalLandingPage(input) {
  const kind = input?.kind
  if (kind === 'digital') return true
  const page = input?.page ?? null
  const types = jsonLdTypes(page)
  if (types.some((type) => COMMERCE_TYPES.has(type))) return false
  if (types.some((type) => DIGITAL_TYPES.has(type))) return true
  const copy = pageCopy(page)
  if (!copy) return false
  const hits = SOFTWARE_COPY.filter((pattern) => pattern.test(copy)).length
  return hits >= 2
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
  const digital = isDigitalLandingPage({ kind: input?.kind, page: input?.page })
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
