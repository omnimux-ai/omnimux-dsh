/**
 * The cloud assets feed: category + sub-category selection, page loading,
 * catalog search, and audio audition.
 *
 * Pages are fetched lazily and appended, so switching category costs one request
 * (24 rows) rather than the whole scope. A viewport sentinel asks for the next
 * page; a failed page reports an error and leaves the loaded rows intact.
 *
 * Copying a cloud row into the local library is not part of this feed: the only
 * route out of a card is into the conversation, and the preview modal owns the
 * one remaining save control through its own controller (see `AssetsStage`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloudMediaUrl, cloudPage, cloudSearch } from './api.js'
import {
  CLOUD_PAGE_SIZE,
  appendUniqueAssets,
  normalizeCloudAsset,
  pageCountOf,
  subCategoryTabs,
} from './cloud-feed-helpers.js'
import { errText, messageOf } from './feed-helpers.js'
import { useCloudManifest } from './use-cloud-manifest.js'

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
 */
export function useCloudAudition() {
  const audioRef = useRef(/** @type {HTMLAudioElement | null} */ (null))
  const [playingId, setPlayingId] = useState('')

  const stop = useCallback(() => {
    const element = audioRef.current
    if (element) {
      element.pause()
      element.currentTime = 0
      audioRef.current = null
    }
    setPlayingId('')
  }, [])

  const toggle = useCallback((asset) => {
    const id = asset?.id ?? ''
    if (id === '') return
    const current = audioRef.current
    if (playingId === id && current) {
      current.pause()
      current.currentTime = 0
      audioRef.current = null
      setPlayingId('')
      return
    }
    if (current) {
      current.pause()
      current.currentTime = 0
      audioRef.current = null
    }
    const element = new Audio(cloudMediaUrl(id, 'media'))
    element.preload = 'auto'
    element.addEventListener('ended', () => {
      // Only clear when this element is still the active one: a later audition
      // may already have replaced it.
      if (audioRef.current === element) {
        audioRef.current = null
        setPlayingId('')
      }
    })
    element.addEventListener('error', () => {
      if (audioRef.current === element) {
        audioRef.current = null
        setPlayingId('')
      }
    })
    audioRef.current = element
    setPlayingId(id)
    void element.play().catch(() => {
      if (audioRef.current === element) {
        audioRef.current = null
        setPlayingId('')
      }
    })
  }, [playingId])

  useEffect(() => () => {
    const element = audioRef.current
    if (element) {
      element.pause()
      audioRef.current = null
    }
  }, [])

  return { playingId, toggle, stop }
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   open: boolean,
 *   defaultCategory?: string,
 * }} options
 */
export function useCloudAssetsFeed(options) {
  const { t, open, defaultCategory = 'knowledge' } = options
  const { manifest, loading: manifestLoading, error: manifestError, reload: reloadManifest } = useCloudManifest({ enabled: open })

  const categories = useMemo(() => {
    return Array.isArray(manifest?.categories) ? manifest.categories : []
  }, [manifest])

  const [category, setCategory] = useState(defaultCategory)
  const [subCategory, setSubCategory] = useState('')
  const [items, setItems] = useState(/** @type {any[]} */ ([]))
  const [loadedPages, setLoadedPages] = useState(0)
  const [pageError, setPageError] = useState('')
  const [loadingPage, setLoadingPage] = useState(false)
  const [query, setQuery] = useState('')
  const [queryApplied, setQueryApplied] = useState('')
  const [searchResult, setSearchResult] = useState(/** @type {any} */ (null))
  const [searching, setSearching] = useState(false)

  const audition = useCloudAudition()
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
  // by 全部. 场景 and the deliberately empty 道具 therefore stay single-level.
  const tabs = useMemo(() => subCategoryTabs(manifest, category), [manifest, category])
  const hasSecondLevel = tabs.hasSecondLevel

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
      const result = await cloudPage(scope, page)
      if (requestRef.current !== token) return
      if (!result.ok) {
        // A missing page file is a valid end-of-list signal for a scope whose
        // real row count is lower than the manifest advertises.
        if (result.status === 404) {
          setPageError('')
          setLoadedPages(page)
          return
        }
        setPageError(messageOf(result, t))
        return
      }
      setPageError('')
      const rows = rowsOf(result.body)
      setItems((prev) => (reset ? rows : appendUniqueAssets(prev, rows)))
      setLoadedPages(page + 1)
    } catch (caught) {
      if (requestRef.current !== token) return
      setPageError(errText(caught))
    } finally {
      if (requestRef.current === token) setLoadingPage(false)
    }
  }, [category, subCategory, t])

  // Scope change: stop any audition, drop the old rows, and fetch page 0.
  useEffect(() => {
    if (!open || manifest === null) return
    stopAudition()
    setItems([])
    setLoadedPages(0)
    setPageError('')
    void loadPage(0, { reset: true })
    // `loadPage` already depends on category/subCategory, so those are the
    // real triggers; listing them separately would double-fetch.
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
          limit: CLOUD_PAGE_SIZE,
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
  }, [queryApplied, open, category, subCategory, manifest, t])

  const visible = searchResult ? searchResult.items : items
  const hasMore = searchResult
    ? searchResult.items.length < searchResult.total
    : loadedPages < pages

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
            limit: CLOUD_PAGE_SIZE,
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
  }, [loadingPage, hasMore, searchResult, queryApplied, category, subCategory, loadedPages, loadPage])

  const selectCategory = useCallback((next) => {
    setCategory(next)
    // Every category opens on 全部, never on another category's last filter.
    setSubCategory('')
    setQuery('')
    setQueryApplied('')
    setSearchResult(null)
  }, [])

  const selectSubCategory = useCallback((next) => {
    setSubCategory(next)
  }, [])

  const refresh = useCallback(async () => {
    await reloadManifest(true)
    setItems([])
    setLoadedPages(0)
    await loadPage(0, { reset: true })
  }, [reloadManifest, loadPage])

  return {
    manifest,
    categories,
    category,
    subCategory,
    tabs,
    hasSecondLevel,
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
    loadMore,
    refresh,
    audition,
  }
}
