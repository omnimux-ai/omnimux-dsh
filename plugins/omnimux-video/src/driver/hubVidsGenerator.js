/**
 * 中枢缝驱动的 Google Vids 生成器（Issue #3186）。
 *
 * 面板的四模式生成改由中枢 `videoGenerate` 缝执行：领域插件不持有渠道凭据、
 * 不直连上游，只把规范化请求交给中枢，并把成片落进插件自己的媒体目录。
 * 对外 HTTP 契约（`/omnimux-video/api/veo`）与内部驱动保持并存：
 * 缝不可用时由路由回退到 `veoHeadlessDriver`，本模块不做任何静默降级。
 *
 * 中枢请求契约（`plugins/omnimux/src/media/mount.js` + `docs/contracts/hub.md`）：
 * `{ dest, model, operation, prompt?, duration?, image?, references?, aspectRatio?, resolution?, signal? }`
 * - `dest` 必填（中枢把成片下载到该绝对路径）；
 * - `model` 必须显式命名 `google-vids-omni`（没有默认路由能到达该通道）；
 * - `operation` ∈ `text_to_video` / `first_frame` / `video_edit` / `video_extend`；
 * - 只有 `duration`，没有 `seconds`（面板的 `seconds` 必须映射过来）；
 * - `video_edit` / `video_extend` 的源视频走
 *   `references: [{ type: 'video', role: 'source', pathOrUrl }]`，且该地址必须能被本机服务抓取；
 * - `first_frame` / `video_edit` 的图片走 `image`，同样必须可被抓取。
 *
 * 该缝是一次长等待（提交 → 轮询 → 下载），**没有进度通道**：因此这里只上报真实
 * 阶段切换（已提交 / 生成中 / 正在取回），不编造百分比。
 *
 * @module omnimux-video/driver/hubVidsGenerator
 */

import fs from 'node:fs'
import path from 'node:path'
import { VIDS_OPERATION_BY_MODE, VIDS_PARAM_SPEC } from '../shared/veoTaskSpec.js'

/** 中枢侧本机 Google Vids 通道的公开模型 id。 */
export const HUB_VIDS_MODEL_ID = 'google-vids-omni'

/** 该通道实现的四个中枢操作。 */
export const HUB_VIDS_OPERATION_IDS = Object.freeze([
  'text_to_video',
  'first_frame',
  'video_edit',
  'video_extend',
])

/**
 * 进度阶段词汇。中枢缝没有进度通道，所以这三个阶段对应插件侧真实可观测的切换点，
 * 而不是上游渲染百分比。
 */
export const HUB_VIDS_PROGRESS_STAGES = Object.freeze(['submitted', 'generating', 'downloading'])

/**
 * @param {unknown} value
 * @returns {string}
 */
function pickText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/**
 * 解析本次生成的中枢操作：显式 `operation` 优先，否则由面板 `mode` 派生。
 * 未知操作/模式一律报错，不做「猜一个」的兜底。
 *
 * @param {{ operation?: unknown, mode?: unknown }} request
 * @returns {string}
 */
export function resolveHubVidsOperation(request = {}) {
  const explicit = pickText(request.operation)
  if (explicit) {
    if (HUB_VIDS_OPERATION_IDS.includes(explicit)) return explicit
    throw new Error(`本机 Google Vids 通道不支持操作 ${explicit}：仅支持 ${HUB_VIDS_OPERATION_IDS.join(' / ')}`)
  }
  const mode = pickText(request.mode)
  const derived = VIDS_OPERATION_BY_MODE[/** @type {keyof typeof VIDS_OPERATION_BY_MODE} */ (mode)]
  if (derived) return derived
  throw new Error(`无法确定本机 Google Vids 的生成操作：收到模式 ${mode || '(空)'}`)
}

/**
 * 面板时长字段 → 中枢 `duration`（中枢没有 `seconds`）。
 * @param {{ duration?: unknown, seconds?: unknown, durationSec?: unknown }} request
 * @returns {number}
 */
export function resolveHubVidsDuration(request = {}) {
  const raw = request.duration ?? request.seconds ?? request.durationSec
  const num = Number(raw)
  if (!Number.isFinite(num)) return VIDS_PARAM_SPEC.seconds.fallback
  return Math.round(num)
}

