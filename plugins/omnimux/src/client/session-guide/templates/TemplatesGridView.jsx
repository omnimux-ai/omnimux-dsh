import React, { useState, useEffect, useRef, useMemo } from 'react'
import { TemplateCardItem } from './TemplateCardItem.jsx'

const ICON_ARROW_LEFT = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

const INITIAL_BATCH_SIZE = 16
const BATCH_STEP = 16

/**
 * 创意模板 / 热门 / 技能全量分类网格视图
 * 具备「首屏 16 项轻量渲染 + 滚动触底增量加载 + 已呈现全部数据状态」性能优化架构
 *
 * @param {object} props
 * @param {object} props.category
 * @param {Array} props.items
 * @param {() => void} props.onBackToAll
 * @param {(template: object) => void} props.onSelectTemplate
 * @param {(template: object) => void} props.onOpenDetail
 * @param {Function} [props.t]
 */
export function TemplatesGridView({
  category,
  items = [],
  onBackToAll,
  onSelectTemplate,
  onOpenDetail,
  t,
}) {
  const count = items.length
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH_SIZE)
  const sentinelRef = useRef(null)

  // 当切换到不同分类时，重置分页游标为首批数量
  useEffect(() => {
    setVisibleCount(INITIAL_BATCH_SIZE)
  }, [category?.slug])

  // 当前切片渲染的项目列表，绝不一次性渲染几百个大 DOM
  const displayedItems = useMemo(() => {
    return items.slice(0, visibleCount)
  }, [items, visibleCount])

  const hasMore = visibleCount < count

  // 触底自动追加下一批次（每次 +16）
  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(count, prev + BATCH_STEP))
  }

  // 挂载 IntersectionObserver 哨兵，滚动触底无感平滑追加
  useEffect(() => {
    if (!hasMore || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first && first.isIntersecting) {
          setVisibleCount((prev) => Math.min(count, prev + BATCH_STEP))
        }
      },
      { rootMargin: '240px' }
    )

    const el = sentinelRef.current
    if (el) observer.observe(el)

    return () => {
      if (el) observer.unobserve(el)
      observer.disconnect()
    }
  }, [hasMore, count])

  const isEn = typeof t === 'function' ? t('locale') === 'en' || t('guide.locale') === 'en' : false
  const catTitle = isEn ? (category?.nameEn || category?.nameZh || 'Category') : (category?.nameZh || category?.nameEn || '分类')
  const catDesc = isEn ? (category?.descEn || category?.descZh) : (category?.descZh || category?.descEn)
  const backText = isEn ? 'Back to all' : '返回全部'
  const allLoadedText = isEn ? `All ${count} items loaded` : `已呈现全部 ${count} 项数据`
  const loadMoreText = isEn ? 'Load more' : '加载更多'

  return (
    <div className="omnimux-tpl-grid-view" data-category={category?.slug}>
      <div className="omnimux-tpl-grid-header">
        <div className="omnimux-tpl-grid-title-wrap">
          <h3 className="omnimux-tpl-grid-heading">
            <span>{catTitle}</span>
            <span className="omnimux-tpl-grid-count">({count})</span>
          </h3>
          {catDesc && (
            <span className="omnimux-tpl-grid-desc">{catDesc}</span>
          )}
        </div>

        <button /* exempt-ui01: back to all shelves button */
          type="button"
          className="omnimux-tpl-btn-back"
          onClick={onBackToAll}
          aria-label={backText}
        >
          <span className="omnimux-tpl-back-icon">{ICON_ARROW_LEFT}</span>
          <span>{backText}</span>
        </button>
      </div>

      <div className="omnimux-tpl-full-grid" data-rendered-count={displayedItems.length}>
        {displayedItems.map((template) => (
          <TemplateCardItem
            key={template.id}
            template={template}
            onSelect={onSelectTemplate}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>

      {/* 触底观察哨兵与状态提示 */}
      <div className="omnimux-tpl-grid-footer" ref={sentinelRef}>
        {hasMore ? (
          <button /* exempt-ui01: manual load more fallback */
            type="button"
            className="omnimux-tpl-btn-loadmore"
            onClick={handleLoadMore}
            aria-label={loadMoreText}
          >
            <span>{loadMoreText} ({displayedItems.length} / {count})</span>
          </button>
        ) : (
          count > 0 && (
            <div className="omnimux-tpl-grid-all-loaded">
              <span>{allLoadedText}</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
