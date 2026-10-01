import { createVideoStreamUrl } from '../stream-capability.js'
/**
 * @file plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js
 * Video breakdown multimodal analysis pipeline and artifact extraction.
 */

import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { downloadMedia } from '../download-helper.js'
import { detectPhysicalScenes } from '../scene-detect.js'
import { formatTime } from './timeUtils.js'
import { parsePipelineAndStructureFromMarkdown } from './structureParser.js'
import { detectSocialPlatform, fetchRealSocialMetadata } from './socialMetadata.js'
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
 * Query textComplete service directly from ctx or explicit options.
 * @param {object} ctx
 * @param {object} [options]
 * @returns {object|null}
 */
function queryDirectTextComplete(ctx, options = {}) {
  if (options && options.textComplete) return options.textComplete
  if (options && options.options && options.options.textComplete) return options.options.textComplete
  if (ctx) {
    if (ctx.textComplete) return ctx.textComplete
    if (typeof ctx.get === 'function') {
      const direct = ctx.get('textComplete')
      if (direct) return direct
    }
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
 * @param {object} [options]
 * @returns {object|null}
 */
function resolveTextCompleteService(ctx, options = {}) {
  const direct = queryDirectTextComplete(ctx, options)
  if (direct) return direct
  return queryToolsTextComplete(ctx)
}

/**
 * Build structured user instruction for multimodal video analysis using Chain-of-Thought principles.
 * @param {string} systemPrompt
 * @returns {string}
 */
function buildStructureInstruction(systemPrompt) {
  return `${systemPrompt}\n\n---\n【思维链 (CoT) 深度拉片任务执行指令（严格遵守）】：\n请在内心严格执行 5 步思维链（音画全景扫描与台词完整转写 -> 商业漏斗五阶段对齐 -> 核心台词原声锚定 -> 操盘手心理学与转化策略深度解构 -> 逐镜头 4 维正交分镜表征），严格按照上述格式规范输出：\n1. 【叙事结构链路】：带货好物类视频标准五阶段严格为：Hook → Product Intro → Usage Detail → Proof Effect → Cta，严禁自行编造长句或加序数前缀！\n2. 【结构阶段解构】：每一个阶段必须使用对应的标准英文阶段名作为 ### 标头，且标头下方必须包含一条以 > 开头的英文原声核心完整台词引用（严禁截取半句、严禁只写环境音！），随后紧跟一段 40~80 字专业中文策略意图与爆款心理机制解析！\n3. 【逐镜头分镜脚本表】：表头严格为“| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |”；\n4. 【4维正交标签规范】：第 4 列“镜头属性标签”必须由 4 个正交维度的标准参数组成（以逗号分隔）：[景别], [机位设备], [拍摄视角], [运镜方式]（例如：中景, 智能手机手持, 平视, 手持微晃），绝对严禁使用斜杠“/”，绝对严禁将环境地点塞入标签！\n5. 【严禁机械词】：分镜标题必须是具体的画面事件（如“卫生间偷窥情景”、“窗外视角无法透视”、“产品展开介绍”），严禁出现 Shot 1、全景等机械词！\n6. 【直接输出规范】：请直接从“## 1. 叙事结构链路 (Narrative Pipeline)”作为首行开始输出，严禁输出任何开场白、英文思考草稿或前置客套话！`
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
  const res = await textComplete.execute(params)
  if (typeof res === 'string') return res.trim()
  if (res && typeof res.text === 'string') return res.text.trim()
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
  const textComplete = resolveTextCompleteService(ctx, options)
  if (!textComplete || typeof textComplete.execute !== 'function') {
    throw new Error('多模态分析服务未就绪：当前中枢未提供 textComplete 能力')
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
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '00:00:01', '-i', localVideoPath, '-vframes', '1', candidateCover], { timeout: 5000 })
    }
    if (existsSync(candidateCover)) {
      return candidateCover
    }
  } catch {}
  return null
}

const SAMPLE_SIZE_LIMIT_BYTES = 20 * 1024 * 1024

/**
 * ffmpeg transcode tiers for oversized analysis samples.
 * Audio is always kept (the structure prompt requires verbatim speech quotes),
 * so `-an` must never appear here.
 */
