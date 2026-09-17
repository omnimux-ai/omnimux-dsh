/**
 * The media trigger: one small mark per work card, and the toolbar behind it.
 *
 * The rule this implements is the product decision, not a rendering choice —
 * **nothing is on screen until the pointer rests on the work**. A grid of
 * decorated cards reads as somebody else's product pasted over TikTok, so the
 * mark fades in on the card under the pointer and the toolbar only opens when
 * the pointer reaches the mark itself. That is two stages, and the second one is
 * why the mark exists at all: a card that showed three buttons at rest would be
 * an advertisement, while one that shows a single quiet dot the user can decline
 * to touch is an offer.
 *
 * Geometry comes from the surface registry (corner, size) and never from this
 * module; the maths lives in `types.ts` so it can be tested without a DOM. What
 * is here is the part that cannot be: tracking which cards exist, positioning a
 * fixed layer over them as the page scrolls, and running the two-stage reveal.
 *
 * @module
 */

import { MediaActionBridge, browserTransport } from '../media-hover/actions.ts'
import { hoverCopy } from '../media-hover/copy.ts'
import type { HoveredMedia, MediaKind } from '../media-hover/types.ts'
import { mediaTriggerFor, type SurfacePageFacts } from './registry.ts'
import {
  MEDIA_TRIGGER_SIZE_PX,
  resolveContainerCornerOffset,
  resolveSurfaceSizePx,
  resolveToolbarSide,
  type SurfaceDescriptor,
} from './types.ts'

/** Host element id; also how a duplicate injection is found and removed. */
export const MEDIA_TRIGGER_HOST_ID = 'omnimux-media-trigger-root'

/** Layer above the page, matching the other page surfaces. */
const HOST_Z = 2147483645

/** Shortest gap between two re-measure passes, in ms. */
const RESCAN_THROTTLE_MS = 160

/** Smallest card that may carry a trigger; below this the mark is noise. */
const MIN_CARD_PX = 96

/**
 * Visual gap between the mark and its toolbar, in CSS px.
 *
 * The two are separate boxes: the toolbar is absolutely positioned, so the
 * entry's own box stops at the mark and this gap belongs to neither of them.
 * A pointer walking into it therefore *leaves* the entry — which is what used to
 * shut the toolbar just as the user reached for it. It is kept as a visual gap
 * and covered by {@link TOOLBAR_BRIDGE_PX}.
 */
const TOOLBAR_GAP_PX = 6

/**
 * Width of the invisible bridge laid across {@link TOOLBAR_GAP_PX}, in px.
 *
 * Wide enough to overlap the mark: while the toolbar animates open it is scaled
 * down about its own centre, which pulls its inner edge a couple of pixels away
 * from the mark. A bridge that only spanned the gap exactly would detach from
 * the mark for the length of that animation.
 */
const TOOLBAR_BRIDGE_PX = 10

/**
 * How long the toolbar survives the pointer leaving the entry, in ms.
 *
 * A fast diagonal move can cross the whole entry between two pointer samples,
 * so a leave is treated as intent rather than as fact: a pointer that reaches
 * the toolbar inside this window cancels the close instead of finding it shut.
 * Matches the hover capsule's own fold-back grace, for one feel across surfaces.
 */
const TOOLBAR_CLOSE_GRACE_MS = 220

/**
 * Work-card selectors per host.
 *
 * Read from the platform's own `data-e2e` hooks rather than from class names:
 * the classes are build-hashed and change between deploys, while `data-e2e` is
 * the attribute the site's own tests depend on.
 */
export const WORK_CARD_SELECTORS: Readonly<Record<string, string>> = {
  'tiktok.com': [
    // Profile grid.
    '[data-e2e="user-post-item"]',
    // Search results. The site names these differently from the profile grid —
    // `search_top-item`, not `search-card-container` — and the card marks were
    // silently absent on the page until this list carried the real hook.
    '[data-e2e="search_top-item"]',
    // Explore grid, likewise its own name.
    '[data-e2e="explore-item"]',
    // Feed cards. The feed is gated off for this surface, so this entry exists
    // only so a future rule change does not need a second edit here.
    '[data-e2e="recommend-list-item-container"]',
  ].join(', '),
}

