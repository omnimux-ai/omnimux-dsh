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

/** Current posts preserve their original indexes; legacy rows have one first video. */
export function analysisMediaItems(item) {
  if (Array.isArray(item?.media_items) && item.media_items.length) return item.media_items
  if (Array.isArray(item?.media_urls) && item.media_urls.length) return item.media_urls.map((url) => ({ type: 'video', url }))
  if (item?.local_paths?.video) {
    const name = String(item.local_paths.video).split(/[\\/]/).pop()
    return [{ type: 'video', url: `/omnimux/inspiration/local/media/videos/${name}` }]
  }
  return []
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
