// 爆款复刻：把参考视频拆解成结构化分镜，再编译成可直接提交的生成提示词。
//
// 产品承诺：参考视频只是拆解材料，永远不进入视频生成请求。提交体只有参考图 +
// 编译后的提示词；这一点由 motion 的 seam 载荷断言钉住，不靠文案保证。
//
// 只用中枢公开 seam：videoProcess（等距抽帧，来自 omnimux-video 插件）、
// textComplete（拆解与编译两轮）、mediaInspect（素材真值，经 resolveAssets）。
// 不导入中枢私有模块、不持密钥、不发裸模型请求。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AvatarError } from './store.js'
import { launchMotionTask } from './motion.js'

// 等距抽帧预算：与源产品一致（6–12 帧、约 1.2 秒一帧、512 长边）。
// 不用 video_scene_detect：它按场景切换选帧，长镜头会返回 0 帧。
const FRAME_MIN_COUNT = 6
const FRAME_MAX_COUNT = 12
const FRAME_SECONDS_PER = 1.2
const FRAME_MAX_EDGE = 512
const MIN_SECONDS = 4
const MAX_SECONDS = 30
const MAX_IMAGES = 30
const MAX_PROMPT_CHARS = 4000
const ANALYSIS_MAX_TOKENS = 4096
const COMPOSE_MAX_TOKENS = 2048

const invalid = message => new AvatarError('invalid_request', message, 400)
const unanalysable = message => new AvatarError('needs-analysis', message, 503)
const messageOf = error => (error instanceof Error ? error.message : String(error))

/**
 * 等距抽帧的时间点（秒），从 0 开始，全部落在片长以内。
 * 帧数 = clamp(6, 12, ceil(时长 / 1.2))。
 */
export function framePlan(durationSec) {
  const duration = Number(durationSec)
  if (!Number.isFinite(duration) || duration <= 0) return []
  const count = Math.min(FRAME_MAX_COUNT, Math.max(FRAME_MIN_COUNT, Math.ceil(duration / FRAME_SECONDS_PER)))
  return Array.from({ length: count }, (_, index) => Number(((index * duration) / count).toFixed(3)))
}

/** 输出时长跟随参考片，并夹在 4–30 整秒。 */
export function clampDuration(value) {
  const duration = Number(value)
  if (!Number.isFinite(duration)) throw invalid('拆解结果缺少有效时长，请重新拆解参考视频')
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(duration)))
}

