/**
 * @file plugins/omnimux-video-preview/src/breakdown/structureParser.js
 * Narrative structure, stage cards, and pipeline sequence parser.
 */

import {
  METADATA_HEADING_REGEX,
  SECTION_MATCH_RULES,
  STAGE_STRATEGY_TEMPLATES,
} from './constants.js'
import { mapToCanonicalStage } from './tagNormalizer.js'
import { parseShotsFromAnalyzeMarkdown } from './shotsParser.js'

const BLOCK_QUOTE_REGEX = new RegExp('^(?:>|\\|)\\s*([^\\n]+)(?:\\n+([\\s\\S]*))?$')
const ENGLISH_QUOTE_KEYWORD_REGEX = new RegExp('^(?:what happened|where\'d she go|if my neighbor|just measure|from the inside|the best part|privacy guaranteed)', 'i')
const STAGE_HEADER_REGEX = new RegExp('###\\s*([^\\n]+)\\n+([\\s\\S]*?)(?=\\n###|\\n##|$)', 'g')
const CHINESE_LIST_STAGE_REGEX = new RegExp('(?:[\\*\\-\\s]*)(?:第[一二三四五六七八九十\\d]+阶段|阶段[一二三四五六七八九十\\d]+|[一二三四五六七八九十\\d]+[、\\.\\s]+)\\s*[:：]?\\s*([^\\n（(：:\\*|]+)(?:[（(][^\\n）)]+[）)])?\\s*\\n+([\\s\\S]*?)(?=(?:[\\*\\-\\s]*(?:第[一二三四五六七八九十\\d]+阶段|阶段[一二三四五六七八九十\\d]+|[一二三四五六七八九十\\d]+[、\\.\\s]+))|\\n##|二、|三、|---|$)', 'g')
const FALLBACK_PIPELINE_REGEX = new RegExp('(?:Narrative Pipeline|结构链路|叙事链路|流程链路)[^\\n:]*[:：]?\\s*\\n*([^\\n]+)', 'i')
const STAGE_SECTION_REGEX = new RegExp('##\\s*(?:\\d+[\\.\\s、]*)?结构阶段解构[\\s\\S]*?(?=\\n##\\s*(?:\\d+[\\.\\s、]*)?(?:逐镜头|分镜)|$)', 'i')
const HEADING_STRIP_REGEX = new RegExp('^###?\\s*(?:Hook|Product Intro|Usage Detail|Proof Effect|Demo Scene|Cta|CTA|[^\\n]+)\\n+', 'i')

/**
 * Extract structured narrative stages from 5D markdown.
 * @param {string} markdown
 * @returns {Array<{ stage: string, title: string, description: string }>}
 */
export function parseStructureFromAnalyzeMarkdown(markdown) {
  const structure = []
  if (typeof markdown !== 'string') return structure

  for (const rule of SECTION_MATCH_RULES) {
    const match = markdown.match(rule.regex)
    if (match) {
      structure.push({
        stage: rule.stage,
        title: rule.stage,
        description: rule.clean(match),
      })
    }
  }

  return structure
}

/**
 * Match markdown blockquote syntax > quote text.
 * @param {string} clean
 * @returns {{ quote: string, remaining: string }|null}
 */
