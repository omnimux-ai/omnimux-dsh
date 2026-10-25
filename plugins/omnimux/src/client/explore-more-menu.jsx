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
import { activateExploreItem, resolveExploreMenuItems } from './sidebar-coordinator.js'

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
 * 生成「更多」菜单内容组件：顺序 / 分组 / 激活委托全部取自 sidebar-coordinator 真源。
 *
 * - 分组：`separatorBefore` 取「上一项的 `dividerAfter`」；
 * - 点击：先 `onDismiss()` 关掉官方菜单，再走 `activateExploreItem` 既有三段委托
 *   （`action` → 已挂载行 click → `__omnimuxWorkbench.open`），不另写导航；
 * - 不订阅注册变更：官方菜单每次展开重新挂载即读取最新集合。
 *
 * @param {{ MenuItemButton?: import('react').ComponentType<object> }} [primitives]
 *   官方 primitives 命名空间（只需 `MenuItemButton`）。
 * @returns {import('react').FunctionComponent<{ onDismiss?: () => void }>}
 */
export function createExploreMoreMenuContent({ MenuItemButton } = {}) {
  /** 官方「更多」菜单内容：owner 提供 `onDismiss`，其余输入全部来自真源清单。 */
  function ExploreMoreMenuContent({ onDismiss }) {
    const items = resolveExploreMenuItems()
    return (
      <>
        {items.map((item, index) => (
          <MenuItemButton
            key={item.id}
            icon={exploreMoreMenuIcon(item)}
            separatorBefore={index > 0 && items[index - 1].dividerAfter === true}
            onSelect={() => {
              onDismiss?.()
              activateExploreItem(item)
            }}
          >
            {item.label}
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
