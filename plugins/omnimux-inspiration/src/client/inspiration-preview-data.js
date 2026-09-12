import {
  formatInspirationDate,
  formatTimecode,
  parseDurationSeconds,
  segmentsFromTimecodeLines,
} from '../structure-script.js'

function text(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Parse markdown analysis text into structured Level-2 items and Level-3 descriptions.
 * Separates section headers, key-value labels and bullet descriptions.
 */
export function parseDocAnalysis(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return []
  const lines = rawValue.split('\n').map((l) => l.trim()).filter(Boolean)
  const groups = []
  let currentGroup = null

  for (const rawLine of lines) {
    if (/^\|?\s*[-:]+[-| :]+\|?$/.test(rawLine)) continue

    const headerMatch = rawLine.match(/^#{2,4}\s+(.+)$/)
    if (headerMatch) {
      currentGroup = { title: headerMatch[1].replace(/[*_]{2}/g, '').trim(), entries: [] }
      groups.push(currentGroup)
      continue
    }

    const bracketMatch = rawLine.match(/^([【\[][^】\]]+[】\]])\s*(.*)$/)
    if (bracketMatch && !rawLine.startsWith('*') && !rawLine.startsWith('-')) {
      currentGroup = { title: bracketMatch[1], entries: [] }
      groups.push(currentGroup)
      if (bracketMatch[2]) {
        currentGroup.entries.push({ type: 'desc', text: bracketMatch[2].replace(/[*_]{2}/g, '').trim() })
      }
      continue
    }

    const keyValMatch = rawLine.match(/^[•·*-]?\s*[*_]{2}(.+?)[*_]{2}[:：]\s*(.*)$/)
    if (keyValMatch) {
      const label = keyValMatch[1].trim()
      const desc = keyValMatch[2].replace(/[*_]{2}/g, '').trim()
      if (!currentGroup) {
        currentGroup = { title: '', entries: [] }
        groups.push(currentGroup)
      }
      currentGroup.entries.push({ type: 'labeled', label, desc })
      continue
    }

    const colonMatch = rawLine.match(/^[•·*-]?\s*([^\s:：]{2,16})[:：]\s*(.*)$/)
    if (colonMatch && !rawLine.includes('http://') && !rawLine.includes('https://') && !colonMatch[1].toLowerCase().includes('pov') && !colonMatch[1].includes('00:')) {
      const label = colonMatch[1].trim()
      const desc = colonMatch[2].replace(/[*_]{2}/g, '').trim()
      if (!currentGroup) {
        currentGroup = { title: '', entries: [] }
        groups.push(currentGroup)
      }
      currentGroup.entries.push({ type: 'labeled', label, desc })
      continue
    }

    const cleanText = rawLine.replace(/^[•·*-]\s*/, '').replace(/[*_]{2}/g, '').trim()
    if (!cleanText) continue

    const isHeaderLike = !cleanText.endsWith('。') && !cleanText.endsWith('.') && !cleanText.endsWith(';') &&
      cleanText.length <= 36 &&
      (cleanText.includes('(') || cleanText.includes('（') || cleanText.includes('/') || (!cleanText.includes('，') && !cleanText.includes(',')))

    if (isHeaderLike && !rawLine.startsWith('*') && !rawLine.startsWith('-') && !rawLine.startsWith('•')) {
      currentGroup = { title: cleanText, entries: [] }
      groups.push(currentGroup)
      continue
    }

    if (!currentGroup) {
      currentGroup = { title: '', entries: [] }
      groups.push(currentGroup)
    }
    currentGroup.entries.push({ type: 'desc', text: cleanText })
  }
  return groups
}

/**
 * Convert common Markdown list and emphasis markers into readable plain text.
 * The preview intentionally keeps raw Markdown available behind the raw toggle,
 * while rendered breakdown content stays free of formatting syntax.
 */
export function renderPlainBreakdownText(value) {
  return text(value)
    .replace(/(^|\n)[ \t]*(?:#{1,6})[ \t]*/g, '$1')
    .replace(/(^|\n)[ \t]*(?:[*-]|\d+[.)])[ \t]+/g, '$1· ')
    .replace(/[*_]{2}/g, '')
    .replace(/(^|\n)[ \t]*>[ \t]?/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function analysisOf(item) {
  if (item.analysis && typeof item.analysis === 'object') return item.analysis
  if (item.deconstruction && typeof item.deconstruction === 'object') return item.deconstruction
  return {}
}

function collectSegments(item, analysis, script) {
  const raw = Array.isArray(analysis.segments) ? analysis.segments : (Array.isArray(item.segments) ? item.segments : [])
  const normalized = raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null
      const value = text(row.text)
      if (!value) return null
      const start = parseDurationSeconds(row.start)
      const end = parseDurationSeconds(row.end)
      return {
        id: text(row.id) || `seg_${index + 1}`,
        start,
        end,
        text: value,
        section: text(row.section),
        startLabel: start == null ? '' : formatTimecode(start),
      }
    })
    .filter(Boolean)
  if (normalized.length) return normalized
  return segmentsFromTimecodeLines(script).map((row) => ({
    ...row,
    startLabel: row.start == null ? '' : formatTimecode(row.start),
  }))
}

function collectSections(analysis) {
  const raw = Array.isArray(analysis.sections) ? analysis.sections : []
  return raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null
      const title = text(row.title)
      const analysisText = text(row.analysis)
      const quote = text(row.quote)
      if (!title && !analysisText && !quote) return null
      return {
        id: text(row.id) || `sec_${index + 1}`,
        title: title || `Section ${index + 1}`,
        quote,
        analysis: analysisText,
        source_segment_ids: Array.isArray(row.source_segment_ids)
          ? row.source_segment_ids.filter((id) => typeof id === 'string' && id)
          : [],
      }
    })
    .filter(Boolean)
}

