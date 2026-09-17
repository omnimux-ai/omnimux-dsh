/**
 * 来源与格式枚举常量
 */
export const GENERATION_SOURCES = [
  { id: 'all', labelKey: 'generations.source.all', defaultLabel: '全部来源' },
  { id: 'agent', labelKey: 'generations.source.agent', defaultLabel: '智能体' },
  { id: 'image', labelKey: 'generations.source.image', defaultLabel: '图像生成' },
  { id: 'canvas', labelKey: 'generations.source.canvas', defaultLabel: '画布' },
]

export const GENERATION_TYPES = [
  { id: 'all', labelKey: 'generations.type.all', defaultLabel: '全部格式' },
  { id: 'image', labelKey: 'generations.type.image', defaultLabel: '图片' },
  { id: 'video', labelKey: 'generations.type.video', defaultLabel: '视频' },
  { id: 'audio', labelKey: 'generations.type.audio', defaultLabel: '音频' },
]

/**
 * 判定生成物的来源分类
 * @param {object} artifact
 * @returns {'agent' | 'image' | 'canvas'}
 */
export function resolveArtifactSource(artifact) {
  const src = artifact?.source || {}
  const agent = String(src.agent || '').toLowerCase()
  const runId = String(src.run_id || '').toLowerCase()
  const channel = String(src.channel || '').toLowerCase()

  if (channel === 'canvas' || agent === 'canvas' || runId.includes('canvas')) {
    return 'canvas'
  }
  if (channel === 'image' || agent.includes('image') || agent === 'omnimux_image_submit' || agent === 'image_generate') {
    return 'image'
  }
  return 'agent'
}

/**
 * 渲染来源中文徽章标签
 * @param {'agent' | 'image' | 'canvas'} sourceKey
 * @param {(key: string) => string} t
 */
export function getSourceBadgeText(sourceKey, t) {
  if (sourceKey === 'canvas') return t('generations.source.canvas') || '画布'
  if (sourceKey === 'image') return t('generations.source.image') || '图像生成'
  return t('generations.source.agent') || '智能体'
}
