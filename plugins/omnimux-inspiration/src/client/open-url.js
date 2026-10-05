/**
 * The one rule every「打开外部链接」in this plugin shares: only absolute
 * `http:`/`https:` URLs may reach `window.open`.
 *
 * Centralized because the same unchecked `source_url`/`profile_url` reached
 * `window.open` from three places (原帖直达 / 查看原帖 / 账号主页跳转), and a
 * `javascript:` or `data:` URL stored on a card would execute or navigate.
 * Pure function — every branch is exercised in `open-url.test.js`.
 */

/**
 * @param {unknown} url
 * @returns {boolean} true only for an absolute http(s) URL.
 */
export function isSafeExternalUrl(url) {
  if (typeof url !== 'string') return false
  const value = url.trim()
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Open an external URL in a new, severed tab — or do nothing.
 * @param {unknown} url
 * @param {{ window?: { open?: Function } }} [io]
 * @returns {boolean} whether `window.open` ran.
 */
export function openExternalUrl(url, io = {}) {
  if (!isSafeExternalUrl(url)) return false
  const win = io.window ?? (typeof window !== 'undefined' ? window : undefined)
  if (!win || typeof win.open !== 'function') return false
  win.open(String(url).trim(), '_blank', 'noopener,noreferrer')
  return true
}