/** The card selector for a host, or `null` when the host has no grid rule. */
export function workCardSelectorFor(host: string): string | null {
  const normalized = host.toLowerCase()
  for (const [domain, selector] of Object.entries(WORK_CARD_SELECTORS)) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) return selector
  }
  return null
}

/** One mounted mark, with the card it belongs to. */
interface TriggerEntry {
  readonly card: Element
  readonly host: HTMLElement
  readonly trigger: HTMLButtonElement
  readonly toolbar: HTMLElement
  /** Whether the pointer is on the card itself. */
  cardHovered: boolean
  /** Whether the mark's toolbar is open. */
  open: boolean
  /** Pending close, so crossing the gap does not shut the toolbar. */
  closeTimer: number | null
  readonly listeners: Array<() => void>
}

/** The live trigger layer. */
export interface MediaTriggerHandle {
  /** Re-measure every card and move its mark. */
  reposition(): void
  /** How many marks are currently mounted; used by tests and diagnostics. */
  size(): number
  /** Release every listener and remove the layer. */
  dispose(): void
}

/** Whether a card's asset is a picture or a moving one. */
function kindOf(element: Element): MediaKind {
  return element instanceof HTMLVideoElement ? 'video' : 'image'
}

/** A payload for one card, or `null` when the card holds nothing to act on. */
function payloadFor(card: Element, doc: Document): HoveredMedia | null {
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/video/"], a[href*="/photo/"]')
  const media = card.querySelector<HTMLImageElement>('img') ?? card.querySelector<HTMLVideoElement>('video')
  if (media === null) return null

  const src = media instanceof HTMLImageElement ? media.src : media.poster
  if (!src) return null
  const box = media.getBoundingClientRect()
  const pageUrl = link?.href ?? doc.location.href

  return {
    id: `${kindOf(media)}:${pageUrl}`.slice(0, 512),
    type: kindOf(media),
    src,
    previewSrc: src,
    pageUrl,
    pageTitle: doc.title,
    width: Math.round(box.width),
    height: Math.round(box.height),
    naturalWidth: media instanceof HTMLImageElement ? media.naturalWidth : 0,
    naturalHeight: media instanceof HTMLImageElement ? media.naturalHeight : 0,
    alt: (media.getAttribute('alt') ?? '').slice(0, 200),
    capturedAt: Date.now(),
  }
}

/**
 * The shadow layer's stylesheet.
 *
 * `all: initial` on the host is what keeps a page's own rules — including a
 * `button { … }` reset TikTok ships — from reaching the mark.
 */
function stylesheet(size: number, corner: string): string {
  const side = resolveToolbarSide(corner as never)
  const horizontal = side.horizontal === 'left'
    ? `right: calc(100% + ${TOOLBAR_GAP_PX}px);`
    : `left: calc(100% + ${TOOLBAR_GAP_PX}px);`
  // The bridge covers the gap on whichever side of the toolbar faces the mark:
  // a toolbar opening leftwards reaches back to the right, and vice versa.
  const bridge = side.horizontal === 'left' ? 'left: 100%;' : 'right: 100%;'
  return `
  :host { all: initial; }
  .omt-layer { position: fixed; inset: 0; pointer-events: none; z-index: ${HOST_Z}; }
  .omt-entry { position: absolute; pointer-events: none; }
  .omt-trigger {
    width: ${size}px;
    height: ${size}px;
    padding: 0;
    margin: 0;
    border: 0;
    border-radius: ${Math.round(size / 3)}px;
    background: rgba(30, 32, 38, 0.95);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255, 255, 255, 0.07);
    color: #b8b7ff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.88);
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease;
    -webkit-appearance: none;
    appearance: none;
  }
  .omt-entry.is-revealed .omt-trigger {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
  .omt-trigger:focus-visible {
    opacity: 1;
    transform: none;
    pointer-events: auto;
    outline: 2px solid rgba(255, 255, 255, 0.9);
    outline-offset: 2px;
  }
  .omt-trigger svg { width: ${Math.round(size * 0.55)}px; height: ${Math.round(size * 0.55)}px; fill: currentColor; pointer-events: none; }
  .omt-toolbar {
    position: absolute;
    top: 50%;
    ${horizontal}
    transform: translateY(-50%) scale(0.94);
    display: flex;
    flex-direction: row;
    gap: 2px;
    padding: 4px;
    border-radius: 12px;
    background: rgba(30, 32, 38, 0.95);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.07);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 150ms ease, transform 150ms ease, visibility 0s linear 150ms;
  }
  .omt-entry.is-open .omt-toolbar {
    opacity: 1;
    visibility: visible;
    transform: translateY(-50%) scale(1);
    pointer-events: auto;
    transition-delay: 0s;
  }
  /* The bridge makes the gap between mark and toolbar part of the toolbar for
     hit-testing, so walking from one to the other never leaves the entry.
     It inherits the toolbar's own pointer-events, so it is inert while shut. */
  .omt-toolbar::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: ${TOOLBAR_BRIDGE_PX}px;
    ${bridge}
  }
  .omt-action {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }
  .omt-action:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
  .omt-action:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.9); outline-offset: -2px; }
  .omt-action svg { width: 15px; height: 15px; }
  @media (prefers-reduced-motion: reduce) {
    .omt-trigger, .omt-toolbar { transition: none; }
  }
  `
}

