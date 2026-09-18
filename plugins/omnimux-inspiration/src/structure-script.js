/**
 * Script / deconstruction structure helpers.
 * Never invent timecodes. Only keep start/end when the source provides a real number or mm:ss.
 */

/**
 * Clean subtitle/script speech line: strips template placeholders, html breaks, bold asterisks and prefixes.
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanScriptDisplay(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let text = raw.trim()
  text = text.replace(/<br\s*\/?>/gi, ' ')
  text = text.replace(/^[（(]?(?:Overlay|CTA\s+Banner|Audio|Text|Music|SFX|Voiceover|Visual|画面|口播)[)）]?\s*[:：]?\s*/i, '')
  text = text.replace(/\*\*/g, '')
  text = text.replace(/^["“”]+|["“”]+$/g, '')
  return text.trim()
}

export function parseDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const parts = trimmed.split(':').map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part))) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric) && numeric >= 0) return numeric
  return null
}

export function formatTimecode(seconds) {
  const value = parseDurationSeconds(seconds)
  if (value == null) return ''
  const total = Math.floor(value)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function formatInspirationDate(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parsePublishedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return parsePublishedAt(Number(trimmed))
    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  return ''
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalSeconds(raw, key) {
  if (!raw || raw[key] === undefined || raw[key] === null || raw[key] === '') return null
  return parseDurationSeconds(raw[key])
}

export function normalizeSegment(raw, index) {
  if (!raw || typeof raw !== 'object') return null
  const text = asText(raw.text)
  if (!text) return null
  return {
    id: asText(raw.id) || `seg_${index + 1}`,
    start: optionalSeconds(raw, 'start'),
    end: optionalSeconds(raw, 'end'),
    text,
    section: asText(raw.section),
  }
}

export function normalizeSection(raw, index) {
  if (!raw || typeof raw !== 'object') return null
  const title = asText(raw.title)
  const analysis = asText(raw.analysis)
  const quote = asText(raw.quote)
  if (!title && !analysis && !quote) return null
  const ids = Array.isArray(raw.source_segment_ids)
    ? raw.source_segment_ids.filter((id) => typeof id === 'string' && id)
    : []
  return {
    id: asText(raw.id) || `sec_${index + 1}`,
    title: title || `Section ${index + 1}`,
    quote,
    analysis,
    source_segment_ids: ids,
  }
}

function extractJsonObject(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(jsonText)
  } catch {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(jsonText.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function parseStructureJson(raw) {
  const obj = extractJsonObject(raw)
  if (!obj || typeof obj !== 'object') return { segments: [], sections: [] }
  const segments = Array.isArray(obj.segments)
    ? obj.segments.map((row, index) => normalizeSegment(row, index)).filter(Boolean)
    : []
  const sections = Array.isArray(obj.sections)
    ? obj.sections.map((row, index) => normalizeSection(row, index)).filter(Boolean)
    : []
  return { segments, sections }
}

export function parseTranslateJson(raw, fallbackText = '') {
  const obj = extractJsonObject(raw)
  if (!obj || typeof obj !== 'object') {
    return { text: typeof raw === 'string' ? raw.trim() : fallbackText, segments: [] }
  }
  const text = asText(obj.text) || fallbackText
  const segments = Array.isArray(obj.segments)
    ? obj.segments.map((row, index) => {
      const id = asText(row?.id) || `seg_${index + 1}`
      const value = asText(row?.text)
      return value ? { id, text: value } : null
    }).filter(Boolean)
    : []
  return { text, segments }
}

/**
 * Recognize existing mm:ss lines in caption/script. Do not invent timestamps.
 * A single coincidental timestamp is ignored.
 */
export function segmentsFromTimecodeLines(content) {
  if (typeof content !== 'string' || !content.trim()) return []
  const out = []
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s*$/)
    if (!match) continue
    out.push({
      id: `seg_${out.length + 1}`,
      start: parseDurationSeconds(match[1]),
      end: null,
      text: match[2],
      section: '',
    })
  }
  return out.length >= 2 ? out : []
}

export const STRUCTURE_SYSTEM = 'Return JSON only. Never invent timestamps. If the source has no mm:ss or numeric start/end, omit start and end. quote must be a verbatim substring of the source script or "".'

export function buildStructurePrompt({ content = '', markdown = '' }) {
  return `Extract a short-video script and deconstruction.
Return ONLY JSON:
{"segments":[{"id":"seg_1","start":null,"end":null,"text":"...","section":"hook"}],"sections":[{"id":"sec_hook","title":"Hook","quote":"...","analysis":"...","source_segment_ids":["seg_1"]}]}

Rules:
- start/end are seconds numbers ONLY when the source contains explicit timestamps; otherwise omit them.
- Do not fabricate 0:00 or start:0.
- quote must be copied from SOURCE CAPTION; if unsure use "".
- sections should cover rhetorical parts (Hook, mid, CTA, etc.).

SOURCE CAPTION:
${content || '(empty)'}

ANALYSIS MARKDOWN:
${markdown || '(empty)'}`
}

export function buildTranslatePrompt({ lang, source, segmentIds }) {
  return `Translate the following short-video script into ${lang}.
Return ONLY JSON: {"text":"...","segments":[{"id":"seg_1","text":"..."}]}
Keep the same segment ids if provided. Do not add timestamps.

SEGMENT IDS: ${JSON.stringify(segmentIds || [])}

SOURCE:
${source}`
}

/**
 * @param {{ execute: (args: object) => Promise<any> } | null | undefined} textComplete
 */
export async function extractScriptStructure(textComplete, { content = '', markdown = '' } = {}) {
  const fromLines = segmentsFromTimecodeLines(content)
  if (!textComplete || typeof textComplete.execute !== 'function') {
    return { segments: fromLines, sections: [] }
  }
  const result = await textComplete.execute({
    reason: 'inspiration-script-structure',
    system: STRUCTURE_SYSTEM,
    prompt: buildStructurePrompt({ content, markdown }),
    maxTokens: 1800,
  })
  const parsed = parseStructureJson(result?.text || result)
  return {
    segments: parsed.segments.length ? parsed.segments : fromLines,
    sections: parsed.sections,
  }
}
