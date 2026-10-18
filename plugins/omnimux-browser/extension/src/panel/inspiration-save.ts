import { canonicalInspirationUrl, inspirationTaskForSource, type InspirationSaveTask, type InspirationSaveRequest } from '../shared/inspiration-save.ts'
import { tweetCaptureForInspiration } from '../content/twitter-capture/extractor.ts'
import type { PageSceneInfo } from './components/SceneBadge.tsx'
import type { SniffedMediaItem } from './components/MediaSnifferBar.tsx'

/** A preview belongs to its own post; it must never borrow the hero card's tweet. */
export function pageInspirationRequest(scene: PageSceneInfo | null, media?: SniffedMediaItem): InspirationSaveRequest | null {
  if (!scene) return null
  if (media?.inspirationCapture) {
    const url = canonicalInspirationUrl(media.inspirationUrl)
    return url ? { targetUrl: url, capture: { ...media.inspirationCapture } } : null
  }
  if (media && scene.platform === 'twitter') return null
  const targetUrl = canonicalInspirationUrl(media?.inspirationUrl ?? scene.tweet?.url ?? scene.url)
  if (!targetUrl) return null
  if (!media && scene.tweet) return { targetUrl, capture: { ...tweetCaptureForInspiration(scene.tweet) } }
  const videoUrl = media?.videoSrc ?? (media?.sourceKind === 'direct' ? media.src : '')
  const posterUrl = media?.posterSrc ?? (media?.sourceKind === 'poster' ? media.previewSrc : '')
  return { targetUrl, capture: {
    url: targetUrl, title: scene.title, text: scene.postText || '',
    shape: media?.type === 'video' ? 'video' : media ? 'photo' : 'link',
    cover_url: media?.type === 'video' ? posterUrl : media?.previewSrc || scene.heroImage || '',
    media_items: media ? [{ type: media.type, url: media.type === 'video' ? videoUrl : media.src, ...(media.type === 'video' && posterUrl ? { poster_url: posterUrl } : {}) }] : [],
  } }
}

/** Rendering and submission resolve exactly the same post; a live binding keeps its own host. */
export function pageInspirationTask(scene: PageSceneInfo | null, media: SniffedMediaItem, tasks: InspirationSaveTask[]): InspirationSaveTask | null {
  const request = pageInspirationRequest(scene, media)
  if (!request) return null
  return inspirationTaskForSource(tasks, request.targetUrl)
}
