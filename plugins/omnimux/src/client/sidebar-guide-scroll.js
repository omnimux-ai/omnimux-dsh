/**
 * Sidebar guide scroll — make the official right-sidebar 「开始/guide」 entry list
 * scroll inside the viewport.
 *
 * The visible `开始` page is rendered by the OFFICIAL
 * `@deepseek-ai/dsh-client-ui-sidebar-right` GuideBody: a flex column centred
 * container (`[data-sidebar-right-guide]`, hashed `.L5GtOG_guide`) that is
 * `overflow:visible; min-height:100%`. When its 21 entries overflow, the tab
 * body that wraps it (`[data-sidebar-right-tab]`, `height:100%; overflow:hidden`)
 * clips them in place without ever growing the outer dockkit scrollport, so the
 * list is cut and the last entries are unreachable with no scrollbar.
 *
 * Overlay only — we never fork or edit the official package. We only add CSS
 * keyed off stable official hooks, so the guide body becomes the single scroll
 * container:
 *   - `[data-sidebar-right-tab]`          → the tab body that clips
 *   - `[data-sidebar-right-guide]`        → the guide content container
 *   - `[data-sidebar-right-guide-entry]`  → one entry (guards against empty guides)
 *
 * `justify-content: safe center` is required because the guide centres its
 * column; "unsafe" centring pins the top when content overflows, which would
 * hide the first entries.
 */

export const SIDEBAR_GUIDE_SCROLL_STYLE_ID = 'omnimux-sidebar-guide-scroll'

export const SIDEBAR_GUIDE_SCROLL_CSS = `
/* Only the populated right-sidebar guide gets the scroll container; other tabs
   and empty guides are untouched. Stable data hooks only, no hashed classes. */
[data-sidebar-right-tab] [data-sidebar-right-guide]:has([data-sidebar-right-guide-entry]) {
  overflow-y: auto !important;
  max-height: 100% !important;
  justify-content: safe center !important;
}
`

function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

/**
 * Inject (idempotently) the sidebar-guide scroll `<style>`.
 * @param {Document | undefined} [doc]
 * @returns {HTMLStyleElement | null}
 */
export function ensureSidebarGuideScrollChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  let style = doc.getElementById(SIDEBAR_GUIDE_SCROLL_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = SIDEBAR_GUIDE_SCROLL_STYLE_ID
    doc.head.append(style)
  }
  if (style.textContent !== SIDEBAR_GUIDE_SCROLL_CSS) style.textContent = SIDEBAR_GUIDE_SCROLL_CSS
  return style
}

/**
 * Remove the injected `<style>` (plugin unload).
 * @param {Document | undefined} [doc]
 */
export function removeSidebarGuideScrollChrome(doc = hostDocument()) {
  const style = doc?.getElementById?.(SIDEBAR_GUIDE_SCROLL_STYLE_ID)
  if (style && typeof style.remove === 'function') style.remove()
}
