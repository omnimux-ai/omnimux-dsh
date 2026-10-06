/**
 * Google Vids 四模式的客户端纯逻辑（Issue #3181）。
 *
 * 这里只放「不依赖 React / DOM」的判断与派生：参数控件选项域、源片段继承、
 * 提交门禁、插入载荷与重新创建请求。组件与测试都从这里取，避免 JSX 与测试各写一份。
 * 参数域与校验的唯一真源仍是 `../shared/veoTaskSpec.js`。
 */

import {
  VIDS_MODES,
  VIDS_PARAM_SPEC,
  buildVidsRequest,
  resolveVidsMode,
} from '../shared/veoTaskSpec.js'

/**
 * 各模式的附件槽位（顺序即渲染顺序）。`accept` 只在图片槽位出现。
 * `source` = 从结果流选一个已完成片段；`image` = 本地图片（object URL）。
 * @type {Readonly<Record<string, readonly { id: 'source' | 'image', label: string, accept?: string }[]>>}
 */
const ATTACHMENT_SLOTS = Object.freeze({
  create: Object.freeze([]),
  animate: Object.freeze([
    Object.freeze({ id: 'image', label: '添加图片', accept: 'image/*' }),
  ]),
  modify: Object.freeze([
    Object.freeze({ id: 'source', label: '添加视频' }),
    Object.freeze({ id: 'image', label: '添加', accept: 'image/*' }),
  ]),
  extend: Object.freeze([
    Object.freeze({ id: 'source', label: '添加视频' }),
  ]),
})

/** 缺少必需源片段时的可读提示（官方语义：从本会话结果里选片段）。 */
export const VIDS_SOURCE_HINT = '从下方结果中选择一个片段'

/**
 * 时长选项：契约域内每个整数（4–12 秒），文案 `N 秒`。
 * @returns {{ value: number, label: string }[]}
 */
export function vidsSecondsOptions() {
  const { min, max, step } = VIDS_PARAM_SPEC.seconds
  const out = []
  for (let seconds = min; seconds <= max; seconds += step) {
    out.push({ value: seconds, label: `${seconds} 秒` })
  }
  return out
}

/**
 * 分辨率选项（`720p` / `1080p` / `4k`）。
 * @returns {{ value: string, label: string }[]}
 */
export function vidsResolutionOptions() {
  return VIDS_PARAM_SPEC.resolution.values.map((value) => ({ value, label: value }))
}

/**
 * 画面比例选项，文案用官方中文（横向 / 纵向）。
 * @returns {{ value: string, label: string }[]}
 */
export function vidsAspectOptions() {
  return VIDS_PARAM_SPEC.aspectRatio.values.map((value) => ({
    value,
    label: VIDS_PARAM_SPEC.aspectRatio.labels[value] || value,
  }))
}

/**
 * 参数控件默认值（全部来自契约域）。
 * @returns {{ seconds: number, resolution: string, aspectRatio: string }}
 */