/**
 * 构造交给中枢缝的请求体（与上游调用解耦，便于逐模式断言）。
 *
 * @param {{
 *   dest: string,
 *   operation: string,
 *   prompt: string,
 *   duration: number,
 *   resolution?: string,
 *   aspectRatio?: string,
 *   image?: string,
 *   sourceVideo?: string,
 *   signal?: AbortSignal,
 * }} input
 * @returns {Record<string, unknown>}
 */
export function buildHubVidsRequest(input) {
  const operation = pickText(input.operation)
  if (!HUB_VIDS_OPERATION_IDS.includes(operation)) {
    throw new Error(`本机 Google Vids 通道不支持操作 ${operation || '(空)'}：仅支持 ${HUB_VIDS_OPERATION_IDS.join(' / ')}`)
  }
  const dest = pickText(input.dest)
  if (!dest) throw new Error('本机 Google Vids 需要成片的绝对落盘路径')

  const prompt = pickText(input.prompt)
  if (!prompt) throw new Error('必须提供有效的视频生成提示词')

  /** @type {Record<string, unknown>} */
  const request = {
    dest,
    model: HUB_VIDS_MODEL_ID,
    operation,
    prompt,
    duration: input.duration,
  }

  const resolution = pickText(input.resolution)
  if (resolution) request.resolution = resolution
  const aspectRatio = pickText(input.aspectRatio)
  if (aspectRatio) request.aspectRatio = aspectRatio

  const image = pickText(input.image)
  const sourceVideo = pickText(input.sourceVideo)

  if (operation === 'first_frame') {
    if (!image) throw new Error('动画模式需要一张可被本机服务抓取的图片')
    request.image = image
  }

  if (operation === 'video_edit' || operation === 'video_extend') {
    const label = operation === 'video_extend' ? '延续' : '修改'
    if (!sourceVideo) throw new Error(`${label}模式需要一条前序视频的取片地址`)
    request.references = [{ type: 'video', role: 'source', pathOrUrl: sourceVideo }]
    if (operation === 'video_edit') {
      if (!image) throw new Error('修改模式需要一张可被本机服务抓取的替换图片')
      request.image = image
    }
  }

  if (input.signal) request.signal = input.signal
  return request
}

/**
 * @param {unknown} resolved
 * @returns {{ url: string, reason: string }}
 */
function readResolvedSource(resolved) {
  if (typeof resolved === 'string') return { url: resolved.trim(), reason: '' }
  if (resolved && typeof resolved === 'object') {
    const row = /** @type {Record<string, unknown>} */ (resolved)
    return { url: pickText(row.url), reason: pickText(row.reason) }
  }
  return { url: '', reason: '' }
}

/**
 * 创建一个走中枢缝的生成器。
 *
 * 返回的函数与路由现有的可注入生成器契约兼容：接收面板请求
 * （`prompt` / `durationSec` / `operation` / `imageUrl` / `videoId` / `outputDir` / `onProgress`），
 * 返回 `{ fileName, localPath, fileSize, durationSec, resolution, aspectRatio }`，
 * 并额外带上游任务号与取片地址（`upstreamTaskId` / `upstreamUrl`）供任务记录回填。
 *
 * @param {{
 *   seam?: { execute: (request: object) => Promise<unknown> },
 *   getSeam?: () => { execute: (request: object) => Promise<unknown> } | undefined,
 *   mediaDir?: string,
 *   resolveSourceVideo?: (taskId: string) => string | { url?: string, reason?: string } | null | undefined,
 *   now?: () => number,
 * }} [options]
 */
