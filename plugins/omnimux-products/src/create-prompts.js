import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'prompts')

/**
 * DSH `renderPrompt` 对完整 `{{name}}`（name=/^[a-z][a-z0-9_]*$/）做严格插值，
 * 且**没有**字面量转义。Gxgen 原文的 fill-slot（language / pageContent / url …）
 * 会在装配时抛 `unknown prompt variable`。磁盘保留原文；注入前一律改成 «name»。
 * @param {string} text
 */
export function sanitizeDshPromptVars(text) {
  return String(text).replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, '«$1»')
}

/** @param {string} rel */
function loadPrompt(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

// 模块顶层缓存：host 启动时读一次，路径相对 import.meta.url（禁止开发机绝对路径）
// 注意：缓存保留磁盘原文；注入前由 build* 调 sanitizeDshPromptVars。
const BRAND_STRATEGY_V2 = loadPrompt('digital/brand-strategy.v2.txt')
const BRAND_STRATEGY_COT = loadPrompt('digital/brand-strategy.fallback-cot.txt')
const IMPORT_FROM_LINK_V9 = loadPrompt('physical/import-from-link.v9.txt')
const SEMANTIC_ENRICHMENT = loadPrompt('physical/semantic-enrichment.txt')
const JINA_CONTENT = loadPrompt('physical/jina-content.txt')
const TIKTOK_ENRICH = loadPrompt('physical/tiktok-enrich.txt')
const DETAIL_SYSTEM = loadPrompt('physical/detail-understanding.system.txt')
const DETAIL_USER = loadPrompt('physical/detail-understanding.user.txt')

export const CREATE_PROMPT_SECTIONS = Object.freeze([
  { name: 'products:create:digital', order: 71 },
  { name: 'products:create:physical', order: 72 },
])

/**
 * Fill the `{{name}}` slots of one playbook with real values. Unlike the system
 * prompt above (which must survive DSH's strict interpolation), a request-time
 * render substitutes the value outright; an unknown slot is left untouched so a
 * half-filled prompt is visible rather than silently blank.
 *
 * @param {string} text
 * @param {Record<string, string>} vars
 * @returns {string}
 */
export function renderPromptTemplate(text, vars) {
  return String(text).replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (whole, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  ))
}

/**
 * Brand-strategy v2 playbook, rendered for one digital landing page.
 *
 * @param {{ language?: string, pageContent?: string }} input
 * @returns {string}
 */
export function renderBrandStrategyV2Prompt(input = {}) {
  return renderPromptTemplate(BRAND_STRATEGY_V2, {
    language: input.language ?? '中文',
    pageContent: input.pageContent ?? '',
  })
}

/**
 * Gxgen import-from-link v9 playbook, rendered for one physical listing.
 *
 * The vendored v9 template declares a `{{url}}` slot and nothing else, so the
 * page body rides along the way brand-strategy v2 carries it — appended, not
 * slotted. The playbook asks the model to extract from the page content it was
 * given; a listing whose body never reached the prompt is unfillable.
 *
 * @param {{ url?: string, pageContent?: string, language?: string }} input
 * @returns {string}
 */
export function renderPhysicalImportV9Prompt(input = {}) {
  const rendered = renderPromptTemplate(IMPORT_FROM_LINK_V9, {
    url: input.url ?? '',
    language: input.language ?? '中文',
  })
  const body = String(input.pageContent ?? '').trim()
  return body
    ? `${rendered}\n\n---\n以下是已提供的商品页面正文/图文简介：\n${body}`
    : rendered
}

/** Digital create playbook：门控 + v2 主规程 + CoT 全文附录 */
export function buildDigitalCreatePromptText() {
  return sanitizeDshPromptVars([
    '# Products create · digital (kind=digital)',
    '',
    '## When to use',
    '- Only for digital goods / SaaS / apps / content brands where `products_create({ kind: "digital", ... })` applies.',
    '- Brand-strategy YAML decomposition, content_angles, identity_and_product, market_and_competition.',
    '- Do **not** apply physical e-commerce JSON schemas here. Do **not** treat price / SKU / promotion as required digital fields (those are physical-only ops fields).',
    '',
    '## Mutual exclusion',
    '- Mutually exclusive with `products:create:physical`. If the user is listing a physical SKU / shop link / TikTok Shop goods, use the physical playbook instead.',
    '- Never emit physical import JSON (sellingPoints / price / promotion ecommerce extraction) as the primary digital deliverable.',
    '',
    '## Primary procedure (brand-strategy v2)',
    BRAND_STRATEGY_V2.trimEnd(),
    '',
    '## Appendix: deep CoT (fallback)',
    '主 schema / 输出约束仍以 v2 为准；下面 CoT 全文仅用于深度推演，不得覆盖 v2 字段集。',
    '',
    BRAND_STRATEGY_COT.trimEnd(),
    '',
    '## Land in library',
    'Parse the YAML → `products_create({ kind: "digital", name, brand_strategy, link?, selling_points?, description? })`.',
    'Normalization still runs through the existing library (unknown brand_strategy keys may be dropped).',
  ].join('\n'))
}

