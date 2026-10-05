/**
 * Feed candidate pool for the empty-composer POST_NEW path: collect up to
 * `MAX_CANDIDATES` rendered tweets, score each on four 0–100 dimensions and
 * keep only seeds whose weighted total reaches the admission threshold.
 * Pure functions over DOM nodes so they are unit-testable under jsdom.
 */

import { extractCreatedAtMs, extractReplies } from '../twitter-velocity/extractor.ts'
import { toHoursAlive } from '../twitter-velocity/algorithm.ts'
import type { CandidateSource, ScoredCandidate } from './types.ts'

export const MAX_CANDIDATES = 50
export const MIN_TEXT_LENGTH = 25
export const SEED_THRESHOLD = 65
/** Minimum own-comment length for a quote tweet (the quoted post carries the rest). */
export const MIN_QUOTE_COMMENT_LENGTH = 4
export const MAX_SEEDS = 3
/** Candidates offered to the decision model for the semantic pick. */
export const SHORTLIST_SIZE = 8
/** Minimum heat (keyword-free score) for a shortlist candidate. */
export const SHORTLIST_MIN_HEAT = 40
/** 爆款优先：互动规模与爆发力占六成，赛道/争议/信息密度做加分（爆款原帖本身可以不在赛道内，复刻时换成自己的赛道）。 */
export const SCORE_WEIGHTS = { keyword: 0.15, controversy: 0.15, infoDelta: 0.1, velocity: 0.25, reach: 0.35 } as const

/** Parse "1.2K" / "3万" / "1,024" into a number; unparseable is 0. */
export function parseCount(raw: string): number {
  const match = raw.replace(/,/g, '').trim().match(/^([\d.]+)\s*([kKmM万]?)$/)
  if (!match) return 0
  const n = Number(match[1])
  if (!Number.isFinite(n)) return 0
  const unit = match[2].toLowerCase()
  return unit === 'k' ? n * 1e3 : unit === 'm' ? n * 1e6 : unit === '万' ? n * 1e4 : n
}

/** Read one engagement counter from the action button's aria-label or text. */
function readCounter(article: Element, testId: string, labelWords: RegExp): number {
  const btn = article.querySelector(`[data-testid="${testId}"]`)
  const label = btn?.getAttribute('aria-label') || ''
  const m = label.match(new RegExp(`([\\d.,]+\\s*[kKmM万]?)\\s*次?\\s*(?:${labelWords.source})`, 'i'))
  if (m) return parseCount(m[1])
  return parseCount((btn?.textContent || '').trim())
}

