/**
 * @file plugins/omnimux-video-preview/src/breakdown/tagNormalizer.js
 * Video shot camera tags & narrative stage canonicalization engine.
 */

import {
  METADATA_HEADING_REGEX,
  STAGE_I18N,
  CANONICAL_STAGE_KEYS,
  CAMERA_SCALE_RULES,
  CAMERA_DEVICE_RULES,
  CAMERA_ANGLE_RULES,
  CAMERA_MOTION_RULES,
} from './constants.js'

/**
 * Match a text string against a list of pattern-value rules.
 * @param {string} text
 * @param {ReadonlyArray<{ pattern: RegExp, value: string }>} rules
 * @param {string} defaultValue
 * @returns {string}
 */
function matchRuleValue(text, rules, defaultValue) {
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return rule.value
    }
  }
  return defaultValue
}

/**
 * Canonicalizes any raw camera tag string or array into 4 orthogonal dimensions:
 * [Scale (景别), Device (机位设备), Angle (拍摄视角), Motion (运镜方式)]
 *
 * @param {string|Array<string>} rawTags
 * @param {string} [contextText='']
 * @returns {Array<string>} [scale, device, angle, motion]
 */
export function canonicalizeCameraTags(rawTags, contextText = '') {
  const tokens = (Array.isArray(rawTags) ? rawTags : [rawTags])
    .filter(Boolean)
    .flatMap((item) => String(item).split(/[,，|、/／;；\s]+/))
    .map((t) => t.trim())
    .filter(Boolean)

  const combined = `${tokens.join(' ')} ${contextText || ''}`
  const scale = matchRuleValue(combined, CAMERA_SCALE_RULES, '中景')
  const device = matchRuleValue(combined, CAMERA_DEVICE_RULES, '智能手机手持')
  const angle = matchRuleValue(combined, CAMERA_ANGLE_RULES, '平视')

  let motion = matchRuleValue(combined, CAMERA_MOTION_RULES, '')
  if (!motion) {
    motion = /固定/i.test(combined) && device === '固定机位' ? '固定镜头' : '手持微动'
  }

  return [scale, device, angle, motion]
}

/**
 * Find localized label from exact or case-insensitive matching.
 * @param {string} s
 * @param {boolean} isZh
 * @returns {string|null}
 */
function findDirectOrFuzzyI18n(s, isZh) {
  const found = STAGE_I18N[s]
  if (found) return isZh ? found.zh : found.en

  const lower = s.toLowerCase()
  for (const [enKey, item] of Object.entries(STAGE_I18N)) {
    if (enKey.toLowerCase() === lower) {
      return isZh ? item.zh : item.en
    }
  }
  return null
}

/**
 * Find localized label by substring matching.
 * @param {string} s
 * @param {boolean} isZh
 * @returns {string|null}
 */
function findSubstringI18n(s, isZh) {
  if (!isZh) {
    for (const item of Object.values(STAGE_I18N)) {
      if (item.zh === s || s.includes(item.zh)) return item.en
    }
    return null
  }
  for (const [enKey, item] of Object.entries(STAGE_I18N)) {
    if (s.includes(item.zh) || s.includes(enKey)) return item.zh
  }
  return null
}

/**
 * Localizes a stage name based on whether current DSH language is Chinese or English.
 * @param {string} stage
 * @param {boolean} [isZh=true]
 * @returns {string}
 */
export function localizeStage(stage, isZh = true) {
  if (!stage) return ''
  const s = String(stage).trim()
  const direct = findDirectOrFuzzyI18n(s, isZh)
  if (direct) return direct

  const sub = findSubstringI18n(s, isZh)
  if (sub) return sub

  return s
}

const STAGE_KEYWORD_EXACT_MAP = Object.freeze({
  hook: 'Hook',
  'product intro': 'Product Intro',
  'usage detail': 'Usage Detail',
  'proof effect': 'Proof Effect',
  'demo scene': 'Demo Scene',
  'inciting incident': 'Inciting Incident',
  'rising conflict': 'Rising Conflict',
  climax: 'Climax',
  cliffhanger: 'Cliffhanger',
  'call to action': 'Cta',
  cta: 'Cta',
})

