/**
 * @file plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js
 * Video breakdown multimodal analysis pipeline and artifact extraction.
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { downloadMedia } from '../download-helper.js'
import { detectPhysicalScenes } from '../scene-detect.js'
import { formatTime } from './timeUtils.js'
import { parsePipelineAndStructureFromMarkdown } from './structureParser.js'
import { detectSocialPlatform, fetchRealSocialMetadata } from './socialMetadata.js'
import { generateAdaptiveShotsAndStructure } from './adaptiveGenerator.js'
import { resolveWorkspaceDirectory } from './artifactStorage.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const BUNDLED_STRUCTURE_PROMPT = join(HERE, '../../prompts/video-structure-breakdown.md')

/**
 * Safely load bundled structure breakdown system prompt.
 * @returns {string}
 */
function loadStructurePrompt() {
  try {
    if (existsSync(BUNDLED_STRUCTURE_PROMPT)) {
      return readFileSync(BUNDLED_STRUCTURE_PROMPT, 'utf8')
    }
  } catch {}
  return ''
}

/**
 * Query textComplete service directly from ctx.
 * @param {object} ctx
 * @returns {object|null}
 */
function queryDirectTextComplete(ctx) {
  if (ctx && typeof ctx.get === 'function') {
    const direct = ctx.get('textComplete')
    if (direct) return direct
  }
  return null
}

/**
 * Query textComplete service from ctx tools registry.
 * @param {object} ctx
 * @returns {object|null}
 */
function queryToolsTextComplete(ctx) {
  let toolMap = null
  if (ctx && ctx.tools) {
    toolMap = ctx.tools
  } else if (ctx && typeof ctx.get === 'function') {
    toolMap = ctx.get('tools')
  }
  if (toolMap && typeof toolMap.get === 'function') {
    return toolMap.get('omnimux_text_complete')
  }
  return null
}

/**
 * Resolve Hub textComplete capability from context.
 * @param {object} ctx
 * @returns {object|null}
 */
function resolveTextCompleteService(ctx) {
  const direct = queryDirectTextComplete(ctx)
  if (direct) return direct
  return queryToolsTextComplete(ctx)
}

/**
 * Build structured user instruction for multimodal video analysis using Chain-of-Thought principles.
 * @param {string} systemPrompt
 * @returns {string}
 */
function buildStructureInstruction(systemPrompt) {
  return `${systemPrompt}\n\n---\n【思维链 (CoT) 深度拉片任务执行指令（严格遵守）】：\n请在内心严格执行 5 步思维链（音画全景扫描与台词完整转写 -> 商业漏斗五阶段对齐 -> 核心台词原声锚定 -> 操盘手心理学与转化策略深度解构 -> 逐镜头 4 维正交分镜表征），严格按照上述格式规范输出：\n1. 【叙事结构链路】：带货好物类视频标准五阶段严格为：Hook → Product Intro → Usage Detail → Proof Effect → Cta，严禁自行编造长句或加序数前缀！\n2. 【结构阶段解构】：每一个阶段必须使用对应的标准英文阶段名作为 ### 标头，且标头下方必须包含一条以 > 开头的英文原声核心完整台词引用（严禁截取半句、严禁只写环境音！），随后紧跟一段 40~80 字专业中文策略意图与爆款心理机制解析！\n3. 【逐镜头分镜脚本表】：表头严格为“| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |”；\n4. 【4维正交标签规范】：第 4 列“镜头属性标签”必须由 4 个正交维度的标准参数组成（以逗号分隔）：[景别], [机位设备], [拍摄视角], [运镜方式]（例如：中景, 智能手机手持, 平视, 手持微晃），绝对严禁使用斜杠“/”，绝对严禁将环境地点塞入标签！\n5. 【严禁机械词】：分镜标题必须是具体的画面事件（如“卫生间偷窥情景”、“窗外视角无法透视”、“产品展开介绍”），严禁出现 Shot 1、全景等机械词！`
}

/**
 * Build scene constraint prompt from physical scene detection.
 * @param {Array<object>} physicalScenes
 * @returns {string}
 */
