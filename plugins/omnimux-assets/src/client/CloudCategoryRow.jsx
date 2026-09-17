import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { cloudPage } from './api.js'
import { normalizeCloudAsset } from './cloud-feed-helpers.js'
import { globalShuffleCache } from './category-shuffle-cache.js'
import { ChevronLeftIcon, ChevronRightIcon } from './icons.jsx'
import { CloudAssetCard } from './CloudAssetsView.jsx'

/**
 * Single horizontal category row in the cross-category "All" view.
 *
 * Each category displays a section header (title, description, and "View all ->" CTA)
 * and a single-row scrollable container of cards with randomized order per refresh
 * and session-level caching to keep order stable during navigation.
 *
 * @param {{
 *   category: { id: string, zh?: string, en?: string, total?: number },
 *   t: (key: string) => string,
 *   onSelectCategory: (categoryId: string) => void,
 *   onTogglePlay: (asset: any) => void,
 *   onPreview?: (asset: any) => void,
 *   playingId?: string,
 *   refreshKey?: number,
 * }} props
 */
export function CloudCategoryRow(props) {
  const { category, t, onSelectCategory, onTogglePlay, onPreview, playingId, refreshKey = 0 } = props
  const [items, setItems] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  // Fetch or retrieve cached shuffled items for this category
  useEffect(() => {
    let cancelled = false
    const catId = category?.id
    if (!catId) return undefined

    // Check session shuffle cache first
    const cached = globalShuffleCache.get(catId)
    if (cached !== undefined && cached.length > 0) {
      setItems(cached)
      return undefined
    }

    setLoading(true)
    void (async () => {
      try {
        const result = await cloudPage(catId, 0)
        if (cancelled) return
        if (result.ok && Array.isArray(result.body?.items)) {
          const rawRows = result.body.items.map(normalizeCloudAsset)
          // 每次刷新随机显示，同时写入全局会话缓存
          const shuffled = globalShuffleCache.getOrShuffle(catId, rawRows)
          setItems(shuffled)
        }
      } catch {
        // Silent fallback: row will simply be empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [category?.id, refreshKey])

  // Update scroll arrow indicators
  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 20)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 20)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    updateScrollButtons()
    // Check after items render and images settle
    const timer = setTimeout(updateScrollButtons, 300)
    return () => clearTimeout(timer)
  }, [items, updateScrollButtons])

  const handleScroll = (delta) => {
    const el = scrollRef.current
    if (el) {
      el.scrollBy({ left: delta, behavior: 'smooth' })
    }
  }

  const categoryTitle = t(`cloud.category.${category.id}`) || category.zh || category.id
  const categoryDesc = t(`cloud.categoryDesc.${category.id}`)

  return (
    <section className="omnimux-assets-cloud-row-section" data-category={category.id}>
      <div className="omnimux-assets-cloud-row-header">
        <div className="omnimux-assets-cloud-row-info">
          <h2
            className="omnimux-assets-cloud-row-title"
            role="button"
            tabIndex={0}
            title={categoryTitle}
            onClick={() => onSelectCategory(category.id)}
            onKeyDown={activateRowKeydown(() => onSelectCategory(category.id))}
          >
            {categoryTitle}
          </h2>
          {categoryDesc ? (
            <p className="omnimux-assets-cloud-row-desc">{categoryDesc}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="omnimux-assets-cloud-row-view-all"
          onClick={() => onSelectCategory(category.id)}
          trailingIcon={<ChevronRightIcon size={13} />}
        >
          {t('cloud.category.viewAll')}
        </Button>
      </div>

      <div className="omnimux-assets-cloud-row-wrapper">
        {canScrollLeft ? (
          <IconButton
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-row-arrow omnimux-assets-cloud-row-arrow--left"
            aria-label={t('card.scrollLeft') || '向左滚动'}
            onClick={() => handleScroll(-500)}
          >
            <ChevronLeftIcon size={16} />
          </IconButton>
        ) : null}

        <div
          ref={scrollRef}
          className="omnimux-assets-cloud-row-cards"
          onScroll={updateScrollButtons}
        >
          {loading && items.length === 0 ? (
            Array.from({ length: 6 }, (_, index) => (
              <div
                key={`skeleton-${index}`}
                className="omnimux-assets-card omnimux-assets-cloud-card omnimux-assets-cloud-skeleton omnimux-assets-cloud-row-skeleton"
              >
                <div className="omnimux-assets-cloud-skeleton-thumb" />
                <div className="omnimux-assets-cloud-skeleton-line" />
              </div>
            ))
          ) : (
            items.map((asset) => (
              <CloudAssetCard
                key={asset.id}
                asset={asset}
                t={t}
                aspect={category.id === 'style' ? 'horizontal' : undefined}
                playing={playingId === asset.id}
                onTogglePlay={onTogglePlay}
                onPreview={onPreview}
              />
            ))
          )}
        </div>

        {canScrollRight ? (
          <IconButton
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-row-arrow omnimux-assets-cloud-row-arrow--right"
            aria-label={t('card.scrollRight') || '向右滚动'}
            onClick={() => handleScroll(500)}
          >
            <ChevronRightIcon size={16} />
          </IconButton>
        ) : null}
      </div>
    </section>
  )
}
