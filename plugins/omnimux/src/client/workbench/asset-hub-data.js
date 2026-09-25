/**
 * Asset Hub Data Loader & Normalizer Adapter.
 * 负责各分类数据的加载、格式规范化、二级筛选及防抖过滤。
 * 遵循 specs/three-column-asset-hub.spec.md 与 design.md 规范。
 */

import { inferExtension } from '../attachments/store.ts'
import { resolveProductPreview } from '../components/product-picker/product-attachment-sync.js'

async function requestJson(path, fetchImpl, signal) {
  const fetchFn = fetchImpl || (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)
  if (typeof fetchFn !== 'function') {
    throw new Error('网络请求服务不可用')
  }
  const response = await fetchFn(path, { signal })
  let body = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }
  return { ok: Boolean(response?.ok), status: Number(response?.status) || 0, body }
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}

/**
 * 组装资产库真实预览缩略图 URL
 */
function resolveAssetThumbnail(row, id) {
  if (row.thumbnailUrl) return row.thumbnailUrl
  if (row.previewUrl) return row.previewUrl
  if (row.coverUrl) return row.coverUrl
  if (row.cover) {
    if (typeof row.cover === 'string') return row.cover
    if (row.cover.id) {
      return `/omnimux/assets/library/preview?id=${encodeURIComponent(id)}&file=${encodeURIComponent(row.cover.id)}`
    }
  }
  if (Array.isArray(row.files) && row.files.length > 0) {
    const imgFile = row.files.find((f) => {
      if (!f) return false
      if (f.kind === 'image' || f.type === 'image') return true
      if (typeof f.mime === 'string' && f.mime.startsWith('image/')) return true
      const name = String(f.original_name || f.name || f.relative_path || f.real_path || '')
      return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)
    }) || row.files[0]
    if (imgFile?.id) {
      return `/omnimux/assets/library/preview?id=${encodeURIComponent(id)}&file=${encodeURIComponent(imgFile.id)}`
    }
  }
  if (row.fileId) {
    return `/omnimux/assets/library/preview?id=${encodeURIComponent(id)}&file=${encodeURIComponent(row.fileId)}`
  }
  return row.url || ''
}

/**
 * 转换资产库数据
 */
export function normalizeAssetItem(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '')
  const title = String(row.name || row.title || row.filename || id)
  const ext = inferExtension(title, row.relativePath || row.url || '', row.extension || row.format)
  const isVideo = ext === 'MP4' || ext === 'WEBM' || ext === 'MOV' || row.type === 'video'
  const isImage = ext === 'PNG' || ext === 'JPG' || ext === 'JPEG' || ext === 'WEBP' || ext === 'GIF' || row.type === 'image'
  const isAudio = ext === 'MP3' || ext === 'WAV' || row.type === 'audio'
  let mediaType = 'document'
  if (isVideo) mediaType = 'video'
  else if (isImage) mediaType = 'image'
  else if (isAudio) mediaType = 'audio'

  let durationText = ''
  if (typeof row.duration === 'number') {
    durationText = formatDuration(row.duration)
  }

  let dimensionsOrSize = ''
  if (row.width && row.height) {
    dimensionsOrSize = `${row.width}×${row.height}`
  } else if (row.size) {
    dimensionsOrSize = formatFileSize(row.size)
  }

  const thumbnailUrl = resolveAssetThumbnail(row, id)
  const previewVideoUrl = isVideo ? (row.previewVideoUrl || row.videoUrl || row.url || '') : ''

  return {
    id,
    lane: 'assets',
    title,
    thumbnailUrl,
    previewVideoUrl,
    mediaType,
    durationText,
    formatText: ext,
    dimensionsOrSize,
    raw: row,
  }
}

/**
 * 转换灵感库数据：严格读取真实 row.type，自适应支持静态图片与音视频灵感
 */
