import { analysisInputFingerprint, analysisMediaItems, sourceFingerprint } from '../analysis-input.js'
import { hostMediaSrc, pickVideoSrc } from './api.js'

/** Original post text is independent of generated narration and analysis. */
export function getPostBody(item) {
  return typeof item?.content === 'string' ? item.content : ''
}

/** Keep persisted indexes: filtering an unusable URL must not retarget another asset. */
export function getPostMedia(item) {
  // Filesystem paths are not browser media addresses. A legacy player must have
  // a persisted URL; only an actual image record may use its saved cover.
  const hasUrls = item?.media_items?.length || item?.media_urls?.length
  const imageRecord = ['image', 'photo', 'gallery'].includes(item?.type)
    || ['photo', 'gallery'].includes(item?.content_shape) || item?.media_kind === 'image'
  if (!hasUrls && !imageRecord) return []
  const counters = { video: 0, image: 0 }
  return analysisMediaItems(item).flatMap((media, index) => {
    if (!media || !['video', 'image'].includes(media.type) || typeof media.url !== 'string') return []
    if (/^[a-z][a-z\d+.-]*:/i.test(media.url) && !/^https?:\/\//i.test(media.url)) return []
    const url = media.type === 'video' ? pickVideoSrc({ media_urls: [media.url] }) : hostMediaSrc(media.url)
    if (!url) return []
    const number = ++counters[media.type]
    const label = `${media.type === 'video' ? '视频' : '图片'} ${number}`
    return [{ ...media, id: `media:${index}`, index, url, label, title: media.title || label, duration: media.duration || (media.type === 'video' && number === 1 ? item?.duration : undefined) }]
  })
}

export function analysisTargetKey(target = { scope: 'post' }) {
  return target.scope === 'media' ? `media:${target.media_index}` : target.scope
}

/** Return only results whose complete saved inputs still match this post. */
export function getTargetAnalysis(item, target = { scope: 'post' }) {
  const key = analysisTargetKey(target)
  const entry = item?.analysis_results?.[key]
  if (entry) {
    const fingerprint = analysisInputFingerprint(item, { ...target, directions: entry.directions })
    if (entry.input_fingerprint !== fingerprint) return { ...entry, status: 'stale', error: '原帖或素材已更新，请重新分析', result: null }
    return entry
  }
  const firstVideo = analysisMediaItems(item).findIndex((media) => media?.type === 'video')
  const legacy = item?.deconstruction || item?.analysis
  if (target.scope === 'media' && target.media_index === firstVideo && legacy) {
    return { scope: 'media', media_index: firstVideo, status: 'legacy', source: 'legacy_unknown', model: '', result: typeof legacy === 'object' ? legacy : { markdown: legacy }, error: null }
  }
  return null
}

/** Direction IDs are stable across text, image and video; labels adapt in the view. */
export function analysisDirections() {
  return ['content', 'expression', 'creative']
}

export function getBodyTranslation(item) {
  const translation = item?.body_translation
  return translation?.source_fingerprint === sourceFingerprint(getPostBody(item)) && typeof translation.text === 'string'
    ? translation : null
}
