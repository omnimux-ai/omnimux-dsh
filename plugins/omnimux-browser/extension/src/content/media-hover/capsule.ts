/**
 * The dark frosted capsule that carries the page-media shortcuts.
 *
 * Layout is fixed by the design contract:
 *
 * ```
 * [ inspiration ] [ copy ] [ attach ]
 * ```
 *
 * The capsule owns no positioning logic and no messaging: the overlay places it
 * and `actions.ts` performs the work. It only paints state and reports presses.
 *
 * @module
 */

import { CAPSULE_SPEC } from './messages.ts'
import { ICON_BY_ACTION, STATE_ICON, svgIcon, type CapsuleIcon } from './overlay-icons.ts'
import type { CapsuleActionEvent, HoveredMedia, MediaActionKind, OverlayState } from './types.ts'
import type { HoverCopy } from './copy.ts'

/** The three action slots, in capsule order. */
const ACTION_ORDER: readonly MediaActionKind[] = ['inspiration', 'copy', 'attach']

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
 * object: `setState` merges a patch and re-derives each icon.
 */
export class MediaCapsule {
  /** The `.omnimux-capsule-bar` node; a direct child of the shadow root. */
  readonly element: HTMLDivElement

  private readonly buttons = new Map<MediaActionKind, HTMLButtonElement>()
  private readonly hints: HoverCopy
  private state: OverlayState = {
    phase: 'idle',
    activeId: '',
    busyAction: null,
    saved: false,
    copied: false,
    attached: false,
  }
  private actionHandler: ((event: CapsuleActionEvent) => void) | null = null

  private constructor(hints: HoverCopy) {
    this.hints = hints
    this.element = document.createElement('div')
    this.element.className = 'omnimux-capsule-bar'
    this.element.setAttribute('role', 'toolbar')
    this.element.setAttribute('aria-label', hints.brand)
    this.element.setAttribute('aria-orientation', 'horizontal')
  }

  /** Creates the capsule with its full icon row. */
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

  /** Shows the capsule and points the transform origin at the media edge. */
  show(alignment: 'left' | 'right'): void {
    this.element.style.transformOrigin = alignment === 'left' ? 'bottom left' : 'bottom right'
    this.element.classList.add('is-visible')
  }

  /** Hides the capsule; the node stays mounted for a cheap re-show. */
  hide(): void {
    this.element.classList.remove('is-visible')
    this.element.classList.remove('is-interactive')
  }

  /** Removes the node from the DOM. */
  destroy(): void {
    this.buttons.clear()
    this.element.remove()
  }

  private buildRow(): void {
    this.element.style.paddingLeft = `${CAPSULE_SPEC.paddingX}px`
    this.element.style.paddingRight = `${CAPSULE_SPEC.paddingX}px`
    for (const action of ACTION_ORDER) {
      this.element.appendChild(this.buildButton(action))
    }
    this.paint()
  }

  private buildButton(action: MediaActionKind): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'omnimux-capsule-icon'
    button.setAttribute('data-action', action)
    button.setAttribute('aria-label', this.hints.action[action])
    button.setAttribute('title', this.hints.hint[action])
    button.innerHTML = svgIcon(ICON_BY_ACTION[action], 18)

    // The page must never see these presses: no navigation, no card selection,
    // no page-level click handler.
    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    button.addEventListener('pointerdown', swallow)
    button.addEventListener('mousedown', swallow)
    button.addEventListener('contextmenu', swallow)
    button.addEventListener('click', (event) => {
      swallow(event)
      this.actionHandler?.({ action, element: button })
    })

    this.buttons.set(action, button)
    return button
  }

  private paint(): void {
    for (const action of ACTION_ORDER) {
      const button = this.buttons.get(action)
      if (button === null || button === undefined) continue
      const iconState = this.iconState(action)
      const markup = svgIcon(iconFor(action, iconState), 18)
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
