/**
 * @file plugins/omnimux-video-preview/src/breakdown-parser.js
 * Video breakdown parser & formatting engine.
 * Pure functions for parsing markdown analysis tables, narrative pipelines, and formatting shot copy texts.
 */

const STAGE_NAME_MAP = {
  Hook: '黄金开局视觉切入',
  'Product Intro': '核心主体与细节呈现',
  'Usage Detail': '实操过程与功能展示',
  'Demo Scene': '实际场景与转化共鸣',
}

const DEFAULT_CAMERA_TAGS = ['特写', '智能手机手持', '俯视', '手持微动']

const SHOT_TYPE_REGEX = /^(全景|远景|大远景|大特写|特写|中景|中全景|中近景|近景)$/i
const MOTION_WORD_REGEX = /^(固定|正面固定|俯角固定|手持微动|手持平移|慢速推拉|快速摇镜)$/i
const CUT_INDEX_REGEX = /^(\*\*)?(?:cut|镜头|镜号|shot)\s*\d+(\*\*)?$/i
const SPEECH_PREFIX_REGEX = /^[\(（]?(?:无|none|无台词|none)[\)）]?$/i
const STAGE_KEYWORD_REGEX = /^(hook|product intro|usage detail|demo scene|inciting incident|rising conflict|climax|plot twist|cliffhanger|cta)$/i

