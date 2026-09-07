/**
 * Workbench 宿主适配器：与 better-sidebar / 官方外壳交互的唯一入口。
 *
 * 只接受当前 pin 的官方契约 `SidebarSnapshot = { sessionId, state }`；
 * 不做 `snap.state || snap` 之类的兼容猜测。快照结构遍历（split 树、
 * Tab 列表）与服务等待/会话判定也归这里，纯计算归 geometry/focus-state。
 */

/** @type {{ betterSidebar?: object | null, layout?: object | null, sessions?: object | null }} */
const deps = {
  betterSidebar: null,
  layout: null,
  sessions: null,
}

/** @type {object | null} 当前装配层 attach 的 better-sidebar Tab store。 */
let attachedStore = null

/** Sessions whose initial sidebar snapshot was classified for default seed cleanup. */
const classifiedSeedSessions = new Set()
const SIDEBAR_LAYOUT_STORAGE_PREFIX = 'dsh-sidebar:v1:'

export function bindWorkbenchDeps(next = {}) {
  if (next.betterSidebar !== undefined) deps.betterSidebar = next.betterSidebar || null
  if (next.layout !== undefined) deps.layout = next.layout || null
  if (next.sessions !== undefined) deps.sessions = next.sessions || null
}

export function getWorkbenchService() {
  return deps.betterSidebar || null
}

export function getWorkbenchLayout() {
  return deps.layout || null
}

export function getWorkbenchSessions() {
  return deps.sessions || null
}

export function getAttachedStore() {
  return attachedStore
}

export function setAttachedStore(store) {
  attachedStore = store || null
}

export function resetWorkbenchHostAdapter() {
  deps.betterSidebar = null
  deps.layout = null
  deps.sessions = null
  attachedStore = null
  classifiedSeedSessions.clear()
}

export function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

export function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

/**
 * 严格读取官方 SidebarSnapshot 的 state。没有 `.state` 就是没有状态，
 * 绝不把裸 state 对象当作快照（移除历史 `snap?.state || snap` 猜测）。
 * @param {import('../../workbench/contract.js').SidebarSnapshot | null | undefined} snapshot
 * @returns {object | null}
 */
export function snapshotState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : null
}

/**
 * 读取当前活跃快照：优先显式 store / 已 attach store，其次 better-sidebar 服务。
 * @param {object | null} [store]
 * @returns {import('../../workbench/contract.js').SidebarSnapshot | null}
 */
export function liveSnapshot(store = attachedStore) {
  return (typeof store?.getSnapshot === 'function' ? store.getSnapshot() : null)
    || getWorkbenchService()?.getSnapshot?.()
    || null
}

/**
 * Recursively collect split-tree tabs (does not depend on better-sidebar internals).
 * @param {object | null | undefined} node
 * @returns {Array<{ id?: string, type?: string, path?: string }>}
 */
export function collectTabs(node) {
  if (!node || typeof node !== 'object') return []
  if (node.kind === 'leaf') return Array.isArray(node.tabs) ? node.tabs : []
  if (!Array.isArray(node.children)) return []
  return node.children.flatMap(collectTabs)
}

/**
 * Empty Files seed: type=editor with no path. User-opened editors keep their path.
 * @param {{ type?: string, path?: string }} tab
 */
export function isSeedFilesTab(tab) {
  return tab?.type === 'editor' && (tab.path === undefined || tab.path === '')
}

export function listOpenTabs(state) {
  if (!state) return []
  return collectTabs(state.splits).concat(collectTabs(state.bottomSplits))
}

export function activeTabId(state) {
  if (!state) return undefined
  const activePaneId = state.activePane
  const findLeaf = (node) => {
    if (!node || typeof node !== 'object') return null
    if (node.kind === 'leaf') return node.id === activePaneId || !activePaneId ? node : null
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findLeaf(child)
        if (found) return found
      }
    }
    return null
  }
  const leaf = findLeaf(state.splits) || findLeaf(state.bottomSplits)
  return leaf?.active ?? leaf?.tabs?.[0]?.id ?? undefined
}

export function tabIsOpen(state, tabId) {
  if (!tabId) return false
  return listOpenTabs(state).some((tab) => tab.id === tabId || tab.type === tabId)
}

export function currentSessionId(sessions = deps.sessions) {
  try {
    const snap = sessions?.list?.getSnapshot?.()
    if (snap?.current) return String(snap.current)
  } catch {
    // Cordis Proxy may throw on unread services.
  }
  return undefined
}

export async function ensureSessionId(sessions, explicitId) {
  if (explicitId) return String(explicitId)
  return currentSessionId(sessions)
}

export function waitMs(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

export async function waitForBetterSidebar(timeoutMs = 4000) {
  const first = getWorkbenchService()
  if (first && typeof first.openTab === 'function') return first
  if (timeoutMs <= 0) return first
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    const service = getWorkbenchService()
    if (service && typeof service.openTab === 'function') return service
    await waitMs(50)
  }
  return getWorkbenchService()
}

export async function waitForSidebarSession(service, sessionId, timeoutMs = 4000) {
  if (!service || !sessionId || typeof service.getSnapshot !== 'function') return false
  if (service.getSnapshot()?.sessionId === sessionId) return true
  if (timeoutMs <= 0) return false
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (service.getSnapshot()?.sessionId === sessionId) return true
    await waitMs(50)
  }
  return service.getSnapshot()?.sessionId === sessionId
}

export async function waitForTab(service, tabId, timeoutMs = 4000) {
  if (!service || typeof service.getTab !== 'function') return Boolean(service)
  if (service.getTab(tabId)) return true
  if (timeoutMs <= 0) return false
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (service.getTab(tabId)) return true
    await waitMs(50)
  }
  return Boolean(service.getTab(tabId))
}

export function closeSeedFiles(service, openScope) {
  const state = service.getSnapshot?.()?.state
  if (!state || typeof service.closeTab !== 'function') return
  const tabs = listOpenTabs(state)
  for (const tab of tabs) {
    if (isSeedFilesTab(tab) && tab.id) {
      try { service.closeTab(tab.id, openScope) } catch { /* ignore */ }
    }
  }
}

/**
 * Classify one session exactly once when its first sidebar snapshot arrives.
 * A reliable absent storage key identifies better-sidebar's factory state;
 * closing its path-less editor leaves the pane empty so PaneEmptyCards renders.
 */
export function clearInitialFilesSeed(service) {
  if (!service || typeof service.getSnapshot !== 'function' || typeof service.closeTab !== 'function') return false
  let snapshot
  try {
    snapshot = service.getSnapshot()
  } catch {
    return false
  }
  const sessionId = snapshot?.sessionId
  const state = snapshotState(snapshot)
  if (!sessionId || !state || classifiedSeedSessions.has(sessionId)) return false

  let hasPersistedLayout
  try {
    const storage = hostWindow()?.localStorage
    if (!storage || typeof storage.getItem !== 'function') return false
    hasPersistedLayout = storage.getItem(SIDEBAR_LAYOUT_STORAGE_PREFIX + sessionId) !== null
  } catch {
    return false
  }

  classifiedSeedSessions.add(sessionId)
  if (hasPersistedLayout) return false
  const seed = listOpenTabs(state).find((tab) => isSeedFilesTab(tab) && tab.id)
  if (!seed) return false
  try {
    service.closeTab(seed.id, { sessionId })
    return true
  } catch {
    return false
  }
}
