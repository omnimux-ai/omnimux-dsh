/**
 * Overlay root: the single shadow host that owns the capsule and the tooltip.
 *
 * Structural contract (the reason this feature works at all):
 *
 * ```
 * #omnimux-media-hover-root            (host: fixed, zero-size, page-level)
 *   └─ layer (shadow root, .omnimux-media-hover-layer)
 *        ├─ .omnimux-capsule-bar       ← position: fixed
 *        └─ .white-tooltip             ← position: fixed, SIBLING of the capsule
 * ```
 *
 * Both are direct children of the shadow root and neither is nested inside the
 * media element, so a card with `overflow: hidden` cannot clip the tooltip. The
 * capsule follows its media on scroll/resize and hides when the media leaves the
 * viewport; the tooltip follows the icon it describes.
 *
 * @module
 */

import { MediaActionBridge, browserTransport } from './actions.ts'
import { MediaCapsule } from './capsule.ts'
import { hoverCopy, type HoverCopy } from './copy.ts'
import { MediaDetector } from './detector.ts'
import { CAPSULE_SPEC, OVERLAY_Z, TIMING, computeCapsuleGeometry } from './messages.ts'
import { OVERLAY_STYLES } from './styles.ts'
import { MediaTooltip, readViewportBox } from './tooltip.ts'
import type { ActionOutcome, AnchorRect, HoverCandidate, HoveredMedia, MediaActionKind, OverlayState } from './types.ts'

/** Id of the host element; also how a duplicate injection is detected. */
export const MEDIA_OVERLAY_HOST_ID = 'omnimux-media-hover-root'

/** Icon slots that own a tooltip. */
const TOOLTIP_ACTIONS: readonly MediaActionKind[] = ['inspiration', 'copy', 'attach']

/**
 * Mounts and drives the hover overlay.
 *
 * Timing lives here rather than in the capsule: entering is debounced, leaving
 * keeps a grace period so the pointer can travel from the media onto the
 * capsule, and a scroll follows the media instead of dismissing the capsule.
 */
export class MediaOverlay {
  private readonly doc: Document
  private readonly copy: HoverCopy
  private readonly bridge: MediaActionBridge

  private host: HTMLElement | null = null
  private shadow: ShadowRoot | null = null
  private capsule: MediaCapsule | null = null
  private tooltip: MediaTooltip | null = null
  private detector: MediaDetector | null = null

  private state: OverlayState = {
    phase: 'idle',
    activeId: '',
    busyAction: null,
    saved: false,
    copied: false,
    attached: false,
  }
  private payload: HoveredMedia | null = null
  private anchorElement: Element | null = null

  private enterTimer: number | null = null
  private leaveTimer: number | null = null
  private collapseTimer: number | null = null
  private flashTimer: number | null = null
  private dismissTimer: number | null = null
  private frame: number | null = null
  private activeIcon: MediaActionKind | null = null

  private readonly onScroll = (): void => { this.scheduleReposition() }
  private readonly onWindowResize = (): void => { this.scheduleReposition(true) }

  constructor(doc: Document = document) {
    this.doc = doc
    this.copy = hoverCopy()
    this.bridge = new MediaActionBridge(browserTransport(() => this.copy))
  }

  /** Builds the shadow tree and starts listening. Idempotent per instance. */
  mount(): void {
    if (this.host !== null) return
    const target = this.doc.documentElement
    if (target === null) return

    const host = this.doc.createElement('div')
    host.id = MEDIA_OVERLAY_HOST_ID
    host.style.position = 'fixed'
    host.style.top = '0'
    host.style.left = '0'
    host.style.width = '0'
    host.style.height = '0'
    host.style.overflow = 'visible'
    host.style.pointerEvents = 'none'
    host.style.zIndex = String(OVERLAY_Z.host)
    target.appendChild(host)

    const layer = this.doc.createElement('div')
    layer.className = 'omnimux-media-hover-layer'

    this.shadow = host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `<style>${OVERLAY_STYLES}</style>`

    this.capsule = MediaCapsule.create(this.copy)
    this.tooltip = MediaTooltip.create()

    // Siblings in this order: the capsule first, the tooltip painted over it.
    layer.appendChild(this.capsule.element)
    layer.appendChild(this.tooltip.element)
    this.shadow.appendChild(layer)

    this.host = host
    this.bindCapsule()
    this.bindDocument()

    this.detector = new MediaDetector({
      onCandidate: (candidate) => { this.handleCandidate(candidate) },
      onInvalidate: (reason) => { this.handleInvalidate(reason) },
    })
    this.detector.start()
  }

