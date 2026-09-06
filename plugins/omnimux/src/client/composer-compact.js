/**
 * Composer compact (screens 1-2): adapt the official conversation composer to a
 * narrowed session column. Overlay only — no fork, no second composer, no
 * conversation-slot replacement. Selectors deliberately rely on data attributes
 * and `[class*=...]` substring matches because official CSS modules are hashed.
 *
 * Three density levels are driven by the live width of the composer card:
 *   full  (>= 560px) — everything shown
 *   short (>= 460px) — effort hidden; model seat already collapses to a box glyph
 *   icon  (<  460px) — toolbar icons only; model seat stays the same box glyph
 *
 * Also owns the empty-state anchor (logo+tagline mid, input pinned to the
 * bottom, Codex-style) and the conversation-column min-width guard.
 */

export const COMPOSER_COMPACT_STYLE_ID = 'omnimux-composer-compact-chrome'
export const COMPOSER_COMPACT_ATTR = 'data-omnimux-composer-density'
export const COMPOSER_COMPACT_DENSITY = Object.freeze({ full: 'full', short: 'short', icon: 'icon' })
export const COMPOSER_COMPACT_FULL_MIN_PX = 560
export const COMPOSER_COMPACT_SHORT_MIN_PX = 460
/** Keep in lockstep with WORKBENCH_CONVERSATION_MIN_PX. */
export const COMPOSER_COMPACT_CONVERSATION_MIN_PX = 360
/** Keep the workspace chip secondary to the adjacent Agent preset on narrow rows. */
export const COMPOSER_WORKSPACE_MAX_WIDTH_PX = 220

