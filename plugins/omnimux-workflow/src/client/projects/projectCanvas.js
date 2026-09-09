/**
 * 项目会话的右侧栏隔离。
 *
 * dsh-better-sidebar 是独立面板宿主（[data-dsh-panel-host]），宽度上限是
 * 视口而不是官方 details 的 520px。画布挂到它的 registerTab，而不是 shadow
 * 官方 DetailsPanel。
 *
 * 隔离规则：
 * - 新建会话：不碰 Files 种子，右侧栏保持第三方默认。
 * - 新建/打开项目：关掉官方 details，关掉空 Files 种子，打开画布 tab，
 *   并把本会话右侧栏默认设成对话:画布 = 15:85。
 */
export const CANVAS_TAB_ID = 'omnimux-workflow:canvas'
export const APP_TAB_ID = 'omnimux-workflow:app'
/** 让 better-sidebar 把这次 open 当成 content open，从而自动展开右侧栏。 */
export const CANVAS_SENTINEL_PATH = 'omnimux-workflow:canvas'
/** 项目会话：中间对话 15、右侧画布 85（相对 #root 被推挤后的对话+画布总宽）。 */
export const PROJECT_CANVAS_RATIO = 0.85
/** 现网曾写入的 3:7。shouldApply 把它当磁铁，避免 700/871 被当成人手拖过。 */
export const LEGACY_PROJECT_CANVAS_RATIO = 0.7
/** 与 dsh-better-sidebar PANEL_MIN 对齐，小于这个拖不动。 */
export const PROJECT_CANVAS_MIN_PX = 280
/** 布局按会话存在 localStorage；只在还没人手拖过时写入默认 15:85。 */
export const SIDEBAR_LAYOUT_STORAGE_PREFIX = 'dsh-sidebar:v1'
/** 跟 better-sidebar 设置项对齐：新会话默认宽是视口的 35%，上限 60。 */
export const SIDEBAR_FACTORY_WIDTH_PERCENT = 35
const APPLIED_RATIO_SESSIONS = new Set()

/** 测试用：清掉「本会话已写过默认画布比例」记忆。 */
export function resetProjectCanvasRatioMemory() {
  APPLIED_RATIO_SESSIONS.clear()
}

let boundService = null

/** registerCanvasTab 绑一次，供 newProject 在没有 inject 的 ctx 上取到服务。 */
export function bindBetterSidebar(service) {
  boundService = service || null
  const win = typeof globalThis !== 'undefined' && globalThis.window
    ? globalThis.window
    : (typeof window !== 'undefined' ? window : undefined)
  if (win) {
    try {
      win.__omnimuxBetterSidebar = boundService
      win.__omnimuxOpenAppTab = openAppTab
    } catch {
      // ignore
    }
  }
}

export function getBetterSidebar(ctx) {
  if (ctx && typeof ctx === 'object') {
    try {
      // 普通 deps 对象可以带 betterSidebar；Cordis 顶层 ctx 未 inject 时 Proxy 会 throw。
      if (ctx.betterSidebar) return ctx.betterSidebar
    } catch {
      // ignore: 走 boundService
    }
  }
  const win = typeof globalThis !== 'undefined' && globalThis.window
    ? globalThis.window
    : (typeof window !== 'undefined' ? window : undefined)
  return boundService || win?.__omnimuxBetterSidebar || null
}

/**
 * 打开发布生成的独立 AI 应用 Tab。
 *
 * @param {object} [manifest]
 * @param {{ appId?: string, title?: string, scope?: object }} [opts]
 * @returns {boolean}
 */
export function openAppTab(manifest = {}, opts = {}) {
  const service = getBetterSidebar()
  if (service && typeof service.openTab === 'function') {
    const targetAppId = manifest?.appId || opts?.appId || Date.now()
    const title = manifest?.metadata?.name || opts?.title || 'AI 应用'
    service.openTab({
      type: APP_TAB_ID,
      id: `app_${manifest?.appId || opts?.appId || targetAppId}`,
      title,
      path: `app://${manifest?.appId || opts?.appId || targetAppId}`,
      extra: { manifest, appId: manifest?.appId || opts?.appId || targetAppId },
    }, opts?.scope)
    return true
  }
  return false
}

