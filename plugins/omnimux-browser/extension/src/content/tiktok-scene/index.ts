/**
 * TikTok scene entry: decides whether this page gets the trigger, keeps the
 * target post in step with what the user is looking at, and hands each shortcut
 * to the background worker.
 *
 * Three facts about TikTok's web app shape this module. First, it is a
 * single-page app, and the address is not a reliable answer: the current For You
 * feed keeps `/` while the user swipes, so the watched post is read from the card
 * at the viewport centre (`active-post.ts`); a click on a profile tile replaces
 * the page without a navigation event, so the address is re-read rather than
 * captured once at mount. Second, the rail can be re-rendered at any time, so the trigger is
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
import { resolveActivePostUrl } from './active-post.ts'
import { sendTiktokShortcut } from './transport.ts'
import { sceneTriggerFor } from '../surfaces/registry.ts'
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
 * Whether a TikTok address gets the scene trigger.
 *
 * The answer comes from the surface registry rather than from a pathname list
 * kept here: a feed and a single post both ask "what am I watching?", while a
 * profile or a search grid is a wall of other people's work — those pages render
 * avatars of their own, and a mark that followed them would sit on pictures the
 * user never asked it to decorate. They carry the card trigger instead
 * (`surfaces/media-trigger.ts`).
 *
 * @param pathname the page's path, as read from the address bar
 */
export function isTikTokScenePath(pathname: string): boolean {
  return sceneTriggerFor({ platform: 'tiktok', pageType: 'unknown', pathname }) !== null
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

  // The feed does not rewrite the address bar, so the current post is read from the
  // card that owns the viewport centre (`active-post.ts`).
  const resolveActiveFeedHref = (): string | null =>
    resolveActivePostUrl(doc, {
      height: doc.defaultView?.innerHeight ?? window.innerHeight,
    })
  const run = async (action: TiktokAction): Promise<ExportOutcome> => {
    const activeHref = resolveActiveFeedHref()
    const target = resolveTargetPost({ pageUrl: window.location.href, hoveredHref, activeHref })
    if (target === null) return { ok: false, code: 'rejected', detail: copy.noTarget }
    return sendTiktokShortcut(action, target.url)
  }

  // The trigger exists only while the page is one the registry grants it to.
  // `null` is the unmounted state, and the flag records the decision the current
  // state was made for, so a burst of mutations on one address mounts and
  // unmounts once.
  let scene: TiktokSceneHandle | null = null
  let mounted = false

  const syncGate = (): void => {
    const wanted = isTikTokScenePath(window.location.pathname)
    if (wanted === mounted) return
    mounted = wanted
    if (wanted) {
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
      mounted = false
    },
  }
}
