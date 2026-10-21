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

/** How long the reachability probe may take before the row keeps its card. */
export const EMBED_PROBE_TIMEOUT_MS = 5_000

/**
 * Can a cross-origin embed page be reached at all?
 *
 * Chromium renders its own error page and still fires `load` for a refused,
 * DNS-blocked or offline iframe, so the frame alone cannot tell success from
 * failure. A `no-cors` HEAD probe can: CORS never blocks it, any HTTP answer
 * resolves (opaque), and only a transport failure rejects. jsdom has no
 * `window.fetch`, so unit tests keep the documented lazy iframe path.
 *
 * @param {string} url allowlisted https embed URL
 * @returns {Promise<boolean>}
 */
export async function probeEmbedReachable(url) {
  const fetcher = typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch : null
  if (!fetcher || !url) return true
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer = null
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller?.abort()
      reject(new Error('embed-probe-timeout'))
    }, EMBED_PROBE_TIMEOUT_MS)
  })
  if (timer && typeof timer.unref === 'function') timer.unref()
  try {
    await Promise.race([fetcher(url, {
      mode: 'no-cors',
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller?.signal,
    }), timeout])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
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
    // Probe only where a browser can: jsdom (unit tests) has no window.fetch and
    // must keep the synchronous iframe path the render tests pin.
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      if (!(await probeEmbedReachable(target.url))) return false
    }
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
    // The probe above rejects a dead domain before this point; the `load`/`error`
    // pair still covers a frame that fails after its page answered. The
    // component's 10s race remains the watchdog for a hanging connection.
    return new Promise((resolve) => {
      frame.addEventListener('load', () => resolve(true), { once: true })
      frame.addEventListener('error', () => resolve(false), { once: true })
    })
  }
  return false
}

/** Height of an Instagram card: the media plus its header/action chrome. */
export function instagramCardHeight(width, ratio) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 500
  const safeRatio = Number.isFinite(ratio) && ratio >= 0.4 && ratio <= 2.5 ? ratio : 1
  return Math.min(780, Math.max(420, Math.round(safeWidth / safeRatio + 190)))
}

