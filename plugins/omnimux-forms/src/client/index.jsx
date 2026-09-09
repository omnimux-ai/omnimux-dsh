import React from 'react'
import { mountSidebarEntry } from './sidebar-entry.js'
import { FormsPage } from './FormsPage.jsx'
export const name = 'omnimux-forms'
export const inject = ['slots']
export const FORMS_TAB_ID = 'omnimux-forms:tasks'
export function apply(ctx) {
  ctx.effect(() => mountSidebarEntry(null, () => '任务表单', null), 'omnimux-forms: sidebar entry')
  ctx.inject(['betterSidebar'], inner => {
    const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
    ctx.effect(() => sidebar.registerTab({
      id: FORMS_TAB_ID, title: () => '任务表单', order: 19, hidden: false, single: true,
      icon: size => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>,
      component: FormsPage,
    }), 'omnimux-forms: tasks tab')
  })
}
