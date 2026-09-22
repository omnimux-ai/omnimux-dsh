/**
 * 快捷方式的会话级共享状态。
 *
 * 四条按钮渲染在输入框**下方**（`conversation.input.dock`），链接卡槽渲染在
 * 输入框**内侧上方**（`conversation.input.attachments`，与素材导轨同一行），
 * 两处是两棵独立的 React 树。状态因此收敛到本模块这一份外部存储：
 * 两侧都只读它、只经它写入，不存在第二份真相。
 *
 * 与 `attachments/store.ts` 同构：会话级快照 + 订阅，会话切换时不串味。
 */

/** 一条会话的快捷方式状态。 */
function emptyState() {
  return {
    /** 当前选中的快捷方式 id；未选中为 null */
    activeId: null,
    /** 当前快捷方式带来的链接卡槽（种类数组，顺序即展示顺序） */
    links: [],
    /** 当前激活的技能身份；取消后为 null，但 activeId/links 保留 */
    skill: null,
  }
}

/**
 * 创建快捷方式状态存储。
 * @returns {{
 *   getSnapshot: (sessionId: string) => object,
 *   set: (sessionId: string, patch: object) => object,
 *   subscribe: (sessionId: string, listener: () => void) => () => void,
 *   dispose: () => void,
 * }}
 */
export function createQuickShortcutStore() {
  const rows = new Map()
  const listeners = new Map()
  const EMPTY = Object.freeze(emptyState())

  const getSnapshot = (sessionId) => rows.get(String(sessionId || 'default')) || EMPTY

  const set = (sessionId, patch) => {
    const key = String(sessionId || 'default')
    const next = { ...(rows.get(key) || EMPTY), ...(patch || {}) }
    Object.freeze(next)
    rows.set(key, next)
    const bucket = listeners.get(key)
    if (bucket) for (const fn of Array.from(bucket)) fn()
    return next
  }

  const subscribe = (sessionId, listener) => {
    if (typeof listener !== 'function') return () => {}
    const key = String(sessionId || 'default')
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(listener)
    return () => {
      const bucket = listeners.get(key)
      if (bucket) bucket.delete(listener)
    }
  }

  const dispose = () => {
    rows.clear()
    listeners.clear()
  }

  return { getSnapshot, set, subscribe, dispose }
}

let globalStore = null

/** 全插件唯一的快捷方式状态存储（与素材 Store 同构的全局单例）。 */
export function getGlobalQuickShortcutStore() {
  if (!globalStore) globalStore = createQuickShortcutStore()
  return globalStore
}