export const COMPOSER_COMPACT_CSS = `
/* (B4) conversation column keeps a minimum width — dragging the split anywhere
   below this is clamped by workbenchSplitMaxPanelPx; this guards the CSS side. */
html:not([data-omnimux-conversation-collapsed]) [class*="centerCol"]{
  min-width:${COMPOSER_COMPACT_CONVERSATION_MIN_PX}px!important;
}

/* (B2) content width follows the live column width instead of the official
   680px floor. The official value is:
   clamp(680px, calc(var(--dsh-conversation-column-width,0px) * 0.64), 920px)
   which is wider than the column below ~712px and crushes the toolbar. */
[data-phase]{
  --dsh-chat-content-width:min(
    920px,
    max(240px, calc(var(--dsh-conversation-column-width,0px) * 0.92))
  )!important;
}

/* Reserve equal scrollbar gutters so the content stays centered in the column. */
[data-conversation-scroll]{
  scrollbar-gutter:stable both-edges;
}
/* Overlay views reserve the same clearance as both chat scrollbar gutters. */
[data-conversation-scroll]:has([data-conversation-composer-overlay]) > [data-composer-seat]{
  left:var(--dsh-scrollbar-width);
}

/* The card and workspace row share a cap; the input bar owns side clearance. */
[data-composer-card]{
  width:100%!important;
  max-width:var(--dsh-chat-content-width)!important;
  margin-left:auto!important;
  margin-right:auto!important;
  box-sizing:border-box!important;
}
[data-composer-seat]{
  box-sizing:border-box!important;
}
[data-composer-seat] [class*="composerStack"]{
  width:100%!important;
  min-width:0;
  margin-left:auto!important;
  margin-right:auto!important;
  box-sizing:border-box!important;
}

/* (B1) hero (no session yet): the whole stack is what the official scrollBody
   justify-content:center used to center. Pin the input bar to the bottom and
   let the HeroShell (logo + tagline) float centered in the leftover space
   (Codex reference). No transform centering — it would become a containing
   block for position:fixed descendants of the hero. */
[data-phase='hero'] [data-conversation-scroll]{
  justify-content:flex-start!important;
}
[data-phase='hero'] [data-composer-seat]{
  flex:1 1 auto;
  min-height:100%;
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
}
[data-phase='hero'] [class*="composerHero"]{
  flex:1 1 auto;
  width:100%;
  align-self:stretch;
  justify-content:flex-end;
  padding-bottom:8px;
}
/* First child of composerHero = HeroShell (logo + tagline): eat the leftover
   space and centre within it. */
[data-phase='hero'] [class*="composerHero"] > :first-child{
  margin-top:auto;
  margin-bottom:auto;
  height:auto!important;
  min-height:0;
}
/* A hidden preview badge must not leave an empty grid track beside the title. */
[data-phase='hero'] [class*="headline"]:has(> [class*="previewBadge"][data-omnimux-hide]){
  grid-template-columns:auto auto;
}

/* Match the input bar's clearance even when a narrow column limits card width. */
[data-phase='hero'] [class*="heroWorkspaceRow"]{
  width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px))!important;
  max-width:var(--dsh-chat-content-width)!important;
  min-width:0;
  margin-left:auto!important;
  margin-right:auto!important;
  padding-left:0!important;
  padding-right:0!important;
  box-sizing:border-box!important;
  flex-wrap:nowrap;
  overflow:hidden;
  position:relative!important;
  left:0!important;
}
/* Size the workspace trigger to its content, capped beside the Agent preset. */
[data-phase='hero'] [class*="heroWorkspaceRow"] > button[aria-label][aria-haspopup='menu'][aria-expanded]:first-child{
  flex:0 1 auto;
  min-width:0;
  max-width:min(100%,${COMPOSER_WORKSPACE_MAX_WIDTH_PX}px)!important;
  overflow:hidden;
}
[data-phase='hero'] [class*="heroWorkspaceRow"] > button[aria-label][aria-haspopup='menu'][aria-expanded]:first-child > span{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

/* (B3) density: short — non-model triggers still truncate; model seat uses the
   shared glyph rule below (same as icon). */
html[data-omnimux-composer-density='short'] [data-composer-card] [class*="triggerLabel"]{
  max-width:88px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
html[data-omnimux-composer-density='short'] [data-composer-card] [class*="triggerEffort"],
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="triggerEffort"]{
  display:none;
}

/* Permission chip: keep its native triggerIcon, drop the text label (icon density). */
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="trigger"]:has([class*="triggerIcon"]) [class*="triggerLabel"]{
  display:none;
}
/*
 * Model seat (conversation.input.model): official ModelSelect has no triggerIcon —
 * only triggerLabel + optional triggerEffort + chevron. On any narrow density
 * (short OR icon, i.e. card < 560px) collapse the chip to a 28px glyph
 * (3-layer box) so a long model name never squeezes the trailing row.
 * Selector is scoped to trailing + aria-haspopup=menu so the ContextMeter
 * (dialog) and left-side Permission/Plan chips stay untouched.
 * title/aria-label remain on the button for hover + a11y.
 */
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-composer-card] [class*="trailing"] button[aria-haspopup='menu']{
  width:28px;
  height:28px;
  min-width:28px;
  max-width:28px;
  padding:0;
  justify-content:center;
  gap:0;
}
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerEffort"],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="chevron"]{
  display:none!important;
}
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-composer-card] [class*="trailing"] button[aria-haspopup='menu']::before{
  content:'';
  display:block;
  width:14px;
  height:14px;
  flex:0 0 14px;
  background-color:currentColor;
  /* White strokes → opaque under luminance mask; currentColor paints the chip. */
  --omnimux-model-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12.92 2.26L19.43 5.77C20.19 6.18 20.19 7.35 19.43 7.76L12.92 11.27C12.34 11.58 11.66 11.58 11.08 11.27L4.57 7.76C3.81 7.35 3.81 6.18 4.57 5.77L11.08 2.26C11.66 1.95 12.34 1.95 12.92 2.26Z' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M3.61 10.13L9.66 13.16C10.41 13.54 10.89 14.31 10.89 15.15V20.87C10.89 21.7 10.02 22.23 9.28 21.86L3.23 18.83C2.48 18.45 2 17.68 2 16.84V11.12C2 10.29 2.87 9.76 3.61 10.13Z' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M20.39 10.13L14.34 13.16C13.59 13.54 13.11 14.31 13.11 15.15V20.87C13.11 21.7 13.98 22.23 14.72 21.86L20.77 18.83C21.52 18.45 22 17.68 22 16.84V11.12C22 10.29 21.13 9.76 20.39 10.13Z' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  -webkit-mask-image:var(--omnimux-model-icon);
  mask-image:var(--omnimux-model-icon);
  -webkit-mask-size:contain;
  mask-size:contain;
  -webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;
  -webkit-mask-position:center;
  mask-position:center;
}
/* Text-only toolbar buttons become icon-sized. Never touch the .add (plus)
   button — it is already an icon. */
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="tools"] > button:not([class*="add"]){
  font-size:0;
  width:28px;
  height:28px;
  min-width:28px;
  padding:0;
  justify-content:center;
}
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="tools"] > button:not([class*="add"]) svg{
  width:14px;
  height:14px;
}
/* Keep the toolbar single-row: the official .row wraps, which drops the
   trailing cluster onto a second line and deforms the card.
   Issue 517: scope to the card's direct-child toolbar only. A descendant
   [class*="row"] also matches the scrollport grow wrapper because "grow"
   contains "row", forcing white-space:nowrap and a horizontal scrollbar at
   360px. Direct child + :has(> [class*="tools"]) keeps the rule off grow
   and other card children. Never widen this back to a descendant selector. */
html[data-omnimux-composer-density='icon'] [data-composer-card] > [class*="row"]:has(> [class*="tools"]){
  flex-wrap:nowrap!important;
  white-space:nowrap;
}
`

