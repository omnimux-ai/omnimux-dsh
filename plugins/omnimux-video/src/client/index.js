import { createElement } from 'react'
import { NS, zh, en } from './locales.js'
import { mountSidebarEntry, GOOGLE_VIDS_TAB_ID, ENTRY_SELECTOR } from './sidebar-entry.js'
import { GoogleVidsStage } from './GoogleVidsStage.jsx'
import { GoogleVidsStudioPanel } from './GoogleVidsStudioPanel.jsx'

export const name = 'omnimux-video'
export const inject = ['locale']

/**
 * 稳定单例引用的 Google Vids Studio 面板高阶组件，避免 Tab 宿主组件对比时触发不必要的 Unmount/Remount。
 */
export function GoogleVidsTabPanel(props) {
  return createElement(GoogleVidsStage, props)
}

export { GOOGLE_VIDS_TAB_ID, ENTRY_SELECTOR, GoogleVidsStage, GoogleVidsStudioPanel, mountSidebarEntry }

function renderGoogleVidsIcon(size = 16) {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    role: 'presentation',
    'aria-hidden': 'true',
  }, [
    createElement('rect', {
      key: 'rect',
      x: 2,
      y: 2.5,
      width: 12,
      height: 11,
      rx: 2.5,
      stroke: 'currentColor',
      strokeWidth: 1.3,
    }),
    createElement('path', {
      key: 'play',
      d: 'M6.5 5.5l4 2.5-4 2.5v-5z',
      fill: 'currentColor',
    }),
  ])
}

/**
 * OmniMux-Video client entry: registers locale, sidebar entry and Google Vids Workbench Tab.
 * @param {{
 *   locale?: { register: Function, bind: Function },
 *   inject?: Function,
 *   effect?: Function,
 *   on?: Function,
 * }} ctx
 */
