/**
 * Google Vids 四生成模式的单一真源（Issue #3181）。
 *
 * 模式与参数域的真源优先级：**上游服务契约 > 官方 UI 文档**。
 * - 模式 → 中枢操作映射来自中枢 vids2api 通道（`plugins/omnimux/src/media/local-vids.js`）：
 *   `text_to_video`(create) / `first_frame`(animate) / `video_edit`(modify) / `video_extend`(extend)。
 * - 参数域来自 vids2api 服务端契约：`seconds = max(4, min(12, seconds))`、
 *   `resolution ∈ {720p,1080p,4k}`、`aspect_ratio ∈ {landscape,portrait}`。
 *   官方 UI 文档写 3–10 秒；UI **不得**提供 3 秒，否则等于让服务端静默改写用户意图。
 *
 * UI、路由校验与测试都必须从本模块派生，不得各自硬编码模式或参数域。
 *
 * @typedef {'create' | 'animate' | 'modify' | 'extend'} VidsModeId
 */

/**
 * 模式 → 中枢操作。`create` 对应中枢 `text_to_video`（服务端缺省 mode，不显式发送）。
 * @type {Readonly<Record<VidsModeId, string>>}
 */
export const VIDS_OPERATION_BY_MODE = Object.freeze({
  create: 'text_to_video',
  animate: 'first_frame',
  modify: 'video_edit',
  extend: 'video_extend',
})

/**
 * 四个生成模式。`label` 用 Google Vids 官方简体中文界面标签。
 * @type {readonly { id: VidsModeId, label: string, title: string, operation: string,
 *   requiresImage: boolean, requiresVideo: boolean, imageOptional: boolean,
 *   submitLabel: string, placeholder: string, hint: string }[]}
 */
export const VIDS_MODES = Object.freeze([
  Object.freeze({
    id: 'create',
    label: '创建',
    title: '创建',
    operation: VIDS_OPERATION_BY_MODE.create,
    requiresImage: false,
    requiresVideo: false,
    imageOptional: false,
    submitLabel: '生成',
    placeholder: '描述要生成的画面与动作',
    hint: '用文字生成一段新视频',
  }),
  Object.freeze({
    id: 'animate',
    label: '动画',
    title: '添加动画',
    operation: VIDS_OPERATION_BY_MODE.animate,
    requiresImage: true,
    requiresVideo: false,
    imageOptional: false,
    submitLabel: '生成',
    placeholder: '描述图片中元素如何运动、镜头如何移动',
    hint: '把一张静态图片变成动态视频',
  }),
  Object.freeze({
    id: 'modify',
    label: '修改',
    title: '修改',
    operation: VIDS_OPERATION_BY_MODE.modify,
    requiresImage: false,
    requiresVideo: true,
    imageOptional: true,
    submitLabel: '生成',
    placeholder: '描述要调整的主体、服装或光影',
    hint: '改写一个已有片段的画面内容',
  }),
  Object.freeze({
    id: 'extend',
    label: '延续',
    title: '延续',
    operation: VIDS_OPERATION_BY_MODE.extend,
    requiresImage: false,
    requiresVideo: true,
    imageOptional: false,
    submitLabel: '提交提示',
    placeholder: '描述这个片段结尾之后发生什么',
    hint: '把已有片段向后延长',
  }),
])

/** @type {readonly VidsModeId[]} */
export const VIDS_MODE_IDS = Object.freeze(VIDS_MODES.map((m) => m.id))

/**
 * 参数域与默认值。
 * @type {Readonly<{
 *   seconds: { min: number, max: number, step: number, fallback: number },
 *   resolution: { values: readonly string[], fallback: string },
 *   aspectRatio: { values: readonly string[], fallback: string, labels: Readonly<Record<string,string>>, ratioLabels: Readonly<Record<string,string>> },
 * }>}
 */
export const VIDS_PARAM_SPEC = Object.freeze({
  seconds: Object.freeze({ min: 4, max: 12, step: 1, fallback: 10 }),
  resolution: Object.freeze({ values: Object.freeze(['720p', '1080p', '4k']), fallback: '720p' }),
  aspectRatio: Object.freeze({
    values: Object.freeze(['landscape', 'portrait']),
    fallback: 'landscape',
    /** 官方中文界面用词。 */
    labels: Object.freeze({ landscape: '横向', portrait: '纵向' }),
    /** 参数摘要里展示的等效比例。 */
    ratioLabels: Object.freeze({ landscape: '16:9', portrait: '9:16' }),
  }),
})

/** 校验失败的错误码（稳定可断言，UI 据此给可读原因）。 */
export const VIDS_ERROR_CODES = Object.freeze({
  invalidPayload: 'vids-invalid-payload',
  unknownMode: 'vids-unknown-mode',
  emptyPrompt: 'vids-empty-prompt',
  missingImage: 'vids-missing-image',
  missingVideo: 'vids-missing-video',
  badSeconds: 'vids-bad-seconds',
  badResolution: 'vids-bad-resolution',
  badAspectRatio: 'vids-bad-aspect-ratio',
})

/**
 * @param {unknown} value
 * @returns {string}
 */
function pickText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/**
 * @param {string | undefined | null} modeId
 * @returns {(typeof VIDS_MODES)[number]}
 */
export function resolveVidsMode(modeId) {
  return VIDS_MODES.find((m) => m.id === modeId) || VIDS_MODES[0]
}

/**
 * 参数摘要（默认值渲染为 `720p · 16:9 · 10s`）。
 * @param {{ seconds?: number, resolution?: string, aspectRatio?: string }} [params]
 * @returns {string}
 */
