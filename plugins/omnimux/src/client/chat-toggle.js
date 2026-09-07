/**
 * Injects a chat expand/collapse toggle button at the first position of the
 * better-sidebar toggleCluster ([data-dsh-toggle-cluster]).
 *
 * Click behavior (#372): toggles independent `conversationCollapsed`.
 * No longer uses setFocus(gui) alone to "hide" chat by stretching the right
 * panel — that re-coupled middle visibility to left-rail width.
 */

import { activeTabId } from './workbench/host-adapter.js'
import { isWorkbenchTab } from './workbench/focus-state.js'
import {
  getConversationCollapsed,
  setConversationCollapsed,
} from './conversation-collapse.js'

export const CHAT_TOGGLE_ATTR = 'data-omnimux-chat-toggle'
export const CHAT_TOGGLE_SELECTOR = `[${CHAT_TOGGLE_ATTR}="1"]`

/**
 * Lucide maximize-2 style icon: two outward diagonal arrows. Shown while the
 * middle conversation column is visible — clicking expands (maximizes) the
 * right workbench panel to full width.
 */
export const MAXIMIZE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet" data-omnimux-icon="maximize">
  <path d="M10 2h4v4"/>
  <path d="M14 2L9 7"/>
  <path d="M6 14H2v-4"/>
  <path d="M2 14l5-5"/>
</svg>`

/**
 * Lucide minimize-2 style icon: two inward diagonal arrows. Shown while the
 * middle conversation column is collapsed (right panel is full width) —
 * clicking restores (minimizes) the panel and brings the conversation back.
 */
export const RESTORE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet" data-omnimux-icon="restore">
  <path d="M13 6.5H9.5V3"/>
  <path d="M14 2L9.5 6.5"/>
  <path d="M3 9.5h3.5V13"/>
  <path d="M2 14l4.5-4.5"/>
</svg>`

function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

function getWorkbenchApi() {
  return hostWindow()?.__omnimuxWorkbench
}

function findToggleCluster(doc = hostDocument()) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  return doc.querySelector('[data-dsh-toggle-cluster], [class*="toggleCluster"]')
}

export function syncChatToggleState(btn) {
  if (!btn) return
  const api = getWorkbenchApi()
  if (!api) return
  const snapshot = api.getSnapshot?.()
  const state = snapshot?.state
  const panelOpen = state?.panelOpen === true
  const activeTab = api.getActiveTab?.() || activeTabId(state)
  const isWorkbench = isWorkbenchTab(activeTab)

  // Only show if panel is open and the active tab is a registered workbench occupant
  if (!panelOpen || !isWorkbench) {
    btn.style.display = 'none'
    return
  }

  const collapsed = getConversationCollapsed()
  btn.style.display = ''
  const active = collapsed ? 'false' : 'true'
  if (btn.getAttribute('data-active') !== active) {
    btn.setAttribute('data-active', active)
  }
  // collapsed=true  → right panel is full width; offer "restore" (shrink panel,
  //                   show conversation again) with the inward-arrows icon.
  // collapsed=false → conversation visible; offer "maximize" (fill full width)
  //                   with the outward-arrows icon.
  //
  // Idempotent write (critical): innerHTML assignment ALWAYS replaces child
  // nodes even when the markup is identical, which fires a childList mutation.
  // installChatToggleObserver watches document.body with
  // { childList: true, subtree: true } and re-runs ensureChatToggle →
  // syncChatToggleState on every mutation — an unconditional innerHTML write
  // here deadlocks the main thread in an infinite synchronous observer loop.
  // Only touch innerHTML when the icon actually flips.
  const action = collapsed ? 'restore' : 'maximize'
  if (btn.getAttribute('data-action') !== action) {
    btn.innerHTML = collapsed ? RESTORE_ICON_SVG : MAXIMIZE_ICON_SVG
    btn.setAttribute('data-action', action)
  }
  const label = collapsed
    ? (api.t?.('workbench.chatShow') || '显示会话栏')
    : (api.t?.('workbench.chatHide') || '全屏铺满右侧栏')
  if (btn.getAttribute('aria-label') !== label) {
    btn.setAttribute('aria-label', label)
    btn.setAttribute('title', label)
  }
}

export function createChatToggleButton(doc = hostDocument()) {
  if (!doc || typeof doc.createElement !== 'function') return null
  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.setAttribute(CHAT_TOGGLE_ATTR, '1')
  btn.className = 'omnimux-chat-toggle-btn'
  // Default to the maximize icon; syncChatToggleState below resolves the real
  // state-driven icon (and hides the button when it is not applicable).
  // data-action is set alongside innerHTML so the sync below stays a no-op
  // when the conversation is already visible (see idempotency note there).
  btn.innerHTML = MAXIMIZE_ICON_SVG
  btn.setAttribute('data-action', 'maximize')

  btn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const api = getWorkbenchApi()
    if (!api) return
    const nextCollapsed = !getConversationCollapsed()
    // Independent middle intent first (CSS). Optionally fill the right panel
    // when hiding chat so the layout has no dead gap — fill must not be the
    // sole mechanism that "hides" conversation (#372).
    setConversationCollapsed(nextCollapsed)
    if (nextCollapsed) {
      api.setFocus?.('gui')
    } else {
      api.setFocus?.('split')
    }
    syncChatToggleState(btn)
  })

  syncChatToggleState(btn)
  return btn
}

export function ensureChatToggle(doc = hostDocument()) {
  const cluster = findToggleCluster(doc)
  if (!cluster) return null
  let existing = cluster.querySelector(CHAT_TOGGLE_SELECTOR)
  if (existing) {
    if (cluster.firstChild !== existing) {
      cluster.insertBefore(existing, cluster.firstChild)
    }
    syncChatToggleState(existing)
    return existing
  }
  const btn = createChatToggleButton(doc)
  if (!btn) return null
  cluster.insertBefore(btn, cluster.firstChild)
  return btn
}

/**
 * Installs an observer on the document body to maintain the toggle button
 * in the toggle cluster across dynamic DOM updates.
 * @returns {() => void} cleanup function
 */
export function installChatToggleObserver(doc = hostDocument()) {
  if (!doc) return () => {}
  ensureChatToggle(doc)

  const api = getWorkbenchApi()
  const unsubWorkbench = api?.subscribe?.(() => {
    ensureChatToggle(doc)
  })

  let observer = null
  if (typeof MutationObserver !== 'undefined' && doc.body) {
    observer = new MutationObserver(() => {
      ensureChatToggle(doc)
    })
    observer.observe(doc.body, { childList: true, subtree: true })
  }

  return () => {
    if (typeof unsubWorkbench === 'function') unsubWorkbench()
    if (observer) observer.disconnect()
    const btn = doc.querySelector(CHAT_TOGGLE_SELECTOR)
    if (btn) btn.remove()
  }
}

export const installChatToggle = installChatToggleObserver