function matchBlockQuote(clean) {
  const blockQuoteMatch = clean.match(BLOCK_QUOTE_REGEX)
  if (!blockQuoteMatch) return null

  const quote = blockQuoteMatch[1].trim().replace(/^["'“‘]+|["'”’]+$/g, '').trim()
  const remaining = (blockQuoteMatch[2] || '').trim()
  return { quote, remaining }
}

/**
 * Match first line if it contains quotation marks or dialogue keywords.
 * @param {string} clean
 * @returns {{ quote: string, remaining: string }|null}
 */
function matchFirstLineQuote(clean) {
  const firstLineMatch = clean.match(/^([^\n]+)\n+([\s\S]*)$/)
  if (!firstLineMatch) return null

  const line1 = firstLineMatch[1].trim()
  const hasQuoteMark = /^[>"'“‘|]/.test(line1)
  const hasKeyword = ENGLISH_QUOTE_KEYWORD_REGEX.test(line1)
  if (!hasQuoteMark && !hasKeyword) return null

  const quote = line1.replace(/^[>"'“‘|\s]+|[”’"'\s]+$/g, '').trim()
  const remaining = firstLineMatch[2].trim()
  return { quote, remaining }
}

/**
 * Clean description by removing trailing heading marks and markdown dividers.
 * @param {string} text
 * @returns {string}
 */
function cleanDescriptionText(text) {
  return text
    .replace(HEADING_STRIP_REGEX, '')
    .replace(/^---\s*$/, '')
    .replace(/^###[\s\S]*$/, '')
    .trim()
}

/**
 * Extract quote line (e.g. > "What happened? Where'd she go?") and clean strategy description.
 * @param {string} rawText
 * @returns {{ quote: string, desc: string }}
 */
export function extractQuoteAndDesc(rawText) {
  if (!rawText || typeof rawText !== 'string') return { quote: '', desc: '' }

  let clean = rawText.trim()
  let quote = ''

  const blockMatch = matchBlockQuote(clean)
  if (blockMatch) {
    quote = blockMatch.quote
    clean = blockMatch.remaining
  } else {
    const lineMatch = matchFirstLineQuote(clean)
    if (lineMatch) {
      quote = lineMatch.quote
      clean = lineMatch.remaining
    }
  }

  return { quote, desc: cleanDescriptionText(clean) }
}

/**
 * Extract sub-heading embedded under metadata wrapper.
 * @param {string} descText
 * @param {number} idx
 * @returns {object|null}
 */
function parseMetadataSubHeading(descText, idx) {
  const subMatch = descText.match(/###?\s*([A-Za-z\s]+|[^\n]+)\n+([\s\S]*)/)
  if (!subMatch) return null

  const subTitle = subMatch[1].trim()
  if (METADATA_HEADING_REGEX.test(subTitle) || subTitle.includes('|')) return null

  const canonicalStage = mapToCanonicalStage(subTitle, idx)
  if (!canonicalStage || METADATA_HEADING_REGEX.test(canonicalStage)) return null

  const { quote, desc } = extractQuoteAndDesc(subMatch[2])
  return { stage: canonicalStage, title: canonicalStage, quote, description: desc }
}

/**
 * Parse single heading stage node.
 * @param {string} rawHeading
 * @param {string} descText
 * @param {number} idx
 * @returns {object|null}
 */
function parseHeaderStageNode(rawHeading, descText, idx) {
  if (rawHeading.includes('|')) return null

  if (METADATA_HEADING_REGEX.test(rawHeading)) {
    return parseMetadataSubHeading(descText, idx)
  }

  const canonicalStage = mapToCanonicalStage(rawHeading, idx)
  if (!canonicalStage || METADATA_HEADING_REGEX.test(canonicalStage)) return null

  const { quote, desc } = extractQuoteAndDesc(descText)
  return { stage: canonicalStage, title: canonicalStage, quote, description: desc }
}

/**
 * Resolve stage section block text.
 * @param {string} markdown
 * @returns {string}
 */
function resolveStageBlockText(markdown) {
  const stageSectionMatch = markdown.match(STAGE_SECTION_REGEX)
  if (stageSectionMatch) {
    return stageSectionMatch[0]
  }
  return markdown
}

/**
 * Extract stages from markdown ### headings.
 * @param {string} markdown
 * @returns {Array<object>}
 */
function extractStagesFromHeaders(markdown) {
  const structure = []
  const stageBlockText = resolveStageBlockText(markdown)
  STAGE_HEADER_REGEX.lastIndex = 0

  let match = STAGE_HEADER_REGEX.exec(stageBlockText)
  let idx = 0

  while (match !== null) {
    const rawHeading = match[1].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim()
    const descText = match[2].replace(/\|[\s\S]*$/, '').replace(/```[\s\S]*?```/g, '').trim().replace(/\*+/g, '')

    const node = parseHeaderStageNode(rawHeading, descText, idx)
    if (node) {
      structure.push(node)
      idx++
    }
    match = STAGE_HEADER_REGEX.exec(stageBlockText)
  }

  return structure
}

/**
 * Parse one list match row into a stage node.
 * @param {RegExpExecArray} match
 * @param {number} idx
 * @returns {object|null}
 */
function parseListStageNode(match, idx) {
  const stageName = match[1].trim()
  if (stageName.includes('|') || METADATA_HEADING_REGEX.test(stageName)) {
    return null
  }

  const stageDesc = match[2].trim().replace(/\|[\s\S]*$/, '').replace(/\*+/g, '')
  if (!stageName || !stageDesc) return null

  const canonicalStage = mapToCanonicalStage(stageName, idx)
  if (!canonicalStage || METADATA_HEADING_REGEX.test(canonicalStage)) return null

  return { stage: canonicalStage, title: canonicalStage, description: stageDesc }
}

/**
 * Extract stages from numbered Chinese list formats.
 * @param {string} markdown
 * @returns {Array<object>}
 */
function extractStagesFromChineseList(markdown) {
  const structure = []
  const cleanMarkdown = typeof markdown === 'string' ? markdown.replace(/^\|[^\n]*$/gm, '') : ''
  CHINESE_LIST_STAGE_REGEX.lastIndex = 0

  let match = CHINESE_LIST_STAGE_REGEX.exec(cleanMarkdown)
  let idx = 0
  while (match !== null) {
    const node = parseListStageNode(match, idx)
    if (node) {
      structure.push(node)
      idx++
    }
    match = CHINESE_LIST_STAGE_REGEX.exec(cleanMarkdown)
  }
  return structure
}

/**
 * Match a corresponding stage description from structure list.
 * @param {string} stage
 * @param {Array<object>} structure
 * @returns {string|null}
 */
function findStageNarrative(stage, structure) {
  for (const st of structure) {
    if (st.stage !== stage || !st.description) continue
    if (st.description.startsWith('###') || st.description === '---') continue
    return st.description
  }
  return null
}

/**
 * Enrich shot descriptions using corresponding stage narrative.
 * @param {Array<object>} shots
 * @param {Array<object>} structure
 */
function enrichShotsFromStructure(shots, structure) {
  if (!shots.length || !structure.length) return
  for (const shot of shots) {
    const desc = shot.description || ''
    const isShort = desc.length <= 15
    const isMeta = /^[A-Za-z0-9\s·\(\)]+$/.test(desc)
    if (!isShort && !isMeta) continue

    const matchedDesc = findStageNarrative(shot.stage, structure)
    if (matchedDesc) {
      shot.description = `${shot.title}。${matchedDesc.slice(0, 80)}`
    }
  }
}

/**
 * Clean a single raw stage item.
 * @param {object} item
 * @param {number} count
 * @returns {{ stage: string, quote: string, desc: string }|null}
 */
function resolveStageItemText(item, count) {
  let stage = item.stage || item.title || ''
  let quote = item.quote || ''
  let desc = item.description || ''

  if (stage.includes('|')) {
    stage = mapToCanonicalStage(stage, count)
  }

  if (METADATA_HEADING_REGEX.test(stage)) {
    const m = desc.match(/###?\s*([A-Za-z\s]+|[^\n]+)\n+([\s\S]*)/)
    if (!m || METADATA_HEADING_REGEX.test(m[1].trim())) return null
    stage = mapToCanonicalStage(m[1].trim(), count)
    desc = m[2].trim()
  }

  return { stage, quote, desc }
}

/**
 * Clean and normalize initial raw extracted stages.
 * @param {Array<object>} rawStages
 * @returns {Array<object>}
 */
function filterAndCleanStages(rawStages) {
  const cleaned = []
  const seenStages = new Set()

  for (const item of rawStages) {
    const resolved = resolveStageItemText(item, cleaned.length)
    if (!resolved) continue
    const { stage, quote, desc } = resolved

    const isBlocked = !stage || seenStages.has(stage)
    const isInvalid = METADATA_HEADING_REGEX.test(stage) || stage.includes('|')
    if (isBlocked || isInvalid) continue

    const extracted = extractQuoteAndDesc(desc)
    const finalQuote = quote || extracted.quote || ''
    const cleanDesc = extracted.desc || desc

    seenStages.add(stage)
    cleaned.push({
      stage,
      title: stage,
      quote: finalQuote,
      description: cleanDesc,
    })
  }

  return cleaned
}

/**
 * Check if the extracted structure is degenerate.
 * @param {Array<object>} structure
 * @returns {boolean}
 */
function isStructureDegenerate(structure) {
  if (structure.length === 0) return true
  if (structure.length === 1) {
    const desc = structure[0].description
    return !desc || desc === '---' || desc.length <= 5
  }
  return structure.every((s) => !s.description || s.description === '---' || s.description.length <= 5)
}

/**
 * Build speech quote fallback from shots.
 * @param {Array<object>} stageShots
 * @returns {string}
 */
function extractShotQuoteFallback(stageShots) {
  for (const s of stageShots) {
    const speech = s.speech ? String(s.speech).trim() : ''
    if (speech && speech !== '(无)' && speech.length > 2) {
      return speech
    }
  }
  return ''
}

/**
 * Build fallback description for a stage from shot list.
 * @param {Array<object>} stageShots
 * @param {string} stageName
 * @returns {string}
 */
function buildStageFallbackDesc(stageShots, stageName) {
  const template = STAGE_STRATEGY_TEMPLATES[stageName]
  if (template) return template

  const details = stageShots
    .map((s) => {
      const desc = s.description || ''
      const hasDesc = desc.length > 5 && desc !== '---'
      if (hasDesc) {
        return desc.includes(s.title) ? desc : `${s.title}，${desc}`
      }
      return s.title
    })
    .filter(Boolean)
    .join('；')

  return details || `${stageName} 阶段核心动作与视觉呈现`
}

/**
 * Build repaired stage node from shots and existing structure.
 * @param {string} stageName
 * @param {Array<object>} cleanedStructure
 * @param {Array<object>} shots
 * @returns {object}
 */
function buildRepairedStageNode(stageName, cleanedStructure, shots) {
  const existing = cleanedStructure.find((s) => s.stage === stageName)
  const stageShots = shots.filter((s) => mapToCanonicalStage(s.stage) === stageName)
  const sampleQuote = existing?.quote || extractShotQuoteFallback(stageShots)

  const hasRichDesc = existing?.description && existing.description !== '---' && existing.description.trim().length > 10
  if (hasRichDesc) {
    return { ...existing, quote: sampleQuote }
  }

  return {
    stage: stageName,
    title: stageName,
    quote: sampleQuote,
    description: buildStageFallbackDesc(stageShots, stageName),
  }
}

/**
 * Check whether a stage candidate is valid.
 * @param {string} s
 * @returns {boolean}
 */
function isValidCandidateStage(s) {
  if (!s || s === '所属阶段') return false
  if (s.includes('|')) return false
  return !METADATA_HEADING_REGEX.test(s)
}

/**
 * Repair degenerate structure from parsed shots.
 * @param {Array<object>} cleanedStructure
 * @param {Array<object>} shots
 * @returns {Array<object>}
 */
function repairStructureFromShots(cleanedStructure, shots) {
  const stageCandidates = shots
    .map((s) => mapToCanonicalStage(s.stage))
    .filter((s) => isValidCandidateStage(s))
  const shotStages = [...new Set(stageCandidates)]

  if (shotStages.length < 2) {
    return cleanedStructure
  }

  return shotStages.map((stageName) => buildRepairedStageNode(stageName, cleanedStructure, shots))
}

/**
 * Fill missing quote and description in non-degenerate structure nodes.
 * @param {Array<object>} structure
 * @param {Array<object>} shots
 */
function enrichStructureNodes(structure, shots) {
  for (const item of structure) {
    const stageShots = shots.filter((s) => mapToCanonicalStage(s.stage) === item.stage)
    if (!item.quote) {
      item.quote = extractShotQuoteFallback(stageShots)
    }
    const isDescWeak = !item.description || item.description === '---' || item.description.length <= 5
    if (isDescWeak) {
      item.description = buildStageFallbackDesc(stageShots, item.stage)
    }
  }
}

/**
 * Parse pipeline stages from markdown text when structure is empty.
 * @param {string} markdown
 * @returns {Array<string>}
 */
function parsePipelineFromText(markdown) {
  const pipelineRegex = /##\s*1\.\s*叙事结构链路[^\n]*\n+([^\n]+)/i
  const pipelineMatch = markdown.match(pipelineRegex) || markdown.match(FALLBACK_PIPELINE_REGEX)
  if (!pipelineMatch || !pipelineMatch[1]) return []

  return pipelineMatch[1]
    .split(/[→\->\>]/)
    .map((s, idx) => mapToCanonicalStage(s.replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, ''), idx))
    .filter((s) => Boolean(s) && !METADATA_HEADING_REGEX.test(s))
}

/**
 * Collect raw stage structures using headers, lists, or 5D legacy rules.
 * @param {string} markdown
 * @returns {Array<object>}
 */
function collectRawStages(markdown) {
  let structure = extractStagesFromHeaders(markdown)
  if (structure.length === 0) {
    structure = extractStagesFromChineseList(markdown)
  }
  if (structure.length === 0) {
    structure = parseStructureFromAnalyzeMarkdown(markdown)
  }
  return structure
}

/**
 * Parse two-step narrative structure & pipeline from dedicated structure breakdown markdown.
 * @param {string} markdown
 * @returns {{ pipeline: Array<string>, structure: Array<object>, shots: Array<object> }}
 */
export function parsePipelineAndStructureFromMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { pipeline: [], structure: [], shots: [] }
  }

  const rawStages = collectRawStages(markdown)
  const cleanedStructure = filterAndCleanStages(rawStages)
  const shots = parseShotsFromAnalyzeMarkdown(markdown)

  let finalStructure = cleanedStructure
  if (isStructureDegenerate(cleanedStructure) && shots.length > 0) {
    finalStructure = repairStructureFromShots(cleanedStructure, shots)
  } else {
    enrichStructureNodes(cleanedStructure, shots)
    finalStructure = cleanedStructure
  }

  let pipeline = []
  if (finalStructure.length > 0) {
    pipeline = finalStructure.map((s) => s.stage)
  } else {
    pipeline = parsePipelineFromText(markdown)
  }

  enrichShotsFromStructure(shots, finalStructure)
  return { pipeline, structure: finalStructure, shots }
}
