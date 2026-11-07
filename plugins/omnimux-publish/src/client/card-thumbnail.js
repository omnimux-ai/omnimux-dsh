/**
 * 卡片封面缩略图选择（纯函数，便于单测；UI04 无关，只算 id）。
 * 优先显式封面 `cover_media_id`；图文类型用首图 `media_ids[0]` 兜底；视频或都没有返回 ''。
 * @param {{ cover_media_id?: unknown, media_ids?: unknown, type?: unknown } | null | undefined} record
 * @returns {string}
 */
export function pickThumbnailId(record) {
  if (!record || typeof record !== 'object') return ''
  const coverId = typeof record.cover_media_id === 'string' ? record.cover_media_id : ''
  if (coverId) return coverId
  if (record.type === 'video') return ''
  const media = Array.isArray(record.media_ids) ? record.media_ids : []
  return typeof media[0] === 'string' ? media[0] : ''
}
