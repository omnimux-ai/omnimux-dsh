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

const CAMERA_TAG_RULES = [
  { match: (s) => s.includes('特写') || s.includes('Close-up'), tag: '特写' },
  { match: (s) => s.includes('大远景'), tag: '大远景' },
  { match: (s) => s.includes('远景'), tag: '远景' },
  { match: (s) => s.includes('中远景'), tag: '中远景' },
  { match: (s) => s.includes('中景') || s.includes('Medium'), tag: '中景' },
  { match: (s) => s.includes('全景') || s.includes('Wide'), tag: '全景' },
  { match: (s) => s.includes('手持') || s.includes('手机'), tag: '智能手机手持' },
  { match: (s) => s.includes('俯视'), tag: '俯视' },
  { match: (s) => s.includes('平视'), tag: '平视' },
  { match: (s) => s.includes('仰视'), tag: '仰视' },
  { match: (s) => s.includes('手持微动'), tag: '手持微动' },
  { match: (s) => s.includes('手持平移'), tag: '手持平移' },
  { match: (s) => s.includes('慢速推拉'), tag: '慢速推拉' },
  { match: (s) => s.includes('固定'), tag: '固定机位' },
]

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
  let tags = tagsCol.split(/[,，|、]/).map((t) => t.trim()).filter(Boolean)

  if (SHOT_TYPE_REGEX.test(title.trim())) {
    if (!tags.includes(title.trim())) tags.unshift(title.trim())
    title = desc && !MOTION_WORD_REGEX.test(desc.trim()) ? desc.slice(0, 20) : `${stageCol} 核心呈现`
  }
  let finalDesc = desc
  if (MOTION_WORD_REGEX.test(desc.trim()) || !desc) {
    finalDesc = `${title}，镜头结合${tags.slice(0, 3).join('、')}，细腻展现画面细节与核心动作。`
  }
  if (tags.length === 0) {
    tags = [...DEFAULT_CAMERA_TAGS]
  }
  return { title, tags, desc: finalDesc }
}

function parseStructuredShotRow(cols, shotIndex, timeInfo) {
  const initialTitle = cols[1] || `分镜 ${shotIndex}`
  const stageCol = cols[2].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim() || 'Product Intro'
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
    if (!tags.includes(visualCol.trim()) && visualCol.trim()) tags.unshift(visualCol.trim())
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

  const tags = inferCameraTags([visualCol, actionCol, extraCol])
  const stage = inferStageFromSeconds(timeInfo.startSec, timeInfo.endSec)
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

function extractStagesFromHeaders(markdown, pipeline) {
  const structure = []
  const stageSectionMatch = markdown.match(/##\s*2\.\s*结构阶段解构[\s\S]*?(?=\n##\s*3|$)/i)
  const stageBlockText = stageSectionMatch ? stageSectionMatch[0] : markdown

  const stageRegex = /###\s*([^\n]+)\n+([\s\S]*?)(?=\n###|\n##|$)/g
  let match = stageRegex.exec(stageBlockText)
  while (match !== null) {
    const rawHeading = match[1].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim()
    const descText = match[2].replace(/\|[\s\S]*$/, '').replace(/```[\s\S]*?```/g, '').trim().replace(/\*+/g, '')

    if (rawHeading && descText) {
      const stageKeyMatch = rawHeading.match(/^([a-zA-Z\s]+)/)
      const stageKey = stageKeyMatch ? stageKeyMatch[1].trim() : rawHeading
      structure.push({ stage: stageKey, title: stageKey, description: descText })
      if (!pipeline.includes(stageKey)) pipeline.push(stageKey)
    }
    match = stageRegex.exec(stageBlockText)
  }
  return structure
}

function extractStagesFromChineseList(markdown, pipeline) {
  const structure = []
  const listStageRegex = /(?:[\*\-\s]*)(?:第[一二三四五六七八九十\d]+阶段|阶段[一二三四五六七八九十\d]+|[一二三四五六七八九十\d]+[、\.\s]+)\s*[:：]?\s*([^\n（(：:\*]+)(?:[（(][^\n）)]+[）)])?\s*\n+([\s\S]*?)(?=(?:[\*\-\s]*(?:第[一二三四五六七八九十\d]+阶段|阶段[一二三四五六七八九十\d]+|[一二三四五六七八九十\d]+[、\.\s]+))|\n##|二、|三、|---|$)/g
  let match = listStageRegex.exec(markdown)
  while (match !== null) {
    const stageName = match[1].trim()
    const stageDesc = match[2].trim().replace(/\|[\s\S]*$/, '').replace(/\*+/g, '')
    if (stageName && stageDesc && !/^(叙事结构|逐镜头|分镜|核心目标)/.test(stageName)) {
      structure.push({ stage: stageName, title: stageName, description: stageDesc })
      if (!pipeline.includes(stageName)) pipeline.push(stageName)
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

  let pipeline = []
  const pipelineMatch = markdown.match(/##\s*1\.\s*叙事结构链路[^\n]*\n+([^\n]+)/i)
    || markdown.match(/(?:Narrative Pipeline|结构链路|叙事链路|流程链路)[^\n:]*[:：]?\s*\n*([^\n]+)/i)
  if (pipelineMatch && pipelineMatch[1]) {
    pipeline = pipelineMatch[1]
      .split(/[→\->\>]/)
      .map((s) => s.replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim())
      .filter((s) => Boolean(s) && !/^(第一阶段|第二阶段|第三阶段|第四阶段|阶段一|步骤一|第一步|第二步|叙事结构|第一部分)/.test(s))
  }

  let structure = extractStagesFromHeaders(markdown, pipeline)
  if (structure.length === 0) {
    structure = extractStagesFromChineseList(markdown, pipeline)
  }
  if (structure.length === 0) {
    const legacy = parseStructureFromAnalyzeMarkdown(markdown)
    if (legacy.length > 0) {
      structure.push(...legacy)
      if (pipeline.length === 0) pipeline = structure.map((s) => s.stage)
    }
  }

  if (structure.length > 0) {
    const validStages = Array.from(new Set(structure.map((s) => s.stage).filter(Boolean)))
    const isMeta = pipeline.length === 1 && /阶段|步骤|拆解|结构/i.test(pipeline[0])
    if (pipeline.length === 0 || isMeta) pipeline = validStages
  }

  const shots = parseShotsFromAnalyzeMarkdown(markdown)
  enrichShotsFromStructure(shots, structure)

  return { pipeline, structure, shots }
}
