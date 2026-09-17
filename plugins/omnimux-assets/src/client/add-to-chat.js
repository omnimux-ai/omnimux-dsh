import { previewUrl } from './api.js'

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|tiff)$/i
export const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|m4v|flv)$/i

/**
 * Check if a file descriptor or row reference is a directory.
 * @param {any} file
 * @returns {boolean}
 */
export function isDirectoryFile(file) {
  if (!file) return false
  return file.kind === 'directory' || file.is_dir === true || file.type === 'directory'
}

/**
 * @param {any} file
 * @returns {boolean}
 */
export function isImageFile(file) {
  if (!file) return false
  if (file.kind === 'image' || file.type === 'image') return true
  if (typeof file.mime === 'string' && file.mime.startsWith('image/')) return true
  const name = String(file.original_name || file.name || file.real_path || file.relative_path || '')
  return IMAGE_EXT.test(name)
}

/**
 * @param {any} file
 * @returns {boolean}
 */
export function isVideoFile(file) {
  if (!file) return false
  if (file.kind === 'video' || file.type === 'video') return true
  if (typeof file.mime === 'string' && file.mime.startsWith('video/')) return true
  const name = String(file.original_name || file.name || file.real_path || file.relative_path || '')
  return VIDEO_EXT.test(name)
}

/**
 * Pick the best image file from an asset for thumbnail/preview.
 * Prefers asset.cover if it's an image, or finds the first image in asset.files.
 *
 * @param {any} asset
 * @returns {any | null}
 */
export function pickCoverFile(asset) {
  if (!asset) return null
  if (isImageFile(asset.cover)) return asset.cover
  const files = Array.isArray(asset.files) ? asset.files : []
  const found = files.find(isImageFile)
  if (found) return found
  if (asset.cover && (asset.cover.mime?.startsWith('image/') || asset.cover.type === 'image')) {
    return asset.cover
  }
  return null
}

/**
 * Extract uppercase file extension or fallback to 'ASSET'.
 * @param {any} coverFile
 * @param {string} [fallbackTitle]
 * @returns {string}
 */
export function inferAssetExtension(coverFile, fallbackTitle = '') {
  const target = String(coverFile?.relative_path || coverFile?.real_path || coverFile?.original_name || coverFile?.name || fallbackTitle || '')
  const match = target.match(/\.([a-zA-Z0-9_-]+)$/)
  if (match && match[1]) {
    return match[1].toUpperCase()
  }
  return 'ASSET'
}

/**
 * Build standard attachment payload for OmniMux conversation bus from an asset.
 *
 * @param {any} asset
 * @returns {{
 *   sourcePlugin: 'omnimux-assets',
 *   kind: 'asset',
 *   entityId: string,
 *   title: string,
 *   extension: string,
 *   relativePath: string,
 *   previewUrl: string,
 *   metadata: {
 *     asset_id: string,
 *     type: string,
 *     files: any[],
 *   },
 * } | null}
 */
