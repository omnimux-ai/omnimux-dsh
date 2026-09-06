const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'])
const VIDEO = new Set(['mp4', 'webm', 'mov'])
const AUDIO = new Set(['mp3', 'wav', 'm4a', 'aac'])
const TABLE = new Set(['htable', 'csv', 'xlsx'])

/**
 * @param {string} [ext]
 */
export function inferKindFromExtension(ext) {
  const lower = String(ext || '').replace(/^\./, '').toLowerCase()
  if (IMAGE.has(lower)) return 'image'
  if (VIDEO.has(lower)) return 'video'
  if (AUDIO.has(lower)) return 'audio'
  if (TABLE.has(lower)) return 'table'
  return 'document'
}

/**
 * @param {string} title
 * @param {string} [relativePath]
 */
export function inferKindFromName(title, relativePath) {
  const target = relativePath || title || ''
  const match = target.match(/\.([a-zA-Z0-9_-]+)$/)
  return inferKindFromExtension(match?.[1] || '')
}

/** composer 域附件上限（共享组件不设硬编码，由适配层注入） */
export const MAX_ATTACHMENTS = 8