/** The three action marks, drawn as vectors rather than glyphs. */
const ACTION_ICON = {
  inspiration:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M9 18h6"/><path d="M10 21.5h4"/>'
    + '<path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.77c.5.36.8.94.8 1.55V18h6v-2.18c0-.61.3-1.19.8-1.55A6.5 6.5 0 0 0 12 2.5Z"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/>'
    + '<path d="M5.5 15H5A1.5 1.5 0 0 1 3.5 13.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/></svg>',
  attach:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M20.5 12.25v8.25h-5.6"/><path d="M14.9 20.5v-5.2h5.6"/>'
    + '<path d="M20.5 12.25a8.5 8.5 0 0 0-4.06-7.29"/><path d="M12 3.75a8.5 8.5 0 1 0 4.44 15.75"/></svg>',
} as const

/** The OmniMux ghost on the shared 24-unit grid, solid rather than outlined. */
const BRAND_GHOST =
  '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" stroke="none" aria-hidden="true">'
  + '<path d="M11.6666 0.0318c-0.3531 0.1143 -0.4928 0.4573 -0.3938 0.9653c0.1626 0.8155 -0.0813 1.5877 -0.6757 2.'
  + '1618c-0.315 0.3023 -0.6325 0.4852 -1.448 0.8383c-1.697 0.7316 -2.8808 1.5979 -3.869 2.835c-0.9806 1.'
  + '2219 -1.6233 2.6775 -1.8951 4.2907c-0.1067 0.6427 -0.1372 1.0924 -0.1194 1.8494c0.0178 0.8536 0.0457'
  + ' 1.0644 0.348 2.6953c0.2591 1.3972 0.2185 2.4845 -0.1219 3.2085c-0.1575 0.3379 -0.3023 0.5386 -0.652'
  + '9 0.9069c-0.3226 0.3404 -0.4623 0.5208 -0.5716 0.7367c-0.2871 0.5614 -0.2108 1.1559 0.2032 1.608c0.1'
  + '956 0.2134 0.4141 0.3556 0.6732 0.442c0.1753 0.0584 0.2464 0.0686 0.5208 0.0686c0.4725 0.0025 0.63 -'
  + '0.0508 1.2854 -0.4319c0.3861 -0.2236 0.5284 -0.2718 0.7977 -0.2744c0.1905 -0.0025 0.2312 0.0076 0.35'
  + '56 0.0711c0.2032 0.1067 0.4192 0.3429 0.6071 0.6656c0.4649 0.7977 0.7316 1.0593 1.2676 1.2499c0.1753'
  + ' 0.061 0.2312 0.0686 0.5386 0.0686c0.3709 -0.0025 0.4979 -0.0279 0.8078 -0.1677c0.282 -0.127 0.5157 '
  + '-0.3048 0.9349 -0.7113c0.4395 -0.4242 0.63 -0.5767 0.9196 -0.7189c0.4801 -0.2413 1.0669 -0.2591 1.57'
  + '25 -0.0483c0.2794 0.1194 0.5284 0.3074 0.9857 0.7443c0.4573 0.4369 0.7291 0.6376 1.0263 0.7621c0.386'
  + '1 0.1575 0.8459 0.1981 1.1965 0.0991c0.5513 -0.1524 0.8764 -0.4598 1.3743 -1.3032c0.1981 -0.3379 0.3'
  + '963 -0.5487 0.597 -0.6427c0.127 -0.0584 0.1829 -0.0686 0.3658 -0.0686c0.2591 0.0025 0.3887 0.0457 0.'
  + '7367 0.254c0.7367 0.4395 1.1813 0.5462 1.7249 0.4166c0.2921 -0.0711 0.4903 -0.1804 0.7011 -0.3938c0.'
  + '3633 -0.3633 0.5132 -0.8459 0.409 -1.3286c-0.0788 -0.3734 -0.2236 -0.6021 -0.6961 -1.1025c-0.1677 -0'
  + '.1778 -0.3582 -0.3963 -0.4217 -0.4877c-0.1702 -0.2363 -0.3379 -0.6097 -0.4293 -0.9501c-0.0788 -0.297'
  + '2 -0.0788 -0.2998 -0.0788 -0.9704c-0.0025 -0.7469 0.0229 -1.0111 0.1778 -1.8164c0.094 -0.4903 0.2134'
  + ' -1.2499 0.2693 -1.702c0.0203 -0.1804 0.033 -0.5792 0.033 -1.1305c-0.0025 -0.9044 -0.0152 -1.0695 -0'
  + '.155 -1.8291c-0.4928 -2.6979 -2.106 -4.974 -4.4532 -6.2899c-0.5843 -0.3277 -0.6808 -0.4623 -0.7926 -'
  + '1.1203c-0.0737 -0.4344 -0.1524 -0.7062 -0.3023 -1.0187c-0.5055 -1.0593 -1.5471 -2.0323 -2.5531 -2.38'
  + '03c-0.249 -0.0864 -0.6198 -0.1092 -0.8002 -0.0508ZM7.4242 11.5396A0.9526 0.9526 0 0 1 9.3295 11.5396'
  + 'L9.3295 14.0037A0.9526 0.9526 0 0 1 7.4242 14.0037ZM14.6388 11.5396A0.9526 0.9526 0 0 1 16.5441 11.5'
  + '396L16.5441 14.0037A0.9526 0.9526 0 0 1 14.6388 14.0037Z"/></svg>'

