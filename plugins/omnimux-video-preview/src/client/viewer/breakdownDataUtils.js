import {
  METADATA_HEADING_REGEX,
  mapToCanonicalStage,
  extractQuoteAndDesc,
} from '../../breakdown-parser.js'

const PHANTOM_TITLE_REGEX = /^(?:分镜标题|所属阶段|镜头属性标签|画面与动作描述)$/i
const PHANTOM_STAGE_REGEX = /^(?:所属阶段|阶段|stage)$/i
const HEADING_MATCH_REGEX = /###?\s*([A-Za-z\s]+|[^\n]+)\n+([\s\S]*)/
const LEADING_NON_WORD_REGEX = /^[^\u4e00-\u9fa5a-zA-Z0-9]+/
const NUMBER_UNIT_SUFFIX_REGEX = /[kmb]$/i

export const STAGE_STRATEGY_TEMPLATES = {
  'Hook': '以偷窥情景剧形式戏剧化呈现隐私暴露痛点，瞬间抓住用户注意力并引出隐私贴膜解决方案。',
  'Product Intro': '通过邻居推荐的情景口吻，引出单向透光隔热窗膜产品，建立信任感与好奇心。',
  'Usage Detail': '分步演示测量、裁剪、贴膜及刮平过程，展示产品极低的操作门槛与DIY便利性。',
  'Proof Effect': '直观对比内外视角效果，强调单向透视的防窥私密性与防晒隔热、节能省电的双重核心价值。',
  'Demo Scene': '展示真实生活与工作应用场景，配合舒适从容的生活氛围，全面激发观众的安全感与购买向往。',
  'Cta': '通过50%折扣和包邮优惠激发紧迫感，强力促单转化。',
}

function isZeroRangePlaceholder(shot) {
  const isZero = shot.time_range === '0:00 - 0:00' && shot.start_seconds === 0 && shot.end_seconds === 0
  if (!isZero) return false
  const title = shot.title
  return !title || title === '-' || title === '分镜'
}

function isPhantomShot(shot) {
  if (!shot) return true
  const title = String(shot.title || '').trim()
  if (PHANTOM_TITLE_REGEX.test(title)) return true
  const stage = String(shot.stage || '').trim()
  if (PHANTOM_STAGE_REGEX.test(stage)) return true
  return isZeroRangePlaceholder(shot)
}

export function cleanShots(rawShots) {
  if (!Array.isArray(rawShots)) return []
  return rawShots.filter((shot) => !isPhantomShot(shot))
}

function extractHeadingStage(desc, cleanedLength) {
  const match = desc.match(HEADING_MATCH_REGEX)
  if (!match) return null
  const rawHeading = match[1].trim()
  if (METADATA_HEADING_REGEX.test(rawHeading)) return null
  return {
    stage: mapToCanonicalStage(rawHeading, cleanedLength),
    desc: match[2].trim(),
  }
}

function resolveInitialStage(item, cleanedLength) {
  let stage = item.stage || item.title || ''
  let desc = item.description || ''
  if (stage.includes('|')) {
    stage = mapToCanonicalStage(stage, cleanedLength)
  }
  if (METADATA_HEADING_REGEX.test(stage)) {
    const heading = extractHeadingStage(desc, cleanedLength)
    if (!heading) return null
    stage = heading.stage
    desc = heading.desc
  }
  stage = mapToCanonicalStage(stage, cleanedLength)
  return { stage, desc }
}

function isValidStageName(stage) {
  if (!stage) return false
  if (METADATA_HEADING_REGEX.test(stage)) return false
  return !stage.includes('|')
}

function normalizeRawStageItem(item, cleanedLength) {
  const initial = resolveInitialStage(item, cleanedLength)
  if (!initial || !isValidStageName(initial.stage)) {
    return null
  }
  const extracted = extractQuoteAndDesc(initial.desc)
  const finalQuote = item.quote || extracted.quote || ''
  const cleanDesc = extracted.desc || initial.desc
  return {
    ...item,
    stage: initial.stage,
    title: initial.stage,
    quote: finalQuote,
    description: cleanDesc,
  }
}

