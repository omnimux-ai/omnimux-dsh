/**
 * 官方「更多」菜单注册点（seat `sidebar.panellist.actions`）。
 *
 * 宿主 `0.2.1-rc.3` 起，官方左侧栏的 panel list 自带「更多」行：root 作用域的
 * list seat `sidebar.panellist.actions` 只要有注册就渲染该行，注册项**直接渲染成
 * 菜单行**（官方参考实现 `packages/client/ui-entry-customization/src/client/EntryMenuContent.tsx`）。
 * 本模块把 OmniMux 的探索入口注册进那个官方菜单：自绘「探索」常驻行与浮动菜单已在
 * #3785 退役，这里是这批入口在侧栏的唯一渲染面。
 *
 * 单一真源：清单 / 图标 / 分组 / 激活语义全部取自 `sidebar-coordinator.js`，
 * 本模块不复制第二份实现（契约 docs/contracts/sidebar-extra-entries.md）。
 *
 * 依赖注入：官方 `MenuItemButton` 由调用方（`index.js` 的 `apply()`）传入。
 * 本模块**不得**顶层 import `@deepseek-ai/dsh-client-ui-primitives`：该包在宿主里是
 * 外部依赖，测试与老宿主解析不到，顶层 import 会把整个模块变成不可加载。
 */
import { ALPHA_DESCRIPTION, activateExploreItem, isAlphaEntry, resolveExploreMenuItems } from './sidebar-coordinator.js'

/** 官方「更多」菜单的 seat 名（root 作用域 list）。 */
export const EXPLORE_MORE_MENU_SLOT = 'sidebar.panellist.actions'
/** 本仓在该 seat 上的唯一注册 id；其它插件不得再注册同一批入口。 */
export const EXPLORE_MORE_MENU_ID = 'omnimux-explore'
/** 列表按 order 升序渲染；100 与其它 OmniMux 注册点同档，官方自带行排在其后。 */
export const EXPLORE_MORE_MENU_ORDER = 100

/**
 * 行原语是否可渲染：官方 `MenuItemButton` 现在是函数组件，将来被 `memo` /
 * `forwardRef` 包一层也应照常接受（这类对象带 `$$typeof`）。
 * @param {unknown} value
 * @returns {boolean}
 */
function isRenderableComponent(value) {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null && typeof value.$$typeof === 'symbol'
}

/**
 * 菜单行图标：沿用清单里的既有 `iconSvg`。
 * 与真源清单同一信任边界（契约要求 14×14 纯矢量 HTML，无 Emoji）；
 * 行文案（`label`）一律按纯文本交给 React，绝不拼进 HTML。
 * @param {{ iconSvg: string }} item
 * @returns {import('react').ReactElement}
 */
function exploreMoreMenuIcon(item) {
  return (
    <span
      className="omnimux-explore-more-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: item.iconSvg }}
    />
  )
}

/**
 * 折叠进来的官方面板行图标：单一通用面板图标。
 *
 * 不按面板 id 映射图标 —— 那需要第二份 id 清单，官方新增面板时必然漂移。
 * 几何与 OmniMux 清单里的 `iconSvg` 同档（14×14、1.3 描边、纯矢量、无 Emoji）。
 */
const PANEL_ROW_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2"/><path d="M1.75 6.25h12.5"/></svg>'

/**
 * 允许进「更多」菜单的官方面板行 id（白名单）。
 *
 * 只放行「自动化任务」：官方「插件」行由产品自研插件管理模块取代，彻底隐藏、
 * 不提供入口。用白名单而非黑名单，是为了让官方将来新增的面板不会未经决策
 * 就自动出现在菜单里。
 */
const PANEL_ENTRY_WHITELIST = new Set(['schedules'])

/**
 * 官方面板行的图标容器：与清单行同一 class 与同一信任边界（受信 14×14 纯矢量）。
 * @returns {import('react').ReactElement}
 */
function panelRowIcon() {
  return (
    <span
      className="omnimux-explore-more-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PANEL_ROW_ICON_SVG }}
    />
  )
}

/**
 * 行内容：Alpha 内测项在文案后带一个标识，其余项保持纯字符串（零变化）。
 *
 * 判定复用 `sidebar-coordinator.isAlphaEntry()`，真源仍是 `plugin-lifecycle.json`，
 * 本模块不维护第二份 Alpha 名单。标识放在官方 `children` 里：`MenuItemButton` 没有
 * 第二个尾部插槽，`children` 渲染进 `.itemLabel` 是唯一可行位置。
 *
 * @param {{ label: string, entryId?: string, pluginId?: string }} item
 * @returns {string | import('react').ReactElement}
 */