export function defaultVidsParams() {
  return {
    seconds: VIDS_PARAM_SPEC.seconds.fallback,
    resolution: VIDS_PARAM_SPEC.resolution.fallback,
    aspectRatio: VIDS_PARAM_SPEC.aspectRatio.fallback,
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isVidsSeconds(value) {
  const seconds = Number(value)
  const { min, max } = VIDS_PARAM_SPEC.seconds
  return Number.isInteger(seconds) && seconds >= min && seconds <= max
}

/**
 * 延续/修改模式继承源片段的参数值（仍可覆盖）。
 *
 * 只继承契约域内的取值：源片段带了域外数值时保留当前可见取值，
 * 不把它钳到边界（钳制等于静默改写用户意图），也不塞进选项表外。
 *
 * @param {{ seconds?: number, durationSec?: number, resolution?: string, aspectRatio?: string, aspect_ratio?: string } | null | undefined} task
 * @param {{ seconds: number, resolution: string, aspectRatio: string }} [current]
 * @returns {{ seconds: number, resolution: string, aspectRatio: string }}
 */
export function inheritVidsParams(task, current = defaultVidsParams()) {
  const next = { ...current }
  if (!task || typeof task !== 'object') return next

  const seconds = task.seconds ?? task.durationSec
  if (isVidsSeconds(seconds)) next.seconds = Number(seconds)

  const resolution = typeof task.resolution === 'string' ? task.resolution : ''
  if (VIDS_PARAM_SPEC.resolution.values.includes(resolution)) next.resolution = resolution

  const aspect = typeof task.aspectRatio === 'string'
    ? task.aspectRatio
    : (typeof task.aspect_ratio === 'string' ? task.aspect_ratio : '')
  if (VIDS_PARAM_SPEC.aspectRatio.values.includes(aspect)) next.aspectRatio = aspect

  return next
}

/**
 * 某模式的附件槽位；未知模式按 `create`（无附件）处理。
 * @param {string | undefined | null} modeId
 * @returns {readonly { id: 'source' | 'image', label: string, accept?: string }[]}
 */
export function vidsAttachmentSlots(modeId) {
  return ATTACHMENT_SLOTS[resolveVidsMode(modeId).id] || ATTACHMENT_SLOTS.create
}

/**
 * 该模式是否需要源片段且当前未选（需要则返回提示文案）。
 * @param {string | undefined | null} modeId
 * @param {boolean} hasSource
 * @returns {string}
 */
export function vidsSourceHint(modeId, hasSource) {
  if (!resolveVidsMode(modeId).requiresVideo || hasSource) return ''
  return VIDS_SOURCE_HINT
}

/**
 * 源片段的请求标识：任务 id 优先，退回视频地址。
 * @param {{ id?: string, videoUrl?: string } | null | undefined} task
 * @returns {string}
 */
export function vidsSourceId(task) {
  const id = typeof task?.id === 'string' ? task.id.trim() : ''
  if (id) return id
  return typeof task?.videoUrl === 'string' ? task.videoUrl.trim() : ''
}

/**
 * 把结果卡片转成源片段描述。
 * @param {{ id?: string, videoUrl?: string, title?: string, prompt?: string } | null | undefined} task
 * @returns {{ videoId: string, title: string } | null}
 */
export function vidsSourceClip(task) {
  const videoId = vidsSourceId(task)
  if (!videoId) return null
  const title = typeof task?.title === 'string' && task.title.trim()
    ? task.title.trim()
    : (typeof task?.prompt === 'string' ? task.prompt.trim() : '')
  return { videoId, title }
}

/**
 * 点「设为源片段」后应停留/切到的模式：当前模式已需要源片段就保持，否则切到延续。
 * @param {string | undefined | null} modeId
 * @returns {string}
 */
export function modeAfterSourcePick(modeId) {
  const mode = resolveVidsMode(modeId)
  if (mode.requiresVideo) return mode.id
  return 'extend'
}

/**
 * 提交门禁：每次渲染都重新构造请求，失败时返回可读原因（不静默钳制、不放行）。
 * @param {{
 *   mode?: string,
 *   prompt?: string,
 *   imageUrl?: string,
 *   videoId?: string,
 *   params?: { seconds?: number, resolution?: string, aspectRatio?: string },
 * }} input
 * @returns {{ ok: true, request: object, reason: '', code: '' }
 *   | { ok: false, request: null, reason: string, code: string }}
 */
export function vidsSubmitState(input = {}) {
  const built = buildVidsRequest({
    mode: input.mode,
    prompt: input.prompt,
    seconds: input.params?.seconds,
    resolution: input.params?.resolution,
    aspectRatio: input.params?.aspectRatio,
    imageUrl: input.imageUrl,
    videoId: input.videoId,
  })
  if (built.ok) {
    return { ok: true, request: built.request, reason: '', code: '' }
  }
  return { ok: false, request: null, reason: built.message, code: built.code }
}

/**
 * 「插入」投递载荷（跨栏事件契约固定为这五个字段）。
 * @param {{ videoUrl?: string, title?: string, durationSec?: number, resolution?: string } | null | undefined} task
 * @returns {{ url: string, videoUrl: string, title: string, durationSec: number, resolution: string }}
 */
export function vidsInsertPayload(task) {
  const videoUrl = typeof task?.videoUrl === 'string' ? task.videoUrl : ''
  const durationSec = Number(task?.durationSec)
  return {
    url: videoUrl,
    videoUrl,
    title: typeof task?.title === 'string' ? task.title : '',
    durationSec: Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : VIDS_PARAM_SPEC.seconds.fallback,
    resolution: typeof task?.resolution === 'string' && task.resolution
      ? task.resolution
      : VIDS_PARAM_SPEC.resolution.fallback,
  }
}

/**
 * 「重新创建」：优先复用任务提交时留存的原请求，否则从任务字段重建；重建也要过契约校验。
 * @param {{ request?: object, mode?: string, prompt?: string, title?: string, seconds?: number,
 *   durationSec?: number, resolution?: string, aspectRatio?: string, aspect_ratio?: string,
 *   image_url?: string, video_id?: string } | null | undefined} task
 * @returns {{ ok: true, request: object, reason: '' } | { ok: false, request: null, reason: string }}
 */
export function vidsRecreateRequest(task) {
  const stored = task?.request
  if (stored && typeof stored === 'object' && typeof stored.prompt === 'string' && stored.prompt.trim()) {
    return vidsSubmitState({
      mode: stored.mode,
      prompt: stored.prompt,
      params: {
        seconds: stored.seconds,
        resolution: stored.resolution,
        aspectRatio: stored.aspect_ratio,
      },
      imageUrl: stored.image_url,
      videoId: stored.video_id,
    })
  }

  const prompt = typeof task?.prompt === 'string' && task.prompt.trim()
    ? task.prompt
    : (typeof task?.title === 'string' ? task.title : '')
  const state = vidsSubmitState({
    mode: task?.mode,
    prompt,
    params: {
      seconds: task?.seconds ?? task?.durationSec,
      resolution: task?.resolution,
      aspectRatio: task?.aspectRatio ?? task?.aspect_ratio,
    },
    imageUrl: task?.image_url,
    videoId: task?.video_id,
  })
  if (state.ok) return { ok: true, request: state.request, reason: '' }
  return { ok: false, request: null, reason: state.reason }
}

/** 模式标签（供测试与外部只读引用）。 */
export const VIDS_MODE_LABELS = Object.freeze(
  VIDS_MODES.map((mode) => Object.freeze({ id: mode.id, label: mode.label, submitLabel: mode.submitLabel })),
)
