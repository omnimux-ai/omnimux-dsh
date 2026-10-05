// 历史记录本地缓存：首屏先画，网络答案到了再覆盖。
//
// 来源：OmniMux/web/src/features/influencer/lib/history-cache.ts（只读真源），行为 1:1。
// 偏离：localStorage 键按插件命名空间从 `influencer:history-cache:v1` 改为
// `omnimux-avatar:history-cache:v1`（版本信封与逐账号拒绝语义不变）。

import { isTerminalStatus } from './history.js'
import { MAX_ITEMS, STORAGE_KEYS } from './types.js'

const KEY = STORAGE_KEYS.historyCache
const VERSION = 1

/**
 * @typedef {object} HistoryCacheEnvelope
 * @property {number} v
 * @property {number} userId
 * @property {number} savedAt
 * @property {number} total
 * @property {import('./types.js').TaskRecord[]} items
 */

/**
 * @typedef {object} HistoryCache
 * @property {import('./types.js').TaskRecord[]} items
 * @property {number} total
 * @property {number} savedAt
 */

/**
 * 存储本身在禁用 Cookie 时会抛错，所以每个入口都走这个守卫，
 * 而不是直接碰 localStorage。
 * @returns {Storage|null}
 */
function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 读取本账号缓存的记录。其他账号写入的载荷、旧版本或损坏值一律丢弃而不是展示：
 * 把一个用户的任务显示给另一个用户不是可接受的降级。
 * @param {number|undefined} userId
 * @returns {HistoryCache|null}
 */
export function readHistoryCache(userId) {
  if (typeof userId !== 'number') return null
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed?.v !== VERSION ||
      parsed.userId !== userId ||
      !Array.isArray(parsed.items)
    ) {
      store.removeItem(KEY)
      return null
    }
    const items = parsed.items.filter((item) => item && isTerminalStatus(item.status))
    if (!items.length) return null
    return {
      items,
      total: typeof parsed.total === 'number' ? parsed.total : items.length,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    try {
      store.removeItem(KEY)
    } catch {
      /* 已无可挽回的内容 */
    }
    return null
  }
}

/**
 * 缓存最新的终态记录。进行中的任务跳过：状态与产物仍在变，
 * 回放它们只会显示过期的画廊。
 * @param {number|undefined} userId
 * @param {import('./types.js').TaskRecord[]} items
 * @param {number} total
 * @returns {void}
 */
export function writeHistoryCache(userId, items, total) {
  if (typeof userId !== 'number') return
  const store = storage()
  if (!store) return
  const terminal = items
    .filter((item) => item && isTerminalStatus(item.status))
    .slice(0, MAX_ITEMS)
  if (!terminal.length) return
  /** @type {HistoryCacheEnvelope} */
  const envelope = {
    v: VERSION,
    userId,
    savedAt: Date.now(),
    total,
    items: terminal,
  }
  try {
    store.setItem(KEY, JSON.stringify(envelope))
  } catch {
    /* 配额超限或隐私模式：画廊仍可从网络加载。 */
  }
}

/** 清空缓存。 @returns {void} */
export function clearHistoryCache() {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(KEY)
  } catch {
    /* 没有可清理的内容 */
  }
}
