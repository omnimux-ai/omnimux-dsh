// 爆款复刻的客户端逻辑：拆解结果缓存、提交体组装、有界计时进度。
//
// 三件事都必须是纯函数，理由各自不同：
// - 拆解缓存决定「会不会二次付费分析」，失效条件必须可单测。
// - 提交体决定「参考视频会不会漏进视频模型」，必须能对着断言检查。
// - 进度只由本地计时推导，服务端不报进度，所以这里绝不能超过封顶值。

/** 拆解进度封顶：服务端不报进度，剩下的 8% 留给真实提交与回执。 */
export const PROGRESS_CEILING = 92

/**
 * 拆解的分步文案。顺序即真实处理顺序，最后一步是编译提示词。
 * 文案直接用中文原文当键（沿用本插件 TEXT_KEYS 习惯）。
 */
export const ANALYSIS_STEPS = [
  { id: 'frames', label: '提取镜头关键帧' },
  { id: 'references', label: '理解你的参考图' },
  { id: 'narrative', label: '拆解叙事与爆款逻辑' },
  { id: 'compile', label: '编译生成提示词' },
]

/** 每一步的起止毫秒（本地计时，不是服务端进度）。 */
const STEP_WINDOWS = [
  { id: 'frames', until: 2500 },
  { id: 'references', until: 6000 },
  { id: 'narrative', until: 12000 },
  { id: 'compile', until: Number.POSITIVE_INFINITY },
]

/**
 * 有界计时进度：单调不倒退、整数、封顶 PROGRESS_CEILING。
 * 脏输入（负数 / NaN / 非数字）退化为 0，渲染路径不抛错。
 * @param {number} elapsedMs
 */
export function progressAt(elapsedMs) {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  // 指数逼近：前几秒推进快，长尾慢慢贴近封顶，永远不会自己到 100。
  const raw = PROGRESS_CEILING * (1 - Math.exp(-elapsed / 4000))
  return Math.min(PROGRESS_CEILING, Math.max(0, Math.round(raw)))
}

/**
 * 当前步骤。时间未知时退化为第一步，而不是 undefined。
 * @param {number} elapsedMs
 */
export function stepAt(elapsedMs) {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const window = STEP_WINDOWS.find((row) => elapsed < row.until) ?? STEP_WINDOWS.at(-1)
  return ANALYSIS_STEPS.find((step) => step.id === window.id) ?? ANALYSIS_STEPS[0]
}

/** 没有拆解结果。 */
export function emptyAnalysis() {
  return null
}

/** 显式丢弃已缓存的拆解（换输入、离开页面、用户清空时调用）。 */
export function forgetAnalysis() {
  return emptyAnalysis()
}

const idOf = (item) => (item && typeof item === 'object' ? String(item.id ?? '') : '')

/**
 * 输入指纹：参考视频 id + 参考图 id 序列 + 意图文本。
 * 任一变化都必须换指纹，否则会拿旧拆解去提交新素材。
 * @param {{ video?: unknown, images?: unknown[], intent?: unknown }} input
 */
export function analysisKey(input) {
  const video = idOf(input?.video)
  const images = Array.isArray(input?.images) ? input.images.map(idOf) : []
  const intent = String(input?.intent ?? '').trim()
  return JSON.stringify({ video, images, intent })
}

/**
 * 记下拆解结果与它对应的输入指纹。
 * 空提示词不算有效拆解——服务端没编译出东西时不能假装成功。
 * @param {unknown} _previous
 * @param {{ video?: unknown, images?: unknown[], intent?: unknown }} input
 * @param {unknown} analysis
 */
export function rememberAnalysis(_previous, input, analysis) {
  if (!analysis || typeof analysis !== 'object') return emptyAnalysis()
  if (typeof analysis.prompt !== 'string' || analysis.prompt.trim() === '') return emptyAnalysis()
  return { key: analysisKey(input), analysis }
}

/**
 * 缓存是否仍然对应当前输入。提交失败后这里必须仍为真，
 * 这样重试直接提交、不再二次拆解。
 * @param {unknown} record
 * @param {{ video?: unknown, images?: unknown[], intent?: unknown }} input
 */
export function analysisValid(record, input) {
  if (!record || typeof record !== 'object') return false
  const { key, analysis } = /** @type {{ key?: unknown, analysis?: any }} */ (record)
  if (typeof key !== 'string' || !analysis || typeof analysis !== 'object') return false
  if (typeof analysis.prompt !== 'string' || analysis.prompt.trim() === '') return false
  return key === analysisKey(input)
}

/**
 * 组装爆款复刻的提交体。
 *
 * 只有参考图与编译后的提示词进入视频请求；参考视频只是拆解材料，
 * 这里既不放 video 字段，也不把视频 id 混进其它字段。
 *
 * @param {{
 *   avatarId: string,
 *   images: unknown[],
 *   resolution: string,
 *   analysis: { prompt: string, durationSec?: number, shots?: unknown[], hook?: string, analysisJson?: unknown },
 * }} input
 */
export function recreateBody({ avatarId, images, resolution, analysis }) {
  if (!analysis || typeof analysis !== 'object' || typeof analysis.prompt !== 'string' || analysis.prompt.trim() === '') {
    throw new Error('缺少拆解结果，请先生成一次')
  }
  const references = (Array.isArray(images) ? images : []).map((item) => ({ ...item.reference }))
  if (!references.length) throw new Error('请先选择参考图片')
  return {
    avatarId,
    mode: 'recreate',
    images: references,
    resolution,
    recreate: {
      prompt: analysis.prompt,
      durationSec: analysis.durationSec,
      shots: analysis.shots ?? [],
      hook: analysis.hook ?? '',
      analysisJson: analysis.analysisJson ?? null,
    },
  }
}
