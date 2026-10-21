/**
 * X/Twitter capture: reuse the tweet extractor, map onto {@link CapturedPost}.
 *
 * The tweet extractor already owns the hard parts (author, counters, quoted
 * post, media containers). This module only resolves the post element and maps
 * the result, so X and the generic capture cannot disagree about one post.
 *
 * @module
 */

import { extractTweetCapture } from '../twitter-capture/extractor.ts'
import type { TweetShape, TweetStats } from '../twitter-capture/types.ts'
import type { CapturedMedia, CapturedPost, CapturedStats, ContentShape } from './types.ts'
import { absoluteHttpUrl, contentShapeOf, firstNonEmpty, titleFromText, uniqueMedia } from './helpers.ts'

/** The detail post first, then the focused post of a feed. */
const TWEET_SELECTORS = [
  'article[tabindex="-1"][data-testid="tweet"]',
  'main article[data-testid="tweet"]',
  'article[data-testid="tweet"]',
]

/** Video addresses the post's player actually rendered. */
function videoUrlsOf(article: HTMLElement, base: string): Set<string> {
  const urls = new Set<string>()
  for (const video of article.querySelectorAll('video')) {
    for (const candidate of [video.poster, video.getAttribute('src'), video.currentSrc]) {
      const url = absoluteHttpUrl(candidate, base)
      if (url !== null) urls.add(url)
    }
  }
  return urls
}

/** Media type by container; a poster address belongs to the player. */
function mediaOf(urls: readonly string[], videoUrls: Set<string>, base: string, videoOnly: boolean): CapturedMedia[] {
  const media: CapturedMedia[] = []
  for (const raw of urls) {
    const url = absoluteHttpUrl(raw, base)
    if (url === null) continue
    const isVideo = videoUrls.has(url) || videoOnly
    media.push({ type: isVideo ? 'video' : 'image', url })
  }
  return media
}

/** Card shape for a tweet, preferring what the media list proves. */
function shapeOfTweet(shape: TweetShape, media: readonly CapturedMedia[]): ContentShape {
  if (media.some((item) => item.type === 'video')) return 'video'
  if (shape === 'gallery') return 'gallery'
  if (shape === 'photo') return 'photo'
  return contentShapeOf(media)
}

/** Only keys the page rendered; an absent counter stays absent. */
function statsOfTweet(stats: TweetStats): CapturedStats | undefined {
  const mapped: CapturedStats = {}
  if (stats.likes !== undefined) mapped.likes = stats.likes
  if (stats.comments !== undefined) mapped.comments = stats.comments
  if (stats.shares !== undefined) mapped.shares = stats.shares
  if (stats.views !== undefined) mapped.views = stats.views
  return Object.keys(mapped).length > 0 ? mapped : undefined
}

/**
 * Captures the X post on screen.
 *
 * @param doc the page document
 * @param href the page address, used only to resolve relative media
 * @returns the capture, or `null` when the page holds no capturable post
 */
export function extractXPost(doc: Document, href: string): CapturedPost | null {
  let article: HTMLElement | null = null
  for (const selector of TWEET_SELECTORS) {
    article = doc.querySelector<HTMLElement>(selector)
    if (article !== null) break
  }
  if (article === null) return null
  const tweet = extractTweetCapture(article)
  if (tweet === null) return null

  const videoUrls = videoUrlsOf(article, href)
  const media = uniqueMedia(mediaOf(tweet.mediaUrls, videoUrls, href, tweet.shape === 'video'))
  const coverUrl = absoluteHttpUrl(tweet.coverUrl, href) ?? ''
  const title = firstNonEmpty(
    titleFromText(tweet.text),
    tweet.author.name !== '' ? `${tweet.author.name} on X` : '',
    tweet.author.handle !== '' ? `@${tweet.author.handle} on X` : '',
    'X post',
  )
  const stats = statsOfTweet(tweet.stats)
  return {
    platform: 'x',
    source_url: tweet.url,
    title,
    content: tweet.text,
    content_shape: shapeOfTweet(tweet.shape, media),
    author: { name: tweet.author.name, handle: tweet.author.handle },
    media,
    ...(stats === undefined ? {} : { stats }),
    ...(tweet.postedAt === null ? {} : { posted_at: tweet.postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