export function normalizeInspirationItem(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '')
  const title = String(row.title || row.name || row.description || id)
  const rawType = String(row.type || row.media_type || row.kind || '').toLowerCase()
  const rawUrl = String(row.url || row.videoUrl || row.mediaUrl || row.coverUrl || row.cover || '')
  const ext = inferExtension(title, rawUrl, row.format || row.extension)

  const isImage = rawType === 'image' || rawType === 'photo' || rawType === 'picture' ||
    ext === 'PNG' || ext === 'JPG' || ext === 'JPEG' || ext === 'WEBP' || ext === 'GIF'
  const isAudio = rawType === 'audio' || ext === 'MP3' || ext === 'WAV'
  const hasVideoProbe = Boolean(
    rawType === 'video' || rawType === 'short' || rawType === 'reel' || rawType === 'media' ||
    ext === 'MP4' || ext === 'WEBM' || ext === 'MOV' || ext === 'MKV' || ext === 'AVI' || ext === 'M4V' ||
    row.videoUrl || row.mediaUrl || (Array.isArray(row.media_urls) && row.media_urls.length > 0) || row.video ||
    (typeof row.duration === 'number' && row.duration > 0) ||
    /video|视频|reel|short/i.test(title)
  )
  const isVideo = !isImage && !isAudio && hasVideoProbe

  let mediaType = rawType || 'custom'
  if (isImage) {
    mediaType = 'image'
  } else if (isAudio) {
    mediaType = 'audio'
  } else if (isVideo) {
    mediaType = 'video'
  }

  let formatFallback = ''
  if (isImage) {
    formatFallback = 'PNG'
  } else if (isAudio) {
    formatFallback = 'MP3'
  } else if (isVideo) {
    formatFallback = 'MP4'
  }
  const cleanExt = (ext && ext !== 'FILE') ? ext : ''
  const formatText = cleanExt || formatFallback
  const durationText = (isVideo || isAudio) && typeof row.duration === 'number' ? formatDuration(row.duration) : ''
  const thumbnailUrl = row.coverUrl || row.cover || row.thumbnailUrl || row.poster || row.cover_url || (isImage ? rawUrl : '')
  const previewVideoUrl = isVideo ? (row.videoUrl || row.mediaUrl || row.url || (Array.isArray(row.media_urls) ? row.media_urls[0] : '')) : ''

  return {
    id,
    lane: 'inspiration',
    title,
    thumbnailUrl,
    previewVideoUrl,
    mediaType,
    durationText,
    formatText,
    dimensionsOrSize: row.resolution || '',
    raw: row,
  }
}

/**
 * 转换商品库数据
 */
export function normalizeProductItem(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '')
  const title = String(row.name || row.title || id)
  const ext = 'JSON'
  const preview = resolveProductPreview(row)
  const thumbnailUrl = preview || row.imageUrl || row.coverUrl || ''

  return {
    id,
    lane: 'products',
    title,
    thumbnailUrl,
    previewVideoUrl: '',
    mediaType: 'image',
    durationText: '',
    formatText: ext,
    dimensionsOrSize: row.sku ? `SKU: ${row.sku}` : '',
    raw: row,
  }
}

function pickArrayCandidate(body, candidateKeys) {
  if (!body || typeof body !== 'object') return []
  for (const key of candidateKeys) {
    let val = body
    if (key.includes('.')) {
      const parts = key.split('.')
      for (const p of parts) {
        val = val?.[p]
      }
    } else {
      val = val[key]
    }
    if (Array.isArray(val)) return val
  }
  return []
}

/**
 * 加载并归一化素材卡片列表
 */
export async function loadAssetHubData(tab, options = {}) {
  const { fetchImpl, signal } = options

  if (tab === 'assets') {
    const res = await requestJson('/omnimux/assets/library', fetchImpl, signal)
    if (!res.ok) throw new Error(res.body?.message || '加载失败')
    const list = pickArrayCandidate(res.body, ['assets', 'items'])
    return list.map(normalizeAssetItem).filter(Boolean)
  }

  if (tab === 'inspiration') {
    const res = await requestJson(
      '/omnimux/inspiration/local?sort=hot&page=1&page_size=48&projection=lean',
      fetchImpl,
      signal
    )
    if (!res.ok) throw new Error(res.body?.message || '加载失败')
    const list = pickArrayCandidate(res.body, ['data.items', 'items', 'videos', 'inspirations'])
    return list.map(normalizeInspirationItem).filter(Boolean)
  }

  if (tab === 'products') {
    const res = await requestJson('/omnimux/products', fetchImpl, signal)
    if (!res.ok) throw new Error(res.body?.message || '加载失败')
    const list = pickArrayCandidate(res.body, ['products', 'items'])
    return list.map(normalizeProductItem).filter(Boolean)
  }

  return []
}

/**
 * 中文胶囊标签到后端英文枚举的映射字典
 */
