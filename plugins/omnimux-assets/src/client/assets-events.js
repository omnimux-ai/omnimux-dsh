/**
 * The cross-feed signal that the local library changed.
 *
 * The cloud tab and the local tab are two independently mounted feeds over two
 * different stores, and neither one re-reads the other. Saving a catalog row
 * into the library therefore has to be announced: the saver dispatches this
 * event on the window, and the local feed refreshes on it, which is what makes
 * a just-saved asset appear under 本地 without waiting for the next poll.
 *
 * The Hub's event bus carries the same name over its socket. This module is the
 * in-window half of the bridge, so the refresh also happens when the bus is not
 * connected.
 */

/** Event name, shared by the saver and the local feed. */
export const ASSETS_CHANGED_EVENT = 'omnimux:assets:changed'

/**
 * Dispatch the change signal.
 *
 * @param {{ window?: any, CustomEvent?: any }} [io] injection point for tests
 * @returns {boolean} true when the event reached the window
 */
export function notifyAssetsChanged(io = {}) {
  const win = io.window || (typeof window !== 'undefined' ? window : undefined)
  if (!win || typeof win.dispatchEvent !== 'function') return false
  const EventCtor = io.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null)
  if (!EventCtor) return false
  try {
    win.dispatchEvent(new EventCtor(ASSETS_CHANGED_EVENT))
    return true
  } catch {
    return false
  }
}

/**
 * Subscribe to the change signal.
 *
 * @param {{ window?: any, handler: () => void }} input
 * @returns {() => void} unsubscribe; a no-op when the target cannot listen
 */
export function subscribeAssetsChanged(input) {
  const win = input?.window || (typeof window !== 'undefined' ? window : undefined)
  const handler = input?.handler
  if (!win || typeof win.addEventListener !== 'function' || typeof handler !== 'function') {
    return () => {}
  }
  const listener = () => { handler() }
  win.addEventListener(ASSETS_CHANGED_EVENT, listener)
  return () => { win.removeEventListener(ASSETS_CHANGED_EVENT, listener) }
}
