/**
 * Multi-source feed collection for the empty home composer: read the current
 * home tab, briefly switch to the other of「为你推荐」/「正在关注」, read it, and
 * switch back. Any failure keeps whatever was already collected.
 */

import { collectFeedCandidates, MAX_CANDIDATES, mergeCandidatePools } from './candidates.ts'
import type { CandidateSource, ScoredCandidate } from './types.ts'

type RawCandidate = Omit<ScoredCandidate, 'scores' | 'total' | 'heat'>

export const TAB_LOAD_TIMEOUT_MS = 5000
/** Screens scrolled per source; X renders only ~5 tweets until the timeline is scrolled. */
export const SCROLL_STEPS = 5
const SCROLL_SETTLE_MS = 400
const SCROLL_WAIT_MS = 2000
const TAB_POLL_MS = 200
const TAB_SETTLE_MS = 600

const TAB_PATTERNS: Record<'for_you' | 'following', RegExp> = {
  for_you: /^(为你推荐|For you)$/i,
  following: /^(正在关注|Following)$/i,
}

export interface SourcePools {
  pools: RawCandidate[][]
  sourcesScanned: Partial<Record<CandidateSource, number>>
}

function homeTabs(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]'))
}

function findTab(doc: Document, source: 'for_you' | 'following'): HTMLElement | undefined {
  return homeTabs(doc).find((t) => TAB_PATTERNS[source].test((t.textContent || '').trim()))
}

function sourceOfTab(tab: HTMLElement | undefined): CandidateSource {
  const label = (tab?.textContent || '').trim()
  if (TAB_PATTERNS.for_you.test(label)) return 'for_you'
  if (TAB_PATTERNS.following.test(label)) return 'following'
  return 'page'
}

function firstTweetKey(doc: Document): string {
  return (doc.querySelector('article[data-testid="tweet"]')?.textContent || '').slice(0, 120)
}

function lastTweetKey(doc: Document): string {
  const all = doc.querySelectorAll('article[data-testid="tweet"]')
  return (all[all.length - 1]?.textContent || '').slice(0, 120)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Click a tab and wait until it is selected and its timeline has rendered tweets. */
async function activateTab(doc: Document, tab: HTMLElement, timeoutMs: number): Promise<boolean> {
  const before = firstTweetKey(doc)
  tab.click()
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await sleep(TAB_POLL_MS)
    const selected = tab.getAttribute('aria-selected') === 'true'
    const key = firstTweetKey(doc)
    if (selected && key && (key !== before || Date.now() - started > timeoutMs / 2)) {
      await sleep(TAB_SETTLE_MS)
      return true
    }
  }
  return false
}

/** True when the composer is the home timeline's inline one (not a modal) and the home tabs exist. */
export function canCollectHomeSources(doc: Document, composer: Element | null): boolean {
  if (composer?.closest('[role="dialog"]')) return false
  if (!/^\/home\/?$/.test(doc.location?.pathname || '')) return false
  return Boolean(findTab(doc, 'for_you') && findTab(doc, 'following'))
}

/**
 * Collect the current home tab, then the other of For you / Following, then
 * restore the original tab. Each source is read while scrolling a few screens
 * and the scroll position is restored. Off the home timeline only the current
 * page is read.
 */
export async function collectSourcePools(
  doc: Document,
  composer: Element | null,
  nowMs = Date.now(),
  timeoutMs = TAB_LOAD_TIMEOUT_MS,
  scrollSteps = SCROLL_STEPS,
): Promise<SourcePools> {
  const pools: RawCandidate[][] = []
  const sourcesScanned: Partial<Record<CandidateSource, number>> = {}
  const win = doc.defaultView
  const startY = win?.scrollY ?? 0
  // X 只渲染可视区附近的帖子，且滚出视口的会被移除：边滚边收，每屏去重累加
  const take = async (source: CandidateSource) => {
    let pool = collectFeedCandidates(doc, composer, nowMs, undefined, source)
    for (let i = 0; i < scrollSteps && pool.length < MAX_CANDIDATES && win; i++) {
      const lastKey = lastTweetKey(doc)
      win.scrollBy(0, Math.round(win.innerHeight * 0.9))
      // 等新帖渲染出来（最后一条变了）再收，最多等 SCROLL_WAIT_MS
      const started = Date.now()
      while (Date.now() - started < SCROLL_WAIT_MS && lastTweetKey(doc) === lastKey) await sleep(TAB_POLL_MS)
      await sleep(SCROLL_SETTLE_MS)
      pool = mergeCandidatePools([pool, collectFeedCandidates(doc, composer, nowMs, undefined, source)]).slice(0, MAX_CANDIDATES)
    }
    if (win && scrollSteps > 0) win.scrollTo(0, startY)
    pools.push(pool)
    sourcesScanned[source] = pool.length
  }

  if (!canCollectHomeSources(doc, composer)) {
    await take('page')
    return { pools, sourcesScanned }
  }

  const original = homeTabs(doc).find((t) => t.getAttribute('aria-selected') === 'true')
  const current = sourceOfTab(original)
  await take(current)

  const wanted = (['for_you', 'following'] as const).filter((s) => s !== current)
  for (const source of wanted) {
    const tab = findTab(doc, source)
    if (!tab) continue
    try {
      if (await activateTab(doc, tab, timeoutMs)) await take(source)
      else sourcesScanned[source] = 0
    } catch (e) {
      console.warn('[Copilot] feed source unavailable:', source, e)
      sourcesScanned[source] = 0
    }
  }

  if (original && original.getAttribute('aria-selected') !== 'true') {
    try {
      await activateTab(doc, original, timeoutMs)
    } catch (e) {
      console.warn('[Copilot] could not restore the original home tab:', e)
    }
  }
  return { pools, sourcesScanned }
}
