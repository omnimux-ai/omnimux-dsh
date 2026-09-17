import React from 'react'
import { TemplateCardItem } from './TemplateCardItem.jsx'

const ICON_ARROW_LEFT = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

/**
 * 创意模板 / 热门 / 技能全量分类网格视图
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

  const isEn = typeof t === 'function' ? t('locale') === 'en' || t('guide.locale') === 'en' : false
  const catTitle = isEn ? (category?.nameEn || category?.nameZh || 'Category') : (category?.nameZh || category?.nameEn || '分类')
  const catDesc = isEn ? (category?.descEn || category?.descZh) : (category?.descZh || category?.descEn)
  const backText = isEn ? 'Back to all' : '返回全部'

  return (
    <div className="omnimux-tpl-grid-view">
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