function buildPhysicalSceneConstraint(physicalScenes) {
  if (!Array.isArray(physicalScenes) || physicalScenes.length === 0) return ''
  const list = physicalScenes.map((s, i) => `参考分镜切点 ${i + 1}: ${s.timeRange}`).join('\n')
  return `\n6. 【物理切镜参考基准与时间锚点】：\n底层机器视觉探测到的关键镜头切换时间点如下（供参考定位）：\n${list}\n【解绑说明与分镜指导】：\n上述切点为机器视觉物理切片参考，请作为视觉转换的关键时间锚点。请结合实际画面情节、动作起止与台词语意，输出饱满、连贯的逐镜头分镜脚本表（通常短视频有 3~6 个分镜）。允许在镜头区间内基于故事情节与动作转换合理细分对齐，严禁为了机械合并而丢失关键动作与视听细节！`
}

/**
 * Invoke textComplete with robust response unwrapping.
 * @param {object} textComplete
 * @param {object} params
 * @returns {Promise<string>}
 */
async function invokeTextComplete(textComplete, params) {
  try {
    const res = await textComplete.execute(params)
    if (typeof res === 'string') return res.trim()
    if (res && typeof res.text === 'string') return res.text.trim()
  } catch {}
  return ''
}

/**
 * Execute dedicated video structure breakdown using Hub textComplete.
 * Completely independent of legacy 5D video_analyze.
 * @param {{ videoPath: string, ctx?: object, signal?: AbortSignal, physicalScenes?: Array<object> }} options
 * @returns {Promise<string>}
 */
export async function executeDedicatedStructureAnalyze(options) {
  const { videoPath, ctx, signal, physicalScenes = [] } = options
  if (!videoPath || !existsSync(videoPath)) return ''

  const systemPrompt = loadStructurePrompt()
  const textComplete = resolveTextCompleteService(ctx)
  if (!textComplete || typeof textComplete.execute !== 'function') {
    return ''
  }

  const basePrompt = buildStructureInstruction(systemPrompt)
  const sceneConstraint = buildPhysicalSceneConstraint(physicalScenes)
  const prompt = `${basePrompt}${sceneConstraint}`

  return invokeTextComplete(textComplete, {
    prompt,
    system: systemPrompt,
    video: videoPath,
    reason: 'video_breakdown_structure_analyze',
    maxTokens: 4096,
    signal,
  })
}

/**
 * Read and return already analyzed .vbreakdown file if valid.
 * @param {string} filePath
 * @returns {object|null}
 */
function readExistingBreakdownFile(filePath) {
  const isLocal = filePath.startsWith('/') || filePath.startsWith('./') || filePath.startsWith('../')
  if (!isLocal || !existsSync(filePath)) return null

  const isBreakdownExt = filePath.endsWith('.vbreakdown') || filePath.endsWith('.json')
  if (!isBreakdownExt) return null

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    if (raw && raw.is_video_breakdown) {
      return raw
    }
  } catch {}
  return null
}

/**
 * Check whether a video url is a direct video link.
 * @param {string} url
 * @returns {boolean}
 */
function isDirectVideoUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false
  const socialDomains = [
    'tiktok.com/@',
    'instagram.com/p/',
    'youtube.com/watch',
    'youtu.be/',
    'twitter.com/',
    'x.com/',
  ]
  for (const domain of socialDomains) {
    if (url.includes(domain)) return false
  }
  return true
}

/**
 * Pick caption string with fallback.
 * @param {object|null} realMeta
 * @param {object} meta
 * @returns {string}
 */
function pickCaptionText(realMeta, meta) {
  if (realMeta) {
    if (realMeta.caption) return realMeta.caption
    if (realMeta.title) return realMeta.title
    if (realMeta.text) return realMeta.text
  }
  return meta.caption || '短视频分析'
}

/**
 * Pick author display name.
 * @param {object|null} rawAuthor
 * @param {object} meta
 * @returns {string}
 */
function pickAuthorName(rawAuthor, meta) {
  if (rawAuthor && rawAuthor.name) return rawAuthor.name
  return meta.authorName || 'Creator'
}

/**
 * Pick author avatar url.
 * @param {object|null} rawAuthor
 * @param {object} meta
 * @returns {string}
 */
function pickAuthorAvatar(rawAuthor, meta) {
  if (rawAuthor && rawAuthor.avatar) return rawAuthor.avatar
  return meta.authorAvatar || ''
}

/**
 * Resolve basic author and caption information.
 * @param {object|null} realMeta
 * @param {object} options
 * @returns {object}
 */
