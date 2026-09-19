/** Client half: 手机管理 sidebar entry + workbench tab.
 *
 * The web runtime applies this module as a standard Cordis client plugin
 * (same shape as omnimux-assets / omnimux-accounts): it must export
 * `name`, `inject` and `apply`, otherwise the loader rejects it with
 * "invalid plugin, expect function or object with an apply method" and
 * the app boots into the plugin recovery screen.
 *
 * The sidebar entry's click opens `__omnimuxWorkbench.open({ tabId })`,
 * which waits for a tab registered under the same id — so apply() must
 * also `registerTab` on the betterSidebar service (the omission that made
 * the entry click a silent no-op, Issue #2429).
 */
import { createElement } from 'react'
import { mountSidebarEntry, DEVICE_TAB_ID } from './sidebar-entry.js'
import { DeviceStage } from './DeviceStage.jsx'
import { locales, createTranslate } from './locales.js'

export const name = 'omnimux-device'
export const inject = ['locale']

const NS = 'omnimux-device'

export { DeviceStage, locales, createTranslate, mountSidebarEntry }

function renderDeviceIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }, [
    createElement('rect', { key: 'body', x: 5, y: 2, width: 14, height: 20, rx: 2 }),
    createElement('circle', { key: 'home', cx: 12, cy: 18, r: 1, fill: 'currentColor' }),
  ])
}

/**
 * @param {{
 *   locale: { register: Function, bind: Function, subscribe?: Function },
 *   effect?: Function,
 *   inject?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: locales['zh-CN'], en: locales['en-US'] }), 'omnimux-device: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-device: sidebar entry')

  const registerDeviceTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: DEVICE_TAB_ID,
      title: () => {
        try {
          const value = t('nav')
          if (value && value !== 'nav') return value
        } catch {}
        return '手机管理'
      },
      icon: renderDeviceIcon,
      order: 16,
      hidden: false,
      single: true,
      component: (props) => createElement(DeviceStage, { ...props, t }),
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['betterSidebar'], (inner) => {
      const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
      ctx.effect(() => registerDeviceTab(sidebar), 'omnimux-device: library tab')
    })
  }
}
