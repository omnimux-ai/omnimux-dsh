/**
 * Feed candidate pool for the empty-composer POST_NEW path: collect up to
 * `MAX_CANDIDATES` rendered tweets, score each on four 0–100 dimensions and
 * keep only seeds whose weighted total reaches the admission threshold.
 * Pure functions over DOM nodes so they are unit-testable under jsdom.
 */

import { extractCreatedAtMs, extractReplies } from '../twitter-velocity/extractor.ts'
import { toHoursAlive } from '../twitter-velocity/algorithm.ts'
import type { ScoredCandidate } from './types.ts'

export const MAX_CANDIDATES = 50
export const MIN_TEXT_LENGTH = 25
export const SEED_THRESHOLD = 75
export const MAX_SEEDS = 3
export const SCORE_WEIGHTS = { keyword: 0.3, controversy: 0.3, infoDelta: 0.2, velocity: 0.2 } as const

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
  if (article.querySelector('[data-testid="placementTracking"]')) return true
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

/**
 * Collect rendered feed tweets (top to bottom), skipping promoted cards,
 * short texts and the composer's own container. Never scrolls the page.
 */
export function collectFeedCandidates(
  root: ParentNode,
  exclude: Element | null,
  nowMs = Date.now(),
  max = MAX_CANDIDATES,
): Omit<ScoredCandidate, 'scores' | 'total'>[] {
  const out: Omit<ScoredCandidate, 'scores' | 'total'>[] = []
  for (const article of Array.from(root.querySelectorAll('article[data-testid="tweet"]'))) {
    if (out.length >= max) break
    // 只排除「发帖框本身所在的推文」；发帖框的外层容器可能很宽（整列），不能用它反向排除信息流
    if (exclude && article.contains(exclude)) continue
    if (isPromoted(article)) continue
    const text = (article.querySelector('[data-testid="tweetText"]')?.textContent || '').replace(/\s+/g, ' ').trim()
    if (text.length < MIN_TEXT_LENGTH) continue
    const el = article as HTMLElement
    const replies = extractReplies(el)
    const reposts = readCounter(article, 'retweet', /转帖|转推|repost|retweet/)
    const likes = readCounter(article, 'like', /喜欢|赞|like/)
    out.push({
      author: authorHandle(article),
      text,
      replies,
      reposts,
      likes,
      ageHours: toHoursAlive(nowMs, extractCreatedAtMs(el)),
    })
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

export function scoreCandidate(c: Omit<ScoredCandidate, 'scores' | 'total'>, keywords: string[]): ScoredCandidate {
  const lower = c.text.toLowerCase()
  // 命中任一关键词即进入高分段：1 个 70、2 个 85、3 个及以上 100；未配置关键词时 50（中性）
  const hits = keywords.filter((k) => lower.includes(k)).length
  const keyword = keywords.length === 0 ? 50 : hits === 0 ? 0 : Math.min(100, 55 + hits * 15)
  // 回复/转发比（加一平滑，比值 ≥ 3 满分），再按回复量衰减：回复 ≥ 100 才不打折，避免 3 条回复就判为争议
  const ratio = clamp100(((c.replies + 1) / (c.reposts + 1) / 3) * 100)
  const volume = Math.min(1, Math.log10(c.replies + 1) / 2)
  const controversy = c.replies === 0 ? 0 : clamp100(ratio * volume)
  // 信息密度：正文长度（满 140 字计 60 分）+ 数字 + 英文专有名词
  const digits = (c.text.match(/\d+(?:\.\d+)?%?/g) || []).length
  const properNouns = (c.text.match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || []).length
  const infoDelta = clamp100((Math.min(c.text.length, 140) / 140) * 60 + digits * 10 + properNouns * 8)
  // 爆发力：每小时互动数取对数，100/h ≈ 80 分，1000/h 满分
  const perHour = (c.replies + c.reposts + c.likes) / Math.max(c.ageHours, 1 / 60)
  const velocity = clamp100(Math.log10(perHour + 1) * 40)
  const scores = { keyword, controversy, infoDelta, velocity }
  const total = clamp100(
    keyword * SCORE_WEIGHTS.keyword +
      controversy * SCORE_WEIGHTS.controversy +
      infoDelta * SCORE_WEIGHTS.infoDelta +
      velocity * SCORE_WEIGHTS.velocity,
  )
  return { ...c, scores, total }
}

export function selectSeeds(list: ScoredCandidate[], threshold = SEED_THRESHOLD, max = MAX_SEEDS): ScoredCandidate[] {
  return list.filter((c) => c.total >= threshold).sort((a, b) => b.total - a.total).slice(0, max)
}
