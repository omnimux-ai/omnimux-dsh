/**
 * Brand-strategy helpers. Pure: no node:* imports (safe for the client bundle).
 */
import { ProductsError } from './errors.js'

const TEXT_MAX = 4000
const ANGLES_MAX = 10
const LIST_MAX = 20
const SEGMENTS_MAX = 10
const COMPETITORS_MAX = 10

/**
 * Empty draft for the form only. Callers must NOT persist this object as-is
 * (`normalizeBrandStrategy` turns it into null).
 */
export function emptyBrandStrategy() {
  return {
    brand_basic_info: {
      company: { name: '', website: '', locale: 'auto' },
      product: { name: '', category: '' },
    },
    content_angles: [],
    tone_and_voice: { dos: [], donts: [] },
    identity_and_product: {
      core_identity: '',
      product_offering: [],
      unique_advantage: [],
      problems_solved: [],
      solutions: [],
    },
    mission_and_positioning: {
      mission: '',
      differentiation: [],
      ownable_space: { statement: '', category: '', is_not: [] },
    },
    market_and_competition: {
      customer_segments: [],
      competitors: [],
    },
  }
}

/**
 * @param {unknown} value
 */
export function isPlainStrategy(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Digital-goods copy/default-expand: kind AND a persisted strategy object.
 * The kind badge looks at `kind` only.
 * @param {unknown} product
 */
export function isDigitalProduct(product) {
  if (!product || typeof product !== 'object') return false
  return product.kind === 'digital' && isPlainStrategy(product.brand_strategy)
}

/**
 * @param {unknown} value
 */
function clipStr(value) {
  if (typeof value !== 'string') return ''
  return value.length > TEXT_MAX ? value.slice(0, TEXT_MAX) : value
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string[]}
 */
function clipStringList(value, max) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.length > TEXT_MAX ? item.slice(0, TEXT_MAX) : item
    if (!text.trim()) continue
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

/**
 * @param {unknown} value
 */
function asPlain(value) {
  return isPlainStrategy(value) ? value : null
}

function newAngleId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  const hex = uuid
    ? uuid.replace(/-/g, '').slice(0, 8)
    : Math.random().toString(16).slice(2, 10).padEnd(8, '0')
  return `ang_${hex}`
}

/**
 * @param {unknown} value
 */
function normalizePriority(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return n === 1 || n === 2 || n === 3 ? n : 3
}

/**
 * @param {unknown} value
 */
function clampPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

/**
 * @param {unknown} value
 */
function normalizeAngles(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const row of value) {
    const item = asPlain(row)
    if (!item) continue
    const title = clipStr(item.title)
    const description = clipStr(item.description)
    const target_audience = clipStr(item.target_audience)
    if (!title.trim() && !description.trim() && !target_audience.trim()) continue
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : newAngleId()
    out.push({
      id,
      title,
      description,
      target_audience,
      priority: normalizePriority(item.priority),
    })
    if (out.length >= ANGLES_MAX) break
  }
  return out
}

/**
 * @param {unknown} value
 */
function normalizeSegments(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const row of value) {
    const item = asPlain(row)
    if (!item) continue
    const name = clipStr(item.name)
    if (!name.trim()) continue
    out.push({ name, percentage: clampPercent(item.percentage) })
    if (out.length >= SEGMENTS_MAX) break
  }
  return out
}

/**
 * @param {unknown} value
 */
function normalizeCompetitors(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const row of value) {
    const item = asPlain(row)
    if (!item) continue
    const name = clipStr(item.name)
    const website = clipStr(item.website)
    if (!name.trim() && !website.trim()) continue
    out.push({ name, website })
    if (out.length >= COMPETITORS_MAX) break
  }
  return out
}

/**
 * @param {ReturnType<typeof emptyBrandStrategy>} strategy
 */
function isEmptyStrategy(strategy) {
  const company = strategy.brand_basic_info.company
  const product = strategy.brand_basic_info.product
  if (company.name.trim() || company.website.trim()) return false
  if (company.locale.trim() && company.locale !== 'auto') return false
  if (product.name.trim() || product.category.trim()) return false
  if (strategy.content_angles.length) return false
  if (strategy.tone_and_voice.dos.length || strategy.tone_and_voice.donts.length) return false
  const identity = strategy.identity_and_product
  if (identity.core_identity.trim()) return false
  if (identity.product_offering.length || identity.unique_advantage.length) return false
  if (identity.problems_solved.length || identity.solutions.length) return false
  const mission = strategy.mission_and_positioning
  if (mission.mission.trim() || mission.differentiation.length) return false
  const space = mission.ownable_space
  if (space.statement.trim() || space.category.trim() || space.is_not.length) return false
  const market = strategy.market_and_competition
  if (market.customer_segments.length || market.competitors.length) return false
  return true
}