export function buildAssetPayload(asset) {
  if (!asset || !asset.id) return null
  const files = Array.isArray(asset.files) ? asset.files : []
  const isCloud = Boolean(
    asset.isCloud === true
    || asset.category
    || asset.cover_url
    || asset.media_url
    || asset.meta?.source_media_url
    || asset.meta?.source_cover_url
    || (typeof asset.id === 'string' && /^(character|scene|material|prop|style|audio)-/.test(asset.id))
  )

  const isMultiFile = files.length > 1
  const isExplicitDir = asset.type === 'directory' || asset.is_dir === true
  const isDir = isExplicitDir || (files.length === 1 && isDirectoryFile(files[0]))
  const coverFile = pickCoverFile(asset) || (files.length > 0 ? files[0] : null)
  let ext = inferAssetExtension(coverFile, asset.name)
  let pUrl = coverFile?.id
    ? previewUrl(asset.id, coverFile.id)
    : (typeof coverFile?.preview_url === 'string' ? coverFile.preview_url : '')

  let kind = 'asset'
  if (!isMultiFile && !isDir) {
    if (isImageFile(coverFile) || (ext && ext !== 'ASSET' && IMAGE_EXT.test(`.${ext}`))) {
      kind = 'image'
    } else if (isVideoFile(coverFile) || (ext && ext !== 'ASSET' && VIDEO_EXT.test(`.${ext}`))) {
      kind = 'video'
    }
  }

  // 云端公共资产特殊补齐：透传云端直链与分类元数据
  if (isCloud && files.length === 0) {
    const cloudCover = asset.cover_url?.startsWith('http')
      ? asset.cover_url
      : (asset.meta?.source_cover_url || (asset.id ? `/omnimux/assets/cloud/media?id=${encodeURIComponent(asset.id)}&which=cover` : ''))
    const cloudMedia = asset.media_url?.startsWith('http')
      ? asset.media_url
      : (asset.meta?.source_media_url || (asset.id ? `/omnimux/assets/cloud/media?id=${encodeURIComponent(asset.id)}&which=media` : ''))

    if (!pUrl && cloudCover) {
      pUrl = cloudCover
    }
    const mediaType = asset.mediaType || asset.media_type || (asset.category === 'audio' ? 'audio' : '')
    if (mediaType === 'audio') {
      kind = asset.hasCover === false && !cloudCover ? 'audio' : 'asset'
      if (ext === 'ASSET') ext = 'AUDIO'
    } else if (mediaType === 'video' || VIDEO_EXT.test(cloudMedia)) {
      kind = 'video'
      if (ext === 'ASSET') ext = 'VIDEO'
    } else if (mediaType === 'image' || IMAGE_EXT.test(cloudCover) || IMAGE_EXT.test(cloudMedia)) {
      kind = 'image'
      if (ext === 'ASSET') ext = 'IMAGE'
    }

    return {
      sourcePlugin: 'omnimux-assets',
      kind,
      entityId: String(asset.id),
      title: asset.name || '资产',
      extension: ext || 'ASSET',
      relativePath: asset.meta?.dims?.name || asset.name || '',
      previewUrl: pUrl,
      metadata: {
        asset_id: asset.id,
        type: asset.type || asset.category || 'custom',
        is_cloud: true,
        category: asset.category || '',
        sub_category: asset.sub_category || '',
        cover_url: asset.cover_url || '',
        media_url: asset.media_url || '',
        source_cover_url: asset.meta?.source_cover_url || '',
        source_media_url: asset.meta?.source_media_url || '',
        media_type: mediaType,
        tags: Array.isArray(asset.tags) ? asset.tags : [],
        files: [],
      },
    }
  }

  return {
    sourcePlugin: 'omnimux-assets',
    kind,
    entityId: String(asset.id),
    title: asset.name || '资产',
    extension: ext || 'ASSET',
    relativePath: coverFile?.relative_path || coverFile?.real_path || coverFile?.name || asset.name || '',
    previewUrl: pUrl,
    metadata: {
      asset_id: asset.id,
      type: asset.type || 'custom',
      files: Array.isArray(asset.files) ? asset.files : [],
    },
  }
}

/**
 * Build standard attachment payload for deep media or preview items.
 *
 * @param {any} mediaItem
 * @returns {{
 *   sourcePlugin: 'omnimux-assets',
 *   kind: 'asset' | 'image' | 'video',
 *   entityId: string,
 *   title: string,
 *   extension: string,
 *   relativePath: string,
 *   previewUrl: string,
 *   metadata: {
 *     asset_id: string,
 *     type: string,
 *     item_id: string,
 *     files: any[],
 *   },
 * } | null}
 */
export function buildMediaPayload(mediaItem) {
  if (!mediaItem) return null
  if (Array.isArray(mediaItem.files) && !mediaItem.sourceAssetId) {
    return buildAssetPayload(mediaItem)
  }

  const assetId = String(mediaItem.sourceAssetId || mediaItem.assetId || mediaItem.id || '')
  const title = String(mediaItem.title || mediaItem.name || '媒体')
  const ext = String(mediaItem.extension || inferAssetExtension(mediaItem, title) || 'MEDIA')
  const pUrl = typeof mediaItem.previewUrl === 'string' ? mediaItem.previewUrl : ''
  const relPath = String(mediaItem.pathInfo || mediaItem.relativePath || mediaItem.relative_path || mediaItem.real_path || title)

  let kind = 'asset'
  if (mediaItem.kind === 'image' || isImageFile(mediaItem) || (ext && ext !== 'MEDIA' && ext !== 'ASSET' && IMAGE_EXT.test(`.${ext}`))) {
    kind = 'image'
  } else if (mediaItem.kind === 'video' || isVideoFile(mediaItem) || (ext && ext !== 'MEDIA' && ext !== 'ASSET' && VIDEO_EXT.test(`.${ext}`))) {
    kind = 'video'
  }

  return {
    sourcePlugin: 'omnimux-assets',
    kind,
    entityId: assetId,
    title,
    extension: ext,
    relativePath: relPath,
    previewUrl: pUrl,
    metadata: {
      asset_id: assetId,
      type: mediaItem.kind || 'media',
      item_id: String(mediaItem.id || ''),
      files: mediaItem.rawItem ? [mediaItem.rawItem] : [],
    },
  }
}

