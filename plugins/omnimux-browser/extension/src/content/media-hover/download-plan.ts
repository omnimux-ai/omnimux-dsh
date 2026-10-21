/**
 * Download planning: hovered payload → one concrete `chrome.downloads` request.
 *
 * The capsule's second slot no longer copies a link, it saves a file, so the
 * payload's display address is not automatically a download address: a video is
 * still known by its poster, and `resolveMediaSource` deliberately keeps poster
 * first for thumbnails. This module is the single place that answers "what file
 * would this press actually produce?", and it answers with a reason instead of a
 * guess when the page only offers a page-scoped stream.
 *
 * Layering: everything here is pure. The caller supplies the video element, the
 * X variant list and the resource-timing names, so the same decision is testable
 * without a browser and the network stays in `actions.ts`.
 *
 * @module
 */

import type { HoveredMedia } from './types.ts'
import {
  pickDownloadCandidate,
  pickXVideoVariant,
  resolveSyncVideoCandidates,
  xMediaIdFromPoster,
  xTweetIdOf,
  type VideoSourceCandidate,
  type XVideoVariant,
} from './video-source.ts'

/** The request the worker hands to `chrome.downloads.download`. */
export interface DownloadPlanRequest {
  /** Absolute http(s) address of the real media file. */
  url: string
  /** Suggested name; `''` lets the worker derive one from the URL. */
  filename: string
  /** Page the user pressed on, kept for naming/telemetry only. */
  pageUrl: string
  pageTitle: string
  type: 'image' | 'video'
}

/** Why no download request could be produced. */
export type DownloadPlanFailure = 'unusable' | 'video-unavailable'

/** The plan for one press. */
export type DownloadPlan =
  | { ok: true; request: DownloadPlanRequest }
  | { ok: false; reason: DownloadPlanFailure }

/** Everything the planner may look at, all injected by the caller. */
export interface DownloadPlanContext {
  payload: HoveredMedia
  /** Page address used to resolve relative sources and the X tweet id. */
  pageUrl: string
  pageTitle?: string
  /** The live `<img>` / `<video>` the payload came from, when still mounted. */
  element?: Element | null
  /** X video variants fetched by the worker, when the page is an X post. */
  variants?: readonly XVideoVariant[]
  /** Resource-timing names, used to sniff an HLS/mp4 the page already loaded. */
  entryNames?: readonly string[]
}

/**
 * Finds the live media element a payload describes.
 *
 * Matching is by address rather than by position: a feed can recycle one card's
 * node for the next post, and the payload may outlive the element it was read
 * from. Videos match on their poster (the payload's `previewSrc` for the poster
 * rung) or on their playable source.
 *
 * @param payload - The hovered media record.
 * @param root - Document or root to search; `null` outside a page.
 */
export function mediaElementFor(payload: HoveredMedia, root: ParentNode | null): Element | null {
  if (root === null) return null

  if (payload.type === 'image') {
    for (const image of root.querySelectorAll('img')) {
      const src = image.currentSrc || image.getAttribute('src') || ''
      if (src !== '' && (src === payload.src || src === payload.previewSrc)) return image
    }
    return null
  }

  for (const video of root.querySelectorAll('video')) {
    const poster = video.getAttribute('poster') ?? ''
    if (poster !== '' && (poster === payload.previewSrc || poster === payload.src)) return video
    const source = video.currentSrc || video.getAttribute('src') || ''
    if (source !== '' && (source === payload.src || source === payload.previewSrc)) return video
  }
  return null
}

/**
 * The tweet id of a page address (`/status/<id>`), or `null`.
 *
 * Only a fallback for a video whose enclosing article is gone — the element
 * walk in `xTweetIdOf` is authoritative while the card is mounted.
 */
export function tweetIdFromPageUrl(pageUrl: string): string | null {
  const match = /\/status\/(\d{5,25})/.exec(pageUrl)
  return match === null ? null : match[1]
}

