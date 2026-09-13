import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadTrendingPage, peekTrendingCache, TRENDING_SOURCE_STATUS } from './trending-source.js'
import { appendTrendingItems, seedFeedState } from './trending-feed.js'

/** 一批的条数；与真源窗口同宽，保证「加载一批」就是一次网络往返。 */
export const TRENDING_FEED_BATCH_SIZE = 48

/** 哨兵提前量：距容器底边还有这么多像素就开始取下一批，滚到底时数据已经就位。 */
const SENTINEL_ROOT_MARGIN = '600px 0px'

/**
 * 首屏初值：命中内存缓存就同步恢复，先闪一屏骨架反而比留着旧内容更差。
 * 缓存页 → 首屏状态的那段映射在 `seedFeedState`（纯函数，可单独断言）。
 * @param {object} filters
 */
function seedFor(filters) {
  const hit = peekTrendingCache({ filters: { ...(filters || {}), page: 1 }, page: 1 })
  return seedFeedState(hit?.page)
}

/**
 * 爆款对标无限滚动取数状态机。
 *
 * 单一职责：把「第 1 页 + 第 N 页」拼成一条连续列表，并在观察哨兵进入视口时
 * 自动取下一批。筛选条件（`revision`）一变就整体回到第 1 页——追加窗口属于
 * 某一组筛选条件，换条件后旧页不是「更多」，而是错的数据。
 *
 * 三条必须守住的约束：
 * 1. **绝不空转**：`loadingRef` + `hasMore` 双闸门，一次只允许一个在途请求；
 *    某一批没带来任何新卡片（上游忽略翻页 / 库已到底）时 `hasMore` 就地转为假；
 * 2. **绝不写入过期页**：`epochRef` 记录代次，筛选切换后回来的响应一律丢弃；
 * 3. **绝不重复卡片**：跨页去重交给 `appendTrendingItems`，同一支片只出现一次。
 *
 * @param {{
 *   revision: string,
 *   filters: object,
 *   observeRef?: { current: Element | null },
 * }} opts
 * @returns {{
 *   items: Array<object>,
 *   status: string,
 *   loading: boolean,
 *   loadingMore: boolean,
 *   hasMore: boolean,
 *   loadMore: () => void,
 * }}
 */
export function useTrendingFeed({ revision, filters, observeRef }) {
  const [render, setRender] = useState(() => seedFor(filters))

  // 在途标记、代次、取消句柄都放 ref：它们要被滚动回调同步读到，进 state 只会滞后一帧。
  const loadingRef = useRef(false)
  const epochRef = useRef(0)
  const controllerRef = useRef(null)

  // filters 每次渲染都是新的对象字面量，直接进依赖会无限重取；
  // revision 是它的稳定指纹，由调用方拼出。
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const load = useCallback(async (page, { append }) => {
    if (loadingRef.current) return
    loadingRef.current = true

    const epoch = epochRef.current
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    controllerRef.current = controller

    // 回第 1 页时同样先吃缓存：换筛选/切回来不该白屏一屏
    setRender((prev) => (append
      ? { ...prev, loadingMore: true }
      : seedFor(filtersRef.current)))

    let result = null
    try {
      result = await loadTrendingPage({
        filters: { ...filtersRef.current, page },
        page,
        signal: controller?.signal,
      })
    } catch {
      // loadTrendingPage 已把网络异常收敛成 unavailable，这里只兜住意外抛错
      result = null
    } finally {
      loadingRef.current = false
      if (controllerRef.current === controller) controllerRef.current = null
    }

    // 筛选条件在途中变了：这批数据属于上一组条件，丢弃
    if (epoch !== epochRef.current) return

    if (!result || result.reason === 'aborted') {
      setRender((prev) => (append
        ? { ...prev, loadingMore: false }
        : { ...prev, loading: false, loadingMore: false, status: TRENDING_SOURCE_STATUS.unavailable }))
      return
    }

    setRender((prev) => {
      if (!append) {
        return {
          items: result.items,
          status: result.status,
          loading: false,
          loadingMore: false,
          hasMore: Boolean(result.hasMore),
          page,
        }
      }

      const merged = appendTrendingItems(prev.items, result.items)
      // 收口判据同时看两边：
      // - `result.hasMore` 为假 → 上游这一页没拉满，后面已经没有了；
      // - 这一批一张新卡片都没带来（整页都是旧数据）→ 再向上游要也是同一批。
      // 只看前者，遇到「忽略 page 参数、每次都回同一批」的上游就会无限空转；
      // 只看后者，遇到「回满一窗但确实到底」的上游又会多发一次无用请求。
      const gained = merged.length > prev.items.length
      return {
        items: merged,
        status: result.status,
        loading: false,
        loadingMore: false,
        hasMore: gained && Boolean(result.hasMore),
        page,
      }
    })
  }, [])

  // 筛选条件变更：整体回到第 1 页（含取消在途的追加请求）
  useEffect(() => {
    epochRef.current += 1
    loadingRef.current = false
    controllerRef.current?.abort?.()
    controllerRef.current = null
    load(1, { append: false })
    // 卸载时收口在途请求。句柄必须在这里捕获：
    // 请求落地后 finally 会把 controllerRef 清成 null，届时再读就 abort 不到了。
    return () => {
      controllerRef.current?.abort?.()
    }
  }, [revision, load])

  // renderRef 让 loadMore 读到最新一批的页码与 hasMore，而不必把它塞进 useCallback 依赖
  const renderRef = useRef(render)
  renderRef.current = render

  const loadMore = useCallback(() => {
    const snapshot = renderRef.current
    if (loadingRef.current || snapshot.loading || !snapshot.hasMore) return
    load(snapshot.page + 1, { append: true })
  }, [load])

  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  // 哨兵重新挂上观察器：每追加一批、每换一组筛选，哨兵位置都变了，必须重看一次
  useEffect(() => {
    if (render.loading || !render.hasMore) return undefined
    const observer = createSentinelObserver(observeRef?.current, () => loadMoreRef.current())
    if (!observer) return undefined
    return () => observer.disconnect()
  }, [render.loading, render.hasMore, render.items.length, render.page, observeRef])

  return useMemo(() => ({
    items: render.items,
    status: render.status,
    loading: render.loading,
    loadingMore: render.loadingMore,
    hasMore: render.hasMore,
    loadMore,
  }), [render, loadMore])
}

/**
 * 哨兵观察器。环境没有 IntersectionObserver 时返回 null，
 * 由调用方降级（列表仍停在已加载的那一批，不会白屏）。
 * @param {Element | null | undefined} element
 * @param {() => void} onEnter
 * @returns {IntersectionObserver | null}
 */
function createSentinelObserver(element, onEnter) {
  if (!element) return null
  if (typeof IntersectionObserver !== 'function') return null
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) onEnter()
  }, { rootMargin: SENTINEL_ROOT_MARGIN })
  observer.observe(element)
  return observer
}
