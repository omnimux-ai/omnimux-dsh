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
import { appTabIdFor, forgetOpenAppTab, openAppTabIdFor } from './appLibrary.js'

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
/** 会话对齐超时后的补位监听：一次点击只认最新目标（sessionId → watcher）。 */
const PENDING_ALIGNMENTS = new Map()

/** 测试用：清掉「本会话已写过默认画布比例」记忆。 */
export function resetProjectCanvasRatioMemory() {
  APPLIED_RATIO_SESSIONS.clear()
}

/** 解绑某个会话的补位监听（已被更近一次点击取代、或插件卸载时调用）。 */
function releaseAlignment(sessionId) {
  const watcher = sessionId ? PENDING_ALIGNMENTS.get(sessionId) : undefined
  if (!watcher) return
  PENDING_ALIGNMENTS.delete(sessionId)
  try { watcher.dispose() } catch { /* ignore */ }
}

function releaseAllAlignments() {
  for (const sessionId of [...PENDING_ALIGNMENTS.keys()]) releaseAlignment(sessionId)
}

let boundService = null
let bindingOwner = null

/** Bind a provider for this injection lifetime; return its identity-owned disposer. */
export function bindBetterSidebar(service) {
  // 换绑/卸载：旧服务上的补位监听已无法再等到目标会话，先全部解绑。
  releaseAllAlignments()
  const owner = {}
  bindingOwner = owner
  const installedService = service || null
  boundService = installedService
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
  return () => {
    if (bindingOwner !== owner) return
    bindingOwner = null
    boundService = null
    releaseAllAlignments()
    if (win?.__omnimuxBetterSidebar === installedService) delete win.__omnimuxBetterSidebar
    if (win?.__omnimuxOpenAppTab === openAppTab) delete win.__omnimuxOpenAppTab
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

/** 读普通对象/服务上的属性；Cordis 顶层 ctx 的 Proxy 会在未注入时 throw。 */
function safeProp(target, name) {
  if (!target || typeof target !== 'object') return undefined
  try {
    return target[name]
  } catch {
    return undefined
  }
}

/** 按名字读 Cordis 服务：未注入也能取，未提供时返回 undefined（不 throw）。 */
function serviceByName(target, name) {
  if (!target || typeof target !== 'object') return undefined
  const direct = safeProp(target, name)
  if (direct !== undefined) return direct
  const get = safeProp(target, 'get')
  if (typeof get !== 'function') return undefined
  try {
    return get.call(target, name)
  } catch {
    return undefined
  }
}

/**
 * 现行会话导航接缝。
 *
 * DSH `0.1.7` 起 `ClientSessions.open(id)` 已移除（deepseek-harness
 * 6830e1460d），主区会话导航归 `uiWorkspace.openSession(id)`。这里按
 * 「显式服务 → 懒解析 getter → uiWorkspace → 旧 sessions.open」解析，
 * 既支持走 deps 对象（工作流内部调用）也支持直接传 Cordis 根 ctx。
 *
 * @param {object} [ctx] deps 对象、Cordis ctx 或 { sessionNavigation } / { uiWorkspace }
 * @returns {{ openSession: (id: string) => unknown } | { open: (id: string) => unknown } | null}
 */
export function resolveSessionNavigation(ctx) {
  const isNavigator = (value) => Boolean(value) && typeof value.openSession === 'function'

  const getter = safeProp(ctx, 'getSessionNavigation')
  const lazy = typeof getter === 'function'
    ? (() => {
      try {
        return getter()
      } catch {
        return undefined
      }
    })()
    : undefined

  // deps 对象可能把 Cordis 根 ctx 放在 cordis 上；两处按同一优先级找服务。
  const sources = [ctx, safeProp(ctx, 'cordis')]
  const explicit = safeProp(ctx, 'sessionNavigation')
  if (isNavigator(explicit)) return explicit
  if (isNavigator(lazy)) return lazy
  for (const source of sources) {
    const uiWorkspace = serviceByName(source, 'uiWorkspace')
    if (isNavigator(uiWorkspace)) return uiWorkspace
  }
  for (const source of sources) {
    const sessions = serviceByName(source, 'sessions')
    const open = safeProp(sessions, 'open')
    if (typeof open === 'function') return { open: (id) => open.call(sessions, id) }
  }
  return null
}

/**
 * 打开画布前把目标会话切到前台。
 *
 * 已在前台直接放行；拿不到任何导航能力时返回 `false`——此时继续 `openTab`
 * 只会把画布排进非前台会话的 pending 队列，界面毫无变化，必须让调用方
 * 给出可见失败而不是假装成功。
 *
 * @param {object} ctx
 * @param {string} [sessionId]
 * @param {object | null} [service] 已解析好的 better-sidebar 服务（可选）
 * @returns {boolean}
 */
export function focusSessionForCanvas(ctx, sessionId, service = getBetterSidebar(ctx)) {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!id) return true
  const snapshot = safeProp(service, 'getSnapshot')
  if (typeof snapshot === 'function') {
    let current
    try {
      current = snapshot.call(service)?.sessionId
    } catch {
      current = undefined
    }
    if (current === id) return true
  }
  const navigation = resolveSessionNavigation(ctx)
  if (!navigation) return false
  try {
    if (typeof navigation.openSession === 'function') navigation.openSession(id)
    else navigation.open(id)
    return true
  } catch {
    return false
  }
}

/**
 * 官方右侧栏控制器（ctx.sidebarRight）。用于等「目标会话的右栏 seat 已挂载」：
 * seat 未挂载时 better-sidebar 的 native openTab 会被宿主直接拒绝。
 */
function sidebarRightOf(ctx) {
  for (const source of [ctx, safeProp(ctx, 'cordis')]) {
    const direct = safeProp(source, 'sidebarRight')
    if (direct) return direct
  }
  const getter = safeProp(ctx, 'getSidebarRight')
  if (typeof getter === 'function') {
    try {
      const lazy = getter()
      if (lazy) return lazy
    } catch {
      // ignore: 缺服务时保持旧行为
    }
  }
  for (const source of [ctx, safeProp(ctx, 'cordis')]) {
    const fromCtx = serviceByName(source, 'sidebarRight')
    if (fromCtx) return fromCtx
  }
  return null
}

/** 官方右侧栏当前挂载的会话（无服务/未挂载时 undefined）。 */
function mountedSessionOf(ctx) {
  const mounted = safeProp(sidebarRightOf(ctx), 'mounted')
  if (!mounted || typeof mounted.getSnapshot !== 'function') return { mounted: null, sessionId: undefined }
  try {
    return { mounted, sessionId: mounted.getSnapshot() }
  } catch {
    return { mounted, sessionId: undefined }
  }
}

/**
 * 开画布 tab，并把「右栏没挂载该会话」这类宿主拒绝收敛成结果对象。
 *
 * better-sidebar 的写面在右栏没有挂载目标会话的 seat 时会直接抛
 * `sidebarRight: no session surface is mounted`（而不是排队）。刚切会话时
 * seat 往往晚一步挂载，所以这里不能把异常抛给点击调用方——交给调用方等
 * seat 挂载后重试。
 */
function openCanvasTab(service, seed, scope) {
  try {
    service.openTab(seed, scope)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * 等目标会话成为右栏挂载会话（seat 挂载后才允许 openTab）。
 *
 * @param {object} ctx
 * @param {string} sessionId
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function waitForMountedSession(ctx, sessionId, timeoutMs = 2500) {
  if (!sessionId) return false
  const { mounted, sessionId: current } = mountedSessionOf(ctx)
  if (!mounted) return false
  if (current === sessionId) return true
  const started = Date.now()
  return new Promise((resolve) => {
    let settled = false
    let unsubscribe
    let poll
    let timer
    const finish = (value) => {
      if (settled) return
      settled = true
      try { unsubscribe?.() } catch { /* ignore */ }
      if (poll !== undefined) clearInterval(poll)
      if (timer !== undefined) clearTimeout(timer)
      resolve(value)
    }
    // 订阅可能同步触发：订阅返回后再补一次解绑，避免「先命中、后赋值」的监听残留。
    if (typeof mounted.subscribe === 'function') {
      try {
        unsubscribe = mounted.subscribe(() => {
          if (mountedSessionOf(ctx).sessionId === sessionId) finish(true)
        })
        if (settled) {
          try { unsubscribe?.() } catch { /* ignore */ }
          unsubscribe = undefined
        }
      } catch {
        // ignore: 退化成轮询
      }
    }
    if (settled) return
    poll = setInterval(() => {
      if (mountedSessionOf(ctx).sessionId === sessionId) finish(true)
      else if (Date.now() - started >= timeoutMs) finish(false)
    }, 50)
    timer = setTimeout(() => finish(mountedSessionOf(ctx).sessionId === sessionId), timeoutMs)
  })
}

/** 广播「某个应用被打开」：应用标签页据此切到被点应用（含标签页已挂载的情况）。 */
function announceAppOpen(appId, title, manifest) {
  const win = typeof globalThis !== 'undefined' && globalThis.window
    ? globalThis.window
    : (typeof window !== 'undefined' ? window : undefined)
  if (!win || typeof win.dispatchEvent !== 'function' || typeof win.CustomEvent !== 'function') return
  try {
    win.dispatchEvent(new win.CustomEvent('omnimux-app-open', {
      detail: { id: appId, appId, title, manifest },
    }))
  } catch {
    // ignore: 事件只是加急通道，标签页仍会按 tab 上的 appId 自行解析。
  }
}

/** 解析宿主窗口（与 getBetterSidebar 同一条 globalThis 解析链）。 */
function resolveHostWindow() {
  return typeof globalThis !== 'undefined' && globalThis.window
    ? globalThis.window
    : (typeof window !== 'undefined' ? window : undefined)
}

/**
 * 空会话（新会话页，hero 阶段）打开应用时自动进入官方全屏。
 *
 * 只消费中枢公开缝 `__omnimuxEnterRightSidebarFullscreen`（唯一实现留在中枢
 * host-fullscreen），不复制宿主按钮选择器；全程包在调和器程序化保护里，
 * 这次自动全屏不会被记成用户布局偏好。缝缺失、非空会话、已全屏（中枢 no-op）
 * 或任何抛错都安静降级——应用照常打开，绝不因布局动作失败而阻断。
 *
 * @param {Window} [win]
 * @returns {boolean} 是否实际执行了一次进入全屏动作
 */
export function enterFullscreenWhenBlankConversation(win = resolveHostWindow()) {
  try {
    const doc = win?.document
    if (!doc || typeof doc.querySelector !== 'function') return false
    if (!doc.querySelector('[data-phase="hero"]')) return false
    const enter = win.__omnimuxEnterRightSidebarFullscreen
    if (typeof enter !== 'function') return false
    const rec = win.__omnimuxTabViewport
    try {
      rec?.beginProgrammatic?.()
      return enter(doc) === true
    } finally {
      rec?.endProgrammatic?.()
    }
  } catch {
    return false
  }
}

/**
 * 打开发布生成的独立 AI 应用 Tab。
 *
 * 应用身份靠 `meta.appId` 穿过宿主：宿主 dsh-better-sidebar 启用原生 surface 后
 * 只把 `title` 与 `meta` 转给标签页（`seed.id` 与 `extra` 都会被丢掉），
 * 且同一个 kind 只保留一个标签页——重复打开是「聚焦已存在 + 用新 params 重挂载」，
 * 所以 meta 既要带在 open 上，也要在标签页渲染后由 AppTab 用 updateTab 维持。
 *
 * @param {object} [manifest]
 * @param {{ appId?: string, title?: string, scope?: object }} [opts]
 * @returns {boolean}
 */
export function openAppTab(manifest = {}, opts = {}) {
  const service = getBetterSidebar()
  const appId = typeof manifest?.appId === 'string' && manifest.appId
    ? manifest.appId
    : (typeof opts?.appId === 'string' ? opts.appId : '')
  const title = manifest?.metadata?.name || opts?.title || 'AI 应用'
  if (service && typeof service.openTab === 'function') {
    const fallback = Date.now()
    const tabKey = appId || fallback
    service.openTab({
      type: APP_TAB_ID,
      id: appTabIdFor(appId) || `app_${tabKey}`,
      title,
      path: `app://${tabKey}`,
      meta: { appId },
      extra: { manifest, appId },
    }, opts?.scope)
    announceAppOpen(appId, title, manifest)
    enterFullscreenWhenBlankConversation()
    return true
  }
  return false
}

/**
 * 关闭某个已发布应用的侧栏 Tab（「项目」页「AI应用」卡片删除后的收尾）。
 *
 * 宿主原生 surface 会另发标签页 id（实测形如 `tab6`），`close` 只认这个 id，
 * 认不出就整体放弃；该 id 只有标签页组件读得到，已由 AppTab 登记回
 * `appLibrary` 的登记表。登记表没命中时回落到插件自有面板布局的 `app_<appId>` 约定。
 *
 * @param {string} appId
 * @returns {boolean} 真正调用了 closeTab 才为 true
 */
export function closeAppTab(appId) {
  const id = typeof appId === 'string' ? appId.trim() : ''
  if (!id) return false
  const service = getBetterSidebar()
  if (!service || typeof service.closeTab !== 'function') return false
  const tabId = openAppTabIdFor(id) || appTabIdFor(id)
  if (!tabId) return false
  service.closeTab(tabId)
  forgetOpenAppTab(tabId)
  return true
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
 * 等到右侧栏快照切到目标会话（主区切会话后 store 异步换会话）。
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

/**
 * 会话对齐超时/失败后的最终一致补位（P1-1）。
 *
 * 只订阅 better-sidebar 的快照变化（`subscribeState`；旧服务没有时回落
 * `subscribe`），每次变化都读 `getSnapshot().sessionId`：只有目标会话真正成为
 * 右侧栏前台才补 `openTab` + commit。超时窗口内不写任何 meta，也不向当前会话
 * 降级。目标达成、同一会话被更近一次 activate 取代、或插件换绑/卸载侧栏服务时
 * 解绑。没有订阅能力的假服务（测试）直接放弃，不引入轮询。
 *
 * @param {object | null} service
 * @param {string | undefined} sessionId
 * @param {() => void} onAligned
 * @returns {boolean} 是否挂上了监听
 */
export function watchCanvasForegroundAlignment(service, sessionId, onAligned) {
  if (!service || !sessionId) return false
  const subscribe = typeof service.subscribeState === 'function'
    ? (listener) => service.subscribeState(listener)
    : (typeof service.subscribe === 'function'
      ? (listener) => service.subscribe(listener)
      : null)
  if (!subscribe) return false

  const watcher = { dispose: () => {} }
  let stopped = false
  let unsubscribe = null
  watcher.dispose = () => {
    if (stopped) return
    stopped = true
    try { unsubscribe?.() } catch { /* ignore */ }
    if (PENDING_ALIGNMENTS.get(sessionId) === watcher) PENDING_ALIGNMENTS.delete(sessionId)
  }
  const fireIfForeground = () => {
    if (stopped) return
    let foreground
    try {
      foreground = service.getSnapshot?.()?.sessionId
    } catch {
      return
    }
    if (foreground !== sessionId) return
    watcher.dispose()
    try {
      onAligned()
    } catch (error) {
      console.warn('[omnimux-workflow] canvas tab foreground alignment failed', error)
    }
  }

  releaseAlignment(sessionId)
  try {
    unsubscribe = subscribe(fireIfForeground)
  } catch {
    return false
  }
  // 订阅回调可能在 subscribe 返回前就同步触发；此时 disposer 还没拿到，补一次解绑。
  if (stopped) {
    try { unsubscribe?.() } catch { /* ignore */ }
    return false
  }
  PENDING_ALIGNMENTS.set(sessionId, watcher)
  // 订阅前的窗口里可能已经切到目标会话：立即复核一次，避免永远等不到下一次变化。
  fireIfForeground()
  return !stopped
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
 * 项目会话占用右侧栏：切会话 → 关官方 details → 关空 Files 种子 → 打开画布 → 异步对齐。
 *
 * 时序契约（AC-4）：`openTab` 之前只做同步就绪判定与主区会话切换（`uiWorkspace.openSession`，
 * 旧宿主回退 `sessions.open`），不再等待右侧栏服务、画布 tab 注册或会话切前台
 * （原先是三次最长 4s 的串行等待，tab 出现前界面毫无变化）。
 * 画布先按目标 `scope` + `meta` 打开；会话对齐（等主区切换生效，再补
 * `updateTab` / 广播 `omnimux:active-canvas-changed` / 布局）是 openTab 之后的
 * 异步步骤。对齐超时或失败时 tab 仍绑定目标会话，绝不降级成「不带 scope 打开
 * 到当前会话」；此时改为挂一次快照监听，等目标会话真正成为前台再补
 * `openTab(tabSeed, scope)` + commit（最终一致），监听随成功/换绑/卸载解绑；
 * `meta.canvasSessionId` 的跨会话校验语义保持不变。
 *
 * @param {{ betterSidebar?: object, layout?: { closeDetails?: Function }, t?: Function }} ctx
 * @param {{ sessionId?: string, cwd?: string, focusGroupId?: string, canvasWorkspaceId?: string, projectId?: string, pageId?: string, title?: string, timeoutMs?: number, alignmentTimeoutMs?: number }} [opts]
 *   `focusGroupId`：「项目」页「AI应用」卡片「编辑」的目标工作流组，
 *   写入画布 tab 的 `meta`（契约字段，随布局持久化），由 CanvasTab 读出并透传。
 *   `canvasWorkspaceId`：具体创作页绑定的画布工作区 ID。
 *   `alignmentTimeoutMs`：会话对齐的最长等待，默认沿用 `timeoutMs`（4000ms）。
 * @returns {Promise<boolean>} 画布 tab 是否已在本次调用内打开
 */
export async function activateProjectCanvas(ctx, opts = {}) {
  const service = getBetterSidebar(ctx)
  if (!service || typeof service.openTab !== 'function') return false
  // 画布 tab 类型还没注册时宿主渲染不出画布：同步判定失败、交给用户重试，
  // 不再为「等注册」阻塞 openTab。
  if (typeof service.getTab === 'function' && !service.getTab(CANVAS_TAB_ID)) return false

  const sessionId = opts.sessionId
  // 目标会话不在前台时，先把主区切过去；旧宿主用 sessions.open、现行壳用
  // uiWorkspace.openSession。切换不了就失败：否则 openTab 会被 better-sidebar
  // 排进非前台会话的 pending 队列，用户看到的是「点了没反应」。
  if (!focusSessionForCanvas(ctx, sessionId, service)) return false

  if (typeof ctx?.layout?.closeDetails === 'function') {
    ctx.layout.closeDetails()
  }
  // 本次点击接管该会话的画布目标：作废上一次还没等到前台的补位监听。
  releaseAlignment(sessionId)
  const cwd = opts.cwd
  const canvasWorkspaceId = typeof opts.canvasWorkspaceId === 'string' ? opts.canvasWorkspaceId.trim() : ''
  const scopedCanvasWorkspaceId = sessionId ? canvasWorkspaceId : ''
  const scope = sessionId
    ? { sessionId, ...(cwd ? { cwd } : {}), ...(scopedCanvasWorkspaceId ? { canvasWorkspaceId: scopedCanvasWorkspaceId } : {}) }
    : (canvasWorkspaceId ? { canvasWorkspaceId, ...(cwd ? { cwd } : {}) } : undefined)

  const title = opts.title || (typeof ctx?.t === 'function' ? ctx.t('details.canvasTab') : '创作画布')
  const canvasSessionId = scope?.sessionId ?? sessionId ?? null
  const meta = {
    ...(scopedCanvasWorkspaceId ? { canvasWorkspaceId: scopedCanvasWorkspaceId, canvasSessionId } : {}),
  }
  const tabSeed = {
    type: CANVAS_TAB_ID,
    id: CANVAS_TAB_ID,
    title,
    path: CANVAS_SENTINEL_PATH,
    meta,
  }

  const state = service.getSnapshot?.()?.state
  if (state) {
    const tabs = collectTabs(state.splits).concat(collectTabs(state.bottomSplits))
    for (const tab of tabs) {
      if (isSeedFilesTab(tab) && tab.id && tab.id !== CANVAS_TAB_ID) {
        service.closeTab(tab.id, scope)
      }
    }
  }

  // ① 先让画布出现：上面全是同步调用，openTab 落在本次点击的同一执行栈里。
  // 目标会话刚切过去时右栏可能还没有它的 seat：宿主会直接拒绝（而不再排队），
  // 所以这里等 seat 挂载后重开一次；两次都失败才算打开失败，交给调用方报错。
  let firstOpen = openCanvasTab(service, tabSeed, scope)
  if (!firstOpen.ok && sessionId) {
    const seated = await waitForMountedSession(ctx, sessionId, opts.seatTimeoutMs ?? 2500)
    if (seated) firstOpen = openCanvasTab(service, tabSeed, scope)
  }
  if (!firstOpen.ok) {
    console.warn('[omnimux-workflow] canvas tab open refused', firstOpen.error)
    return false
  }
  const focusGroupId = typeof opts.focusGroupId === 'string' ? opts.focusGroupId.trim() : ''
  // ② 会话已在目标会话前台时的收尾（会话未对齐时由下面的异步步骤补上）。
  const commit = () => {
    // 穿透单例：画布 tab 是 single:true，已打开时重复 openTab 只聚焦、
    // 不会写入新的 meta，必须用 updateTab 显式覆盖（meta 随布局持久化）。
    const nextMeta = {}
    if (focusGroupId) nextMeta.focusGroupId = focusGroupId
    if (scopedCanvasWorkspaceId) nextMeta.canvasWorkspaceId = scopedCanvasWorkspaceId
    if (scopedCanvasWorkspaceId && canvasSessionId) nextMeta.canvasSessionId = canvasSessionId
    if (Object.keys(nextMeta).length > 0 && typeof service.updateTab === 'function') {
      service.updateTab(CANVAS_TAB_ID, { meta: nextMeta })
    }

    // 广播活跃画布变更事件（保证 CanvasTab 即使在单例不重开状态下也能即时收到新工作区 ID）
    if (scopedCanvasWorkspaceId && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimux:active-canvas-changed', {
        detail: { workspaceId: scopedCanvasWorkspaceId, sessionId },
      }))
    }

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
  }

  const foregroundSessionId = typeof service.getSnapshot === 'function' ? service.getSnapshot()?.sessionId : undefined
  if (!sessionId || foregroundSessionId === sessionId) {
    commit()
    return true
  }

  // ③ 主区切换还没落到右侧栏快照：保留已打开的目标会话 tab，后台等会话切到前台，
  // 再补一次带 scope 的 openTab（让右栏按 targeted open 自动展开）+ meta/广播/布局。
  // 超时或失败时 tab 已带 scope 与 meta.canvasSessionId 绑定目标会话，不向当前会话
  // 写 meta，也不重开到别的会话；改为挂一次快照监听，等目标会话真正成为前台再补
  // openTab + commit，保证「点了 B，画布最终一定是 B」。
  const alignmentTimeoutMs = opts.alignmentTimeoutMs ?? opts.timeoutMs ?? 4000
  const commitAfterAlignment = () => {
    const retried = openCanvasTab(service, tabSeed, scope)
    if (!retried.ok) console.warn('[omnimux-workflow] canvas tab re-open refused', retried.error)
    commit()
  }
  void waitForSidebarSession(service, sessionId, alignmentTimeoutMs)
    .then((aligned) => {
      if (aligned) {
        commitAfterAlignment()
        return
      }
      watchCanvasForegroundAlignment(service, sessionId, commitAfterAlignment)
    })
    .catch((error) => {
      console.warn('[omnimux-workflow] canvas tab session alignment failed', error)
      watchCanvasForegroundAlignment(service, sessionId, commitAfterAlignment)
    })
  return true
}

/**
 * 画布 tab 的目标画布工作区 id 解析（Issue #2104）。
 *
 * 优先级（P0 最优先）：显式 scope / tab.meta（项目页点某个创作页进来或 updateTab 穿透）>
 * 本会话内用户选中的创作页 > 本会话所属项目的当前创作页 > 会话散列兜底。
 *
 * 会话级的两项都按 `sessionId` 匹配：换工作区（=换会话）它们立刻失效，
 * 于是画布跟着工作区切，而不是停在上次点过的别的项目的创作页上。
 *
 * @param {{
 *   explicitWorkspaceId?: string | null,
 *   tab?: { meta?: { canvasWorkspaceId?: string | null } } | null,
 *   pickedBySession?: { sessionId?: string | null, workspaceId?: string | null } | null,
 *   sessionBinding?: { sessionId?: string | null, canvasWorkspaceId?: string | null } | null,
 *   sessionId?: string | null,
 *   fallbackWorkspaceId?: string | null,
 * }} [input]
 * @returns {string | undefined}
 */
export function resolveCanvasTargetWorkspaceId(input = {}) {
  const { explicitWorkspaceId, tab, pickedBySession, sessionBinding, sessionId, fallbackWorkspaceId } = input
  const clean = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

  const tabCanvasSessionId = tab?.meta?.canvasSessionId
  const isTabSessionMatched = !tabCanvasSessionId || !sessionId || tabCanvasSessionId === sessionId
  const tabCanvasWsId = isTabSessionMatched ? clean(tab?.meta?.canvasWorkspaceId) : null
  const explicit = clean(explicitWorkspaceId) || tabCanvasWsId
  if (explicit) return explicit

  const hasSession = typeof sessionId === 'string' && sessionId !== ''
  const belongsToSession = (entry) => Boolean(hasSession && entry && typeof entry === 'object' && entry.sessionId === sessionId)

  if (belongsToSession(pickedBySession)) {
    const picked = clean(pickedBySession.workspaceId)
    if (picked) return picked
  }
  if (belongsToSession(sessionBinding)) {
    const bound = clean(sessionBinding.canvasWorkspaceId)
    if (bound) return bound
    if (sessionBinding.project === null) {
      return undefined
    }
  }
  return clean(fallbackWorkspaceId) ?? undefined
}
