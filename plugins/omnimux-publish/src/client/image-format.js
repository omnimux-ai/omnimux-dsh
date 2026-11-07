/**
 * TikTok Content Posting 图文帖的图片格式限制（官方 Media Transfer Guide · Image restrictions）：
 * 仅 WebP / JPEG，PNG 会在平台侧以 file_format_check_failed 失败。
 * 这里做发布前的本地判定，避免用户等到异步回执才知道。
 */

/** @type {readonly string[]} */
export const SUPPORTED_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/jpg', 'image/webp'])

/** @type {readonly string[]} */
const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.webp'])

/**
 * 归一化 MIME：去参数、小写；非字符串返回空串。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeMime(value) {
  if (typeof value !== 'string') return ''
  return value.split(';')[0].trim().toLowerCase()
}

/**
 * 取小写扩展名（含点）；没有扩展名返回空串。
 * @param {unknown} filename
 * @returns {string}
 */
function extensionOf(filename) {
  if (typeof filename !== 'string') return ''
  const base = filename.trim().toLowerCase()
  const index = base.lastIndexOf('.')
  return index >= 0 ? base.slice(index) : ''
}

/**
 * 是否为 TikTok 图文可接受的图片格式。MIME 优先，缺失或不可信时回退扩展名。
 * @param {unknown} contentType
 * @param {unknown} [filename]
 * @returns {boolean}
 */
export function isSupportedImageFormat(contentType, filename) {
  const mime = normalizeMime(contentType)
  if (mime !== '') return SUPPORTED_IMAGE_MIME_TYPES.includes(mime)
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extensionOf(filename))
}

/**
 * 扫描草稿素材，返回格式不受支持的图片素材（视频与其它类型不参与判定）。
 * @param {Array<{ kind?: string, filename?: string, content_type?: string }>} mediaRows
 * @returns {Array<{ kind?: string, filename?: string, content_type?: string }>}
 */
export function unsupportedImageRows(mediaRows) {
  if (!Array.isArray(mediaRows)) return []
  return mediaRows.filter((row) => row && row.kind === 'image' && !isSupportedImageFormat(row.content_type, row.filename))
}
