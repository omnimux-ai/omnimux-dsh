/**
 * The trigger and toolbar the user actually touches on a TikTok page.
 *
 * Everything renders inside one shadow root the page cannot reach: TikTok's
 * stylesheet has no rule that can reach in, and this feature owns no rule that
 * can leak out. The trigger is positioned from the platform anchor layer and
 * never inserted into TikTok's own tree, so a re-render of the rail cannot delete
 * it.
 *
 * The trigger is a circle and it opens on hover. The circle carries no label to
 * read and asks for no click to explain itself; keyboard users get the same
 * toolbar from focus, and a tap still toggles it, because a touch screen has no
 * hover to offer.
 *
 * The toolbar sits beside the circle, vertically centred on it, and opens to the
 * right unless the viewport has no room there — then it opens to the left. That
 * direction is measured per reposition (`menu-side.ts`), not configured: the
 * trigger is anchored to the user's avatar, and in the portrait layout that
 * avatar lives in the right-hand action bar, where a rightward toolbar would run
 * off the screen.
 *
 * The toolbar is a small state machine over three columns. A column reports its
 * own progress in place — waiting, done, or the host's reason for failing —
 * because the user pressed a menu item and is looking at it; a toast somewhere
 * else would make them look away from what they just touched.
 *
 * @module
 */

import inlineStyles from './styles.css?inline'
import { resolvePlatformAnchor } from '../../platform/anchor.ts'
import { platformById } from '../../platform/registry.ts'
import { actionIcon, brandIcon, checkIcon } from './icons.ts'
import { resolveMenuSide } from './menu-side.ts'
import { TIKTOK_SCENE_HOST_ID } from './messages.ts'
import type { TiktokAction, TiktokCopy } from './copy.ts'
import type { ExportOutcome } from '../../background/media-export.ts'

export { TIKTOK_SCENE_HOST_ID }

/** Actions in the order the toolbar shows them. */
const ACTION_ORDER: readonly TiktokAction[] = ['video', 'audio', 'save']

/** The circle's size in CSS px, mirroring `.omx-trigger` in the stylesheet. */
const TRIGGER_BOX_PX = 48

/**
 * Width assumed for the toolbar before it can be measured.
 *
 * Only reached if the element reports no box at all, which a laid-out element
 * does not: the toolbar is hidden with `visibility`, never `display`, so it has
 * geometry even while it is shut. The value matches what the stylesheet renders —
 * three ~68px columns, their gaps, and the panel's padding — so a failed
 * measurement degrades to the shipped size rather than to a guess.
 */
const MENU_FALLBACK_WIDTH_PX = 226

/** The icon size every toolbar row draws at. */
const ROW_ICON_PX = 18

/**
 * The platform this scene belongs to.
 *
 * Named directly rather than resolved from the hostname: this module *is* the
 * TikTok scene — its mount gate lives in `index.ts` and refuses every other host
 * — and a hostname lookup here would make the trigger's position depend on a
 * second copy of that decision. A scene for another platform is another module.
 */
const SCENE_PLATFORM = platformById('tiktok')

/** Live handle over a mounted trigger. */
export interface TiktokSceneHandle {
  /** Remove the trigger and every listener it installed. */
  dispose(): void
  /** Re-measure the anchor and move the trigger. */
  reposition(): void
  /** Whether the toolbar is currently showing. */
  isOpen(): boolean
}

/** What the host must provide to mount the scene. */
export interface TiktokSceneOptions {
  doc: Document
  copy: TiktokCopy
  /** Performs one shortcut and answers with the host's outcome. */
  run: (action: TiktokAction) => Promise<ExportOutcome>
}

/** Per-row visual state. */
type RowState = 'idle' | 'busy' | 'done' | 'error'

/**
 * Whether an event was produced by a pointer that can hover.
 *
 * A touch screen fires the enter/leave pair too — after the tap, and immediately
 * before `click` — so treating those as hover would open the toolbar and shut it
 * again inside one tap. Anything that is not explicitly a touch counts as
 * hovering, so a plain `Event` in a test behaves like a mouse.
 * @param event the pointer event
 */
function pointerCanHover(event: Event): boolean {
  return (event as Partial<PointerEvent>).pointerType !== 'touch'
}

/**
 * Mount the OmniMux trigger into a TikTok page.
 *
 * Any previous host with the same id is removed first: a content script can be
 * re-injected into a live page, and the page must never accumulate two triggers
 * — or two sets of document listeners.
 * @param options
 * @returns a handle that removes everything it installed
 */