// 安全同步挂载至 globalThis.window.__omnimuxOpenAppTab
const globalWin = typeof globalThis !== 'undefined' && globalThis.window
  ? globalThis.window
  : (typeof window !== 'undefined' ? window : undefined)
if (globalWin) {
  try {
    globalWin.__omnimuxOpenAppTab = openAppTab
  } catch {
    // ignore
  }
}

/** workflow 与 better-sidebar 谁先加载不确定，新建项目时可能还没 provide。 */
export async function waitForBetterSidebar(ctx, timeoutMs = 4000) {
  const first = getBetterSidebar(ctx)
  if (first && typeof first.openTab === 'function') return first
  if (timeoutMs <= 0) return first
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    const service = getBetterSidebar(ctx)
    if (service && typeof service.openTab === 'function') return service
    await waitMs(50)
  }
  return getBetterSidebar(ctx)
}

/**
 * 递归收集 split 树上的 tab（不依赖第三方内部 allLeaves）。
 * @param {object | null | undefined} node
 * @returns {Array<{ id: string, type: string, path?: string }>}
 */
export function collectTabs(node) {
  if (!node || typeof node !== 'object') return []
  if (node.kind === 'leaf') return Array.isArray(node.tabs) ? node.tabs : []
  if (!Array.isArray(node.children)) return []
  return node.children.flatMap(collectTabs)
}

/**
 * 空 Files 种子：type=editor 且没有路径。带路径的编辑器 tab 是用户自己开的，不动。
 * @param {{ type?: string, path?: string }} tab
 */
export function isSeedFilesTab(tab) {
  return tab?.type === 'editor' && (tab.path === undefined || tab.path === '')
}

