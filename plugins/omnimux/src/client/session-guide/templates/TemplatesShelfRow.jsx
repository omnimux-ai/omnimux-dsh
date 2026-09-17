import React, { useRef } from 'react'
import { TemplateCardItem } from './TemplateCardItem.jsx'

const ICON_CHEVRON_RIGHT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

/**
 * 创意模板货架横滑行组件
 * @param {object} props
 * @param {object} props.shelf
 * @param {Array} props.items
 * @param {(template: object) => void} props.onSelectTemplate
 * @param {(template: object) => void} props.onOpenDetail
 * @param {(categorySlug: string) => void} props.onViewAll
 */
export function TemplatesShelfRow({
  shelf,
  items = [],
  onSelectTemplate,
  onOpenDetail,
  onViewAll,
}) {
  const trackRef = useRef(null)

  const handleScrollRight = () => {
    if (trackRef.current) {
      trackRef.current.scrollBy({ left: 320, behavior: 'smooth' })
    }
  }

  const handleViewAllClick = () => {
    const target = shelf.targetCategory === 'all' ? 'apps-software' : shelf.targetCategory
    if (onViewAll) onViewAll(target)
  }

  if (!items || items.length === 0) return null

  return (
    <section className="omnimux-shelf-section" data-shelf-slug={shelf.slug}>
      <div className="omnimux-shelf-header">
        <div className="omnimux-shelf-title-wrap">
          <h3 className="omnimux-shelf-heading">{shelf.titleZh}</h3>
          <span className="omnimux-shelf-subheading">{shelf.subtitleZh}</span>
        </div>

        <button /* exempt-ui01: shelf row view all button */
          type="button"
          className="omnimux-shelf-btn-view-all"
          onClick={handleViewAllClick}
          aria-label={`查看全部 ${shelf.titleZh} 模板`}
        >
          <span>查看全部 (View all)</span>
          <span className="omnimux-shelf-view-arrow">{ICON_CHEVRON_RIGHT}</span>
        </button>
      </div>

      <div className="omnimux-shelf-slider-container">
        <div className="omnimux-shelf-track" ref={trackRef} tabIndex={0} aria-label={`${shelf.titleZh} 模板列表`}>
          {items.map((template) => (
            <TemplateCardItem
              key={template.id}
              template={template}
              onSelect={onSelectTemplate}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>

        <button /* exempt-ui01: shelf slider float arrow button */
          type="button"
          className="omnimux-shelf-arrow-btn"
          onClick={handleScrollRight}
          aria-label="向右滑动查看更多模板"
          title="向右滚动"
        >
          {ICON_CHEVRON_RIGHT}
        </button>
      </div>
    </section>
  )
}
