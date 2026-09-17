import React from 'react'
import { TemplateCardItem } from './TemplateCardItem.jsx'

const ICON_ARROW_LEFT = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

/**
 * 创意模板分类全量网格视图
 * @param {object} props
 * @param {object} props.category
 * @param {Array} props.items
 * @param {() => void} props.onBackToAll
 * @param {(template: object) => void} props.onSelectTemplate
 * @param {(template: object) => void} props.onOpenDetail
 */
export function TemplatesGridView({
  category,
  items = [],
  onBackToAll,
  onSelectTemplate,
  onOpenDetail,
}) {
  const count = items.length

  return (
    <div className="omnimux-tpl-grid-view">
      <div className="omnimux-tpl-grid-header">
        <div className="omnimux-tpl-grid-title-wrap">
          <h3 className="omnimux-tpl-grid-heading">
            <span>{category?.nameZh || '分类模板'}</span>
            <span className="omnimux-tpl-grid-count">({count})</span>
          </h3>
          {category?.descZh && (
            <span className="omnimux-tpl-grid-desc">{category.descZh}</span>
          )}
        </div>

        <button /* exempt-ui01: back to all shelves button */
          type="button"
          className="omnimux-tpl-btn-back"
          onClick={onBackToAll}
          aria-label="返回全部分类货架列表"
        >
          <span className="omnimux-tpl-back-icon">{ICON_ARROW_LEFT}</span>
          <span>返回全部货架</span>
        </button>
      </div>

      <div className="omnimux-tpl-full-grid">
        {items.map((template) => (
          <TemplateCardItem
            key={template.id}
            template={template}
            onSelect={onSelectTemplate}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}
