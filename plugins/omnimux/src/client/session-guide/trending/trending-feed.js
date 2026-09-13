/**
 * 爆款对标「无限滚动追加」的纯派生层：卡片行的去重键与追加合并。
 *
 * 放在这里而不是组件里，是为了让追加语义能被 node:test 直接断言——
 * 不会因为少写一个 `useMemo` 就把重复卡片渲进网格。
 *
 * 去重口径与真源（`trending-source.js`）保持一致，但作用对象不同：
 * 真源去重的是**灵感库原始行**（字段是 `country_code` / `stats.views`），
 * 这里去重的是**已映射的卡片行**（字段是 `region` / `views`）。
 * 两处不能互相 import 键名，否则改一边就会静默失效。
 */

/** 标题参与去重的最短长度：太短的标题（"Untitled"、"Ai"）重合概率高，不能当同一视频。 */
const FINGERPRINT_MIN_TITLE_LENGTH = 5

/**
 * 卡片行的内容指纹集合。空集合表示「没有任何可识别的身份」——
 * 这类行永远视作非重复，宁可多显示一张，也不误删一条真实数据。
 * @param {object | null | undefined} item
 * @returns {string[]}
 */
export function getTrendingItemKeys(item) {
  if (!item || typeof item !== 'object') return []
  const keys = []

  const id = String(item.id || '').trim()
  if (id) keys.push(`id:${id}`)

  const sourceUrl = String(item.sourceUrl || '').trim()
  if (sourceUrl) keys.push(`url:${sourceUrl}`)

  // 标题 + 播放量：同一支片的换皮镜像往往换 id 不换标题与量级
  const title = String(item.title || '').trim().toLowerCase()
  const views = Number(item.views)
  if (title.length >= FINGERPRINT_MIN_TITLE_LENGTH && Number.isFinite(views) && views > 0) {
    keys.push(`tv:${title}:${views}`)
  }

  return keys
}

/**
 * 把新一页追加到已有列表尾部，剔除与已有条目内容重复的行。
 *
 * 同一批内部的重复同样要剔除（两个源回同一条是常态），因此已知键集会随遍历增长。
 * 返回原数组引用（当没有任何新条目时），让 React 可以跳过无意义的重渲染。
 *
 * @param {Array<object>} [existing]
 * @param {Array<object>} [incoming]
 * @returns {Array<object>}
 */
export function appendTrendingItems(existing, incoming) {
  const current = Array.isArray(existing) ? existing : []
  const incomingList = Array.isArray(incoming) ? incoming : []
  if (incomingList.length === 0) return current

  const seen = new Set()
  for (const item of current) {
    for (const key of getTrendingItemKeys(item)) seen.add(key)
  }

  const appended = []
  for (const item of incomingList) {
    if (!item || typeof item !== 'object') continue
    const keys = getTrendingItemKeys(item)
    if (keys.some((key) => seen.has(key))) continue
    for (const key of keys) seen.add(key)
    appended.push(item)
  }

  return appended.length === 0 ? current : [...current, ...appended]
}

/** 首屏空白态：还没拿到任何数据时的渲染初值（骨架屏 + 尚不知是否有下一页）。 */
export function emptyFeedState() {
  return { items: [], status: 'loading', loading: true, loadingMore: false, hasMore: true, page: 1 }
}

/**
 * 首屏初值：命中内存缓存就同步恢复，先闪一屏骨架反而比留着旧内容更差。
 *
 * 取值器由调用方注入（`peekTrendingCache`），这样「缓存页 → 首屏状态」这段映射
 * 是纯函数，可以被直接断言，而不必依赖真源模块的单例。
 *
 * 缓存一律按「手头这批数据」呈现，是否过期只影响要不要在后台重取：
 * 过期数据会被随后到达的新页整体替换，而不是先清空再填。
 *
 * @param {{ items?: Array<object>, status?: string, hasMore?: boolean } | null | undefined} cachedPage
 * @returns {{ items: Array<object>, status: string, loading: boolean, loadingMore: boolean, hasMore: boolean, page: number }}
 */
export function seedFeedState(cachedPage) {
  const cachedItems = Array.isArray(cachedPage?.items) ? cachedPage.items : []
  if (cachedItems.length === 0) return emptyFeedState()

  return {
    items: cachedItems,
    // 缓存页一定带状态；万一没有，也不能回落成 'loading'——那会让「有没有工具栏」这类
    // 由状态驱动的判断看起来像还在首屏加载。按最保守的「有数据」处理。
    status: String(cachedPage.status || 'ready'),
    loading: true,
    loadingMore: false,
    // 缓存页记着自己到头没：记不得就按「还有」处理，取回结果会立刻纠正
    hasMore: cachedPage.hasMore !== false,
    page: 1,
  }
}
