/**
 * Extract structured information and shot breakdown from the markdown report.
 * @param {string} markdown
 */
export function extractStructuredBreakdown(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return {
      summary: '',
      hook_highlight: '',
      target_goal: '',
      narrative_strategy: '',
      visual_breakdown: '',
      replication_action: '',
      raw_markdown: '',
      shots: [],
      segments: [],
      structure: [],
    }
  }

  // 1. One-sentence description
  let summary = ''
  const descMatch = markdown.match(/## 一句话视频描述[^\n]*\n+([\s\S]*?)(?=\n##|$)/)
  if (descMatch) {
    summary = descMatch[1].trim().replace(/^>\s*/, '')
  }

  // 2. Hook extraction
  let hook = ''
  const hookMatch = markdown.match(/\*?\*?\[0-3秒\]\s*黄金钩子[^\n]*\n+([\s\S]*?)(?=\n\s*\*?\*?\[中段\]|\n##|$)/i)
    || markdown.match(/##\s*III\.\s*叙事分析[\s\S]*?(?:Hook|黄金钩子)[^\n]*\n+([\s\S]*?)(?=\n###|\n##|$)/i)
    || markdown.match(/⚡\s*黄金\s*3\s*秒\s*HOOK[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
  if (hookMatch) {
    hook = hookMatch[1].trim().replace(/^>\s*/, '')
  }

  // 3. Global Goal & Virality
  let targetGoal = ''
  const goalMatch = markdown.match(/##\s*I\.\s*核心目标[^\n]*\n+([\s\S]*?)(?=\n##\s*II|$)/i)
    || markdown.match(/🎯\s*核心转化目标[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
  if (goalMatch) {
    targetGoal = goalMatch[1].trim()
  }

  // 4. Narrative Analysis
  let narrative = ''
  const narrativeMatch = markdown.match(/##\s*III\.\s*叙事分析[^\n]*\n+([\s\S]*?)(?=\n##\s*IV|$)/i)
    || markdown.match(/📖\s*叙事视角与脚本[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
  if (narrativeMatch) {
    narrative = narrativeMatch[1].trim()
  }

  // 5. Visual Analysis
  let visual = ''
  const visualMatch = markdown.match(/##\s*IV\.\s*画面分析[^\n]*\n+([\s\S]*?)(?=\n##\s*V|$)/i)
    || markdown.match(/🔍\s*画面与视听节奏[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
  if (visualMatch) {
    visual = visualMatch[1].trim()
  }

  // 6. Replication Strategy
  let replication = ''
  const repMatch = markdown.match(/##\s*V\.\s*核心复刻策略[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
    || markdown.match(/🚀\s*爆款复刻策略[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)
  if (repMatch) {
    replication = repMatch[1].trim()
  }

  // 7. Shot breakdown table parser
  const shots = parseShotsFromMarkdownTable(markdown)

  // 8. Segments from shots (audio/script transcription aligned with timeline)
  const segments = shots.map((shot, idx) => ({
    id: shot.id || `seg_${idx + 1}`,
    start: shot.start_seconds ?? null,
    end: shot.end_seconds ?? null,
    time_range: shot.time_range || '',
    text: shot.script || shot.title || `分镜 ${idx + 1}`,
    section: shot.stage || 'Body',
  }))

  return {
    summary: summary || '短视频灵感素材',
    hook_highlight: hook,
    target_goal: targetGoal,
    narrative_strategy: narrative,
    visual_breakdown: visual,
    replication_action: replication,
    raw_markdown: markdown,
    shots,
    segments,
    structure: [
      { stage: 'Hook', title: '黄金钩子 (0-3s)', description: hook },
      { stage: 'Goal', title: '核心转化目标', description: targetGoal },
      { stage: 'Narrative', title: '叙事分析与人声DNA', description: narrative },
      { stage: 'Visual', title: '视觉与镜头语言', description: visual },
      { stage: 'Replication', title: '复刻策略指引', description: replication },
    ].filter((s) => s.description),
  }
}

function parseTimeRangeSeconds(raw) {
  if (!raw) return { start: null, end: null, formatted: '' }
  const clean = String(raw).replace(/[\[\]()]/g, '').trim()
  const match = clean.match(/(\d{1,2})[:\-](\d{2})(?:\s*[-~至到]\s*(\d{1,2})[:\-](\d{2}))?/)
    || clean.match(/(\d{1,2})\s*[-~至到]\s*(\d{1,2})/)
  if (!match) return { start: null, end: null, formatted: clean }
  if (match[3] !== undefined && match[4] !== undefined) {
    const start = Number(match[1]) * 60 + Number(match[2])
    const end = Number(match[3]) * 60 + Number(match[4])
    return { start, end, formatted: `${match[1]}:${match[2]} - ${match[3]}:${match[4]}` }
  }
  const s = Number(match[1])
  const e = Number(match[2])
  return { start: s, end: e, formatted: `00:0${s} - 00:${e < 10 ? '0' + e : e}` }
}

function extractTagsFromText(text) {
  const tags = []
  const keywords = ['特写', '中景', '全景', '远景', '大特写', '平视', '俯视', '仰视', '手机手持', '手持微晃', '推镜头', '拉镜头', '甩镜头', '定焦', '近景']
  for (const kw of keywords) {
    if (text.includes(kw) && !tags.includes(kw)) {
      tags.push(kw)
    }
  }
  return tags.length ? tags : ['中景', '手持微晃']
}

/**
 * Parse shot-by-shot breakdown table from markdown.
 * Supports both standard OmniMux 5D table and Video Analyzer table headers.
 * @param {string} markdown
 * @returns {Array<object>}
 */
export function parseShotsFromMarkdownTable(markdown) {
  if (!markdown || !markdown.includes('|')) return []
  const lines = markdown.split('\n')
  const shots = []
  let inTable = false
  let headerCols = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line.startsWith('|') || !line.endsWith('|')) {
      if (inTable) break
      continue
    }
    const cols = line.slice(1, -1).split('|').map((c) => c.trim())
    if (!inTable) {
      // Check if this line looks like a header with time
      const isHeader = cols.some((c) => /时间|time/i.test(c))
      if (isHeader && i + 1 < lines.length && lines[i + 1].includes('---')) {
        inTable = true
        headerCols = cols
        i += 1 // skip separator
        continue
      }
    } else {
      if (cols.length < 2 || cols.every((c) => !c || /^:?-+:?$/.test(c))) continue
      const timeColIdx = headerCols.findIndex((c) => /时间|time/i.test(c))
      const visualColIdx = headerCols.findIndex((c) => /画面|visual|shot/i.test(c))
      const promptColIdx = headerCols.findIndex((c) => /prompt|midjourney|ai/i.test(c))
      const actionColIdx = headerCols.findIndex((c) => /动作|action/i.test(c))
      const scriptColIdx = headerCols.findIndex((c) => /脚本|台词|字幕|script|audio/i.test(c))
      const stageColIdx = headerCols.findIndex((c) => /阶段|stage/i.test(c))
      const tagColIdx = headerCols.findIndex((c) => /标签|tag/i.test(c))

      const rawTime = cols[timeColIdx >= 0 ? timeColIdx : 0] || ''
      const timeInfo = parseTimeRangeSeconds(rawTime)
      const rawVisual = cols[visualColIdx >= 0 ? visualColIdx : 1] || ''
      const rawPrompt = promptColIdx >= 0 ? cols[promptColIdx] : ''
      const rawAction = actionColIdx >= 0 ? cols[actionColIdx] : ''
      const rawScript = scriptColIdx >= 0 ? cols[scriptColIdx].replace(/^[（(]?(?:Audio|Text|Music|SFX)[)）]?\s*[:：]?\s*/i, '') : ''
      const rawStage = stageColIdx >= 0 ? cols[stageColIdx] : (shots.length === 0 ? 'Hook' : 'Body')
      const explicitTags = tagColIdx >= 0 ? cols[tagColIdx].split(/[,，、]/).map((t) => t.trim()).filter(Boolean) : []
      const tags = explicitTags.length ? explicitTags : extractTagsFromText(`${rawVisual} ${rawAction}`)

      const shotIndex = shots.length + 1
      shots.push({
        id: `shot_${shotIndex}`,
        time_range: timeInfo.formatted || `镜头 ${shotIndex}`,
        start_seconds: timeInfo.start,
        end_seconds: timeInfo.end,
        title: rawAction || rawVisual.slice(0, 30) || `分镜 ${shotIndex}`,
        stage: rawStage,
        tags,
        description: rawVisual,
        action: rawAction,
        script: rawScript,
        prompt: rawPrompt.replace(/^`+|`+$/g, ''),
      })
    }
  }

  return shots
}

/** Analyze an actual video through the registered tool; never invent observations. */
export async function analyzeInspirationVideo(deps) {
  if (deps.signal?.aborted) throw new DOMException('分析已取消', 'AbortError')
  if (!deps.videoPath || !deps.videoAnalyzeTool?.execute) {
    return { deconstruction: null, error: '视频分析能力未就绪', source: 'legacy_unknown', model: '' }
  }
  try {
    const response = await deps.videoAnalyzeTool.execute({ video: deps.videoPath, notes: deps.content || '' }, { signal: deps.signal })
    if (deps.signal?.aborted) throw new DOMException('分析已取消', 'AbortError')
    const markdown = response?.report || response?.text || ''
    if (response?.mode !== 'live' || typeof markdown !== 'string' || !markdown.trim()) {
      return { deconstruction: null, error: '视频分析未返回真实有效结果，请重试', source: 'legacy_unknown', model: '' }
    }
    const parsed = extractStructuredBreakdown(markdown)
    return {
      deconstruction: { ...parsed, hook: parsed.hook_highlight, markdown, source: 'live', model: response.model || '' },
      source: 'live', model: response.model || '',
    }
  } catch (error) {
    if (deps.signal?.aborted) throw new DOMException('分析已取消', 'AbortError')
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error
    return { deconstruction: null, error: error?.message || String(error), source: 'legacy_unknown', model: '' }
  }
}