function resolveAuthorInfo(realMeta, options) {
  const meta = options.meta || {}
  const rawAuthor = realMeta ? realMeta.author : null
  const authorName = pickAuthorName(rawAuthor, meta)

  let authorHandle = meta.authorHandle || '@creator'
  if (rawAuthor && rawAuthor.handle) {
    authorHandle = `@${rawAuthor.handle.replace(/^@/, '')}`
  }
  const authorAvatar = pickAuthorAvatar(rawAuthor, meta)

  const caption = pickCaptionText(realMeta, meta)
  const title = caption.length > 50 ? `${caption.slice(0, 48)}…` : caption
  return { authorName, authorHandle, authorAvatar, caption, title }
}

/**
 * Download remote media to local workspace cache when necessary.
 * @param {string} videoPlayUrl
 * @param {object} options
 * @returns {Promise<string|null>}
 */
async function downloadVideoToWorkspaceCache(videoPlayUrl, options) {
  try {
    const wsDir = resolveWorkspaceDirectory(options)
    const baseDir = wsDir || process.env.HOME || process.cwd()
    const cacheDir = join(baseDir, '.omnimux', 'cache')
    mkdirSync(cacheDir, { recursive: true })
    return await downloadMedia(videoPlayUrl, cacheDir, { prefix: 'vid_' })
  } catch {
    return null
  }
}

/**
 * Extract first frame JPEG from local video file with ffmpeg.
 * @param {string|null} localVideoPath
 * @returns {string|null}
 */
function extractVideoCoverFrame(localVideoPath) {
  if (!localVideoPath || !existsSync(localVideoPath)) return null
  try {
    const candidateCover = localVideoPath.replace(/\.mp4$/i, '_cover.jpg')
    if (!existsSync(candidateCover)) {
      execSync(`ffmpeg -v error -y -ss 00:00:01 -i "${localVideoPath}" -vframes 1 "${candidateCover}"`, { timeout: 5000 })
    }
    if (existsSync(candidateCover)) {
      return candidateCover
    }
  } catch {}
  return null
}

/**
 * Compress oversized video files (> 20MB) for multimodal models.
 * @param {string|null} localVideoPath
 * @returns {string|null}
 */
function prepareAnalysisSampleVideo(localVideoPath) {
  if (!localVideoPath || !existsSync(localVideoPath)) return null
  try {
    const stats = statSync(localVideoPath)
    if (stats.size <= 20 * 1024 * 1024) {
      return localVideoPath
    }

    const samplePath = localVideoPath.replace(/\.mp4$/i, '_sample.mp4')
    if (!existsSync(samplePath)) {
      execSync(
        `ffmpeg -v error -y -i "${localVideoPath}" -vf "fps=1/3,scale=360:-2" -c:v libx264 -preset ultrafast -crf 32 -an "${samplePath}"`,
        { timeout: 15000 }
      )
    }
    if (existsSync(samplePath)) {
      return samplePath
    }
  } catch {}
  return localVideoPath
}

/**
 * Detect physical scenes using ffmpeg scene detection helper or omnimux-video process.
 * @param {string|null} localVideoPath
 * @param {object} [ctx]
 * @returns {Promise<Array<object>>}
 */
async function tryDetectPhysicalScenes(localVideoPath, ctx) {
  if (!localVideoPath || !existsSync(localVideoPath)) return []
  try {
    return (await detectPhysicalScenes(localVideoPath, { threshold: 0.35, minDuration: 1.2, ctx })) || []
  } catch {
    return []
  }
}

/**
 * Align shot time boundaries with detected physical scenes when count exactly matches.
 * Preserves model's granular story beats if model extracted more detailed shots.
 * @param {Array<object>} shots
 * @param {Array<object>} physicalScenes
 */
function alignPhysicalScenesToShots(shots, physicalScenes) {
  if (!Array.isArray(physicalScenes) || physicalScenes.length < 2) return
  if (!Array.isArray(shots) || shots.length !== physicalScenes.length) return
  shots.forEach((s, idx) => {
    const ps = physicalScenes[idx]
    s.start_seconds = ps.startSec
    s.end_seconds = ps.endSec
    s.time_range = ps.timeRange
  })
}

/**
 * Check whether a structure stage description is degenerate or invalid.
 * @param {object} s
 * @returns {boolean}
 */
function isTrivialStageNode(s) {
  const desc = s.description
  if (!desc || desc === '---' || desc.length <= 5) return true
  return s.stage.includes('|')
}

/**
 * Check if the extracted structure is degenerate.
 * @param {Array<object>} structure
 * @returns {boolean}
 */