const STAGE_SEMANTIC_RULES = Object.freeze([
  { pattern: /^(?:hook|黄金钩子|吸睛|悬念|开场|趣味吸睛)/i, stage: 'Hook' },
  { pattern: /^(?:product\s*intro|产品引入|核心产品|产品展示|开箱|拆箱|硬件外观|实机展示|实机)/i, stage: 'Product Intro' },
  { pattern: /^(?:usage\s*detail|使用细节|功能演示|实车安装|实时画面|功能|实操|监控)/i, stage: 'Usage Detail' },
  { pattern: /^(?:proof\s*effect|效果验证|透光对比|对比展示|核心效果|效果对比)/i, stage: 'Proof Effect' },
  { pattern: /^(?:demo\s*scene|场景演示|转化共鸣|实际场景|产品定格|品牌展示|定格)/i, stage: 'Demo Scene' },
  { pattern: /^(?:call\s*to\s*action|cta|行动号召|引导互动|互动提示)/i, stage: 'Cta' },
])

const STAGE_FRAGMENT_REGEX = new RegExp('\\b(Hook|Product\\s*Intro|Usage\\s*Detail|Demo\\s*Scene|Inciting\\s*Incident|Rising\\s*Conflict|Climax|Cliffhanger|Call\\s*to\\s*Action|Cta|CTA|黄金钩子|产品引入|核心产品|使用细节|功能演示|场景演示|转化共鸣|行动号召)\\b', 'i')

/**
 * Strip numeric and ordinals prefixes from stage string.
 * @param {string} s
 * @returns {string}
 */
function stripStagePrefixes(s) {
  return s
    .replace(/^第[一二三四五六七八九十\d]+阶段[:：\s]*/, '')
    .replace(/^阶段[一二三四五六七八九十\d]+[:：\s]*/, '')
    .replace(/^步骤[一二三四五六七八九十\d]+[:：\s]*/, '')
    .replace(/^[0-9]+[、\.\s]+/, '')
    .trim()
}

/**
 * Extract canonical stage from embedded fragment or table snippet.
 * @param {string} s
 * @param {number} index
 * @returns {string}
 */
function resolveFragmentStage(s, index) {
  const m = s.match(STAGE_FRAGMENT_REGEX)
  if (m) {
    return mapToCanonicalStage(m[1], index)
  }
  return CANONICAL_STAGE_KEYS[index] || `Stage ${index + 1}`
}

/**
 * Match stage against semantic rules.
 * @param {string} clean
 * @returns {string|null}
 */
function matchSemanticStage(clean) {
  for (const rule of STAGE_SEMANTIC_RULES) {
    if (rule.pattern.test(clean)) return rule.stage
  }
  return null
}

/**
 * Handle custom narrative exceptions for special indices.
 * @param {string} clean
 * @param {number} index
 * @returns {string|null}
 */
function matchCustomIndexStage(clean, index) {
  if (index === 0 && (/身份引入/i.test(clean) || /确立/i.test(clean))) {
    return clean
  }
  if (index === 1 && (/公益宣传/i.test(clean) || /行动号召/i.test(clean))) {
    return clean
  }
  return null
}

/**
 * Resolve clean stage text through exact keyword, semantic rules, and custom cases.
 * @param {string} s
 * @param {number} index
 * @returns {string}
 */
function resolveCleanStage(s, index) {
  const exact = STAGE_KEYWORD_EXACT_MAP[s.toLowerCase().replace(/\s+/g, ' ')]
  if (exact) return exact

  const clean = stripStagePrefixes(s)
  if (METADATA_HEADING_REGEX.test(clean)) return ''

  const semantic = matchSemanticStage(clean)
  if (semantic) return semantic

  const custom = matchCustomIndexStage(clean, index)
  if (custom) return custom

  return clean
}

/**
 * Maps any raw stage heading/text to a clean canonical stage name (Hook, Product Intro, etc.).
 * Strips verbose prefixes ("第一阶段：") and avoids sentence titles.
 * @param {string} rawStage
 * @param {number} [index=0]
 * @returns {string}
 */
export function mapToCanonicalStage(rawStage, index = 0) {
  if (!rawStage) return CANONICAL_STAGE_KEYS[index] || `Stage ${index + 1}`
  const s = String(rawStage).trim()
  if (METADATA_HEADING_REGEX.test(s)) return ''

  if (s.includes('|') || s.length > 30) {
    return resolveFragmentStage(s, index)
  }

  const clean = resolveCleanStage(s, index)
  return clean || CANONICAL_STAGE_KEYS[index] || `Stage ${index + 1}`
}