function waitMs(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function readStoredLayout(sessionId) {
  if (typeof localStorage === 'undefined' || !sessionId) return null
  try {
    const raw = localStorage.getItem(`${SIDEBAR_LAYOUT_STORAGE_PREFIX}:${sessionId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeStoredLayout(sessionId, state) {
  if (typeof localStorage === 'undefined' || !sessionId || !state) return false
  try {
    localStorage.setItem(`${SIDEBAR_LAYOUT_STORAGE_PREFIX}:${sessionId}`, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function viewportWidth() {
  return typeof window === 'undefined' ? 0 : window.innerWidth || 0
}

function conversationColumnWidth() {
  if (typeof document === 'undefined') return 0
  const node = document.querySelector('#root [data-slot="conversation"]')?.parentElement
    || document.querySelector('#root [data-pane="conversation"]')
  const width = node?.getBoundingClientRect?.().width
  return typeof width === 'number' && Number.isFinite(width) ? width : 0
}

function currentPanelWidth(state) {
  return typeof state?.width === 'number' && Number.isFinite(state.width)
    ? Math.max(0, state.width)
    : 0
}

function envConversationWidth(env) {
  return typeof env.conversationWidth === 'number'
    ? env.conversationWidth
    : conversationColumnWidth()
}

function envViewportWidth(env) {
  return typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
}

/**
 * 官方左侧会话栏宽度。优先测试/调用方注入；否则量 `[data-pane="sidebar"]`
 * 或侧栏列（与 hub coordinator 相同选择器）。量不到返回 0。
 *
 * @param {{ officialSidebarWidth?: number }} [env]
 * @returns {number}
 */
export function officialSessionSidebarWidth(env = {}) {
  if (typeof env.officialSidebarWidth === 'number' && Number.isFinite(env.officialSidebarWidth)) {
    return Math.max(0, env.officialSidebarWidth)
  }
  if (typeof document === 'undefined') return 0
  const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
  const width = column instanceof HTMLElement ? column.getBoundingClientRect().width : 0
  return typeof width === 'number' && Number.isFinite(width) ? width : 0
}

/**
 * 默认画布比例分母：视口 − 官方会话栏。量不到官方栏时才用对话列 + 当前右栏反推。
 * leftover overlay 不能当尺子（crush 后 leftover=811 会把目标算飞/误判人手拖过）。
 *
 * @param {{ width?: number, panelOpen?: boolean } | null | undefined} state
 * @param {{ conversationWidth?: number, viewportWidth?: number, officialSidebarWidth?: number }} [env]
 * @returns {number}
 */
export function projectCanvasUsableWidthPx(state, env = {}) {
  const viewport = envViewportWidth(env)
  const official = officialSessionSidebarWidth(env)
  if (viewport > 0 && official > 0) return Math.max(0, viewport - official)
  const conversation = envConversationWidth(env)
  const extra = state?.panelOpen === false ? 0 : currentPanelWidth(state)
  return conversation > 0 ? conversation + extra : 0
}

/**
 * better-sidebar 工厂默认宽：视口 × defaultWidthPercent（缺省 35）。
 * 跟「对话+画布 15:85」不是同一套尺子，判定「人手拖过」时要拿来对照。
 *
 * @param {{ defaultWidthPercent?: number } | null | undefined} prefs
 * @param {{ viewportWidth?: number }} [env]
 * @returns {number}
 */
export function factorySidebarWidthPx(prefs, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  const percent = typeof prefs?.defaultWidthPercent === 'number' && Number.isFinite(prefs.defaultWidthPercent)
    ? prefs.defaultWidthPercent
    : SIDEBAR_FACTORY_WIDTH_PERCENT
  if (!(viewport > 0)) return PROJECT_CANVAS_MIN_PX
  return Math.max(PROJECT_CANVAS_MIN_PX, Math.round(viewport * percent / 100))
}

/** 会话输入窗口标准舒适宽度（保证标题单行舒展、输入框与模式胶囊无畸变）。 */
export const PROJECT_CONVERSATION_TARGET_WIDTH_PX = 420
/** 会话输入窗口最小保底宽度。 */
export const PROJECT_CONVERSATION_MIN_WIDTH_PX = 360

/**
 * 画布宽度自适应计算：
 * 保持会话输入窗口处于恒定舒适宽度（约 420px），
 * 当左侧工作区侧边栏展开或收起时，由右侧画布去自适应扩展或收缩，
 * 避免中间会话窗口被挤压变形。
 *
 * @param {{ width?: number, panelOpen?: boolean } | null | undefined} state
 * @param {{ conversationWidth?: number, viewportWidth?: number, officialSidebarWidth?: number }} [env]
 * @returns {number}
 */
export function projectCanvasWidthPx(state, env = {}) {
  const viewport = envViewportWidth(env)
  const max = viewport > 0 ? Math.max(PROJECT_CANVAS_MIN_PX, viewport) : PROJECT_CANVAS_MIN_PX
  const usable = projectCanvasUsableWidthPx(state, env)
  if (usable <= 0) {
    const raw = viewport > 0 ? Math.max(PROJECT_CANVAS_MIN_PX, viewport - PROJECT_CONVERSATION_TARGET_WIDTH_PX) : PROJECT_CANVAS_MIN_PX
    return Math.min(max, raw)
  }

  // 保证会话窗口恒定在舒适宽度（420px），多余的所有视口宽度全部归右侧画布自适应扩展
  let targetCanvasWidth = usable - PROJECT_CONVERSATION_TARGET_WIDTH_PX
  if (targetCanvasWidth < PROJECT_CANVAS_MIN_PX) {
    targetCanvasWidth = usable - PROJECT_CONVERSATION_MIN_WIDTH_PX
  }
  return Math.min(max, Math.max(PROJECT_CANVAS_MIN_PX, Math.round(targetCanvasWidth)))
}

function liveWidth(state) {
  if (typeof state?.width === 'number' && Number.isFinite(state.width)) return state.width
  return null
}

/**
 * leftover overlay 常把右栏量成 usable / 视口的一半（现网看起来 1:1）。
 * 这是宿主默认，不是人手拖过。
 *
 * @param {{ width?: number, panelOpen?: boolean } | null | undefined} state
 * @param {{ conversationWidth?: number, viewportWidth?: number, officialSidebarWidth?: number }} [env]
 * @returns {number}
 */
export function leftoverHalfSidebarWidthPx(state, env = {}) {
  const usable = projectCanvasUsableWidthPx(state, env)
  if (usable > 0) return Math.max(PROJECT_CANVAS_MIN_PX, Math.round(usable * 0.5))
  const viewport = envViewportWidth(env)
  if (viewport > 0) return Math.max(PROJECT_CANVAS_MIN_PX, Math.round(viewport * 0.5))
  return PROJECT_CANVAS_MIN_PX
}

function nearPx(width, target) {
  return Math.abs(width - target) <= 24
}

/**
 * 现网 3:7 默认宽。官方栏>0 时尺子是视口 − 官方栏；否则 conversation+panel；
 * usable 为 0 时退回视口 × 0.7。贴近这个宽不算人手拖过。
 *
 * @param {{ width?: number, panelOpen?: boolean } | null | undefined} state
 * @param {{ conversationWidth?: number, viewportWidth?: number, officialSidebarWidth?: number }} [env]
 * @returns {number}
 */
export function legacyProjectCanvasWidthPx(state, env = {}) {
  const viewport = envViewportWidth(env)
  const usable = projectCanvasUsableWidthPx(state, env)
  if (usable > 0) return Math.round(usable * LEGACY_PROJECT_CANVAS_RATIO)
  if (viewport > 0) return Math.round(viewport * LEGACY_PROJECT_CANVAS_RATIO)
  return PROJECT_CANVAS_MIN_PX
}

/**
 * 工厂 35% 不能当「人手拖过」：它和默认画布比例差必超过 24px。
 * leftover overlay 把对话列压到 usable 的 22% 以下时也要写（crush，不是人手拖）。
 * leftover 把右栏摆成 ~50%（现网 1:1）也要写。
 * 已接近 15:85、接近旧 70%、接近工厂视口 35%、接近工厂 usable 35%、接近 leftover 一半 → 写；
 * 偏离这些磁铁都 >24 且对话列比例正常 → 用户拖过，跳过。
 * 同一会话本次打开只写一次，避免把刚拖的宽度盖回去。
 *
 * @param {string | undefined} sessionId
 * @param {{ width?: number, panelOpen?: boolean } | null | undefined} state
 * @param {{ defaultWidthPercent?: number } | null | undefined} [prefs]
 * @param {{ conversationWidth?: number, viewportWidth?: number, officialSidebarWidth?: number }} [env]
 * @returns {boolean}
 */
export function shouldApplyProjectCanvasRatio(sessionId, state, prefs, env = {}, force = false) {
  if (!sessionId || !state) return false
  if (force) return true
  if (APPLIED_RATIO_SESSIONS.has(sessionId)) return false
  const width = liveWidth(state)
  if (typeof width !== 'number') return true
  const expected = projectCanvasWidthPx(state, env)
  if (nearPx(width, expected)) return true
  if (nearPx(width, legacyProjectCanvasWidthPx(state, env))) return true
  const factoryViewport = factorySidebarWidthPx(prefs, env)
  if (nearPx(width, factoryViewport)) return true
  const usable = projectCanvasUsableWidthPx(state, env)
  const percent = typeof prefs?.defaultWidthPercent === 'number' && Number.isFinite(prefs.defaultWidthPercent)
    ? prefs.defaultWidthPercent
    : SIDEBAR_FACTORY_WIDTH_PERCENT
  const factoryUsable = usable > 0
    ? Math.max(PROJECT_CANVAS_MIN_PX, Math.round(usable * percent / 100))
    : factoryViewport
  if (nearPx(width, factoryUsable)) return true
  if (nearPx(width, leftoverHalfSidebarWidthPx(state, env))) return true
  const viewport = envViewportWidth(env)
  if (viewport > 0 && nearPx(width, Math.max(PROJECT_CANVAS_MIN_PX, Math.round(viewport * 0.5)))) return true
  const conversation = envConversationWidth(env)
  if (conversation > 0 && usable > 0 && conversation / usable < 0.22) return true
  return false
}

/**
 * 项目会话默认宽。公开 API 没有 setWidth：必须落到 tab 的 store.reduce
 *（它会持久化并刷 CSS）。没有 store 时可以先写 `dsh-sidebar:v1:<sessionId>`
 * 给 reload，但必须继续等 live reduce，不能把「只写了盘」当成成功。
 *
 * 返回：数字 = 已落到 live store（或 live 已是目标宽）；
 * `undefined` = 还不能刷 CSS，过一会再试（量不到 / 没有 store.reduce）；
 * `null` = 跳过（人手拖过 / 本会话已写过）。
 *
 * @param {object | null} service
 * @param {string | undefined} sessionId
 * @param {{ reduce?: Function, getSnapshot?: Function, getPrefs?: Function } | null} [store]
 * @param {{ conversationWidth?: number, viewportWidth?: number, officialSidebarWidth?: number }} [env]
 * @param {boolean} [force]
 * @returns {number | null | undefined}
 */
export function applyProjectCanvasRatio(service, sessionId, store = null, env = {}, force = false) {
  const workbench = typeof globalThis.window !== 'undefined' ? globalThis.window.__omnimuxWorkbench : undefined
  const focus = typeof workbench?.getFocus === 'function' ? workbench.getFocus() : 'split'
  if (focus === 'gui' || focus === 'chat') return null
  const snapshot = (typeof store?.getSnapshot === 'function' ? store.getSnapshot() : null)
    || service?.getSnapshot?.()
  const state = snapshot?.state
  const prefs = typeof store?.getPrefs === 'function' ? store.getPrefs() : undefined
  if (!shouldApplyProjectCanvasRatio(sessionId, state, prefs, env, force)) return null
  const conversation = envConversationWidth(env)
  const viewport = envViewportWidth(env)
  const official = officialSessionSidebarWidth(env)
  // 量得到「视口 − 官方栏」就能算默认画布比例；对话列为 0 只在没有官方栏尺子时才等。
  if (conversation <= 0 && !(viewport > 0 && official > 0)) return undefined
  const current = liveWidth(state) || 0
  // leftover overlay 不挤对话列：折叠官方栏时 conversation+current 会一直 > viewport。
  // 量到官方栏就用「视口 − 官方栏」算默认画布比例，不要再等挤压。量不到才等。
  if (
    official <= 0
    && state.panelOpen !== false
    && current > 0
    && viewport > 0
    && conversation + current > viewport
  ) {
    return undefined
  }
  const nextWidth = projectCanvasWidthPx(state, env)
  const canReduce = snapshot?.sessionId === sessionId && typeof store?.reduce === 'function'
  if (typeof state.width === 'number' && Math.abs(state.width - nextWidth) < 1) {
    // live 已是目标宽：有 store 才算刷过 CSS，没有 store 继续等 reduce。
    if (!canReduce) return undefined
    APPLIED_RATIO_SESSIONS.add(sessionId)
    return nextWidth
  }

  if (canReduce) {
    store.reduce((currentState) => (
      typeof currentState?.width === 'number' && Math.abs(currentState.width - nextWidth) < 1
        ? currentState
        : { ...currentState, width: nextWidth }
    ))
    APPLIED_RATIO_SESSIONS.add(sessionId)
    return nextWidth
  }

  // 先写盘给 reload 用；没碰到内存 store 不算生效，CanvasTab 必须继续等 reduce。
  const stored = readStoredLayout(sessionId) || {}
  writeStoredLayout(sessionId, { ...stored, ...state, width: nextWidth })
  return undefined
}

/**
 * 等到右侧栏快照切到目标会话（sessions.open 后 store 异步换会话）。
 * @param {object} service
 * @param {string} sessionId
 * @param {number} [timeoutMs]
 */
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

/** 等到画布 tab 已 register（workflow 与 better-sidebar 加载顺序不确定）。 */
export async function waitForCanvasTab(service, timeoutMs = 4000) {
  if (!service || typeof service.getTab !== 'function') return false
  if (service.getTab(CANVAS_TAB_ID)) return true
  if (timeoutMs <= 0) return false
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (service.getTab(CANVAS_TAB_ID)) return true
    await waitMs(50)
  }
  return Boolean(service.getTab(CANVAS_TAB_ID))
}

/**
 * 项目会话占用右侧栏：关官方 details → 关空 Files 种子 → 打开画布。
 * @param {{ betterSidebar?: object, layout?: { closeDetails?: Function }, t?: Function }} ctx
 * @param {{ sessionId?: string, cwd?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export async function activateProjectCanvas(ctx, opts = {}) {
  if (typeof ctx?.layout?.closeDetails === 'function') {
    ctx.layout.closeDetails()
  }
  const timeoutMs = opts.timeoutMs ?? 4000
  const service = await waitForBetterSidebar(ctx, timeoutMs)
  if (!service || typeof service.openTab !== 'function') return false
  const registered = await waitForCanvasTab(service, timeoutMs)
  if (!registered) return false

  const sessionId = opts.sessionId
  const cwd = opts.cwd
  const scope = sessionId ? { sessionId, ...(cwd ? { cwd } : {}) } : undefined

  const ready = sessionId ? await waitForSidebarSession(service, sessionId, timeoutMs) : true
  // 会话已在前台时带着 scope 打开会自动展开面板；仍在后台则不带 scope，
  // 避免 targeted open 不撑开（better-sidebar 对非当前会话禁止 auto-expand）。
  const openScope = ready ? scope : undefined

  const state = service.getSnapshot?.()?.state
  if (state) {
    const tabs = collectTabs(state.splits).concat(collectTabs(state.bottomSplits))
    for (const tab of tabs) {
      if (isSeedFilesTab(tab) && tab.id && tab.id !== CANVAS_TAB_ID) {
        service.closeTab(tab.id, openScope)
      }
    }
  }

  const title = typeof ctx.t === 'function' ? ctx.t('details.canvasTab') : '画布'
  service.openTab({
    type: CANVAS_TAB_ID,
    id: CANVAS_TAB_ID,
    title,
    path: CANVAS_SENTINEL_PATH,
  }, openScope)

  // Enter-Conversation Intent：从一级库（gui + conversationCollapsed）新建/打开项目时，
  // 必须显式解除中间会话栏折叠并切到 split，否则 conversation-collapse.css 会把
  // centerCol 藏成黑屏占位，且 applyProjectCanvasRatio 因 getFocus()==='gui' 直接跳过。
  // 与 omnimux-inspiration #552 revealConversationColumn 对齐。
  const workbench = typeof globalThis.window !== 'undefined' ? globalThis.window.__omnimuxWorkbench : undefined
  if (workbench) {
    try { workbench.setConversationCollapsed?.(false, { sessionId }) } catch { /* ignore */ }
    try { workbench.setFocus?.('split') } catch { /* ignore */ }
  }

  // force：新建项目会话尚无人手拖拽记录，必须写入 15:85；此前 focus 已切 split，
  // 不会再被 gui/chat 守卫挡回。
  applyProjectCanvasRatio(service, sessionId, null, {}, true)
  return true
}
