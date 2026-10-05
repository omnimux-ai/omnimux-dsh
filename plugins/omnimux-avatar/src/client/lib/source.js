// 右栏数据源偏好：灵感库 or 我的历史。
//
// 来源：OmniMux/web/src/features/influencer/lib/source.ts（只读真源），行为 1:1。
// 偏离：localStorage 键按插件命名空间改为 `omnimux-avatar:source`。

import { STORAGE_KEYS } from './types.js'

const KEY = STORAGE_KEYS.source

/**
 * 默认是灵感库：首次到访的访客没有值得展示的历史，
 * 而预设库才是让工作台不必打字就能用起来的东西。未知或读不到的值都回退到它。
 * @returns {import('./types.js').InfluencerSource}
 */
export function readSource() {
  try {
    return localStorage.getItem(KEY) === 'history' ? 'history' : 'explore'
  } catch {
    return 'explore'
  }
}

/**
 * @param {import('./types.js').InfluencerSource} source
 * @returns {void}
 */
export function writeSource(source) {
  try {
    localStorage.setItem(KEY, source)
  } catch {
    /* 存储可能不可用；本次会话内该选择依然生效 */
  }
}
