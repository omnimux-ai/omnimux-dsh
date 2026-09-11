/**
 * @file plugins/omnimux-video-preview/src/breakdown/shotsParser.js
 * Video shot rows markdown table parser and copy-text formatting.
 */

import {
  STAGE_NAME_MAP,
  SHOT_TYPE_REGEX,
  MOTION_WORD_REGEX,
  CUT_INDEX_REGEX,
  SPEECH_PREFIX_REGEX,
  STAGE_KEYWORD_REGEX,
  HEADER_KEYWORD_REGEX,
} from './constants.js'
import { formatTimeRange, extractTimeRange } from './timeUtils.js'
import { canonicalizeCameraTags, mapToCanonicalStage } from './tagNormalizer.js'

/**
 * Generate formatted plain text of all shots for one-click copy.
 * @param {Array<object>} shots
 * @returns {string}
 */
export function formatShotsCopyText(shots = []) {
  if (!Array.isArray(shots) || shots.length === 0) return ''
  return shots
    .map((shot, idx) => {
      const timeStr = shot.time_range || formatTimeRange(shot.start_seconds, shot.end_seconds)
      const stageStr = shot.stage ? ` [${shot.stage}]` : ''
      const tagsLine = Array.isArray(shot.tags) && shot.tags.length > 0 ? `属性：${shot.tags.join(' | ')}` : ''
      const speechLine = shot.speech ? `台词：${shot.speech}` : ''
      const descLine = shot.description ? `描述：${shot.description}` : ''
      const defaultTitle = `分镜 ${idx + 1}`
      const headerLine = `${timeStr} ${shot.title || defaultTitle}${stageStr}`
      return [headerLine, tagsLine, speechLine, descLine].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

/**
 * Generate formatted plain script / dialogue text for one-click copy.
 * @param {Array<object>} shots
 * @returns {string}
 */
export function formatScriptCopyText(shots = []) {
  if (!Array.isArray(shots) || shots.length === 0) return ''
  const dialogueLines = shots
    .map((s) => {
      const speech = s.speech || ''
      const time = s.time_range || `${s.start_seconds || 0}s`
      return speech ? `${time} ${speech}` : null
    })
    .filter(Boolean)

  if (dialogueLines.length > 0) {
    return dialogueLines.join('\n\n')
  }

  return shots
    .map((s, idx) => {
      const label = s.time_range || `分镜 ${idx + 1}`
      const desc = s.description || ''
      return `${label} ${desc}`
    })
    .join('\n\n')
}

/**
 * Extract speech dialogue from description text if embedded.
 * @param {string} text
 * @returns {{ cleanText: string, speech: string }}
 */
export function extractSpeechFromDesc(text) {
  if (!text) return { cleanText: '', speech: '' }
  const m = text.match(/(?:台词|口播|字幕|语音|Speech|Dialogue)[:：]\s*([^\n]+)/i)
    || text.match(/[☊\u260a]\s*([^\n]+)/)
  if (!m) return { cleanText: text, speech: '' }
  return { cleanText: text.replace(m[0], '').trim(), speech: m[1].trim() }
}

/**
 * Infer narrative stage from seconds.
 * @param {number} startSec
 * @param {number} endSec
 * @returns {string}
 */
function inferStageFromSeconds(startSec, endSec) {
  if (startSec === 0 || endSec <= 3) return 'Hook'
  if (endSec > 12) return 'Demo Scene'
  if (startSec >= 7) return 'Usage Detail'
  return 'Product Intro'
}

/**
 * Check whether a string looks like spoken dialogue or voiceover.
 * @param {string} text
 * @returns {boolean}
 */
function isSpeechContent(text) {
  if (!text) return false
  const s = text.trim()
  if (SPEECH_PREFIX_REGEX.test(s)) return true
  if (/^[🗣️☊"'“‘]/.test(s)) return true
  if (s.includes('🗣️') || s.includes('☊')) return true
  return /^(?:hold on|surprise|look at|every book|comenta|hey|hi|hello|check this|protect your)/i.test(s)
}

/**
 * Check whether a string represents camera visual description.
 * @param {string} text
 * @returns {boolean}
 */
function isVisualActionContent(text) {
  if (!text) return false
  const s = text.trim()
  const hasChinese = /[\u4e00-\u9fa5]/.test(s)
  const hasActionKeyword = /(?:画面|镜头|双手|倒计时|特写|展示|取出|摆放|切入|手持|推入|呈现|全景|中景|主角|男主|小狗|幼犬|俯视|平视|仰视|背景|翻转|拉开|坐下|坐定|按压|闭眼|趴卧|仰卧)/.test(s)
  return hasChinese && hasActionKeyword
}

/**
 * Distinguish between speech dialogue and visual description columns.
 * @param {string} colA
 * @param {string} colB
 * @returns {{ speech: string, desc: string }}
 */
function pairCols(colA, colB) {
  const aIsSpeech = isSpeechContent(colA)
  const bIsDesc = isVisualActionContent(colB)
  if (aIsSpeech || bIsDesc) {
    return { speech: colA, desc: colB }
  }

  const bIsSpeech = isSpeechContent(colB)
  const aIsDesc = isVisualActionContent(colA)
  if (bIsSpeech || aIsDesc) {
    return { speech: colB, desc: colA }
  }

  return { speech: colB, desc: colA }
}

/**
 * Clean up dialogue string by stripping markers.
 * @param {string} rawSpeech
 * @returns {string}
 */
function sanitizeSpeech(rawSpeech) {
  let s = (rawSpeech || '').replace(SPEECH_PREFIX_REGEX, '').trim()
  if (s.startsWith('☊')) {
    s = s.slice(1).trim()
  }
  return s
}

/**
 * Resolve speech and description from table row columns.
 * @param {Array<string>} cols
 * @returns {{ speech: string, desc: string }}
 */
function resolveStructuredSpeechAndDesc(cols) {
  let rawPair = { speech: '', desc: '' }
  if (cols.length >= 6) {
    rawPair = pairCols(cols[4] || '', cols[5] || '')
  } else {
    rawPair.desc = cols[4] || cols[3] || ''
  }

  let speech = sanitizeSpeech(rawPair.speech)
  let desc = rawPair.desc

  if (!speech && desc) {
    const extracted = extractSpeechFromDesc(desc)
    speech = extracted.speech
    desc = extracted.cleanText
  }
  return { speech, desc }
}

/**
 * Normalize title and description text for structured shot.
 * @param {string} rawTitle
 * @param {string} stageCol
 * @param {string} tagsCol
 * @param {string} desc
 * @returns {{ title: string, tags: Array<string>, desc: string }}
 */
function normalizeStructuredTitleAndTags(rawTitle, stageCol, tagsCol, desc) {
  let title = rawTitle
  const tags = canonicalizeCameraTags(tagsCol, `${rawTitle} ${desc}`)

  if (SHOT_TYPE_REGEX.test(title.trim())) {
    const hasValidDesc = desc && !MOTION_WORD_REGEX.test(desc.trim())
    title = hasValidDesc ? desc.slice(0, 20) : `${stageCol} 核心呈现`
  }

  let finalDesc = desc
  if (MOTION_WORD_REGEX.test(desc.trim()) || !desc) {
    finalDesc = `${title}，镜头结合${tags.slice(0, 3).join('、')}，细腻展现画面细节与核心动作。`
  }
  return { title, tags, desc: finalDesc }
}

/**
 * Parse structured shot row with dedicated columns.
 * @param {Array<string>} cols
 * @param {number} shotIndex
 * @param {{ startSec: number, endSec: number }} timeInfo
 * @returns {object}
 */
function parseStructuredShotRow(cols, shotIndex, timeInfo) {
  const initialTitle = cols[1] || `分镜 ${shotIndex}`
  const rawStage = cols[2].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim() || 'Product Intro'
  const stageCol = mapToCanonicalStage(rawStage, shotIndex - 1)
  const tagsCol = cols[3] || ''

  const { speech, desc } = resolveStructuredSpeechAndDesc(cols)
  const normalized = normalizeStructuredTitleAndTags(initialTitle, stageCol, tagsCol, desc)

  return {
    id: `shot_${shotIndex}`,
    start_seconds: timeInfo.startSec,
    end_seconds: timeInfo.endSec,
    time_range: formatTimeRange(timeInfo.startSec, timeInfo.endSec),
    title: normalized.title,
    stage: stageCol,
    tags: normalized.tags,
    speech,
    description: normalized.desc,
  }
}

/**
 * Build fallback title and description for legacy format.
 * @param {object} options
 * @returns {{ title: string, desc: string }}
 */
function buildLegacyFallback(options) {
  const { actionCol, extraCol, stage, tags, shotIndex } = options
  const isActionValid = actionCol && !MOTION_WORD_REGEX.test(actionCol.trim()) && !SHOT_TYPE_REGEX.test(actionCol.trim())
  if (isActionValid) {
    const title = actionCol.slice(0, 20)
    const desc = extraCol || `${title}，镜头采用${tags.slice(0, 3).join('、')}，细腻展现关键细节与核心动作。`
    return { title, desc }
  }

  const stageName = STAGE_NAME_MAP[stage] || stage
  const title = `${stageName} (${shotIndex})`
  const desc = extraCol && !MOTION_WORD_REGEX.test(extraCol.trim())
    ? extraCol
    : `${title}，画面结合${tags.slice(0, 3).join('、')}呈现生动的细节与核心动作。`
  return { title, desc }
}

/**
 * Normalize legacy title and description using options bag.
 * @param {object} options
 * @returns {{ title: string, desc: string, speech: string }}
 */
function normalizeLegacyTitleAndDesc(options) {
  const { visualCol, actionCol, tags } = options
  const isShotType = SHOT_TYPE_REGEX.test(visualCol.trim())
  let title = visualCol
  let desc = actionCol

  if (isShotType || !title) {
    const fallback = buildLegacyFallback(options)
    title = fallback.title
    desc = fallback.desc
  } else if (MOTION_WORD_REGEX.test(desc.trim()) || !desc || desc === '固定') {
    desc = `${title}，镜头结合${tags.slice(0, 3).join('、')}，细腻展现画面细节与核心动作。`
  }

  let speech = ''
  if (desc) {
    const extracted = extractSpeechFromDesc(desc)
    speech = extracted.speech
    desc = extracted.cleanText
  }
  return { title, desc, speech }
}

/**
 * Parse legacy shot row where columns were dynamic.
 * @param {Array<string>} cols
 * @param {string} timeCol
 * @param {number} shotIndex
 * @param {{ startSec: number, endSec: number }} timeInfo
 * @returns {object}
 */
function parseLegacyShotRow(cols, timeCol, shotIndex, timeInfo) {
  const descCols = cols.filter((c) => c !== timeCol && !/^\d+$/.test(c))
  let colIdx0 = 0
  if (CUT_INDEX_REGEX.test((descCols[0] || '').trim())) {
    colIdx0 = 1
  }

  const visualCol = descCols[colIdx0] || ''
  const actionCol = descCols[colIdx0 + 1] || ''
  const extraCol = descCols[colIdx0 + 2] || ''

  const tags = canonicalizeCameraTags([visualCol, actionCol, extraCol])
  const rawStage = inferStageFromSeconds(timeInfo.startSec, timeInfo.endSec)
  const stage = mapToCanonicalStage(rawStage, shotIndex - 1)
  const normalized = normalizeLegacyTitleAndDesc({
    visualCol,
    actionCol,
    extraCol,
    stage,
    tags,
    shotIndex,
  })

  return {
    id: `shot_${shotIndex}`,
    start_seconds: timeInfo.startSec,
    end_seconds: timeInfo.endSec,
    time_range: formatTimeRange(timeInfo.startSec, timeInfo.endSec),
    title: normalized.title,
    stage,
    tags,
    speech: normalized.speech,
    description: normalized.desc,
  }
}

/**
 * Check whether a row is a table header.
 * @param {Array<string>} rawCols
 * @returns {boolean}
 */
export function isTableHeaderRow(rawCols) {
  const count = rawCols.filter((c) => HEADER_KEYWORD_REGEX.test(c.trim())).length
  return count >= 2
}

/**
 * Unconditional guard against phantom repeated header rows.
 * @param {Array<string>} rawCols
 * @returns {boolean}
 */
function isPhantomHeaderRow(rawCols) {
  const hasExactHeaderKeyword = rawCols.some((c) => /^(?:分镜标题|所属阶段|画面与动作描述|镜头属性标签)$/i.test(c.trim()))
  if (hasExactHeaderKeyword) return true

  const col1IsTitle = rawCols[1] && /^(?:分镜标题|标题)$/i.test(rawCols[1].trim())
  const col2IsStage = rawCols[2] && /^(?:所属阶段|阶段|stage)$/i.test(rawCols[2].trim())
  return Boolean(col1IsTitle || col2IsStage)
}

/**
 * Check whether a row has non-zero duration or valid title.
 * @param {{ startSec: number, endSec: number }} timeInfo
 * @param {Array<string>} rawCols
 * @returns {boolean}
 */
function hasValidTimeOrTitle(timeInfo, rawCols) {
  if (timeInfo.startSec !== 0 || timeInfo.endSec !== 0) return true
  const col1 = (rawCols[1] || '').trim()
  return Boolean(col1 && col1 !== '-' && col1 !== '分镜')
}

/**
 * Parse one shot row according to structure format.
 * @param {Array<string>} rawCols
 * @param {number} nextIndex
 * @param {{ timeCol: string, startSec: number, endSec: number }} timeInfo
 * @param {boolean} hasStageHeader
 * @returns {object}
 */
function parseSingleShotRow(rawCols, nextIndex, timeInfo, hasStageHeader) {
  const isStageKeyword = rawCols[2] && STAGE_KEYWORD_REGEX.test(rawCols[2].trim())
  const isStructured = rawCols.length >= 4 && (hasStageHeader || isStageKeyword)
  if (isStructured) {
    return parseStructuredShotRow(rawCols, nextIndex, timeInfo)
  }
  return parseLegacyShotRow(rawCols, timeInfo.timeCol, nextIndex, timeInfo)
}

/**
 * Extract table columns from a markdown table line.
 * @param {string} rawLine
 * @returns {Array<string>|null}
 */
function extractLineColumns(rawLine) {
  const line = rawLine.trim()
  if (!line.startsWith('|') || line.includes('---')) return null
  const rawCols = line.split('|').map((c) => c.trim()).filter((_c, i, a) => i > 0 && i < a.length - 1)
  return rawCols.length >= 2 ? rawCols : null
}

/**
 * Process one parsed table row against current parser context state.
 * @param {object} context
 * @param {Array<string>} rawCols
 * @returns {object|null}
 */
function processTableRow(context, rawCols) {
  if (isTableHeaderRow(rawCols)) {
    context.tableStarted = true
    context.hasStageHeader = rawCols.some((c) => c.includes('阶段') || c.includes('Stage'))
    return null
  }
  if (!context.tableStarted || isPhantomHeaderRow(rawCols)) return null

  const timeInfo = extractTimeRange(rawCols)
  if (!hasValidTimeOrTitle(timeInfo, rawCols)) return null

  const nextIndex = context.shots.length + 1
  return parseSingleShotRow(rawCols, nextIndex, timeInfo, context.hasStageHeader)
}

/**
 * Parse markdown table from video_analyze into structured shots.
 * @param {string} markdown
 * @returns {Array<object>}
 */
export function parseShotsFromAnalyzeMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.includes('|')) return []
  const lines = markdown.split('\n')
  const context = { shots: [], tableStarted: false, hasStageHeader: false }

  for (const rawLine of lines) {
    const rawCols = extractLineColumns(rawLine)
    if (!rawCols) continue
    const shot = processTableRow(context, rawCols)
    if (shot) {
      context.shots.push(shot)
    }
  }

  return context.shots
}
