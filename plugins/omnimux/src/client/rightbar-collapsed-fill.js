/**
 * 会话列收起态的面板宽度写入（width write path）。
 *
 * 收起态（`html[data-omnimux-conversation-collapsed]`）的设计意图是「右栏铺满剩余跨度」：
 * 帧网格第三轨被撑到全宽、投影输入框座席也按同一跨度居中。但原生面板是
 * `position: fixed; right: 0` 的视口右锚元素，宽度由外壳按自身比例写在内联样式上，
 * 与网格轨道无关 —— 于是轨道里被撑开的部分没有归属者（实测 776px 无主空带），
 * 输入框卡片也会压在面板左缘上（实测 364px）。
 *
 * 为什么必须走内联写入而不是样式表：外壳给该面板声明了 `transition: width`，
 * 而层叠顺序中「过渡中的值」优先于 author 的 `!important` 声明 —— 样式表里再强的
 * 宽度都会被过渡值压住（CDP 实测：规则匹配、内联为普通优先级，计算宽度仍回到外壳值）。
 * 因此这里同时做两件事：暂时中和该元素的过渡，并把宽度以内联 + important 写入。
 *
 * 外壳会在重渲染时重写内联宽度，所以本模块必须**持有**它：面板 `style` 属性上挂
 * 观察者，一旦被改写就按目标值回写；收起态解除或面板关闭时立即松手，把几何还给外壳。
 *
 * @see ./sidebar-toggle-topbar.js 原生面板几何的模式所有者（本模块由 chrome 装配层安装）
 * @see ./conversation-collapse.js 收起态属性与投影座席的来源
 */

/** 收起态标记属性（由 conversation-collapse.js 写入 html）。 */
export const COLLAPSED_ATTR = 'data-omnimux-conversation-collapsed'
/** 左栏收起标记属性（收起时座席左基准为 0）。 */
export const LEFT_COLLAPSED_ATTR = 'data-omnimux-left-collapsed'
/** 已打开的原生右栏面板。 */
export const PANEL_SELECTOR = '[data-sidebar-right-panel][data-sidebar-right-open]'
/** 左侧导航容器：其右边界就是收起态的跨度起点。 */
export const LEFT_RAIL_SELECTOR = '.dshDesktopSidebarSurface'
/** 本模块持有几何时打在面板上的标记（便于排查与断言）。 */
export const FILL_MARK_ATTR = 'data-omnimux-collapsed-fill'

/**
 * 计算收起态下面板应占据的横向跨度：从收起态跨度起点到视口右缘。
 * 左栏收起时起点是 0（与座席的左基准同源），否则是左栏的右边界。
 *
 * @param {{ viewportWidth?: number, leftRailRight?: number, leftCollapsed?: boolean }} [env]
 * @returns {number} 像素宽度；无法测量时返回 0（调用方据此放弃写入）
 */
export function computeCollapsedPanelSpan(env = {}) {
  const viewport = Math.round(Number(env.viewportWidth) || 0)
  if (viewport <= 0) return 0
  const start = env.leftCollapsed ? 0 : Math.max(0, Math.round(Number(env.leftRailRight) || 0))
  const span = viewport - start
  return span > 0 ? span : 0
}

function hostWindow(doc) {
  return doc?.defaultView || (typeof globalThis.window !== 'undefined' ? globalThis.window : undefined)
}

function findPanel(doc) {
  return doc?.querySelector?.(PANEL_SELECTOR) || null
}

function measureEnv(doc, panel) {
  const win = hostWindow(doc)
  const root = doc?.documentElement
  const rail = doc?.querySelector?.(LEFT_RAIL_SELECTOR)
  const leftCollapsed = Boolean(root?.hasAttribute?.(LEFT_COLLAPSED_ATTR))
  return {
    viewportWidth: win?.innerWidth || 0,
    leftRailRight: leftCollapsed ? 0 : Math.round(rail?.getBoundingClientRect?.().right || 0),
    leftCollapsed,
  }
}

/** 松手：移除本模块写入的内联几何，把控制权还给外壳。 */
export function releaseCollapsedPanelFill(doc) {
  const panel = findPanel(doc)
  if (!panel?.style) return false
  if (panel.getAttribute?.(FILL_MARK_ATTR) !== '1') return false
  try {
    panel.style.removeProperty('width')
    panel.style.removeProperty('transition')
  } catch { /* ignore */ }
  panel.removeAttribute?.(FILL_MARK_ATTR)
  return true
}

/**
 * 按当前状态同步面板几何。幂等：值已达标时不写，避免自触发观察者循环。
 * @returns {boolean} 本次是否处于「已持有铺满几何」状态
 */
export function syncCollapsedPanelFill(doc) {
  const panel = findPanel(doc)
  const root = doc?.documentElement
  const collapsed = Boolean(root?.hasAttribute?.(COLLAPSED_ATTR))

  if (!panel) return false
  if (!collapsed) {
    releaseCollapsedPanelFill(doc)
    return false
  }

  const span = computeCollapsedPanelSpan(measureEnv(doc, panel))
  if (span <= 0) return false

  const target = `${span}px`
  const style = panel.style
  const settled = style
    && style.getPropertyValue('width') === target
    && style.getPropertyPriority('width') === 'important'
    && style.getPropertyPriority('transition') === 'important'
  if (!settled) {
    try {
      // 先中和过渡：过渡中的值在层叠里高于 author !important，不中和则写不进宽度。
      style.setProperty('transition', 'none', 'important')
      style.setProperty('width', target, 'important')
    } catch { /* ignore */ }
  }
  panel.setAttribute?.(FILL_MARK_ATTR, '1')
  return true
}

/**
 * 安装收起态面板铺满控制器。
 * @param {Document} [doc]
 * @returns {() => void} 清理函数
 */
export function installCollapsedPanelFill(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc?.documentElement) return () => {}

  const root = doc.documentElement
  const run = () => { try { syncCollapsedPanelFill(doc) } catch { /* ignore */ } }

  run()

  const Observer = doc.defaultView?.MutationObserver
    || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined)

  /** @type {MutationObserver | null} */
  let observer = null
  if (Observer) {
    observer = new Observer(() => {
      if (isApplying) return
      isApplying = true
      try { run() } finally { isApplying = false }
    })
    // 只关心会改变几何的三类变化：收起态属性、面板开关、外壳对面板内联样式的重写。
    observer.observe(root, {
      attributes: true,
      subtree: true,
      attributeFilter: [COLLAPSED_ATTR, LEFT_COLLAPSED_ATTR, 'style', 'data-sidebar-right-open', 'data-sidebar-right-panel'],
    })
  }
  let isApplying = false

  const win = doc.defaultView
  const onResize = () => run()
  win?.addEventListener?.('resize', onResize)

  return () => {
    try { observer?.disconnect() } catch { /* ignore */ }
    win?.removeEventListener?.('resize', onResize)
    releaseCollapsedPanelFill(doc)
  }
}
