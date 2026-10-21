// 媒体查看器 Tab 挂载：hub 拆分 Issue 2938。
// Tab 组件与共享数据层仍在 hub（omnimux/src/client/media-viewer/ + workbench/），
// 归属页注册改由本插件发起；betterSidebar/sessions/uiConversation/remote 全走 host seam。
import { createElement } from 'react'
import { MediaViewerTab, MEDIA_VIEWER_TAB_ID } from './MediaViewerTab.jsx'

/**
 * @param {{ inject?: Function, get?: Function, effect?: Function, locale?: { bind?: Function } }} ctx
 */
export function mountMediaViewerTab(ctx) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['betterSidebar', 'sessions', 'uiConversation'], (inner) => {
    const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
    if (!sidebar || typeof sidebar.registerTab !== 'function') return
    const imageUrl = (sessionId, attachment) => inner.uiConversation?.imageUrl?.(sessionId, attachment)
    let fileReader = null
    const readFile = async (sessionId, path, signal) => {
      if (!fileReader) throw new Error('File preview unavailable')
      return fileReader(sessionId, path, signal)
    }
    inner.inject?.(['remote', 'remote.workspaceFiles'], (fileCtx) => {
      fileCtx.effect?.(() => {
        const reader = (sessionId, path, signal) => fileCtx.remote?.workspaceFiles?.readAll?.(sessionId, path, signal)
        fileReader = reader
        return () => { if (fileReader === reader) fileReader = null }
      }, 'omnimux-viewer: media file reader')
    })
    const t = (key) => {
      try {
        const value = ctx.locale?.bind?.('tool.viewer')?.(key)
        return value && value !== key ? value : key
      } catch (error) {
        console.warn('[omnimux-viewer] locale lookup failed:', error?.message || error)
        return key
      }
    }
    inner.effect?.(() => sidebar.registerTab({
      id: MEDIA_VIEWER_TAB_ID,
      title: () => {
        const value = t('mediaViewer.tabTitle')
        return value === 'mediaViewer.tabTitle' ? '图像生成' : value
      },
      order: 7,
      hidden: false,
      single: true,
      component: (props) => createElement(MediaViewerTab, { ...props, sessions: inner.sessions, imageUrl, readFile, t }),
    }), 'omnimux-viewer: media viewer tab')
  })
}
