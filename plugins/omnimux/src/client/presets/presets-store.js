/**
 * 营销视频创意预设（格式、亮点、视觉风格）状态管理 Store
 * 会话级隔离，支持响应式订阅与一次性消费
 * 严格保证 getSnapshot 返回不可变引用，杜绝 useSyncExternalStore React 185 死循环
 */

/**
 * @typedef {'format' | 'hook' | 'style'} CreativeDimension
 * 
 * @typedef {Object} PresetsState
 * @property {any | null} format 选中的广告格式
 * @property {any | null} hook 选中的开场亮点
 * @property {any | null} style 选中的视觉风格
 */

const DEFAULT_STATE = Object.freeze({
  format: null,
  hook: null,
  style: null,
})

class CreativePresetsStore {
  constructor() {
    /** @type {Map<string, PresetsState>} */
    this.sessionStates = new Map()
    /** @type {Map<string, Set<() => void>>} */
    this.listeners = new Map()
  }

  /**
   * 获取指定会话的预设快照（返回不可变稳定引用）
   * @param {string} [sessionId]
   * @returns {PresetsState}
   */
  getSnapshot(sessionId = 'default') {
    const key = sessionId || 'default'
    const state = this.sessionStates.get(key)
    if (!state) {
      return DEFAULT_STATE
    }
    return state
  }

  /**
   * 订阅指定会话的状态变更
   * @param {string} [sessionId]
   * @param {() => void} listener
   * @returns {() => void} 取消订阅函数
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
   * 通知监听者
   * @private
   * @param {string} key
   */
  _notify(key) {
    const set = this.listeners.get(key)
    if (set) {
      set.forEach((fn) => {
        try {
          fn()
        } catch (err) {
          console.error('[PresetsStore] listener error:', err)
        }
      })
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('omnimux:creative-presets:changed', {
          detail: { sessionId: key, state: this.getSnapshot(key) },
        })
      )
    }
  }

  /**
   * 设置某个维度的预设
   * @param {string} sessionId
   * @param {CreativeDimension} dimension
   * @param {any | null} item
   */
  setPreset(sessionId = 'default', dimension, item) {
    const key = sessionId || 'default'
    const current = this.getSnapshot(key)
    if (current[dimension] === item) return
    const next = Object.freeze({
      ...current,
      [dimension]: item,
    })
    this.sessionStates.set(key, next)
    this._notify(key)
  }

  /**
   * 移除某个维度的预设
   * @param {string} sessionId
   * @param {CreativeDimension} dimension
   */
  removePreset(sessionId = 'default', dimension) {
    this.setPreset(sessionId, dimension, null)
  }

  /**
   * 清空所有维度的预设
   * @param {string} sessionId
   */
  clearPresets(sessionId = 'default') {
    const key = sessionId || 'default'
    const current = this.getSnapshot(key)
    if (current === DEFAULT_STATE) return
    this.sessionStates.set(key, DEFAULT_STATE)
    this._notify(key)
  }

  /**
   * 检查是否有任意已选维度
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasAnyPreset(sessionId = 'default') {
    const state = this.getSnapshot(sessionId)
    return Boolean(state.format || state.hook || state.style)
  }
}

let globalStore = null

/**
 * 获取全局预设单例
 * @returns {CreativePresetsStore}
 */
export function getCreativePresetsStore() {
  if (!globalStore) {
    globalStore = new CreativePresetsStore()
  }
  return globalStore
}
