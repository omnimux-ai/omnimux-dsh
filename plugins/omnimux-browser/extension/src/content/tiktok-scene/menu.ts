/**
 * The trigger and menu the user actually touches on a TikTok page.
 *
 * Everything renders inside one shadow root the page cannot reach: TikTok's
 * stylesheet has no rule that can reach in, and this feature owns no rule that
 * can leak out. The trigger is positioned from {@link resolveAnchorPlacement}
 * and never inserted into TikTok's own tree, so a re-render of the rail cannot
 * delete it.
 *
 * The menu is a small state machine over three rows. A row reports its own
 * progress in place — waiting, done, or the host's reason for failing — because
 * the user pressed a menu item and is looking at it; a toast somewhere else
 * would make them look away from what they just touched.
 *
 * @module
 */

import inlineStyles from './styles.css?inline'
import { resolveAnchorPlacement } from './anchor.ts'
import { actionIcon, brandIcon, checkIcon } from './icons.ts'
import { TIKTOK_SCENE_HOST_ID } from './messages.ts'
import type { TiktokAction, TiktokCopy } from './copy.ts'
import type { ExportOutcome } from '../../background/media-export.ts'

export { TIKTOK_SCENE_HOST_ID }

/** Actions in the order the menu shows them. */
const ACTION_ORDER: readonly TiktokAction[] = ['video', 'audio', 'save']

/** Live handle over a mounted trigger. */
export interface TiktokSceneHandle {
  /** Remove the trigger and every listener it installed. */
  dispose(): void
  /** Re-measure the anchor and move the trigger. */
  reposition(): void
  /** Whether the menu is currently showing. */
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
  trigger.innerHTML = `${brandIcon(20)}<span class="omx-trigger-label"></span>`
  const triggerLabel = trigger.querySelector('.omx-trigger-label')
  if (triggerLabel !== null) triggerLabel.textContent = copy.trigger

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
    iconSlot.innerHTML = actionIcon(action, 19)

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

  const setOpen = (next: boolean): void => {
    open = next
    menu.classList.toggle('is-open', next)
    trigger.setAttribute('aria-expanded', next ? 'true' : 'false')
    if (next) reposition()
  }

  let placedLeft = -1
  let placedBottom = -1

  const reposition = (): void => {
    const placement = resolveAnchorPlacement(doc, {
      width: doc.defaultView?.innerWidth ?? 0,
      height: doc.defaultView?.innerHeight ?? 0,
    })
    // Attribute observation makes this run on a busy page, and writing the same
    // two values would force a style recalculation for no movement at all.
    if (placement.left === placedLeft && placement.bottom === placedBottom) return
    placedLeft = placement.left
    placedBottom = placement.bottom
    anchor.style.left = `${placement.left}px`
    anchor.style.bottom = `${placement.bottom}px`
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
    else if (state === 'done') iconSlot.innerHTML = checkIcon(19)
    else iconSlot.innerHTML = actionIcon(action, 19)
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

  const onTriggerClick = (event: Event): void => {
    // The document listener below closes the menu on any outside click; without
    // stopping here the click that opened it would immediately close it again.
    event.stopPropagation()
    setOpen(!open)
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
  // used to be. That applies whether or not the menu is showing, because the
  // trigger itself is always visible. Scroll is different — the rail is pinned,
  // so only an open menu (whose position the user is looking at) re-measures.
  const onResize = (): void => reposition()
  const onScroll = (): void => { if (open) reposition() }

  trigger.addEventListener('click', onTriggerClick)
  doc.addEventListener('click', onDocumentClick)
  doc.addEventListener('keydown', onKeydown)
  doc.defaultView?.addEventListener('resize', onResize)
  doc.defaultView?.addEventListener('scroll', onScroll, { passive: true })

  reposition()

  return {
    dispose(): void {
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
