/**
 * The cloud assets feed: category + sub-category selection, the 角色 dimension
 * filters, page loading, catalog search, and audio audition.
 *
 * Pages are fetched lazily and appended, so switching category — or narrowing a
 * 角色 filter — costs one request (24 rows) rather than the whole scope. A
 * viewport sentinel asks for the next page; a failed page reports an error and
 * leaves the loaded rows intact.
 *
 * A 角色 filter selection is not applied to the rows client-side either. It is
 * answered by the Host's filter route over the catalog index, which returns the
 * same page envelope a shard does, so filtering and paging stay one request per
 * page and the chip counts stay the catalog's own numbers. A search carries the
 * same selection, so the search box narrows what the chips already narrowed
 * rather than widening it back to the whole category.
 *
 * Copying a cloud row into the local library is not part of this feed: the only
 * route out of a card is into the conversation, and the preview modal owns the
 * one remaining save control through its own controller (see `AssetsStage`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloudFilter, cloudMediaUrl, cloudPage, cloudSearch } from './api.js'
import { LruCache } from './lru-cache.js'
import {
  CHARACTER_CATEGORY,
  activeDimensionCount,
  characterDimensionsOf,
  characterFilterTokens,
  emptyCharacterFilters,
  pageTotalPages,
} from './character-dimensions.js'
import {
  CLOUD_ALL_CATEGORY,
  CLOUD_PAGE_SIZE,
  allCategoryEntry,
  appendUniqueAssets,
  isOfficialVoicePreviewAsset,
  isOfficialVoicePreviewPlayable,
  normalizeCloudAsset,
  pageCountOf,
  subCategoryTabs,
  voicePreviewCandidateUrls,
} from './cloud-feed-helpers.js'
import { errText, messageOf } from './feed-helpers.js'
import { useCloudManifest } from './use-cloud-manifest.js'
import { CLOUD_NOTICE_MS } from './use-cloud-save.js'
import { globalShuffleCache } from './category-shuffle-cache.js'

/** Debounce before a keystroke turns into a catalog-wide search request. */
export const CLOUD_SEARCH_DEBOUNCE_MS = 280

/**
 * Normalize a page envelope into rows. A page file is trusted to match the
 * builder's contract, but a truncated or hand-edited file must not throw.
 * @param {any} body
 */
function rowsOf(body) {
  return Array.isArray(body?.items) ? body.items.map(normalizeCloudAsset) : []
}

/**
 * Keep exactly one audition playing at a time across the whole feed.
 * The element is owned here rather than by a card, so a card unmounting (paging,
 * category switch) always stops its audio instead of leaking a hidden player.
 *
 * Issue #3058: an official voice preview row plays its hub DTO candidates in
 * order (primary first, never retrying the same URL); every candidate settles
 * once — an error event and the play() rejection for the same candidate do not
 * double-advance — and a request token drops callbacks from superseded requests.
 * Every attempt owns a fresh Audio element with its own closed-over attempt
 * index: an error event carries no URL identity, so a late mediaerror on a
 * superseded element — or a deferred play() rejection from an old attempt —
 * is short-circuited by the attempt token and can never be attributed to the
 * candidate that just took over (Sol 规格轴 HIGH #1/#2). Stopping, switching
 * assets or unmounting pauses every attempt element of the current request,
 * not only the latest. Only verified rows reach candidates at all: the hook
 * is the playback seam, so an unverified official row is refused here (no
 * element, no fetch), not merely hidden in the card. A NotAllowedError
 * rejection means autoplay was refused, not a missing file, so it never
 * rotates candidates and never shows the file-failure notice: it pauses and
 * rewinds its element, returns to idle, and suppresses the hover loop's
 * automatic restarts until the next explicit action (exhausted candidates
 * still surface the approved notice exactly once, then suppress auto-retries
 * the same way). Ordinary assets keep the single cloudMediaUrl play.
 * @param {{ t?: (key: string) => string }} [options]
 */
