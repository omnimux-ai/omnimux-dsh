import { previewUrl } from './api.js'
import { inferAssetExtension, pickCoverFile } from './add-to-chat.js'

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|tiff)$/i
export const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|m4v|flv)$/i

/**
 * Check if a file descriptor or row reference is a directory.
 * @param {any} file
 * @returns {boolean}
 */
export function isDirectoryRef(file) {
  if (!file) return false
  return file.kind === 'directory' || file.is_dir === true || file.type === 'directory'
}

/**
 * Determine whether an asset needs hierarchical browsing, including logical or unavailable refs.
 * @param {any} asset
 * @returns {boolean}
 */
export function isFolderAsset(asset) {
  if (!asset) return false
  const files = Array.isArray(asset.files) ? asset.files : []
  if (Array.isArray(asset.unavailable_files) && asset.unavailable_files.length > 0) return true
  if (files.some((file) => typeof file.logical_path === 'string' && file.logical_path.length > 0)) return true
  if (files.length > 1) return true
  if (files.length === 1 && isDirectoryRef(files[0])) return true
  return false
}

/**
 * Determine if an asset is a single media item (not a folder/composite pack).
 * @param {any} asset
 * @returns {boolean}
 */
export function isMediaAsset(asset) {
  return Boolean(asset) && !isFolderAsset(asset)
}

/**
 * Detect media category from a row or file descriptor.
 * @param {any} row
 * @returns {'folder' | 'image' | 'video' | 'file'}
 */
export function detectMediaKind(row) {
  if (!row) return 'file'
  if (isDirectoryRef(row) || row.is_dir === true) return 'folder'
  const kind = String(row.kind || row.type || '')
  if (kind === 'image' || kind === 'video') return kind
  const name = String(row.name || row.original_name || row.real_path || row.relative_path || '')
  if (IMAGE_EXT.test(name)) return 'image'
  if (VIDEO_EXT.test(name)) return 'video'
  return 'file'
}

/**
 * Standardize an asset or child item into a normalized media preview model.
 *
 * @param {any} target - An asset object or a child directory entry
 * @param {{
 *   asset?: any,
 *   stack?: { file: any, path: string },
 *   pathInfo?: string,
 * }} [options]
 * @returns {{
 *   id: string,
 *   title: string,
 *   extension: string,
 *   kind: 'folder' | 'image' | 'video' | 'file',
 *   previewUrl: string,
 *   pathInfo: string,
 *   sourceAssetId: string,
 *   sourceAsset: any | null,
 *   rawItem: any,
 * }}
 */
export function resolveAssetMediaPreview(target, options = {}) {
  if (!target) {
    return {
      id: '',
      title: '',
      extension: 'FILE',
      kind: 'file',
      previewUrl: '',
      pathInfo: '',
      sourceAssetId: '',
      sourceAsset: null,
      rawItem: null,
    }
  }

  const parentAsset = options.asset || (target.files ? target : null)
  const isTopAsset = Boolean(target.id && !options.asset && Array.isArray(target.files))

  if (isTopAsset) {
    const coverFile = pickCoverFile(target) || (target.files ? target.files[0] : null)
    const ext = inferAssetExtension(coverFile, target.name)
    const kind = detectMediaKind(coverFile || target)
    const pUrl = coverFile?.id
      ? previewUrl(target.id, coverFile.id)
      : (typeof coverFile?.preview_url === 'string' ? coverFile.preview_url : '')
    const path = String(
      options.pathInfo ||
      coverFile?.relative_path ||
      coverFile?.real_path ||
      coverFile?.original_name ||
      coverFile?.name ||
      target.name ||
      ''
    )

    return {
      id: String(target.id),
      title: target.name || '资产',
      extension: ext,
      kind,
      previewUrl: pUrl,
      pathInfo: path,
      sourceAssetId: String(target.id),
      sourceAsset: target,
      rawItem: target,
    }
  }

  // Target is a child entry (nested in browse)
  const sourceAssetId = String(parentAsset?.id || options.asset?.id || '')
  const title = String(target.name || target.original_name || '媒体')
  const ext = inferAssetExtension(target, title)
  const kind = detectMediaKind(target)

  let calculatedPath = options.pathInfo || ''
  if (!calculatedPath) {
    if (target.relative_path) {
      calculatedPath = target.relative_path
    } else if (options.stack) {
      calculatedPath = [options.stack.path, target.name].filter(Boolean).join('/')
    } else {
      calculatedPath = target.real_path || target.name || title
    }
  }

  let pUrl = ''
  if (options.stack && options.asset?.id && options.stack.file?.id) {
    const sub = target.relative_path || [options.stack.path, target.name].filter(Boolean).join('/')
    pUrl = previewUrl(options.asset.id, options.stack.file.id, sub)
  } else if (parentAsset?.id && target.id) {
    pUrl = previewUrl(parentAsset.id, target.id)
  } else if (typeof target.preview_url === 'string') {
    pUrl = target.preview_url
  }

  const itemId = String(target.id || (sourceAssetId ? `${sourceAssetId}:${calculatedPath}` : title))

  return {
    id: itemId,
    title,
    extension: ext,
    kind,
    previewUrl: pUrl,
    pathInfo: calculatedPath,
    sourceAssetId,
    sourceAsset: parentAsset || null,
    rawItem: target,
  }
}