export function apply(ctx) {
  const disposers = []
  let pluginDisposed = false
  let prevEffectCleanup = null

  if (typeof ctx?.effect === 'function' && ctx?.locale?.register) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-video: dictionaries')
  } else if (ctx?.locale?.register) {
    ctx.locale.register(NS, { zh, en })
  }

  const t = ctx?.locale?.bind ? ctx.locale.bind(NS) : (k) => k

  const mountSidebarSafely = () => {
    if (typeof document === 'undefined') return () => {}
    return mountSidebarEntry(t, ctx?.locale)
  }

  if (typeof ctx?.effect === 'function') {
    ctx.effect(mountSidebarSafely, 'omnimux-video: sidebar entry')
  } else {
    const unmount = mountSidebarSafely()
    if (typeof unmount === 'function') disposers.push(unmount)
  }

  // Issue #2698: Register Google Vids as first-level stage on shell.overlay seat (order 36)
  if (ctx?.slots && typeof ctx.slots.inject === 'function') {
    const uninjectSlot = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'omnimux-vids-stage',
      order: 36,
      locale: NS,
    }, GoogleVidsStage))
    if (typeof uninjectSlot === 'function') disposers.push(uninjectSlot)
  }

  const registerGoogleVidsTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: GOOGLE_VIDS_TAB_ID,
      title: () => {
        try {
          const value = t('workbench.google_vids.tab')
          if (value && value !== 'workbench.google_vids.tab') return value
        } catch (err) {
          if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
            console.warn('[omnimux-video] tab title i18n lookup failed:', err)
          }
        }
        return 'Google Vids'
      },
      icon: renderGoogleVidsIcon,
      order: 17.5,
      hidden: false,
      single: true,
      component: GoogleVidsTabPanel,
    })
  }

  let workbenchBound = false

  const bindWorkbench = (patch) => {
    if (typeof window !== 'undefined') {
      try {
        if (window.__omnimuxWorkbench?.bind) {
          window.__omnimuxWorkbench.bind(patch)
          workbenchBound = true
        }
      } catch (err) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.warn('[omnimux-video] Failed to bind workbench patch:', err)
        }
      }
    }
  }

  const unbindWorkbench = (patch) => {
    if (typeof window !== 'undefined') {
      try {
        if (typeof window.__omnimuxWorkbench?.unbind === 'function') {
          window.__omnimuxWorkbench.unbind(patch)
        } else {
          window.__omnimuxWorkbench?.bind?.(patch)
        }
      } catch (err) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.warn('[omnimux-video] Failed to unbind workbench patch:', err)
        }
      }
    }
  }

  if (typeof ctx?.inject === 'function') {
    let prevUnregisterTab = null
    let injectResolved = false
    let injectTimeoutTimer = null

    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      injectTimeoutTimer = setTimeout(() => {
        if (!injectResolved) {
          console.warn('[omnimux-video] betterSidebar service injection timed out')
        }
      }, 8000)
      if (typeof injectTimeoutTimer?.unref === 'function') {
        injectTimeoutTimer.unref()
      }
    }

    const uninject = ctx.inject(['betterSidebar'], (inner) => {
      if (typeof prevEffectCleanup === 'function') {
        try {
          prevEffectCleanup()
        } catch {}
        prevEffectCleanup = null
      }
      if (pluginDisposed) return
      if (injectResolved) {
        unbindWorkbench({ betterSidebar: null })
        workbenchBound = false
      }
      injectResolved = true
      if (injectTimeoutTimer) {
        clearTimeout(injectTimeoutTimer)
        injectTimeoutTimer = null
      }
      const sidebar = inner?.betterSidebar ?? inner?.get?.('betterSidebar')
      bindWorkbench({ betterSidebar: sidebar })
      if (typeof ctx.effect === 'function') {
        prevEffectCleanup = ctx.effect(() => {
          if (pluginDisposed) return () => {}
          let unregisterTab
          try {
            unregisterTab = registerGoogleVidsTab(sidebar)
          } catch (err) {
            if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
              console.warn('[omnimux-video] registerGoogleVidsTab failed:', err)
            }
          }
          if (pluginDisposed) {
            try {
              if (typeof unregisterTab === 'function') unregisterTab()
            } catch {}
            return () => {}
          }
          let cleaned = false
          return () => {
            if (cleaned) return
            cleaned = true
            if (typeof unregisterTab === 'function') {
              try {
                unregisterTab()
              } catch {}
            }
          }
        }, 'omnimux-video: google-vids tab')
      } else {
        if (prevUnregisterTab) {
          const idx = disposers.indexOf(prevUnregisterTab)
          if (idx !== -1) disposers.splice(idx, 1)
          try {
            prevUnregisterTab()
          } catch {}
          prevUnregisterTab = null
        }
        if (pluginDisposed) return

        let unregisterTab
        try {
          unregisterTab = registerGoogleVidsTab(sidebar)
        } catch (err) {
          if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
            console.warn('[omnimux-video] registerGoogleVidsTab failed:', err)
          }
        }
        if (pluginDisposed) {
          try {
            if (typeof unregisterTab === 'function') unregisterTab()
          } catch {}
          return
        }
        prevUnregisterTab = typeof unregisterTab === 'function' ? unregisterTab : null
        if (typeof unregisterTab === 'function') {
          disposers.push(unregisterTab)
        }
      }
    })
    if (typeof uninject === 'function') {
      disposers.push(uninject)
    }

    disposers.push(() => {
      if (injectTimeoutTimer) {
        clearTimeout(injectTimeoutTimer)
        injectTimeoutTimer = null
      }
    })
  }

  const dispose = () => {
    pluginDisposed = true
    if (typeof prevEffectCleanup === 'function') {
      try {
        prevEffectCleanup()
      } catch {}
      prevEffectCleanup = null
    }
    while (disposers.length > 0) {
      const unregister = disposers.pop()
      try {
        unregister()
      } catch {}
    }
    if (workbenchBound) {
      unbindWorkbench({ betterSidebar: null })
      workbenchBound = false
    }
  }

  if (typeof ctx?.on === 'function') {
    ctx.on('dispose', dispose)
  }

  return dispose
}
