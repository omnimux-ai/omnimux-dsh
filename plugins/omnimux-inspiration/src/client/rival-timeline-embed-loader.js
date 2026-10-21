/**
 * Official platform embed for one account-monitor timeline row (#3542).
 *
 * The timeline shows the source post instead of a hand-drawn approximation:
 * X uses the official widget (`platform.twitter.com/widgets.js`) so the card
 * keeps its own height and dark theme; TikTok/YouTube/Instagram use their
 * public iframe embeds. Everything here is lazy: the row mounts this component
 * only when it comes near the viewport, and a failure simply keeps the
 * hand-written card that the row already renders.
 *
 * Kept out of `rival-embed.js` because it owns DOM/scripts, while that module
 * stays a pure URL parser; the JSX component lives in
 * `rival-timeline-embed.jsx` so this file stays importable from Node tests.
 */

/** `platform.twitter.com` widget bundle. */
export const TWITTER_WIDGETS_SRC = 'https://platform.twitter.com/widgets.js'

/** How long a row waits for an embed before falling back to its own card. */
export const EMBED_TIMEOUT_MS = 10_000

let twitterWidgetsPromise = null

/**
 * Load the X widget bundle once per page.
 *
 * A failed load is cached as a rejection: the network is blocked or the script
 * is unreachable, and retrying it once per visible row would turn a feed into a
 * request storm. A reload of the page is the recovery path.
 *
 * @returns {Promise<any>}
 */
export function loadTwitterWidgets() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('twitter-widgets-unavailable'))
  }
  if (window.twttr?.widgets) return Promise.resolve(window.twttr)
  if (twitterWidgetsPromise) return twitterWidgetsPromise
  twitterWidgetsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TWITTER_WIDGETS_SRC
    script.async = true
    script.charset = 'utf-8'
    script.dataset.omnimuxTwitterWidgets = 'true'
    script.onload = () => {
      const twttr = window.twttr
      if (!twttr) {
        reject(new Error('twitter-widgets-missing'))
        return
      }
      const done = (api) => resolve(api || twttr)
      if (typeof twttr.ready === 'function') twttr.ready(done)
      else done(twttr)
    }
    script.onerror = () => reject(new Error('twitter-widgets-failed'))
    document.head.appendChild(script)
  })
  return twitterWidgetsPromise
}

/** Test/QA seam: forget the cached script promise so a suite can re-arm it. */
export function resetTwitterWidgetsLoader() {
  twitterWidgetsPromise = null
  if (typeof document !== 'undefined') {
    for (const node of document.querySelectorAll('script[data-omnimux-twitter-widgets]')) node.remove()
  }
}

/** The app theme is a `data-theme` attribute on `<html>`; dark is the default. */
export function embedTheme(doc = typeof document !== 'undefined' ? document : null) {
  const attr = doc?.documentElement?.getAttribute?.('data-theme') || ''
  return attr.toLowerCase() === 'light' ? 'light' : 'dark'
}

/** X widget language: the plugin only ships zh/en copy. */
export function embedWidgetLang(locale) {
  return locale === 'en' ? 'en' : 'zh-cn'
}

/**
 * Create the official embed inside `host`.
 *
 * Resolves `true` once the platform produced an embed node, `false` when the
 * platform has no official embed or refused the post. Never throws: a failure
 * is the row's cue to keep its own card.
 *
 * @param {{ platform: string, kind: 'card'|'player', id: string, url: string }} target
 * @param {HTMLElement} host
 * @param {{ theme?: 'dark'|'light', lang?: string, title?: string, ratio?: number }} [options]
 * @returns {Promise<boolean>}
 */
export async function createTimelineEmbed(target, host, options = {}) {
  if (!target || !host) return false
  if (target.platform === 'x') {
    const twttr = await loadTwitterWidgets()
    const created = await twttr.widgets.createTweet(target.id, host, {
      theme: options.theme === 'light' ? 'light' : 'dark',
      lang: options.lang || 'zh-cn',
      dnt: true,
      conversation: 'none',
      align: 'center',
    })
    return Boolean(created && host.querySelector('iframe'))
  }
  if (target.platform === 'instagram' || target.platform === 'tiktok' || target.platform === 'youtube') {
    const frame = document.createElement('iframe')
    frame.className = `omnimux-rival-embed-frame is-${target.platform}`
    frame.src = target.url
    frame.title = options.title || ''
    frame.setAttribute('loading', 'lazy')
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    frame.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen')
    frame.setAttribute('allowfullscreen', 'true')
    if (target.platform === 'youtube') frame.setAttribute('scrolling', 'no')
    host.appendChild(frame)
    return true
  }
  return false
}

/** Height of an Instagram card: the media plus its header/action chrome. */
export function instagramCardHeight(width, ratio) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 500
  const safeRatio = Number.isFinite(ratio) && ratio >= 0.4 && ratio <= 2.5 ? ratio : 1
  return Math.min(780, Math.max(420, Math.round(safeWidth / safeRatio + 190)))
}

