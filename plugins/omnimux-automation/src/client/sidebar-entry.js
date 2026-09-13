/**
 * 「自动化」在左栏（新会话下方）的入口行。
 *
 * 复用 dsh-ui-kit 的 createSidebarEntry：由侧边栏协调器按 rank 统一排位与注入样式，
 * 点击幂等地打开右侧工作台 Tab（omnimux-automation:workbench），不抢占任何 overlay。
 * 视觉计量见 docs/contracts/sidebar-extra-entries.md。
 */
import { createSidebarEntry } from 'dsh-ui-kit'

export const ENTRY_SELECTOR = '[data-omnimux-automation-entry]'
export const AUTOMATION_TAB_ID = 'omnimux-automation:workbench'

// 14×14 契约：与官方会话行同光学尺寸；字形沿用工作台内的自动化时钟。
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.25"/><path d="M12 7.7v4.7l3.15 1.85"/><path d="M5.6 4.9 4.2 6.3M18.4 4.9l1.4 1.4"/></g></svg>'

/** 工作台 Tab 标题：优先取词条，词条缺席时回落中文，避免 Tab 头出现空标题。 */
function resolveWorkbenchTitle(t) {
  try {
    const val = typeof t === 'function' ? t('nav') : undefined
    if (val && val !== 'nav') return val
  } catch {}
  return '自动化'
}

/**
 * 把工作台全局桥包成 createSidebarEntry 需要的六方法 store。
 * 协调器/host 桥晚一步到位时保持惰性订阅，最多等 8s。
 */
function createWorkbenchStageStore(t, tabId) {
  let store = null
  const ensure = () => {
    if (store) return store
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.createSidebarStore !== 'function') return null
    store = api.createSidebarStore({
      tabId,
      title: () => resolveWorkbenchTitle(t),
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
      let unsub = () => {}
      const started = Date.now()
      const timer = setInterval(() => {
        const next = ensure()
        if (next && typeof next.subscribe === 'function') {
          clearInterval(timer)
          unsub = next.subscribe(listener)
          listener()
          return
        }
        if (Date.now() - started > 8000) clearInterval(timer)
      }, 50)
      return () => {
        clearInterval(timer)
        unsub()
      }
    },
    open() {
      const s = ensure()
      if (!s) return
      s.open()
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
 * 挂载左栏入口行：无产品级 stage，点击只打开工作台 Tab。
 * @param {unknown} _stage 保留位：库页不使用产品级 stage。
 * @param {(key: string) => string} t 本插件词条的翻译函数。
 * @param {{ subscribe?: Function } | undefined} locale 词条语言订阅口。
 * @returns {() => void} 协调器注销函数。
 */
export function mountSidebarEntry(_stage, t, locale) {
  return createSidebarEntry({
    id: 'omnimux-automation',
    rank: 9,
    label: () => t('nav') || '自动化',
    iconSvg: ICON,
    stageStore: createWorkbenchStageStore(t, AUTOMATION_TAB_ID),
    locale,
    access: 'offline',
    customClassName: 'omnimux-automation-entry',
    datasetKey: 'data-omnimux-automation-entry',
  })
}
