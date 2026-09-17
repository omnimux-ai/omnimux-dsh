import React, { useState } from 'react'

const ICON_SPARKLES = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
)

/**
 * 统一创意模板卡片
 * @param {object} props
 * @param {object} props.template
 * @param {(template: object) => void} props.onSelect
 * @param {(template: object) => void} props.onOpenDetail
 */
export function TemplateCardItem({ template, onSelect, onOpenDetail }) {
  const [imgError, setImgError] = useState(false)

  const handleCardClick = () => {
    if (onOpenDetail) onOpenDetail(template)
  }

  const handleRecreateClick = (e) => {
    e.stopPropagation()
    if (onSelect) onSelect(template)
  }

  const durationTag = template.duration || '15s 竖版'
  const modelTag = template.modelTag || 'Seedance 2.5'

  return (
    <div
      className="omnimux-tpl-card"
      onClick={handleCardClick}
      data-template-id={template.id}
      role="button"
      tabIndex={0}
      aria-label={`${template.title} (${template.titleEn})`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      <div className="omnimux-tpl-media-box">
        {!imgError && template.thumbnailUrl ? (
          <img
            className="omnimux-tpl-img"
            src={template.thumbnailUrl}
            alt={template.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="omnimux-tpl-placeholder">
            <span className="omnimux-tpl-ph-icon">{ICON_SPARKLES}</span>
            <span className="omnimux-tpl-ph-title">{template.title}</span>
          </div>
        )}

        <div className="omnimux-tpl-top-tag" aria-hidden="true">
          <span>{modelTag}</span>
        </div>

        {template.sourcePlatform && (
          <div className="omnimux-tpl-platform-tag" aria-hidden="true">
            <span>{template.sourcePlatform}</span>
          </div>
        )}

        <div className="omnimux-tpl-gradient-layer" aria-hidden="true" />

        <div className="omnimux-tpl-bottom-bar">
          <div className="omnimux-tpl-title">{template.title}</div>
          <div className="omnimux-tpl-meta">
            <span className="omnimux-tpl-meta-en">{template.titleEn}</span>
            <span className="omnimux-tpl-meta-dur">{durationTag}</span>
          </div>

          <button /* exempt-ui01: template card action button */
            type="button"
            className="omnimux-tpl-btn-recreate"
            onClick={handleRecreateClick}
            aria-label={`一键复刻 ${template.title}`}
          >
            <span className="omnimux-tpl-icon">{ICON_SPARKLES}</span>
            <span>一键复刻</span>
          </button>
        </div>
      </div>
    </div>
  )
}
