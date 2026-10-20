import { pickCoverSrc, pickImageSources, pickVideoSrc } from './api.js'
import { toRivalCardRow } from './rival-filter.js'
import { importErrorText, importPillLabel, importSettledNotice, isImportingRow } from './import-status.js'
import { COLLECTION_MEMBER_LAYOUT } from './rival-masonry.js'

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

/**
 * 合集详情成员卡的布局标记（#3459）。
 *
 * 合集是收藏夹/素材架心智：成员卡固定「封面 → 标题 → 元信息」形态，封面
 * 框比例也固定，不再按数据比例起起伏伏。根层信息流继续用
 * `toInspirationCardRow`，两套形态互不影响。布局标记本身住在
 * `rival-masonry.js`（媒体比例的唯一真源），这里只做转发。
 */
export { COLLECTION_MEMBER_LAYOUT }

/**
 * Adapt a collection member row to the shared card with the collection layout.
 *
 * 只在共享映射之上追加一个布局字段：卡片与瀑布流都读 descriptor，
 * 不新增第二个数据源，也不改根层映射。
 * @param {Record<string, any>} row
 * @param {(key: string) => string} [translate]
 * @returns {Record<string, any>}
 */
export function toCollectionMemberCard(row, translate) {
  return { ...toInspirationCardRow(row, translate), layout: COLLECTION_MEMBER_LAYOUT }
}