export function useCloudAudition(options = {}) {
  const { t } = options
  const audioRef = useRef(/** @type {HTMLAudioElement | null} */ (null))
  const requestTokenRef = useRef(0)
  /** 当前在途请求的清理函数：stop/切换/unmount 时暂停该请求所有 attempt。 */
  const stopAttemptsRef = useRef(() => {})
  const [playingId, setPlayingId] = useState('')
  const [notice, setNotice] = useState('')
  /**
   * Assets whose last audition was refused (autoplay denial) or failed (all
   * candidates exhausted). The hover side-effect calls `toggle` again while the
   * pointer stays over the card; suppressed rows keep those implicit calls
   * ignored so one denial cannot loop playback attempts and notices. Only an
   * explicit action (`explicit === true`) or a state cleanup re-arms them.
   */
  const [suppressedIds, setSuppressedIds] = useState(() => new Set())
  const markSuppressed = useCallback((id) => {
    setSuppressedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const clearSuppressed = useCallback((id) => {
    setSuppressedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  /** 使在途请求回调全部作废并暂停其所有 attempt element。 */
  const stopActiveRequest = useCallback(() => {
    requestTokenRef.current += 1
    stopAttemptsRef.current()
    stopAttemptsRef.current = () => {}
    audioRef.current = null
  }, [])

  const stop = useCallback(() => {
    stopActiveRequest()
    setPlayingId('')
    // Stopping is the next explicit action: auto-start may resume afterwards.
    setSuppressedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [stopActiveRequest])

  const toggle = useCallback((asset, explicit = false) => {
    const id = asset?.id ?? ''
    if (id === '') return
    if (explicit) clearSuppressed(id)
    else if (suppressedIds.has(id)) return
    if (playingId === id && audioRef.current) {
      stopActiveRequest()
      setPlayingId('')
      setSuppressedIds((prev) => (prev.size === 0 ? prev : new Set()))
      return
    }
    stopActiveRequest()
    // A fresh audition supersedes the previous failure notice.
    setNotice('')

    // 官方试听走 hub DTO 候选；普通资产走既有 media 路由单 URL。
    // 资格门放在 seam 本身（OCR #8）：未验证官方行在此 fail-closed，
    // 连 Audio 实例都不构造——卡片藏播放键只是 UI 一层，挡不住别的调用方。
    const isOfficialVoice = isOfficialVoicePreviewAsset(asset)
    const candidateUrls = isOfficialVoice
      ? (isOfficialVoicePreviewPlayable(asset) ? voicePreviewCandidateUrls(asset) : [])
      : [cloudMediaUrl(id, 'media')]
    if (candidateUrls.length === 0) return

    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    /** 本请求创建的全部 attempt element：stop/切换/unmount 时逐一暂停清理。 */
    const attemptElements = new Set()
    /** 本请求内已结算失败的候选下标：error 事件与 play() 拒绝同候选只推一次 */
    const settledCandidates = new Set()
    /** 最新发起（仍在结算中）的候选下标 */
    let armedAttempt = -1

    const isCurrentRequest = () => requestToken === requestTokenRef.current
    /**
     * 回调仍归属当前有效 attempt 的判据：旧 attempt（或旧请求）迟到的
     * error/rejection 先经此短路，绝不结算或清理新 attempt。
     */
    const isCurrentAttempt = (attemptIndex) =>
      isCurrentRequest() && attemptIndex === armedAttempt && !settledCandidates.has(attemptIndex)

    /**
     * 停止并清理本请求所有 attempt element（含已回退的旧 element）：
     * 旧 element 可能仍持有挂起 promise/延迟 error，不能留在后台发声。
     */
    const stopRequest = () => {
      for (const audio of attemptElements) {
        audio.pause()
        audio.currentTime = 0
        audio.removeEventListener('ended', audio.__endedHandler)
        audio.removeEventListener('error', audio.__errorHandler)
        audio.src = ''
      }
      attemptElements.clear()
    }
    stopAttemptsRef.current = stopRequest

    /**
     * OCR round2 F3：请求终态（自然 ended / 候选穷尽）释放整请求资源，
     * 不止暂停最新 element——否则没有后续 stop/切换/unmount 时
     * attemptElements 集、监听与 stopRequest 闭包被无限期持有。
     * 先校验 ownership 再 token+1：迟到回调自此被 isCurrentRequest 短路，
     * 新请求也不再被这个已终态请求的清理路径误伤；stopAttemptsRef 复位
     * 后后续 stop() 对它是无害空转。notice/suppression 语义由各终态调用方
     * 保留（仅官方分支），本函数只管资源释放。
     */
    const releaseRequest = () => {
      if (!isCurrentRequest()) return
      requestTokenRef.current += 1
      stopRequest()
      if (stopAttemptsRef.current === stopRequest) stopAttemptsRef.current = () => {}
      audioRef.current = null
    }

    /**
     * 候选穷尽：提示一次核定文案并把本资产列入悬停自动重试抑制。
     * 没有这一步，playingId 清空会让 hover 副作用立刻重播并重复提示。
     * OCR closure F4：提示与抑制仅官方试听分支——普通素材的单地址候选也
     * 走到这里，但它保持旧静默停止语义，不出文案、不入抑制。
     */
    const reportFailure = () => {
      if (!isCurrentRequest()) return
      // F3：穷尽即终态——释放本请求全部 attempt element 并失效清理 ref。
      releaseRequest()
      setPlayingId('')
      if (isOfficialVoice) {
        if (typeof t === 'function') setNotice(t('cloud.preview.failed'))
        markSuppressed(id)
      }
    }

    /**
     * 自动播放权限拒绝 ≠ 文件不可用：不轮换候选、不出失败文案。
     * 当前 attempt 的权限失败先 pause/归零清理自己的 element 再回空闲，
     * 不留仍在播放的孤儿 element；抑制悬停自动重启直到下一次显式动作——
     * 同 F4 仅官方试听分支执行，普通素材不武装抑制。
     * 调用方必须先经 isCurrentAttempt 判定——旧 attempt 的迟到拒绝到不了这里。
     */
    const reportAutoplayDenied = () => {
      if (!isCurrentRequest()) return
      // OCR last-rereview M3：权限拒绝同样是请求终态——走 releaseRequest 全
      // 请求释放（pause/归零/摘监听/清 src/解除 stopRequest 闭包），不留仍
      // 加载中的孤儿 element；否则除非后续 stop/切换/unmount，本请求的
      // attempt 集合与监听被无限期持有。抑制与无文案语义仍仅限官方分支。
      releaseRequest()
      setPlayingId('')
      if (isOfficialVoice) markSuppressed(id)
    }

    const tryNextOrReportError = () => {
      if (!isCurrentRequest()) return
      const nextIndex = armedAttempt + 1
      if (nextIndex < candidateUrls.length) {
        attemptPlay(nextIndex)
        return
      }
      reportFailure()
    }

    const candidateFailed = (index) => {
      if (!isCurrentAttempt(index)) return
      settledCandidates.add(index)
      tryNextOrReportError()
    }

    /**
     * 每次 attempt 使用独立原生 Audio element 并闭包自己的下标：
     * error 事件不携带 URL 身份，复用同一 element 换 src 时旧候选的迟到
     * error 会被误算到新候选（Sol 规格轴 HIGH #1）；独立 element 让
     * error 天然只能来自自己加载的那次 attempt，加上 attempt 令牌双重短路。
     */
    const attemptPlay = (attemptIndex) => {
      const element = new Audio()
      element.preload = 'auto'
      element.src = candidateUrls[attemptIndex]
      attemptElements.add(element)
      armedAttempt = attemptIndex
      audioRef.current = element
      element.__endedHandler = () => {
        if (!isCurrentAttempt(attemptIndex)) return
        settledCandidates.add(attemptIndex)
        // F3：自然播完即终态——整请求释放（全部 attempt、监听、src）。
        releaseRequest()
        setPlayingId('')
      }
      element.__errorHandler = () => {
        candidateFailed(attemptIndex)
      }
      element.addEventListener('ended', element.__endedHandler)
      element.addEventListener('error', element.__errorHandler)
      void element.play().catch((error) => {
        if (!isCurrentAttempt(attemptIndex)) return
        if (error?.name === 'NotAllowedError') {
          settledCandidates.add(attemptIndex)
          reportAutoplayDenied()
          return
        }
        candidateFailed(attemptIndex)
      })
    }

    setPlayingId(id)
    attemptPlay(0)
  }, [playingId, suppressedIds, t, clearSuppressed, markSuppressed, stopActiveRequest])

  useEffect(() => () => {
    stopActiveRequest()
    setSuppressedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [stopActiveRequest])

  // Same lifetime as the save notice: the failure line clears itself.
  useEffect(() => {
    if (notice === '') return undefined
    const timer = setTimeout(() => { setNotice('') }, CLOUD_NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  return { playingId, notice, suppressedIds, toggle, stop }
}

/**
 * 分页结果缓存：键＝「分类/二级分类 + 筛选条件 + 页码」。
 *
 * 一次会话里来回切分类、来回翻页都不该重复请求同一片；上限 240 条足够覆盖常用的
 * 十几个分类 × 若干页，超出按最久未用淘汰，避免无限增长。
 */
const pageCache = new LruCache(240)

/**
 * @param {{
 *   t: (key: string) => string,
 *   open: boolean,
 *   defaultCategory?: string,
 * }} options
 */
export function useCloudAssetsFeed(options) {
  const { t, open, defaultCategory = CLOUD_ALL_CATEGORY } = options
  const externalQuery = options?.query
  const pageSize = options?.pageSize
  const batchSize = typeof pageSize === 'number' && pageSize > 0 ? pageSize : CLOUD_PAGE_SIZE
  const { manifest, loading: manifestLoading, error: manifestError, reload: reloadManifest } = useCloudManifest({ enabled: open })

  // 全部 leads the nav and spans the whole catalog; it is synthesized here rather
  // than catalogued, so the manifest keeps describing only real categories while
  // the tab still opens on everything. Until the manifest lands there is no total
  // to show, so the nav stays empty instead of flashing a chip with 0.
  const categories = useMemo(() => {
    if (manifest === null) return []
    const listed = Array.isArray(manifest.categories) ? manifest.categories : []
    return [allCategoryEntry(manifest, t), ...listed]
  }, [manifest, t])

  const [category, setCategory] = useState(defaultCategory)
  const [subCategory, setSubCategory] = useState('')
  const [filters, setFilters] = useState(emptyCharacterFilters)
  const [items, setItems] = useState(/** @type {any[]} */ ([]))
  const [loadedPages, setLoadedPages] = useState(0)
  const [scopedPages, setScopedPages] = useState(/** @type {number | null} */ (null))
  const [pageError, setPageError] = useState('')
  const [loadingPage, setLoadingPage] = useState(false)
  const [query, setQuery] = useState(typeof externalQuery === 'string' ? externalQuery : '')
  const [queryApplied, setQueryApplied] = useState('')
  const [searchResult, setSearchResult] = useState(/** @type {any} */ (null))
  const [searching, setSearching] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (typeof externalQuery === 'string') {
      setQuery(externalQuery)
    }
  }, [externalQuery])

  const audition = useCloudAudition({ t })
  const { stop: stopAudition } = audition
  const requestRef = useRef(0)

  // The first category is only knowable once the manifest lands, so adopt it
  // when the requested default is absent from the catalog.
  useEffect(() => {
    if (manifest === null || categories.length === 0) return
    if (categories.some((row) => row.id === category)) return
    setCategory(categories[0].id)
    setSubCategory('')
  }, [manifest, categories, category])

  // The second level is a property of the data, not of one tab: every category
  // whose manifest entry carries populated sub-categories gets one, always led
  // by 全部. 全部 itself, which spans every category and owns no shelf, stays
  // single-level.
  const tabs = useMemo(() => subCategoryTabs(manifest, category), [manifest, category])
  const hasSecondLevel = tabs.hasSecondLevel

  // 角色 swaps that second level for the eight-dimension filter bar. The
  // dimensions are read from the manifest, so a catalog built before the bar
  // existed simply has none and the tab keeps its sub-category row.
  const dimensions = useMemo(() => characterDimensionsOf(manifest, category), [manifest, category])
  const activeDimensions = activeDimensionCount(filters)
  // The one derivation the rest reads: an array of wire tokens, whose identity
  // changes exactly when the selection does. `loadPage` depends on it, and the
  // scope effect below fires on `loadPage`, so a value that changed identity on
  // every render would refetch the tab on any unrelated re-render.
  const filterTokens = useMemo(() => characterFilterTokens(filters), [filters])
  const filtering = dimensions.length > 0 && filterTokens.length > 0
  const characterFilters = useMemo(
    () => ({
      dimensions,
      filters,
      active: activeDimensions,
      key: filterTokens.join(','),
      enabled: dimensions.length > 0,
    }),
    [dimensions, filters, activeDimensions, filterTokens],
  )

  // A category switch invalidates the sub-category selection unless that
  // sub-category exists in the new category.
  useEffect(() => {
    if (subCategory === '') return
    if (tabs.items.some((row) => row.id === subCategory)) return
    setSubCategory('')
  }, [tabs, subCategory])

  const pages = pageCountOf(manifest, category, subCategory)

  /**
   * Load one page and append it. `reset` restarts the list for a new scope.
   *
   * A dimension selection has no catalog directory of its own, so it is fetched
   * from the Host's filter route; everything else pages a shard. Both answer with
   * the same envelope, which is what lets the caller below not care which one it
   * got.
   * @param {number} page
   * @param {{ reset?: boolean }} [opts]
   */
  const loadPage = useCallback(async (page, opts = {}) => {
    const reset = opts.reset === true
    const scope = subCategory === '' ? category : `${category}/${subCategory}`
    const token = requestRef.current + 1
    requestRef.current = token
    setLoadingPage(true)
    try {
      // 命中分页缓存就直接用，来回切分类不会二次请求；键含筛选条件，不同
      // 筛选组合不会互相污染。错误结果不入缓存（见下方各失败分支）。
      const cacheKey = LruCache.keyOf(scope, filtering ? filterTokens : '', page, batchSize)
      const cached = pageCache.get(cacheKey)
      const result = cached ?? (filtering
        ? await cloudFilter({ tokens: filterTokens, limit: batchSize, offset: page * batchSize })
        : await cloudPage(scope, page))
      if (cached === undefined && result.ok === true) pageCache.set(cacheKey, result)
      if (requestRef.current !== token) return
      if (!result.ok) {
        // A missing page file is a valid end-of-list signal for a scope whose
        // real row count is lower than the manifest advertises.
        if (result.status === 404) {
          setPageError('')
          setScopedPages(0)
          setLoadedPages(page)
          return
        }
        setPageError(messageOf(result, t))
        return
      }
      setPageError('')
      const rows = rowsOf(result.body)
      // A filtered view has no manifest entry, so its page count is only
      // knowable from the envelope the Host just served.
      setScopedPages(filtering ? pageTotalPages(result.body) : null)
      setItems((prev) => (reset ? rows : appendUniqueAssets(prev, rows)))
      setLoadedPages(page + 1)
    } catch (caught) {
      if (requestRef.current !== token) return
      setPageError(errText(caught))
    } finally {
      if (requestRef.current === token) setLoadingPage(false)
    }
  }, [category, subCategory, filtering, filterTokens, t, batchSize])

  // Scope change — a category, a sub-category or a dimension combination: stop
  // any audition, drop the old rows, and fetch page 0 of the new scope.
  useEffect(() => {
    if (!open || manifest === null) return
    stopAudition()
    setItems([])
    setLoadedPages(0)
    setScopedPages(null)
    setPageError('')
    void loadPage(0, { reset: true })
    // `loadPage` already depends on category/subCategory/filterTokens, so those
    // are the real triggers; listing them separately would double-fetch.
  }, [open, manifest, loadPage, stopAudition])

  // Debounced search. A blank query returns to paged browsing instead of
  // issuing a request.
  useEffect(() => {
    if (!open) return undefined
    const trimmed = query.trim()
    if (trimmed === '') {
      setQueryApplied('')
      setSearchResult(null)
      setSearching(false)
      return undefined
    }
    const timer = setTimeout(() => { setQueryApplied(trimmed) }, CLOUD_SEARCH_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [query, open])

  useEffect(() => {
    if (!open || queryApplied === '' || manifest === null) return undefined
    let cancelled = false
    setSearching(true)
    void (async () => {
      try {
        const result = await cloudSearch({
          q: queryApplied,
          category,
          subCategory,
          // The chips narrow the search too: without this, searching a male name
          // after picking 女性 answered with male rows, because the request
          // carried the needle and the category but not the selection.
          dims: filterTokens,
          limit: batchSize,
          offset: 0,
        })
        if (cancelled) return
        if (!result.ok) {
          setPageError(messageOf(result, t))
          setSearchResult({ total: 0, items: [] })
          return
        }
        setPageError('')
        setSearchResult({
          total: Number(result.body?.total) || 0,
          items: rowsOf(result.body),
        })
      } catch (caught) {
        if (!cancelled) setPageError(errText(caught))
      } finally {
        if (!cancelled) setSearching(false)
      }
    })()
    return () => { cancelled = true }
  }, [queryApplied, open, category, subCategory, filterTokens, manifest, t])

  const visible = searchResult ? searchResult.items : items
  // A filtered scope reports its page count in the page envelope, and a page is
  // only known to exist once one has been fetched. `null` is therefore "not yet
  // known" rather than "empty", which is what makes the sentinel ask for page 0
  // of a combination no manifest entry describes.
  const scopePages = filtering ? (scopedPages ?? 1) : pages
  const hasMore = searchResult
    ? searchResult.items.length < searchResult.total
    : loadedPages < scopePages

  const loadMore = useCallback(() => {
    if (loadingPage || !hasMore) return
    if (searchResult) {
      void (async () => {
        setSearching(true)
        try {
          const result = await cloudSearch({
            q: queryApplied,
            category,
            subCategory,
            // A second search page carries the same selection as the first, or
            // the appended rows would come from a wider scope than page one.
            dims: filterTokens,
            limit: batchSize,
            offset: searchResult.items.length,
          })
          if (!result.ok) return
          setSearchResult((prev) => {
            if (!prev) return prev
            const next = rowsOf(result.body)
            return { total: Number(result.body?.total) || prev.total, items: appendUniqueAssets(prev.items, next) }
          })
        } catch {
          // A failed "load more" is silent: the rows already on screen stay and
          // the user can retry by scrolling again.
        } finally {
          setSearching(false)
        }
      })()
      return
    }
    void loadPage(loadedPages)
  }, [loadingPage, hasMore, searchResult, queryApplied, category, subCategory, filterTokens, loadedPages, loadPage])

  const selectCategory = useCallback((next) => {
    setCategory(next)
    // Every category opens on 全部, never on another category's last filter, and
    // the dimension chips carry no selection across a tab switch either.
    setSubCategory('')
    setFilters(emptyCharacterFilters())
    setQuery('')
    setQueryApplied('')
    setSearchResult(null)
  }, [])

  const selectSubCategory = useCallback((next) => {
    setSubCategory(next)
  }, [])

  /**
   * Narrow one dimension, or clear it by passing its own current value or `''`.
   * The value is the catalog's label (`Car`, `Middle-aged`), which is what the
   * scope key is built from.
   * @param {string} dimensionId
   * @param {string} value
   */
  const selectDimension = useCallback((dimensionId, value) => {
    setFilters((prev) => (prev[dimensionId] === value ? prev : { ...prev, [dimensionId]: value }))
  }, [])

  /** Clear all eight dimensions at once — 重置筛选. */
  const resetDimensions = useCallback(() => {
    setFilters((prev) => (activeDimensionCount(prev) === 0 ? prev : emptyCharacterFilters()))
  }, [])

  const refresh = useCallback(async () => {
    globalShuffleCache.clear()
    setRefreshKey((k) => k + 1)
    await reloadManifest(true)
    setItems([])
    setLoadedPages(0)
    setScopedPages(null)
    await loadPage(0, { reset: true })
  }, [reloadManifest, loadPage])

  return {
    manifest,
    categories,
    category,
    subCategory,
    tabs,
    hasSecondLevel,
    /** The eight-dimension filter bar: its data, its state and its controls. */
    characterFilters,
    items: visible,
    hasMore,
    loading: manifestLoading || (loadingPage && items.length === 0),
    /** True while a page or a search slice is in flight, for the button state. */
    loadingMore: loadingPage || searching,
    error: manifestError || pageError,
    query,
    setQuery,
    selectCategory,
    selectSubCategory,
    selectDimension,
    resetDimensions,
    loadMore,
    refresh,
    refreshKey,
    audition,
  }
}
