/**
 * 官方侧栏 panel 行的度量对齐 + 官方「更多」菜单的右侧弹出与实体底（Issue #3802）。
 *
 * 侧栏同时存在两套行度量：
 *   1. OmniMux 自定义行（项目 / 数字人 / 技能·专家 / 资产库 / 灵感社区）：
 *      32px 高、8px 圆角、`0 8px` 内边距、14px 图标、14/20 字阶
 *      （`packages/dsh-ui-kit/src/stage/createSidebarEntry.ts`）；
 *   2. 官方 panel 行（插件 / 自动化任务 / 更多）：36px 高、12px 圆角、
 *      `7px 8px` 内边距、16px 图标（`ui-sidebar` 的 `.panelRow`）。
 *
 * 两套挨着显示时一高一低、一圆一方。本模块把**展开态**的官方 panel 行压到产品行度量；
 * 收起态轨道（36×36 居中图标）保持官方不变 —— 轨道是图标列，不是文字行。
 *
 * 「更多」菜单由官方 `Menu` 以 `portal` + `side:'bottom'` 从锚点下方展开，压在侧栏内容上，
 * 并使用半透明 + `backdrop-filter` 毛玻璃材质（`MenuSurface` 的 `.material`），底下文字会
 * 透出来。本模块把它右移到侧栏列右侧，并把该菜单自身的材质换成实体不透明底。
 *
 * 两条边界：
 *   - 不改官方源码 / packages：只注入 CSS + 读几何，全部落在插件侧；
 *   - 材质覆盖只落在官方「更多」菜单这一个实例上，不外溢到其它官方浮层。
 */

/** 注入样式节点 id（幂等安装）。 */
export const PANEL_CHROME_STYLE_ID = 'omnimux-sidebar-panel-chrome'

/** 侧栏列：桌面壳层包裹层与宿主内层列都在内，取第一个命中的即可。 */
export const SIDEBAR_COLUMN_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'

/** 官方 panel 行 / 图标槽 / 选中态（官方 CSS Module 类名带 hash 前缀，用子串命中）。 */
export const PANEL_ROW_SELECTOR = '[class*="panelRow"]'
export const PANEL_GLYPH_SELECTOR = '[class*="panelGlyph"]'
export const PANEL_ACTIVE_SELECTOR = '[class*="panelActive"]'

/**
 * 官方「更多」菜单本体：portaled 到 body 的 `MenuSurface`（translucent 材质）+ `.moreMenu`。
 * 两个特征同时要求，避免命中其它同样使用半透明材质的官方浮层。
 */
export const MORE_MENU_SELECTOR = '[data-menu-material="translucent"][class*="moreMenu"]'

/**
 * 官方「更多」按钮的包裹层（官方 `Menu` 的 `className={css.moreAnchor}`）。
 * 它就在侧栏列内、包着按钮本身，取它的矩形比取按钮稳（按钮还可能被 Tooltip 再包一层）。
 */
export const MORE_ANCHOR_SELECTOR = '[class*="moreAnchor"]'

/** 菜单与侧栏列之间的水平间隙（px）。 */
export const PANEL_MENU_GAP = 8
/** 菜单与视口右边界的最小留白（px），与官方 `Menu` 的 MARGIN 同档。 */
export const PANEL_MENU_VIEWPORT_MARGIN = 12
/** 收窄后仍可用的最小菜单宽度（px）：再窄就失去可读性，此时不做位移。 */
export const PANEL_MENU_MIN_WIDTH = 200

/**
 * 产品行度量真源（与 `SIDEBAR_ENTRY_COMMON_STYLES` 逐项一致）。
 * 样式与测试都读这份常量，避免第二套数字。
 */
export const PANEL_ROW_METRICS = Object.freeze({
  height: 32,
  radius: 8,
  paddingX: 8,
  marginX: 4,
  gap: 6,
  iconSize: 14,
  fontSize: 14,
  lineHeight: 20,
})

/** 元素判定：不依赖 `instanceof Element`，跨文档（JSDOM / 别的窗口）同样成立。 */
function isElement(node) {
  return Boolean(node) && typeof node === 'object' && node.nodeType === 1
}

