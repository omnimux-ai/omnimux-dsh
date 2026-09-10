const pending = new Map()
const failed = new Map()
const CACHE = 'omnimux-project-thumbnails-v1'
let tail = Promise.resolve()

function renderThumbnail(cover) {
  return new Promise((resolve, reject) => {
    const video = cover.kind === 'video' && !cover.thumbnailUrl
    const media = document.createElement(video ? 'video' : 'img')
    let settled = false
    const finish = (error, blob) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      media.onload = media.onerror = media.onloadedmetadata = media.onloadeddata = media.onseeked = null
      if (video) media.pause()
      media.removeAttribute('src')
      if (video) media.load()
      if (error) reject(error); else resolve(blob)
    }
    const timer = setTimeout(() => finish(new Error('thumbnail-timeout')), 10000)
    const draw = () => {
      if (settled) return
      try {
        const width = video ? media.videoWidth : media.naturalWidth
        const height = video ? media.videoHeight : media.naturalHeight
        if (!width || !height) throw new Error('thumbnail-no-dimensions')
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 640 / Math.max(width, height))
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        canvas.getContext('2d').drawImage(media, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob ? null : new Error('thumbnail-encode-failed'), blob), 'image/webp', 0.82)
      } catch (error) { finish(error) }
    }
    media.crossOrigin = 'anonymous'
    media.onerror = () => finish(new Error('thumbnail-load-failed'))
    if (video) {
      media.muted = true
      media.preload = 'metadata'
      media.onloadedmetadata = () => {
        const time = Number.isFinite(media.duration) ? Math.min(1, media.duration * 0.1) : 0
        media.onseeked = draw
        if (time > 0) media.currentTime = time
        else { media.onloadeddata = draw; if (media.readyState >= 2) draw() }
      }
    } else media.onload = draw
    media.src = cover.thumbnailUrl || cover.mediaUrl
  })
}
/** One decoder at a time, versioned persistent blobs, bounded failures and cache. */
export async function loadCoverThumbnail(cover) {
  const source = cover.thumbnailUrl || cover.mediaUrl
  if (!source || !['image', 'video'].includes(cover.kind)) return null
  const key = `${cover.kind}:${cover.sourceRevision || source}`
  if ((failed.get(key) || 0) > Date.now()) throw new Error('thumbnail-retry-later')
  if (pending.has(key)) return pending.get(key)
  if (pending.size >= 32) throw new Error('thumbnail-queue-full')
  const work = tail.catch(() => {}).then(async () => {
    let cache
    let request
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      request = new Request(`${location.origin}/omnimux-cover-cache/${hash}`)
      cache = await caches.open(CACHE)
      const existing = await cache.match(request)
      if (existing && Date.now() - Number(existing.headers.get('x-cover-created') || 0) < 3600000) {
        const cachedBlob = await existing.blob()
        try {
          const bitmap = await createImageBitmap(cachedBlob)
          bitmap.close()
          return cachedBlob
        } catch { await cache.delete(request) }
      }
    } catch { /* Private/limited storage still supports transient previews. */ }
    let blob
    try { blob = await renderThumbnail(cover) }
    catch (error) {
      if (cover.kind !== 'video' || !cover.thumbnailUrl || !cover.mediaUrl) throw error
      blob = await renderThumbnail({ ...cover, thumbnailUrl: undefined })
    }
    if (cache && request) {
      try {
        await cache.put(request, new Response(blob, { headers: { 'x-cover-created': String(Date.now()) } }))
        const keys = await cache.keys()
        await Promise.all(keys.slice(0, Math.max(0, keys.length - 128)).map((entry) => cache.delete(entry)))
      } catch { /* Storage failures must not hide a successfully decoded cover. */ }
    }
    return blob
  })
  tail = work
  pending.set(key, work)
  try { return await work }
  catch (error) {
    failed.set(key, Date.now() + 30000)
    if (failed.size > 128) failed.delete(failed.keys().next().value)
    throw error
  } finally { pending.delete(key) }
}
