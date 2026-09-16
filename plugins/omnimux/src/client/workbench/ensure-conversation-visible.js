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
 * 必须同时兼顾 DOM 属性与内存 API：全屏同步器写 DOM 时，内存读数可能为 false；
 * 只要任一层存在折叠，即执行精准清除并退出全屏。本来就可见时保持纯 no-op。
 *
 * @param {Document} [doc]
 * @param {{ getConversationCollapsed?: () => boolean, setConversationCollapsed?: (val: boolean) => unknown, setFocus?: (mode: string) => unknown }} [api]
 * @returns {{ hostFullscreenExited: boolean, collapseCleared: boolean }}
 */
export function ensureConversationVisible(doc, api) {
  let hostFullscreenExited = false
  try {
    hostFullscreenExited = Boolean(exitHostRightSidebarFullscreen(doc))
  } catch {
    hostFullscreenExited = false
  }

  const domCollapsed = Boolean(doc?.documentElement?.hasAttribute?.('data-omnimux-conversation-collapsed'))
  let apiCollapsed = false
  try {
    apiCollapsed = typeof api?.getConversationCollapsed === 'function'
      ? Boolean(api.getConversationCollapsed())
      : false
  } catch {
    apiCollapsed = false
  }

  const needsClear = domCollapsed || apiCollapsed
  let collapseCleared = false

  if (needsClear) {
    if (domCollapsed) {
      try {
        doc.documentElement.removeAttribute('data-omnimux-conversation-collapsed')
        doc.documentElement.removeAttribute('data-omnimux-fullscreen-collapse-snapshot')
        collapseCleared = true
      } catch {}
    }

    if (typeof api?.setConversationCollapsed === 'function') {
      try {
        api.setConversationCollapsed(false)
        collapseCleared = true
      } catch {}
    }

    if (typeof api?.setFocus === 'function') {
      try {
        api.setFocus('split')
        collapseCleared = true
      } catch {}
    }
  }

  return { hostFullscreenExited, collapseCleared }
}
