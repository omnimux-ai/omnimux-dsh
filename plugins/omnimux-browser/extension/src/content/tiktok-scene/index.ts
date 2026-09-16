/**
 * TikTok scene entry: decides whether this page gets the trigger, keeps the
 * target post in step with what the user is looking at, and hands each shortcut
 * to the background worker.
 *
 * Two facts about TikTok's web app shape this module. First, it is a single-page
 * app: the address bar is rewritten as the user scrolls the For You feed, so the
 * watched post is read fresh from `location.href` on every shortcut instead of
 * being captured once at mount. Second, the rail can be re-rendered at any time,
 * so the trigger is re-measured on DOM changes rather than trusting its first
 * position.
 *
 * @module
 */

import { tiktokCopy } from './copy.ts'
import { mountTiktokScene } from './menu.ts'
import { TIKTOK_TIMING } from './messages.ts'
import { resolveTargetPost } from './target.ts'
import { sendTiktokShortcut } from './transport.ts'
import type { TiktokAction } from './copy.ts'
import type { ExportOutcome } from '../../background/media-export.ts'

/** Global slot holding the mounted scene, so a re-injection replaces it. */
const SCENE_SLOT = '__dshBrowserTiktokScene'

interface SceneMount {
  dispose(): void
}

/** Whether a hostname belongs to TikTok. */
export function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'tiktok.com' || host.endsWith('.tiktok.com')
}

/**
 * Mount the TikTok scene, if this page is one.
 *
 * Idempotent: a content script can be re-injected into a live page, so any
 * previous mount — and every listener it installed — is disposed first.
 */
export function initTiktokScene(): void {
  if (window !== window.top) return
  if (!isTikTokHost(window.location.hostname)) return

  const shell = globalThis as typeof globalThis & { [SCENE_SLOT]?: SceneMount }
  shell[SCENE_SLOT]?.dispose()

  const doc = document
  const copy = tiktokCopy()

  // The pointer's last post link is the only way to know which grid tile the
  // user meant on a profile page, where the address bar names the profile.
  let hoveredHref: string | null = null
  const onPointerOver = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    // Photo posts are collected as well: `target.ts` accepts them by contract
    // because the host can still import one into the library, and the export
    // path reports its own reason when a post has no stream to take. Filtering
    // them out here would answer "nothing to act on" for a post the user can
    // plainly see.
    const anchor = target.closest('a[href*="/video/"], a[href*="/photo/"]')
    if (anchor instanceof HTMLAnchorElement) hoveredHref = anchor.href
  }

  const resolveActiveFeedHref = (): string | null => {
    // 1. Try active XGPlayer container in viewport (TikTok feed & player architecture)
    const xgPlayers = Array.from(doc.querySelectorAll<HTMLElement>('[id*="xgwrapper-"], [id*="xgmedia-"]'))
    const vCenter = window.innerHeight / 2
    let bestPlayer: HTMLElement | null = null
    let minDiff = Infinity

    for (const player of xgPlayers) {
      const r = player.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0) {
        const diff = Math.abs((r.top + r.bottom) / 2 - vCenter)
        if (diff < minDiff) {
          minDiff = diff
          bestPlayer = player
        }
      }
    }

    if (bestPlayer) {
      const match = bestPlayer.id.match(/\d{18,19}/)
      if (match) {
        const card = bestPlayer.closest('section, article, [class*="ItemContainer"], [data-e2e="feed-video"]')
        const authorLink = card?.querySelector<HTMLAnchorElement>('a[href*="/@"]')
        const authorMatch = authorLink?.href?.match(/\/@([^/?#]+)/)
        const author = authorMatch ? authorMatch[1] : 'i'
        return `https://www.tiktok.com/@${author}/video/${match[0]}`
      }
    }

    // 2. Try currently playing / visible video in browse modal or container
    const modal = doc.querySelector('[data-e2e="browse-video"], [class*="DivVideoContainer"], [class*="DivContainer"]')
    if (modal) {
      const modalLink = modal.querySelector<HTMLAnchorElement>('a[href*="/video/"], a[href*="/photo/"]')
      if (modalLink && modalLink.href) return modalLink.href
    }

    // 3. Try nearby anchor of the active action bar that has a video element
    const bar = doc.querySelector('section[class*="SectionActionBarContainer"], [class*="ActionBarContainer"]')
    if (bar) {
      const card = bar.closest('section, article, [class*="ItemContainer"]')
      if (card && card.querySelector('video')) {
        const cardLink = card.querySelector<HTMLAnchorElement>('a[href*="/video/"], a[href*="/photo/"]')
        if (cardLink && cardLink.href) return cardLink.href
      }
    }

    return null
  }

  const run = async (action: TiktokAction): Promise<ExportOutcome> => {
    const activeHref = resolveActiveFeedHref()
    const target = resolveTargetPost({ pageUrl: window.location.href, hoveredHref, activeHref })
    if (target === null) return { ok: false, code: 'rejected', detail: copy.noTarget }
    return sendTiktokShortcut(action, target.url)
  }

  const scene = mountTiktokScene({ doc, copy, run })

  doc.addEventListener('pointerover', onPointerOver, { passive: true })

  // A throttled re-measure rather than a re-mount: the trigger stays put and only
  // its anchor is refreshed, so an open menu is never torn down under the user’s
  // pointer by a feed update. The first mutation re-measures at once; a burst
  // after that collapses into one trailing re-measure.
  let lastMeasure = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const remeasure = (): void => {
    const wait = TIKTOK_TIMING.rescanThrottleMs - (Date.now() - lastMeasure)
    if (wait <= 0) {
      lastMeasure = Date.now()
      scene.reposition()
      return
    }
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      lastMeasure = Date.now()
      scene.reposition()
    }, wait)
  }
  const observer = new MutationObserver(remeasure)
  // Attribute changes count too: the rail hides or collapses itself by switching a
  // class or an inline style, which inserts no node at all and would otherwise
  // leave the trigger at the old anchor until something else mutated the tree.
  // Throttling above is what keeps that affordable.
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  })

  shell[SCENE_SLOT] = {
    dispose(): void {
      if (timer !== null) clearTimeout(timer)
      observer.disconnect()
      doc.removeEventListener('pointerover', onPointerOver)
      scene.dispose()
    },
  }
}
