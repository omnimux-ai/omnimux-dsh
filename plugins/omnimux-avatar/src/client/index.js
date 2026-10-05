// 虚拟形象工作台的客户端装配入口：语言包、左栏入口、工作台 Tab。
//
// 与 omnimux-assets 的入口同形（左栏入口 + 一级页 Tab），差异只有 id / rank / 文案：
//   · Tab：omnimux-avatar:studio，order 20（紧邻任务表单 19），single + 可见；
//   · 左栏行：rank 8，access offline，datasetKey data-omnimux-avatar-entry；
//   · 激活判定完全交给中枢仲裁（window.__omnimuxWorkbench.createSidebarStore），
//     本插件不自行推断开关状态，也不抢占任何全局 overlay。

import { createElement } from 'react'
import { createSidebarEntry } from 'dsh-ui-kit'

import { AvatarStage } from './AvatarStage.jsx'
import { NS, en, zh } from './locales.js'
import { injectAvatarStyles } from './styles.js'

injectAvatarStyles()

export const name = 'omnimux-avatar'
export const inject = ['slots', 'locale']

/** 工作台 Tab id（左栏入口与 Tab 注册共用同一个 id）。 */
export const AVATAR_TAB_ID = 'omnimux-avatar:studio'

/** 左栏行的 DOM 标记，供契约与 QA 选择器使用。 */
export const ENTRY_SELECTOR = '[data-omnimux-avatar-entry]'

/** 左栏行的矢量图标（14×14，无 emoji）。 */
const ENTRY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="14" height="14" fill="none" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><g><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M11 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Zm0 1.8a2.45 2.45 0 1 1 0 4.9 2.45 2.45 0 0 1 0-4.9Z"/><path fill="currentColor" d="M11 13.1c-4.06 0-7.35 2.2-7.35 5.4 0 .55.45 1 1 1h12.7c.55 0 1-.45 1-1 0-3.2-3.29-5.4-7.35-5.4Z"/></g></svg>'

/**
 * Tab 与左栏行共用的标题解析：取不到词条时回落到中文原文，
 * 绝不让界面渲染出 `nav` 这样的键名。
 * @param {(key: string) => string} t
 * @returns {string}
 */
function resolveTitle(t) {
  try {
    const value = typeof t === 'function' ? t('nav') : undefined
    if (value && value !== 'nav') return value
  } catch {
    /* 语言包可能尚未就绪；用中文原文兜底 */
  }
  return '虚拟形象'
}

/**
 * Tab 图标：矢量人物轮廓，随宿主给定尺寸缩放。
 * @param {number} [size]
 * @returns {unknown}
 */
function renderAvatarIcon(size = 16) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 22 22',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    [
      createElement('path', {
        key: 'head',
        fill: 'currentColor',
        fillRule: 'evenodd',
        clipRule: 'evenodd',
        d: 'M11 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Zm0 1.8a2.45 2.45 0 1 1 0 4.9 2.45 2.45 0 0 1 0-4.9Z',
      }),
      createElement('path', {
        key: 'body',
        fill: 'currentColor',
        d: 'M11 13.1c-4.06 0-7.35 2.2-7.35 5.4 0 .55.45 1 1 1h12.7c.55 0 1-.45 1-1 0-3.2-3.29-5.4-7.35-5.4Z',
      }),
    ]
  )
}

/**
 * 左栏行的六方法适配器：全部转发给中枢的工作台 store。
 *
 * `getSnapshot()` 只回报仲裁者的判定结果；本插件不保留、也不推断任何
 * 「是否打开」的影子状态（那会与中枢的会话优先级判定打架）。
 *
 * @param {(key: string) => string} t
 * @param {string} tabId
 */
function createWorkbenchStageStore(t, tabId) {
  let store = null

  const ensure = () => {
    if (store) return store
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.createSidebarStore !== 'function') return null
    store = api.createSidebarStore({
      tabId,
      title: () => resolveTitle(t),
    })
    return store
  }

  return {
    getSnapshot() {
      return Boolean(ensure()?.getSnapshot?.())
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      const ready = ensure()
      if (ready && typeof ready.subscribe === 'function') return ready.subscribe(listener)
      // 中枢可能晚于本插件挂载：先轮询等待，超时后放弃而不是永久挂起。
      let unsubscribe = () => {}
      const startedAt = Date.now()
      const timer = setInterval(() => {
        const next = ensure()
        if (next && typeof next.subscribe === 'function') {
          clearInterval(timer)
          unsubscribe = next.subscribe(listener)
          listener()
          return
        }
        if (Date.now() - startedAt > 8000) clearInterval(timer)
      }, 50)
      return () => {
        clearInterval(timer)
        unsubscribe()
      }
    },
    open() {
      ensure()?.open?.()
    },
    close() {
      ensure()?.close?.()
    },
    set(next) {
      if (next) this.open()
      else this.close()
    },
    readBox() {
      return ensure()?.readBox?.() || { top: 0, left: 0, width: 0, height: 0 }
    },
  }
}

/**
 * 挂载「新会话」下方的左栏行。
 * @param {(key: string) => string} t
 * @param {unknown} locale
 * @returns {() => void}
 */
function mountSidebarEntry(t, locale) {
  return createSidebarEntry({
    id: 'omnimux-avatar',
    rank: 8,
    label: () => resolveTitle(t),
    iconSvg: ENTRY_ICON,
    stageStore: createWorkbenchStageStore(t, AVATAR_TAB_ID),
    locale,
    access: 'offline',
    customClassName: 'omnimux-avatar-entry',
    datasetKey: 'data-omnimux-avatar-entry',
  })
}

/**
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   slots: { inject: Function, register: Function },
 *   inject?: Function,
 *   effect?: Function,
 *   get?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omnimux-avatar: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.effect(() => mountSidebarEntry(t, ctx.locale), 'omnimux-avatar: sidebar entry')

  const registerAvatarTab = (sidebar) => {
    if (!sidebar || typeof sidebar.registerTab !== 'function') return () => {}
    return sidebar.registerTab({
      id: AVATAR_TAB_ID,
      title: () => resolveTitle(t),
      order: 20,
      hidden: false,
      single: true,
      icon: renderAvatarIcon,
      component: (props) => createElement(AvatarStage, { ...props, t }),
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['betterSidebar'], (inner) => {
      const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
      try {
        window.__omnimuxWorkbench?.bind?.({ betterSidebar: sidebar })
      } catch {
        /* 中枢未就绪时左栏行会自行等待，这里不阻断装配 */
      }
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => registerAvatarTab(sidebar), 'omnimux-avatar: studio tab')
      } else {
        registerAvatarTab(sidebar)
      }
    })
  }
}
