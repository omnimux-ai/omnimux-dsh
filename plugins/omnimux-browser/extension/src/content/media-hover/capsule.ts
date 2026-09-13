/**
 * The dark frosted capsule that carries the page-media shortcuts.
 *
 * The capsule is a two-stage control, and the DOM mirrors the two stages:
 *
 * ```
 * stage one (collapsed, 32 x 32)     stage two (expanded, 92 x 32)
 *   ( OmniMux brand mark )             [ inspiration ] [ copy ] [ attach ]
 * ```
 *
 * Both stages are mounted at once and absolutely centred inside the pill, and
 * both occupy the same 32px band, so the width animation never reflows a row and
 * the pill never jumps vertically: `is-collapsed` / `is-expanded` swap which
 * of the two layers is visible, and the stylesheet owns the cross-fade. The
 * overlay decides *when* to move between the stages and `actions.ts` performs the
 * work; the capsule only paints state and reports presses.
 *
 * @module
 */

import { CAPSULE_SPEC } from './messages.ts'
import { ICON_BY_ACTION, STATE_ICON, svgIcon, type CapsuleIcon } from './overlay-icons.ts'
import type { CapsuleActionEvent, HoveredMedia, MediaActionKind, OverlayState } from './types.ts'
import type { HoverCopy } from './copy.ts'

/** The three action slots, in capsule order. */
const ACTION_ORDER: readonly MediaActionKind[] = ['inspiration', 'copy', 'attach']

/** Which of the two stages the capsule currently paints. */
export type CapsuleStage = 'collapsed' | 'expanded'

/** Extra icon swap applied while an action is in flight or settled. */
type IconState = 'idle' | 'busy' | 'done' | 'saved' | 'error'

/** Resolves the icon a slot shows for the current overlay state. */
function iconFor(action: MediaActionKind, state: IconState): CapsuleIcon {
  if (action === 'inspiration' && state === 'saved') return 'star'
  if (state === 'done') return STATE_ICON.done
  if (state === 'busy') return STATE_ICON.busy
  if (state === 'error') return ICON_BY_ACTION[action]
  return ICON_BY_ACTION[action]
}

/**
 * The capsule node and its icon state machine.
 *
 * State is kept locally so a repaint never needs the overlay's full state
 * object: `setState` merges a patch and re-derives each icon, `expand` /
 * `collapse` move between the two stages.
 */
export class MediaCapsule {
  /** The `.omnimux-capsule-bar` node; a direct child of the shadow root. */
  readonly element: HTMLDivElement

  private readonly buttons = new Map<MediaActionKind, HTMLButtonElement>()
  /** The stage-one trigger; a direct child of the pill, centred by the stylesheet. */
  private readonly brand: HTMLButtonElement
  /** The stage-two wrapper holding the three action slots. */
  private readonly actions: HTMLDivElement
  private readonly hints: HoverCopy
  private state: OverlayState = {
    phase: 'idle',
    activeId: '',
    busyAction: null,
    saved: false,
    copied: false,
    attached: false,
  }
  private current: CapsuleStage = 'collapsed'
  private actionHandler: ((event: CapsuleActionEvent) => void) | null = null

  private constructor(hints: HoverCopy) {
    this.hints = hints
    this.element = document.createElement('div')
    this.element.className = 'omnimux-capsule-bar'
    this.element.setAttribute('role', 'toolbar')
    this.element.setAttribute('aria-label', hints.brand)
    this.element.setAttribute('aria-orientation', 'horizontal')
    this.brand = this.buildBrand()
    this.actions = document.createElement('div')
    this.actions.className = 'omnimux-capsule-actions'
  }

  /** Creates the capsule with its brand trigger and its three action slots. */
  static create(hints: HoverCopy): MediaCapsule {
    const capsule = new MediaCapsule(hints)
    capsule.buildRow()
    return capsule
  }

  /** Registers the single press handler for all three shortcuts. */
  onAction(handler: (event: CapsuleActionEvent) => void): void {
    this.actionHandler = handler
  }

  /** The node a press event bubbles from, used for tooltip anchoring. */
  buttonElement(action: MediaActionKind): HTMLButtonElement | null {
    return this.buttons.get(action) ?? null
  }

  /** The stage-one trigger node, used by the overlay and by the tests. */
  brandElement(): HTMLButtonElement {
    return this.brand
  }

  /** Which stage is painted right now. */
  get stage(): CapsuleStage {
    return this.current
  }

  /** Whether the capsule is fully painted. */
  get visible(): boolean {
    return this.element.classList.contains('is-visible')
  }

  /** Applies a new payload, resetting per-media action state. */
  render(payload: HoveredMedia): void {
    this.element.setAttribute('data-media-id', payload.id)
    this.element.setAttribute('data-media-kind', payload.type)
    this.state = {
      phase: 'shown',
      activeId: payload.id,
      busyAction: null,
      saved: false,
      copied: false,
      attached: false,
    }
    // Every new media starts at stage one: the brand circle is what the pointer
    // lands on, and the three shortcuts stay out of the way until asked for.
    this.collapse()
    this.paint()
  }

  /** Merges a state patch and repaints the affected icons. */
  setState(patch: Partial<OverlayState>): void {
    this.state = { ...this.state, ...patch }
    this.paint()
  }

