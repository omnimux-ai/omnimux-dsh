/**
 * Category shuffle and session cache helpers for cloud assets row layout.
 *
 * Provides safe Fisher-Yates array shuffling, multi-page cross-sample recommendation,
 * and a session-level cache to keep randomized card order stable during tab switching
 * and navigation within the same session, while allowing explicit invalidation on refresh.
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

/**
 * 跨页随机采样并混编洗牌算法：
 * 从该分类全量多页池中随机采样目标页码，拉取多页切片混编并做 Fisher-Yates 全局打乱，
 * 彻底消除「每次刷新总在前 24 个素材里打转」的面孔单一问题。
 *
 * @template T
 * @param {string} categoryId 分类 ID（如 character, scene, prop）
 * @param {(catId: string, page: number) => Promise<{ ok: boolean, body?: { items?: any[], totalPages?: number } }>} fetchPageFn
 * @param {(raw: any) => T} [normalizeFn=(x) => x]
 * @param {number} [targetCount=24]
 * @returns {Promise<T[]>}
 */
export async function fetchCategoryRandomSample(
  categoryId,
  fetchPageFn,
  normalizeFn = (x) => x,
  targetCount = 24,
) {
  if (!categoryId || typeof fetchPageFn !== 'function') return []

  // 1. 首次拉取 page 0 获取元数据与总页数
  let initialRes
  try {
    initialRes = await fetchPageFn(categoryId, 0)
  } catch {
    return []
  }
  if (!initialRes?.ok || !Array.isArray(initialRes?.body?.items)) {
    return []
  }

  const firstItems = initialRes.body.items
  const totalPages = Math.max(1, Number(initialRes.body?.totalPages) || 1)

  // 2. 若仅有 1 页，则无需跨页抽样，直接原地打乱并截取
  if (totalPages <= 1) {
    return shuffleArray(firstItems.map(normalizeFn)).slice(0, targetCount)
  }

  // 3. 多页分类：在 [0, totalPages - 1] 范围内随机抽样 1~2 个页码
  const pageA = Math.floor(Math.random() * totalPages)
  let candidatePool = []

  if (pageA === 0) {
    candidatePool = [...firstItems]
  } else {
    try {
      const resA = await fetchPageFn(categoryId, pageA)
      if (resA?.ok && Array.isArray(resA.body?.items) && resA.body.items.length > 0) {
        candidatePool = [...resA.body.items]
      } else {
        candidatePool = [...firstItems]
      }
    } catch {
      candidatePool = [...firstItems]
    }
  }

  // 4. 当总页数 >= 3 时，再随机抽选另一页混编，呈现多风格碰撞
  if (totalPages >= 3) {
    const pageB = (pageA + 1 + Math.floor(Math.random() * (totalPages - 1))) % totalPages
    if (pageB !== pageA) {
      try {
        const resB = pageB === 0 ? initialRes : await fetchPageFn(categoryId, pageB)
        if (resB?.ok && Array.isArray(resB.body?.items)) {
          candidatePool.push(...resB.body.items)
        }
      } catch {
        // 静默容错，保留现有候选池
      }
    }
  }

  // 5. 去重（依据 id）后全局 Fisher-Yates 洗牌并截取目标数量
  const seenIds = new Set()
  const uniqueItems = []
  for (const item of candidatePool) {
    const id = item?.id || JSON.stringify(item)
    if (!seenIds.has(id)) {
      seenIds.add(id)
      uniqueItems.push(item)
    }
  }

  const normalized = uniqueItems.map(normalizeFn)
  return shuffleArray(normalized).slice(0, targetCount)
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