  /** Tears everything down: listeners, timers, nodes and pending waits. */
  dispose(): void {
    this.clearEnterTimer()
    this.clearLeaveTimer()
    this.clearCollapseTimer()
    this.clearFlashTimer()
    this.clearDismissTimer()
    this.cancelFrame()

    this.detector?.dispose()
    this.detector = null

    this.doc.removeEventListener('pointerover', this.onPointerOver, true)
    this.doc.removeEventListener('pointermove', this.onPointerMoveTarget, true)
    this.doc.removeEventListener('pointerout', this.onPointerOut, true)
    window.removeEventListener('scroll', this.onScroll, true)
    window.removeEventListener('resize', this.onWindowResize)

    this.capsule?.destroy()
    this.tooltip?.destroy()
    this.capsule = null
    this.tooltip = null
    this.shadow = null
    this.host?.remove()
    this.host = null
    this.payload = null
    this.anchorElement = null
    this.state.phase = 'idle'
  }

  // ---- Candidate lifecycle -----------------------------------------------

  private handleCandidate(candidate: HoverCandidate): void {
    this.cancelLeave()

    // A candidate arriving while the user is inside the capsule must not yank
    // the capsule away from their pointer.
    if (this.state.phase === 'interactive' && this.payload !== null) {
      this.repositionNow()
      return
    }

    if (this.payload !== null && this.payload.id === candidate.payload.id) {
      this.repositionNow()
      return
    }

    this.hideNow(true)
    this.state.phase = 'pending'
    this.anchorElement = candidate.element

    this.clearEnterTimer()
    this.enterTimer = this.setTimer(() => {
      this.enterTimer = null
      // The pointer may have moved on during the debounce; re-resolve first.
      this.detector?.refresh()
      this.showNow(candidate)
    }, TIMING.enterDebounce)
  }

  private handleInvalidate(reason: 'scroll' | 'resize' | 'detach'): void {
    if (reason === 'detach') {
      this.hideNow(true)
      return
    }
    this.scheduleReposition()
  }

  private showNow(candidate: HoverCandidate): void {
    const capsule = this.capsule
    if (capsule === null) return
    if (!candidate.element.isConnected) return
    this.payload = candidate.payload
    this.anchorElement = candidate.element
    capsule.render(candidate.payload)
    this.state = { ...this.state, ...capsule.snapshot(), phase: 'shown' }
    this.repositionNow()
    capsule.show(this.capsuleAlignment(candidate.element))
  }

  private hideNow(clear: boolean): void {
    this.clearEnterTimer()
    this.clearCollapseTimer()
    this.clearDismissTimer()
    this.capsule?.hide()
    this.tooltip?.hide()
    this.activeIcon = null
    this.detector?.clearCandidate()
    this.state.phase = 'idle'
    if (clear) {
      this.payload = null
      this.anchorElement = null
    }
  }

  // ---- Pointer plumbing --------------------------------------------------

  private bindDocument(): void {
    // Capture-phase target tracking is what keeps the capsule interactive: the
    // pointer must be able to leave the media and land on the capsule without
    // the detector clearing its candidate first.
    this.doc.addEventListener('pointerover', this.onPointerOver, true)
    this.doc.addEventListener('pointermove', this.onPointerMoveTarget, true)
    this.doc.addEventListener('pointerout', this.onPointerOut, true)
    window.addEventListener('scroll', this.onScroll, { passive: true, capture: true })
    window.addEventListener('resize', this.onWindowResize, { passive: true })
  }

  private readonly onPointerOver = (event: Event): void => {
    if (this.isInsideOverlay(event.target)) this.cancelLeave()
  }

  private readonly onPointerMoveTarget = (event: Event): void => {
    if (this.isInsideOverlay(event.target)) {
      this.cancelLeave()
      this.state.phase = 'interactive'
      this.capsule?.setInteractive(true)
      return
    }
    if (this.state.phase === 'interactive') {
      this.state.phase = 'shown'
      this.capsule?.setInteractive(false)
    }
  }

  private readonly onPointerOut = (event: Event): void => {
    const related = (event as PointerEvent).relatedTarget
    if (this.isInsideOverlay(related)) return
    if (this.state.phase !== 'shown' && this.state.phase !== 'interactive') return

    this.cancelLeave()
    this.leaveTimer = this.setTimer(() => {
      this.leaveTimer = null
      if (this.isInsideOverlay(this.hoveredElement())) return
      this.hideNow(true)
    }, TIMING.leaveGrace)
  }

  private hoveredElement(): Element | null {
    try {
      return this.doc.querySelector(':hover')
    } catch {
      return null
    }
  }

  /** Whether a node belongs to this overlay (shadow content included). */
  private isInsideOverlay(node: unknown): boolean {
    const host = this.host
    if (host === null || !(node instanceof Node)) return false
    let cursor: Node | null = node
    for (let depth = 0; cursor !== null && depth < 64; depth += 1) {
      if (cursor === host) return true
      cursor = cursor.parentNode ?? (cursor instanceof ShadowRoot ? cursor.host : null)
    }
    if (this.shadow !== null && this.shadow.contains(node)) return true
    return false
  }

