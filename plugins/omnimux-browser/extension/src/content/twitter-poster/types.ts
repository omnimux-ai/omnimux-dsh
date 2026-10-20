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
  /** Post body, original line breaks preserved. */
  text: string
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
}

/**
 * The payload stored before navigating to X's composer.
 *
 * `dataUrl` is a PNG data URL rather than a blob URL: blob URLs belong to the
 * page that minted them and die with the navigation, while the compose page is
 * a fresh document.
 */
export interface PendingPosterPayload {
  dataUrl: string
  /** Generated personal opinion; `''` when the model was unavailable. */
  text: string
  sourceUrl: string
  theme: PosterTheme
  createdAt: number
}
