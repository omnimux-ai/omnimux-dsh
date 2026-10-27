/**
 * 官方「更多」菜单注册点（seat `sidebar.panellist.actions`）。
 *
 * 宿主 `0.2.1-rc.3` 起，官方左侧栏的 panel list 自带「更多」行：root 作用域的
 * list seat `sidebar.panellist.actions` 只要有注册就渲染该行，注册项**直接渲染成
 * 菜单行**。本插件自 #3811 起把入口收敛到这个官方菜单：左栏常驻行退役，
 * 这里是入口在侧栏的唯一渲染面。
 *
 * 单一真源：文案取自 `locales.js` 的 `nav`，图标复用 `index.js` 的 `ENTRY_ICON`，
 * 打开语义复用 `createWorkbenchStageStore(...).open()`（不另写导航）。
 *
 * 依赖注入：官方 `MenuItemButton` 由调用方传入。本模块**不得**顶层 import
 * `@deepseek-ai/dsh-client-ui-primitives`：该包在宿主里是外部依赖，测试与老宿主
 * 解析不到，顶层 import 会把整个模块变成不可加载。
 */

/** 官方「更多」菜单的 seat 名（root 作用域 list）。 */
export const AVATAR_MORE_MENU_SLOT = 'sidebar.panellist.actions'
/** 本插件在该 seat 上的注册 id；与其它插件的注册项互不覆盖。 */
export const AVATAR_MORE_MENU_ID = 'omnimux-avatar'
/** 列表按 order 升序渲染；120 排在探索入口（100）之后，不与它抢位。 */
export const AVATAR_MORE_MENU_ORDER = 120

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
 * 生成「更多」菜单内容组件。
 *
 * 点击：先 `onDismiss()` 关掉官方菜单，再打开工作台 Tab——与常驻行点击走同一个
 * `stageStore.open()`，因此激活态、会话优先级判定全部沿用中枢仲裁，不产生第二套状态。
 *
 * @param {{
 *   MenuItemButton?: import('react').ComponentType<object>,
 *   title: () => string,
 *   iconSvg: string,
 *   open: () => void,
 * }} deps
 * @returns {import('react').FunctionComponent<{ onDismiss?: () => void }>}
 */
export function createAvatarMoreMenuContent({ MenuItemButton, title, iconSvg, open }) {
  /** 官方「更多」菜单内容：owner 提供 `onDismiss`，其余输入来自本插件真源。 */
  function AvatarMoreMenuContent({ onDismiss }) {
    return (
      <MenuItemButton
        icon={<span className="omnimux-avatar-more-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg }} />}
        onSelect={() => {
          onDismiss?.()
          open()
        }}
      >
        {title()}
      </MenuItemButton>
    )
  }
  return AvatarMoreMenuContent
}

/**
 * 把入口注册进官方「更多」菜单。
 *
 * 老宿主没有 `slots` 服务或没有可渲染的行原语时返回 false，由调用方决定回退：
 * 宁可保留工作台 Tab 入口，也不注册一个渲染即崩的空壳。
 *
 * @param {{
 *   slots?: { inject?: Function, register?: Function },
 * }} ctx cordis 插件上下文
 * @param {{
 *   MenuItemButton?: unknown,
 *   title: () => string,
 *   iconSvg: string,
 *   open: () => void,
 * }} deps
 * @returns {boolean} 是否完成注册
 */
export function installAvatarMoreMenu(ctx, deps) {
  if (typeof ctx?.slots?.inject !== 'function') return false
  const { MenuItemButton } = deps ?? {}
  if (!isRenderableComponent(MenuItemButton)) return false
  const Content = createAvatarMoreMenuContent({ ...deps, MenuItemButton })
  ctx.slots.inject(AVATAR_MORE_MENU_SLOT, () => ctx.slots.register({
    name: AVATAR_MORE_MENU_SLOT,
    id: AVATAR_MORE_MENU_ID,
    order: AVATAR_MORE_MENU_ORDER,
  }, Content))
  return true
}
