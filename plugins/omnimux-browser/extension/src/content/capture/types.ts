/**
 * Contract for one captured work page (spec §3.1).
 *
 * The content script fills this in from what the page already rendered, the
 * background forwards it to the local host, and the host downloads the media
 * and writes the inspiration record. Both sides whitelist fields, so this
 * interface is the single declaration of what a capture carries.
 *
 * `title` is the only required human text: a page with neither a title nor a
 * usable media address is not capturable, and every extractor answers `null`
 * for it instead of storing a partial record.
 *
 * @module
 */

/** Platforms a capture can name. `web` is the generic fallback. */
export type CapturePlatform = 'x' | 'tiktok' | 'youtube' | 'instagram' | 'douyin' | 'xiaohongshu' | 'web'

/** Shapes the library card renders. */
export type ContentShape = 'text' | 'photo' | 'gallery' | 'video'

/** Who published the work. */
export interface CapturedAuthor {
  /** Display name; `''` when the page carried none. */
  name: string
  /** Handle without `@`; `''` when the page carried none. */
  handle: string
}

/** Engagement counters, all optional: an absent key means the page hid it. */
export interface CapturedStats {
  likes?: number
  comments?: number
  views?: number
  shares?: number
  collects?: number
}

/** One downloadable media address. */
export interface CapturedMedia {
  type: 'video' | 'image'
  /** Public http(s) address; the host downloads it, the page never fetches. */
  url: string
}

/** One captured work, ready for `POST /local/capture`. */
export interface CapturedPost {
  platform: CapturePlatform
  /** The work's detail-page address, not a tracking-redirect short link. */
  source_url: string
  /** Non-empty: first content line or the work title. */
  title: string
  /** Body / description; may be empty for a media-only post. */
  content: string
  content_shape: ContentShape
  author: CapturedAuthor
  stats?: CapturedStats
  /** ISO timestamp, or absent when the page carried none. */
  posted_at?: string
  cover_url?: string
  /** At most {@link MAX_CAPTURE_MEDIA} entries. */
  media: CapturedMedia[]
  /** `document.cookie`; JS-readable part only, may be empty. */
  cookie?: string
}

/** How many media addresses one capture may carry (spec §3.1). */
export const MAX_CAPTURE_MEDIA = 20
