/**
 * Media Sniffer: detects visible images and video posters in the current viewport
 * so users can toggle them into attachments with one click.
 */

export interface DetectedMediaItem {
  id: string
  type: 'image' | 'video'
  src: string
  previewSrc: string
  alt?: string
  width?: number
  height?: number
}

export function sniffViewportMedia(): DetectedMediaItem[] {
  const items: DetectedMediaItem[] = []
  const seenUrls = new Set<string>()

  const vw = window.innerWidth || document.documentElement.clientWidth
  const vh = window.innerHeight || document.documentElement.clientHeight

  function isElementInViewport(el: Element): boolean {
    const rect = el.getBoundingClientRect()
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < vh &&
      rect.left < vw &&
      rect.width >= 40 &&
      rect.height >= 40
    )
  }

  // 1. Scan <img> elements
  const imgs = document.querySelectorAll('img')
  for (const img of imgs) {
    if (items.length >= 8) break
    const src = img.currentSrc || img.src
    if (!src || src.startsWith('data:') || seenUrls.has(src)) continue
    // Filter tiny tracking pixels / avatars < 40px
    if (isElementInViewport(img)) {
      seenUrls.add(src)
      items.push({
        id: `img_${items.length + 1}`,
        type: 'image',
        src,
        previewSrc: src,
        alt: img.alt || img.title || '网页图片',
        width: img.naturalWidth || img.clientWidth,
        height: img.naturalHeight || img.clientHeight,
      })
    }
  }

  // 2. Scan <video> elements
  const videos = document.querySelectorAll('video')
  for (const video of videos) {
    if (items.length >= 8) break
    const poster = video.poster
    if (poster && !seenUrls.has(poster) && isElementInViewport(video)) {
      seenUrls.add(poster)
      items.push({
        id: `video_${items.length + 1}`,
        type: 'video',
        src: poster,
        previewSrc: poster,
        alt: '视频海报',
        width: video.videoWidth || video.clientWidth,
        height: video.videoHeight || video.clientHeight,
      })
    }
  }

  return items
}
