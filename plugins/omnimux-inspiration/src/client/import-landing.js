/**
 * Landing rules for the two outcomes of「导入灵感」.
 *
 * An import produces either a content row or a monitored 对标账号, and the grid
 * has to land the user on what they just created. An account belongs to the
 * rival-accounts tab, which loads its own list; a content row belongs to the
 * local library, so the grid moves to a tab that can show it and keeps it in
 * view while the post-import reload settles.
 *
 * Everything here is pure and DOM-optional, so the contract is testable without
 * a renderer: the section only applies these decisions.
 */

/** Tabs whose list can hold a freshly imported local row. */
export const CONTENT_LANDING_TABS = ['all', 'local']

/** Card attribute carrying the row id, used to find the landed card again. */
export const LANDED_CARD_ATTRIBUTE = 'data-inspiration-id'

/** Class flashed on the landed card so the eye can find it. */
export const LANDED_HIGHLIGHT_CLASS = 'is-landed'

/** How long the landed card keeps its highlight. */
export const LANDED_HIGHLIGHT_MS = 2400

/**
 * How long the imported row stays pinned above the list.
 *
 * The pin has to outlive the post-import reload: switching to the local tab
 * refetches page 1, and a row created a second ago sorted by `hot` can fall
 * outside that page even with no filter set. It is deliberately bounded — a row
 * a filter the user set on purpose keeps hiding must not stay on screen for the
 * rest of the session.
 */
export const LANDED_PIN_MS = 12000

/**
 * Tab the grid must show once a content import landed in the local library.
 * `all` already lists local rows and is kept as-is; any other tab (the cloud tab
 * cannot show a local row at all, the rival workbench shows accounts) moves to
 * `local`.
 * @param {string} tab
 * @returns {string}
 */
export function tabAfterContentImport(tab) {
  return CONTENT_LANDING_TABS.includes(tab) ? tab : 'local'
}

/**
 * Merge the pinned imported row into the list the grid is about to render.
 *
 * The pin only re-adds a row the list itself does not hold, so it never
 * duplicates a card, and it is inert on the tabs that cannot hold a local row.
 * @param {Array<object>} items rows the feed currently holds
 * @param {object|null} landed row the last import produced
 * @param {string} tab active tab
 * @returns {Array<object>}
 */
export function withLandedItem(items, landed, tab) {
  const list = Array.isArray(items) ? items : []
  if (!landed || landed.id == null) return list
  if (!CONTENT_LANDING_TABS.includes(tab)) return list
  if (list.some((row) => String(row?.id) === String(landed.id))) return list
  return [landed, ...list]
}

/**
 * Selector matching one card by row id.
 * @param {unknown} id
 * @returns {string}
 */
export function landedCardSelector(id) {
  const value = String(id ?? '').replace(/["\\]/g, '\\$&')
  return `[${LANDED_CARD_ATTRIBUTE}="${value}"]`
}

/**
 * Bring a landed card into view and flash it.
 *
 * Returns a cleanup that removes the highlight, so the caller's effect owns the
 * lifetime. A missing card is a timing detail rather than a failure — the row is
 * pinned by the caller — and an environment without layout (jsdom) must not
 * throw.
 * @param {unknown} id row id of the landed card
 * @param {{ document?: Document|null, durationMs?: number }} [options]
 * @returns {() => void} cleanup
 */
export function revealLandedCard(id, options = {}) {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  const node = id == null || typeof doc?.querySelector !== 'function'
    ? null
    : doc.querySelector(landedCardSelector(id))
  if (!node) return () => {}
  try {
    node.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  } catch {
    // No layout engine: scrolling is meaningless here, the highlight still applies.
  }
  node.classList?.add(LANDED_HIGHLIGHT_CLASS)
  const timer = setTimeout(() => {
    node.classList?.remove(LANDED_HIGHLIGHT_CLASS)
  }, options.durationMs ?? LANDED_HIGHLIGHT_MS)
  return () => {
    clearTimeout(timer)
    node.classList?.remove(LANDED_HIGHLIGHT_CLASS)
  }
}