/** 侧栏作用域：只在侧栏列内对齐行度量，不碰别的界面上的同名行。 */
const SIDEBAR_SCOPE = `:is(${SIDEBAR_COLUMN_SELECTOR})`

/**
 * 官方 panel 行对齐产品行度量。
 *
 * 收起态排除条件：`html:not(:has([data-sidebar-collapsed]))` —— 轨道态官方把行压成
 * 36×36 居中图标，套上文字行的内边距会把它撑回横条。`data-sidebar-collapsed` 由壳层
 * 写在 AppFrame 上，是协调器与官方共用的唯一收起信号。
 */
export const PANEL_CHROME_CSS = `
/* ── 官方 panel 行（插件 / 自动化任务 / 更多）对齐产品自定义行度量 ── */
html:not(:has([data-sidebar-collapsed])) ${SIDEBAR_SCOPE} ${PANEL_ROW_SELECTOR} {
  box-sizing: border-box;
  min-height: ${PANEL_ROW_METRICS.height}px;
  padding: 0 ${PANEL_ROW_METRICS.paddingX}px;
  margin: 0 ${PANEL_ROW_METRICS.marginX}px;
  gap: ${PANEL_ROW_METRICS.gap}px;
  border-radius: ${PANEL_ROW_METRICS.radius}px;
  font-size: ${PANEL_ROW_METRICS.fontSize}px;
  line-height: ${PANEL_ROW_METRICS.lineHeight}px;
}

html:not(:has([data-sidebar-collapsed])) ${SIDEBAR_SCOPE} ${PANEL_GLYPH_SELECTOR},
html:not(:has([data-sidebar-collapsed])) ${SIDEBAR_SCOPE} ${PANEL_GLYPH_SELECTOR} > svg {
  width: ${PANEL_ROW_METRICS.iconSize}px;
  height: ${PANEL_ROW_METRICS.iconSize}px;
}

/* 选中态与产品行 active 同源（产品行用 active 令牌，官方原用 hover 令牌）。 */
html:not(:has([data-sidebar-collapsed])) ${SIDEBAR_SCOPE} ${PANEL_ROW_SELECTOR}${PANEL_ACTIVE_SELECTOR} {
  background: var(--dsw-alias-interactive-bg-active);
  font-weight: 500;
}

/* ── 官方面板行折叠进「更多」菜单 ──
   官方左侧栏自带「插件」「自动化任务」两行内置入口，与产品自定义行混排会把侧栏第一屏占满。
   这两行是官方内置入口、不是产品入口，因此不在侧栏显示，改由「更多」菜单提供
   （explore-more-menu.jsx 用官方 owner props 渲染它们，官方清单即真源）。

   识别方式：官方「更多」行带 aria-haspopup="menu"，其余面板行没有 —— 于是
   「隐藏所有非更多面板行」等价于「隐藏官方面板行」，不需要按 id / 文案匹配，
   官方改文案、加面板、换语言都不会让这条规则失效。 */
${SIDEBAR_SCOPE} ${PANEL_ROW_SELECTOR}:not([aria-haspopup="menu"]) {
  display: none;
}

/* ── 官方「更多」菜单：右移到侧栏列右侧 + 实体不透明底 ──
   React 每帧写 inline left/top，所以位移只能走它不写的 translate。
   材质由 MenuSurface 的 .material 子层消费这两个自定义属性，改属性即改该实例的底。 */
${MORE_MENU_SELECTOR} {
  --dsw-menu-surface-fill: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  --dsw-menu-backdrop-filter: none;
  translate: var(--omnimux-more-menu-shift, 0) var(--omnimux-more-menu-shift-y, 0);
  max-width: var(--omnimux-more-menu-max-width, calc(100vw - ${PANEL_MENU_VIEWPORT_MARGIN * 2}px));
}
`

