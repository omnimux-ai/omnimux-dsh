/** Client half: locale dictionaries, sidebar entry under 新会话, and the
 *  assets workbench tab on dsh-better-sidebar. */
import { createElement } from 'react'
import { NS, en, zh } from './locales.js'
import { mountSidebarEntry } from './sidebar-entry.js'
import { AssetsStage } from './AssetsStage.jsx'
import { AssetHubPanel } from '../asset-hub/AssetHubPanel.jsx'
import { ASSET_HUB_TAB_ID } from '../../../omnimux/src/client/workbench/geometry.js'

export const name = 'omnimux-assets'
export const inject = ['slots', 'locale']

export const ASSETS_TAB_ID = 'omnimux-assets:library'
// 素材工作台：领域页归属本插件（hub 拆分，Issue 2933）

function renderAssetsIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 22 22',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  }, [
    createElement('path', {
      key: 'p',
      fill: 'currentColor',
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      d: 'm7.249 11.552-1.691.323A2.335 2.335 0 0 0 6 16.5h10a2.333 2.333 0 0 0 .443-4.625l-1.691-.323.216-1.708a4 4 0 1 0-7.936 0l.217 1.708ZM5.167 9.333a5.833 5.833 0 1 1 11.62.741 4.168 4.168 0 0 1-.787 8.26H6a4.167 4.167 0 0 1-.787-8.26 5.89 5.89 0 0 1-.046-.74Z',
    }),
  ])
}

/**
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   slots: { inject: Function, register: Function },
 *   inject?: Function,
 *   effect?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-assets: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-assets: sidebar entry')

  const registerAssetsTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    const unregisterAssets = sidebar.registerTab({
      id: ASSETS_TAB_ID,
      title: () => {
        try {
          const value = t('nav')
          if (value && value !== 'nav') return value
        } catch {}
        return '资产库'
      },
      icon: renderAssetsIcon,
      order: 15,
      hidden: false,
      single: true,
      component: (props) => createElement(AssetsStage, { ...props, t }),
    })
    const unregisterAssetHub = sidebar.registerTab({
      id: ASSET_HUB_TAB_ID,
      title: () => {
        try {
          const value = t('assetHub.tabTitle')
          if (value && value !== 'assetHub.tabTitle') return value
        } catch {}
        return '素材工作台'
      },
      order: 6,
      hidden: false,
      single: true,
      component: (props) => createElement(AssetHubPanel, { ...props, t, sessions: ctx.get?.('sessions') }),
    })
    return () => {
      unregisterAssets?.()
      unregisterAssetHub?.()
    }
  }

  const bindWorkbench = (patch) => {
    try {
      window.__omnimuxWorkbench?.bind?.(patch)
    } catch {}
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['betterSidebar'], (inner) => {
      const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
      bindWorkbench({ betterSidebar: sidebar })
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => registerAssetsTab(sidebar), 'omnimux-assets: library tab')
      } else {
        registerAssetsTab(sidebar)
      }
    })
    ctx.inject(['layout', 'sessions'], (inner) => {
      bindWorkbench({ layout: inner.layout, sessions: inner.sessions })
    })
  }
}
