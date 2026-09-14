import { createElement } from 'react'
import { NS, en, zh } from './locales.js'
import { mountSidebarEntry } from './sidebar-entry.js'
import { installStageTracker } from './stage-tracker.js'
import { AnalyticsStage } from './AnalyticsStage.jsx'

export const name = 'omnimux-analytics'
export const inject = ['slots', 'locale']

export const ANALYTICS_TAB_ID = 'omnimux-analytics:library'

function renderAnalyticsIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  }, [
    createElement('path', {
      key: 'p1',
      fill: 'currentColor',
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      d: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7v-7zm4 3h2v4h-2v-4zm4 5h2v-2h-2v2z',
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
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-analytics: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-analytics: sidebar entry')

  ctx.effect(
    () => installStageTracker({ target: window }),
    'omnimux-analytics: first-level page tracker',
  )

  const registerAnalyticsTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: ANALYTICS_TAB_ID,
      title: () => {
        try {
          const value = t('nav')
          if (value && value !== 'nav') return value
        } catch {}
        return '数据分析'
      },
      icon: renderAnalyticsIcon,
      order: 20,
      hidden: false,
      single: true,
      component: (props) => createElement(AnalyticsStage, { ...props, t }),
    })
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
        ctx.effect(() => registerAnalyticsTab(sidebar), 'omnimux-analytics: library tab')
      } else {
        registerAnalyticsTab(sidebar)
      }
    })
    ctx.inject(['layout', 'sessions'], (inner) => {
      bindWorkbench({ layout: inner.layout, sessions: inner.sessions })
    })
  }
}
