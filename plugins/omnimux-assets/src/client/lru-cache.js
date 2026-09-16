/**
 * 有上限的最近最少使用（LRU）缓存。
 *
 * 资产中心的清单、分页与图片都值得缓存，但都不能无限长：一个会话里来回切分类会
 * 攒下成百上千条分页与上千张图片，没有上限就是内存泄漏。这里给出一个刻意做小的
 * 容器——只做「取、放、超限淘汰最久未用」三件事，命中不会改变插入顺序之外的状态，
 * 因此不需要额外的定时器或清理钩子。
 *
 * 取（`get`）会把该键挪到最新端，所以「最久未用」是真的按访问时间算，而不是按写入
 * 时间算——来回切两个分类时，两个都留在缓存里，只有第三个才会挤掉真正冷下来的那个。
 *
 * @template T
 */
export class LruCache {
  /**
   * @param {number} capacity 最多保留多少条；必须为正整数
   */
  constructor(capacity) {
    const size = Math.floor(Number(capacity))
    if (!Number.isFinite(size) || size < 1) {
      throw new RangeError('LruCache capacity must be a positive integer')
    }
    /** @type {number} */
    this.capacity = size
    /** @type {Map<string, T>} Map 保持插入顺序，最新写入的在末尾。 */
    this.entries = new Map()
  }

  /** @returns {number} 当前条数。 */
  get size() {
    return this.entries.size
  }

  /**
   * 取一条；命中即刷新其新鲜度。
   * @param {string} key
   * @returns {T | undefined}
   */
  get(key) {
    if (!this.entries.has(key)) return undefined
    const value = /** @type {T} */ (this.entries.get(key))
    // 重新插入 = 挪到最新端。删除再写入是 Map 上唯一可靠的「提升」方式。
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  /** @param {string} key @returns {boolean} */
  has(key) {
    return this.entries.has(key)
  }

  /**
   * 放一条；超限时淘汰最久未用的那些。
   * @param {string} key
   * @param {T} value
   * @returns {T} 放进去的值，便于链式使用
   */
  set(key, value) {
    if (this.entries.has(key)) this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.capacity) {
      // Map 的迭代顺序就是插入顺序，第一个即最久未用。
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
    return value
  }

  /** 清空。 */
  clear() {
    this.entries.clear()
  }

  /**
   * 归一化一组查询条件为缓存键。
   *
   * 条件顺序不同必须得到同一个键（同一组筛选只是点选顺序不同），因此排序后再拼。
   * @param {...(string | string[] | number | undefined | null)} parts
   * @returns {string}
   */
  static keyOf(...parts) {
    return parts.map((part) => {
      if (Array.isArray(part)) return [...part].map(String).sort().join(',')
      return part === undefined || part === null ? '' : String(part)
    }).join('|')
  }
}
