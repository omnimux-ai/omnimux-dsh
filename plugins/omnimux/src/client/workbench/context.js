/**
 * Workbench Agent context 投影：把宿主快照统一投影为 viewport 信封。
 *
 * `getUiContext` 只消费官方 `SidebarSnapshot = { sessionId, state }`（经
 * host-adapter 的 `snapshotState` 严格读取，无 `snap.state || snap` 猜测）；
 * `formatCompactContextBlock` 把信封压缩为 `<ui_context>` 文本块，
 * `view.extra.workspaceId` 始终保持纯逻辑 ID（拒绝路径形态）。
 */

import { getConversationCollapsed } from '../conversation-collapse.js'
import {
  activeTabId,
  currentSessionId,
  getWorkbenchService,
  isSeedFilesTab,
  listOpenTabs,
  snapshotState,
} from './host-adapter.js'
import {
  WORKBENCH_TAB_TITLE_FALLBACKS,
  getWorkbenchFocus,
  isWorkbenchTab,
} from './focus-state.js'

/** @type {Map<string, () => ({ view?: object, selection?: Array<object> } | null | undefined)>} */
const contextContributors = new Map()

export function registerContextContributor(tabId, contributor) {
  if (!tabId || typeof contributor !== 'function') return () => {}
  contextContributors.set(tabId, contributor)
  return () => {
    contextContributors.delete(tabId)
  }
}

export function unregisterContextContributor(tabId) {
  contextContributors.delete(tabId)
}

export function resetWorkbenchContextContributors() {
  contextContributors.clear()
}

/**
 * Normalize a better-sidebar tab into a stable descriptor for Agent context.
 * Native official tabs (Files editor, terminal, browser, …) use opaque ids
 * like `tab:5`; their human title lives on `tab.title` / `tab.type`.
 * @param {{ id?: string, type?: string, title?: string, path?: string }} tab
 */
export function describeOpenTab(tab) {
  if (!tab || typeof tab !== 'object') return null
  const id = typeof tab.id === 'string' && tab.id ? tab.id : null
  if (!id) return null
  const type = typeof tab.type === 'string' && tab.type ? tab.type : id
  const fallback = WORKBENCH_TAB_TITLE_FALLBACKS[id] || WORKBENCH_TAB_TITLE_FALLBACKS[type] || null
  const rawTitle = typeof tab.title === 'string' ? tab.title.trim() : ''
  const title = rawTitle || fallback || id
  const kind = isWorkbenchTab(id) || isWorkbenchTab(type)
    ? 'workbench'
    : type === 'editor' || title === 'Files' || isSeedFilesTab(tab)
      ? 'files'
      : 'native'
  return { id, type, title, kind }
}

/**
 * @returns {import('../../workbench/contract.js').WorkbenchEnvelope}
 */
export function getUiContext() {
  const service = getWorkbenchService()
  const snap = service?.getSnapshot?.()
  const state = snapshotState(snap)
  const activeTab = activeTabId(state)
  const panelOpen = Boolean(state?.panelOpen)
  const focus = getWorkbenchFocus()
  const conversationCollapsed = Boolean(getConversationCollapsed())
  const openedTabs = listOpenTabs(state).map(describeOpenTab).filter(Boolean)
  const sessionId = currentSessionId() || snap?.sessionId || 'default'
  const activeDesc = openedTabs.find((t) => t.id === activeTab)
    || (activeTab ? describeOpenTab({ id: activeTab, type: activeTab }) : null)

  let reason = 'ok'
  let view = null
  let selection = []

  if (!panelOpen) {
    reason = 'panel-collapsed'
  } else if (activeTab) {
    reason = 'ok'
    const contributor = contextContributors.get(activeTab)
    if (typeof contributor === 'function') {
      try {
        const res = contributor()
        if (res) {
          view = res.view || null
          selection = Array.isArray(res.selection) ? res.selection : []
        }
      } catch (err) {
        console.error('[workbench] contributor error:', err)
        reason = 'unavailable'
      }
    }
  } else {
    reason = 'no-workbench'
  }

  const envelope = {
    schemaVersion: 1,
    ok: true,
    capturedAt: Date.now(),
    reason,
    sessionId,
    surface: {
      tabId: activeTab || null,
      title: activeDesc?.title || (activeTab && WORKBENCH_TAB_TITLE_FALLBACKS[activeTab]) || activeTab || null,
      type: activeDesc?.type || activeTab || null,
      kind: activeDesc?.kind || (activeTab ? 'workbench' : null),
      plugin: activeTab && String(activeTab).includes(':') ? activeTab.split(':')[0] : null,
      panelOpen,
      focus,
      conversationCollapsed,
      openedTabs,
    },
    view,
    selection,
  }

  return envelope
}

/** Logical workspace id only — reject path-like values. */
function isSafeWorkspaceId(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9_.:-]{1,64}$/.test(value)
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('~')
}

function isSafeShortToken(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 64
    && !value.includes('\n')
    && !value.includes('|')
}

/**
 * @param {import('../../workbench/contract.js').WorkbenchEnvelope} envelope
 */
export function formatCompactContextBlock(envelope) {
  if (!envelope || !envelope.surface) return ''
  const s = envelope.surface
  const view = envelope.view && typeof envelope.view === 'object' ? envelope.view : null
  const extra = view?.extra && typeof view.extra === 'object' ? view.extra : null
  const lines = []
  lines.push('<ui_context schema="1">')

  const titleStr = s.title && s.title !== s.tabId ? ` (${s.title})` : ''
  let firstLine = `tab: ${s.tabId || 'none'}${titleStr}`
  if (isSafeShortToken(view?.kind)) {
    firstLine += ` | view: ${view.kind}`
  }
  if (isSafeShortToken(view?.pageId)) {
    firstLine += ` | page: ${view.pageId}`
  }
  // Canvas workspace is a P0 routing key — whitelist only, never dump all extra.
  const workspaceId = extra?.workspaceId
  if (isSafeWorkspaceId(workspaceId)) {
    firstLine += ` | workspace: ${workspaceId}`
  }
  if (view?.filterType) {
    firstLine += ` | filter: ${view.filterType}`
  }
  if (view?.query) {
    firstLine += ` | query: ${view.query}`
  }
  if (Array.isArray(envelope.selection) && envelope.selection.length > 0) {
    const selStr = envelope.selection.slice(0, 3).map((item) => {
      const name = item.name || item.title || item.id
      return item.id && name !== item.id ? `${name} (${item.id})` : name
    }).join(', ')
    firstLine += ` | selected: ${selStr}`
  }
  lines.push(firstLine)

  if (Array.isArray(s.openedTabs) && s.openedTabs.length > 0) {
    const openStr = s.openedTabs.map((t) => {
      if (!t) return ''
      if (typeof t === 'string') return t
      const label = t.title && t.title !== t.id ? t.title : (t.id || t.type || '')
      return t.id === s.tabId ? `${label}*` : label
    }).filter(Boolean).join(', ')
    if (openStr) lines.push(`open: ${openStr}`)
  }

  const secondLine = `panel: ${s.panelOpen ? 'open' : 'closed'} | focus: ${s.focus || 'split'}`
  lines.push(secondLine)
  lines.push('</ui_context>')
  return lines.join(String.fromCharCode(10))
}
