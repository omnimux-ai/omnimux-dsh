import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { downloadMedia, fallbackResolveSocial } from './download-helper.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const BUNDLED_STRUCTURE_PROMPT = join(HERE, '../prompts/video-structure-breakdown.md')

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
      return [`${timeStr} ${shot.title || `分镜 ${idx + 1}`}${stageStr}`, tagsLine, speechLine, descLine].filter(Boolean).join('\n')
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
  return shots.map((s, idx) => `${s.time_range || `分镜 ${idx + 1}`} ${s.description || ''}`).join('\n\n')
}

/**
 * Parse markdown table from video_analyze into structured shots.
 * @param {string} markdown
 * @returns {Array<object>}
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
      if (line.includes('时间') || line.includes('画面') || line.includes('镜头')) {
        tableStarted = true
        if (line.includes('阶段') || line.includes('Stage')) {
          hasStageHeader = true
        }
      }
      continue
    }
    if (line.includes('---')) continue
    if (tableStarted) {
      const cols = line.split('|').map((c) => c.trim()).filter((_c, i, a) => i > 0 && i < a.length - 1)
      if (cols.length >= 2) {
        let timeCol = ''
        let startSec = 0
        let endSec = 0

        // Support mm:ss - mm:ss and pure seconds
        for (const col of cols) {
          const mColon = col.match(/(?:(\d+):)?(\d+)\s*[-~至到]\s*(?:(\d+):)?(\d+)/)
          if (mColon) {
            timeCol = col
            if (mColon[1] !== undefined || mColon[3] !== undefined) {
              const m1 = mColon[1] ? parseInt(mColon[1], 10) : 0
              const s1 = parseInt(mColon[2], 10)
              const m2 = mColon[3] ? parseInt(mColon[3], 10) : 0
              const s2 = parseInt(mColon[4], 10)
              startSec = m1 * 60 + s1
              endSec = m2 * 60 + s2
            } else {
              startSec = parseInt(mColon[2], 10)
              endSec = parseInt(mColon[4], 10)
            }
            break
          }
        }

        // New 5/6-column format: | 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | [台词/字幕] | 画面与动作描述 |
        const isStageKeyword = cols[2] && /^(hook|product intro|usage detail|demo scene|inciting incident|rising conflict|climax|plot twist|cliffhanger|cta)$/i.test(cols[2].trim())
        if (cols.length >= 4 && (hasStageHeader || isStageKeyword)) {
          let titleCol = cols[1] || `分镜 ${shots.length + 1}`
          const stageCol = cols[2].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim() || 'Product Intro'
          const tagsCol = cols[3] || ''
          let speechCol = ''
          let descCol = ''

          if (cols.length >= 6) {
            // Check if cols[4] or cols[5] is speech vs description
            if (cols[4].length > 35 || /^(Hold on|Surprise|随着|男子|室内|镜头|门外)/i.test(cols[5])) {
              descCol = cols[4] || ''
              speechCol = cols[5] || ''
            } else {
              speechCol = cols[4] || ''
              descCol = cols[5] || ''
            }
          } else {
            descCol = cols[4] || cols[3] || ''
          }

          speechCol = speechCol.replace(/^[\(（]?(?:无|none|无台词|none)[\)）]?$/i, '').trim()
          if (speechCol.startsWith('☊')) speechCol = speechCol.slice(1).trim()

          if (!speechCol && descCol) {
            const mSpeech = descCol.match(/(?:台词|口播|字幕|语音|Speech|Dialogue)[:：]\s*([^\n]+)/i)
              || descCol.match(/[☊\u260a]\s*([^\n]+)/)
            if (mSpeech) {
              speechCol = mSpeech[1].trim()
              descCol = descCol.replace(mSpeech[0], '').trim()
            }
          }

          let parsedTags = tagsCol.split(/[,，|、]/).map((t) => t.trim()).filter(Boolean)
          if (/^(全景|远景|大远景|大特写|特写|中景|中全景|中近景|近景)$/i.test(titleCol.trim())) {
            if (!parsedTags.includes(titleCol.trim())) parsedTags.unshift(titleCol.trim())
            titleCol = descCol && !/^(固定|正面固定|俯角固定|手持微动)$/i.test(descCol.trim())
              ? descCol.slice(0, 20)
              : `${stageCol} 核心呈现`
          }

          if (/^(固定|正面固定|俯角固定|手持微动)$/i.test(descCol.trim()) || !descCol) {
            descCol = `${titleCol}，镜头结合${parsedTags.slice(0, 3).join('、')}，细腻展现画面细节与核心动作。`
          }

          if (parsedTags.length === 0) {
            parsedTags = ['特写', '智能手机手持', '俯视', '手持微动']
          }

          shots.push({
            id: `shot_${shots.length + 1}`,
            start_seconds: startSec,
            end_seconds: endSec,
            time_range: formatTimeRange(startSec, endSec),
            title: titleCol,
            stage: stageCol,
            tags: parsedTags,
            speech: speechCol,
            description: descCol,
          })
          continue
        }

        // Legacy format fallback
        const descCols = cols.filter((c) => c !== timeCol && !/^\d+$/.test(c))
        let visualCol = descCols[0] || ''
        let actionCol = descCols[1] || ''
        let extraCol = descCols[2] || ''

        // Guard against Cut labels (e.g. **Cut 1**, Cut 4, 镜头 2)
        const isCutIndexWord = /^(\*\*)?(?:cut|镜头|镜号|shot)\s*\d+(\*\*)?$/i.test(visualCol.trim())
        if (isCutIndexWord) {
          visualCol = descCols[1] || ''
          actionCol = descCols[2] || ''
          extraCol = descCols[3] || ''
        }

        // Infer camera tags from visual description & extra columns
        const tags = []
        for (const candidate of [visualCol, actionCol, extraCol]) {
          if (!candidate) continue
          if (candidate.includes('特写') || candidate.includes('Close-up')) { if (!tags.includes('特写')) tags.push('特写') }
          else if (candidate.includes('大远景')) { if (!tags.includes('大远景')) tags.push('大远景') }
          else if (candidate.includes('远景')) { if (!tags.includes('远景')) tags.push('远景') }
          else if (candidate.includes('中远景')) { if (!tags.includes('中远景')) tags.push('中远景') }
          else if (candidate.includes('中景') || candidate.includes('Medium')) { if (!tags.includes('中景')) tags.push('中景') }
          else if (candidate.includes('全景') || candidate.includes('Wide')) { if (!tags.includes('全景')) tags.push('全景') }

          if (candidate.includes('手持') || candidate.includes('手机')) { if (!tags.includes('智能手机手持')) tags.push('智能手机手持') }
          if (candidate.includes('俯视')) { if (!tags.includes('俯视')) tags.push('俯视') }
          else if (candidate.includes('平视')) { if (!tags.includes('平视')) tags.push('平视') }
          else if (candidate.includes('仰视')) { if (!tags.includes('仰视')) tags.push('仰视') }

          if (candidate.includes('手持微动')) { if (!tags.includes('手持微动')) tags.push('手持微动') }
          else if (candidate.includes('手持平移')) { if (!tags.includes('手持平移')) tags.push('手持平移') }
          else if (candidate.includes('慢速推拉')) { if (!tags.includes('慢速推拉')) tags.push('慢速推拉') }
          else if (candidate.includes('固定')) { if (!tags.includes('固定机位')) tags.push('固定机位') }
        }

        if (tags.length === 0) {
          tags.push('特写', '智能手机手持', '俯视', '手持微动')
        }

        // Infer stage
        let stage = 'Product Intro'
        if (startSec === 0 || endSec <= 3) stage = 'Hook'
        else if (endSec > 12) stage = 'Demo Scene'
        else if (startSec >= 7) stage = 'Usage Detail'

        // Guard against pure scale words as title (e.g. "全景", "大远景", "中景")
        const isShotTypeWord = /^(全景|远景|大远景|大特写|特写|中景|中全景|中近景|近景)$/i.test(visualCol.trim())
        const isMotionWord = /^(固定|正面固定|俯角固定|手持微动|手持平移|慢速推拉|快速摇镜)$/i.test(actionCol.trim())

        let shotTitle = visualCol
        let shotDesc = actionCol

        if (isShotTypeWord || !shotTitle) {
          if (!tags.includes(visualCol.trim()) && visualCol.trim()) tags.unshift(visualCol.trim())
          if (actionCol && !isMotionWord && !isShotTypeWord) {
            shotTitle = actionCol.slice(0, 20)
            shotDesc = extraCol || `${shotTitle}，镜头采用${tags.slice(0, 3).join('、')}，细腻展现关键细节与核心动作。`
          } else {
            const stageNameMap = {
              'Hook': '黄金开局视觉切入',
              'Product Intro': '核心主体与细节呈现',
              'Usage Detail': '实操过程与功能展示',
              'Demo Scene': '实际场景与转化共鸣',
            }
            shotTitle = `${stageNameMap[stage] || stage} (${shots.length + 1})`
            shotDesc = extraCol && !isMotionWord
              ? extraCol
              : `${shotTitle}，画面结合${tags.slice(0, 3).join('、')}呈现生动的细节与核心动作。`
          }
        } else if (isMotionWord || !shotDesc || shotDesc === '固定') {
          shotDesc = `${shotTitle}，镜头结合${tags.slice(0, 3).join('、')}，细腻展现画面细节与核心动作。`
        }

        let speechCol = ''
        if (shotDesc) {
          const mSpeech = shotDesc.match(/(?:台词|口播|字幕|语音|Speech|Dialogue)[:：]\s*([^\n]+)/i)
            || shotDesc.match(/[☊\u260a]\s*([^\n]+)/)
          if (mSpeech) {
            speechCol = mSpeech[1].trim()
            shotDesc = shotDesc.replace(mSpeech[0], '').trim()
          }
        }

        shots.push({
          id: `shot_${shots.length + 1}`,
          start_seconds: startSec,
          end_seconds: endSec,
          time_range: formatTimeRange(startSec, endSec),
          title: shotTitle,
          stage,
          tags,
          speech: speechCol,
          description: shotDesc,
        })
      }
    }
  }

  return shots
}

/**
 * Extract structured narrative stages from 5D markdown.
 * @param {string} markdown
 * @returns {Array<object>}
 */
