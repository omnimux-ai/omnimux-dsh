/**
 * @file composer-mode-store.js
 * 输入框创作模式状态存储中心（Agent / 营销 / 短剧）
 * 
 * 遵守规范：
 * 1. 严格遵守 useSyncExternalStore 引用稳定性法则，getSnapshot 产出不可变原始类型值，绝不返回未缓存的新引用对象。
 * 2. 默认模式为 'agent'，保持原生界面极简清爽；
 * 3. 仅在 'marketing' 模式下展示营销创意预设；'drama' 短剧模式作为占位暂时与 'agent' 一致。
 */

export const MODE_AGENT = 'agent'
export const MODE_MARKETING = 'marketing'
export const MODE_DRAMA = 'drama'

export const COMPOSER_MODES = Object.freeze([
  Object.freeze({ id: MODE_AGENT, label: 'Agent' }),
  Object.freeze({ id: MODE_MARKETING, label: '营销' }),
  Object.freeze({ id: MODE_DRAMA, label: '短剧' }),
])

export const DEFAULT_COMPOSER_MODE = MODE_AGENT

class ComposerModeStore {
  constructor() {
    this.sessionModes = new Map()
    this.listeners = new Map()
    this.globalListeners = new Set()
  }

  /**
   * 获取指定会话的当前模式（默认 'agent'）
   * @param {string} sessionId
   * @returns {'agent' | 'marketing' | 'drama'}
   */
  getMode(sessionId = 'default') {
    const key = sessionId || 'default'
    return this.sessionModes.get(key) || DEFAULT_COMPOSER_MODE
  }

  /**
   * 设置指定会话的模式
   * @param {string} sessionId
   * @param {'agent' | 'marketing' | 'drama'} mode
   */
  setMode(sessionId = 'default', mode) {
    const key = sessionId || 'default'
    const targetMode = COMPOSER_MODES.some((m) => m.id === mode) ? mode : DEFAULT_COMPOSER_MODE
    const current = this.getMode(key)
    if (current === targetMode) return

    this.sessionModes.set(key, targetMode)
    this._notify(key)
  }

  /**
   * 订阅指定会话的模式变更 (React useSyncExternalStore 接口)
   * @param {string} sessionId
   * @param {() => void} listener
   * @returns {() => void}
   */
  subscribe(sessionId = 'default', listener) {
    const key = sessionId || 'default'
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    const set = this.listeners.get(key)
    set.add(listener)

    return () => {
      set.delete(listener)
      if (set.size === 0) {
        this.listeners.delete(key)
      }
    }
  }

  /**
   * 订阅全局所有会话变更
   * @param {() => void} listener
   * @returns {() => void}
   */
  subscribeGlobal(listener) {
    this.globalListeners.add(listener)
    return () => {
      this.globalListeners.delete(listener)
    }
  }

  /**
   * 获取会话快照（返回稳定 string primitive）
   * @param {string} sessionId
   * @returns {string}
   */
  getSnapshot(sessionId = 'default') {
    return this.getMode(sessionId)
  }

  /**
   * 重置指定会话或所有会话（测试及清理用）
   * @param {string} [sessionId]
   */
  reset(sessionId) {
    if (sessionId) {
      const key = sessionId || 'default'
      this.sessionModes.delete(key)
      this._notify(key)
    } else {
      const keys = Array.from(this.sessionModes.keys())
      this.sessionModes.clear()
      for (const key of keys) {
        this._notify(key)
      }
    }
  }

  _notify(sessionId) {
    const set = this.listeners.get(sessionId)
    if (set) {
      for (const listener of set) {
        try {
          listener()
        } catch (err) {
          console.error('[ComposerModeStore] listener error:', err)
        }
      }
    }
    for (const listener of this.globalListeners) {
      try {
        listener()
      } catch (err) {
        console.error('[ComposerModeStore] global listener error:', err)
      }
    }
  }
}

let storeInstance = null

export function getComposerModeStore() {
  if (!storeInstance) {
    storeInstance = new ComposerModeStore()
  }
  return storeInstance
}