function isStructureResultDegenerate(structure) {
  if (structure.length === 0) return true
  if (structure.length <= 1) {
    const desc = structure[0] ? structure[0].description : ''
    const isTrivial = !desc || desc === '---' || desc.trim().length <= 5
    return isTrivial
  }
  return structure.every((s) => isTrivialStageNode(s))
}

/**
 * Resolve shots, structure and pipeline via multimodal LLM or adaptive fallback.
 * @param {object} params
 * @returns {Promise<{ shots: Array<object>, structure: Array<object>, pipeline: Array<string> }>}
 */
async function resolveBreakdownData(params) {
  const { analysisVideoPath, ctx, signal, totalDuration, caption, platform, physicalScenes } = params
  let analyzeReportText = ''
  if (analysisVideoPath) {
    analyzeReportText = await executeDedicatedStructureAnalyze({
      videoPath: analysisVideoPath,
      ctx,
      signal,
      physicalScenes,
    })
  }

  const parsed = parsePipelineAndStructureFromMarkdown(analyzeReportText)
  let shots = parsed.shots
  let structure = parsed.structure
  let pipeline = parsed.pipeline

  alignPhysicalScenesToShots(shots, physicalScenes)

  if (shots.length === 0 || isStructureResultDegenerate(structure)) {
    const adaptive = generateAdaptiveShotsAndStructure(totalDuration, caption, platform)
    if (shots.length === 0) shots = adaptive.shots
    if (isStructureResultDegenerate(structure)) {
      structure = adaptive.structure
      pipeline = adaptive.pipeline
    }
  }

  return { shots, structure, pipeline }
}

/**
 * Resolve video direct playback url.
 * @param {object|null} realMeta
 * @param {object} options
 * @param {string} trimmed
 * @returns {string}
 */
function resolveVideoPlaybackUrl(realMeta, options, trimmed) {
  const meta = options.meta || {}
  if (realMeta && realMeta.video_url) return realMeta.video_url
  if (meta.videoUrl) return meta.videoUrl
  if (isDirectVideoUrl(trimmed)) return trimmed
  return ''
}

/**
 * Resolve video cover URL.
 * @param {object|null} realMeta
 * @param {object} options
 * @returns {string}
 */
function resolveInitialCoverUrl(realMeta, options) {
  const meta = options.meta || {}
  let candidate = ''
  if (realMeta && realMeta.cover_url) {
    candidate = realMeta.cover_url
  } else if (meta.coverUrl) {
    candidate = meta.coverUrl
  }

  if (candidate && !candidate.includes('.heic')) {
    return candidate
  }
  return ''
}

/**
 * Build stream URL string for local media.
 * @param {string|null} localVideoPath
 * @param {string} videoPlayUrl
 * @param {boolean} isHttp
 * @param {string} trimmed
 * @returns {string}
 */
function buildStreamUrl(localVideoPath, videoPlayUrl, isHttp, trimmed) {
  if (localVideoPath) {
    return `/omnimux/video-preview/stream?path=${encodeURIComponent(localVideoPath)}`
  }
  if (videoPlayUrl) return videoPlayUrl
  return isHttp ? trimmed : ''
}

/**
 * Check whether a container object holds a non-nullish metric value.
 * @param {object|null} container
 * @param {string} key
 * @returns {boolean}
 */
function hasMetricValue(container, key) {
  if (!container) return false
  const val = container[key]
  return val !== undefined && val !== null
}

/**
 * Pick single stat string value.
 * @param {object|null} s
 * @param {object} m
 * @param {string} key
 * @returns {string}
 */
function pickStatString(s, m, key) {
  if (hasMetricValue(s, key)) return String(s[key])
  if (hasMetricValue(m, key)) return String(m[key])
  return '0'
}

/**
 * Resolve display statistics from realMeta and fallback options.
 * @param {object|null} realStats
 * @param {object} meta
 * @returns {{ views: string, likes: string, comments: string, shares: string }}
 */
function resolveDisplayStats(realStats, meta) {
  const s = realStats || null
  const m = meta || {}
  return {
    views: pickStatString(s, m, 'views'),
    likes: pickStatString(s, m, 'likes'),
    comments: pickStatString(s, m, 'comments'),
    shares: pickStatString(s, m, 'shares'),
  }
}

/**
 * Resolve local video file by path or cache download.
 * @param {boolean} isLocalFile
 * @param {string} trimmed
 * @param {string} videoPlayUrl
 * @param {object} options
 * @returns {Promise<string|null>}
 */
