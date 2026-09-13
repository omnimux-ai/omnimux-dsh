/**
 * Auto-layout algorithm for the workbench "New Tab / Guide" page.
 * When the number of entry options exceeds the threshold (default: 6),
 * and the container has sufficient width (>= 580px), switch the layout
 * from a single long column to a balanced double-column grid to avoid
 * excessive scrolling and improve selection ergonomics.
 */

export const GUIDE_LAYOUT_ATTR = 'data-sidebar-right-guide'
export const GUIDE_LAYOUT_COLUMNS_ATTR = 'data-layout-columns'
export const GUIDE_DOUBLE_COLUMN_THRESHOLD = 6
export const GUIDE_MIN_DOUBLE_COLUMN_WIDTH_PX = 580

export const GUIDE_DOUBLE_COLUMN_STYLES_ID = 'omnimux-sidebar-right-guide-layout-styles'
export const GUIDE_DOUBLE_COLUMN_STYLES = `
/* When guide layout is set to 2 columns */
[${GUIDE_LAYOUT_ATTR}="true"][${GUIDE_LAYOUT_COLUMNS_ATTR}="2"] {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(260px, 380px)) !important;
  justify-content: center !important;
  gap: 12px 16px !important;
  max-width: 820px !important;
  margin: 0 auto !important;
  padding: 0 16px 40px !important;
}

[${GUIDE_LAYOUT_ATTR}="true"][${GUIDE_LAYOUT_COLUMNS_ATTR}="2"] > span[class*="hero"],
[${GUIDE_LAYOUT_ATTR}="true"][${GUIDE_LAYOUT_COLUMNS_ATTR}="2"] > [class*="hero"] {
  grid-column: 1 / -1 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  margin: 16px 0 8px !important;
}

[${GUIDE_LAYOUT_ATTR}="true"][${GUIDE_LAYOUT_COLUMNS_ATTR}="2"] [data-sidebar-right-guide-entry] {
  width: 100% !important;
  max-width: 380px !important;
  margin: 0 !important;
}
`

/**
 * Pure algorithm: calculate whether double-column layout should be activated.
 * @param {number} entryCount Total number of entry items
 * @param {number} containerWidth Width of the guide container in px
 * @param {{ threshold?: number, minWidth?: number }} [options]
 * @returns {'1' | '2'} Column count attribute ('1' or '2')
 */
export function computeGuideLayoutColumns(entryCount, containerWidth, options = {}) {
  const threshold = options.threshold ?? GUIDE_DOUBLE_COLUMN_THRESHOLD
  const minWidth = options.minWidth ?? GUIDE_MIN_DOUBLE_COLUMN_WIDTH_PX

  if (entryCount > threshold && containerWidth >= minWidth) {
    return '2'
  }
  return '1'
}

/**
 * Ensures the double-column CSS rules are injected once.
 * @param {Document | null | undefined} doc
 */
export function ensureGuideLayoutStyles(doc) {
  if (!doc || doc.getElementById(GUIDE_DOUBLE_COLUMN_STYLES_ID)) return
  const style = doc.createElement('style')
  style.id = GUIDE_DOUBLE_COLUMN_STYLES_ID
  style.textContent = GUIDE_DOUBLE_COLUMN_STYLES
  const target = doc.head || doc.documentElement
  if (target) target.appendChild(style)
}

/**
 * Applies the calculated columns layout attribute onto the guide element.
 * @param {Document | null | undefined} doc
 * @returns {'1' | '2' | null}
 */
export function syncSidebarRightGuideLayout(doc) {
  if (!doc) return null
  const guide = doc.querySelector(`[${GUIDE_LAYOUT_ATTR}="true"]`)
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
  const HTMLElementClass = win?.HTMLElement || (typeof HTMLElement !== 'undefined' ? HTMLElement : null)
  if (!guide || (HTMLElementClass && !(guide instanceof HTMLElementClass))) return null

  ensureGuideLayoutStyles(doc)

  const entries = guide.querySelectorAll('[data-sidebar-right-guide-entry]')
  const entryCount = entries.length
  const width = guide.clientWidth || guide.parentElement?.clientWidth || 800

  const cols = computeGuideLayoutColumns(entryCount, width)
  if (guide.getAttribute(GUIDE_LAYOUT_COLUMNS_ATTR) !== cols) {
    guide.setAttribute(GUIDE_LAYOUT_COLUMNS_ATTR, cols)
  }
  return cols
}

/**
 * Installs observers to auto-balance the guide layout dynamically.
 * @param {Document | null | undefined} doc
 * @returns {() => void} Cleanup function
 */
export function installSidebarRightGuideLayout(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc) return () => {}

  syncSidebarRightGuideLayout(doc)

  const ObserverClass = doc.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined)
  const ResizeObserverClass = doc.defaultView?.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined)

  let mutationObserver = null
  let resizeObserver = null

  const sync = () => {
    try { syncSidebarRightGuideLayout(doc) } catch { /* ignore */ }
  }

  if (ObserverClass) {
    mutationObserver = new ObserverClass(() => {
      sync()
    })
    const target = doc.querySelector('[data-slot="rightbar"], .dshDesktopRightbarSurface, body') || doc.body
    if (target) {
      mutationObserver.observe(target, { childList: true, subtree: true })
    }
  }

  if (ResizeObserverClass) {
    resizeObserver = new ResizeObserverClass(() => {
      sync()
    })
    const guide = doc.querySelector(`[${GUIDE_LAYOUT_ATTR}="true"]`) || doc.querySelector('.dshDesktopRightbarSurface') || doc.body
    if (guide) {
      resizeObserver.observe(guide)
    }
  }

  return () => {
    try { mutationObserver?.disconnect() } catch { /* ignore */ }
    try { resizeObserver?.disconnect() } catch { /* ignore */ }
  }
}
