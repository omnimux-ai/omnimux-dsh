/**
 * Workbench 焦点决策状态机：会话 × Tab 的 chat / gui / split 纯逻辑。
 *
 * 负责 Tab 身份（occupant 判定、标题回退）、每会话每 Tab 的焦点记录
 * （localStorage 持久化 + 内存镜像），以及从几何推断当前 active focus。
 * 不写 store、不改 DOM：写几何的动作（setWorkbenchFocus）留在装配层。
 */

import { WORKBENCH_FOCUS, WORKBENCH_OCCUPANTS } from '../../workbench/contract.js'
import { getConversationCollapsed } from '../conversation-collapse.js'
import { activeTabId, currentSessionId, hostWindow, liveSnapshot } from './host-adapter.js'
import { nearPx, workbenchGuiWidthPx } from './geometry.js'

export { WORKBENCH_FOCUS }

/** Human-readable Tab titles when registerTab title is unavailable (#345). */
export const WORKBENCH_TAB_TITLE_FALLBACKS = Object.freeze({
  'omnimux-workflow:canvas': '创作画布',
  'omnimux-clip:studio': '视频剪辑',
  'omnimux-assets:library': '资产库',
  'omnimux-products:library': '产品库',
  'omnimux-forms:tasks': '任务表单',
  'omnimux-accounts:library': '账号',
  'omnimux-inspiration:library': '灵感库',
  'omnimux-publish:library': '发布',
  'omnimux-analytics:library': '数据分析',
  'omnimux-workflow:library': '项目',
  'omnimux-market:plaza': '技能/专家',
})

export function resolveWorkbenchTabTitle(tabId, optsTitle, getTab) {
  if (typeof optsTitle === 'string' && optsTitle.trim()) return optsTitle.trim()
  if (typeof getTab === 'function' && tabId) {
    try {
      const desc = getTab(tabId)
      const raw = desc?.title
      const fromDesc = typeof raw === 'function' ? raw() : raw
      if (typeof fromDesc === 'string' && fromDesc.trim() && fromDesc.trim() !== tabId) {
        return fromDesc.trim()
      }
    } catch {
      // fall through
    }
  }
  if (tabId && WORKBENCH_TAB_TITLE_FALLBACKS[tabId]) return WORKBENCH_TAB_TITLE_FALLBACKS[tabId]
  return tabId || ''
}

export function isWorkbenchTab(tabId) {
  if (!tabId || typeof tabId !== 'string') return false
  if (WORKBENCH_OCCUPANTS.includes(tabId)) return true
  return tabId.startsWith('omnimux-') && (tabId.includes(':') || tabId.endsWith('-stage') || tabId.endsWith(':library') || tabId.endsWith(':studio') || tabId.endsWith(':plaza'))
}

export function resolveDefaultFocus(tabId) {
  if (tabId && isWorkbenchTab(tabId) && tabId !== 'omnimux-workflow:canvas') {
    return WORKBENCH_FOCUS.gui
  }
  return WORKBENCH_FOCUS.split
}

/** In-memory focus records: sessionId -> { [tabId]: { mode, splitWidth } } */
const focusStorageBySession = new Map()

const STORAGE_PREFIX = 'omnimux-workbench-focus:v1:'

function sessionKey(explicitId) {
  return explicitId || currentSessionId() || liveSnapshot()?.sessionId || '__none__'
}

export function loadSessionFocusMap(sessionId = sessionKey()) {
  if (focusStorageBySession.has(sessionId)) {
    return focusStorageBySession.get(sessionId)
  }
  let map = {}
  try {
    const raw = hostWindow()?.localStorage?.getItem?.(STORAGE_PREFIX + sessionId)
    if (raw) map = JSON.parse(raw) || {}
  } catch {}
  focusStorageBySession.set(sessionId, map)
  return map
}

export function persistSessionFocus(sessionId, tabId, patch) {
  if (!sessionId || !tabId) return
  const map = loadSessionFocusMap(sessionId)
  map[tabId] = { ...(map[tabId] || {}), ...patch }
  try {
    hostWindow()?.localStorage?.setItem?.(STORAGE_PREFIX + sessionId, JSON.stringify(map))
  } catch {}
}

export function focusRecordForTab(sessionId = sessionKey(), tabId = undefined) {
  const snap = liveSnapshot()
  const effectiveTabId = tabId || activeTabId(snap?.state) || 'default'
  const map = loadSessionFocusMap(sessionId)
  if (!map[effectiveTabId]) {
    map[effectiveTabId] = {
      mode: resolveDefaultFocus(effectiveTabId),
      splitWidth: null,
    }
  }
  return map[effectiveTabId]
}

export function resetWorkbenchFocusMemory() {
  focusStorageBySession.clear()
}

/**
 * Infer the current focus from live panel geometry. Chat = collapsed panel
 * (conversation still mounted). GUI = panel ≈ viewport − left rail. Else split.
 */
export function inferWorkbenchFocus(state, env = {}) {
  if (!state || state.panelOpen === false) return WORKBENCH_FOCUS.chat
  if (typeof state.width === 'number' && nearPx(state.width, workbenchGuiWidthPx(state, env))) {
    return WORKBENCH_FOCUS.gui
  }
  return WORKBENCH_FOCUS.split
}

export function getWorkbenchFocus(env = {}) {
  const snapshot = liveSnapshot()
  const state = snapshot?.state
  if (!state || state.panelOpen === false) return WORKBENCH_FOCUS.chat
  const inferred = inferWorkbenchFocus(state, env)
  const tabId = activeTabId(state)
  const record = focusRecordForTab(snapshot?.sessionId, tabId)

  // Preserve explicit gui intent while the panel is open. A width sized for the
  // collapsed ~56px rail is farther than NEAR from the expanded-rail gui target;
  // rewriting record.mode to split here makes syncWorkbenchGuiWidth no-op and
  // leaves the right panel covering the session list (#356).
  if (record.mode === WORKBENCH_FOCUS.gui && state?.panelOpen !== false) {
    return WORKBENCH_FOCUS.gui
  }
  // Sticky middle-collapse also reports as gui while the right panel is open (#372).
  if (getConversationCollapsed() && state?.panelOpen !== false) {
    return WORKBENCH_FOCUS.gui
  }
  record.mode = inferred
  return inferred
}