  /** The state currently painted, for callers that need to branch on it. */
  snapshot(): OverlayState {
    return { ...this.state }
  }

  /** Marks the capsule as hovered/engaged, which deepens its shadow. */
  setInteractive(interactive: boolean): void {
    this.element.classList.toggle('is-interactive', interactive)
  }

  /** Stage two: widens to the three action icons. Idempotent. */
  expand(): void {
    this.setStage('expanded')
  }

  /** Stage one: folds back to the brand mark alone. Idempotent. */
  collapse(): void {
    this.setStage('collapsed')
  }

  /** Shows the capsule and points the transform origin at the media edge. */
  show(alignment: 'left' | 'right'): void {
    this.element.style.transformOrigin = alignment === 'left' ? 'bottom left' : 'bottom right'
    this.collapse()
    this.element.classList.add('is-visible')
  }

  /** Hides the capsule; the node stays mounted for a cheap re-show. */
  hide(): void {
    this.element.classList.remove('is-visible')
    this.element.classList.remove('is-interactive')
    this.collapse()
  }

  /** Removes the node from the DOM. */
  destroy(): void {
    this.buttons.clear()
    this.element.remove()
  }

  private buildRow(): void {
    this.element.appendChild(this.brand)
    for (const action of ACTION_ORDER) {
      this.actions.appendChild(this.buildButton(action))
    }
    this.element.appendChild(this.actions)
    // The stage contract is written once the row it governs exists.
    this.applyStage()
    this.paint()
  }

  /**
   * Stage one: the brand trigger.
   *
   * It carries no shortcut, so a press does nothing beyond focusing the pill —
   * which is what expands it for a keyboard user and keeps touch from landing on
   * an invisible action.
   */
  private buildBrand(): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'omnimux-capsule-brand'
    button.setAttribute('aria-label', this.hints.brand)
    button.innerHTML = svgIcon('brand', CAPSULE_SPEC.brandIconSize)
    button.addEventListener('pointerdown', swallowEvent)
    button.addEventListener('mousedown', swallowEvent)
    button.addEventListener('contextmenu', swallowEvent)
    button.addEventListener('click', swallowEvent)
    return button
  }

  private buildButton(action: MediaActionKind): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'omnimux-capsule-icon'
    button.setAttribute('data-action', action)
    button.setAttribute('aria-label', this.hints.action[action])
    button.innerHTML = svgIcon(ICON_BY_ACTION[action], CAPSULE_SPEC.iconGlyphSize)

    // The page must never see these presses: no navigation, no card selection,
    // no page-level click handler.
    button.addEventListener('pointerdown', swallowEvent)
    button.addEventListener('mousedown', swallowEvent)
    button.addEventListener('contextmenu', swallowEvent)
    button.addEventListener('click', (event) => {
      swallowEvent(event)
      this.actionHandler?.({ action, element: button })
    })

    this.buttons.set(action, button)
    return button
  }

  private setStage(stage: CapsuleStage): void {
    if (this.current === stage) return
    this.current = stage
    this.applyStage()
  }

  /** Writes the class/ARIA contract the stylesheet and assistive tech read. */
  private applyStage(): void {
    const expanded = this.current === 'expanded'
    this.element.classList.toggle('is-expanded', expanded)
    this.element.classList.toggle('is-collapsed', !expanded)
    this.element.setAttribute('aria-expanded', String(expanded))

    // Stage two is not merely invisible while it is off screen. The stylesheet
    // owns `visibility` (it follows the fold-back fade), so the attributes below
    // are what take the row off the pointer path, out of the tab order and off
    // the accessibility tree from the first frame of the fold-back.
    this.actions.setAttribute('aria-hidden', String(!expanded))
    for (const button of this.buttons.values()) {
      if (expanded) button.removeAttribute('tabindex')
      else button.setAttribute('tabindex', '-1')
    }

    // A fold-back never strands focus on a row that stopped being a tab stop:
    // while the pill is still on screen stage one takes the focus, which is the
    // keyboard's way back into stage two.
    if (!expanded && this.visible && this.actions.contains(document.activeElement)) {
      this.brand.focus()
    }
  }

  private paint(): void {
    for (const action of ACTION_ORDER) {
      const button = this.buttons.get(action)
      if (button === null || button === undefined) continue
      const iconState = this.iconState(action)
      const markup = svgIcon(iconFor(action, iconState), CAPSULE_SPEC.iconGlyphSize)
      if (button.innerHTML !== markup) button.innerHTML = markup
      button.classList.toggle('is-saved', iconState === 'saved')
      button.classList.toggle('is-done', iconState === 'done')
      button.classList.toggle('is-busy', iconState === 'busy' || this.state.busyAction === action)
      button.classList.toggle('is-error', iconState === 'error')
      button.setAttribute('aria-pressed', action === 'inspiration' ? String(this.state.saved) : 'false')
    }
  }

  private iconState(action: MediaActionKind): IconState {
    if (this.state.busyAction !== null && this.state.busyAction !== action) return 'busy'
    if (action === 'inspiration' && this.state.saved) return 'saved'
    if (action === 'copy' && this.state.copied) return 'done'
    if (action === 'attach' && this.state.attached) return 'done'
    return 'idle'
  }
}

/** Keeps an overlay press from reaching the page underneath. */
function swallowEvent(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}