/**
 * Send an attachment payload into conversation bus.
 *
 * @param {any} payload
 * @param {{
 *   window?: any,
 *   CustomEvent?: any,
 * }} [io]
 * @returns {{ ok: boolean, payload?: any, error?: string, addResult?: any }}
 */
function sendPayloadToConversation(payload, io = {}) {
  const win = io.window || (typeof window !== 'undefined' ? window : undefined)
  if (!win) return { ok: false, error: 'no-window' }

  // 1. 优先通过全局统一引用服务 (Unified Reference Hub) 投递
  const refApi = win.__omnimuxReference
  if (refApi && typeof refApi.deliver === 'function') {
    try {
      const isCloud = payload.metadata?.is_cloud === true
      const unifiedRef = {
        id: String(payload.entityId || ''),
        source: 'asset',
        title: String(payload.title || '资产'),
        kind: payload.kind || 'asset',
        file: {
          relativePath: payload.relativePath || '',
          previewUrl: payload.previewUrl || '',
          extension: payload.extension || 'ASSET',
        },
        context: {
          scene: 'general',
          summary: isCloud
            ? `公共素材: ${payload.title} (分类: ${payload.metadata?.category || '未分类'}, 云端编号: ${payload.entityId})`
            : payload.title,
          metadata: payload.metadata,
        },
      }
      refApi.deliver(unifiedRef)
      return { ok: true, payload }
    } catch {
      // 出现异常降级走既有通道
    }
  }

  // 2. 展开/露出中间会话栏
  const wb = win.__omnimuxWorkbench
  if (wb) {
    if (typeof wb.setConversationCollapsed === 'function') {
      try { wb.setConversationCollapsed(false) } catch { /* ignore */ }
    }
    if (typeof wb.setFocus === 'function') {
      try { wb.setFocus('split') } catch { /* ignore */ }
    }
  }

  // 3. 优先调用 window.__omnimuxAttachments?.addAttachment?.('', payload)
  const store = win.__omnimuxAttachments
  let addResult = null
  if (store && typeof store.addAttachment === 'function') {
    try {
      addResult = store.addAttachment('', payload)
    } catch {
      // ignore store error
    }
  }

  // 4. 同时派发全局 window.dispatchEvent(new CustomEvent('omnimux:add-to-conversation', { detail: payload }))
  try {
    if (typeof win.dispatchEvent === 'function') {
      const Evt = io.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null)
      if (Evt) {
        win.dispatchEvent(new Evt('omnimux:add-to-conversation', { detail: payload }))
      }
    }
  } catch {
    // ignore dispatch error
  }

  return { ok: true, payload, addResult }
}

/**
 * Add asset to conversation.
 *
 * @param {any} asset
 * @param {{
 *   window?: any,
 *   CustomEvent?: any,
 * }} [io]
 * @returns {{ ok: boolean, payload?: any, error?: string, addResult?: any }}
 */
export function addAssetToConversation(asset, io = {}) {
  if (!asset || !asset.id) return { ok: false, error: 'no-asset' }
  const payload = buildAssetPayload(asset)
  if (!payload) return { ok: false, error: 'invalid-payload' }
  return sendPayloadToConversation(payload, io)
}

/**
 * Add child media or preview model to conversation.
 *
 * @param {any} mediaItem
 * @param {{
 *   window?: any,
 *   CustomEvent?: any,
 * }} [io]
 * @returns {{ ok: boolean, payload?: any, error?: string, addResult?: any }}
 */
export function addMediaToConversation(mediaItem, io = {}) {
  if (!mediaItem) return { ok: false, error: 'no-media' }
  const payload = buildMediaPayload(mediaItem)
  if (!payload) return { ok: false, error: 'invalid-payload' }
  return sendPayloadToConversation(payload, io)
}
