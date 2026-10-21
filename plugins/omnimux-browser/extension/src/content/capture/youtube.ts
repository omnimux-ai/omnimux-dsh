/**
 * YouTube capture: read `ytInitialPlayerResponse` / `ytInitialData` scripts.
 *
 * Google ships no OpenGraph media address, so the playable URL only exists in
 * the inline player response. `formats` holds the progressive streams (video
 * and audio muxed, what the host needs); `adaptiveFormats` is DASH and splits
 * the tracks, so a video-only entry is used only when no muxed stream exists.
 *
 * @module
 */

import type { CapturedPost } from './types.ts'
import {
  absoluteHttpUrl,
  arrayOf,
  firstNonEmpty,
  isoFromDate,
  linkHref,
  metaContent,
  parseJson,
  positiveInt,
  recordOf,
  scriptTexts,
  stringField,
  titleFromText,
  valueAfterMarker,
} from './helpers.ts'

/** Inline assignments the watch page ships, in either form (`var x =` / `window["x"] =`). */
const PLAYER_MARKERS = ['ytInitialPlayerResponse', 'ytInitialPlayerData']
const DATA_MARKERS = ['ytInitialData', 'ytInitialGuideData']

/** Reads the first inline script assignment for a marker. */
function inlineAssigned(doc: Document, markers: readonly string[]): Record<string, unknown> | null {
  for (const text of scriptTexts(doc)) {
    for (const marker of markers) {
      if (!text.includes(marker)) continue
      const parsed = parseJson(valueAfterMarker(text, marker))
      const record = recordOf(parsed)
      if (record !== null) return record
    }
  }
  return null
}

/** Largest thumbnail address the response carries. */
function largestThumbnail(value: unknown, base: string): string {
  let best = ''
  let bestWidth = -1
  for (const item of arrayOf(recordOf(value)?.['thumbnails'])) {
    const thumbnail = recordOf(item)
    if (thumbnail === null) continue
    const url = absoluteHttpUrl(stringField(thumbnail, ['url']), base)
    if (url === null) continue
    const width = positiveInt(thumbnail['width']) ?? 0
    if (width >= bestWidth) {
      best = url
      bestWidth = width
    }
  }
  return best
}

/**
 * Highest-quality progressive mp4 address (muxed video+audio).
 *
 * `formats` uses a combined codec string (`avc1..., mp4a...`); `adaptiveFormats`
 * entries are video-only, declared here by `allowVideoOnly`.
 */
function bestStream(entries: readonly unknown[], base: string, allowVideoOnly: boolean): string {
  let bestUrl = ''
  let bestHeight = -1
  let bestBitrate = -1
  for (const entry of entries) {
    const stream = recordOf(entry)
    if (stream === null) continue
    const mime = stringField(stream, ['mimeType']).toLowerCase()
    if (!mime.includes('video/mp4')) continue
    const muxed = mime.includes('mp4a')
      || stream['audioQuality'] !== undefined
      || stream['audioChannels'] !== undefined
    if (!allowVideoOnly && !muxed) continue
    const url = absoluteHttpUrl(stringField(stream, ['url']), base)
    if (url === null) continue
    const height = positiveInt(stream['height']) ?? 0
    const bitrate = positiveInt(stream['bitrate']) ?? 0
    if (bestUrl === '' || height > bestHeight || (height === bestHeight && bitrate > bestBitrate)) {
      bestUrl = url
      bestHeight = height
      bestBitrate = bitrate
    }
  }
  return bestUrl
}

/** Playable address: muxed stream first, then the best video-only one. */
function playableUrl(player: Record<string, unknown> | null, base: string): string {
  const streaming = recordOf(player?.['streamingData'])
  if (streaming === null) return ''
  return bestStream(arrayOf(streaming['formats']), base, false)
    || bestStream(arrayOf(streaming['adaptiveFormats']), base, true)
}

/** Handle from the channel profile URL, else the channel id. */
function channelHandle(micro: Record<string, unknown> | null, details: Record<string, unknown> | null): string {
  const profile = stringField(micro, ['ownerProfileUrl'])
  const matched = profile.match(/@([A-Za-z0-9._-]+)/)
  if (matched !== null) return matched[1]
  return stringField(details, ['channelId'])
}

/**
 * Captures the YouTube watch page.
 *
 * @param doc the page document
 * @param href the page address
 * @returns the capture, or `null` when neither player data nor meta describes a video
 */
export function extractYoutube(doc: Document, href: string): CapturedPost | null {
  const player = inlineAssigned(doc, PLAYER_MARKERS)
  const initialData = inlineAssigned(doc, DATA_MARKERS)
  const details = recordOf(player?.['videoDetails'])
  const micro = recordOf(recordOf(player?.['microformat'])?.['playerMicroformatRenderer'])
  const dataDetails = recordOf(recordOf(initialData?.['videoDetails']))
  const title = titleFromText(firstNonEmpty(
    stringField(details, ['title']),
    stringField(micro, ['title']),
    stringField(dataDetails, ['title']),
    metaContent(doc, ['meta[property="og:title"]', 'meta[name="title"]']),
    doc.title,
  ))
  const content = firstNonEmpty(
    stringField(details, ['shortDescription']),
    stringField(micro, ['description']),
    metaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]']),
  )
  const coverUrl = firstNonEmpty(
    largestThumbnail(details?.['thumbnail'], href),
    largestThumbnail(micro?.['thumbnail'], href),
    metaContent(doc, ['meta[property="og:image"]']),
  )
  const url = playableUrl(player, href)
  const views = positiveInt(stringField(details, ['viewCount']))
  const postedAt = isoFromDate(stringField(micro, ['publishDate']) || stringField(micro, ['uploadDate']))
  const authorName = firstNonEmpty(
    stringField(details, ['author']),
    stringField(micro, ['ownerChannelName']),
  )
  if (title === '' && url === '' && coverUrl === '') return null
  const sourceUrl = linkHref(doc, ['link[rel="canonical"]'], href) || href
  return {
    platform: 'youtube',
    source_url: sourceUrl,
    title,
    content,
    content_shape: 'video',
    author: { name: authorName, handle: channelHandle(micro, details) },
    media: url === '' ? [] : [{ type: 'video', url }],
    ...(views === undefined ? {} : { stats: { views } }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