export function formatVidsParamSummary(params = {}) {
  const seconds = Number.isFinite(Number(params.seconds)) ? Number(params.seconds) : VIDS_PARAM_SPEC.seconds.fallback
  const resolution = pickText(params.resolution) || VIDS_PARAM_SPEC.resolution.fallback
  const aspect = pickText(params.aspectRatio) || VIDS_PARAM_SPEC.aspectRatio.fallback
  const ratio = VIDS_PARAM_SPEC.aspectRatio.ratioLabels[aspect] || VIDS_PARAM_SPEC.aspectRatio.ratioLabels.landscape
  return `${resolution} · ${ratio} · ${seconds}s`
}

/**
 * 校验并规范化一次生成请求。
 *
 * 返回规范化请求（供插件路由与后续中枢调用使用）或明确错误；**不做静默钳制**：
 * 越界秒数、未知分辨率/比例一律报错，让 UI 能显示可读原因。
 *
 * @param {{
 *   mode?: string,
 *   prompt?: string,
 *   seconds?: number,
 *   resolution?: string,
 *   aspectRatio?: string,
 *   imageUrl?: string,
 *   videoId?: string,
 * }} input
 * @returns {{ ok: true, request: { operation: string, mode: VidsModeId, prompt: string, seconds: number, resolution: string, aspect_ratio: string, image_url?: string, video_id?: string } }
 *   | { ok: false, code: string, message: string }}
 */
export function buildVidsRequest(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: VIDS_ERROR_CODES.invalidPayload, message: '生成请求必须为有效对象' }
  }
  const modeId = pickText(input.mode) || VIDS_MODES[0].id
  const mode = VIDS_MODES.find((m) => m.id === modeId)
  if (!mode) {
    return { ok: false, code: VIDS_ERROR_CODES.unknownMode, message: `不支持的生成模式：${modeId}` }
  }

  const prompt = pickText(input.prompt)
  if (!prompt) {
    return { ok: false, code: VIDS_ERROR_CODES.emptyPrompt, message: '请先填写提示词' }
  }

  const imageUrl = pickText(input.imageUrl)
  if (mode.requiresImage && !imageUrl) {
    return { ok: false, code: VIDS_ERROR_CODES.missingImage, message: `${mode.title}需要先添加一张图片` }
  }

  const videoId = pickText(input.videoId)
  if (mode.requiresVideo && !videoId) {
    return { ok: false, code: VIDS_ERROR_CODES.missingVideo, message: `${mode.title}需要先选择一个源视频片段` }
  }

  const seconds = Number(input.seconds ?? VIDS_PARAM_SPEC.seconds.fallback)
  const { min, max } = VIDS_PARAM_SPEC.seconds
  if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
    return {
      ok: false,
      code: VIDS_ERROR_CODES.badSeconds,
      message: `时长需为 ${min} 到 ${max} 秒之间的整数`,
    }
  }

  const resolution = pickText(input.resolution) || VIDS_PARAM_SPEC.resolution.fallback
  if (!VIDS_PARAM_SPEC.resolution.values.includes(resolution)) {
    return {
      ok: false,
      code: VIDS_ERROR_CODES.badResolution,
      message: `分辨率仅支持 ${VIDS_PARAM_SPEC.resolution.values.join(' / ')}`,
    }
  }

  const aspectRatio = pickText(input.aspectRatio) || VIDS_PARAM_SPEC.aspectRatio.fallback
  if (!VIDS_PARAM_SPEC.aspectRatio.values.includes(aspectRatio)) {
    return {
      ok: false,
      code: VIDS_ERROR_CODES.badAspectRatio,
      message: `画面比例仅支持 ${VIDS_PARAM_SPEC.aspectRatio.values
        .map((v) => VIDS_PARAM_SPEC.aspectRatio.labels[v] || v)
        .join(' / ')}`,
    }
  }

  /** @type {{ operation: string, mode: VidsModeId, prompt: string, seconds: number, resolution: string, aspect_ratio: string, image_url?: string, video_id?: string }} */
  const request = {
    operation: mode.operation,
    mode: mode.id,
    prompt,
    seconds,
    resolution,
    aspect_ratio: aspectRatio,
  }
  if (imageUrl) request.image_url = imageUrl
  if (videoId) request.video_id = videoId
  return { ok: true, request }
}

/* ------------------------------------------------------------------ 兼容层 */

/**
 * 旧接口：UI 与既有 e2e 仍按 `VEO_MODES` / `VEO_TASK_SPEC` 读取标签与占位符。
 * 这里从四模式真源派生，避免出现第二份模式定义。
 */
export const VEO_MODES = Object.freeze(
  VIDS_MODES.map((m) => Object.freeze({ id: m.id, label: m.label, placeholder: m.placeholder })),
)

export const VEO_MODE_IDS = Object.freeze(VEO_MODES.map((m) => m.id))

export const VEO_TASK_SPEC = Object.freeze({
  modes: VEO_MODES,
  modeIds: VEO_MODE_IDS,
  defaultMode: 'create',
  durationSec: Object.freeze({
    min: VIDS_PARAM_SPEC.seconds.min,
    max: VIDS_PARAM_SPEC.seconds.max,
    fallback: VIDS_PARAM_SPEC.seconds.fallback,
  }),
  resolution: VIDS_PARAM_SPEC.resolution.fallback,
  aspectRatio: VIDS_PARAM_SPEC.aspectRatio.fallback,
  /** 默认参数摘要（固定胶囊文案的历史真源，现由参数域派生）。 */
  paramCapsule: formatVidsParamSummary(),
  editorGatePlaceholder: '请先在右侧创建或打开剪辑工程...',
})

/**
 * @param {string | undefined | null} modeId
 * @returns {{ id: string, label: string, placeholder: string }}
 */
export function resolveVeoMode(modeId) {
  const hit = VEO_MODES.find((m) => m.id === modeId)
  return hit || VEO_MODES[0]
}
