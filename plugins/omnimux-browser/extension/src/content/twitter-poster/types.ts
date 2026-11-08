/**
 * Values shared by the X poster feature: the source snapshot read from a tweet,
 * the two frozen themes, and the short-lived payload that survives the jump to
 * X's compose page.
 *
 * @module
 */

/** The only two poster themes; both are drawn from fixed tokens, never user CSS. */
export type PosterTheme = 'light' | 'dark'

/** One tweet reduced to the fields the poster draws. */
export interface TweetPosterSource {
  /** Display name as the tweet header shows it. */
  name: string
  /** Handle without the leading `@`; `''` when the header carried no profile link. */
  handle: string
  /** Absolute avatar URL; `''` when the tweet rendered no avatar. */
  avatar: string
  /** Whether the header rendered a verification mark. */
  verified: boolean
  /** Post body used for the visual export; full article text on X Articles. */
  text: string
  /**
   * Optional model-facing body. The poster reads the whole article, while the
   * opinion prompt keeps the existing 8,000-character budget; absent means
   * `text` is also the prompt body.
   */
  promptText?: string
  /** Permanent post address. */
  url: string
  /**
   * Avatar fetched by the background worker and encoded as a data URL.
   *
   * A page-origin content script cannot reliably draw a `pbs.twimg.com` image
   * into a canvas (CORS taints it and `toDataURL` then throws), so the content
   * script asks the extension worker for the bytes first. Absent means the
   * fetch failed and the poster falls back to an initial-letter bubble.
   */
  avatarDataUrl?: string
}

/** What a successful render hands back. */
export interface PosterRenderResult {
  dataUrl: string
  width: number
  height: number
  /** 1-based page number when the result belongs to a paginated set. */
  page?: number
  /** Total pages in the set; both page fields are absent on legacy single results. */
  pageCount?: number
}

/**
 * The payload stored before navigating to X's composer.
 *
 * `dataUrls` is an ordered list of PNG data URLs rather than blob URLs: blob
 * URLs belong to the page that minted them and die with the navigation, while
 * the compose page is a fresh document. `dataUrl` stays for payloads written by
 * builds that only knew the single-page poster.
 */
export interface PendingPosterPayload {
  dataUrls: string[]
  /** First page, kept for backward compatibility with single-page payloads. */
  dataUrl?: string
  /** Generated personal opinion; `''` when the model was unavailable. */
  text: string
  sourceUrl: string
  theme: PosterTheme
  createdAt: number
}
