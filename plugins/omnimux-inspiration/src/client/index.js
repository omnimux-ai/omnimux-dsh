import { createElement } from 'react'
import { NS, en, zh } from './locales.js'
import { mountSidebarEntry } from './sidebar-entry.js'
import { InspirationStage } from './InspirationStage.jsx'
import { bindOfficialSessions } from './new-session-click.js'
export const name = 'omnimux-inspiration'
export const inject = ['slots', 'locale']

export const INSPIRATION_TAB_ID = 'omnimux-inspiration:library'
function renderInspirationIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 22 22',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  }, [
    createElement('path', {
      key: 'p1',
      fill: 'currentColor',
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      d: 'M1.833 4.813a2.52 2.52 0 0 1 2.521-2.521h6.875a2.52 2.52 0 0 1 2.521 2.52v12.375a2.52 2.52 0 0 1-2.52 2.521H4.353a2.52 2.52 0 0 1-2.52-2.52V4.813Zm2.521-.688h6.875c.38 0 .688.308.688.688v12.375c0 .38-.308.687-.688.687H4.354a.687.687 0 0 1-.687-.688V4.813c0-.38.307-.688.687-.688Z',
    }),
    createElement('path', {
      key: 'p2',
      fill: 'currentColor',
      d: 'm20.9 7.428-1.65-.953v9.05l1.65-.953V7.428Zm-3.483-2.011-1.834-1.059v13.284l1.834-1.059V5.417Z',
    }),
  ])
}

/**
 * Inspiration renders as a workbench tab in dsh-better-sidebar.
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   slots: { inject: Function, register: Function },
 *   inject?: Function,
 *   effect?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-inspiration: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-inspiration: sidebar entry')
  const registerInspirationTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: INSPIRATION_TAB_ID,
      title: () => {
        try {
          const value = t('nav')
          if (value && value !== 'nav') return value
        } catch {}
        return '灵感社区'
      },
      icon: renderInspirationIcon,
      order: 18,
      hidden: false,
      single: true,
      component: (props) => createElement(InspirationStage, { ...props, t }),
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
        ctx.effect(() => registerInspirationTab(sidebar), 'omnimux-inspiration: library tab')
      } else {
        registerInspirationTab(sidebar)
      }
    })
    ctx.inject(['layout', 'sessions'], (inner) => {
      bindWorkbench({ layout: inner.layout, sessions: inner.sessions })
      bindOfficialSessions(inner.sessions)
    })
  }
}