export const FILTER_PILL_ENUM_MAP = Object.freeze({
  // 资产库标签映射
  '本地上传': Object.freeze(['upload', 'local', 'imported', 'user_upload', 'file']),
  '生成资产': Object.freeze(['generated', 'generation', 'ai_generated', 'ai', 'aigc', 'output']),
  '数字人': Object.freeze(['digital_human', 'character', 'avatar', 'human', 'person', 'actor']),
  '商品图': Object.freeze(['product', 'goods', 'item', 'prop', 'scene']),

  // 灵感库标签映射
  '爆款视频': Object.freeze(['video', 'hot_video', 'reel', 'short', 'viral', 'media']),
  '分镜脚本': Object.freeze(['script', 'storyboard', 'shot', 'breakdown']),
  '创意提示词': Object.freeze(['prompt', 'creative', 'idea', 'text']),
  '视觉风格': Object.freeze(['style', 'visual', 'theme', 'look']),

  // 商品库标签映射
  '商品主图': Object.freeze(['main', 'primary', 'cover', 'hero', 'image']),
  '模特展示': Object.freeze(['model', 'wear', 'tryon', 'person', 'character']),
  '卖点细节': Object.freeze(['detail', 'feature', 'spec', 'close_up']),
  '场景切片': Object.freeze(['scene', 'context', 'lifestyle', 'slice']),
})

function matchesExactToken(text, token) {
  if (!text || !token) return false
  const tokens = String(text).toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean)
  return tokens.includes(String(token).toLowerCase())
}

/**
 * 二级筛选标签与搜索组合过滤
 */
export function filterAssetHubItems(items, filterPill, searchQuery) {
  let filtered = items

  // 1. 二级筛选过滤
  if (filterPill && filterPill !== '全部') {
    const targetEnums = FILTER_PILL_ENUM_MAP[filterPill] || []
    filtered = filtered.filter((item) => {
      const raw = item.raw || {}
      const category = String(raw.category || raw.type || raw.tag || raw.channel || raw.kind || '').toLowerCase()
      const title = item.title.toLowerCase()
      const query = filterPill.toLowerCase()

      // 1. 中文字符串直接匹配
      if (category.includes(query) || title.includes(query)) return true

      // 2. 匹配后端英文枚举字典（整词精准匹配）
      if (targetEnums.length > 0) {
        if (targetEnums.some((enumVal) => matchesExactToken(category, enumVal))) return true
        if (targetEnums.includes(item.mediaType)) return true
        if (Array.isArray(raw.tags)) {
          for (const t of raw.tags) {
            if (targetEnums.some((enumVal) => matchesExactToken(String(t), enumVal))) return true
          }
        }
      }

      return false
    })
  }

  // 2. 搜索关键词过滤
  const q = String(searchQuery || '').trim().toLowerCase()
  if (q) {
    filtered = filtered.filter((item) => {
      return item.title.toLowerCase().includes(q)
    })
  }

  return filtered
}

/**
 * 将素材卡片转换为 AttachmentStore 所需的标准载荷
 */
export function adaptCardToAttachmentPayload(card) {
  const raw = card.raw || {}
  if (card.lane === 'products') {
    return {
      sourcePlugin: 'omnimux-products',
      kind: 'product',
      entityId: card.id,
      title: card.title,
      extension: 'JSON',
      relativePath: raw.relativePath || `products/${card.id}.json`,
      previewUrl: card.thumbnailUrl,
      metadata: { product: raw },
    }
  }

  if (card.lane === 'inspiration') {
    let kind = 'video'
    let extensionFallback = 'MP4'
    if (card.mediaType === 'image') {
      kind = 'image'
      extensionFallback = 'JPG'
    } else if (card.mediaType === 'audio') {
      kind = 'audio'
      extensionFallback = 'MP3'
    }
    const extension = card.formatText || extensionFallback
    return {
      sourcePlugin: 'omnimux-inspiration',
      kind,
      entityId: card.id,
      title: card.title,
      extension,
      relativePath: raw.relativePath || `inspiration/${card.id}.${extension.toLowerCase()}`,
      previewUrl: card.thumbnailUrl,
      metadata: { inspiration: raw },
    }
  }

  // 资产库
  return {
    sourcePlugin: 'omnimux',
    kind: 'asset',
    entityId: card.id,
    title: card.title,
    extension: card.formatText || 'FILE',
    relativePath: raw.relativePath || raw.path || `assets/${card.id}`,
    previewUrl: card.thumbnailUrl,
    metadata: {
      duration: raw.duration,
      dimensions: card.dimensionsOrSize,
      asset: raw,
    },
  }
}
