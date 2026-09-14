/**
 * Workbench Agent context 投影：把宿主快照统一投影为 viewport 信封。
 *
 * `getUiContext` 优先消费官方 sidebarRight 当前活动标签/展开读面；
 * 无该公开能力时才消费旧 SidebarSnapshot.state，不猜测原生导航参数。
 * `formatCompactContextBlock` 把信封压缩为 `<ui_context>` 文本块，
 * `view.extra.workspaceId` 始终保持纯逻辑 ID（拒绝路径形态）。
 */

import { getConversationCollapsed } from '../conversation-collapse.js'
import {
  activeTabId,
  currentSessionId,
  getWorkbenchService,
  getWorkbenchSidebarRight,
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
  const native = getWorkbenchSidebarRight()
  const hasNative = typeof native?.active === 'function' && typeof native?.isExpanded === 'function'
  const current = currentSessionId()
  // The native controller addresses only the currently mounted session.
  const nativeTab = hasNative && current ? native.active() : null
  const activeTab = hasNative ? nativeTab?.kind : activeTabId(state)
  const panelOpen = hasNative ? Boolean(current && nativeTab && native.isExpanded()) : Boolean(state?.panelOpen)
  const focus = getWorkbenchFocus()
  const conversationCollapsed = Boolean(getConversationCollapsed())
  const openedTabs = hasNative
    ? [describeOpenTab(nativeTab && { id: nativeTab.id, type: nativeTab.kind, title: nativeTab.title })].filter(Boolean)
    : listOpenTabs(state).map(describeOpenTab).filter(Boolean)
  const sessionId = current || (!hasNative && snap?.sessionId) || 'default'
  const activeDesc = hasNative ? openedTabs[0] : openedTabs.find((t) => t.id === activeTab)
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
      ...(hasNative ? { instanceId: nativeTab?.id || null } : {}),
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

export { formatCompactContextBlock } from '../../workbench/contract.js'
