import React, { useEffect } from 'react'
import { resolveTemplateCopy } from './template-locale.js'
import { useTemplateLocale } from './use-template-locale.js'

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
 * @param {string} [props.locale]
 * @param {Function} [props.t]
 */
export function TemplateDetailDrawer({
  isOpen,
  template,
  onClose,
  onApply,
  locale,
  t,
}) {
  const currentLocale = useTemplateLocale(locale, t)
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

  const isEn = String(currentLocale).toLowerCase().startsWith('en')
  const copy = resolveTemplateCopy(template, currentLocale)
  const title = copy.title || template.title || ''
  const prompt = copy.prompt || ''
  const durationTag = template.duration || (isEn ? '15s vertical' : '15秒竖版')
  const sourceLabel = isEn ? 'Source' : '来源'
  const durationLabel = isEn ? 'Length' : '时长'
  const closeLabel = isEn ? 'Close' : '关闭'
  const applyLabel = isEn ? 'Use this template' : '用这个模板'
  const promptLabel = isEn ? 'Prompt' : '提示词'

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
              {title}
            </h3>
            <p className="omnimux-tpl-drawer-subtitle">
              <span>{sourceLabel} {template.sourcePlatform || (isEn ? 'Featured' : '精选')}</span>
              <span>· {durationLabel} {durationTag}</span>
            </p>
          </div>

          <button /* exempt-ui01: drawer close button */
            type="button"
            className="omnimux-tpl-drawer-close"
            onClick={onClose}
            aria-label={closeLabel}
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
                  alt={title}
                  className="omnimux-tpl-drawer-img"
                />
              ) : (
                <div className="omnimux-tpl-drawer-ph">
                  {ICON_SPARKLES}
                </div>
              )}
            </div>
            <div className="omnimux-tpl-drawer-r2-note">
              {isEn ? 'Saved in your template library' : '已收进模板库'}
            </div>
          </div>

          <div className="omnimux-tpl-drawer-right">
            {template.rhythm && (
              <div className="omnimux-tpl-drawer-section">
                <h4 className="omnimux-tpl-sec-title">{isEn ? 'Pacing' : '分镜节奏'}</h4>
                <p className="omnimux-tpl-sec-p">{template.rhythm}</p>
              </div>
            )}

            <div className="omnimux-tpl-drawer-section">
              <h4 className="omnimux-tpl-sec-title">{promptLabel}</h4>
              <pre className="omnimux-tpl-prompt-box" data-template-prompt="">{prompt}</pre>
            </div>

            {template.slotGuide && (
              <div className="omnimux-tpl-drawer-section">
                <h4 className="omnimux-tpl-sec-title">{isEn ? 'What to replace' : '替换说明'}</h4>
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
            {closeLabel}
          </button>

          <button /* exempt-ui01: drawer apply button */
            type="button"
            className="omnimux-tpl-btn-primary"
            onClick={handleApplyClick}
          >
            <span className="omnimux-tpl-btn-icon">{ICON_SPARKLES}</span>
            <span>{applyLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