/**
 * Namespaces models have been seen to wrap the report in, though the playbook
 * asks for the bare modules at the top level.
 */
const STRATEGY_WRAPPERS = ['brand_strategy', 'brand_report', 'strategy', 'data']

/** Modules that prove a node holds the report itself. */
const STRATEGY_ROOT_MARKERS = ['brand_basic_info', 'identity_and_product']

/** Unwrap is bounded: a report nested deeper than this is not this report. */
const UNWRAP_MAX_DEPTH = 3

/**
 * @param {unknown} node
 */
function isStrategyRoot(node) {
  const record = asPlain(node)
  if (!record) return false
  return STRATEGY_ROOT_MARKERS.some((key) => isPlainStrategy(record[key]))
}

/**
 * Child keys in the order worth descending: the known namespaces first, then
 * everything else (a model may key the report by the product name).
 * @param {Record<string, unknown>} record
 */
function unwrapOrder(record) {
  const keys = Object.keys(record)
  const known = STRATEGY_WRAPPERS.filter((key) => keys.includes(key))
  return [...known, ...keys.filter((key) => !STRATEGY_WRAPPERS.includes(key))]
}

/**
 * The report inside `node`, however many namespaces it was wrapped in, or null
 * when none surfaces within `depth`. Only plain maps are searched, so a report
 * is never read out of a list item.
 * @param {unknown} node
 * @param {number} depth
 * @returns {Record<string, unknown> | null}
 */
function findStrategyRoot(node, depth) {
  if (depth <= 0) return null
  const record = asPlain(node)
  if (!record) return null
  if (isStrategyRoot(record)) return record
  for (const key of unwrapOrder(record)) {
    const found = findStrategyRoot(record[key], depth - 1)
    if (found) return found
  }
  return null
}

/**
 * Peel the namespaces a report may arrive in. A wrapped report reads as an empty
 * strategy, which callers then report as a missing one. A payload that holds no
 * report anywhere within reach is returned as given, so callers keep seeing the
 * empty result they saw before.
 * @param {Record<string, unknown>} value
 * @returns {Record<string, unknown>}
 */
function unwrapStrategyNamespaces(value) {
  return findStrategyRoot(value, UNWRAP_MAX_DEPTH) ?? value
}

/**
 * Write-path normalizer. Hydrate must catch `brand-strategy-invalid` and fall to null.
 * @param {unknown} value
 * @returns {ReturnType<typeof emptyBrandStrategy> | null}
 */
export function normalizeBrandStrategy(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ProductsError('brand-strategy-invalid', 'brand_strategy must be an object or null')
  }

  const root = unwrapStrategyNamespaces(/** @type {Record<string, unknown>} */ (value))
  const basic = asPlain(root.brand_basic_info) ?? {}
  const companyIn = asPlain(basic.company) ?? {}
  const productIn = asPlain(basic.product) ?? {}
  const tone = asPlain(root.tone_and_voice) ?? {}
  const identityIn = asPlain(root.identity_and_product) ?? {}
  const missionIn = asPlain(root.mission_and_positioning) ?? {}
  const spaceIn = asPlain(missionIn.ownable_space) ?? {}
  const marketIn = asPlain(root.market_and_competition) ?? {}

  const localeRaw = clipStr(companyIn.locale).trim()
  const out = {
    brand_basic_info: {
      company: {
        name: clipStr(companyIn.name),
        website: clipStr(companyIn.website),
        locale: localeRaw || 'auto',
      },
      product: {
        name: clipStr(productIn.name),
        category: clipStr(productIn.category),
      },
    },
    content_angles: normalizeAngles(root.content_angles),
    tone_and_voice: {
      dos: clipStringList(tone.dos, LIST_MAX),
      donts: clipStringList(tone.donts, LIST_MAX),
    },
    identity_and_product: {
      core_identity: clipStr(identityIn.core_identity),
      product_offering: clipStringList(identityIn.product_offering, LIST_MAX),
      unique_advantage: clipStringList(identityIn.unique_advantage, LIST_MAX),
      problems_solved: clipStringList(identityIn.problems_solved, LIST_MAX),
      solutions: clipStringList(identityIn.solutions, LIST_MAX),
    },
    mission_and_positioning: {
      mission: clipStr(missionIn.mission),
      differentiation: clipStringList(missionIn.differentiation, LIST_MAX),
      ownable_space: {
        statement: clipStr(spaceIn.statement),
        category: clipStr(spaceIn.category),
        is_not: clipStringList(spaceIn.is_not, LIST_MAX),
      },
    },
    market_and_competition: {
      customer_segments: normalizeSegments(marketIn.customer_segments),
      competitors: normalizeCompetitors(marketIn.competitors),
    },
  }

  if (isEmptyStrategy(out)) return null
  return out
}
