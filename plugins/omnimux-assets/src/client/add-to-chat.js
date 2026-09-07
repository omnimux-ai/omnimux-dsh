import { previewUrl } from './api.js'

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|tiff)$/i

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
  const coverFile = pickCoverFile(asset) || (Array.isArray(asset.files) ? asset.files[0] : null)
  const ext = inferAssetExtension(coverFile, asset.name)
  const pUrl = coverFile?.id
    ? previewUrl(asset.id, coverFile.id)
    : (typeof coverFile?.preview_url === 'string' ? coverFile.preview_url : '')

  return {
    sourcePlugin: 'omnimux-assets',
    kind: 'asset',
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
 *   kind: 'asset',
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

  return {
    sourcePlugin: 'omnimux-assets',
    kind: 'asset',
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

  // 1. 展开/露出中间会话栏
  const wb = win.__omnimuxWorkbench
  if (wb) {
    if (typeof wb.setConversationCollapsed === 'function') {
      try { wb.setConversationCollapsed(false) } catch { /* ignore */ }
    }
    if (typeof wb.setFocus === 'function') {
      try { wb.setFocus('split') } catch { /* ignore */ }
    }
  }

  // 2. 优先调用 window.__omnimuxAttachments?.addAttachment?.('', payload)
  const store = win.__omnimuxAttachments
  let addResult = null
  if (store && typeof store.addAttachment === 'function') {
    try {
      addResult = store.addAttachment('', payload)
    } catch {
      // ignore store error
    }
  }

  // 3. 同时派发全局 window.dispatchEvent(new CustomEvent('omnimux:add-to-conversation', { detail: payload }))
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