function isDegenerateStructure(cleaned) {
  if (cleaned.length <= 1) return true
  return cleaned.every((s) => {
    if (!s.description || s.description === '---') return true
    return s.description.startsWith('###') || s.description.length <= 5
  })
}

function findSampleQuote(existingQuote, stageShots) {
  if (existingQuote) return existingQuote
  for (const shot of stageShots) {
    const speech = shot.speech
    if (speech && speech !== '(无)' && String(speech).trim().length > 2) {
      return speech
    }
  }
  return ''
}

function isRichShotDescription(desc) {
  if (!desc || desc === '---') return false
  if (desc.startsWith('###')) return false
  return desc.length > 5
}

function buildFallbackDetails(stageShots) {
  return stageShots
    .map((s) => {
      if (isRichShotDescription(s.description)) {
        return s.description.includes(s.title) ? s.description : `${s.title}，${s.description}`
      }
      return s.title
    })
    .filter(Boolean)
    .join('；')
}

function isSubstantialDescription(desc) {
  if (!desc || desc === '---') return false
  if (desc.startsWith('###')) return false
  return desc.trim().length > 10
}

function recoverStageItem(stageName, cleaned, shots) {
  const existing = cleaned.find((s) => s.stage === stageName)
  const stageShots = shots.filter((s) => mapToCanonicalStage(s.stage) === stageName)
  const sampleQuote = findSampleQuote(existing?.quote, stageShots)

  if (existing && isSubstantialDescription(existing.description)) {
    return { ...existing, quote: sampleQuote }
  }

  const templateDesc = STAGE_STRATEGY_TEMPLATES[stageName]
  const fallbackDetails = buildFallbackDetails(stageShots)
  return {
    stage: stageName,
    title: stageName,
    quote: sampleQuote,
    description: templateDesc || fallbackDetails || `${stageName} 核心意图呈现`,
  }
}

function isWeakDescription(desc) {
  if (!desc || desc === '---') return true
  return desc.startsWith('###') || desc.length <= 5
}

function enrichSingleStage(item, shots) {
  const stageShots = shots.filter((s) => mapToCanonicalStage(s.stage) === item.stage)
  if (!item.quote) {
    const quote = findSampleQuote('', stageShots)
    if (quote) item.quote = quote.trim()
  }

  if (isWeakDescription(item.description)) {
    const templateDesc = STAGE_STRATEGY_TEMPLATES[item.stage]
    const fallbackDetails = buildFallbackDetails(stageShots)
    item.description = templateDesc || fallbackDetails || `${item.stage} 核心意图与视觉解析`
  }
}

function isValidShotStage(stage) {
  if (!stage || stage === '所属阶段') return false
  if (stage.includes('|')) return false
  return !METADATA_HEADING_REGEX.test(stage)
}

function parseUniqueStagesFromShots(shots) {
  const stages = shots.map((s) => mapToCanonicalStage(s.stage)).filter(isValidShotStage)
  return [...new Set(stages)]
}

function collectValidStructureItems(rawList) {
  const cleaned = []
  const seen = new Set()
  for (const item of rawList) {
    const normalized = normalizeRawStageItem(item, cleaned.length)
    if (normalized && !seen.has(normalized.stage)) {
      seen.add(normalized.stage)
      cleaned.push(normalized)
    }
  }
  return cleaned
}

export function cleanStructure(rawStructure, shots = []) {
  const rawList = Array.isArray(rawStructure) ? rawStructure : []
  const cleaned = collectValidStructureItems(rawList)

  if (isDegenerateStructure(cleaned) && shots.length > 0) {
    const shotStages = parseUniqueStagesFromShots(shots)
    if (shotStages.length >= 2) {
      return shotStages.map((stg) => recoverStageItem(stg, cleaned, shots))
    }
  }

  for (const item of cleaned) {
    enrichSingleStage(item, shots)
  }

  return cleaned
}

export function cleanPipeline(cleanStructureList, rawPipeline) {
  if (cleanStructureList.length > 0) {
    return cleanStructureList.map((s) => s.stage)
  }
  const raw = Array.isArray(rawPipeline) ? rawPipeline : []
  return raw
    .filter((name) => !METADATA_HEADING_REGEX.test(name))
    .map((name, idx) => mapToCanonicalStage(name, idx))
    .filter((s) => Boolean(s) && !s.includes('|') && !METADATA_HEADING_REGEX.test(s))
}

