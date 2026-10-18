/** Shared input identity: browser and server compare the same saved content. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  return value
}

/** A content version marker, not an authorization token or cryptographic proof. */
export function sourceFingerprint(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let hash = 14695981039346656037n
  for (const char of input) {
    hash ^= BigInt(char.codePointAt(0))
    hash = BigInt.asUintN(64, hash * 1099511628211n)
  }
  return hash.toString(16).padStart(16, '0')
}

/** Normalize legacy photo keys with the existing gallery URL rules. */
function legacyImageUrl(value) {
  if (typeof value !== 'string' || !value || value.includes('..')) return ''
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return /^https?:\/\//i.test(value) ? value : ''
  if (value.startsWith('/omnimux/inspiration/local/media/') || value.startsWith('/omnimux/inspiration/media/')) return value
  if (value.startsWith('/api/inspiration/v1/media/')) return `/omnimux/inspiration/media/${value.slice('/api/inspiration/v1/media/'.length)}`
  return `/omnimux/inspiration/media/${value.replace(/^\/+/, '')}`
}

/** Typed posts keep original indexes; legacy rows follow their photo or video shape. */
export function analysisMediaItems(item) {
  if (Array.isArray(item?.media_items) && item.media_items.length) return item.media_items
  const urls = Array.isArray(item?.media_urls) ? item.media_urls : []
  const isImage = item?.type !== 'video' && (['image', 'photo', 'gallery'].includes(String(item?.type || ''))
    || ['photo', 'gallery'].includes(String(item?.content_shape || '')) || item?.media_kind === 'image')
  if (isImage) {
    const photos = urls.map(legacyImageUrl).filter(Boolean)
    const cover = legacyImageUrl(item.cover_key ?? item.cover_url)
    return [...new Set(photos.length ? photos : [cover].filter(Boolean))].map((url) => ({ type: 'image', url }))
  }
  if (['text', 'link'].includes(String(item?.type || '')) || item?.content_shape === 'text') return []
  const videos = urls.filter((url) => typeof url === 'string' && (/^https?:\/\//i.test(url)
    || url.startsWith('/omnimux/inspiration/local/media/') || url.startsWith('/omnimux/inspiration/media/')))
  if (videos.length) return videos.map((url) => ({ type: 'video', url }))
  if (item?.local_paths?.video) {
    const name = String(item.local_paths.video).split(/[\\/]/).pop()
    return [{ type: 'video', url: `/omnimux/inspiration/local/media/videos/${name}` }]
  }
  return []
}

/** Missing captured slots retain their index but never authorize a media input. */
export function isAvailableMedia(media) {
  return Boolean(media && ['image', 'video'].includes(media.type)
    && (media.status === undefined || media.status === 'saved') && typeof media.url === 'string' && media.url.trim())
}

/** Same target and directions produce the same identity on the browser and server. */
export function analysisInputFingerprint(item, target) {
  const all = analysisMediaItems(item)
  const media = target.scope === 'body' ? [] : target.scope === 'media' ? [all[target.media_index] || null] : all
  return sourceFingerprint({
    scope: target.scope,
    media_index: target.scope === 'media' ? target.media_index : null,
    directions: [...new Set(target.directions || ['content', 'expression', 'creative'])],
    title: item.title || '',
    body: item.content || '',
    media: media.map((entry) => entry ? { type: entry.type, url: entry.url } : null),
    context: target.scope === 'post' ? { quoted: item.quoted || null, thread_items: item.thread_items || [] } : null,
  })
}