export const METADATA_HEADING_REGEX = /^(?:[#\d\.\s*、\-\(\)（）]*)(?:叙事结构|结构阶段|逐镜头|分镜脚本|两阶段|结构拆解|流程链路|核心目标|内容总览|基本信息|分段目录|场景数据|关键表达|优化建议|风险与备注|结论)/i

export const STAGE_I18N = {
  Hook: { zh: '黄金钩子', en: 'Hook' },
  'Product Intro': { zh: '产品引入', en: 'Product Intro' },
  'Usage Detail': { zh: '使用细节', en: 'Usage Detail' },
  'Demo Scene': { zh: '场景演示', en: 'Demo Scene' },
  'Call to Action': { zh: '行动号召', en: 'Cta' },
  CTA: { zh: '行动号召', en: 'Cta' },
  Cta: { zh: '行动号召', en: 'Cta' },
  'Inciting Incident': { zh: '开端引发', en: 'Inciting Incident' },
  'Rising Conflict': { zh: '冲突升级', en: 'Rising Conflict' },
  Climax: { zh: '剧情高潮', en: 'Climax' },
  Cliffhanger: { zh: '悬念钩子', en: 'Cliffhanger' },
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
  const found = STAGE_I18N[s]
  if (found) {
    return isZh ? found.zh : found.en
  }

  const lower = s.toLowerCase()
  for (const [enKey, item] of Object.entries(STAGE_I18N)) {
    if (enKey.toLowerCase() === lower) {
      return isZh ? item.zh : item.en
    }
  }

  if (!isZh) {
    for (const item of Object.values(STAGE_I18N)) {
      if (item.zh === s || s.includes(item.zh)) return item.en
    }
  } else {
    for (const [enKey, item] of Object.entries(STAGE_I18N)) {
      if (s.includes(item.zh) || s.includes(enKey)) return item.zh
    }
  }

  return s
}

const CANONICAL_STAGE_KEYS = ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene']

/**
 * Maps any raw stage heading/text to a clean canonical stage name (Hook, Product Intro, etc.).
 * Strips verbose prefixes ("第一阶段：") and avoids sentence titles.
 * @param {string} rawStage
 * @param {number} [index]
 * @returns {string}
 */
export function mapToCanonicalStage(rawStage, index = 0) {
  if (!rawStage) return CANONICAL_STAGE_KEYS[index] || `Stage ${index + 1}`
  const s = String(rawStage).trim()
  if (METADATA_HEADING_REGEX.test(s)) return ''

  if (/^hook$/i.test(s)) return 'Hook'
  if (/^product\s*intro$/i.test(s)) return 'Product Intro'
  if (/^usage\s*detail$/i.test(s)) return 'Usage Detail'
  if (/^demo\s*scene$/i.test(s)) return 'Demo Scene'

  // Drama / Narrative stages
  if (/^inciting\s*incident$/i.test(s)) return 'Inciting Incident'
  if (/^rising\s*conflict$/i.test(s)) return 'Rising Conflict'
  if (/^climax$/i.test(s)) return 'Climax'
  if (/^cliffhanger$/i.test(s)) return 'Cliffhanger'
  if (/^call\s*to\s*action$|^cta$/i.test(s)) return 'Cta'

  // Strip prefixes like "第一阶段：", "阶段一："
  const clean = s
    .replace(/^第[一二三四五六七八九十\d]+阶段[:：\s]*/, '')
    .replace(/^阶段[一二三四五六七八九十\d]+[:：\s]*/, '')
    .replace(/^步骤[一二三四五六七八九十\d]+[:：\s]*/, '')
    .replace(/^[0-9]+[、\.\s]+/, '')
    .trim()

  if (METADATA_HEADING_REGEX.test(clean)) return ''

  if (/^(?:hook|黄金钩子|吸睛|悬念|开场|趣味吸睛)/i.test(clean)) return 'Hook'
  if (/^(?:product\s*intro|产品引入|核心产品|产品展示|开箱|拆箱|硬件外观|实机展示|实机)/i.test(clean)) return 'Product Intro'
  if (/^(?:usage\s*detail|使用细节|功能演示|实车安装|实时画面|功能|实操|监控)/i.test(clean)) return 'Usage Detail'
  if (/^(?:demo\s*scene|场景演示|转化共鸣|实际场景|产品定格|品牌展示|定格)/i.test(clean)) return 'Demo Scene'
  if (/^(?:call\s*to\s*action|cta|行动号召|引导互动|互动提示)/i.test(clean)) return 'Cta'

  if (index === 0 && (/身份引入/i.test(clean) || /确立/i.test(clean))) return clean
  if (index === 1 && (/公益宣传/i.test(clean) || /行动号召/i.test(clean))) return clean

  return clean || CANONICAL_STAGE_KEYS[index] || `Stage ${index + 1}`
}

/**
 * Canonicalizes any raw camera tag string or array into 4 orthogonal dimensions:
 * [Scale (景别), Device (机位设备), Angle (拍摄视角), Motion (运镜方式)]
 * Eliminates slashes (/), combines split fragments, strips non-camera locations,
 * and guarantees returning exactly 4 standard camera parameter tags.
 *
 * @param {string|Array<string>} rawTags
 * @param {string} [contextText]
 * @returns {Array<string>} [scale, device, angle, motion]
 */
export function canonicalizeCameraTags(rawTags, contextText = '') {
  const tokens = (Array.isArray(rawTags) ? rawTags : [rawTags])
    .filter(Boolean)
    .flatMap((item) => String(item).split(/[,，|、/／;；\s]+/))
    .map((t) => t.trim())
    .filter(Boolean)

  const combined = `${tokens.join(' ')} ${contextText || ''}`

  // 1. Scale / Framing (景别)
  let scale = ''
  if (/大特写|极特写/i.test(combined)) scale = '大特写'
  else if (/特写|Close-up/i.test(combined)) scale = '特写'
  else if (/大远景/i.test(combined)) scale = '大远景'
  else if (/远景/i.test(combined)) scale = '远景'
  else if (/中远景/i.test(combined)) scale = '中远景'
  else if (/中近景/i.test(combined)) scale = '中近景'
  else if (/中景|Medium/i.test(combined)) scale = '中景'
  else if (/全景|Wide/i.test(combined)) scale = '全景'
  else scale = '中景'

  // 2. Device / Rig (机位设备)
  let device = ''
  if (/车载|车内|车侧/i.test(combined)) device = '车载机位'
  else if (/航拍|无人机/i.test(combined)) device = '航拍机位'
  else if (/云台/i.test(combined)) device = '云台机位'
  else if (/固定|三脚架/i.test(combined)) device = '固定机位'
  else if (/手机|手持/i.test(combined)) device = '智能手机手持'
  else device = '智能手机手持'

  // 3. Angle (拍摄视角)
  let angle = ''
  if (/微俯|轻微俯视/i.test(combined)) angle = '微俯视'
  else if (/俯视|俯角|俯拍/i.test(combined)) angle = '俯视'
  else if (/低角|仰视|仰角|仰拍/i.test(combined)) angle = '仰视'
  else if (/顶视|鸟瞰/i.test(combined)) angle = '顶视'
  else if (/平视|平拍/i.test(combined)) angle = '平视'
  else angle = '平视'

  // 4. Motion (运镜方式)
  let motion = ''
  if (/微动/i.test(combined)) motion = '手持微动'
  else if (/平移|横摇/i.test(combined)) motion = '手持平移'
  else if (/推拉|慢速推拉|推进|拉出/i.test(combined)) motion = '慢速推拉'
  else if (/摇镜|快摇/i.test(combined)) motion = '快速摇镜'
  else if (/跟随/i.test(combined)) motion = '跟随镜头'
  else if (/固定/i.test(combined) && device === '固定机位') motion = '固定镜头'
  else motion = '手持微动'

  return [scale, device, angle, motion]
}

/**
 * Normalizes seconds into mm:ss format.
 * @param {number} sec
 * @returns {string}
 */
export function formatTime(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Format a shot range string like "0:03 - 0:04".
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function formatTimeRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`
}

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
  const lines = shots
    .map((s) => {
      const speech = s.speech || ''
      const time = s.time_range || `${s.start_seconds || 0}s`
      return speech ? `${time} ${speech}` : null
    })
    .filter(Boolean)
  if (lines.length > 0) return lines.join('\n\n')
  return shots
    .map((s, idx) => {
      const label = s.time_range || `分镜 ${idx + 1}`
      const desc = s.description || ''
      return `${label} ${desc}`
    })
    .join('\n\n')
}

/**
 * Extract time column and parsed seconds from table row columns.
 */
function extractTimeRange(cols) {
  for (const col of cols) {
    const m = col.match(/(?:(\d+):)?(\d+)\s*[-~至到]\s*(?:(\d+):)?(\d+)/)
    if (!m) continue

    const hasMinute1 = m[1] !== undefined
    const hasMinute2 = m[3] !== undefined
    if (hasMinute1 || hasMinute2) {
      const m1 = hasMinute1 ? parseInt(m[1], 10) : 0
      const s1 = parseInt(m[2], 10)
      const m2 = hasMinute2 ? parseInt(m[3], 10) : 0
      const s2 = parseInt(m[4], 10)
      return { timeCol: col, startSec: m1 * 60 + s1, endSec: m2 * 60 + s2 }
    }

    return { timeCol: col, startSec: parseInt(m[2], 10), endSec: parseInt(m[4], 10) }
  }
  return { timeCol: '', startSec: 0, endSec: 0 }
}

/**
 * Extract speech dialogue from description text if embedded.
 */
function extractSpeechFromDesc(text) {
  if (!text) return { cleanText: '', speech: '' }
  const m = text.match(/(?:台词|口播|字幕|语音|Speech|Dialogue)[:：]\s*([^\n]+)/i)
    || text.match(/[☊\u260a]\s*([^\n]+)/)
  if (!m) return { cleanText: text, speech: '' }
  return { cleanText: text.replace(m[0], '').trim(), speech: m[1].trim() }
}

/**
 * Infer camera tags from multiple candidate column strings.
 */
function inferCameraTags(candidates) {
  const tags = []
  const addTag = (t) => { if (!tags.includes(t)) tags.push(t) }
  for (const candidate of candidates) {
    if (!candidate) continue
    for (const rule of CAMERA_TAG_RULES) {
      if (rule.match(candidate)) addTag(rule.tag)
    }
  }
  return tags.length > 0 ? tags : [...DEFAULT_CAMERA_TAGS]
}

/**
 * Infer narrative stage from seconds.
 */
function inferStageFromSeconds(startSec, endSec) {
  if (startSec === 0 || endSec <= 3) return 'Hook'
  if (endSec > 12) return 'Demo Scene'
  if (startSec >= 7) return 'Usage Detail'
  return 'Product Intro'
}

function resolveStructuredSpeechAndDesc(cols) {
  let speech = ''
  let desc = ''
  if (cols.length >= 6) {
    const isFirstDesc = cols[4].length > 35 || /^(Hold on|Surprise|随着|男子|室内|镜头|门外)/i.test(cols[5])
    desc = isFirstDesc ? cols[4] || '' : cols[5] || ''
    speech = isFirstDesc ? cols[5] || '' : cols[4] || ''
  } else {
    desc = cols[4] || cols[3] || ''
  }

  speech = speech.replace(SPEECH_PREFIX_REGEX, '').trim()
  if (speech.startsWith('☊')) speech = speech.slice(1).trim()

  if (!speech && desc) {
    const extracted = extractSpeechFromDesc(desc)
    speech = extracted.speech
    desc = extracted.cleanText
  }
  return { speech, desc }
}

function normalizeStructuredTitleAndTags(rawTitle, stageCol, tagsCol, desc) {
  let title = rawTitle
  const tags = canonicalizeCameraTags(tagsCol, `${rawTitle} ${desc}`)

  if (SHOT_TYPE_REGEX.test(title.trim())) {
    title = desc && !MOTION_WORD_REGEX.test(desc.trim()) ? desc.slice(0, 20) : `${stageCol} 核心呈现`
  }
  let finalDesc = desc
  if (MOTION_WORD_REGEX.test(desc.trim()) || !desc) {
    finalDesc = `${title}，镜头结合${tags.slice(0, 3).join('、')}，细腻展现画面细节与核心动作。`
  }
  return { title, tags, desc: finalDesc }
}

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

function normalizeLegacyTitleAndDesc(visualCol, actionCol, extraCol, stage, tags, shotIndex) {
  const isShotTypeWord = SHOT_TYPE_REGEX.test(visualCol.trim())
  const isMotionWord = MOTION_WORD_REGEX.test(actionCol.trim())
  let title = visualCol
  let desc = actionCol

  if (isShotTypeWord || !title) {
    if (actionCol && !isMotionWord && !isShotTypeWord) {
      title = actionCol.slice(0, 20)
      desc = extraCol || `${title}，镜头采用${tags.slice(0, 3).join('、')}，细腻展现关键细节与核心动作。`
    } else {
      const stageName = STAGE_NAME_MAP[stage] || stage
      title = `${stageName} (${shotIndex})`
      desc = extraCol && !isMotionWord ? extraCol : `${title}，画面结合${tags.slice(0, 3).join('、')}呈现生动的细节与核心动作。`
    }
  } else if (isMotionWord || !desc || desc === '固定') {
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

function parseLegacyShotRow(cols, timeCol, shotIndex, timeInfo) {
  const descCols = cols.filter((c) => c !== timeCol && !/^\d+$/.test(c))
  let visualCol = descCols[0] || ''
  let actionCol = descCols[1] || ''
  let extraCol = descCols[2] || ''

  if (CUT_INDEX_REGEX.test(visualCol.trim())) {
    visualCol = descCols[1] || ''
    actionCol = descCols[2] || ''
    extraCol = descCols[3] || ''
  }

  const tags = canonicalizeCameraTags([visualCol, actionCol, extraCol])
  const rawStage = inferStageFromSeconds(timeInfo.startSec, timeInfo.endSec)
  const stage = mapToCanonicalStage(rawStage, shotIndex - 1)
  const normalized = normalizeLegacyTitleAndDesc(visualCol, actionCol, extraCol, stage, tags, shotIndex)

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
 * Parse markdown table from video_analyze into structured shots.
 */
export function parseShotsFromAnalyzeMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.includes('|')) return []
  const lines = markdown.split('\n')
  const shots = []
  let tableStarted = false
  let hasStageHeader = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue

    if (!tableStarted) {
      const isHeader = line.includes('时间') || line.includes('画面') || line.includes('镜头')
      if (isHeader) {
        tableStarted = true
        hasStageHeader = line.includes('阶段') || line.includes('Stage')
      }
      continue
    }

    if (line.includes('---')) continue

    const cols = line.split('|').map((c) => c.trim()).filter((_c, i, a) => i > 0 && i < a.length - 1)
    if (cols.length < 2) continue

    const timeInfo = extractTimeRange(cols)
    const nextIndex = shots.length + 1
    const isStageKeyword = cols[2] && STAGE_KEYWORD_REGEX.test(cols[2].trim())
    const isStructured = cols.length >= 4 && (hasStageHeader || isStageKeyword)

    if (isStructured) {
      shots.push(parseStructuredShotRow(cols, nextIndex, timeInfo))
    } else {
      shots.push(parseLegacyShotRow(cols, timeInfo.timeCol, nextIndex, timeInfo))
    }
  }

  return shots
}

const SECTION_MATCH_RULES = [
  {
    stage: 'Hook',
    regex: /(?:\[0-3秒\]\s*黄金钩子|Hook|黄金钩子)[^\n:]*[:：]?\s*([^\n]+)/i,
    clean: (m) => m[1].trim().replace(/^>\s*/, '').replace(/\*+/g, ''),
  },
  {
    stage: 'Product Intro',
    regex: /##\s*I\.\s*核心目标[^\n]*\n+([\s\S]*?)(?=\n##\s*II|$)/i,
    clean: (m) => m[1].trim().replace(/\*+/g, ''),
  },
  {
    stage: 'Usage Detail',
    regex: /##\s*III\.\s*叙事分析[^\n]*\n+([\s\S]*?)(?=\n##\s*IV|$)/i,
    clean: (m) => m[1].trim().replace(/\*+/g, ''),
  },
  {
    stage: 'Demo Scene',
    regex: /##\s*IV\.\s*画面分析[^\n]*\n+([\s\S]*?)(?=\n##\s*V|$)/i,
    clean: (m) => m[1].replace(/\|[\s\S]*$/, '').trim().replace(/\*+/g, ''),
  },
]

/**
 * Extract structured narrative stages from 5D markdown.
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

function extractStagesFromHeaders(markdown) {
  const structure = []
  const stageSectionMatch = markdown.match(/##\s*(?:\d+[\.\s、]*)?结构阶段解构[\s\S]*?(?=\n##\s*(?:\d+[\.\s、]*)?(?:逐镜头|分镜)|$)/i)
  const stageBlockText = stageSectionMatch ? stageSectionMatch[0] : markdown

  const stageRegex = /###\s*([^\n]+)\n+([\s\S]*?)(?=\n###|\n##|$)/g
  let match = stageRegex.exec(stageBlockText)
  let idx = 0
  while (match !== null) {
    const rawHeading = match[1].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim()
    const descText = match[2].replace(/\|[\s\S]*$/, '').replace(/```[\s\S]*?```/g, '').trim().replace(/\*+/g, '')

    if (rawHeading && descText) {
      if (METADATA_HEADING_REGEX.test(rawHeading)) {
        const subMatch = descText.match(/###?\s*([A-Za-z\s]+|[^\n]+)\n+([\s\S]*)/)
        if (subMatch && !METADATA_HEADING_REGEX.test(subMatch[1].trim())) {
          const canonicalStage = mapToCanonicalStage(subMatch[1].trim(), idx)
          if (canonicalStage && !METADATA_HEADING_REGEX.test(canonicalStage)) {
            structure.push({ stage: canonicalStage, title: canonicalStage, description: subMatch[2].trim() })
            idx++
          }
        }
      } else {
        const canonicalStage = mapToCanonicalStage(rawHeading, idx)
        if (canonicalStage && !METADATA_HEADING_REGEX.test(canonicalStage)) {
          structure.push({ stage: canonicalStage, title: canonicalStage, description: descText })
          idx++
        }
      }
    }
    match = stageRegex.exec(stageBlockText)
  }
  return structure
}

function extractStagesFromChineseList(markdown) {
  const structure = []
  const listStageRegex = /(?:[\*\-\s]*)(?:第[一二三四五六七八九十\d]+阶段|阶段[一二三四五六七八九十\d]+|[一二三四五六七八九十\d]+[、\.\s]+)\s*[:：]?\s*([^\n（(：:\*]+)(?:[（(][^\n）)]+[）)])?\s*\n+([\s\S]*?)(?=(?:[\*\-\s]*(?:第[一二三四五六七八九十\d]+阶段|阶段[一二三四五六七八九十\d]+|[一二三四五六七八九十\d]+[、\.\s]+))|\n##|二、|三、|---|$)/g
  let match = listStageRegex.exec(markdown)
  let idx = 0
  while (match !== null) {
    const stageName = match[1].trim()
    const stageDesc = match[2].trim().replace(/\|[\s\S]*$/, '').replace(/\*+/g, '')
    if (stageName && stageDesc && !METADATA_HEADING_REGEX.test(stageName)) {
      const canonicalStage = mapToCanonicalStage(stageName, idx)
      if (canonicalStage && !METADATA_HEADING_REGEX.test(canonicalStage)) {
        structure.push({ stage: canonicalStage, title: canonicalStage, description: stageDesc })
        idx++
      }
    }
    match = listStageRegex.exec(markdown)
  }
  return structure
}

function enrichShotsFromStructure(shots, structure) {
  if (shots.length === 0 || structure.length === 0) return
  for (const shot of shots) {
    const isShort = !shot.description || shot.description.length <= 15
    const isMeta = /^[A-Za-z0-9\s·\(\)]+$/.test(shot.description || '')
    if (isShort || isMeta) {
      const matched = structure.find((st) => st.stage === shot.stage) || structure[0]
      if (matched?.description) {
        shot.description = `${shot.title}。${matched.description.slice(0, 80)}`
      }
    }
  }
}

/**
 * Parse two-step narrative structure & pipeline from dedicated structure breakdown markdown.
 */
export function parsePipelineAndStructureFromMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { pipeline: [], structure: [], shots: [] }
  }

  let structure = extractStagesFromHeaders(markdown)
  if (structure.length === 0) {
    structure = extractStagesFromChineseList(markdown)
  }
  if (structure.length === 0) {
    const legacy = parseStructureFromAnalyzeMarkdown(markdown)
    if (legacy.length > 0) {
      structure.push(...legacy)
    }
  }

  // Filter out any metadata headings and unpack embedded sub-headings if present
  const cleanedStructure = []
  const seenStages = new Set()

  for (const item of structure) {
    let stage = item.stage || item.title || ''
    let desc = item.description || ''

    if (METADATA_HEADING_REGEX.test(stage)) {
      const m = desc.match(/###?\s*([A-Za-z\s]+|[^\n]+)\n+([\s\S]*)/)
      if (m && !METADATA_HEADING_REGEX.test(m[1].trim())) {
        stage = mapToCanonicalStage(m[1].trim(), cleanedStructure.length)
        desc = m[2].trim()
      } else {
        continue
      }
    }

    if (!stage || seenStages.has(stage) || METADATA_HEADING_REGEX.test(stage)) {
      continue
    }

    seenStages.add(stage)
    cleanedStructure.push({
      stage,
      title: stage,
      description: desc,
    })
  }

  structure = cleanedStructure

  // Pipeline strictly 1:1 mirrors the extracted structure stages
  let pipeline = []
  if (structure.length > 0) {
    pipeline = structure.map((s) => s.stage)
  } else {
    const pipelineMatch = markdown.match(/##\s*1\.\s*叙事结构链路[^\n]*\n+([^\n]+)/i)
      || markdown.match(/(?:Narrative Pipeline|结构链路|叙事链路|流程链路)[^\n:]*[:：]?\s*\n*([^\n]+)/i)
    if (pipelineMatch && pipelineMatch[1]) {
      pipeline = pipelineMatch[1]
        .split(/[→\->\>]/)
        .map((s, idx) => mapToCanonicalStage(s.replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, ''), idx))
        .filter((s) => Boolean(s) && !METADATA_HEADING_REGEX.test(s))
    }
  }

  const shots = parseShotsFromAnalyzeMarkdown(markdown)
  enrichShotsFromStructure(shots, structure)

  return { pipeline, structure, shots }
}
