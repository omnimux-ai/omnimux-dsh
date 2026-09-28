import { createElement } from 'react'
import { NS, zh, en } from './locales.js'
import { mountSidebarEntry, ENTRY_SELECTOR } from './sidebar-entry.js'
import { GoogleVidsStage } from './GoogleVidsStage.jsx'
import { GoogleVidsStudioPanel } from './GoogleVidsStudioPanel.jsx'

export const name = 'omnimux-video'
export const inject = ['locale', 'slots', 'layout']

export { ENTRY_SELECTOR, GoogleVidsStage, GoogleVidsStudioPanel, mountSidebarEntry }

/**
 * OmniMux-Video client entry: registers locale, sidebar entry and the Google Vids conversation stage.
 * @param {{ locale?: { register: Function, bind: Function }, inject?: Function, effect?: Function, slots?: object, layout?: object, on?: Function }} ctx
 */
export function apply(ctx) {
  const disposers = []
  let pluginDisposed = false

  if (typeof ctx?.effect === 'function' && ctx?.locale?.register) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-video: dictionaries')
  } else if (ctx?.locale?.register) {
    ctx.locale.register(NS, { zh, en })
  }

  const t = ctx?.locale?.bind ? ctx.locale.bind(NS) : (key) => key
  const mountSidebarSafely = () => {
    if (typeof document === 'undefined') return () => {}
    return mountSidebarEntry(t, ctx?.locale, undefined, ctx?.layout)
  }

  if (typeof ctx?.effect === 'function') {
    ctx.effect(mountSidebarSafely, 'omnimux-video: sidebar entry')
  } else {
    const unmount = mountSidebarSafely()
    if (typeof unmount === 'function') disposers.push(unmount)
  }

  if (ctx?.slots && typeof ctx.slots.inject === 'function') {
    const uninjectSlot = ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: 'omnimux-vids',
      order: 36,
      locale: NS,
    }, (props) => createElement(GoogleVidsStage, { ...props, layout: ctx?.layout })))
    if (typeof uninjectSlot === 'function') disposers.push(uninjectSlot)
  }

  let workbenchBound = false
  const bindWorkbench = (patch) => {
    if (typeof window === 'undefined') return
    try {
      if (typeof window.__omnimuxWorkbench?.bind === 'function') {
        window.__omnimuxWorkbench.bind(patch)
        workbenchBound = true
      }
    } catch (err) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn('[omnimux-video] Failed to bind workbench patch:', err)
      }
    }
  }
  const unbindWorkbench = (patch) => {
    if (typeof window === 'undefined') return
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

  if (ctx?.layout) {
    bindWorkbench({ layout: ctx.layout })
  }

  // Vids itself is a conversation-column stage; only bind the host's right-rail API for the Clip action.
  if (typeof ctx?.inject === 'function') {
    let injectResolved = false
    let injectTimeoutTimer = null
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      injectTimeoutTimer = setTimeout(() => {
        if (!injectResolved) console.warn('[omnimux-video] betterSidebar service injection timed out')
      }, 8000)
      if (typeof injectTimeoutTimer?.unref === 'function') injectTimeoutTimer.unref()
    }

    const uninjectSidebar = ctx.inject(['betterSidebar'], (inner) => {
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
      const layout = inner?.layout ?? inner?.get?.('layout') ?? ctx?.layout
      bindWorkbench({ betterSidebar: sidebar, ...(layout ? { layout } : {}) })
    })
    if (typeof uninjectSidebar === 'function') disposers.push(uninjectSidebar)

    disposers.push(() => {
      if (injectTimeoutTimer) {
        clearTimeout(injectTimeoutTimer)
        injectTimeoutTimer = null
      }
    })
  }

  const dispose = () => {
    if (pluginDisposed) return
    pluginDisposed = true
    while (disposers.length > 0) {
      const unregister = disposers.pop()
      try { unregister() } catch {}
    }
    if (workbenchBound) {
      unbindWorkbench({ betterSidebar: null })
      workbenchBound = false
    }
  }

  if (typeof ctx?.on === 'function') ctx.on('dispose', dispose)
  return dispose
}
