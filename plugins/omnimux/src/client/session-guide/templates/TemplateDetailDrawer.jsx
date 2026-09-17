import React, { useEffect } from 'react'

const ICON_CLOSE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

const ICON_SPARKLES = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
)

/**
 * 模板分镜与结构拆解详情抽屉
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object | null} props.template
 * @param {() => void} props.onClose
 * @param {(template: object) => void} props.onApply
 */
export function TemplateDetailDrawer({
  isOpen,
  template,
  onClose,
  onApply,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !template) return null

  const handleApplyClick = () => {
    if (onApply) onApply(template)
    onClose()
  }

  const durationTag = template.duration || '15s 竖版'

  return (
    <div
      className="omnimux-tpl-drawer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="omnimux-drawer-title"
    >
      <div
        className="omnimux-tpl-drawer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="omnimux-tpl-drawer-header">
          <div>
            <h3 id="omnimux-drawer-title" className="omnimux-tpl-drawer-title">
              {template.title}
            </h3>
            <p className="omnimux-tpl-drawer-subtitle">
              <span>{template.titleEn}</span>
              <span>· 来源 {template.sourcePlatform || '精选'}</span>
              <span>· 时长 {durationTag}</span>
            </p>
          </div>

          <button /* exempt-ui01: drawer close button */
            type="button"
            className="omnimux-tpl-drawer-close"
            onClick={onClose}
            aria-label="关闭详情抽屉"
          >
            {ICON_CLOSE}
          </button>
        </div>

        <div className="omnimux-tpl-drawer-body">
          <div className="omnimux-tpl-drawer-left">
            <div className="omnimux-tpl-drawer-media-wrap">
              {template.thumbnailUrl ? (
                <img
                  src={template.thumbnailUrl}
                  alt={template.title}
                  className="omnimux-tpl-drawer-img"
                />
              ) : (
                <div className="omnimux-tpl-drawer-ph">
                  {ICON_SPARKLES}
                </div>
              )}
            </div>
            <div className="omnimux-tpl-drawer-r2-note">
              已托管至 OmniMux R2 存储桶
            </div>
          </div>

          <div className="omnimux-tpl-drawer-right">
            {template.rhythm && (
              <div className="omnimux-tpl-drawer-section">
                <h4 className="omnimux-tpl-sec-title">分镜节奏与结构</h4>
                <p className="omnimux-tpl-sec-p">{template.rhythm}</p>
              </div>
            )}

            <div className="omnimux-tpl-drawer-section">
              <h4 className="omnimux-tpl-sec-title">AI 生成提示词 (Prompt)</h4>
              <pre className="omnimux-tpl-prompt-box">{template.prompt}</pre>
            </div>

            {template.slotGuide && (
              <div className="omnimux-tpl-drawer-section">
                <h4 className="omnimux-tpl-sec-title">替换插槽指引</h4>
                <div className="omnimux-tpl-slot-guide-box">
                  {template.slotGuide}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="omnimux-tpl-drawer-footer">
          <button /* exempt-ui01: drawer cancel button */
            type="button"
            className="omnimux-tpl-btn-secondary"
            onClick={onClose}
          >
            关闭
          </button>

          <button /* exempt-ui01: drawer apply button */
            type="button"
            className="omnimux-tpl-btn-primary"
            onClick={handleApplyClick}
          >
            <span className="omnimux-tpl-btn-icon">{ICON_SPARKLES}</span>
            <span>立即装配并复刻</span>
          </button>
        </div>
      </div>
    </div>
  )
}
