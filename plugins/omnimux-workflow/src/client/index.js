/** Client half: locale dictionaries, sidebar「项目」row,
 *  the project library tab, and the
 *  project-session canvas tab on dsh-better-sidebar. */
import { createElement } from 'react'
import { NS, en, zh } from './locales.js'
import { mountSidebarEntry } from './sidebar-entry.js'
import { ProjectLibraryPage, WORKFLOW_LIBRARY_TAB_ID } from './projects/ProjectLibraryPage.jsx'
import { CanvasTab } from './projects/CanvasTab.jsx'
import { bindBetterSidebar, CANVAS_TAB_ID } from './projects/projectCanvas.js'
import { installWorkflowGlobal } from './projects/workflow-global.js'

export const name = 'omnimux-workflow'
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'layout']

/**
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   slots: { inject: Function, register: Function },
 *   sessions: { create: Function, open: Function, list: { getSnapshot: Function } },
 *   workspaces?: { list: { getSnapshot: Function } },
 *   layout: { openDetails: Function, closeDetails: Function },
 *   betterSidebar?: { registerTab: Function },
 *   inject?: Function,
 *   effect?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-workflow: dictionaries')
  const t = ctx.locale.bind(NS)

  // 侧栏：项目 row（rank 4）。官方新建会话保持单行通栏独占，新建项目统一通过项目库页创建。
  ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-workflow: sidebar entry')

  // Cross-plugin seam: inspiration (and future callers) create a project
  // without importing this package. Disposer deletes window.__omnimuxWorkflow.
  const seamDeps = {
    sessions: ctx.sessions,
    workspaces: ctx.workspaces,
    layout: ctx.layout,
    stage: null,
    t,
  }
  ctx.effect(
    () => installWorkflowGlobal(typeof window !== 'undefined' ? window : undefined, seamDeps),
    'omnimux-workflow: global seam',
  )

  const renderWorkflowIcon = (size = 16) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  }, [
    createElement('path', {
      key: 'p',
      fill: 'currentColor',
      d: 'M2 5.5a1.5 1.5 0 0 1 3 0V6h10v-.5a1.5 1.5 0 0 1 3 0v4.757a5.5 5.5 0 0 0-1-.657V5.5a.5.5 0 0 0-1 0v3.707a5.5 5.5 0 0 0-1-.185V7H5v6h4.207a5.5 5.5 0 0 0-.185 1H5v.5a1.5 1.5 0 0 1-3 0zm2 0a.5.5 0 0 0-1 0v9a.5.5 0 0 0 1 0zm15 9a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0m-2.287-.437l-2.97-1.65a.5.5 0 0 0-.743.437v3.3a.5.5 0 0 0 .743.437l2.97-1.65a.5.5 0 0 0 0-.874',
    }),
  ])

  const registerWorkflowLibraryTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: WORKFLOW_LIBRARY_TAB_ID,
      title: () => t('nav') || '项目',
      icon: renderWorkflowIcon,
      order: 14,
      hidden: false,
      single: true,
      component: (props) => createElement(ProjectLibraryPage, {
        ...props,
        t,
        sessions: ctx.sessions,
        workspaces: ctx.workspaces,
        layout: ctx.layout,
        betterSidebar: sidebar,
      }),
    })
  }

  const registerCanvas = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    bindBetterSidebar(sidebar)
    return sidebar.registerTab({
      id: CANVAS_TAB_ID,
      title: () => t('details.canvasTab'),
      icon: renderWorkflowIcon,
      order: 5,
      hidden: false,
      single: true,
      component: (props) => createElement(CanvasTab, { ...props, t }),
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
      bindWorkbench({ betterSidebar: sidebar, layout: ctx.layout, sessions: ctx.sessions })
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => registerWorkflowLibraryTab(sidebar), 'omnimux-workflow: library tab')
        ctx.effect(() => registerCanvas(sidebar), 'omnimux-workflow: canvas tab')
      } else {
        registerWorkflowLibraryTab(sidebar)
        registerCanvas(sidebar)
      }
    })
  }
}
