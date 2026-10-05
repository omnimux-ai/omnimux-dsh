// 历史画廊的浏览方式偏好：时间线 or 网格。
//
// 来源：OmniMux/web/src/features/influencer/lib/view-mode.ts（只读真源），行为 1:1。
// 偏离：localStorage 键按插件命名空间改为 `omnimux-avatar:view-mode`。

import { STORAGE_KEYS } from './types.js'

const KEY = STORAGE_KEYS.viewMode

/**
 * 默认是时间线；未知或读不到的值都回退到它。
 * @returns {import('./types.js').InfluencerViewMode}
 */
export function readViewMode() {
  try {
    return localStorage.getItem(KEY) === 'grid' ? 'grid' : 'timeline'
  } catch {
    return 'timeline'
  }
}

/**
 * @param {import('./types.js').InfluencerViewMode} mode
 * @returns {void}
 */
export function writeViewMode(mode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* 存储可能不可用；本次会话内该选择依然生效 */
  }
}