function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

/** @type {ResizeObserver | null} */
let composerResizeObserver = null
/** @type {(() => void) | null} */
let composerResizeListener = null
/** @type {MutationObserver | null} */
let composerMountObserver = null
/** @type {Element | null} */
let observedTarget = null
/** @type {Document | null} */
let observerDoc = null

/**
 * Density from a live width (px). Pure, unit-testable.
 * @param {number} px
 * @returns {string} one of `full` | `short` | `icon`
 */
export function composerDensityForWidth(px) {
  const width = Number.isFinite(Number(px)) ? Number(px) : 0
  if (width >= COMPOSER_COMPACT_FULL_MIN_PX) return COMPOSER_COMPACT_DENSITY.full
  if (width >= COMPOSER_COMPACT_SHORT_MIN_PX) return COMPOSER_COMPACT_DENSITY.short
  return COMPOSER_COMPACT_DENSITY.icon
}

/**
 * Find the width probe for density: prefer the composer card, then the seat,
 * then the conversation column/scroll body.
 * @param {Document | undefined} doc
 * @returns {Element | null}
 */
function findComposerTarget(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const card = doc.querySelector('[data-composer-card]')
  if (card) return card
  const seat = doc.querySelector('[data-composer-seat]')
  if (seat) return seat
  const conversation = doc.querySelector('[data-conversation-scroll], [class*="centerCol"]')
  return conversation || null
}

function measureWidth(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const width = el.getBoundingClientRect().width
  return typeof width === 'number' && Number.isFinite(width) ? width : null
}

/**
 * Dock the hero seats row to the live composer-card box (fullscreen fix).
 * Writes CSS vars consumed by COMPOSER_COMPACT_CSS B5.
 * @param {Document | undefined} doc
 */
export function syncHeroWorkspaceRowToCard(doc = hostDocument()) {
  const root = doc?.documentElement
  if (!root?.style?.setProperty) return
  const card = doc?.querySelector?.('[data-composer-card]')
  const center = doc?.querySelector?.('[class*="centerCol"], [data-slot="conversation"]')
  if (!card || typeof card.getBoundingClientRect !== 'function') {
    try {
      root.style.removeProperty('--omnimux-composer-card-width')
      root.style.removeProperty('--omnimux-composer-card-offset')
    } catch { /* ignore */ }
    return
  }
  const cardBox = card.getBoundingClientRect()
  const centerBox = center && typeof center.getBoundingClientRect === 'function'
    ? center.getBoundingClientRect()
    : null
  const width = Math.round(cardBox.width)
  if (!(width > 0)) return
  // Offset of the card inside the conversation column (not the viewport).
  const offset = centerBox
    ? Math.max(0, Math.round(cardBox.left - centerBox.left))
    : Math.round(cardBox.left)
  root.style.setProperty('--omnimux-composer-card-width', `${width}px`)
  root.style.setProperty('--omnimux-composer-card-offset', `${offset}px`)
}

/**
 * Write the density attribute on `<html>` based on the current probe width.
 * Also keeps the hero seats row docked to the composer card.
 * @param {Document | undefined} [doc]
 */