/**
 * Mount the media trigger for a page, if its allowance grants one.
 *
 * Idempotent per document: a re-injected content script disposes the previous
 * layer first, so cards never accumulate marks.
 *
 * `facts` may be a provider rather than a value. TikTok rewrites its address
 * without a navigation event, so a page that was a profile grid a moment ago is
 * the For You feed now; re-reading the facts on every scan is what keeps the
 * marks on the pages that asked for them and off the ones that did not.
 *
 * @param doc the document to mount into
 * @param facts the page's platform and page type, or a provider for them
 * @param host the page's hostname; defaults to the live location
 */
export function initMediaTrigger(
  doc: Document = document,
  facts: SurfacePageFacts | (() => SurfacePageFacts),
  host: string = doc.location.hostname,
): MediaTriggerHandle | null {
  const readFacts = typeof facts === 'function' ? facts : (): SurfacePageFacts => facts
  const descriptor = mediaTriggerFor(readFacts())
  if (descriptor === null) return null
  const selector = workCardSelectorFor(host)
  if (selector === null) return null
  if (doc.defaultView === null) return null

  const sizePx = resolveSurfaceSizePx(descriptor.size, MEDIA_TRIGGER_SIZE_PX)
  const corner = descriptor.placement.strategy === 'container-corner' ? descriptor.placement.corner : 'top-right'

  const hostEl = doc.createElement('div')
  hostEl.id = MEDIA_TRIGGER_HOST_ID
  hostEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;'
  const shadow = hostEl.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${stylesheet(sizePx, corner)}</style><div class="omt-layer"></div>`
  const layer = shadow.querySelector('.omt-layer') as HTMLElement
  doc.documentElement.appendChild(hostEl)

  const bridge = new MediaActionBridge(browserTransport(() => hoverCopy()))
  const entries = new Map<Element, TriggerEntry>()
  let disposed = false
  let lastScan = 0
  let timer: number | null = null

  function buildEntry(card: Element): TriggerEntry {
    const wrapper = doc.createElement('div')
    wrapper.className = 'omt-entry'
    const trigger = doc.createElement('button')
    trigger.type = 'button'
    trigger.className = 'omt-trigger'
    trigger.setAttribute('aria-label', 'OmniMux 快捷操作')
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.innerHTML = BRAND_GHOST
    const toolbar = doc.createElement('div')
    toolbar.className = 'omt-toolbar'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', 'OmniMux')
    toolbar.innerHTML = (['inspiration', 'copy', 'attach'] as const).map((action) =>
      `<button type="button" class="omt-action" data-action="${action}" title="${ACTION_LABEL[action]}" aria-label="${ACTION_LABEL[action]}">${ACTION_ICON[action]}</button>`,
    ).join('')
    wrapper.append(trigger, toolbar)
    layer.appendChild(wrapper)

    const entry: TriggerEntry = {
      card,
      host: wrapper,
      trigger,
      toolbar,
      cardHovered: false,
      open: false,
      closeTimer: null,
      listeners: [],
    }
    const entryPair = entry

    const onCardEnter = (): void => {
      entryPair.cardHovered = true
      render(entryPair)
    }
    const onCardLeave = (): void => {
      // The mark stays while the toolbar is open: the toolbar sits outside the
      // card, so leaving the card through it is one gesture, not two.
      entryPair.cardHovered = false
      render(entryPair)
    }
    const onEntryEnter = (): void => {
      cancelClose(entryPair)
      openToolbar(entryPair)
    }
    const onEntryLeave = (): void => closeToolbarSoon(entryPair)
    const onFocusIn = (): void => {
      cancelClose(entryPair)
      openToolbar(entryPair)
    }
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget
      if (next instanceof Node && entryPair.host.contains(next)) return
      closeToolbar(entryPair)
    }
    const onToolbarClick = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const action = target.closest('.omt-action')?.getAttribute('data-action')
      if (action === null || action === undefined) return
      event.stopPropagation()
      event.preventDefault()
      void runAction(entryPair, action)
    }

    card.addEventListener('pointerenter', onCardEnter)
    card.addEventListener('pointerleave', onCardLeave)
    wrapper.addEventListener('pointerenter', onEntryEnter)
    wrapper.addEventListener('pointerleave', onEntryLeave)
    wrapper.addEventListener('focusin', onFocusIn)
    wrapper.addEventListener('focusout', onFocusOut)
    wrapper.addEventListener('click', onToolbarClick)
    entry.listeners.push(
      () => card.removeEventListener('pointerenter', onCardEnter),
      () => card.removeEventListener('pointerleave', onCardLeave),
      () => wrapper.removeEventListener('pointerenter', onEntryEnter),
      () => wrapper.removeEventListener('pointerleave', onEntryLeave),
      () => wrapper.removeEventListener('focusin', onFocusIn),
      () => wrapper.removeEventListener('focusout', onFocusOut),
      () => wrapper.removeEventListener('click', onToolbarClick),
    )
    return entry
  }

  async function runAction(entry: TriggerEntry, action: string): Promise<void> {
    const payload = payloadFor(entry.card, doc)
    if (payload === null) return
    if (action === 'inspiration') await bridge.saveToInspiration(payload)
    else if (action === 'copy') await bridge.copyToClipboard(payload)
    else if (action === 'attach') await bridge.attachToConversation(payload)
    closeToolbar(entry)
  }

  function placeEntry(entry: TriggerEntry): void {
    const cardBox = entry.card.getBoundingClientRect()
    if (cardBox.width < MIN_CARD_PX || cardBox.height < MIN_CARD_PX) {
      entry.host.style.display = 'none'
      return
    }
    const offset = resolveContainerCornerOffset(
      corner,
      { width: cardBox.width, height: cardBox.height },
      sizePx,
    )
    entry.host.style.display = ''
    entry.host.style.left = `${Math.round(cardBox.left + offset.left)}px`
    entry.host.style.top = `${Math.round(cardBox.top + offset.top)}px`
  }

  function clearEntries(): void {
    for (const entry of entries.values()) {
      cancelClose(entry)
      for (const off of entry.listeners) off()
      entry.host.remove()
    }
    entries.clear()
  }

  function scan(): void {
    // The gate is re-read here rather than at mount: an in-page navigation can
    // turn a grid into a feed, and the marks must leave with it.
    if (mediaTriggerFor(readFacts()) === null) {
      clearEntries()
      return
    }
    const cards = [...doc.querySelectorAll(selector as string)]
    const live = new Set(cards)
    for (const [card, entry] of entries) {
      if (live.has(card) && card.isConnected) continue
      cancelClose(entry)
      for (const off of entry.listeners) off()
      entry.host.remove()
      entries.delete(card)
    }
    for (const card of cards) {
      if (entries.has(card)) continue
      entries.set(card, buildEntry(card))
    }
    for (const entry of entries.values()) placeEntry(entry)
  }

  function pass(force: boolean): void {
    if (disposed) return
    const wait = RESCAN_THROTTLE_MS - (Date.now() - lastScan)
    if (force || wait <= 0) {
      lastScan = Date.now()
      scan()
      return
    }
    if (timer !== null) return
    timer = doc.defaultView!.setTimeout(() => {
      timer = null
      lastScan = Date.now()
      scan()
    }, wait)
  }

  const onScrollOrResize = (): void => pass(false)
  const observer = new MutationObserver(() => pass(false))
  observer.observe(doc.documentElement, { childList: true, subtree: true })
  doc.defaultView.addEventListener('scroll', onScrollOrResize, { passive: true })
  doc.defaultView.addEventListener('resize', onScrollOrResize)

  scan()

  return {
    reposition: () => pass(true),
    size: () => entries.size,
    dispose(): void {
      disposed = true
      if (timer !== null) doc.defaultView!.clearTimeout(timer)
      observer.disconnect()
      doc.defaultView!.removeEventListener('scroll', onScrollOrResize)
      doc.defaultView!.removeEventListener('resize', onScrollOrResize)
      clearEntries()
      hostEl.remove()
    },
  }
}

/** The label each action carries, in the panel's language. */
const ACTION_LABEL: Readonly<Record<'inspiration' | 'copy' | 'attach', string>> = {
  inspiration: '加入灵感库',
  copy: '复制',
  attach: '加入对话',
}

/** Reveal or hide one mark from the two facts that drive it; transitions live in CSS. */
function render(entry: TriggerEntry): void {
  // Two independent facts, one visible result: the pointer is on the work, or it
  // is on the buttons the work offers. Keeping them apart is what lets the
  // toolbar shut while the mark stays, on the way back to the card.
  const revealed = entry.cardHovered || entry.open
  entry.host.classList.toggle('is-revealed', revealed)
  entry.host.classList.toggle('is-open', entry.open)
}

/** Open one mark's toolbar. */
function openToolbar(entry: TriggerEntry): void {
  entry.open = true
  render(entry)
}

/** Shut one mark's toolbar now, dropping any pending close. */
function closeToolbar(entry: TriggerEntry): void {
  cancelClose(entry)
  entry.open = false
  render(entry)
}

/**
 * Shut the toolbar once the pointer has been away from the entry for the grace
 * period, unless it comes back first.
 *
 * The mark and the toolbar are two boxes with a gap between them. The bridge in
 * the stylesheet covers that gap, but a fast move can still cross the whole
 * entry between two pointer samples, and a leave that arrives a few pixels early
 * must not be the end of the gesture: within the window the pointer that reaches
 * the toolbar cancels this instead of finding the toolbar already shut.
 */
function closeToolbarSoon(entry: TriggerEntry): void {
  cancelClose(entry)
  if (!entry.open) {
    render(entry)
    return
  }
  const view = entry.host.ownerDocument.defaultView
  if (view === null) {
    closeToolbar(entry)
    return
  }
  entry.closeTimer = view.setTimeout(() => {
    entry.closeTimer = null
    entry.open = false
    render(entry)
  }, TOOLBAR_CLOSE_GRACE_MS)
}

/** Drop a pending close, if one is waiting. */
function cancelClose(entry: TriggerEntry): void {
  if (entry.closeTimer === null) return
  entry.host.ownerDocument.defaultView?.clearTimeout(entry.closeTimer)
  entry.closeTimer = null
}

/** The descriptor a page's media trigger resolves to, or `null`. */
export function mediaTriggerDescriptor(facts: SurfacePageFacts): SurfaceDescriptor | null {
  return mediaTriggerFor(facts)
}