  // ---- Capsule interaction -----------------------------------------------

  private bindCapsule(): void {
    const capsule = this.capsule
    if (capsule === null) return

    capsule.onAction(({ action }) => { void this.runAction(action) })

    // Two-stage hover. Stage one is whatever the pointer rested on; reaching the
    // capsule (with the pointer or with Tab) is what opens stage two, and leaving
    // it folds back after a buffer so the trip between an icon and the brand
    // circle never flickers.
    capsule.element.addEventListener('pointerenter', this.onCapsuleEnter)
    capsule.element.addEventListener('pointerleave', this.onCapsuleLeave)
    capsule.element.addEventListener('focusin', this.onCapsuleEnter)
    capsule.element.addEventListener('focusout', this.onCapsuleLeave)

    for (const action of TOOLTIP_ACTIONS) {
      const button = capsule.buttonElement(action)
      if (button === null) continue
      button.addEventListener('pointerenter', () => { this.showHint(action) })
      button.addEventListener('focus', () => { this.showHint(action) })
      button.addEventListener('pointerleave', () => { this.clearHint(action) })
      button.addEventListener('blur', () => { this.clearHint(action) })
    }
  }

  /** Stage two: the pointer or the keyboard reached the capsule. */
  private expandCapsule(): void {
    this.clearCollapseTimer()
    this.capsule?.expand()
    if (this.state.phase === 'shown') this.state.phase = 'interactive'
  }

  /** Folds the capsule back once the pointer has genuinely left it. */
  private scheduleCollapse(): void {
    this.clearCollapseTimer()
    this.collapseTimer = this.setTimer(() => {
      this.collapseTimer = null
      this.collapseCapsule()
    }, TIMING.collapseGrace)
  }

  private collapseCapsule(): void {
    const capsule = this.capsule
    if (capsule === null) return
    capsule.collapse()
    // Stage one carries no tooltip: a hint left over from an icon would have
    // nothing to point at.
    this.activeIcon = null
    this.tooltip?.hide()
    if (this.state.phase === 'interactive') this.state.phase = 'shown'
  }

  private readonly onCapsuleEnter = (): void => {
    this.expandCapsule()
  }

  private readonly onCapsuleLeave = (): void => {
    this.scheduleCollapse()
  }

  private showHint(action: MediaActionKind): void {
    this.activeIcon = action
    this.showMessage(this.copy.hint[action], action)
  }

  private clearHint(action: MediaActionKind): void {
    if (this.activeIcon !== action) return
    this.activeIcon = null
    this.tooltip?.hide()
  }

  private showMessage(text: string, action: MediaActionKind): void {
    const button = this.capsule?.buttonElement(action)
    if (button === null || button === undefined) return
    this.tooltip?.show(text, rectOf(button), readViewportBox())
  }

  private async runAction(action: MediaActionKind): Promise<void> {
    const payload = this.payload
    if (payload === null || this.state.busyAction !== null) return

    this.setBusy(action, true)
    let outcome: ActionOutcome
    try {
      outcome = await this.dispatch(action, payload)
    } catch {
      outcome = { ok: false, status: 'failed', message: this.copy.failed }
    }
    this.setBusy(action, false)
    this.applyOutcome(action, outcome)
  }

  private dispatch(action: MediaActionKind, payload: HoveredMedia): Promise<ActionOutcome> {
    switch (action) {
      case 'inspiration':
        return this.bridge.saveToInspiration(payload)
      case 'copy':
        return this.bridge.copyToClipboard(payload)
      case 'attach':
        return this.bridge.attachToConversation(payload)
    }
  }

  private applyOutcome(action: MediaActionKind, outcome: ActionOutcome): void {
    const capsule = this.capsule
    if (capsule === null) return

    this.state.phase = 'shown'
    if (outcome.ok) {
      if (action === 'inspiration') {
        this.state.saved = true
        capsule.setState({ saved: true })
      } else if (action === 'copy') {
        this.state.copied = true
        capsule.setState({ copied: true })
        this.clearFlashTimer()
        this.flashTimer = this.setTimer(() => {
          this.flashTimer = null
          this.state.copied = false
          capsule.setState({ copied: false })
        }, TIMING.copyCheckFlash)
      } else {
        this.state.attached = true
        capsule.setState({ attached: true })
      }
    }

    // An outcome message always replaces the hover hint for both the success and
    // the failure path, then fades on its own so the capsule settles.
    this.activeIcon = action
    this.showMessage(outcome.message, action)
    this.clearDismissTimer()
    this.dismissTimer = this.setTimer(() => {
      this.dismissTimer = null
      this.activeIcon = null
      this.tooltip?.hide()
    }, TIMING.errorDismiss)
  }