export function applyComposerDensity(doc = hostDocument()) {
  const root = doc?.documentElement
  if (!root || typeof root.setAttribute !== 'function') return
  const target = findComposerTarget(doc)
  const width = target ? measureWidth(target) : null
  if (width == null) {
    if (typeof root.removeAttribute === 'function') root.removeAttribute(COMPOSER_COMPACT_ATTR)
  } else {
    root.setAttribute(COMPOSER_COMPACT_ATTR, composerDensityForWidth(width))
  }
  syncHeroWorkspaceRowToCard(doc)
}

/**
 * Inject (idempotently) the composer-compact CSS `<style>`.
 * @param {Document | undefined} [doc]
 */
export function ensureComposerCompactChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  let style = doc.getElementById(COMPOSER_COMPACT_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = COMPOSER_COMPACT_STYLE_ID
    doc.head.append(style)
  }
  if (style.textContent !== COMPOSER_COMPACT_CSS) style.textContent = COMPOSER_COMPACT_CSS
  return style
}

function observeComposerTarget(doc, target) {
  observedTarget = target
  const RO = globalThis.ResizeObserver
  if (typeof RO === 'function') {
    composerResizeObserver = new RO(() => { applyComposerDensity(doc) })
    composerResizeObserver.observe(target)
  } else {
    // jsdom / browsers without ResizeObserver: measure once + re-measure on resize.
    composerResizeListener = () => { applyComposerDensity(doc) }
    const win = hostWindow()
    if (win?.addEventListener) win.addEventListener('resize', composerResizeListener)
  }
}

/**
 * Start observing the composer width and keep `data-omnimux-composer-density`
 * fresh. A light MutationObserver re-binds once when the card mounts late
 * (never polls). Returns a disposer.
 * @param {Document | undefined} [doc]
 * @returns {() => void}
 */
export function installComposerCompactObserver(doc = hostDocument()) {
  if (!doc) return () => {}
  if (observerDoc === doc && (composerResizeObserver || composerResizeListener || composerMountObserver)) {
    return uninstallComposerCompactObserver
  }
  uninstallComposerCompactObserver()
  observerDoc = doc

  const target = findComposerTarget(doc)
  if (target) {
    observeComposerTarget(doc, target)
  } else if (typeof MutationObserver !== 'undefined') {
    composerMountObserver = new MutationObserver(() => {
      const next = findComposerTarget(doc)
      if (next && observedTarget !== next) {
        if (composerMountObserver) {
          try { composerMountObserver.disconnect() } catch { /* ignore */ }
          composerMountObserver = null
        }
        observeComposerTarget(doc, next)
      }
    })
    const root = doc.body || doc.documentElement
    if (root) composerMountObserver.observe(root, { childList: true, subtree: true })
  }

  applyComposerDensity(doc)
  return uninstallComposerCompactObserver
}

/** Tear down the observer (RO, fallback resize listener, mount watcher). */
export function uninstallComposerCompactObserver() {
  if (composerResizeObserver) {
    try { composerResizeObserver.disconnect() } catch { /* ignore */ }
    composerResizeObserver = null
  }
  if (composerResizeListener) {
    const win = hostWindow()
    if (win?.removeEventListener) win.removeEventListener('resize', composerResizeListener)
    composerResizeListener = null
  }
  if (composerMountObserver) {
    try { composerMountObserver.disconnect() } catch { /* ignore */ }
    composerMountObserver = null
  }
  observedTarget = null
  observerDoc = null
}

/** Test-only: drop state, the style tag, and the `<html>` density attr. */
export function resetComposerCompactForTests() {
  uninstallComposerCompactObserver()
  const doc = hostDocument()
  const root = doc?.documentElement
  if (root && typeof root.removeAttribute === 'function') {
    root.removeAttribute(COMPOSER_COMPACT_ATTR)
  }
  if (root?.style?.removeProperty) {
    try {
      root.style.removeProperty('--omnimux-composer-card-width')
      root.style.removeProperty('--omnimux-composer-card-offset')
    } catch { /* ignore */ }
  }
  const style = doc?.getElementById?.(COMPOSER_COMPACT_STYLE_ID)
  if (style && typeof style.remove === 'function') style.remove()
}
