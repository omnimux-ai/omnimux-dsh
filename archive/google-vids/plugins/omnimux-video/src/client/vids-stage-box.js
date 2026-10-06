/**
 * Google Vids stage geometry — conversation column only.
 *
 * Host `shell.overlay` mounts under frame-level `.dshDesktopOverlay`
 * (`position:absolute; inset:0` on the whole frame). Filling that host would
 * cover left/right rails. Vids must measure the live center column and clamp
 * to the right panel's left edge when Clip / workbench is open.
 *
 * Differs from hub `readConversationBox()` which expands width to
 * `viewport − left` (Apps-style full remaining span). Vids + Clip split needs
 * the true center column. Prefer `[class*="centerCol"]` because walking up
 * from `[data-slot="conversation"]` can hit a flow ancestor that still spans
 * under an absolutely-positioned right panel.
 */

const EMPTY = Object.freeze({ top: 0, left: 56, width: 320, height: 240 })

/**
 * @param {Element | null | undefined} node
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
function sizableBox(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null
  const rect = node.getBoundingClientRect()
  if (!(rect.width >= 8) || !(rect.height >= 8)) return null
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

/**
 * @param {Document | null | undefined} doc
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
function readConversationColumn(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  // Prefer the frame's center track: right workbench is often position:absolute
  // and does not shrink conversation ancestors.
  const preferred = sizableBox(doc.querySelector('[class*="centerCol"]'))
    || sizableBox(doc.querySelector('.dshDesktopConversationSurface'))
  if (preferred) return preferred

  let node = doc.querySelector('[data-slot="conversation"]')
  while (node) {
    const box = sizableBox(node)
    if (box) return box
    node = node.parentElement
  }
  return sizableBox(doc.querySelector('[data-conversation-scroll]'))
}

/**
 * Visible right workbench panel left edge, or null when absent / closed.
 * @param {Document | null | undefined} doc
 * @returns {number | null}
 */
export function readRightPanelLeft(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const candidates = [
    doc.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]'),
    doc.querySelector('[data-sidebar-right-panel="push"]'),
    doc.querySelector('[data-sidebar-right-panel="fullscreen"]'),
    doc.querySelector('[data-sidebar-right-panel]'),
  ].filter(Boolean)

  const winW = typeof window !== 'undefined' && typeof window.innerWidth === 'number'
    ? window.innerWidth
    : 1e9

  for (const panel of candidates) {
    if (typeof panel.getBoundingClientRect !== 'function') continue
    try {
      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(panel)
        if (style.display === 'none' || style.visibility === 'hidden') continue
      }
    } catch {
      // ignore
    }
    const rect = panel.getBoundingClientRect()
    if (!(rect.width >= 8) || !(rect.height >= 8)) continue
    // Off-screen / fully collapsed push panel
    if (rect.left >= winW - 4) continue
    return Math.round(rect.left)
  }
  return null
}

/**
 * @param {Document | null | undefined} [doc]
 * @param {{ innerWidth?: number, innerHeight?: number } | null | undefined} [win]
 * @returns {{ top: number, left: number, width: number, height: number }}
 */
export function readVidsCenterBox(
  doc = typeof document !== 'undefined' ? document : null,
  win = typeof window !== 'undefined' ? window : null,
) {
  const winW = win && typeof win.innerWidth === 'number' ? win.innerWidth : 1024
  const winH = win && typeof win.innerHeight === 'number' ? win.innerHeight : 768
  const column = readConversationColumn(doc)
  if (!column) {
    return { top: 0, left: 56, width: Math.max(320, winW - 56), height: Math.max(240, winH) }
  }

  const rightLeft = readRightPanelLeft(doc)
  let width = column.width
  if (typeof rightLeft === 'number' && rightLeft > column.left + 8) {
    width = Math.min(width, Math.max(8, rightLeft - column.left))
  }

  // Never spill past the viewport, but do not expand to fill the right rail.
  width = Math.min(width, Math.max(8, winW - column.left))
  const height = Math.min(column.height, Math.max(8, winH - column.top))

  return {
    top: Math.max(0, column.top),
    left: Math.max(0, column.left),
    width: Math.max(8, width),
    height: Math.max(8, height),
  }
}

export const EMPTY_VIDS_BOX = EMPTY
