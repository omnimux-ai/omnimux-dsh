/**
 * 「自动化」客户端入口。
 *
 * 唯一座位是社区 betterSidebar 的右侧工作台 Tab：不注册任何 slot、不写
 * `data-dsh-product-stage`、不触碰左侧任务树，也不做任何更新检查。
 */

import { createElement } from 'react'
import { AutomationWorkbench } from './AutomationWorkbench.jsx'
import { en, NS, zh } from './locales.js'
import { createScheduledSessionOpener } from './open-session.js'
import { createAutomationRuntime, installAutomationSessionSync } from './runtime.js'
import { IconWorkbench } from './icons.jsx'
import { injectAutomationStyles } from './styles.js'

export const name = 'omnimux-automation-client'
export const inject = ['locale', 'connection', 'sessions']

/** 工作台 Tab 的唯一标识。 */
export const AUTOMATION_TAB_ID = 'omnimux-automation:workbench'

/** Tab 在右侧工作台的位序：assets/studio 15、products 16、accounts 17、forms 19、analytics 20。 */
export const AUTOMATION_TAB_ORDER = 21

/**
 * @param {import('./contracts.js').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => injectAutomationStyles(), 'omnimux-automation: styles')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-automation: locale')

  const t = ctx.locale.bind(NS)
  const permissionT = ctx.locale.bind('permission.access')
  const modelT = ctx.locale.bind('model')
  const runtime = createAutomationRuntime(ctx.connection.rpc)
  const openSession = createScheduledSessionOpener(ctx, runtime)

  ctx.effect(() => installAutomationSessionSync(runtime, () => ctx.sessions), 'omnimux-automation: session sync')

  const bindWorkbench = (patch) => {
    try {
      globalThis.window?.__omnimuxWorkbench?.bind?.(patch)
    } catch {
      // 工作台全局桥缺席时不影响 Tab 注册。
    }
  }

  if (typeof ctx.inject !== 'function') return
  ctx.inject(['betterSidebar'], (inner) => {
    const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
    bindWorkbench({ betterSidebar: sidebar })
    if (typeof sidebar?.registerTab !== 'function') {
      console.warn('[omnimux-automation] betterSidebar 缺席：不注册工作台 Tab')
      return
    }
    const registerTab = () => sidebar.registerTab({
      id: AUTOMATION_TAB_ID,
      title: () => t('nav'),
      icon: size => createElement(IconWorkbench, { size }),
      order: AUTOMATION_TAB_ORDER,
      hidden: false,
      single: true,
      component: props => createElement(AutomationWorkbench, {
        ...props,
        t,
        permissionT,
        modelT,
        runtime,
        openSession,
      }),
    })
    if (typeof ctx.effect === 'function') {
      ctx.effect(registerTab, 'omnimux-automation: workbench tab')
      return
    }
    registerTab()
  })
}
