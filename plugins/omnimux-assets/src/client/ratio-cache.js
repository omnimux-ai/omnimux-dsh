/**
 * 资产中心封面比例缓存（内存 LRU + localStorage 持久化）。
 *
 * 首次从网络下载图片并 onLoad 后，记录其真实宽高比并持久化；
 * 下次进入时直接取用该比例，首帧排版高度即 100% 准确，彻底消除二次布局跳动（CLS = 0）。
 * 容量上限默认 1000 条，超出淘汰最久未访问条目，本地存储安全受限。
 */
import { LruCache } from './lru-cache.js'

export const DEFAULT_RATIO_CACHE_KEY = 'omnimux_asset_cover_ratios_v1'
export const DEFAULT_RATIO_CACHE_CAPACITY = 1000

export class RatioCache {
  /**
   * @param {{ capacity?: number, storageKey?: string, storage?: any }} [options]
   */
  constructor(options = {}) {
    const {
      capacity = DEFAULT_RATIO_CACHE_CAPACITY,
      storageKey = DEFAULT_RATIO_CACHE_KEY,
      storage = typeof localStorage !== 'undefined' ? localStorage : null,
    } = options
    this.capacity = capacity
    this.storageKey = storageKey
    this.storage = storage
    this.lru = new LruCache(capacity)
    this._load()
  }

  _load() {
    if (!this.storage || !this.storageKey) return
    try {
      const raw = this.storage.getItem(this.storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const [k, v] of parsed) {
          const ratio = Number(v)
          if (k && Number.isFinite(ratio) && ratio > 0) {
            this.lru.set(String(k), ratio)
          }
        }
      }
    } catch {
      // 容错：解析失败或存储异常不中断运行时
    }
  }

  _save() {
    if (!this.storage || !this.storageKey) return
    try {
      const entries = Array.from(this.lru.entries.entries())
      this.storage.setItem(this.storageKey, JSON.stringify(entries))
    } catch {
      // 存储满或受限时静默容错
    }
  }

  get(id) {
    if (id == null) return undefined
    return this.lru.get(String(id))
  }

  has(id) {
    if (id == null) return false
    return this.lru.has(String(id))
  }

  set(id, ratio) {
    if (id == null) return ratio
    const val = Number(ratio)
    if (!Number.isFinite(val) || val <= 0) return ratio
    this.lru.set(String(id), val)
    this._save()
    return val
  }

  clear() {
    this.lru.clear()
    if (this.storage && this.storageKey) {
      try {
        this.storage.removeItem(this.storageKey)
      } catch {}
    }
  }

  get size() {
    return this.lru.size
  }
}

export const coverRatioCache = new RatioCache()