  private setBusy(action: MediaActionKind | null, busy: boolean): void {
    const next = busy ? action : null
    this.state.busyAction = next
    this.state.phase = busy ? 'interactive' : 'shown'
    this.capsule?.setState({ busyAction: next })
  }

  // ---- Geometry ----------------------------------------------------------

  private capsuleAlignment(element: Element): 'left' | 'right' {
    const rect = element.getBoundingClientRect()
    // The flip is decided on the EXPANDED width: stage two is the widest the
    // capsule ever gets, and a decision made on the 36px circle would push the
    // row off the right edge as soon as the pointer opened it.
    const capsuleWidth = CAPSULE_SPEC.width
    const available = currentViewportWidth()
    const fitsLeft = rect.left + CAPSULE_SPEC.inset + capsuleWidth <= available - CAPSULE_SPEC.edgeMargin
    return fitsLeft ? 'left' : 'right'
  }

  private scheduleReposition(force = false): void {
    if (this.state.phase === 'idle' || this.host === null || this.payload === null) return
    if (force) {
      this.clearDismissTimer()
      this.activeIcon = null
      this.tooltip?.hide()
    }
    if (this.frame !== null) return
    this.frame = rAF(() => {
      this.frame = null
      this.repositionNow()
    })
  }

  /**
   * Re-measures the media and moves the capsule to its bottom-left corner.
   *
   * Runs on every scroll frame: the anchor is read from the element itself, so
   * the capsule tracks the media instead of drifting with a stale rect.
   */
  private repositionNow(): void {
    const capsule = this.capsule
    const element = this.anchorElement
    if (capsule === null) return
    if (this.payload === null || element === null) return
    if (!element.isConnected) {
      this.hideNow(true)
      return
    }

    const rect = element.getBoundingClientRect()
    const viewport = {
      width: currentViewportWidth(),
      height: currentViewportHeight(),
    }

    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewport.height || rect.left >= viewport.width) {
      this.hideNow(true)
      return
    }

    const box = capsule.element.getBoundingClientRect()
    // Both stages are measured as the expanded row. The circle is drawn inside
    // that footprint, so opening stage two grows into space the geometry already
    // reserved and can never cross the viewport edge.
    const geometry = computeCapsuleGeometry(
      rect,
      {
        width: Math.max(box.width, CAPSULE_SPEC.width),
        height: box.height > 0 ? box.height : CAPSULE_SPEC.height,
      },
      viewport.width,
      viewport.height,
    )
    capsule.element.style.left = `${Math.round(geometry.left)}px`
    capsule.element.style.top = `${Math.round(geometry.top)}px`

    const icon = this.activeIcon
    if (icon !== null) this.showMessage(this.copy.hint[icon], icon)
  }

  private cancelFrame(): void {
    if (this.frame === null) return
    cancelAF(this.frame)
    this.frame = null
  }

  // ---- Timers ------------------------------------------------------------

  private setTimer(handler: () => void, delay: number): number {
    return window.setTimeout(handler, delay)
  }

  private clearEnterTimer(): void {
    if (this.enterTimer === null) return
    window.clearTimeout(this.enterTimer)
    this.enterTimer = null
  }

  private clearLeaveTimer(): void {
    if (this.leaveTimer === null) return
    window.clearTimeout(this.leaveTimer)
    this.leaveTimer = null
  }

  private clearCollapseTimer(): void {
    if (this.collapseTimer === null) return
    window.clearTimeout(this.collapseTimer)
    this.collapseTimer = null
  }

  private clearFlashTimer(): void {
    if (this.flashTimer === null) return
    window.clearTimeout(this.flashTimer)
    this.flashTimer = null
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer === null) return
    window.clearTimeout(this.dismissTimer)
    this.dismissTimer = null
  }

  private cancelLeave(): void {
    this.clearLeaveTimer()
  }
}

/** Bounding rect of an element as the tooltip contract expects it. */
export function rectOf(element: Element): AnchorRect {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function currentViewportWidth(): number {
  if (typeof window === 'undefined') return 1280
  return window.innerWidth || document.documentElement?.clientWidth || 1280
}

function currentViewportHeight(): number {
  if (typeof window === 'undefined') return 800
  return window.innerHeight || document.documentElement?.clientHeight || 800
}

/** `requestAnimationFrame` with a timeout fallback for headless documents. */
function rAF(handler: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(handler)
  return window.setTimeout(handler, 16)
}

function cancelAF(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }
  window.clearTimeout(handle)
}

/** Installs the overlay once per document and returns the live instance. */
export function initMediaHoverOverlay(doc: Document = document): MediaOverlay {
  const overlay = new MediaOverlay(doc)
  overlay.mount()
  return overlay
}
