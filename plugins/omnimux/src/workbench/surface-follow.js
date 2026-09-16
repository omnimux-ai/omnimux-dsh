/**
 * 工作面自动跟随（Surface Follow-Focus）
 *
 * 右侧工作台应该显示 Agent 正在处理的那个工作面，而不是等 Agent 自己记得去切。
 * 本模块在宿主侧观察正在执行的工具，按「工具 → 工作面」映射推导目标页签，并复用
 * 既有 mailbox RPC 通道（与 `workbench_open_tab` 同一条）完成切换。
 *
 * 三道防打扰规则（与主功能同批交付）：
 *   1. 用户优先   —— 用户在本轮内手动切走，本轮立即停用自动跟随；
 *   2. 防抖动     —— 同一轮内同一工作面只自动切一次；
 *   3. 收起不打扰 —— 右侧面板收起时不自动弹出。
 * 另：自动跟随不消耗 Agent 的每会话切换配额。
 */

/** 工具名前缀/全名 → 工作台页签。顺序敏感：先匹配长前缀。 */
const SURFACE_RULES = Object.freeze([
  { match: /^canvas_/, tabId: 'omnimux-workflow:canvas' },
  { match: /^workflow_/, tabId: 'omnimux-workflow:canvas' },
  { match: /^clip_/, tabId: 'omnimux-clip:studio' },
  { match: /^products_/, tabId: 'omnimux-products:library' },
  { match: /^inspiration_/, tabId: 'omnimux-inspiration:library' },
  { match: /^omnimux_inspiration_/, tabId: 'omnimux-inspiration:library' },
  { match: /^omnimux_image_/, tabId: 'omnimux:media-viewer' },
  { match: /^image_generate$/, tabId: 'omnimux:media-viewer' },
  { match: /^image_edit$/, tabId: 'omnimux:media-viewer' },
])

/**
 * 解析某个工具属于哪个工作面。
 * @param {unknown} toolName
 * @returns {string | null} 目标页签；不属于任何工作面时返回 null
 */
export function resolveSurfaceForTool(toolName) {
  if (typeof toolName !== 'string' || toolName.length === 0) return null
  const name = toolName.replace(/^.*:/, '')
  for (const rule of SURFACE_RULES) {
    if (rule.match.test(name)) return rule.tabId
  }
  return null
}

/**
 * @param {{ allowAutoSurfaceFollow?: boolean, allowAgentSwitchTab?: boolean }} [settings]
 * @returns {boolean} 自动跟随是否启用
 */
export function isAutoFollowEnabled(settings) {
  if (!settings) return true
  // 用户既然关掉了「允许 Agent 控制切换」，自动跟随也一并尊重该意图。
  if (settings.allowAgentSwitchTab === false) return false
  return settings.allowAutoSurfaceFollow !== false
}

/**
 * 纯决策函数：给定上下文，判断本次是否应该自动切换。
 *
 * @param {{
 *   follow: { enabled: boolean, mutedSessionId?: string|null, mutedTurn?: number|null,
 *             followedTabIds?: Set<string>, lastAutoTabId?: string|null },
 *   toolName: string,
 *   turn: number,
 *   sessionId: string,
 *   activeTabId?: string|null,
 *   panelOpen?: boolean,
 * }} input
 * @returns {{ action: 'switch', tabId: string } | { action: 'skip', code: string }}
 */
export function decideSurfaceFollow(input) {
  const { follow, toolName, turn, sessionId, activeTabId = null, panelOpen = true } = input || {}
  if (!follow?.enabled) return { action: 'skip', code: 'disabled' }
  if (follow.mutedSessionId && follow.mutedSessionId === sessionId && follow.mutedTurn === turn) {
    return { action: 'skip', code: 'user-took-over' }
  }
  const tabId = resolveSurfaceForTool(toolName)
  if (!tabId) return { action: 'skip', code: 'not-a-surface-tool' }
  if (!panelOpen) return { action: 'skip', code: 'panel-collapsed' }
  if (activeTabId === tabId) return { action: 'skip', code: 'already-active' }
  if (follow.followedTabIds?.has(tabId)) return { action: 'skip', code: 'already-followed-this-turn' }
  return { action: 'switch', tabId }
}