async function resolveLocalVideoTarget(isLocalFile, trimmed, videoPlayUrl, options) {
  if (isLocalFile) return resolve(trimmed)
  if (videoPlayUrl && isDirectVideoUrl(videoPlayUrl)) {
    return downloadVideoToWorkspaceCache(videoPlayUrl, options)
  }
  return null
}

/**
 * Resolve total video duration in seconds.
 * @param {object|null} realMeta
 * @param {object} meta
 * @returns {number}
 */
function resolveTotalDuration(realMeta, meta) {
  if (realMeta && typeof realMeta.duration === 'number') {
    return realMeta.duration
  }
  if (meta && typeof meta.duration === 'number') {
    return meta.duration
  }
  return 16
}

/**
 * Resolve calculated duration seconds from final shot.
 * @param {object|undefined} lastShot
 * @param {number} totalDuration
 * @returns {number}
 */
function resolveDurationSeconds(lastShot, totalDuration) {
  if (lastShot && typeof lastShot.end_seconds === 'number') {
    return lastShot.end_seconds
  }
  return totalDuration || 16
}

/**
 * Build video object payload for breakdown result.
 * @param {object} config
 * @returns {object}
 */
function buildVideoPayload(config) {
  const {
    authorInfo, platform, isHttp, trimmed, videoPlayUrl,
    localVideoPath, localCoverPath, coverUrl, durationSeconds,
    shots, stats, realMeta,
  } = config

  return {
    title: authorInfo.title,
    author_name: authorInfo.authorName,
    author_handle: authorInfo.authorHandle,
    author_avatar: authorInfo.authorAvatar,
    caption: authorInfo.caption,
    platform,
    source_url: isHttp ? trimmed : '',
    video_url: videoPlayUrl,
    stream_url: buildStreamUrl(localVideoPath, videoPlayUrl, isHttp, trimmed),
    cover_url: localCoverPath ? `/omnimux/video-preview/stream?path=${encodeURIComponent(localCoverPath)}` : coverUrl,
    duration_seconds: durationSeconds,
    duration_text: formatTime(durationSeconds),
    scene_count: shots.length,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    shares: stats.shares,
    ai_labeled: Boolean(realMeta),
  }
}

/**
 * Analyze input video URL or local path and extract structured breakdown data with real media extraction.
 * @param {string} inputUrl
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function extractVideoBreakdown(inputUrl, options = {}) {
  const trimmed = String(inputUrl || '').trim()
  const existing = readExistingBreakdownFile(trimmed)
  if (existing) return existing

  const isLocalFile = trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')
  const isHttp = /^https?:\/\//i.test(trimmed)
  const platform = detectSocialPlatform(trimmed)
  const ctx = options.ctx || {}
  const realMeta = isHttp ? await fetchRealSocialMetadata(trimmed, ctx) : null

  const authorInfo = resolveAuthorInfo(realMeta, options)
  const videoPlayUrl = resolveVideoPlaybackUrl(realMeta, options, trimmed)
  const coverUrl = resolveInitialCoverUrl(realMeta, options)

  const meta = options.meta || {}
  const totalDuration = resolveTotalDuration(realMeta, meta)

  const localVideoPath = await resolveLocalVideoTarget(isLocalFile, trimmed, videoPlayUrl, options)
  const localCoverPath = extractVideoCoverFrame(localVideoPath)
  const analysisVideoPath = prepareAnalysisSampleVideo(localVideoPath)
  const physicalScenes = await tryDetectPhysicalScenes(localVideoPath, ctx)

  const { shots, structure, pipeline } = await resolveBreakdownData({
    analysisVideoPath,
    ctx,
    signal: options.signal,
    totalDuration,
    caption: authorInfo.caption,
    platform,
    physicalScenes,
  })

  const lastShot = shots[shots.length - 1]
  const durationSeconds = resolveDurationSeconds(lastShot, totalDuration)
  const stats = resolveDisplayStats(realMeta ? realMeta.stats : null, meta)

  const video = buildVideoPayload({
    authorInfo, platform, isHttp, trimmed, videoPlayUrl,
    localVideoPath, localCoverPath, coverUrl, durationSeconds,
    shots, stats, realMeta,
  })

  return {
    schema_version: '1.0.0',
    is_video_breakdown: true,
    analyzed_at: new Date().toISOString(),
    video,
    pipeline,
    shots,
    structure,
  }
}