export function mountTiktokScene(options: TiktokSceneOptions): TiktokSceneHandle {
  const doc = options.doc
  const copy = options.copy
  for (const stale of Array.from(doc.querySelectorAll(`#${TIKTOK_SCENE_HOST_ID}`))) stale.remove()

  const host = doc.createElement('div')
  host.id = TIKTOK_SCENE_HOST_ID
  host.style.position = 'fixed'
  host.style.top = '0'
  host.style.left = '0'
  host.style.width = '0'
  host.style.height = '0'
  host.style.overflow = 'visible'
  host.style.zIndex = '2147483640'

  const shadow = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = inlineStyles
  shadow.appendChild(style)

  const anchor = doc.createElement('div')
  anchor.className = 'omx-anchor'
  anchor.style.position = 'fixed'

  const trigger = doc.createElement('button')
  trigger.type = 'button'
  trigger.className = 'omx-trigger'
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-label', copy.brand)
  trigger.title = copy.brand
  trigger.innerHTML = brandIcon(27)

  const menu = doc.createElement('div')
  menu.className = 'omx-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', copy.brand)

  const rows = new Map<TiktokAction, HTMLElement>()
  const stateLabels = new Map<TiktokAction, HTMLElement>()
  const iconSlots = new Map<TiktokAction, HTMLElement>()

  for (const action of ACTION_ORDER) {
    const row = doc.createElement('button')
    row.type = 'button'
    row.className = 'omx-item'
    row.dataset.action = action
    row.setAttribute('role', 'menuitem')

    const iconSlot = doc.createElement('span')
    iconSlot.className = 'omx-item-icon'
    iconSlot.innerHTML = actionIcon(action, ROW_ICON_PX)

    const label = doc.createElement('span')
    label.className = 'omx-item-label'
    label.textContent = copy.menu[action]

    const state = doc.createElement('span')
    state.className = 'omx-item-state'

    row.append(iconSlot, label, state)
    menu.appendChild(row)

    rows.set(action, row)
    stateLabels.set(action, state)
    iconSlots.set(action, iconSlot)
  }

  const detail = doc.createElement('p')
  detail.className = 'omx-item-detail'
  menu.appendChild(detail)

  anchor.append(menu, trigger)
  shadow.appendChild(anchor)
  doc.documentElement.appendChild(host)

  let open = false
  let hovering = false

  const setOpen = (next: boolean): void => {
    open = next
    menu.classList.toggle('is-open', next)
    trigger.setAttribute('aria-expanded', next ? 'true' : 'false')
    if (next) reposition()
  }

  let placedLeft = -1
  let placedBottom = -1
  let placedMenuLeft = Number.NaN
  let placedMenuSide = ''

  /**
   * The toolbar's rendered width, or the shipped width when it reports none.
   *
   * Read from the element, never assumed: the direction decision is only worth
   * anything if it is made against the panel the stylesheet actually produced.
   */
  const menuWidth = (): number => {
    const width = menu.getBoundingClientRect().width
    return Number.isFinite(width) && width > 0 ? width : MENU_FALLBACK_WIDTH_PX
  }

  const reposition = (): void => {
    const viewport = {
      width: doc.defaultView?.innerWidth ?? 0,
      height: doc.defaultView?.innerHeight ?? 0,
    }
    const placement = resolvePlatformAnchor(
      SCENE_PLATFORM,
      'scene',
      doc,
      viewport,
      { box: TRIGGER_BOX_PX },
    )
    const side = resolveMenuSide({
      buttonLeft: placement.left,
      buttonBox: TRIGGER_BOX_PX,
      menuWidth: menuWidth(),
      viewportWidth: viewport.width,
    })
    // The toolbar is positioned inside the anchor, so its offset is relative to
    // the trigger rather than to the viewport.
    const menuOffset = side.left - placement.left

    // Attribute observation makes this run on a busy page, and writing the same
    // values would force a style recalculation for no movement at all.
    if (
      placement.left === placedLeft &&
      placement.bottom === placedBottom &&
      menuOffset === placedMenuLeft &&
      side.side === placedMenuSide
    ) {
      return
    }
    placedLeft = placement.left
    placedBottom = placement.bottom
    placedMenuLeft = menuOffset
    placedMenuSide = side.side
    anchor.style.left = `${placement.left}px`
    anchor.style.bottom = `${placement.bottom}px`
    menu.style.left = `${menuOffset}px`
    menu.classList.toggle('is-left', side.side === 'left')
  }

  const setRowState = (action: TiktokAction, state: RowState, text: string): void => {
    const row = rows.get(action)
    const stateLabel = stateLabels.get(action)
    const iconSlot = iconSlots.get(action)
    if (row === undefined || stateLabel === undefined || iconSlot === undefined) return
    row.classList.toggle('is-busy', state === 'busy')
    row.classList.toggle('is-done', state === 'done')
    row.classList.toggle('is-error', state === 'error')
    stateLabel.textContent = text
    if (state === 'busy') iconSlot.innerHTML = '<span class="omx-spinner"></span>'
    else if (state === 'done') iconSlot.innerHTML = checkIcon(ROW_ICON_PX)
    else iconSlot.innerHTML = actionIcon(action, ROW_ICON_PX)
  }

  const showDetail = (text: string, tone: 'ok' | 'error'): void => {
    detail.textContent = text
    detail.classList.toggle('is-ok', tone === 'ok')
    detail.classList.add('is-visible')
  }

  const hideDetail = (): void => {
    detail.textContent = ''
    detail.classList.remove('is-visible', 'is-ok')
  }

  const pending = new Set<TiktokAction>()

  const perform = async (action: TiktokAction): Promise<void> => {
    if (pending.has(action)) return
    pending.add(action)
    hideDetail()
    setRowState(action, 'busy', copy.busy[action])
    let outcome: ExportOutcome
    try {
      outcome = await options.run(action)
    } catch {
      // A rejected promise is a bug in the transport, not a host answer; the user
      // still needs a line they can act on rather than a row stuck on "waiting".
      outcome = { ok: false, code: 'unreachable' }
    }
    pending.delete(action)
    if (outcome.ok) {
      setRowState(action, 'done', copy.done(action, outcome))
      // Naming the file is what turns "something was saved" into "this is what
      // you got", which is the only way the user can notice a wrong post.
      showDetail(copy.detail(action, outcome), 'ok')
    } else {
      setRowState(action, 'error', '')
      showDetail(copy.failed(outcome), 'error')
    }
  }

  for (const action of ACTION_ORDER) {
    const row = rows.get(action)
    if (row === undefined) continue
    row.addEventListener('click', () => { void perform(action) })
  }

  const onAnchorPointerEnter = (event: Event): void => {
    if (!pointerCanHover(event)) return
    hovering = true
    setOpen(true)
  }

  const onAnchorPointerLeave = (event: Event): void => {
    if (!pointerCanHover(event)) return
    hovering = false
    setOpen(false)
  }

  const onTriggerClick = (event: Event): void => {
    // The document listener below would also see this click and close what it
    // just opened.
    event.stopPropagation()
    // Under a hovering pointer the toolbar is already open; toggling here would
    // shut it under the pointer that opened it. Touch never sets `hovering`, so a
    // tap still toggles, and so does Enter on a focused trigger.
    if (hovering) return
    setOpen(!open)
  }

  const onAnchorFocusIn = (): void => setOpen(true)

  const onAnchorFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget
    if (next instanceof Node && anchor.contains(next)) return
    setOpen(false)
  }

  const onDocumentClick = (event: Event): void => {
    if (!open) return
    if (typeof event.composedPath === 'function' && event.composedPath().includes(host)) return
    setOpen(false)
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && open) setOpen(false)
  }

  // The anchor is viewport-relative, so a resize has to re-measure it: the rail
  // moves and the trigger would otherwise be left pointing at where the avatar
  // used to be. That applies whether or not the toolbar is showing, because the
  // trigger itself is always visible. Scroll is different — the rail is pinned,
  // so only an open toolbar (whose position the user is looking at) re-measures.
  const onResize = (): void => reposition()
  const onScroll = (): void => { if (open) reposition() }

  anchor.addEventListener('pointerenter', onAnchorPointerEnter)
  anchor.addEventListener('pointerleave', onAnchorPointerLeave)
  anchor.addEventListener('focusin', onAnchorFocusIn)
  anchor.addEventListener('focusout', onAnchorFocusOut)
  trigger.addEventListener('click', onTriggerClick)
  doc.addEventListener('click', onDocumentClick)
  doc.addEventListener('keydown', onKeydown)
  doc.defaultView?.addEventListener('resize', onResize)
  doc.defaultView?.addEventListener('scroll', onScroll, { passive: true })

  reposition()

  return {
    dispose(): void {
      anchor.removeEventListener('pointerenter', onAnchorPointerEnter)
      anchor.removeEventListener('pointerleave', onAnchorPointerLeave)
      anchor.removeEventListener('focusin', onAnchorFocusIn)
      anchor.removeEventListener('focusout', onAnchorFocusOut)
      trigger.removeEventListener('click', onTriggerClick)
      doc.removeEventListener('click', onDocumentClick)
      doc.removeEventListener('keydown', onKeydown)
      doc.defaultView?.removeEventListener('resize', onResize)
      doc.defaultView?.removeEventListener('scroll', onScroll)
      host.remove()
    },
    reposition,
    isOpen: () => open,
  }
}