/**
 * 用户是否在本轮内手动接管了画面。
 * 上一轮我们自动切到 A，现在当前页签既不是 A 也不是我们这次想去的目标 → 用户自己动过。
 *
 * @param {{ lastAutoTabId?: string|null, activeTabId?: string|null, targetTabId: string }} input
 */
export function isUserTakeover({ lastAutoTabId, activeTabId, targetTabId }) {
  if (!lastAutoTabId || !activeTabId) return false
  return activeTabId !== lastAutoTabId && activeTabId !== targetTabId
}

/**
 * 挂载工作面自动跟随。
 *
 * @param {object} ctx Cordis context
 * @param {{
 *   mailbox: { getActiveView: (sessionId?: string) => { ok: boolean, uiContext?: object }, sendRpc: (payload: object) => Promise<object> },
 *   getSettings?: () => ({ allowAutoSurfaceFollow?: boolean, allowAgentSwitchTab?: boolean } | null),
 * }} deps
 * @returns {() => void} disposer
 */
export function mountSurfaceFollow(ctx, deps) {
  if (!ctx || typeof ctx.on !== 'function') return () => {}
  const mailbox = deps?.mailbox
  if (!mailbox || typeof mailbox.sendRpc !== 'function') return () => {}
  const getSettings = typeof deps.getSettings === 'function' ? deps.getSettings : () => null

  /** @type {{ mutedSessionId: string|null, mutedTurn: number|null, turn: number, sessionId: string, followedTabIds: Set<string>, lastAutoTabId: string|null }} */
  const state = {
    mutedSessionId: null,
    mutedTurn: null,
    turn: 0,
    sessionId: '',
    followedTabIds: new Set(),
    lastAutoTabId: null,
  }

  const off = ctx.on('tools/execute', async (exec, next) => {
    try {
      const sessionId = exec?.agent?.session?.id || ''
      const turn = Number.isFinite(exec?.turn) ? exec.turn : 0
      if (turn !== state.turn || sessionId !== state.sessionId) {
        state.turn = turn
        state.sessionId = sessionId
        state.followedTabIds = new Set()
      }

      const settings = getSettings()
      const enabled = isAutoFollowEnabled(settings)
      const view = mailbox.getActiveView(sessionId)
      const surface = view?.uiContext?.surface
      const activeTabId = surface?.tabId || null
      const panelOpen = surface?.panelOpen !== false

      // 用户已在本轮手动接管 → 本轮不再自动跟随，并在无工具消费时快速返回。
      const tabIdForTool = resolveSurfaceForTool(exec?.name)
      if (tabIdForTool && isUserTakeover({ lastAutoTabId: state.lastAutoTabId, activeTabId, targetTabId: tabIdForTool })) {
        state.mutedSessionId = sessionId
        state.mutedTurn = turn
      }

      const decision = decideSurfaceFollow({
        follow: {
          enabled,
          mutedSessionId: state.mutedSessionId,
          mutedTurn: state.mutedTurn,
          followedTabIds: state.followedTabIds,
          lastAutoTabId: state.lastAutoTabId,
        },
        toolName: exec?.name,
        turn,
        sessionId,
        activeTabId,
        panelOpen,
      })

      if (decision.action === 'switch') {
        state.followedTabIds.add(decision.tabId)
        state.lastAutoTabId = decision.tabId
        await mailbox.sendRpc({
          requestId: `follow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          method: 'open',
          tabId: decision.tabId,
          path: decision.tabId,
          reason: 'auto-surface-follow',
          previousTabId: activeTabId,
          sessionId,
          auto: true,
        })
      }
    } catch {
      // 自动跟随是体验增强，失败绝不阻断工具执行。
    }
    return next()
  })

  return () => {
    off?.()
  }
}

/** 供设置页与测试引用的映射表快照。 */
export const SURFACE_MAP = Object.freeze(
  SURFACE_RULES.map((rule) => ({ pattern: String(rule.match), tabId: rule.tabId })),
)
