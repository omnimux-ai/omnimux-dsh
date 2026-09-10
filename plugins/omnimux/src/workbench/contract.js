/**
 * Workbench 中枢契约（browser-safe，Host 与 Client 共用单真源）。
 *
 * 统一出口：
 * - `WORKBENCH_OCCUPANTS`：workbench Tab occupant 单真源（此前在
 *   `src/workbench/schema.js` 与 `src/client/workbench.js` 各重复一份）。
 * - `WORKBENCH_FOCUS`：chat / gui / split 焦点模式。
 * - Envelope / Surface / Context / SidebarSnapshot JSDoc 类型。
 * - 信封与快照的验证/判定纯函数。
 *
 * 本模块禁止依赖 DOM、window 或 Node API，保证浏览器与 Host 两侧均可消费。
 */

/**
 * Workbench Tab occupant 单真源。
 * @type {readonly string[]}
 */
export const WORKBENCH_OCCUPANTS = Object.freeze([
  'omnimux-workflow:canvas',
  'omnimux-clip:studio',
  'omnimux-assets:library',
  'omnimux-products:library',
  'omnimux-forms:tasks',
  'omnimux-accounts:library',
  'omnimux-inspiration:library',
  'omnimux-publish:library',
  'omnimux-analytics:library',
  'omnimux-workflow:library',
  'omnimux-market:plaza',
])

/** 焦点模式：chat = 仅会话（右栏关闭），gui = 面板铺满，split = 会话+面板分栏。 */
export const WORKBENCH_FOCUS = Object.freeze({
  split: 'split',
  gui: 'gui',
  chat: 'chat',
})

export const VIEWPORT_STALE_THRESHOLD_MS = 3000

/**
 * 官方 better-sidebar 快照（当前 pin 的唯一合法形状）。
 * 不允许 `snap.state || snap` 式兼容猜测：没有 `.state` 即视为无状态。
 * @typedef {object} SidebarSnapshot
 * @property {string} [sessionId]
 * @property {object} [state] better-sidebar 布局状态（splits / width / panelOpen …）
 */

/**
 * workbench 表面状态：当前活跃 Tab 与面板几何投影。
 * @typedef {object} WorkbenchSurface
 * @property {string | null} tabId
 * @property {string | null} title
 * @property {string | null} type
 * @property {'workbench' | 'files' | 'native' | null} kind
 * @property {string | null} plugin
 * @property {boolean} panelOpen
 * @property {'split' | 'gui' | 'chat'} focus
 * @property {boolean} conversationCollapsed
 * @property {Array<{ id: string, type: string, title: string, kind: string }>} openedTabs
 */

/**
 * Agent 可见的上下文视图（由 Context contributor 投影）。
 * @typedef {object} WorkbenchContextView
 * @property {string} [kind]
 * @property {string} [pageId]
 * @property {string} [filterType]
 * @property {string} [query]
 * @property {Record<string, unknown>} [extra] 仅白名单键可外泄；`workspaceId` 必须为纯逻辑 ID。
 */

/**
 * UI 上下文信封：Client `getUiContext()` 产出、Host mailbox 消费。
 * @typedef {object} WorkbenchEnvelope
 * @property {1} schemaVersion
 * @property {boolean} ok
 * @property {number} capturedAt
 * @property {string} reason
 * @property {string} sessionId
 * @property {WorkbenchSurface} surface
 * @property {WorkbenchContextView | null} view
 * @property {Array<Record<string, unknown>>} selection
 */

/**
 * 严格 occupant 判定（Host 工具侧白名单）。
 * @param {unknown} tabId
 */
export function isValidTabId(tabId) {
  return typeof tabId === 'string' && WORKBENCH_OCCUPANTS.includes(tabId)
}

/**
 * @param {unknown} raw
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return { valid: false, error: 'envelope-must-be-object' }
  if (raw.schemaVersion !== 1) return { valid: false, error: 'invalid-schema-version' }
  if (typeof raw.ok !== 'boolean') return { valid: false, error: 'ok-must-be-boolean' }
  if (typeof raw.capturedAt !== 'number') return { valid: false, error: 'capturedAt-must-be-number' }
  return { valid: true }
}

/**
 * @param {{ capturedAt?: unknown } | null | undefined} viewport
 * @param {number} [now]
 */
export function isViewportStale(viewport, now = Date.now()) {
  if (!viewport || typeof viewport.capturedAt !== 'number') return true
  return now - viewport.capturedAt > VIEWPORT_STALE_THRESHOLD_MS
}

/**
 * @param {unknown} body
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateRpcAck(body) {
  if (!body || typeof body !== 'object') return { valid: false, error: 'body-must-be-object' }
  if (!body.requestId || typeof body.requestId !== 'string') return { valid: false, error: 'requestId-required' }
  if (typeof body.ok !== 'boolean') return { valid: false, error: 'ok-must-be-boolean' }
  if (typeof body.applied !== 'boolean') return { valid: false, error: 'applied-must-be-boolean' }
  return { valid: true }
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
 * @param {WorkbenchEnvelope} envelope
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