/**
 * 计算「更多」菜单的落位：右移到侧栏列右侧，并按剩余视口宽度收窄。
 *
 * 官方 `Menu`（portal）每帧把菜单左边界放在锚点左侧并钳制在视口内；本函数只回答
 * 「还要往右推多少、要不要收窄」。优先级是明确的：
 *   1. 菜单必须整体落在侧栏列右侧 —— 用户要的是「从侧栏右侧弹出来」，钳制回侧栏等于没做到；
 *   2. 右侧放不下时**收窄菜单**，而不是溢出视口，也不是压回侧栏上；
 *   3. 连最小可用宽度都放不下（视口比「侧栏 + 间隙 + 留白 + 最小宽」还窄）时不做位移，
 *      保持官方位置 —— 此时没有任何合规摆法。
 *
 * @param {{ sidebarRight: number, menuLeft: number, menuWidth: number, viewportWidth: number,
 *   gap?: number, margin?: number, minWidth?: number }} input 当前几何（均为 CSS 像素）
 * @returns {{ offset: number, maxWidth: number | null }}
 *   `offset` 需要施加的 translateX（`0` 表示保持官方位置）；`maxWidth` 为需要施加的
 *   宽度上限（`null` 表示按菜单自身宽度）
 */
export function computePanelMenuPlacement({
  sidebarRight,
  menuLeft,
  menuWidth,
  viewportWidth,
  gap = PANEL_MENU_GAP,
  margin = PANEL_MENU_VIEWPORT_MARGIN,
  minWidth = PANEL_MENU_MIN_WIDTH,
}) {
  const none = { offset: 0, maxWidth: null }
  const values = [sidebarRight, menuLeft, menuWidth, viewportWidth]
  if (values.some((value) => !Number.isFinite(value))) return none
  if (menuWidth <= 0) return none

  const target = sidebarRight + gap
  const available = viewportWidth - margin - target
  if (available < minWidth) return none

  return {
    offset: Math.max(0, Math.round(target - menuLeft)),
    maxWidth: available < menuWidth ? Math.floor(available) : null,
  }
}

/**
 * 兼容包装：只要横向位移。
 * @param {Parameters<typeof computePanelMenuPlacement>[0]} input
 * @returns {number}
 */
export function computePanelMenuOffset(input) {
  return computePanelMenuPlacement(input).offset
}

/**
 * 计算「更多」菜单的纵向位移：让菜单顶边与触发按钮顶边对齐。
 *
 * 官方 `Menu` 用 `side:'bottom'`，把菜单顶边放在按钮**下方** `GAP` 处，于是菜单第一行
 * 比按钮低一整行，看着像挂在按钮下半截。本函数回答「还要往上挪多少」：
 *   1. 目标顶边 = 按钮顶边，所以位移通常是负值（向上）；
 *   2. 夹进视口：顶边不得越过上留白，底边不得越过下留白 —— 菜单太长时整体上移，
 *      而不是被推出屏幕（超高由官方自身的 `max-height` + 滚动承担）；
 *   3. 任何非法几何一律返回 `0`，保持官方位置。
 *
 * @param {{ anchorTop: number, menuTop: number, menuHeight: number, viewportHeight: number,
 *   margin?: number }} input 当前几何（均为 CSS 像素）
 * @returns {number} 需要施加的 translateY
 */
export function computePanelMenuVerticalOffset({
  anchorTop,
  menuTop,
  menuHeight,
  viewportHeight,
  margin = PANEL_MENU_VIEWPORT_MARGIN,
}) {
  const values = [anchorTop, menuTop, menuHeight, viewportHeight]
  if (values.some((value) => !Number.isFinite(value))) return 0
  if (menuHeight <= 0 || viewportHeight <= 0) return 0
  const aligned = Math.round(anchorTop - menuTop)
  const lowerBound = margin - menuTop
  const upperBound = viewportHeight - margin - menuHeight - menuTop
  // 视口比菜单还矮时上下界会交叉，此时贴顶（下界优先）。
  const clamped = Math.min(Math.max(aligned, lowerBound), Math.max(lowerBound, upperBound))
  return Math.round(clamped)
}

/**
 * 把一个官方「更多」菜单摆到侧栏列右侧。
 *
 * 只写自定义属性，不碰官方写入的 inline `left/top` —— 两侧写同一元素的不同属性，
 * 不会互相覆盖，也不需要与 React 争帧。
 *
 * @param {Element | null | undefined} menu 官方「更多」菜单本体
 * @param {Document} [doc]
 * @returns {number} 施加的位移（px），菜单或侧栏不存在时返回 `0`
 */
