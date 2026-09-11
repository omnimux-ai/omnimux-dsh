/**
 * 营销创意预设媒体资源寻址解析器
 * 负责将元数据中的相对路径解析为网关静态媒体流或本地开发直读流
 */

const LOCAL_ASSET_ROOT = '/Users/x/Desktop/Project/OPC/资产库/素材库/gxgen-data/inspiration-library/video/media/pippit'

/**
 * 解析媒体路径为可播放/可加载的 URL
 * @param {string | null | undefined} relativePath 相对路径，如 "hooks/eye-catching-visuals/13_fridge-cam-reveal.mp4"
 * @returns {string} 绝对 URL 或空字符串
 */
export function resolveMediaUrl(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    return ''
  }

  const clean = relativePath.trim().replace(/^\/+/, '')
  if (!clean) return ''

  // 若已经是完整的 http(s) URL，直接返回
  if (/^https?:\/\//i.test(clean)) {
    return clean
  }

  // 1. 若配置了自定义网关静态媒体源，优先使用
  const customOrigin = typeof window !== 'undefined'
    ? window.__OMNIMUX_CONFIG__?.gatewayMediaOrigin
    : null

  if (customOrigin && typeof customOrigin === 'string') {
    const base = customOrigin.replace(/\/+$/, '')
    return `${base}/${clean}`
  }

  // 2. 本地开发 / 桌面端自洽直读方案：通过 omnimux-workflow 本地文件流路由（支持 Range 206 播放）
  const absoluteLocalPath = `${LOCAL_ASSET_ROOT}/${clean}`
  return `/omnimux-workflow/api/local-file?path=${encodeURIComponent(absoluteLocalPath)}`
}

/**
 * 判断条目是否拥有有效的视频预览资产
 * @param {{ videoPath?: string }} item
 * @returns {boolean}
 */
export function hasVideoPreview(item) {
  return Boolean(item && item.videoPath && typeof item.videoPath === 'string' && item.videoPath.trim())
}

/**
 * 判断条目是否拥有有效的海报封面资产
 * @param {{ posterPath?: string }} item
 * @returns {boolean}
 */
export function hasPosterPreview(item) {
  return Boolean(item && item.posterPath && typeof item.posterPath === 'string' && item.posterPath.trim())
}