/** Physical create playbook：门控 + import v9 + semantic + 三项增强 when-to-use */
export function buildPhysicalCreatePromptText() {
  return sanitizeDshPromptVars([
    '# Products create · physical (kind=physical)',
    '',
    '## When to use',
    '- Physical / tangible goods, store links, shop listings, or pasted product copy destined for `products_create({ kind: "physical", ... })`.',
    '- Prefer this playbook when the user pastes a product URL **and/or** page body, TikTok Shop raw fields, or detail-image understanding inputs.',
    '',
    '## Mutual exclusion',
    '- Mutually exclusive with `products:create:digital` by default: do **not** emit brand_strategy YAML for ordinary physical imports.',
    '- If the user explicitly asks for brand strategy on a physical brand site, switch to the digital playbook only after confirming kind=digital intent.',
    '',
    '## No fake fetch',
    '- If there is no page body yet, do **not** pretend you visited or scraped the URL.',
    '- If the user gave a product URL and there is no page body yet, call the hub tool `omnimux_page_fetch({ url })` and use its `pageContent` (and `title`). That tool is official-only on the OmniMux hub; this plugin never fetches HTTP itself.',
    '- If `omnimux_page_fetch` is missing or throws, ask the user to paste page content. Markers like «pageContent» / «url» are fill-slot instructions — do not invent filled content.',
    '',
    '## Primary: import-from-link v9',
    'Category guidance (overrides any enum placeholders inside templates): align free tags with the product-library `categories` field, total ≤5. Do not invent forced external taxonomies.',
    '',
    IMPORT_FROM_LINK_V9.trimEnd(),
    '',
    '## Step 2: semantic-enrichment',
    'When-to-use: after you already have collected source facts (from paste / fetch / import JSON) and need to normalize name / description / features / sellingPoints / targetAudience / category without inventing price or images.',
    'Treat «sourceFacts» / «categoryInstruction» / «language» as fill slots. Category instruction fallback: free tags aligned to library `categories`, total ≤5.',
    '',
    SEMANTIC_ENRICHMENT.trimEnd(),
    '',
    '## Enhancements (optional)',
    '',
    '### jina-content — when to use',
    'Use **only** when `pageContent` is already present (user paste or `omnimux_page_fetch`). Never invent a fetch here — fetching is the hub tool.',
    '',
    JINA_CONTENT.trimEnd(),
    '',
    '### tiktok-enrich — when to use',
    'Use **only** when TikTok Shop raw fields are already available (`rawName` / `rawDescription` / `rawCategory` / `price` / `soldCount` / `shopName`). Category: free tags aligned to library `categories`, total ≤5 (ignore «validCategories» enum if absent).',
    '',
    TIKTOK_ENRICH.trimEnd(),
    '',
    '### detail-understanding — when to use',
    'Use **only** when a contact-sheet / detail-image bundle plus detail text is already available. Requires vision / contact-sheet pipeline; do not fabricate visual evidence.',
    '',
    '#### system template',
    DETAIL_SYSTEM.trimEnd(),
    '',
    '#### user template',
    DETAIL_USER.trimEnd(),
    '',
    '## Land in library',
    'Map extracted fields → `products_create({ kind: "physical", name, selling_points / sellingPoints, description, brand, price?, sku?, promotion?, categories?, link?, media? })`.',
    'Prefer `selling_points` on the wire tool; accept comma-joined sellingPoints from JSON drafts when filling the tool args.',
  ].join('\n'))
}

/**
 * @param {{ section: (spec: { name: string, order: number, text: string }) => unknown }} systemPrompt
 */
export function registerDigitalCreatePromptSection(systemPrompt) {
  if (!systemPrompt || typeof systemPrompt.section !== 'function') return
  systemPrompt.section({
    name: 'products:create:digital',
    order: 71,
    text: buildDigitalCreatePromptText(),
  })
}

/**
 * @param {{ section: (spec: { name: string, order: number, text: string }) => unknown }} systemPrompt
 */
export function registerPhysicalCreatePromptSection(systemPrompt) {
  if (!systemPrompt || typeof systemPrompt.section !== 'function') return
  systemPrompt.section({
    name: 'products:create:physical',
    order: 72,
    text: buildPhysicalCreatePromptText(),
  })
}

/**
 * 注册 create sections（71/72）。由 index.js 再用 ctx.effect 分 label 包一层。
 * @param {{ section: (spec: { name: string, order: number, text: string }) => unknown }} systemPrompt
 */
export function registerCreatePromptSections(systemPrompt) {
  registerDigitalCreatePromptSection(systemPrompt)
  registerPhysicalCreatePromptSection(systemPrompt)
}