const SAMPLE_TRANSCODE_TIERS = [
  ['-vf', 'fps=1,scale=720:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '64k'],
  ['-vf', 'fps=1/2,scale=480:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-c:a', 'aac', '-b:a', '64k'],
]

/**
 * Compress oversized video files (> 20MiB) for multimodal models.
 * Keeps the audio track and retries with a lower-quality tier when the first
 * sample still exceeds the limit. Throws a Chinese guidance error instead of
 * silently returning the original oversized path.
 * @param {string|null} localVideoPath
 * @param {{ execFileSync?: Function }} [deps] injectable for tests
 * @returns {string|null}
 */
export function prepareAnalysisSampleVideo(localVideoPath, deps = {}) {
  if (!localVideoPath || !existsSync(localVideoPath)) return null
  const runFfmpeg = deps.execFileSync || execFileSync

  let stats
  try {
    stats = statSync(localVideoPath)
  } catch {
    return null
  }
  if (stats.size <= SAMPLE_SIZE_LIMIT_BYTES) {
    return localVideoPath
  }

  const ext = extname(localVideoPath)
  const stem = ext ? localVideoPath.slice(0, -ext.length) : localVideoPath
  const samplePath = `${stem}_sample.mp4`

  // Reuse an already-valid sample produced by a previous run.
  try {
    if (existsSync(samplePath) && statSync(samplePath).size <= SAMPLE_SIZE_LIMIT_BYTES) {
      return samplePath
    }
  } catch {}

  const sizeMiB = (stats.size / (1024 * 1024)).toFixed(1)
  let lastError = null
  for (const tierArgs of SAMPLE_TRANSCODE_TIERS) {
    try {
      runFfmpeg('ffmpeg', ['-v', 'error', '-y', '-i', localVideoPath, ...tierArgs, samplePath], { timeout: 30000 })
      if (existsSync(samplePath) && statSync(samplePath).size <= SAMPLE_SIZE_LIMIT_BYTES) {
        return samplePath
      }
    } catch (err) {
      lastError = err
    }
    try {
      if (existsSync(samplePath)) unlinkSync(samplePath)
    } catch {}
  }

  throw new Error(
    `视频样片生成失败或压缩后仍超过 20MiB 上限（原文件 ${sizeMiB}MiB，已尝试 ${SAMPLE_TRANSCODE_TIERS.length} 档压缩参数），请截取视频片段后再试。${lastError ? `底层原因：${lastError.message}` : ''}`
  )
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
 * Derive structure cards directly from real parsed shots when dedicated structure is degenerate.
 * @param {Array<object>} shots
 * @returns {Array<object>}
 */
function deriveStructureFromShots(shots) {
  if (!Array.isArray(shots) || shots.length === 0) return []
  const stageMap = new Map()
  for (const shot of shots) {
    const stage = shot.stage || 'Hook'
    if (!stageMap.has(stage)) {
      stageMap.set(stage, {
        stage,
        title: shot.title || stage,
        description: shot.description || '',
      })
    }
  }
  return Array.from(stageMap.values())
}

/**
 * Detect companion subtitle file (.srt, .vtt) in the same directory as the target video.
 * @param {string} videoPath
 * @returns {{ path: string, filename: string, linesCount: number }|null}
 */
export function detectCompanionSubtitle(videoPath) {
  if (!videoPath || typeof videoPath !== 'string') return null
  try {
    const dir = dirname(videoPath)
    const ext = extname(videoPath)
    const baseName = basename(videoPath, ext)
    if (existsSync(dir)) {
      const files = readdirSync(dir)
      const prefixMatch = files.find((f) => {
        const lower = f.toLowerCase()
        return (lower.endsWith('.srt') || lower.endsWith('.vtt')) && f.startsWith(baseName)
      })
      const candidate = prefixMatch || files.find((f) => {
        const lower = f.toLowerCase()
        return lower.endsWith('.srt') || lower.endsWith('.vtt')
      })
      if (candidate) {
        const subPath = join(dir, candidate)
        const content = readFileSync(subPath, 'utf8')
        const linesCount = content.split('\n').length
        return { path: subPath, filename: candidate, linesCount }
      }
    }
  } catch {}
  return null
}

/**
 * Try resolving virtual references (e.g. @materials/templates/tpl-xxx.mp4, @trending/xxxx.mp4, @inspiration/insp_xxxx.mp4)
 * to its direct playable/downloadable video URL from template catalog or inspiration API.
 * @param {string} trimmed
 * @param {object} [options]
 * @returns {Promise<string|null>|string|null}
 */
export async function resolveVirtualTemplateVideoUrl(trimmed, options = {}) {
  if (typeof trimmed !== 'string') return null
  const meta = options.meta || {}
  if (meta.videoUrl && isDirectVideoUrl(meta.videoUrl)) {
    return meta.videoUrl
  }

  // 1. 匹配模板 ID (tpl-*)
  const tplMatch = trimmed.match(/(?:@?materials\/templates\/|@?templates\/)?(tpl-[a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?$/i)
  if (tplMatch) {
    const templateId = tplMatch[1]
    const candidatePaths = [
      join(HERE, '../../../omnimux/src/templates/creative-templates.json'),
      join(HERE, '../../../omnimux/src/client/session-guide/templates/creative-templates.json'),
      process.env.DSH_HOME ? join(process.env.DSH_HOME, 'profiles/omnimux/node_modules/omnimux/src/templates/creative-templates.json') : null,
      process.env.HOME ? join(process.env.HOME, '.dsh/profiles/omnimux/node_modules/omnimux/src/templates/creative-templates.json') : null,
      process.env.HOME ? join(process.env.HOME, '.omnimux/profiles/omnimux/node_modules/omnimux/src/templates/creative-templates.json') : null,
    ].filter(Boolean)

    for (const p of candidatePaths) {
      try {
        if (existsSync(p)) {
          const raw = JSON.parse(readFileSync(p, 'utf8'))
          if (Array.isArray(raw)) {
            const found = raw.find((t) => t && (t.id === templateId || t.appId === templateId))
            if (found && typeof found.previewVideoUrl === 'string' && found.previewVideoUrl.startsWith('http')) {
              return found.previewVideoUrl
            }
          }
        }
      } catch {}
    }
  }

  // 2. 匹配爆款/灵感条目 ID (@trending/2789.mp4 或 @inspiration/2789)
  const trendingMatch = trimmed.match(/(?:@?materials\/trending\/|@?trending\/|@?inspiration\/)([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?$/i)
  if (trendingMatch) {
    const itemId = trendingMatch[1]
    try {
      const port = process.env.DSH_PORT || '45120'
      const res = await fetch(`http://127.0.0.1:${port}/omnimux/inspiration/${itemId}`)
      if (res.ok) {
        const json = await res.json()
        const item = json.data || json
        if (item) {
          if (item.type === 'image') {
            throw new Error(`所选素材「${item.title || itemId}」为图文轮播（Carousel 图片卡片，共 ${item.media_keys?.length || 1} 页），不是视频文件，无法执行逐镜头视听拉片。请直接查看图文分屏解析或使用图文分析技能。`)
          }
          if (item.video_url && isDirectVideoUrl(item.video_url)) {
            return item.video_url
          }
          if (Array.isArray(item.media_keys)) {
            const vid = item.media_keys.find((k) => /\.(mp4|mov|webm)/i.test(k))
            if (vid) {
              return vid.startsWith('http') ? vid : `http://127.0.0.1:${port}${vid.startsWith('/') ? '' : '/'}${vid}`
            }
          }
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('图文轮播')) throw err
    }
  }

  return null
}

/**
 * Classify the raw model response into a graded failure-reason hint.
 * @param {string} reportText
 * @returns {string}
 */
function classifyFailureContentHint(reportText) {
  if (typeof reportText !== 'string' || reportText.trim().length === 0) {
    return '模型未返回任何内容'
  }
  if (reportText.includes('|')) {
    return '模型返回了表格但无合法分镜行'
  }
  return '模型返回了非结构化文本'
}

/**
 * Persist the raw model response next to the video for diagnostics.
 * Never throws — a failed write must not block the error path.
 * @param {string|null} videoPath
 * @param {string} reportText
 * @returns {string|null} absolute path of the written diagnostic file
 */
function persistFailureDiagnosticReport(videoPath, reportText) {
  if (!videoPath || typeof videoPath !== 'string') return null
  try {
    const ext = extname(videoPath)
    const stem = ext ? videoPath.slice(0, -ext.length) : videoPath
    const diagPath = `${stem}.breakdown-failed.md`
    writeFileSync(diagPath, typeof reportText === 'string' ? reportText : '', 'utf8')
    return diagPath
  } catch {
    return null
  }
}

/**
 * Build structured breakdown failure guidance message with companion awareness and DSH prompt directives.
 * @param {string} videoPath
 * @param {number} [totalDuration]
 * @param {{ reportText?: string, savedReportPath?: string|null }} [diagnostics]
 * @returns {string}
 */
export function buildBreakdownFailureGuidance(videoPath, totalDuration, diagnostics = {}) {
  const subtitle = detectCompanionSubtitle(videoPath)
  const isShort = typeof totalDuration === 'number' && totalDuration > 0 && totalDuration <= 120
  const subtitleNotice = subtitle
    ? `【系统感知】：已在同目录检测到配套字幕文件「${subtitle.filename}」（共 ${subtitle.linesCount.toLocaleString()} 行）。`
    : `【系统感知】：未在同目录检测到伴生字幕文件。`

  const subtitleOptionLabel = subtitle
    ? '使用字幕快速提炼 (Recommended)'
    : '使用字幕快速提炼'
  const subtitleOptionDesc = subtitle
    ? `跳过逐镜头视觉拆解，直接根据全片字幕（${subtitle.filename}）提炼对话核心观点与大纲`
    : '跳过逐镜头视觉拆解，若有字幕文件可直接提炼对话核心观点与大纲'

  const contentHint = typeof diagnostics.reportText === 'string'
    ? `${classifyFailureContentHint(diagnostics.reportText)}；`
    : ''
  const failureReason = isShort
    ? `视频视听拆解失败：多模态模型未解析出有效分镜（${contentHint}请确认视觉大模型服务连通性后重试，或检查视频画面内容）。`
    : `视频视听拆解失败：多模态模型未解析出有效分镜（${contentHint}当前视频时长或内容结构超出短视频逐镜头拉片规格，如访谈播客或长视频）。`

  const opt3Label = isShort ? '检查模型服务后重试 (Recommended)' : '检查模型服务后重试'

  const lines = [
    failureReason,
    subtitleNotice,
    '【智能体行动准则（强制遵守）】：',
    '1. 严禁私自直接调用读取工具读取成千上万行的超长大文件（避免对话上下文被撑爆与巨额 Token 浪费）！',
    '2. 严禁擅自替用户做降级决定！',
    '3. 你必须立即调用原生交互工具 `ask_user_question` 向用户呈现单选决策卡片，交由用户拍板后继续：',
    `   - 选项 1：label: "${subtitleOptionLabel}", description: "${subtitleOptionDesc}"`,
    '   - 选项 2：label: "截取前 2 分钟切片拆解", description: "提取片头精华短视频切片，重新发起逐镜头画面拉片与分镜分析"',
    `   - 选项 3：label: "${opt3Label}", description: "若原片本身即为短视频，请确认视觉大模型服务连通性后重试"`,
    '等待用户在界面点击选择后，严格根据用户的决策分支执行后续操作。',
  ]
  if (diagnostics.savedReportPath) {
    lines.push(`诊断原始响应已保存至: ${diagnostics.savedReportPath}`)
  }
  return lines.join('\n')
}

/**
 * Resolve shots, structure and pipeline via multimodal LLM.
 * Strictly throws upon analysis failure instead of generating fake fallback data.
 * @param {object} params
 * @returns {Promise<{ shots: Array<object>, structure: Array<object>, pipeline: Array<string>, isModelGenerated: boolean }>}
 */
async function resolveBreakdownData(params) {
  const { analysisVideoPath, localVideoPath, ctx, options, signal, physicalScenes, totalDuration } = params
  let analyzeReportText = ''
  if (analysisVideoPath) {
    analyzeReportText = await executeDedicatedStructureAnalyze({
      videoPath: analysisVideoPath,
      ctx,
      options,
      signal,
      physicalScenes,
    })
  }

  const parsed = parsePipelineAndStructureFromMarkdown(analyzeReportText)
  let shots = parsed.shots
  let structure = parsed.structure
  let pipeline = parsed.pipeline

  alignPhysicalScenesToShots(shots, physicalScenes)

  if (shots.length === 0) {
    const diagVideoPath = localVideoPath || analysisVideoPath
    const savedReportPath = persistFailureDiagnosticReport(diagVideoPath, analyzeReportText)
    const guidance = buildBreakdownFailureGuidance(diagVideoPath, totalDuration, {
      reportText: analyzeReportText,
      savedReportPath,
    })
    throw new Error(guidance)
  }

  if (isStructureResultDegenerate(structure)) {
    structure = deriveStructureFromShots(shots)
    pipeline = structure.map((s) => s.stage)
  }

  const isModelGenerated = true

  return { shots, structure, pipeline, isModelGenerated }
}

/**
 * Resolve video direct playback url.
 * @param {object|null} realMeta
 * @param {object} options
 * @param {string} trimmed
 * @returns {Promise<string>|string}
 */
async function resolveVideoPlaybackUrl(realMeta, options, trimmed) {
  const meta = options.meta || {}
  if (realMeta && realMeta.video_url) return realMeta.video_url
  if (meta.videoUrl) return meta.videoUrl
  if (isDirectVideoUrl(trimmed)) return trimmed
  const virtualTpl = await resolveVirtualTemplateVideoUrl(trimmed, options)
  if (virtualTpl) return virtualTpl
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
    return createVideoStreamUrl(localVideoPath)
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
async function resolveLocalVideoTarget(isLocalFile, trimmed, videoPlayUrl, options = {}) {
  if (options.localVideoPath && existsSync(options.localVideoPath)) return resolve(options.localVideoPath)
  if (isLocalFile && existsSync(trimmed)) return resolve(trimmed)
  const candidateUrl = (videoPlayUrl && isDirectVideoUrl(videoPlayUrl))
    ? videoPlayUrl
    : await resolveVirtualTemplateVideoUrl(trimmed, options)
  if (candidateUrl && isDirectVideoUrl(candidateUrl)) {
    return downloadVideoToWorkspaceCache(candidateUrl, options)
  }
  if (isLocalFile) return resolve(trimmed)
  return null
}

/**
 * Parse the mvhd movie-header duration inside a single ISO-BMFF box range.
 * @param {number} fd open file descriptor
 * @param {number} payloadStart absolute offset of the mvhd payload
 * @param {number} boxEnd absolute end offset of the mvhd box
 * @returns {number|undefined} duration in seconds, or undefined when malformed
 */
function readMvhdDurationSeconds(fd, payloadStart, boxEnd) {
  if (payloadStart + 4 > boxEnd) return undefined
  const probeSize = Math.min(32, boxEnd - payloadStart)
  const buf = Buffer.alloc(probeSize)
  if (readSync(fd, buf, 0, probeSize, payloadStart) < 4) return undefined
  const version = buf[0]
  let timescaleOffset = -1
  let durationOffset = -1
  let durationIs64Bit = false
  if (version === 0) {
    timescaleOffset = 12
    durationOffset = 16
  } else if (version === 1) {
    timescaleOffset = 20
    durationOffset = 24
    durationIs64Bit = true
  } else {
    return undefined
  }
  if (timescaleOffset + 4 > probeSize || durationOffset + (durationIs64Bit ? 8 : 4) > probeSize) {
    return undefined
  }
  const timescale = buf.readUInt32BE(timescaleOffset)
  const duration = durationIs64Bit ? buf.readBigUInt64BE(durationOffset) : buf.readUInt32BE(durationOffset)
  if (timescale === 0) return undefined
  const seconds = typeof duration === 'bigint' ? Number(duration) / timescale : duration / timescale
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

/**
 * Scan ISO-BMFF boxes inside [start, end) looking for the mvhd box.
 * @param {number} fd open file descriptor
 * @param {number} start absolute start offset
 * @param {number} end absolute end offset
 * @returns {number|undefined}
 */
function scanIsoBmffDuration(fd, start, end) {
  let offset = start
  while (offset + 8 <= end) {
    const header = Buffer.alloc(16)
    if (readSync(fd, header, 0, 16, offset) < 8) return undefined
    const size32 = header.readUInt32BE(0)
    const type = header.toString('ascii', 4, 8)
    let headerSize = 8
    let boxSize = size32
    if (size32 === 1) {
      if (offset + 16 > end) return undefined
      const size64 = header.readBigUInt64BE(8)
      if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
      boxSize = Number(size64)
      headerSize = 16
    } else if (size32 === 0) {
      boxSize = end - offset
    }
    if (boxSize < headerSize || offset + boxSize > end) return undefined
    const payloadStart = offset + headerSize
    const boxEnd = offset + boxSize
    if (type === 'mvhd') {
      return readMvhdDurationSeconds(fd, payloadStart, boxEnd)
    }
    if (type === 'moov') {
      const nested = scanIsoBmffDuration(fd, payloadStart, boxEnd)
      if (nested !== undefined) return nested
    }
    offset = boxEnd
  }
  return undefined
}

/**
 * Probe a local MP4/QuickTime file for its true duration by reading the
 * ISO-BMFF mvhd movie-header box (equivalent of omnimux durationFromIsoBmff,
 * reimplemented locally to avoid cross-plugin imports).
 * Fails closed: any parse error returns undefined.
 * @param {string} filePath
 * @returns {number|undefined}
 */
function probeLocalVideoDurationSeconds(filePath) {
  let fd
  try {
    fd = openSync(filePath, 'r')
    const fileSize = fstatSync(fd).size
    return scanIsoBmffDuration(fd, 0, fileSize)
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

/**
 * Resolve total video duration in seconds.
 * Priority: realMeta.duration -> meta.duration -> local ISO-BMFF mvhd probe -> 16.
 * @param {object|null} realMeta
 * @param {object} meta
 * @param {string|null} [localVideoPath]
 * @returns {number}
 */
function resolveTotalDuration(realMeta, meta, localVideoPath) {
  if (realMeta && typeof realMeta.duration === 'number') {
    return realMeta.duration
  }
  if (meta && typeof meta.duration === 'number') {
    return meta.duration
  }
  if (localVideoPath && typeof localVideoPath === 'string' && existsSync(localVideoPath)) {
    const probed = probeLocalVideoDurationSeconds(localVideoPath)
    if (typeof probed === 'number' && Number.isFinite(probed) && probed > 0) {
      return probed
    }
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
    shots, stats, realMeta, isModelGenerated,
  } = config

  let displayTitle = authorInfo.title
  let displayCaption = authorInfo.caption
  if (isModelGenerated && (!displayTitle || displayTitle === '短视频分析') && shots[0] && shots[0].title) {
    displayTitle = shots[0].title
    if (!displayCaption || displayCaption === '短视频分析') {
      displayCaption = shots[0].description ? `${shots[0].title}：${shots[0].description}` : shots[0].title
    }
  }

  return {
    title: displayTitle,
    author_name: authorInfo.authorName,
    author_handle: authorInfo.authorHandle,
    author_avatar: authorInfo.authorAvatar,
    caption: displayCaption,
    platform,
    source_url: isHttp ? trimmed : '',
    video_url: videoPlayUrl,
    stream_url: buildStreamUrl(localVideoPath, videoPlayUrl, isHttp, trimmed),
    cover_url: localCoverPath ? createVideoStreamUrl(localCoverPath) : coverUrl,
    duration_seconds: durationSeconds,
    duration_text: formatTime(durationSeconds),
    scene_count: shots.length,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    shares: stats.shares,
    ai_labeled: Boolean(realMeta || isModelGenerated),
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
  const videoPlayUrl = await resolveVideoPlaybackUrl(realMeta, options, trimmed)
  const coverUrl = resolveInitialCoverUrl(realMeta, options)

  const meta = options.meta || {}

  const localVideoPath = await resolveLocalVideoTarget(isLocalFile, trimmed, videoPlayUrl, options)
  if (!localVideoPath || !existsSync(localVideoPath)) {
    throw new Error(
      `无法获取或下载可供分析的视频文件：${trimmed}。对于长视频或受限平台的视频，请先将视频下载到本地工作区，再传入本地文件路径进行拆解。`
    )
  }
  const totalDuration = resolveTotalDuration(realMeta, meta, localVideoPath)
  const localCoverPath = extractVideoCoverFrame(localVideoPath)
  const analysisVideoPath = prepareAnalysisSampleVideo(localVideoPath)
  const physicalScenes = await tryDetectPhysicalScenes(localVideoPath, ctx)

  const { shots, structure, pipeline, isModelGenerated } = await resolveBreakdownData({
    analysisVideoPath,
    localVideoPath,
    ctx,
    options,
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
    shots, stats, realMeta, isModelGenerated,
  })

  return {
    schema_version: '1.0.0',
    is_video_breakdown: true,
    analyzed_at: new Date().toISOString(),
    video,
    pipeline,
    shots,
    structure,
    ...(localVideoPath ? { local_video_path: localVideoPath } : {}),
  }
}
