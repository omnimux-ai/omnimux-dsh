import { pickCoverSrc, pickImageSources, pickVideoSrc } from './api.js'
import { toRivalCardRow } from './rival-filter.js'
import { importErrorText, importPillLabel, importSettledNotice, isImportingRow } from './import-status.js'

/** Adapt a saved/public item to the shared feed card without changing its source row. */
export function toInspirationCardRow(row, translate) {
  const t = typeof translate === 'function' ? translate : (key) => key
  const type = String(row?.type || '').toLowerCase()
  const shape = String(row?.content_shape || '').toLowerCase()
  const video = pickVideoSrc(row)
  const images = pickImageSources(row)
  const cover = pickCoverSrc(row) || images[0] || ''
  const isVideo = type === 'video' || shape === 'video' || Boolean(video)
  const isImage = !isVideo && (type === 'image' || shape === 'photo' || shape === 'gallery' || images.length > 0)
  const hasSavedMedia = Boolean(video || images.length || cover)
  const hasMedia = row?.import_status === 'failed' && !hasSavedMedia ? false : isVideo || isImage || Boolean(cover)
  const account = row?.author || {}
  const notice = !hasMedia ? (isImportingRow(row) ? importPillLabel(row, t) : importSettledNotice(row, t) || importErrorText(row, t) || (row?.import_status === 'failed' ? importPillLabel(row, t) : '')) : ''
  const normalized = toRivalCardRow({
    ...row,
    row_id: row?.id,
    title: notice || String(row?.content || row?.title || row?.source_url || row?.id || ''),
    url: row?.source_url,
    cover_src: cover,
    type: isVideo ? 'video' : isImage ? 'image' : 'text',
    media_kind: !hasMedia ? '' : isVideo ? 'video' : 'image',
    has_media: hasMedia,
    card_type: !hasMedia ? 'text' : undefined,
    account: {
      nickname: account.name || row?.author_name || '',
      handle: account.handle || '',
      platform: row?.source_platform || '',
    },
  })
  return { ...normalized, source_row: row, image_count: images.length, notice_kind: notice ? (isImportingRow(row) ? 'importing' : 'error') : '' }
}
