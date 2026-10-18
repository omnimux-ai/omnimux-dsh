/**
 * Contract for one captured X/Twitter post.
 *
 * The capture is projected into the import request's whitelist before the
 * background worker submits it. Media types belong to that capture rather than
 * being inferred from a poster address by its consumers.
 *
 * Every optional field means "the page did not show it". A reader must render
 * nothing for an absent field rather than a zero: a tweet whose like count is
 * hidden has no like count, and storing `0` would claim it had none.
 *
 * @module
 */

/**
 * The post shapes the library card renders.
 *
 * `thread` and `article` are declared for the card's sake and are not produced by
 * this stage's extractor: both need context that lives outside one tweet element
 * (sibling posts in a conversation, an article page). The extractor degrades a
 * post it cannot classify to `text` / `photo` instead of guessing.
 */
export type TweetShape =
  | 'text'
  | 'photo'
  | 'gallery'
  | 'video'
  | 'quote'
  | 'repost'
  | 'thread'
  | 'article'
  | 'poll'
  | 'link'

/** Who wrote the post. */
export interface TweetAuthor {
  /** Display name, as the header shows it. */
  name: string
  /** Handle without the leading `@`; `''` when the header carried no profile link. */
  handle: string
  /** Absolute avatar address, upscaled when the page served a `_normal` variant. */
  avatar: string
  /** Whether the verification badge was rendered next to the name. */
  verified: boolean
}

/**
 * Engagement counters, all optional.
 *
 * X hides counts on some posts and omits the whole action bar on others; an
 * absent key is that state, and only a key the page actually showed is present.
 */
export interface TweetStats {
  likes?: number
  comments?: number
  shares?: number
  views?: number
}

/** A quoted post, nested one level deep. */
export interface QuotedTweet {
  author: TweetAuthor
  text: string
  /** Thumbnail of the quoted post, when it carried one. */
  coverUrl?: string
}

/** One poll option, with the share the page rendered. */
export interface PollOption {
  label: string
  pct: number
}

/** Poll state, present only when the page rendered a poll. */
export interface TweetPoll {
  options: PollOption[]
  votes: number
  /** Raw remaining-time text; absent when the page showed none. */
  closesAt?: string
}

/** One attachment belonging to the target post, in document order. */
export interface TweetMediaItem {
  type: 'image' | 'video'
  /** Fetchable media URL; `''` records a visible attachment with no usable URL. */
  url: string
  /** Explicit page-provided identity, when present; never an invented index. */
  source_id?: string
  /** Video thumbnail, kept separate from its playable address. */
  poster_url?: string
}

/** Whitelisted capture carried by the inspiration import request. */
export type TweetInspirationCapture = {
  url: string
  text: string
  shape: TweetShape
  author: TweetAuthor
  stats: TweetStats
  posted_at: string | null
  cover_url: string
  quoted?: { author: TweetAuthor; text: string; coverUrl?: string }
  poll?: TweetPoll
  media_items: TweetMediaItem[]
}

/** One captured post. */
export interface TweetCapture {
  shape: TweetShape
  /** Permanent address: `https://x.com/{handle}/status/{id}`. */
  url: string
  text: string
  author: TweetAuthor
  /** ISO timestamp, or `null` when the post carried no timestamp element. */
  postedAt: string | null
  /** Legacy visual addresses for copying/older consumers, in document order. */
  mediaUrls: string[]
  /** Typed attachments; a video poster can never stand in for a video file. */
  mediaItems: TweetMediaItem[]
  /** Card cover: first media address, video poster, or the quoted post's thumbnail. */
  coverUrl: string
  stats: TweetStats
  quoted?: QuotedTweet
  /** Conversation entries, when a caller resolved the surrounding thread. */
  threadItems?: string[]
  poll?: TweetPoll
}
