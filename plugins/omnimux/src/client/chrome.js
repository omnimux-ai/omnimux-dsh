import { configFromWindow, startOverlay } from '../brand/overlay.js'
import { ensureProductStageChrome } from './conversation-box.js'
import { installStageGlobal } from './stage.js'
import { installSidebarGlobal } from './sidebar-coordinator.js'
import { installAuthGlobal } from './auth-gate.js'
import { installWorkbenchGlobal, installWorkbenchLeftRailObserver, installSidebarActivation, installSplitConversationMin, hydrateConversationCollapsed, reconcileRightbarFromRatio } from './workbench.js'
import { installChatToggle } from './chat-toggle.js'
import { ensureConversationCollapseChrome } from './conversation-collapse.js'
import { ensureComposerCompactChrome, installComposerCompactObserver } from './composer-compact.js'
import { ensureConversationScrollbarChrome, installConversationScrollbarReveal } from './conversation-scrollbar.js'
import { installWelcomeGreetingObserver } from './welcome-greeting.js'
import { installFullscreenCollapseSync } from './workbench/fullscreen-collapse-sync.js'
import { installComposerWidthGuard } from './composer-width-guard.js'
import { installTabViewportReconciler } from './workbench/tab-viewport-reconciler.js'
import { installAgentPresetAvatarEnhancer } from './agent-preset-enhancer.js'
import { installSidebarToggleTopbar, setTopbarGeometryHook } from './sidebar-toggle-topbar.js'
import { installCollapsedPanelFill } from './rightbar-collapsed-fill.js'
import { NS, en, zh } from './locales.js'
import { bindWorkbenchDeps, getWorkbenchService } from './workbench/host-adapter.js'
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
      inner.effect(() => {
        const service = inner.betterSidebar ?? inner.get?.('betterSidebar')
        workbench.bind({ betterSidebar: service })
        return () => {
          if (getWorkbenchService() === service) workbench.bind({ betterSidebar: null })
        }
      }, 'omnimux: sidebar context')
    })
    ctx.inject(['sidebarRight'], (inner) => {
      inner.effect(() => {
        bindWorkbenchDeps({ sidebarRight: inner.sidebarRight })
        return () => bindWorkbenchDeps({ sidebarRight: null })
      }, 'omnimux: native sidebar context')
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
    ensureConversationScrollbarChrome()
    hydrateConversationCollapsed()
    // 左侧栏激活位仲裁器：观察宿主三栏状态，裁决变化走既有 notifyWorkbenchChange 广播。
    const unsubActivation = installSidebarActivation()
    const unsubToggle = installChatToggle()
    const unsubLeftRail = installWorkbenchLeftRailObserver()
    const unsubSplitMin = installSplitConversationMin()
    const unsubCompact = installComposerCompactObserver()
    const unsubSidebarTopbar = installSidebarToggleTopbar()
    // 缩放后中栏按新比例重算，右栏面板宽与分隔线把手必须同一次跟上（D7-S1′）：
    // 顶栏模块只写中栏变量，面板宽由工作台协调写，两者挂在同一次 resize 上（透传 doc 杜绝分叉，M-2）。
    setTopbarGeometryHook((doc) => { reconcileRightbarFromRatio(undefined, { doc }) })
    const unsubCollapsedFill = installCollapsedPanelFill()
    const unsubPresetAvatars = installAgentPresetAvatarEnhancer()
    const unsubWelcome = installWelcomeGreetingObserver()
    const unsubScrollbar = installConversationScrollbarReveal()
    const unsubFullscreenCollapse = installFullscreenCollapseSync()
    const unsubWidthGuard = installComposerWidthGuard()
    const unsubTabReconciler = installTabViewportReconciler()
    return () => {
      unsubActivation?.()
      unsubToggle?.()
      unsubLeftRail?.()
      unsubSplitMin?.()
      unsubCompact?.()
      unsubSidebarTopbar?.()
      setTopbarGeometryHook(null)
      unsubCollapsedFill?.()
      unsubPresetAvatars?.()
      unsubWelcome?.()
      unsubScrollbar?.()
      unsubFullscreenCollapse?.()
      unsubWidthGuard?.()
      unsubTabReconciler?.()
    }
  }, 'omnimux: product-stage chrome, chat toggle, topbar sidebar toggle & workbench left-rail sync')
  // 临时关闭：ctx.effect(() => applyXaiShellTheme(ctx), 'omnimux: xai shell theme')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux: dictionaries')
  return ctx.locale.bind(NS)
}
