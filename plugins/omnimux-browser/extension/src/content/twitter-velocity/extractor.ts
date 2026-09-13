import { toHoursAlive, classifyTier, computeExposure } from './algorithm.ts'
import type { TweetVelocityData } from './types.ts'

function parseMetricValue(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim()
  const match = cleaned.match(/^([\d.]+)\s*([kKmMbB万]?)$/)
  if (!match) return 0
  const num = Number(match[1])
  if (!Number.isFinite(num)) return 0
  const unit = match[2].toLowerCase()
  switch (unit) {
    case 'k':
      return num * 1_000
    case 'm':
      return num * 1_000_000
    case 'b':
      return num * 1_000_000_000
    case '万':
      return num * 10_000
    default:
      return num
  }
}

export function extractViews(tweet: HTMLElement): number {
  const analyticsLink = tweet.querySelector('a[href*="/analytics"]')
  const group = tweet.querySelector('div[role="group"]')
  const candidates = [
    analyticsLink?.textContent || '',
    analyticsLink?.getAttribute('aria-label') || '',
    group?.getAttribute('aria-label') || '',
  ]

  for (const text of candidates) {
    const match = text.match(/([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:次查看|次观看|views?)/i)
    if (match) {
      const val = parseMetricValue(match[1])
      if (val > 0) return val
    }
  }

  // Fallback: check analyticsLink directly if only number
  if (analyticsLink?.textContent) {
    const val = parseMetricValue(analyticsLink.textContent.trim())
    if (val > 0) return val
  }
  return 0
}

export function extractReplies(tweet: HTMLElement): number {
  const replyBtn = tweet.querySelector('button[data-testid="reply"], div[data-testid="reply"]')
  const group = tweet.querySelector('div[role="group"]')
  const candidates = [
    replyBtn?.getAttribute('aria-label') || '',
    replyBtn?.textContent || '',
    group?.getAttribute('aria-label') || '',
  ]

  for (const text of candidates) {
    const match = text.match(/([\d.,]+(?:\s*[kKmMbB万])?)\s*(?:回复|repl(?:y|ies))/i)
    if (match) {
      const val = parseMetricValue(match[1])
      if (val >= 0) return val
    }
  }

  if (replyBtn?.textContent) {
    const val = parseMetricValue(replyBtn.textContent.trim())
    if (val >= 0) return val
  }
  return 0
}

export function extractCreatedAtMs(tweet: HTMLElement): number {
  const timeEl = tweet.querySelector('time[datetime]')
  if (!timeEl) return Date.now() - 3_600_000 // default 1h ago
  const datetime = timeEl.getAttribute('datetime')
  if (!datetime) return Date.now() - 3_600_000
  const parsed = new Date(datetime).getTime()
  return Number.isFinite(parsed) ? parsed : Date.now() - 3_600_000
}

export function extractTweetIdAndUrl(tweet: HTMLElement): { id: string; url: string } {
  const links = tweet.querySelectorAll('a[href*="/status/"]')
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href') || ''
    const match = href.match(/\/status\/(\d+)/)
    if (match) {
      const fullUrl = href.startsWith('http') ? href : `https://x.com${href}`
      return { id: match[1], url: fullUrl }
    }
  }
  return { id: `tweet-${Math.random().toString(36).slice(2, 8)}`, url: window.location.href }
}

export function extractAuthorAndText(tweet: HTMLElement): { author: string; text: string } {
  const userEl = tweet.querySelector('div[data-testid="User-Name"]')
  const author = userEl?.textContent?.replace(/\s+/g, ' ').trim() || '推特用户'

  const textEl = tweet.querySelector('div[data-testid="tweetText"]')
  const text = textEl?.textContent?.replace(/\s+/g, ' ').trim() || ''

  return { author, text }
}

export function extractTweetVelocityData(tweet: HTMLElement, nowMs = Date.now()): TweetVelocityData | null {
  const { id, url } = extractTweetIdAndUrl(tweet)
  const { author, text } = extractAuthorAndText(tweet)
  const views = extractViews(tweet)
  const replies = extractReplies(tweet)
  const createdAtMs = extractCreatedAtMs(tweet)

  const hoursAlive = toHoursAlive(nowMs, createdAtMs)
  if (hoursAlive <= 0) return null

  const pace = views / hoursAlive
  const tier = classifyTier(pace)
  const predictedExposure = computeExposure(pace, hoursAlive, replies)

  return {
    tweetId: id,
    author,
    url,
    text,
    views,
    replies,
    createdAtMs,
    hoursAlive,
    pace,
    tier,
    predictedExposure,
  }
}