export function getInspirationPreviewData(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {}
  const analysis = analysisOf(safeItem)
  const content = text(safeItem.content)
  const caption = text(safeItem.caption) || text(safeItem.description)
  const narrative = text(analysis.narrative_strategy) || text(analysis.narrative)
  const script = content || narrative || caption
  const creator = (analysis.creator && typeof analysis.creator === 'object')
    ? analysis.creator
    : (safeItem.author && typeof safeItem.author === 'object' ? safeItem.author : {})
  const stats = safeItem.stats && typeof safeItem.stats === 'object' ? safeItem.stats : {}
  const durationSeconds = parseDurationSeconds(safeItem.duration)
    ?? parseDurationSeconds(analysis.duration)
    ?? parseDurationSeconds(stats.duration)
    ?? parseDurationSeconds(stats.video_duration)
  const segments = collectSegments(safeItem, analysis, script)
  const translation = safeItem.script_translation && typeof safeItem.script_translation === 'object'
    ? safeItem.script_translation
    : {}
  return {
    safeItem,
    analysis,
    title: String(safeItem.title || analysis.video_name || '灵感详情'),
    script,
    caption,
    durationSeconds,
    durationLabel: durationSeconds == null ? '' : formatTimecode(durationSeconds),
    platform: text(safeItem.platform) || text(safeItem.source_platform),
    creator,
    stats,
    createdAt: formatInspirationDate(text(safeItem.created_at)),
    publishedAt: formatInspirationDate(text(safeItem.published_at)),
    favoritedAt: formatInspirationDate(text(safeItem.favorited_at)),
    isFavorite: Boolean(safeItem.is_favorite),
    hook: text(analysis.hook_highlight) || text(analysis.hook) || text(analysis['3s_hook']),
    targetGoal: text(analysis.target_goal) || text(analysis.goal),
    narrative,
    visual: text(analysis.visual_breakdown) || text(analysis.breakdown) || text(analysis.content_breakdown),
    replication: text(analysis.replication_action) || text(analysis.replication_guide),
    rawMarkdown: text(analysis.markdown) || text(analysis.raw_markdown) || (typeof safeItem.deconstruction === 'string' ? safeItem.deconstruction : ''),
    tags: Array.isArray(safeItem.tags) ? safeItem.tags : [],
    segments,
    hasTimecodes: segments.some((row) => row.start != null),
    segmentCount: segments.length,
    sections: collectSections(analysis),
    translationText: text(translation.text),
    translationLang: text(translation.lang),
    translationSegments: Array.isArray(translation.segments) ? translation.segments : [],
    analyzedAt: formatInspirationDate(text(analysis.analyzed_at)),
  }
}

export function hasDeconstruction(data) {
  return Boolean(data && (
    data.hook
    || data.targetGoal
    || data.narrative
    || data.visual
    || data.replication
    || data.rawMarkdown
    || (data.sections && data.sections.length)
  ))
}

/**
 * Whether the "analyze now" action can produce a breakdown.
 *
 * A breakdown needs a video stream, so a degraded import (`link` / `image`, the
 * shape produced when no direct video link was resolved) must not offer the
 * action at all — it would only ever answer 422. Video items keep it: they may
 * already hold a local file, or `handleAnalyze` re-resolves the stream from
 * `source_url`, which is how cloud-catalog items are analyzed.
 * @param {unknown} item raw inspiration row
 * @returns {boolean}
 */
export function canAnalyzeInspiration(item) {
  const row = item && typeof item === 'object' ? item : {}
  if (text(row.type) !== 'video') return false
  return Boolean(text(row.local_paths?.video) || text(row.source_url))
}

export function scriptCopyText(data, translated) {
  if (translated && data.translationText) return data.translationText
  if (data.segments?.length) {
    return data.segments.map((row) => (row.startLabel ? `${row.startLabel}  ${row.text}` : row.text)).join('\n')
  }
  return data.script || ''
}

export function deconstructionCopyText(data) {
  if (data.sections?.length) {
    return data.sections.map((section) => {
      const quote = section.quote ? `\n> ${section.quote}` : ''
      return `## ${section.title}${quote}\n${section.analysis}`.trim()
    }).join('\n\n')
  }
  const blocks = [
    ['Hook', data.hook],
    ['Goal', data.targetGoal],
    ['Narrative', data.narrative],
    ['Visual', data.visual],
    ['Replication', data.replication],
  ].filter(([, value]) => value)
  if (blocks.length) return blocks.map(([title, value]) => `## ${title}\n${value}`).join('\n\n')
  return data.rawMarkdown || ''
}