function exploreMoreMenuLabel(item) {
  const isAlpha = isAlphaEntry(item.entryId) || isAlphaEntry(item.pluginId)
  if (!isAlpha) return item.label
  return (
    <span className="omnimux-explore-more-label">
      <span className="omnimux-explore-more-label-text">{item.label}</span>
      <span className="omnimux-explore-more-alpha" title={ALPHA_DESCRIPTION}>{'Alpha'}</span>
    </span>
  )
}

/**
 * 生成「更多」菜单内容组件：顺序 / 分组 / 激活委托全部取自 sidebar-coordinator 真源。
 *
 * - 分组：`separatorBefore` 取「上一项的 `dividerAfter`」；
 * - 点击：先 `onDismiss()` 关掉官方菜单，再走 `activateExploreItem` 既有三段委托
 *   （`action` → 已挂载行 click → `__omnimuxWorkbench.open`），不另写导航；
 * - 不订阅注册变更：官方菜单每次展开重新挂载即读取最新集合。
 *
 * 折叠的官方面板行（`插件` / `自动化任务`）排在最前：侧栏上的面板行已被
 * `sidebar-panel-chrome.js` 收起，官方 owner 通过 `entries` / `onOpen` 把它们交给本菜单，
 * 这里原样渲染并复用官方 `onOpen`，不复制面板 id、不硬编码文案。
 *
 * @param {{ MenuItemButton?: import('react').ComponentType<object> }} [primitives]
 *   官方 primitives 命名空间（只需 `MenuItemButton`）。
 * @returns {import('react').FunctionComponent<{
 *   onDismiss?: () => void,
 *   entries?: readonly { id: string, label: string, active?: boolean }[],
 *   onOpen?: (id: string) => void,
 * }>}
 */
export function createExploreMoreMenuContent({ MenuItemButton } = {}) {
  /**
   * 官方「更多」菜单内容：owner 提供 `onDismiss` 与折叠的官方面板清单，
   * 其余输入全部来自真源清单。
   */
  function ExploreMoreMenuContent({ onDismiss, entries, onOpen }) {
    const items = resolveExploreMenuItems()
    // 白名单：只让「自动化任务」进「更多」菜单。官方「插件」行由产品自研插件管理
    // 模块取代，因此彻底隐藏、不提供入口；其余官方新增面板也不自动冒出来。
    const panels = Array.isArray(entries)
      ? entries.filter((entry) => PANEL_ENTRY_WHITELIST.has(entry?.id))
      : []
    return (
      <>
        {panels.map((entry) => (
          <MenuItemButton
            key={`panel:${entry.id}`}
            icon={panelRowIcon()}
            current={entry.active === true}
            separatorBefore={false}
            onSelect={() => {
              onDismiss?.()
              onOpen?.(entry.id)
            }}
          >
            {entry.label}
          </MenuItemButton>
        ))}
        {items.map((item, index) => (
          <MenuItemButton
            key={item.id}
            icon={exploreMoreMenuIcon(item)}
            separatorBefore={
              (index > 0 && items[index - 1].dividerAfter === true)
              // 折叠块之后断开：官方面板入口与产品入口不是同一组。
              || (index === 0 && panels.length > 0)
            }
            onSelect={() => {
              onDismiss?.()
              activateExploreItem(item)
            }}
          >
            {exploreMoreMenuLabel(item)}
          </MenuItemButton>
        ))}
      </>
    )
  }
  return ExploreMoreMenuContent
}

/**
 * 把「更多」菜单注册进官方侧栏。
 *
 * 老宿主没有 `slots` 服务时直接 no-op；seat 本身不存在的情况交给
 * `ctx.slots.inject` 的惰性语义（回调不触发），因此这里不需要 `try/catch` 兜底。
 * 宿主没有可渲染的行原语时同样不注册：宁可没有菜单，也不注册一个渲染即崩、
 * 或渲染出空壳的占用项。
 *
 * @param {{ slots?: { inject?: Function, register?: Function } }} [ctx] cordis 插件上下文
 * @param {{ MenuItemButton?: unknown }} [primitives]
 *   官方 `@deepseek-ai/dsh-client-ui-primitives` 命名空间。
 * @returns {boolean} 是否完成注册
 */
export function installExploreMoreMenu(ctx, primitives) {
  if (typeof ctx?.slots?.inject !== 'function') return false
  const { MenuItemButton } = primitives ?? {}
  if (!isRenderableComponent(MenuItemButton)) return false
  const Content = createExploreMoreMenuContent({ MenuItemButton })
  ctx.slots.inject(EXPLORE_MORE_MENU_SLOT, () => ctx.slots.register({
    name: EXPLORE_MORE_MENU_SLOT,
    id: EXPLORE_MORE_MENU_ID,
    order: EXPLORE_MORE_MENU_ORDER,
  }, Content))
  return true
}
