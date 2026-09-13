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

/** The first post link on the page, as the profile grid's last resort. */
function firstPostHref(doc: Document): string | null {
  const anchor = doc.querySelector('a[href*="/video/"]')
  return anchor instanceof HTMLAnchorElement ? anchor.href : null
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
    const anchor = target.closest('a[href*="/video/"]')
    if (anchor instanceof HTMLAnchorElement) hoveredHref = anchor.href
  }

  const run = async (action: TiktokAction): Promise<ExportOutcome> => {
    const target = resolveTargetPost({
      pageUrl: window.location.href,
      hoveredHref,
      gridHref: firstPostHref(doc),
    })
    if (target === null) return { ok: false, code: 'rejected', detail: copy.noTarget }
    return sendTiktokShortcut(action, target.url)
  }

  const scene = mountTiktokScene({ doc, copy, run })

  doc.addEventListener('pointerover', onPointerOver, { passive: true })

  // A debounced re-measure rather than a re-mount: the trigger stays put and only
  // its anchor is refreshed, so an open menu is never torn down under the user's
  // pointer by a feed update.
  let timer: ReturnType<typeof setTimeout> | null = null
  const observer = new MutationObserver(() => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      scene.reposition()
    }, TIKTOK_TIMING.rescanDebounceMs)
  })
  observer.observe(doc.documentElement, { childList: true, subtree: true })

  shell[SCENE_SLOT] = {
    dispose(): void {
      if (timer !== null) clearTimeout(timer)
      observer.disconnect()
      doc.removeEventListener('pointerover', onPointerOver)
      scene.dispose()
    },
  }
}