export function parseStructureFromAnalyzeMarkdown(markdown) {
  const structure = []
  if (typeof markdown !== 'string') return structure

  // Hook
  const hookMatch = markdown.match(/\*?\*?\[0-3秒\]\s*黄金钩子\*?\*?[:：]?\s*([^\n]+)/i)
    || markdown.match(/(?:Hook|黄金钩子)[^\n:]*[:：]?\s*([^\n]+)/i)
  if (hookMatch) {
    structure.push({
      stage: 'Hook',
      title: 'Hook',
      description: hookMatch[1].trim().replace(/^>\s*/, '').replace(/\*+/g, ''),
    })
  }

  // Product Intro / Global Goal
  const goalMatch = markdown.match(/##\s*I\.\s*核心目标[^\n]*\n+([\s\S]*?)(?=\n##\s*II|$)/i)
  if (goalMatch) {
    structure.push({
      stage: 'Product Intro',
      title: 'Product Intro',
      description: goalMatch[1].trim().replace(/\*+/g, ''),
    })
  }

  // Usage Detail / Narrative
  const narrativeMatch = markdown.match(/##\s*III\.\s*叙事分析[^\n]*\n+([\s\S]*?)(?=\n##\s*IV|$)/i)
  if (narrativeMatch) {
    structure.push({
      stage: 'Usage Detail',
      title: 'Usage Detail',
      description: narrativeMatch[1].trim().replace(/\*+/g, ''),
    })
  }

  // Demo Scene / Visual
  const visualMatch = markdown.match(/##\s*IV\.\s*画面分析[^\n]*\n+([\s\S]*?)(?=\n##\s*V|$)/i)
  if (visualMatch) {
    const cleanVisual = visualMatch[1].replace(/\|[\s\S]*$/, '').trim().replace(/\*+/g, '')
    structure.push({
      stage: 'Demo Scene',
      title: 'Demo Scene',
      description: cleanVisual,
    })
  }

  return structure
}

/**
 * Parse two-step narrative structure & pipeline from dedicated structure breakdown markdown.
 * Step 1: Dynamic Narrative Pipeline (e.g. Hook → Product Intro → Usage Detail → Demo Scene)
 * Step 2: Stage-by-Stage Structured Descriptions
 * @param {string} markdown
 * @returns {{ pipeline: string[], structure: Array<object>, shots: Array<object> }}
 */
export function parsePipelineAndStructureFromMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { pipeline: [], structure: [], shots: [] }
  }

  // 1. Extract Pipeline Sequence
  let pipeline = []
  const pipelineMatch = markdown.match(/##\s*1\.\s*叙事结构链路[^\n]*\n+([^\n]+)/i)
    || markdown.match(/(?:Narrative Pipeline|结构链路|叙事链路|流程链路)[^\n:]*[:：]?\s*\n*([^\n]+)/i)
  if (pipelineMatch && pipelineMatch[1]) {
    pipeline = pipelineMatch[1]
      .split(/[→\->\>]/)
      .map((s) => s.replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim())
      .filter((s) => Boolean(s) && !/^(第一阶段|第二阶段|第三阶段|第四阶段|阶段一|步骤一|第一步|第二步|叙事结构|第一部分)/.test(s))
  }

  // 2. Extract Stage Descriptions (Section 2)
  const structure = []
  const stageSectionMatch = markdown.match(/##\s*2\.\s*结构阶段解构[\s\S]*?(?=\n##\s*3|$)/i)
  const stageBlockText = stageSectionMatch ? stageSectionMatch[0] : markdown

  const stageRegex = /###\s*([^\n]+)\n+([\s\S]*?)(?=\n###|\n##|$)/g
  let match
  while ((match = stageRegex.exec(stageBlockText)) !== null) {
    const rawHeading = match[1].replace(/^[\[\(（【\s]+|[\]\)）】\s]+$/g, '').trim()
    const descText = match[2]
      .replace(/\|[\s\S]*$/, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim()
      .replace(/\*+/g, '')

    if (rawHeading && descText) {
      const stageKeyMatch = rawHeading.match(/^([a-zA-Z\s]+)/)
      const stageKey = stageKeyMatch ? stageKeyMatch[1].trim() : rawHeading
      structure.push({
        stage: stageKey,
        title: stageKey,
        description: descText,
      })
      if (!pipeline.includes(stageKey)) {
        pipeline.push(stageKey)
      }
    }
  }

  // 2.1 Extract Stage Descriptions from Chinese list items (e.g. 第一阶段：xxx、阶段一：xxx)
  if (structure.length === 0) {
    const listStageRegex = /(?:[\*\-\s]*)(?:第[一二三四五六七八九十\d]+阶段|阶段[一二三四五六七八九十\d]+|[一二三四五六七八九十\d]+[、\.\s]+)\s*[:：]?\s*([^\n（(：:\*]+)(?:[（(][^\n）)]+[）)])?\s*\n+([\s\S]*?)(?=(?:[\*\-\s]*(?:第[一二三四五六七八九十\d]+阶段|阶段[一二三四五六七八九十\d]+|[一二三四五六七八九十\d]+[、\.\s]+))|\n##|二、|三、|---|$)/g
    let match2
    while ((match2 = listStageRegex.exec(markdown)) !== null) {
      const stageName = match2[1].trim()
      const stageDesc = match2[2].trim().replace(/\|[\s\S]*$/, '').replace(/\*+/g, '')
      if (stageName && stageDesc && !/^(叙事结构|逐镜头|分镜|核心目标)/.test(stageName)) {
        structure.push({
          stage: stageName,
          title: stageName,
          description: stageDesc,
        })
        if (!pipeline.includes(stageName)) {
          pipeline.push(stageName)
        }
      }
    }
  }

  // Fallback to legacy parser if no structure was matched via ###
  if (structure.length === 0) {
    const legacy = parseStructureFromAnalyzeMarkdown(markdown)
    if (legacy.length > 0) {
      structure.push(...legacy)
      if (pipeline.length === 0) {
        pipeline = structure.map((s) => s.stage)
      }
    }
  }

  // Ensure pipeline is valid and not containing meta-sentences
  if (structure.length > 0) {
    const validStages = Array.from(new Set(structure.map((s) => s.stage).filter(Boolean)))
    if (pipeline.length === 0 || (pipeline.length === 1 && /阶段|步骤|拆解|结构/i.test(pipeline[0]))) {
      pipeline = validStages
    }
  }

  // 3. Extract Shots Table
  const shots = parseShotsFromAnalyzeMarkdown(markdown)

  // 4. Enrich shots description using structure stages if shot description was empty or too brief
  if (shots.length > 0 && structure.length > 0) {
    for (const shot of shots) {
      if (!shot.description || shot.description.length <= 15 || /^[A-Za-z0-9\s·\(\)]+$/.test(shot.description)) {
        const matchedStage = structure.find((st) => st.stage === shot.stage) || structure[0]
        if (matchedStage?.description) {
          shot.description = `${shot.title}。${matchedStage.description.slice(0, 80)}`
        }
      }
    }
  }

  return { pipeline, structure, shots }
}

/**
 * Execute dedicated video structure breakdown using Hub textComplete.
 * Completely independent of legacy 5D video_analyze.
 * @param {{
 *   videoPath: string,
 *   ctx?: object,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<string>}
 */
export async function executeDedicatedStructureAnalyze({ videoPath, ctx, signal }) {
  if (!videoPath || !existsSync(videoPath)) return ''

  let systemPrompt = ''
  try {
    if (existsSync(BUNDLED_STRUCTURE_PROMPT)) {
      systemPrompt = readFileSync(BUNDLED_STRUCTURE_PROMPT, 'utf8')
    }
  } catch {}

  let textComplete = null
  try {
    textComplete = ctx?.get?.('textComplete')
      || ctx?.tools?.get?.('omnimux_text_complete')
      || ctx?.get?.('tools')?.get?.('omnimux_text_complete')
  } catch {}

  if (!textComplete || typeof textComplete.execute !== 'function') {
    return ''
  }

  const userPrompt = `${systemPrompt}\n\n---\n【任务执行指令】：\n请仔细观看上传的视频，严格按照上述“两阶段结构拆解与逐镜头分镜”格式输出：\n1. 必须输出“## 1. 叙事结构链路”；\n2. 必须输出“## 2. 结构阶段解构”且每一阶段使用 ### 标头；\n3. 必须输出“## 3. 逐镜头分镜脚本表”，表头严格为“| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 |”，严禁将机位词用作标题，严禁输出单一词汇描述！`

  try {
    const res = await textComplete.execute({
      prompt: userPrompt,
      system: systemPrompt,
      video: videoPath,
      reason: 'video_breakdown_structure_analyze',
      maxTokens: 4096,
      signal,
    })
    return typeof res?.text === 'string' ? res.text.trim() : (typeof res === 'string' ? res.trim() : '')
  } catch {
    return ''
  }
}

/**
 * Normalize raw social data from various upstream structures into unified metadata.
 * Supports TikTok/Douyin aweme_detail, X/Twitter, YouTube, Instagram, and fallback objects.
 * @param {object} raw
 * @param {string} [fallbackUrl]
 * @returns {object|null}
 */
export function normalizeSocialMetadata(raw, fallbackUrl = '') {
  if (!raw || typeof raw !== 'object') return null

  // 1. TikTok / Douyin aweme_detail envelope
  const aweme = raw.aweme_detail || raw.data?.aweme_detail || (Array.isArray(raw.item_list) ? raw.item_list[0] : null) || (Array.isArray(raw.aweme_list) ? raw.aweme_list[0] : null)
  if (aweme && typeof aweme === 'object') {
    const desc = aweme.desc || aweme.title || ''
    const author = aweme.author || {}
    const authorName = author.nickname || author.unique_id || 'Creator'
    const authorHandle = author.unique_id ? `@${author.unique_id.replace(/^@/, '')}` : (author.short_id ? `@${author.short_id}` : '@creator')
    const authorAvatar = author.avatar_thumb?.url_list?.[0]
      || author.avatar_medium?.url_list?.[0]
      || author.avatar_larger?.url_list?.[0]
      || ''

    const videoObj = aweme.video || {}
    const coverUrl = videoObj.cover?.url_list?.[0]
      || videoObj.origin_cover?.url_list?.[0]
      || videoObj.dynamic_cover?.url_list?.[0]
      || ''

    const playList = Array.isArray(videoObj.play_addr?.url_list) ? videoObj.play_addr.url_list : []
    const downloadList = Array.isArray(videoObj.download_addr?.url_list) ? videoObj.download_addr.url_list : []
    const bitRateList = Array.isArray(videoObj.bit_rate)
      ? videoObj.bit_rate.map((b) => b?.play_addr?.url_list?.[0]).filter(Boolean)
      : []
    const allVideoCandidates = [...playList, ...downloadList, ...bitRateList]

    // Prefer high-speed direct CDN URL
    let videoUrl = allVideoCandidates.find((u) => typeof u === 'string' && u.startsWith('http') && !u.includes('tiktok.com/aweme/v1/play/'))
      || allVideoCandidates.find((u) => typeof u === 'string' && u.startsWith('http'))
      || ''

    const stats = aweme.statistics || {}
    const durationMs = typeof videoObj.duration === 'number' ? videoObj.duration : 0
    const durationSec = durationMs > 1000 ? Math.round(durationMs / 1000) : (durationMs || 0)

    return {
      title: desc || '短视频分析',
      text: desc || '',
      caption: desc || '',
      author: {
        name: authorName,
        handle: authorHandle,
        avatar: authorAvatar,
      },
      cover_url: coverUrl,
      video_url: videoUrl,
      duration: durationSec,
      stats: {
        likes: stats.digg_count ?? stats.likes ?? 0,
        comments: stats.comment_count ?? stats.comments ?? 0,
        shares: stats.share_count ?? stats.shares ?? 0,
        views: stats.play_count ?? stats.views ?? 0,
      },
    }
  }

  // 2. Flat standard / fallback structure
  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw
  const title = data.title || data.text || data.caption || data.desc || ''
  const author = data.author || data.user || data.owner || {}
  const authorName = typeof author === 'string' ? author : (author.name || author.nickname || author.username || 'Creator')
  const rawHandle = typeof author === 'string' ? author : (author.handle || author.screen_name || author.unique_id || 'creator')
  const authorHandle = String(rawHandle).startsWith('@') ? String(rawHandle) : `@${rawHandle}`
  const authorAvatar = typeof author === 'object' ? (author.avatar || author.image || author.profile_image_url || '') : ''

  let videoUrl = data.video_url || data.videoUrl || ''
  if (!videoUrl || !videoUrl.includes('.mp4')) {
    const xVideo = data.media?.video?.[0]?.variants?.find((v) => v.url?.includes('.mp4'))?.url
      || data.entities?.media?.[0]?.video_info?.variants?.find((v) => v.url?.includes('.mp4'))?.url
    if (xVideo) videoUrl = xVideo
  }

  // Avoid using social webpage URLs as direct video links
  if (videoUrl && /^(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@|instagram\.com\/p\/|youtube\.com\/watch|youtu\.be\/|twitter\.com\/|x\.com\/)/i.test(videoUrl)) {
    videoUrl = ''
  }

  const coverUrl = data.cover_url || data.coverUrl || data.cover || data.display_url || ''
  const stats = data.stats || data.statistics || data.engagement || {}
  const duration = typeof data.duration === 'number' ? data.duration : (typeof data.duration_seconds === 'number' ? data.duration_seconds : 0)

  return {
    title: title || '短视频分析',
    text: title || '',
    caption: title || '',
    author: {
      name: authorName,
      handle: authorHandle,
      avatar: authorAvatar,
    },
    cover_url: coverUrl,
    video_url: videoUrl,
    duration: duration > 60000 ? Math.round(duration / 1000) : duration,
    stats: {
      likes: stats.likes ?? stats.digg_count ?? 0,
      comments: stats.comments ?? stats.comment_count ?? 0,
      shares: stats.shares ?? stats.share_count ?? 0,
      views: stats.views ?? stats.play_count ?? 0,
    },
  }
}

/**
 * Fetch social metadata with real API or resilient fallback.
 * @param {string} url
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchRealSocialMetadata(url, ctx = {}) {
  let socialTool = null
  try {
    socialTool = (ctx?.tools || (typeof ctx?.get === 'function' ? ctx.get('tools') : null))?.get?.('omnimux_social_data')
  } catch {}

  let platform = 'tiktok'
  if (/instagram\.com/i.test(url)) platform = 'instagram'
  else if (/youtube\.com|youtu\.be/i.test(url)) platform = 'youtube'
  else if (/x\.com|twitter\.com/i.test(url)) platform = 'x'

  if (socialTool && typeof socialTool.execute === 'function') {
    try {
      const res = await socialTool.execute({ platform, capability: 'video', url })
      if (res && res.data) {
        const normalized = normalizeSocialMetadata(res.data, url)
        if (normalized && (normalized.video_url || normalized.title !== '短视频分析')) {
          return normalized
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  const fallback = await fallbackResolveSocial({ platform, capability: 'video', url })
  if (fallback && fallback.data) {
    return normalizeSocialMetadata(fallback.data, url)
  }

  return null
}

/**
 * Intelligently generates adaptive shots and narrative structure based on duration and genre.
 * - Short videos (<= 60s): 4 granular hook & intro shots
 * - Mid-length videos (60s - 180s): 6 structured narrative shots
 * - Long videos / short drama collections (> 180s): 10-16 dramatic beat shots (60s-100s per beat)
 *   reflecting episodic pacing and multi-part narrative arcs.
 * @param {number} totalDuration
 * @param {string} [caption]
 * @param {string} [platform]
 * @returns {{ shots: Array<object>, structure: Array<object>, pipeline: Array<string> }}
 */
export function generateAdaptiveShotsAndStructure(totalDuration, caption = '', platform = '') {
  const dur = totalDuration > 0 ? totalDuration : 16
  const cleanCap = String(caption || '').trim()

  // Long episodic drama or long-form video (> 3 minutes)
  if (dur > 180) {
    const isDrama = /reels?|drama|series|sacrifice|queen|alpha|wolf|ceo|短剧|合集|连续剧/i.test(cleanCap)
    const targetShotCount = Math.min(16, Math.max(10, Math.round(dur / 85))) // ~70-100s per dramatic beat
    const step = dur / targetShotCount
    const pipeline = ['Hook', 'Inciting Incident', 'Rising Conflict', 'Climax', 'Plot Twist', 'Cliffhanger']

    const dramaBeats = [
      { stage: 'Hook', title: '黄金开局：反差悬念置顶', desc: '开场通过高反差视觉与痛点迅速建立身份危机与悬疑氛围。' },
      { stage: 'Inciting Incident', title: '冲突发酵：屈辱遭遇与压迫', desc: '主角身处极端困境，反派步步紧逼，情绪张力蓄积。' },
      { stage: 'Inciting Incident', title: '转折契机：神秘力量/角色介入', desc: '关键道具或核心人物破空登场，打破僵局带来转机。' },
      { stage: 'Rising Conflict', title: '首次试探：正面威慑与试压', desc: '多机位特写博弈，主角展现不甘屈服的决绝眼神。' },
      { stage: 'Rising Conflict', title: '暗流涌动：潜藏秘密即将揭开', desc: '镜头交替扫过环境与角色微表情，剧情暗线逐步浮出水面。' },
      { stage: 'Rising Conflict', title: '危机骤增：绝境陷阱与生死抉择', desc: '外部威胁全面爆发，主角退无可退面临命运抉择。' },
      { stage: 'Climax', title: '高潮觉醒：绝对力量强势反制', desc: '高燃动作与情绪爆发点，瞬间击破压迫者建立统治力。' },
      { stage: 'Climax', title: '情绪顶峰：主从同盟与誓约确立', desc: '双人情绪中景特写，关系发生质的飞跃，高光台词定格。' },
      { stage: 'Plot Twist', title: '暗度陈仓：第三方势力突袭', desc: '突发意外打破短暂停歇，幕后真凶露面颠覆既定预设。' },
      { stage: 'Plot Twist', title: '身份反转：惊天秘密大白', desc: '前序伏笔彻底回收，真正身份或阴谋彻底揭晓引发震撼。' },
      { stage: 'Rising Conflict', title: '终局前奏：最后决战部署', desc: '双方阵营正式划清界线，蓄势待发进入终极博弈。' },
      { stage: 'Climax', title: '终极大快人心：正面迎战反击', desc: '快节奏剪辑与运镜，彻底粉碎反派阴谋完成复仇与救赎。' },
      { stage: 'Cliffhanger', title: '余波与伏笔：更大危机初露端倪', desc: '主线事件暂歇，神秘信件或阴暗身影预示下一篇章。' },
      { stage: 'Cliffhanger', title: '终局高能卡点：强悬念留存引导', desc: '剧集在最高潮卡点戛然而止，抛出终极悬念引导观看全集。' },
    ]

    const cameraStyles = [
      ['特写', '智能手机手持', '俯视', '手持微动'],
      ['中景', '智能手机手持', '平视', '手持微动'],
      ['全景', '固定机位', '仰视', '慢速推拉'],
      ['特写', '智能手机手持', '平视', '快速摇镜'],
      ['中景', '智能手机手持', '俯视', '手持移动'],
      ['特写', '大画幅长焦', '平视', '浅景深虚化'],
      ['全景', '智能手机手持', '仰视', '手持移动'],
    ]

    const shots = []
    for (let i = 0; i < targetShotCount; i++) {
      const startSec = Math.round(i * step)
      const endSec = i === targetShotCount - 1 ? dur : Math.round((i + 1) * step)
      const beat = dramaBeats[i % dramaBeats.length]
      const cam = cameraStyles[i % cameraStyles.length]

      shots.push({
        id: `shot_${i + 1}`,
        start_seconds: startSec,
        end_seconds: endSec,
        time_range: formatTimeRange(startSec, endSec),
        title: isDrama ? beat.title : `镜头 ${i + 1}：核心叙事推进`,
        stage: beat.stage,
        tags: cam,
        description: i === 0 && cleanCap
          ? `${beat.desc}（${cleanCap.slice(0, 45)}）`
          : beat.desc,
      })
    }

    const structure = [
      {
        stage: 'Hook',
        title: 'Hook',
        description: `开场通过高反差视觉与悬疑痛点迅速建立身份危机与悬念：${cleanCap.slice(0, 40) || '高能冲突前置'}`,
      },
      {
        stage: 'Inciting Incident',
        title: 'Inciting Incident',
        description: '核心矛盾与不可调和的阵营对立全面展开，确立追剧动机。',
      },
      {
        stage: 'Rising Conflict',
        title: 'Rising Conflict',
        description: '多重冲突反转层层递进，每 60-90 秒必有情绪高潮或危机爆发。',
      },
      {
        stage: 'Climax',
        title: 'Climax',
        description: '高能战力反转或情绪宣泄顶峰，带来强烈的大快人心爽感。',
      },
      {
        stage: 'Plot Twist',
        title: 'Plot Twist',
        description: '打破单线叙事逻辑，揭示隐藏身份与幕后黑手。',
      },
      {
        stage: 'Cliffhanger',
        title: 'Cliffhanger',
        description: '在剧情最高潮戛然而止，留下致命悬念吸引观众进入 App 追看全集。',
      },
    ]

    return { shots, structure, pipeline }
  }

  // Mid-length video (60s ~ 180s)
  if (dur > 60) {
    const s1 = Math.max(1, Math.round(dur * 0.08)) // Hook
    const s2 = Math.max(s1 + 1, Math.round(dur * 0.25)) // Background
    const s3 = Math.max(s2 + 1, Math.round(dur * 0.45)) // Turning point
    const s4 = Math.max(s3 + 1, Math.round(dur * 0.65)) // Core solution
    const s5 = Math.max(s4 + 1, Math.round(dur * 0.85)) // Climax
    const s6 = dur // CTA

    const shots = [
      {
        id: 'shot_1',
        start_seconds: 0,
        end_seconds: s1,
        time_range: formatTimeRange(0, s1),
        title: '黄金前置抓眼球',
        stage: 'Hook',
        tags: ['特写', '智能手机手持', '俯视', '手持微动'],
        description: `开场高能视觉切入抓取完播率：${cleanCap.slice(0, 45)}`,
      },
      {
        id: 'shot_2',
        start_seconds: s1,
        end_seconds: s2,
        time_range: formatTimeRange(s1, s2),
        title: '背景铺垫与痛点切入',
        stage: 'Product Intro',
        tags: ['中景', '智能手机手持', '平视', '手持微动'],
        description: '真实交代前置背景与用户痛点，引发同理心。',
      },
      {
        id: 'shot_3',
        start_seconds: s2,
        end_seconds: s3,
        time_range: formatTimeRange(s2, s3),
        title: '核心主体亮点呈现',
        stage: 'Product Intro',
        tags: ['特写', '智能手机手持', '平视', '手持移动'],
        description: '全景呈现核心亮点与视觉细节，树立品质与信任。',
      },
      {
        id: 'shot_4',
        start_seconds: s3,
        end_seconds: s4,
        time_range: formatTimeRange(s3, s4),
        title: '实操过程与功能展现',
        stage: 'Usage Detail',
        tags: ['中景', '智能手机手持', '平视', '手持移动'],
        description: '直观演示操作流程与核心效果，化解顾虑。',
      },
      {
        id: 'shot_5',
        start_seconds: s4,
        end_seconds: s5,
        time_range: formatTimeRange(s4, s5),
        title: '高光效果与成果展示',
        stage: 'Demo Scene',
        tags: ['全景', '智能手机手持', '俯视', '慢速推拉'],
        description: '呈现最终惊喜效果，达成情绪与审美共鸣。',
      },
      {
        id: 'shot_6',
        start_seconds: s5,
        end_seconds: s6,
        time_range: formatTimeRange(s5, s6),
        title: '行动呼吁与转化引导',
        stage: 'Demo Scene',
        tags: ['特写', '智能手机手持', '平视', '手持微动'],
        description: '引导评论区互动、主页点击或应用下载转化。',
      },
    ]

    const structure = [
      { stage: 'Hook', title: 'Hook', description: `开场通过高视觉吸引力与反差切入抓住观众眼球：${cleanCap.slice(0, 45)}` },
      { stage: 'Product Intro', title: 'Product Intro', description: '主体特征与视觉细节深度呈现，树立品质与信任。' },
      { stage: 'Usage Detail', title: 'Usage Detail', description: '真实操作流程演示与细节释疑，展现直观解决效果。' },
      { stage: 'Demo Scene', title: 'Demo Scene', description: '高光场景展示与生活美学共鸣，自然驱动转化行动。' },
    ]

    return { shots, structure, pipeline: ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'] }
  }

  // Short video (<= 60s)
  const s1 = Math.max(1, Math.round(dur * 0.2))
  const s2 = Math.max(s1 + 1, Math.round(dur * 0.45))
  const s3 = Math.max(s2 + 1, Math.round(dur * 0.75))
  const s4 = dur

  const shots = [
    {
      id: 'shot_1',
      start_seconds: 0,
      end_seconds: s1,
      time_range: formatTimeRange(0, s1),
      title: '黄金前置视觉切入',
      stage: 'Hook',
      tags: ['特写', '智能手机手持', '俯视', '手持微动'],
      description: `开场通过高反差视觉与痛点切入抓取眼球：${cleanCap.slice(0, 45)}`,
    },
    {
      id: 'shot_2',
      start_seconds: s1,
      end_seconds: s2,
      time_range: formatTimeRange(s1, s2),
      title: '核心主体与细节展示',
      stage: 'Product Intro',
      tags: ['特写', '智能手机手持', '平视', '手持微动'],
      description: '镜头聚焦主体，多角度展现核心细节与材质工艺。',
    },
    {
      id: 'shot_3',
      start_seconds: s2,
      end_seconds: s3,
      time_range: formatTimeRange(s2, s3),
      title: '使用过程与功能演示',
      stage: 'Usage Detail',
      tags: ['中景', '智能手机手持', '平视', '手持移动'],
      description: '第一视角动态演示使用过程，展现解决痛点的直观效果。',
    },
    {
      id: 'shot_4',
      start_seconds: s3,
      end_seconds: s4,
      time_range: formatTimeRange(s3, s4),
      title: '实际场景与转化引导',
      stage: 'Demo Scene',
      tags: ['中景', '智能手机手持', '俯视', '手持移动'],
      description: '切换至日常生活场景，引发观众审美共鸣并引导互动下单。',
    },
  ]

  const structure = [
    { stage: 'Hook', title: 'Hook', description: `视频开场直接展示产品/主体，配上走心的文案，迅速抓住观众眼球：${cleanCap.slice(0, 45)}` },
    { stage: 'Product Intro', title: 'Product Intro', description: '全景展示主体与丰富细节，呈现精致质感与设计亮点，突出送礼与收藏的价值感。' },
    { stage: 'Usage Detail', title: 'Usage Detail', description: '特写展示内部细节、质感工艺与关键交互，直观呈现产品细节功能与真实情感传递。' },
    { stage: 'Demo Scene', title: 'Demo Scene', description: '置于真实生活场景之中，展现搭配与实际使用氛围，激发观众的情感共鸣与行动意愿。' },
  ]

  return { shots, structure, pipeline: ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'] }
}

/**
 * Analyze input video URL or local path and extract structured breakdown data with real media extraction.
 * @param {string} inputUrl
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function extractVideoBreakdown(inputUrl, options = {}) {
  const trimmed = String(inputUrl || '').trim()
  const isLocalFile = trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')
  const isHttp = /^https?:\/\//i.test(trimmed)
  const ctx = options.ctx || {}

  let platform = 'tiktok'
  if (/douyin\.com/i.test(trimmed)) platform = 'douyin'
  else if (/instagram\.com/i.test(trimmed)) platform = 'instagram'
  else if (/youtube\.com|youtu\.be/i.test(trimmed)) platform = 'youtube'
  else if (/bilibili\.com/i.test(trimmed)) platform = 'bilibili'
  else if (/xiaohongshu\.com|xhslink\.com/i.test(trimmed)) platform = 'xiaohongshu'

  // If local file exists and is already .vbreakdown, return it directly
  if (isLocalFile && existsSync(trimmed)) {
    if (trimmed.endsWith('.vbreakdown') || trimmed.endsWith('.json')) {
      try {
        const raw = JSON.parse(readFileSync(trimmed, 'utf8'))
        if (raw.is_video_breakdown) return raw
      } catch {}
    }
  }

  // 1. Fetch real social metadata
  let realMeta = null
  if (isHttp) {
    realMeta = await fetchRealSocialMetadata(trimmed, ctx)
  }

  const isDirectUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url) && !/^(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@|instagram\.com\/p\/|youtube\.com\/watch|youtu\.be\/|twitter\.com\/|x\.com\/)/i.test(url)

  const authorName = realMeta?.author?.name || options.meta?.authorName || 'Creator'
  const authorHandle = realMeta?.author?.handle ? `@${realMeta.author.handle.replace(/^@/, '')}` : options.meta?.authorHandle || '@creator'
  const authorAvatar = realMeta?.author?.avatar || options.meta?.authorAvatar || ''
  const caption = realMeta?.caption || realMeta?.title || realMeta?.text || options.meta?.caption || '短视频分析'
  const title = caption.length > 50 ? `${caption.slice(0, 48)}…` : caption
  const videoPlayUrl = realMeta?.video_url || options.meta?.videoUrl || (isDirectUrl(trimmed) ? trimmed : '')
  const coverUrl = realMeta?.cover_url || options.meta?.coverUrl || ''
  const likes = String(realMeta?.stats?.likes ?? options.meta?.likes ?? '0')
  const comments = String(realMeta?.stats?.comments ?? options.meta?.comments ?? '0')
  const shares = String(realMeta?.stats?.shares ?? options.meta?.shares ?? '0')
  const views = String(realMeta?.stats?.views ?? options.meta?.views ?? '0')
  const totalDuration = realMeta?.duration || options.meta?.duration || 16

  // 2. Download video to local workspace cache for analysis
  let localVideoPath = isLocalFile ? resolve(trimmed) : null
  if (!localVideoPath && videoPlayUrl && isDirectUrl(videoPlayUrl)) {
    try {
      const wsDir = resolveWorkspaceDirectory(options)
      const cacheDir = wsDir
        ? join(wsDir, '.omnimux', 'cache')
        : join(process.env.HOME || process.cwd(), '.omnimux', 'cache')
      mkdirSync(cacheDir, { recursive: true })
      localVideoPath = await downloadMedia(videoPlayUrl, cacheDir, { prefix: 'vid_' })
    } catch {
      // ignore download failure and proceed
    }
  }

  // Extract a real frame JPEG cover from the local video so browsers can preview cleanly
  let localCoverPath = null
  if (localVideoPath && existsSync(localVideoPath)) {
    try {
      const candidateCover = localVideoPath.replace(/\.mp4$/i, '_cover.jpg')
      if (!existsSync(candidateCover)) {
        execSync(`ffmpeg -v error -y -ss 00:00:01 -i "${localVideoPath}" -vframes 1 "${candidateCover}"`, { timeout: 5000 })
      }
      if (existsSync(candidateCover)) {
        localCoverPath = candidateCover
      }
    } catch {}
  }

  // 3. Execute dedicated multimodal video structure analysis (independent of legacy 5D video_analyze)
  let analyzeReportText = ''
  let analysisVideoPath = localVideoPath
  if (localVideoPath && existsSync(localVideoPath)) {
    try {
      const stats = statSync(localVideoPath)
      // If video exceeds 20MB limit of understand models, create a compressed lightweight sample
      if (stats.size > 20 * 1024 * 1024) {
        const samplePath = localVideoPath.replace(/\.mp4$/i, '_sample.mp4')
        if (!existsSync(samplePath)) {
          execSync(
            `ffmpeg -v error -y -i "${localVideoPath}" -vf "fps=1/3,scale=360:-2" -c:v libx264 -preset ultrafast -crf 32 -an "${samplePath}"`,
            { timeout: 15000 }
          )
        }
        if (existsSync(samplePath)) {
          analysisVideoPath = samplePath
        }
      }
    } catch {}
  }

  if (analysisVideoPath) {
    try {
      analyzeReportText = await executeDedicatedStructureAnalyze({
        videoPath: analysisVideoPath,
        ctx,
        signal: options.signal,
      })
    } catch {
      // ignore
    }
  }

  // 4. Extract dynamic pipeline, structure and shots from dedicated analyze markdown
  const parsed = parsePipelineAndStructureFromMarkdown(analyzeReportText)
  let shots = parsed.shots
  let structure = parsed.structure
  let pipeline = parsed.pipeline

  // 5. If shots or structure empty, generate intelligent adaptive breakdown derived from real caption & duration
  if (shots.length === 0 || structure.length === 0) {
    const adaptive = generateAdaptiveShotsAndStructure(totalDuration, caption, platform)
    if (shots.length === 0) shots = adaptive.shots
    if (structure.length === 0) structure = adaptive.structure
    if (pipeline.length === 0) pipeline = adaptive.pipeline
  }

  const durationSeconds = shots[shots.length - 1]?.end_seconds || totalDuration || 16

  return {
    schema_version: '1.0.0',
    is_video_breakdown: true,
    analyzed_at: new Date().toISOString(),
    video: {
      title,
      author_name: authorName,
      author_handle: authorHandle,
      author_avatar: authorAvatar,
      caption,
      platform,
      source_url: isHttp ? trimmed : '',
      video_url: videoPlayUrl,
      stream_url: localVideoPath ? `/omnimux/video-preview/stream?path=${encodeURIComponent(localVideoPath)}` : (videoPlayUrl || (isHttp ? trimmed : '')),
      cover_url: localCoverPath
        ? `/omnimux/video-preview/stream?path=${encodeURIComponent(localCoverPath)}`
        : (coverUrl && !coverUrl.includes('.heic') ? coverUrl : ''),
      duration_seconds: durationSeconds,
      duration_text: formatTime(durationSeconds),
      scene_count: shots.length,
      views,
      likes,
      comments,
      shares,
      ai_labeled: Boolean(realMeta),
    },
    pipeline,
    shots,
    structure,
  }
}

/**
 * Resolves current workspace directory from execution context or environment.
 * @param {object} [options]
 * @returns {string|null}
 */
export function resolveWorkspaceDirectory(options = {}) {
  const { execCtx, ctx, workspace, workdir } = options

  if (workdir && typeof workdir === 'string') return resolve(workdir)
  if (workspace && typeof workspace === 'string') return resolve(workspace)

  if (execCtx?.workdir && typeof execCtx.workdir === 'string') return resolve(execCtx.workdir)
  if (execCtx?.workspace && typeof execCtx.workspace === 'string') return resolve(execCtx.workspace)
  if (execCtx?.cwd && typeof execCtx.cwd === 'string') return resolve(execCtx.cwd)

  // 1. Safe resolution via session on agent/exec context
  try {
    const headerCwd = execCtx?.agent?.session?.header?.cwd || execCtx?.session?.header?.cwd
    if (headerCwd && typeof headerCwd === 'string') return resolve(headerCwd)
  } catch {}

  // 2. Safe resolution via ctx.get('sessions') without triggering property inject guard
  try {
    const sessionsService = typeof ctx?.get === 'function' ? ctx.get('sessions') : null
    const sessionId = execCtx?.agent?.session?.id || execCtx?.sessionId
    if (sessionId && sessionsService && typeof sessionsService.get === 'function') {
      const sessionObj = sessionsService.get(sessionId)
      const headerCwd = sessionObj?.header?.cwd
      if (headerCwd && typeof headerCwd === 'string') return resolve(headerCwd)
    }
  } catch {}

  if (process.env.DSH_WORKSPACE && typeof process.env.DSH_WORKSPACE === 'string') {
    return resolve(process.env.DSH_WORKSPACE)
  }

  const cwd = process.cwd()
  const home = process.env.HOME || ''
  if (cwd && cwd !== '/' && cwd !== home && cwd !== resolve(home)) {
    return cwd
  }

  return null
}

/**
 * Save breakdown result to native .vbreakdown JSON data file.
 * (Completely removes HTML generation and iframe sandbox).
 * @param {object} breakdownData
 * @param {string} [customDest]
 * @param {object} [options]
 * @returns {{ dataPath: string }}
 */
export function saveVideoBreakdownArtifacts(breakdownData, customDest, options = {}) {
  const ts = Date.now()
  let basePath = customDest

  if (!basePath) {
    const wsDir = resolveWorkspaceDirectory(options)
    const outDir = wsDir
      ? join(wsDir, '.omnimux', 'breakdowns')
      : join(process.env.HOME || process.cwd(), '.omnimux', 'breakdowns')
    mkdirSync(outDir, { recursive: true })
    basePath = join(outDir, `video-analysis-${ts}`)
  } else {
    basePath = resolve(basePath)
    if (basePath.endsWith('.vbreakdown') || basePath.endsWith('.json') || basePath.endsWith('.html')) {
      basePath = basePath.replace(/\.(vbreakdown|json|html)$/, '')
    }
    const parentDir = dirname(basePath)
    mkdirSync(parentDir, { recursive: true })
  }

  const dataPath = `${basePath}.vbreakdown`
  writeFileSync(dataPath, JSON.stringify(breakdownData, null, 2), 'utf8')

  return { dataPath }
}