export function createHubVidsGenerator(options = {}) {
  const { seam, getSeam, mediaDir, resolveSourceVideo, now = Date.now } = options
  let sequence = 0

  /** @returns {{ execute: (request: object) => Promise<unknown> } | null} */
  function activeSeam() {
    const candidate = typeof getSeam === 'function' ? getSeam() : seam
    if (candidate && typeof candidate.execute === 'function') {
      return /** @type {{ execute: (request: object) => Promise<unknown> }} */ (candidate)
    }
    return null
  }

  /**
   * 把面板的 `video_id`（插件自身任务号）解析成中枢能抓取的取片地址。
   * 解析不到就响亮报错——绝不把插件任务号当上游任务号猜着用。
   *
   * @param {{ operation: string, videoId: string }} input
   * @returns {string}
   */
  function resolveSourceVideoUrl(input) {
    const label = input.operation === 'video_extend' ? '延续' : '修改'
    if (!input.videoId) throw new Error(`${label}模式需要先选择一个源视频片段`)
    if (typeof resolveSourceVideo !== 'function') {
      throw new Error(`${label}模式无法解析前序任务 ${input.videoId} 的取片地址：当前生成后端不支持引用前序成片`)
    }
    const { url, reason } = readResolvedSource(resolveSourceVideo(input.videoId))
    if (!url) {
      const why = reason ? `（${reason}）` : ''
      throw new Error(
        `${label}模式无法解析前序任务 ${input.videoId} 的取片地址${why}：请重新生成该片段后再试`,
      )
    }
    return url
  }

  /**
   * @param {{
   *   prompt?: string,
   *   durationSec?: number,
   *   seconds?: number,
   *   mode?: string,
   *   operation?: string,
   *   resolution?: string,
   *   aspectRatio?: string,
   *   aspect_ratio?: string,
   *   imageUrl?: string,
   *   image_url?: string,
   *   videoId?: string,
   *   video_id?: string,
   *   sourceUrl?: string,
   *   outputDir?: string,
   *   signal?: AbortSignal,
   *   onProgress?: (event: { phase: string, message: string }) => void,
   * }} [request]
   */
  return async function generateHubVids(request = {}) {
    const onProgress = typeof request.onProgress === 'function' ? request.onProgress : () => {}

    const hubSeam = activeSeam()
    if (!hubSeam) {
      throw new Error('本机 Google Vids 中枢通道不可用：未找到 videoGenerate 缝')
    }

    const operation = resolveHubVidsOperation(request)
    const prompt = pickText(request.prompt)
    if (!prompt) throw new Error('必须提供有效的视频生成提示词')
    const duration = resolveHubVidsDuration(request)
    const resolution = pickText(request.resolution)
    const aspectRatio = pickText(request.aspectRatio) || pickText(request.aspect_ratio)
    const image = pickText(request.imageUrl) || pickText(request.image_url)
    const videoId = pickText(request.videoId) || pickText(request.video_id)

    let sourceVideo = pickText(request.sourceUrl)
    if (!sourceVideo && (operation === 'video_edit' || operation === 'video_extend')) {
      sourceVideo = resolveSourceVideoUrl({ operation, videoId })
    }

    const dir = path.resolve(
      pickText(request.outputDir) || pickText(mediaDir) || path.resolve(process.cwd(), '.workbuddy/demo/media'),
    )
    fs.mkdirSync(dir, { recursive: true })
    sequence += 1
    const fileName = `veo_hub_${now()}_${sequence}.mp4`
    const dest = path.join(dir, fileName)

    const hubRequest = buildHubVidsRequest({
      dest,
      operation,
      prompt,
      duration,
      resolution,
      aspectRatio,
      image,
      sourceVideo,
      signal: request.signal,
    })

    onProgress({ phase: 'submitted', message: '已提交到本机 Google Vids 通道，正在排队生成' })
    // 中枢缝把「提交 → 轮询 → 下载」包在一次 await 里，中间没有进度通道：
    // 这里只标记「作业已交给中枢」这一真实切换，不编造百分比。
    const pending = hubSeam.execute(hubRequest)
    onProgress({ phase: 'generating', message: '本机 Google Vids 正在生成画面…' })
    const result = /** @type {Record<string, unknown> | undefined} */ (await pending)
    onProgress({ phase: 'downloading', message: '成片已产出，正在取回并登记到本地媒体目录' })

    const localPath = pickText(result?.dest) ? path.resolve(String(result.dest)) : dest
    let fileSize = 0
    try {
      fileSize = fs.statSync(localPath).size
    } catch {
      fileSize = 0
    }
    if (!fileSize) {
      throw new Error(`本机 Google Vids 未产出目标文件：${localPath}`)
    }

    return {
      success: true,
      channel: 'hub',
      fileName: path.basename(localPath),
      localPath,
      fileSize,
      durationSec: duration,
      resolution: resolution || VIDS_PARAM_SPEC.resolution.fallback,
      aspectRatio: aspectRatio || VIDS_PARAM_SPEC.aspectRatio.fallback,
      upstreamTaskId: pickText(result?.taskId),
      upstreamUrl: pickText(result?.url),
    }
  }
}