/** 剥掉模型可能带的 Markdown 围栏，保留 JSON 正文。 */
function stripFence(text) {
  const raw = String(text ?? '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : raw).trim()
}

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** 只保留已知字段；模型多给的字段不进任务记录。 */
function normalizeShot(row, index) {
  const shot = row && typeof row === 'object' && !Array.isArray(row) ? row : {}
  const shotId = typeof shot.shot_id === 'string' && shot.shot_id.trim() !== '' ? shot.shot_id.trim() : `s${index + 1}`
  return {
    shot_id: shotId,
    start_s: finiteNumber(shot.start_s),
    end_s: finiteNumber(shot.end_s),
    shot_size: typeof shot.shot_size === 'string' ? shot.shot_size : '',
    narrative_job: typeof shot.narrative_job === 'string' ? shot.narrative_job : '',
  }
}

/**
 * 拆解结果门禁：解析不出来、或没有任何可用分镜，都明确报错，
 * 不让一段散文回答变成计费提示词的输入。
 */
export function parseAnalysis(text) {
  const body = stripFence(text)
  if (body === '') throw unanalysable('参考视频拆解结果为空，请重试')
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    throw unanalysable('参考视频拆解结果无法解析，请换一段视频重试')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw unanalysable('参考视频拆解结果格式不正确，请换一段视频重试')
  const shots = (Array.isArray(parsed.shots) ? parsed.shots : []).map(normalizeShot)
  if (shots.length === 0) throw unanalysable('参考视频没有可用分镜，请换一段视频重试')
  const mechanism = parsed.hook?.mechanism
  const hook = Array.isArray(mechanism)
    ? mechanism.filter(item => typeof item === 'string' && item.trim() !== '').map(item => item.trim()).join('，')
    : typeof mechanism === 'string' ? mechanism.trim() : ''
  return { shots, hook, analysisJson: body }
}

function analysisPrompt({ frames, imageCount, durationSec, intent }) {
  return [
    '你在做短视频爆款结构拆解。参考视频只用于拆解，不会交给视频生成模型。',
    `参考视频时长 ${durationSec} 秒。下面按时间戳升序给出 ${frames.length} 张关键帧，一张图一帧。`,
    `关键帧时间戳（秒）：${frames.map(frame => frame.timeSeconds).join(', ')}`,
    `用户参考图共 ${imageCount} 张，编号 image 1 起，按上传顺序；只用于锁定主体外观，不参与镜头结构判断。`,
    `用户意图：${intent || '未指定（按结构 1:1 迁移到参考图主体）'}`,
    '只根据这些帧判断镜头切分与节奏；不要编造未出现的人物、台词、产品或时间码。',
    '只输出一个 JSON 对象，不要解释、不要 Markdown 代码围栏，字段如下：',
    '{"shots":[{"shot_id":"s1","start_s":0,"end_s":2.4,"shot_size":"近景","narrative_job":"开场钩子"}],"hook":{"mechanism":["..."],"why_it_stops_scroll":"..."}}',
    `shots 至少 1 条，按 start_s 升序，end_s 大于 start_s，最后一条 end_s 不超过 ${durationSec}。`,
  ].join('\n')
}

function composePrompt({ analysisJson, imageCount, durationSec, resolution, intent }) {
  return [
    '把下面的结构拆解编译成一条可以直接提交给视频模型的生成提示词。',
    '硬约束：提示词里不能出现「参考视频 / 原片 / 原视频 / reference clip / footage」这类措辞——不会有任何视频素材被提交，主体只能来自参考图。',
    `参考图共 ${imageCount} 张，编号 image 1 起；必须把 image 1 作为主体，需要时按编号引用其它 image。`,
    '提示词必须包含画面干净、无字幕、无水印、无文字叠加的约束；不要要求生成字幕、标题卡或 logo（后期再加）。',
    `目标时长 ${durationSec} 秒，清晰度 ${resolution}，画幅跟随参考视频。`,
    `用户意图：${intent || '未指定（按结构 1:1 迁移到参考图主体）'}`,
    `参考视频结构化拆解（JSON）：\n${analysisJson}`,
    `只输出提示词正文本身，不超过 ${MAX_PROMPT_CHARS} 字，不要 JSON、不要解释、不要 Markdown 围栏。`,
  ].join('\n')
}

export function createRecreate({ ctx, store, paths, materials, resolveAssets, onReady } = {}) {
  /** 拆解能力：缺一个就明确报 needs-analysis，不空转、不静默降级。 */
  function analysisSeams() {
    const videoProcess = ctx?.get?.('videoProcess')
    if (!videoProcess?.execute) throw unanalysable('视频分析能力未就绪，请安装或启用 omnimux-video 插件')
    const textComplete = ctx?.get?.('textComplete')
    if (!textComplete?.execute) throw unanalysable('文本能力未就绪，请在创作中枢配置文本模型渠道')
    return { videoProcess, textComplete }
  }

  /**
   * 等距抽帧。尾部时间点取不到帧是正常情况（长镜头、关键帧对齐），
   * 按实际拿到的帧继续；一帧都拿不到才失败。
   */
  async function extractFrames({ videoProcess, videoPath, durationSec, directory }) {
    const times = framePlan(durationSec)
    const frames = []
    const failures = []
    for (const [index, timeSeconds] of times.entries()) {
      const dest = join(directory, `frame-${String(index + 1).padStart(3, '0')}.jpg`)
      try {
        const result = await videoProcess.execute({
          capability: 'video_thumbnail_extract',
          input: { videoUrl: videoPath, timeSeconds, maxEdge: FRAME_MAX_EDGE },
          dest,
        })
        const file = (Array.isArray(result?.files) ? result.files : []).find(row => typeof row?.path === 'string' && row.path !== '')
        if (!file) { failures.push({ timeSeconds, reason: 'empty' }); continue }
        const actual = finiteNumber(file.meta?.timeSeconds)
        frames.push({ path: file.path, timeSeconds: actual ?? timeSeconds })
      } catch (error) {
        failures.push({ timeSeconds, reason: messageOf(error) })
      }
    }
    if (frames.length === 0) {
      const hint = failures[0]?.reason ? `（${failures[0].reason}）` : ''
      throw unanalysable(`参考视频关键帧提取失败${hint}，请换一段视频重试`)
    }
    return { frames, planned: times.length, failures }
  }

  async function analyze(input = {}) {
    const { avatarId, mode, images, video } = input
    store.get(avatarId)
    if (mode !== undefined && mode !== 'recreate') throw invalid('只有爆款复刻需要拆解参考视频')
    if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) throw invalid(`请选择1–${MAX_IMAGES}张参考图`)
    if (!video || typeof video !== 'object') throw invalid('请选择参考视频后再拆解')
    if (input.prompt !== undefined && typeof input.prompt !== 'string') throw invalid('视频说明必须是文本')
    if (input.intent !== undefined && typeof input.intent !== 'string') throw invalid('视频说明必须是文本')
    // 客户端用 intent，动作复刻沿用 prompt：两个都收，取先有的那个。
    const intent = String(input.intent ?? input.prompt ?? '').trim()
    if (intent.length > MAX_PROMPT_CHARS) throw invalid(`视频说明不能超过${MAX_PROMPT_CHARS}字`)
    if (!resolveAssets) throw new AvatarError('needs-materials', '素材检查能力不可用', 503)
    const { videoProcess, textComplete } = analysisSeams()

    const resolved = await resolveAssets(input)
    const duration = resolved.duration
    if (!Number.isFinite(duration) || duration < MIN_SECONDS || duration > MAX_SECONDS) throw invalid(`参考视频时长需为${MIN_SECONDS}–${MAX_SECONDS}秒`)
    const videoAsset = resolved.assets.find(asset => asset.type === 'video')
    if (!videoAsset?.pathOrUrl) throw invalid('参考视频不可用，请重新选择')
    const imageAssets = resolved.assets.filter(asset => asset.type === 'image')
    if (imageAssets.length !== images.length) throw invalid('参考图不可用，请重新选择')

    const directory = await mkdtemp(join(tmpdir(), 'avatar-recreate-'))
    try {
      const { frames } = await extractFrames({ videoProcess, videoPath: videoAsset.pathOrUrl, durationSec: duration, directory })
      // 第一轮：结构化拆解。关键帧在前、用户参考图在后，顺序即编号。
      const breakdown = await textComplete.execute({
        prompt: analysisPrompt({ frames, imageCount: imageAssets.length, durationSec: Math.round(duration), intent }),
        reason: 'avatar-recreate-breakdown',
        references: [
          ...frames.map(frame => ({ type: 'image', role: 'reference', pathOrUrl: frame.path })),
          ...imageAssets.map(asset => ({ type: 'image', role: 'reference', pathOrUrl: asset.pathOrUrl })),
        ],
        maxTokens: ANALYSIS_MAX_TOKENS,
      })
      const { shots, hook, analysisJson } = parseAnalysis(breakdown?.text)

      const durationSec = clampDuration(duration)
      // 第二轮：编译提示词。参考图仍参与，参考视频不再参与。
      const composed = await textComplete.execute({
        prompt: composePrompt({ analysisJson, imageCount: imageAssets.length, durationSec, resolution: String(input.resolution ?? '480p'), intent }),
        reason: 'avatar-recreate-compose',
        references: imageAssets.map(asset => ({ type: 'image', role: 'reference', pathOrUrl: asset.pathOrUrl })),
        maxTokens: COMPOSE_MAX_TOKENS,
      })
      const prompt = String(composed?.text ?? '').trim()
      if (prompt === '') throw unanalysable('提示词编译结果为空，请重试')
      if (prompt.length > MAX_PROMPT_CHARS) throw unanalysable(`提示词编译结果超过${MAX_PROMPT_CHARS}字，请调整意图后重试`)
      return { prompt, durationSec, shots, hook, analysisJson }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  /**
   * 提交复刻任务：走与动作复刻同一个 video_multi_ref 候选与 videoGenerate seam，
   * 但 references 只有参考图；参考视频只用来取画幅与主体设定，不进请求。
   */
  async function submit(input = {}) {
    const { avatarId } = input
    store.get(avatarId)
    if (!Array.isArray(input.images) || input.images.length < 1 || input.images.length > MAX_IMAGES) throw invalid(`请选择1–${MAX_IMAGES}张参考图`)
    const plan = input.recreate && typeof input.recreate === 'object' ? input.recreate : {}
    const compiled = typeof plan.prompt === 'string' ? plan.prompt.trim() : ''
    if (compiled === '') throw invalid('拆解结果缺失，请重新拆解参考视频')
    if (compiled.length > MAX_PROMPT_CHARS) throw invalid(`提示词不能超过${MAX_PROMPT_CHARS}字`)
    const duration = clampDuration(plan.durationSec)
    if (!resolveAssets) throw new AvatarError('needs-materials', '素材检查能力不可用', 503)

    // 参考视频用来取画幅与主体设定，但不进 assets，因此不可能进生成请求。
    const resolved = await resolveAssets(input, { withVideo: false })
    const imageAssets = resolved.assets.filter(asset => asset.type === 'image')
    if (imageAssets.length !== input.images.length) throw invalid('参考图不可用，请重新选择')
    // 复刻模式没有画幅选择（跟随参考片），客户端不传时固定 9:16。
    const aspectRatio = typeof input.aspectRatio === 'string' && input.aspectRatio !== '' ? input.aspectRatio : resolved.aspectRatio ?? '9:16'
    const resolution = typeof input.resolution === 'string' && input.resolution !== '' ? input.resolution : '480p'
    const parameters = { ...(input.effectiveParameters ?? {}), resolution, aspectRatio, duration }
    const snapshot = {
      mode: 'recreate',
      images: input.images,
      video: input.video ?? null,
      duration,
      resolution,
      aspectRatio,
      prompt: String(input.prompt ?? ''),
      species: resolved.species ?? '',
      recreate: {
        prompt: compiled,
        durationSec: duration,
        shots: Array.isArray(plan.shots) ? plan.shots : [],
        hook: typeof plan.hook === 'string' ? plan.hook : '',
        analysisJson: typeof plan.analysisJson === 'string' ? plan.analysisJson : '',
      },
      effectiveParameters: parameters,
    }
    return await launchMotionTask({
      ctx, store, paths, onReady,
      avatarId,
      snapshot,
      assets: imageAssets,
      prompt: compiled,
      parameters,
    })
  }

  return { analyze, submit }
}