/**
 * Plans one download press.
 *
 * Images download their own address. Videos need a progressive file: X's
 * variants are tried first (matched by poster above), then the element/meta/
 * resource ladders. An HLS-only result is reported as `video-unavailable` —
 * saving a playlist is not saving a video.
 */
export function planMediaDownload(context: DownloadPlanContext): DownloadPlan {
  const { payload, pageUrl } = context
  const pageTitle = context.pageTitle ?? payload.pageTitle

  if (payload.type === 'image') {
    const url = firstHttpUrl(payload.src) ?? firstHttpUrl(payload.previewSrc)
    if (url === null) return { ok: false, reason: 'unusable' }
    return { ok: true, request: { url, filename: '', pageUrl, pageTitle, type: 'image' } }
  }

  const candidates: VideoSourceCandidate[] = []
  if (context.variants !== undefined && context.variants.length > 0) {
    const chosen = pickXVideoVariant(context.variants)
    if (chosen !== null) {
      candidates.push({
        url: chosen.url,
        kind: /mpegurl/i.test(chosen.contentType) ? 'hls' : 'mp4',
        origin: 'x-syndication',
      })
    }
  }
  if (context.element !== null && context.element !== undefined) {
    candidates.push(...resolveSyncVideoCandidates(context.element, pageUrl, context.entryNames ?? []))
  }
  // A payload already resolved to a playable http(s) source stays a candidate
  // even when the element has been recycled away.
  if (payload.sourceKind === 'direct' && /^https?:/i.test(payload.src)) {
    candidates.push({ url: payload.src, kind: 'mp4', origin: 'element' })
  }

  const best = pickDownloadCandidate(candidates)
  if (best === null || best.kind !== 'mp4') return { ok: false, reason: 'video-unavailable' }
  return {
    ok: true,
    request: {
      url: best.url,
      filename: videoFilename(context, best),
      pageUrl,
      pageTitle,
      type: 'video',
    },
  }
}

/** Whether an X video element can even be asked for real variants. */
export function isXVideoPayload(payload: HoveredMedia, element: Element | null): boolean {
  if (payload.type !== 'video') return false
  const poster = payload.previewSrc !== '' ? payload.previewSrc : payload.src
  if (xMediaIdFromPoster(poster) === null) return false
  if (element === null) return tweetIdFromPageUrl(payload.pageUrl) !== null
  return xTweetIdOf(element, payload.pageUrl) !== null
}

/**
 * The tweet id to ask the worker for, or `null`.
 *
 * The element walk wins: a timeline card's enclosing article carries the post
 * the pointer is actually on, while `pageUrl` is the feed address there.
 */
export function xTweetIdForDownload(payload: HoveredMedia, element: Element | null): string | null {
  if (payload.type !== 'video') return null
  if (element !== null) {
    const fromElement = xTweetIdOf(element, payload.pageUrl)
    if (fromElement !== null) return fromElement
  }
  return tweetIdFromPageUrl(payload.pageUrl)
}

/**
 * A stable, human-readable name for one video file.
 *
 * X names are derived from the tweet and the variant's resolution (`1920x1080`)
 * so two downloads from one post never overwrite each other. Everything else
 * returns `''`, which lets the worker name the file from the URL basename.
 */
function videoFilename(context: DownloadPlanContext, candidate: VideoSourceCandidate): string {
  if (candidate.origin !== 'x-syndication') return ''
  const tweetId = xTweetIdForDownload(context.payload, context.element ?? null)
  if (tweetId === null) return ''
  const resolution = /(\d{2,5}x\d{2,5})/.exec(candidate.url)
  return resolution === null ? `x-${tweetId}.mp4` : `x-${tweetId}-${resolution[1]}.mp4`
}

/** The first absolute http(s) address in a list of candidates, or `null`. */
function firstHttpUrl(...candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) return candidate
  }
  return null
}
