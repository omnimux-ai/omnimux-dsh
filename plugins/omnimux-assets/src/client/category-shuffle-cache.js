/**
 * Category shuffle and session cache helpers for cloud assets row layout.
 *
 * Provides safe Fisher-Yates array shuffling and a session-level cache to keep
 * randomized card order stable during tab switching and navigation within the same
 * session, while allowing explicit invalidation when the user triggers a refresh.
 */

/**
 * Immutably shuffle an array using Fisher-Yates algorithm.
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
export function shuffleArray(items) {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? [...items] : []
  }
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

export class CategoryShuffleCache {
  /**
   * @param {number} [maxEntries=30]
   */
  constructor(maxEntries = 30) {
    this.maxEntries = maxEntries
    /** @type {Map<string, any[]>} */
    this.cache = new Map()
  }

  /**
   * @param {string} categoryId
   * @returns {any[] | undefined}
   */
  get(categoryId) {
    return this.cache.get(categoryId)
  }

  /**
   * @param {string} categoryId
   * @param {any[]} items
   */
  set(categoryId, items) {
    if (this.cache.size >= this.maxEntries && !this.cache.has(categoryId)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(categoryId, Array.isArray(items) ? items : [])
  }

  /**
   * Get cached shuffled items or shuffle and cache new items.
   * @param {string} categoryId
   * @param {any[]} sourceItems
   * @returns {any[]}
   */
  getOrShuffle(categoryId, sourceItems) {
    const existing = this.get(categoryId)
    if (existing !== undefined && existing.length > 0) {
      return existing
    }
    const shuffled = shuffleArray(sourceItems)
    this.set(categoryId, shuffled)
    return shuffled
  }

  /**
   * Check if category is cached.
   * @param {string} categoryId
   * @returns {boolean}
   */
  has(categoryId) {
    return this.cache.has(categoryId)
  }

  /**
   * Invalidate all cached shuffles (e.g. on manual refresh).
   */
  clear() {
    this.cache.clear()
  }
}

/** Global shuffle cache instance for cloud assets view */
export const globalShuffleCache = new CategoryShuffleCache(30)
