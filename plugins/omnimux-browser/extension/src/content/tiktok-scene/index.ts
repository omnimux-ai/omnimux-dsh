/**
 * TikTok scene entry: decides whether this page gets the trigger, keeps the
 * target post in step with what the user is looking at, and hands each shortcut
 * to the background worker.
 *
 * Three facts about TikTok's web app shape this module. First, it is a
 * single-page app: the address bar is rewritten as the user scrolls the For You
 * feed, and a click on a profile tile replaces the whole page without a
 * navigation event, so the address is re-read rather than captured once at
 * mount. Second, the rail can be re-rendered at any time, so the trigger is
 * re-measured on DOM changes rather than trusting its first position. Third, the
 * trigger belongs to the home feed and nowhere else: every other address —
 * a profile, a single post, search, explore, messages, settings — renders
 * avatars of its own, and a mark that followed them would sit on pictures the
 * user never asked it to decorate. The gate is therefore part of the mount
 * decision, and it is re-evaluated on the same mutations that move the trigger.
 *
 * @module
 */

import { tiktokCopy } from './copy.ts'
import { mountTiktokScene } from './menu.ts'
import { TIKTOK_TIMING } from './messages.ts'
import { resolveTargetPost } from './target.ts'
import { sendTiktokShortcut } from './transport.ts'
import type { TiktokSceneHandle } from './menu.ts'
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
 * Whether a TikTok address is the home feed, which is the only page that gets
 * the trigger.
 *
 * The For You feed is served from the site root; the two tab addresses the app
 * has used for it are accepted as well so a tab click does not make the trigger
 * disappear. Everything else is deliberately not home — in particular a single
 * post (`/@user/video/<id>`) and a profile (`/@user`), the two addresses where
 * the page renders an avatar and the mark would otherwise look like it belongs
 * to that picture.
 * @param pathname the page's path, as read from the address bar
 */
export function isTikTokHomePath(pathname: string): boolean {
  const path = pathname.toLowerCase()
  return path === '' || path === '/' || path === '/foryou' || path === '/following'
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

  // The trigger exists only while the page is the home feed. `null` is the
  // unmounted state, and the flag records the decision the current state was
  // made for, so a burst of mutations on one address mounts and unmounts once.
  let scene: TiktokSceneHandle | null = null
  let mountedHome = false

  const syncGate = (): void => {
    const home = isTikTokHomePath(window.location.pathname)
    if (home === mountedHome) return
    mountedHome = home
    if (home) {
      scene = mountTiktokScene({ doc, copy, run })
      return
    }
    scene?.dispose()
    scene = null
  }

  // One throttled pass over the page, shared by the gate and the trigger's
  // anchor: TikTok changes the address without a navigation event, so the gate
  // is re-read on the same DOM mutations that move the trigger. A throttle, not
  // a debounce — a debounce restarted by each mutation can be starved forever by
  // a page that never goes quiet, leaving the trigger at a stale anchor. The
  // first mutation is handled at once; a burst after that collapses into one
  // trailing pass.
  let lastMeasure = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const pass = (): void => {
    const wait = TIKTOK_TIMING.rescanThrottleMs - (Date.now() - lastMeasure)
    if (wait <= 0) {
      lastMeasure = Date.now()
      syncGate()
      scene?.reposition()
      return
    }
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      lastMeasure = Date.now()
      syncGate()
      scene?.reposition()
    }, wait)
  }

  doc.addEventListener('pointerover', onPointerOver, { passive: true })
  // Attribute changes count too: the rail hides or collapses itself by switching
  // a class or an inline style, which inserts no node at all and would otherwise
  // leave the trigger at the old anchor until something else mutated the tree.
  const observer = new MutationObserver(pass)
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  })
  // Back and forward do not mutate anything until the app re-renders, so the
  // gate answers those directly instead of waiting for a mutation that may only
  // arrive with the next feed update. The timer is the floor under both: a hard
  // load of a post address commits on the feed and has the post's own path
  // pushed in behind it, which leaves no mutation to re-check on.
  doc.defaultView?.addEventListener('popstate', pass)
  const urlWatch = doc.defaultView?.setInterval(syncGate, TIKTOK_TIMING.urlWatchMs) ?? null

  syncGate()

  shell[SCENE_SLOT] = {
    dispose(): void {
      if (timer !== null) clearTimeout(timer)
      observer.disconnect()
      doc.removeEventListener('pointerover', onPointerOver)
      doc.defaultView?.removeEventListener('popstate', pass)
      if (urlWatch !== null) doc.defaultView?.clearInterval(urlWatch)
      scene?.dispose()
      scene = null
      mountedHome = false
    },
  }
}
