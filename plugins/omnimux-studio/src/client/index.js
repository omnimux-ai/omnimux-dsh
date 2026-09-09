import React from 'react'
import { NS, zhCN, enUS } from './locales.js'
import { StudioStage, installStudioStyles } from './StudioStage.jsx'
import { ScopeRegistry, scopeKey } from './scope-registry.js'

export const name = 'omnimux-studio'
export const inject = ['betterSidebar', 'locale']
export function apply(ctx) {
  ctx.inject(['betterSidebar', 'locale'], inner => {
    const sidebar = inner.betterSidebar
    const locale = inner.locale
    if (typeof sidebar?.registerTab !== 'function' || typeof locale?.register !== 'function' || typeof locale?.bind !== 'function') {
      console.error('omnimux-studio: dependency-unavailable (betterSidebar/registerTab or locale/register/bind)')
      return
    }
    const registry = new ScopeRegistry()
    inner.effect(() => () => registry.disposeAll())
    inner.effect(() => locale.register(NS, { 'zh-CN': zhCN, 'en-US': enUS, en: enUS, zh: zhCN }))
    inner.effect(() => installStudioStyles())
    const t = locale.bind(NS)
    inner.effect(() => sidebar.registerTab({
      id: 'omnimux-studio:workspace', title: () => t('tab.title'),
      order: 15, hidden: false, single: true,
      component: props => React.createElement(StudioStage, { ...props, registry }),
      onClose: (_tab, scope) => { const key = scopeKey(scope); if (key !== null) registry.disposeScope(key) },
    }))
  })
}
