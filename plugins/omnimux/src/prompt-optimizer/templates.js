import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TEMPLATES_PATH = fileURLToPath(new URL('../../assets/prompt-templates/devin.zh.json', import.meta.url))

/** Fallback template id declared by the asset's usage block. */
export const FALLBACK_TEMPLATE_ID = 'generic-optimize'

/** Criteria text for the fallback template (spec-locked, not derived). */
export const GENERIC_CRITERIA = '兜底 · 通用提示词优化 — 指令与以上任何开发场景模板都不匹配时选择此项'

let cache = null

/**
 * Load and cache the template asset bundle. Read once per process; a missing
 * or malformed asset throws synchronously so startup can degrade the feature.
 * @returns {{ templates: Array<{ id: string, category: string, title: string, summary: string, template: string }> }}
 */
function loadBundle() {
  if (!cache) {
    const raw = readFileSync(TEMPLATES_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.templates)) {
      throw new Error('prompt-templates asset is malformed: missing templates array')
    }
    cache = parsed
  }
  return cache
}

/**
 * @returns {Array<{ id: string, category: string, title: string, summary: string, template: string, placeholders?: string[] }>}
 */
export function listTemplates() {
  return loadBundle().templates
}

/**
 * @param {string} id
 * @returns {object | undefined}
 */
export function getTemplate(id) {
  return loadBundle().templates.find((t) => t.id === id)
}

/**
 * Build the Jev `criteria` map for the choice question: every template id to
 * its human-readable scenario description. The fallback keeps its locked
 * criteria text instead of the generic `${category} · ${title} — ${summary}`.
 * @returns {Record<string, string>}
 */
export function buildChoiceCriteria() {
  const criteria = {}
  for (const t of listTemplates()) {
    criteria[t.id] = t.id === FALLBACK_TEMPLATE_ID
      ? GENERIC_CRITERIA
      : `${t.category} · ${t.title} — ${t.summary}`
  }
  return criteria
}

/**
 * Mechanical backfill (spec decision "填充方式 A"): if the template carries a
 * `{input}` slot the whole placeholder is replaced; otherwise the first
 * `` `[…]` `` placeholder is replaced by the user's draft wrapped in backticks
 * and every other slot is left for the user to complete.
 * @param {{ template: string }} template
 * @param {string} input
 * @returns {string}
 */
export function fillTemplate(template, input) {
  const body = String(template?.template ?? '')
  if (body.includes('{input}')) {
    return body.replace('{input}', String(input))
  }
  return body.replace(/`\[[^\]\n]*\]`/, `\`${String(input)}\``)
}
