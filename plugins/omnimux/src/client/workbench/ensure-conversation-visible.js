import { exitHostRightSidebarFullscreen } from './host-fullscreen.js'

/**
 * 「让对话可见」的单一实现。
 *
 * 会话栏不可见有**两层互不相同的状态**，由不同层拥有：
 *   1. 插件折叠键 —— `html[data-omnimux-conversation-collapsed]`，由 `setConversationCollapsed` / `setFocus` 处理；
 *   2. 宿主右侧栏全屏 —— 官方自己的状态键（`surface.layout.mode === 'fullscreen'`），DOM 上是
 *      `[data-sidebar-right-panel="fullscreen"]`，只有官方模式控件能退出；插件清折叠键动不了它，
 *      面板会继续 `position:fixed; width:100%` 盖住中间栏（用户看到的是「点了没反应」）。
 *
 * 只清第 2 层不够，只清第 1 层也不够；而且**全屏态下折叠键往往是 `false`**，所以
 * 「读到折叠键为 false 就跳过」的写法会让第 2 层永远不被尝试。这里把两层合到一处，
 * 供内核手势与对外全局 API 共用（避免两份实现漂移）。
 *
 * 只负责「让对话可见」：不关闭右侧面板、不清已开 Tab。
 *
 * @param {Document} [doc]
 * @param {{ getConversationCollapsed?: () => boolean, setFocus?: (mode: string) => unknown }} [api]
 *   插件全局 API 子集；缺任一项都按缺失处理，绝不抛错。
 * @returns {{ hostFullscreenExited: boolean, collapseCleared: boolean }}
 */
export function ensureConversationVisible(doc, api) {
  let hostFullscreenExited = false
  try {
    hostFullscreenExited = Boolean(exitHostRightSidebarFullscreen(doc))
  } catch {
    hostFullscreenExited = false
  }

  let collapsed = false
  try {
    collapsed = typeof api?.getConversationCollapsed === 'function'
      ? Boolean(api.getConversationCollapsed())
      : false
  } catch {
    collapsed = false
  }

  let collapseCleared = false
  if (collapsed && typeof api?.setFocus === 'function') {
    try {
      api.setFocus('split')
      collapseCleared = true
    } catch {
      collapseCleared = false
    }
  }

  return { hostFullscreenExited, collapseCleared }
}
