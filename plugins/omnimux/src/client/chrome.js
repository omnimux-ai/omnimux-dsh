import { configFromWindow, startOverlay } from '../brand/overlay.js'
import { ensureProductStageChrome } from './conversation-box.js'
import { installStageGlobal } from './stage.js'
import { installSidebarGlobal } from './sidebar-coordinator.js'
import { installAuthGlobal } from './auth-gate.js'
import { installWorkbenchGlobal, installWorkbenchLeftRailObserver, installSplitConversationMin, hydrateConversationCollapsed } from './workbench.js'
import { installChatToggle } from './chat-toggle.js'
import { ensureConversationCollapseChrome } from './conversation-collapse.js'
import { ensureComposerCompactChrome, installComposerCompactObserver } from './composer-compact.js'
import { installAgentPresetAvatarEnhancer } from './agent-preset-enhancer.js'
import { installSidebarToggleTopbar } from './sidebar-toggle-topbar.js'
import { NS, en, zh } from './locales.js'
// x.ai 全壳 overrideTokens 已临时关闭：发送钮在暗色下变成白底白箭头。
// 恢复时：重新 import applyXaiShellTheme，并把 'theme' 加回 inject + package.json dsh.client.inject。
// import { applyXaiShellTheme } from './xai-theme.js'

/**
 * Install hub-owned client globals (stage, sidebar, auth, brand overlay).
 * Settings seats stay in index.js so placement contract tests keep reading
 * inject ids from that file.
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   effect?: Function,
 * }} ctx
 * @returns {(key: string) => string}
 */
export function installHubChrome(ctx) {
  installStageGlobal()
  installSidebarGlobal()
  installAuthGlobal()
  const workbench = installWorkbenchGlobal()
  // Optional services: layout/sessions ship with the web client; betterSidebar
  // is a community plugin. Never read them on the top-level inject list.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['layout', 'sessions'], (inner) => {
      workbench.bind({ layout: inner.layout, sessions: inner.sessions })
    })
    ctx.inject(['betterSidebar'], (inner) => {
      workbench.bind({ betterSidebar: inner.betterSidebar ?? inner.get?.('betterSidebar') })
    })
  }
  ctx.effect(
    () => startOverlay(document, configFromWindow(window)),
    'omnimux: brand overlay',
  )
  ctx.effect(() => {
    ensureProductStageChrome()
    ensureConversationCollapseChrome()
    ensureComposerCompactChrome()
    hydrateConversationCollapsed()
    const unsubToggle = installChatToggle()
    const unsubLeftRail = installWorkbenchLeftRailObserver()
    const unsubSplitMin = installSplitConversationMin()
    const unsubCompact = installComposerCompactObserver()
    const unsubSidebarTopbar = installSidebarToggleTopbar()
    const unsubPresetAvatars = installAgentPresetAvatarEnhancer()
    return () => {
      unsubToggle?.()
      unsubLeftRail?.()
      unsubSplitMin?.()
      unsubCompact?.()
      unsubSidebarTopbar?.()
      unsubPresetAvatars?.()
    }
  }, 'omnimux: product-stage chrome, chat toggle, topbar sidebar toggle & workbench left-rail sync')
  // 临时关闭：ctx.effect(() => applyXaiShellTheme(ctx), 'omnimux: xai shell theme')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux: dictionaries')
  return ctx.locale.bind(NS)
}