function isPromoted(article: Element): boolean {
  // 推特给每个视频播放器都包一层 placementTracking；只有不含播放器的那层才是广告位
  const tracking = Array.from(article.querySelectorAll('[data-testid="placementTracking"]'))
  if (tracking.some((el) => !el.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'))) return true
  const spans = Array.from(article.querySelectorAll('span'))
  return spans.some((s) => {
    const t = (s.textContent || '').trim()
    return t === 'Ad' || t === 'Promoted' || t === '广告' || t === '推广'
  })
}

function authorHandle(article: Element): string {
  const link = article.querySelector('[data-testid="User-Name"] a[role="link"][href^="/"]')
  return (link?.getAttribute('href') || '').replace(/^\//, '').split('/')[0] || ''
}

type RawCandidate = Omit<ScoredCandidate, 'scores' | 'total' | 'heat'>

/** The embedded quoted-post card of a quote tweet, if any. */
function quoteCard(article: Element): Element | null {
  const name = article.querySelector('div[role="link"] [data-testid="User-Name"]')
  return name ? name.closest('div[role="link"]') : null
}

function clean(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

/** Quoted author + text; X Article cards have no tweetText, so fall back to the card's own text. */
function readQuote(card: Element): { quotedAuthor: string; quotedText: string } {
  const nameEl = card.querySelector('[data-testid="User-Name"]')
  const quotedAuthor = (clean(nameEl?.textContent).match(/@([A-Za-z0-9_]{1,15})/) || [])[1] || ''
  const textEl = card.querySelector('[data-testid="tweetText"]')
  let quotedText = clean(textEl?.textContent)
  if (!quotedText) quotedText = clean((card.textContent || '').replace(nameEl?.textContent || '', '')).slice(0, 280)
  return { quotedAuthor, quotedText }
}

/**
 * Collect rendered feed tweets (top to bottom), skipping promoted cards,
 * short texts and the composer's own container. Never scrolls the page.
 * Quote tweets keep the quoter's comment in `text` and the quoted post apart.
 */
export function collectFeedCandidates(
  root: ParentNode,
  exclude: Element | null,
  nowMs = Date.now(),
  max = MAX_CANDIDATES,
  source: CandidateSource = 'page',
): RawCandidate[] {
  const out: RawCandidate[] = []
  for (const article of Array.from(root.querySelectorAll('article[data-testid="tweet"]'))) {
    if (out.length >= max) break
    // 只排除「发帖框本身所在的推文」；发帖框的外层容器可能很宽（整列），不能用它反向排除信息流
    if (exclude && article.contains(exclude)) continue
    if (isPromoted(article)) continue
    const card = quoteCard(article)
    const ownTextEl = Array.from(article.querySelectorAll('[data-testid="tweetText"]')).find((el) => !card?.contains(el))
    const text = clean(ownTextEl?.textContent)
    const quote = card ? readQuote(card) : null
    if (quote) {
      if (text.length < MIN_QUOTE_COMMENT_LENGTH || text.length + quote.quotedText.length < MIN_TEXT_LENGTH) continue
    } else if (text.length < MIN_TEXT_LENGTH) continue
    const el = article as HTMLElement
    out.push({
      author: authorHandle(article),
      text,
      replies: extractReplies(el),
      reposts: readCounter(article, 'retweet', /转帖|转推|repost|retweet/),
      likes: readCounter(article, 'like', /喜欢|赞|like/),
      ageHours: toHoursAlive(nowMs, extractCreatedAtMs(el)),
      source,
      ...(quote ? { isQuote: true, quotedAuthor: quote.quotedAuthor, quotedText: quote.quotedText } : {}),
    })
  }
  return out
}

/** Merge several source pools, keeping the first occurrence of each author + text. */
export function mergeCandidatePools(pools: RawCandidate[][]): RawCandidate[] {
  const seen = new Set<string>()
  const out: RawCandidate[] = []
  for (const pool of pools) {
    for (const c of pool) {
      const key = `${c.author}\u0000${c.text}\u0000${c.quotedText || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

/** Split a free-form keyword string ("AI, 出海 增长") into normalized terms. */
export function normalizeKeywords(...sources: string[]): string[] {
  const set = new Set<string>()
  for (const s of sources) {
    for (const part of (s || '').split(/[,，、;；\s]+/)) {
      const t = part.trim().toLowerCase()
      if (t.length >= 2 && t.length <= 24) set.add(t)
    }
  }
  return Array.from(set).slice(0, 12)
}

export function scoreCandidate(c: RawCandidate, keywords: string[]): ScoredCandidate {
  // 带评论转发：评论与原帖合在一起算关键词和信息密度
  const body = c.quotedText ? `${c.text} ${c.quotedText}` : c.text
  const lower = body.toLowerCase()
  // 命中任一关键词即进入高分段：1 个 70、2 个 85、3 个及以上 100；未配置关键词时 50（中性）
  const compact = lower.replace(/\s+/g, '')
  const hits = keywords.filter((k) => compact.includes(k.replace(/\s+/g, ''))).length
  const keyword = keywords.length === 0 ? 50 : hits === 0 ? 0 : Math.min(100, 55 + hits * 15)
  // 回复/转发比（加一平滑，比值 ≥ 3 满分），再按回复量衰减：回复 ≥ 100 才不打折，避免 3 条回复就判为争议
  const ratio = clamp100(((c.replies + 1) / (c.reposts + 1) / 3) * 100)
  const volume = Math.min(1, Math.log10(c.replies + 1) / 2)
  const controversy = c.replies === 0 ? 0 : clamp100(ratio * volume)
  // 信息密度：正文长度（满 140 字计 60 分）+ 数字 + 英文专有名词
  const digits = (body.match(/\d+(?:\.\d+)?%?/g) || []).length
  const properNouns = (body.match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || []).length
  const infoDelta = clamp100((Math.min(body.length, 140) / 140) * 60 + digits * 10 + properNouns * 8)
  // 爆发力：每小时互动数取对数，100/h ≈ 80 分，1000/h 满分
  const perHour = (c.replies + c.reposts + c.likes) / Math.max(c.ageHours, 1 / 60)
  const velocity = clamp100(Math.log10(perHour + 1) * 40)
  // 互动规模：总互动取对数，100 ≈ 50 分、1000 ≈ 75 分、1 万满分
  const reach = clamp100(Math.log10(c.replies + c.reposts + c.likes + 1) * 25)
  const scores = { keyword, controversy, infoDelta, velocity, reach }
  const total = clamp100(
    keyword * SCORE_WEIGHTS.keyword +
      controversy * SCORE_WEIGHTS.controversy +
      infoDelta * SCORE_WEIGHTS.infoDelta +
      velocity * SCORE_WEIGHTS.velocity +
      reach * SCORE_WEIGHTS.reach,
  )
  // 热度：不含关键词的加权分（按剩余权重归一），只回答「够不够热」，「对不对路」交给决策模型
  const heatWeight = 1 - SCORE_WEIGHTS.keyword
  const heat = clamp100(
    (controversy * SCORE_WEIGHTS.controversy +
      infoDelta * SCORE_WEIGHTS.infoDelta +
      velocity * SCORE_WEIGHTS.velocity +
      reach * SCORE_WEIGHTS.reach) / heatWeight,
  )
  return { ...c, scores, total, heat }
}

/** Hottest candidates for the semantic pick: heat ≥ min, quote tweets first on ties, at most `max`. */
export function shortlistForPick(list: ScoredCandidate[], max = SHORTLIST_SIZE, minHeat = SHORTLIST_MIN_HEAT): ScoredCandidate[] {
  return list
    .filter((c) => c.heat >= minHeat)
    .sort((a, b) => b.heat - a.heat || Number(Boolean(b.isQuote)) - Number(Boolean(a.isQuote)))
    .slice(0, max)
}

/** Seeds above the threshold: quote tweets first (they show a proven remix angle), then by total. */
export function selectSeeds(list: ScoredCandidate[], threshold = SEED_THRESHOLD, max = MAX_SEEDS): ScoredCandidate[] {
  return list
    .filter((c) => c.total >= threshold)
    .sort((a, b) => Number(Boolean(b.isQuote)) - Number(Boolean(a.isQuote)) || b.total - a.total)
    .slice(0, max)
}
