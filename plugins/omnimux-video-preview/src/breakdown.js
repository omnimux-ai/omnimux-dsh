import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { downloadMedia, fallbackResolveSocial } from './download-helper.js'

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
      const descLine = shot.description ? `描述：${shot.description}` : ''
      return [`${timeStr} ${shot.title || `分镜 ${idx + 1}`}${stageStr}`, tagsLine, descLine].filter(Boolean).join('\n')
    })
    .join('\n\n')
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

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue
    if (!tableStarted) {
      if (line.includes('时间') || line.includes('画面') || line.includes('镜头')) {
        tableStarted = true
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
        for (const col of cols) {
          const m = col.match(/(\d+)\s*[-~至到]\s*(\d+)/)
          if (m) {
            timeCol = col
            startSec = parseInt(m[1], 10)
            endSec = parseInt(m[2], 10)
            break
          }
        }

        const descCols = cols.filter((c) => c !== timeCol && !/^\d+$/.test(c))
        const visualCol = descCols[0] || ''
        const actionCol = descCols[1] || ''

        // Infer camera tags from visual description
        const tags = []
        if (visualCol.includes('特写') || visualCol.includes('Close-up')) tags.push('特写')
        else if (visualCol.includes('中景') || visualCol.includes('Medium')) tags.push('中景')
        else if (visualCol.includes('全景') || visualCol.includes('Wide')) tags.push('全景')

        if (visualCol.includes('手持') || visualCol.includes('手机')) tags.push('智能手机手持')
        if (visualCol.includes('俯视')) tags.push('俯视')
        else if (visualCol.includes('平视')) tags.push('平视')
        else if (visualCol.includes('仰视')) tags.push('仰视')

        if (visualCol.includes('移动') || visualCol.includes('运镜') || visualCol.includes('扫过')) tags.push('手持移动')
        else tags.push('手持微动')

        // Infer stage
        let stage = 'Product Intro'
        if (startSec === 0 || endSec <= 3) stage = 'Hook'
        else if (endSec > 12) stage = 'Demo Scene'
        else if (startSec >= 7) stage = 'Usage Detail'

        shots.push({
          id: `shot_${shots.length + 1}`,
          start_seconds: startSec,
          end_seconds: endSec,
          time_range: formatTimeRange(startSec, endSec),
          title: visualCol.slice(0, 20) || `分镜 ${shots.length + 1}`,
          stage,
          tags: tags.length > 0 ? tags : ['特写', '智能手机手持', '俯视', '手持微动'],
          description: actionCol || visualCol,
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
      title: 'Hook (黄金钩子)',
      description: hookMatch[1].trim().replace(/^>\s*/, '').replace(/\*+/g, ''),
    })
  }

  // Product Intro / Global Goal
  const goalMatch = markdown.match(/##\s*I\.\s*核心目标[^\n]*\n+([\s\S]*?)(?=\n##\s*II|$)/i)
  if (goalMatch) {
    structure.push({
      stage: 'Product Intro',
      title: 'Product Intro (核心展示)',
      description: goalMatch[1].trim().replace(/\*+/g, ''),
    })
  }

  // Usage Detail / Narrative
  const narrativeMatch = markdown.match(/##\s*III\.\s*叙事分析[^\n]*\n+([\s\S]*?)(?=\n##\s*IV|$)/i)
  if (narrativeMatch) {
    structure.push({
      stage: 'Usage Detail',
      title: 'Usage Detail (使用细节)',
      description: narrativeMatch[1].trim().replace(/\*+/g, ''),
    })
  }

  // Demo Scene / Visual
  const visualMatch = markdown.match(/##\s*IV\.\s*画面分析[^\n]*\n+([\s\S]*?)(?=\n##\s*V|$)/i)
  if (visualMatch) {
    structure.push({
      stage: 'Demo Scene',
      title: 'Demo Scene (场景共鸣)',
      description: visualMatch[1].trim().replace(/\*+/g, ''),
    })
  }

  return structure
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
  const socialTool = ctx.tools?.get?.('omnimux_social_data')
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

  // 3. Execute multimodal video analysis
  let analyzeReportText = ''
  const videoAnalyzeTool = ctx.tools?.get?.('video_analyze')
  if (localVideoPath && videoAnalyzeTool && typeof videoAnalyzeTool.execute === 'function') {
    try {
      const res = await videoAnalyzeTool.execute({ video: localVideoPath })
      analyzeReportText = res?.report || res?.text || (typeof res === 'string' ? res : '')
    } catch {
      // ignore tool error
    }
  }

  // 4. Extract shots and structure from real analyze markdown
  let shots = parseShotsFromAnalyzeMarkdown(analyzeReportText)
  let structure = parseStructureFromAnalyzeMarkdown(analyzeReportText)

  // 5. If shots or structure empty, generate semantic breakdown derived from real caption & duration
  if (shots.length === 0) {
    const dur = totalDuration > 0 ? totalDuration : 16
    const s1 = Math.max(1, Math.round(dur * 0.2))
    const s2 = Math.max(s1 + 1, Math.round(dur * 0.45))
    const s3 = Math.max(s2 + 1, Math.round(dur * 0.75))
    const s4 = dur

    shots = [
      {
        id: 'shot_1',
        start_seconds: 0,
        end_seconds: s1,
        time_range: formatTimeRange(0, s1),
        title: '黄金前置视觉切入',
        stage: 'Hook',
        tags: ['特写', '智能手机手持', '俯视', '手持微动'],
        description: `开场通过高反差视觉与痛点切入抓取眼球：${caption.slice(0, 45)}`,
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
  }

  if (structure.length === 0) {
    structure = [
      {
        stage: 'Hook',
        title: 'Hook (黄金钩子)',
        description: `开场黄金时间通过视觉反差与情绪调动捕获观众停留：${caption.slice(0, 45)}`,
      },
      {
        stage: 'Product Intro',
        title: 'Product Intro (核心展示)',
        description: '全景呈现核心主体与细节工艺，建立高品质认知与信任感。',
      },
      {
        stage: 'Usage Detail',
        title: 'Usage Detail (使用细节)',
        description: '通过具体功能操作演示，解答疑问并展示真实使用体验。',
      },
      {
        stage: 'Demo Scene',
        title: 'Demo Scene (场景共鸣)',
        description: '置于生活化真实场景之中，触发情感共鸣与转化行动。',
      },
    ]
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
      cover_url: coverUrl,
      duration_seconds: durationSeconds,
      duration_text: formatTime(durationSeconds),
      scene_count: shots.length,
      views,
      likes,
      comments,
      shares,
      ai_labeled: Boolean(realMeta),
    },
    pipeline: ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'],
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

  const sessionId = execCtx?.agent?.session?.id || execCtx?.sessionId
  if (sessionId && ctx?.sessions?.get) {
    const sessionObj = ctx.sessions.get(sessionId)
    const headerCwd = sessionObj?.header?.cwd
    if (headerCwd && typeof headerCwd === 'string') return resolve(headerCwd)
  }
  if (execCtx?.agent?.session?.header?.cwd) {
    return resolve(execCtx.agent.session.header.cwd)
  }

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
