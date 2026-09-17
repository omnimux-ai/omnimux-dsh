import React, { useRef } from 'react'
import { TemplateCardItem } from './TemplateCardItem.jsx'

const ICON_CHEVRON_RIGHT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

/**
 * 创意模板 / 热门 / 技能单行横滑货架行组件
 * @param {object} props
 * @param {object} props.shelf
 * @param {Array} props.items
 * @param {(template: object) => void} props.onSelectTemplate
 * @param {(template: object) => void} props.onOpenDetail
 * @param {(categorySlug: string) => void} props.onViewAll
 * @param {Function} [props.t]
 */
export function TemplatesShelfRow({
  shelf,
  items = [],
  onSelectTemplate,
  onOpenDetail,
  onViewAll,
  t,
}) {
  const trackRef = useRef(null)

  const handleScrollRight = () => {
    if (trackRef.current) {
      trackRef.current.scrollBy({ left: 420, behavior: 'smooth' })
    }
  }

  const handleViewAllClick = () => {
    const target = shelf.targetCategory || shelf.slug
    if (onViewAll) onViewAll(target)
  }

  if (!items || items.length === 0) return null

  // 原生多语言：中文纯中文，英文纯英文
  const isEn = typeof t === 'function' ? t('locale') === 'en' || t('guide.locale') === 'en' : false
  const title = isEn ? (shelf.titleEn || shelf.titleZh) : (shelf.titleZh || shelf.titleEn)
  const subtitle = isEn ? (shelf.subtitleEn || shelf.subtitleZh) : (shelf.subtitleZh || shelf.subtitleEn)
  const viewAllText = isEn ? 'View all' : '查看全部'

  return (
    <section className="omnimux-shelf-section" data-shelf-slug={shelf.slug}>
      <div className="omnimux-shelf-header">
        <div className="omnimux-shelf-title-wrap">
          <h3 className="omnimux-shelf-heading">{title}</h3>
          {subtitle && <span className="omnimux-shelf-subheading">{subtitle}</span>}
        </div>

        <button /* exempt-ui01: shelf row view all button */
          type="button"
          className="omnimux-shelf-btn-view-all"
          onClick={handleViewAllClick}
          aria-label={`${viewAllText} ${title}`}
        >
          <span>{viewAllText}</span>
          <span className="omnimux-shelf-view-arrow">{ICON_CHEVRON_RIGHT}</span>
        </button>
      </div>

      <div className="omnimux-shelf-slider-container">
        <div className="omnimux-shelf-track" ref={trackRef} tabIndex={0} aria-label={`${title} 列表`}>
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
          aria-label={`向右滑动查看更多 ${title}`}
          title="向右滚动"
        >
          {ICON_CHEVRON_RIGHT}
        </button>
      </div>
    </section>
  )
}