export function formatCurrentTime(sec) {
  const total = Math.floor(sec || 0)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatViews(rawViews) {
  if (!rawViews) return '0'
  const str = String(rawViews).trim()
  if (NUMBER_UNIT_SUFFIX_REGEX.test(str)) return str
  const num = Number(str)
  if (!Number.isFinite(num) || num === 0) return str
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`.replace('.0M', 'M')
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`.replace('.0K', 'K')
  }
  return String(num)
}

export function cleanTagText(tagStr) {
  return String(tagStr || '').replace(LEADING_NON_WORD_REGEX, '').trim()
}

function getTranslatedText(shotId, selectedLang, translations) {
  if (selectedLang === 'original') return null
  if (!translations || typeof translations !== 'object') return null
  const langMap = translations[selectedLang]
  if (!langMap || typeof langMap !== 'object') return null
  return langMap[shotId] || null
}

function buildShotTagsLine(tags, isZh) {
  if (!Array.isArray(tags) || tags.length === 0) return ''
  const label = isZh ? '属性' : 'Tags'
  return `\n${label}：${tags.join(' | ')}`
}

function buildShotSpeechLine(speech, isZh) {
  if (!speech) return ''
  const label = isZh ? '台词' : 'Speech'
  return `\n${label}：${speech}`
}

function buildShotTranslationLine(shotId, opts) {
  const transText = getTranslatedText(shotId, opts.selectedLang, opts.translations)
  if (!transText) return ''
  const label = opts.isZh ? '翻译' : 'Translation'
  return `\n${label}：${transText}`
}

function formatSingleShotCopy(shot, index, opts) {
  const range = shot.time_range || `${shot.start_seconds || 0}s - ${shot.end_seconds || 0}s`
  const stageName = mapToCanonicalStage(shot.stage, index)
  const stage = stageName ? ` [${stageName}]` : ''
  const tags = buildShotTagsLine(shot.tags, opts.isZh)
  const speech = buildShotSpeechLine(shot.speech, opts.isZh)
  const trans = buildShotTranslationLine(shot.id, opts)
  const descLabel = opts.isZh ? '描述' : 'Description'
  const desc = shot.description ? `\n${descLabel}：${shot.description}` : ''
  const defaultTitle = `${opts.isZh ? '分镜' : 'Shot'} ${index + 1}`
  return `${range} ${shot.title || defaultTitle}${stage}${tags}${speech}${trans}${desc}`
}

export function computeShotsCopyText(shots, isZh, selectedLang, translations) {
  if (!shots.length) return ''
  const opts = { isZh, selectedLang, translations }
  return shots.map((s, idx) => formatSingleShotCopy(s, idx, opts)).join('\n\n')
}

function extractShotSpeechText(s) {
  if (s.speech) return s.speech
  if (s.dialogue) return s.dialogue
  if (s.subtitle) return s.subtitle
  return ''
}

function formatSingleScriptLine(s, selectedLang, translations) {
  const speech = extractShotSpeechText(s)
  if (!speech) return null
  const time = s.time_range || `${s.start_seconds || 0}s`
  const transText = getTranslatedText(s.id, selectedLang, translations)
  if (transText) {
    return `${time} ${speech}\n${time} [${selectedLang}] ${transText}`
  }
  return `${time} ${speech}`
}

export function computeScriptCopyText(shots, isZh, selectedLang, translations) {
  if (!shots.length) return ''
  const lines = shots.map((s) => formatSingleScriptLine(s, selectedLang, translations)).filter(Boolean)
  if (lines.length > 0) return lines.join('\n\n')
  return shots.map((s, idx) => {
    const prefix = s.time_range || (isZh ? `分镜 ${idx + 1}` : `Shot ${idx + 1}`)
    return `${prefix} ${s.description || ''}`
  }).join('\n\n')
}

export function computeStructureCopyText(structure) {
  if (!structure.length) return ''
  return structure.map((item, idx) => {
    const title = mapToCanonicalStage(item.stage || item.title, idx)
    return `【${title}】\n${item.description || ''}`
  }).join('\n\n')
}
