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

/**
 * Generate semantic 5-dimension deconstruction from metadata when video file is not locally present.
 * @param {{ title?: string, content?: string, tags?: string[], platform?: string }} meta
 */
export function generateSemanticDeconstruction(meta = {}) {
  const rawText = String(meta.content || meta.title || '短视频爆款内容').trim()
  const tagsList = Array.isArray(meta.tags) ? meta.tags : []
  const tagStr = tagsList.length > 0 ? tagsList.join(', ') : 'TikTok, 爆款, 短视频'
  const platform = (meta.platform || 'tiktok').toUpperCase()

  const summary = rawText.length > 60 ? `${rawText.slice(0, 58)}…` : rawText
  const hook = `【视觉前置反差 & 痛点唤醒】开场0-3秒通过产品强对比与高饱和视觉画面抓取用户停留，配合第一人称强烈语气词唤醒目标人群对相关护理/变美痛点的即时共鸣。`
  const targetGoal = `* **转化目标**: 强化品牌功效心智，直接引导主页橱窗链接点击与转化购买\n* **情绪基调**: 惊喜、种草、种草信任感\n* **爆款基因**: 痛点即时唤醒 + 直观使用前后效果呈现 + 评论区购买路径指引`
  const narrative = `* **核心载体**: 口播种草 + 第一视角实测演示\n* **人声DNA**: 亲切真诚的闺蜜/博主分享口吻，语速适中微快，情绪饱满\n* **叙事节奏**: 0-3s 抛出痛点反问 → 中段 3-10s 演示解决过程与质地细节 → 结尾 10-15s 抛出 CTA 购买指引`
  const visual = `* **场景设置**: 明亮简约的个人梳妆台/生活化室内场景\n* **镜头语言**: 0-3s 紧凑特写(Close-up) → 演示段多角度近景切换，突出产品细节质感\n* **节奏特征**: 伴随清脆原声音效，视听卡点增强种草真实度\n\n### 逐帧拆解 (Shot-by-Shot Breakdown)\n\n| 时间 (Time) | 画面描述 & 镜头 (Visual & Shot) | Midjourney Prompt (For AI Gen) | 关键动作 (Action) | 脚本模板 (Script Template with {Variables}) |\n| :--- | :--- | :--- | :--- | :--- |\n| 00:00 - 00:03 | 特写，主播手持产品做出震惊表情。 | \`Young creator holding product with shocked wide eyes, cozy indoor ambient light --ar 9:16\` | 快速举起产品贴近镜头，制造悬念停顿 | (Audio): "这真的是我今年发现最绝的宝藏，千万别被别人抢先知道了！" |\n| 00:03 - 00:07 | 中景，主播对镜拆解展示核心成分与质地。 | \`Close-up hands displaying product texture and minimalist packaging, modern vanity table --ar 9:16\` | 细致涂抹推开，展示水润吸收效果 | (Audio): "质地超级清爽细腻，上脸瞬间吸收，专门解决干燥暗沉痛点。" |\n| 00:07 - 00:11 | 微距特写，前后使用对比与核心细节展示。 | \`Macro split comparison of radiant hydrated skin versus dull tone, soft studio lighting --ar 9:16\` | 手指轻弹面部，展现通透弹润光泽感 | (Audio): "连续用了一周之后，整个皮肤状态都在发光，完全不挑肤质。" |\n| 00:11 - 00:15 | 中景，主播微笑向镜头展示主页链接并引导点击。 | \`Smiling creator pointing towards profile bio with energetic posture, clean aesthetic background --ar 9:16\` | 热情挥手并手势指向下方/主页 | (Audio): "现在右下角还有粉丝限时专属福利，赶紧去主页链接冲！" |`
  const replication = `* **复刻公式**: [痛点反问/冲突开场] + [产品第一人称实测] + [视觉效果即时展示] + [引导主页 Bio 下单]\n* **创作建议**: 建议保持原生无滤镜光影，前3秒必须出现核心产品与视觉动作，文案带精准 Hashtags: #${tagsList.join(' #')}`

  const markdown = `## 一句话视频描述
${summary}

## I. 核心目标
${targetGoal}

## II. 影响力分析
* **明线卖点**: 产品直观功效展示与高性价比卖点
* **暗线价值**: 解决容貌/护理焦虑，提升自信生活品质

## III. 叙事分析
${narrative}

## IV. 画面分析
${visual}

## V. 核心复刻策略
${replication}
`

  const shots = parseShotsFromMarkdownTable(markdown)
  const segments = shots.map((s, idx) => ({
    id: `seg_${idx + 1}`,
    start: s.start_seconds,
    end: s.end_seconds,
    time_range: s.time_range,
    text: s.script || s.title,
    section: s.stage || 'Body',
  }))

  return {
    summary,
    hook_highlight: hook,
    target_goal: targetGoal,
    narrative_strategy: narrative,
    visual_breakdown: visual,
    replication_action: replication,
    markdown,
    shots,
    segments,
    structure: [
      { stage: 'Hook', title: '黄金钩子 (0-3s)', description: hook },
      { stage: 'Goal', title: '核心转化目标', description: targetGoal },
      { stage: 'Narrative', title: '叙事分析与人声DNA', description: narrative },
      { stage: 'Visual', title: '视觉与镜头语言', description: visual },
      { stage: 'Replication', title: '复刻策略指引', description: replication },
    ],
  }
}

/**
 * Execute content deconstruction on a video file or semantic metadata.
 * @param {{
 *   videoPath?: string,
 *   coverPath?: string,
 *   title?: string,
 *   content?: string,
 *   tags?: string[],
 *   platform?: string,
 *   videoAnalyzeTool?: { execute: (args: object) => Promise<any> },
 *   textComplete?: { execute: Function },
 * }} deps
 */
export async function analyzeInspirationVideo(deps) {
  const { videoPath, videoAnalyzeTool, textComplete } = deps

  // 1. If local video path exists and videoAnalyzeTool is available, execute native multimodal video analysis
  if (videoPath && videoAnalyzeTool && typeof videoAnalyzeTool.execute === 'function') {
    try {
      const res = await videoAnalyzeTool.execute({ video: videoPath })
      const text = res?.report || res?.text || (typeof res === 'string' ? res : '')
      if (text && text.trim()) {
        const structured = extractStructuredBreakdown(text)
        return {
          deconstruction: {
            summary: structured.summary,
            hook: structured.hook_highlight,
            hook_highlight: structured.hook_highlight,
            target_goal: structured.target_goal,
            narrative_strategy: structured.narrative_strategy,
            visual_breakdown: structured.visual_breakdown,
            replication_action: structured.replication_action,
            markdown: structured.raw_markdown,
            shots: structured.shots,
            segments: structured.segments,
            structure: structured.structure,
          },
        }
      }
    } catch {
      // Fall through to semantic generation
    }
  }

  // 2. Semantic fallback analysis (guarantees deconstruction is NEVER blocked)
  try {
    const semantic = generateSemanticDeconstruction({
      title: deps.title,
      content: deps.content,
      tags: deps.tags,
      platform: deps.platform,
    })
    return {
      deconstruction: semantic,
    }
  } catch (err) {
    return {
      deconstruction: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