export function positionPanelMenu(menu, doc = document) {
  if (!isElement(menu)) return 0
  const column = doc.querySelector(SIDEBAR_COLUMN_SELECTOR)
  if (!isElement(column)) return 0
  const view = doc.defaultView
  const viewportWidth = view?.innerWidth ?? 0
  const viewportHeight = view?.innerHeight ?? 0
  if (!(viewportWidth > 0)) return 0
  const rect = menu.getBoundingClientRect()
  // 位移会改变 rect：先扣掉已施加的位移，拿回官方基准位置再重算，避免逐帧叠加。
  const appliedX = Number.parseFloat(menu.style.getPropertyValue('--omnimux-more-menu-shift')) || 0
  const appliedY = Number.parseFloat(menu.style.getPropertyValue('--omnimux-more-menu-shift-y')) || 0
  const { offset, maxWidth } = computePanelMenuPlacement({
    sidebarRight: column.getBoundingClientRect().right,
    menuLeft: rect.left - appliedX,
    menuWidth: rect.width,
    viewportWidth,
  })
  menu.style.setProperty('--omnimux-more-menu-shift', `${offset}px`)
  if (maxWidth === null) menu.style.removeProperty('--omnimux-more-menu-max-width')
  else menu.style.setProperty('--omnimux-more-menu-max-width', `${maxWidth}px`)

  // 纵向：菜单顶边对齐触发按钮顶边。锚点缺失时保持官方纵向位置。
  const anchor = doc.querySelector(MORE_ANCHOR_SELECTOR)
  if (isElement(anchor) && viewportHeight > 0) {
    const offsetY = computePanelMenuVerticalOffset({
      anchorTop: anchor.getBoundingClientRect().top,
      menuTop: rect.top - appliedY,
      menuHeight: rect.height,
      viewportHeight,
    })
    menu.style.setProperty('--omnimux-more-menu-shift-y', `${offsetY}px`)
  }
  return offset
}

/**
 * 幂等注入本模块样式。
 * @param {Document} [doc]
 * @returns {HTMLStyleElement | undefined} 已存在的样式节点
 */
export function ensurePanelChromeStyles(doc = document) {
  const existing = doc.getElementById(PANEL_CHROME_STYLE_ID)
  if (isElement(existing)) return existing
  const style = doc.createElement('style')
  style.id = PANEL_CHROME_STYLE_ID
  style.textContent = PANEL_CHROME_CSS
  doc.head.append(style)
  return style
}

/**
 * 安装侧栏 panel chrome。
 *
 * 只挂一个 `document.body` 的**直接子节点**观察器（官方菜单 portal 到 body）：
 * 菜单出现即开始逐帧跟随（官方 Menu 自己也在逐帧重算锚点位置，拖动窗口与滚动都要跟上），
 * 菜单移除即停。观察器不写被观察的树，因此不产生重排级联。
 *
 * @param {Document} [doc]
 * @returns {() => void} 卸载函数
 */
export function installSidebarPanelChrome(doc = document) {
  ensurePanelChromeStyles(doc)

  let frame
  let tracked

  const view = doc.defaultView

  const stop = () => {
    if (frame !== undefined) {
      view?.cancelAnimationFrame?.(frame)
      frame = undefined
    }
    tracked = undefined
  }

  const tick = () => {
    frame = undefined
    if (!isElement(tracked) || !tracked.isConnected) {
      stop()
      return
    }
    positionPanelMenu(tracked, doc)
    frame = view?.requestAnimationFrame?.(tick)
  }

  const follow = (menu) => {
    if (menu === tracked) return
    stop()
    tracked = menu
    tick()
  }

  const scan = () => {
    const menu = doc.querySelector(MORE_MENU_SELECTOR)
    if (isElement(menu)) follow(menu)
    else stop()
  }

  const Observer = view?.MutationObserver ?? MutationObserver
  const observer = new Observer((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (isElement(node) && node.matches(MORE_MENU_SELECTOR)) {
          follow(node)
          return
        }
      }
      for (const node of record.removedNodes) {
        if (node === tracked) {
          stop()
          return
        }
      }
    }
    scan()
  })
  observer.observe(doc.body, { childList: true })

  // 安装前菜单已开（热重载 / 后挂载）时立即接管。
  scan()

  return () => {
    observer.disconnect()
    stop()
  }
}
