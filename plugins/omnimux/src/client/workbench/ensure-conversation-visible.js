import { exitHostRightSidebarFullscreen } from './host-fullscreen.js'
import { loadSessionThreeColumn } from '../conversation-collapse.js'

/**
 * 「让对话可见」的单一实现（进聊天意图，Issue #2516）。
 *
 * 会话栏不可见有两层状态：
 *   1. 插件折叠键 —— `html[data-omnimux-conversation-collapsed]`；
 *   2. 宿主右侧栏全屏 —— `[data-sidebar-right-panel="fullscreen"]`。
 *
 * 无参数（画布「添加到对话」等）：只退出宿主全屏并清折叠，保持右侧打开。
 * `newSession` 或该会话无三栏记忆：会话全屏。有三栏记忆：退出全屏并 split。
 *
 * @param {Document} [doc]
 * @param {{ getConversationCollapsed?: () => boolean, setConversationCollapsed?: (val: boolean) => unknown, setFocus?: Function, closePanel?: Function }} [api]
 * @param {{ sessionId?: string, newSession?: boolean }} [opts]
 * @returns {{ hostFullscreenExited: boolean, collapseCleared: boolean, sessionFullscreen: boolean }}
 */
export function ensureConversationVisible(doc, api, opts = {}) {
  let hostFullscreenExited = false
  try {
    hostFullscreenExited = Boolean(exitHostRightSidebarFullscreen(doc))
  } catch {
    hostFullscreenExited = false
  }

  const sessionFullscreen = Boolean(opts.newSession)
    || (Boolean(opts.sessionId) && !loadSessionThreeColumn(opts.sessionId))
  const focusOpts = { persistUserIntent: false }

  if (sessionFullscreen) {
    if (typeof api?.setFocus === 'function') {
      try {
        api.setFocus('chat', undefined, {}, undefined, focusOpts)
      } catch {
        try { api.closePanel?.() } catch {}
      }
    } else {
      try { api?.closePanel?.() } catch {}
    }
    if (typeof api?.setConversationCollapsed === 'function') {
      try { api.setConversationCollapsed(false) } catch {}
    }
    try {
      doc?.documentElement?.removeAttribute?.('data-omnimux-conversation-collapsed')
      doc?.documentElement?.removeAttribute?.('data-omnimux-fullscreen-collapse-snapshot')
    } catch {}
    return { hostFullscreenExited, collapseCleared: true, sessionFullscreen: true }
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

  const needsClear = domCollapsed || apiCollapsed || hostFullscreenExited
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
        api.setFocus('split', undefined, {}, undefined, focusOpts)
        collapseCleared = true
      } catch {}
    }
  }

  return { hostFullscreenExited, collapseCleared, sessionFullscreen: false }
}
