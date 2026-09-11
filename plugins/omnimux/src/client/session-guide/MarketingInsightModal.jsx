import React, { useEffect, useState } from 'react'
import { SplitModalDialog } from '../components/SplitModalDialog.jsx'
import { MARKETING_INSIGHT_ITEMS } from './catalog.js'
import { StarterIcon } from './StarterIcon.jsx'
import { INSIGHT_SCHEMAS } from './insight-form-schemas.js'

/**
 * 营销洞察全功能模态框 (基于 SplitModalDialog 左右两栏布局)
 * 右侧深度结构化重构：根据必填与选填生成表单字段，方便用户快速录入并自动编译为专业营销 Prompt。
 */
export function MarketingInsightModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [selectedItem, setSelectedItem] = useState(MARKETING_INSIGHT_ITEMS[0].id)
  const [formState, setFormState] = useState({})
  const [validationError, setValidationError] = useState('')

  // 判定当前语言
  const lang = typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('en')
    ? 'en'
    : 'zh'

  useEffect(() => {
    if (!isOpen) {
      setValidationError('')
    }
  }, [isOpen])

  const currentSchema = INSIGHT_SCHEMAS[selectedItem] || INSIGHT_SCHEMAS['tiktok-creators']
  const currentValues = formState[selectedItem] || {}

  function handleSelect(id) {
    setSelectedItem(id)
    setValidationError('')
  }

  function handleFieldChange(key, value) {
    setFormState((prev) => ({
      ...prev,
      [selectedItem]: {
        ...(prev[selectedItem] || {}),
        [key]: value,
      },
    }))
    if (validationError) {
      setValidationError('')
    }
  }

  function handleSubmit() {
    // 必填项校验
    const missingField = currentSchema.fields.find(
      (f) => f.required && !currentValues[f.key]?.trim()
    )

    if (missingField) {
      const label = lang === 'en' ? missingField.labelEn : missingField.labelZh
      const msg = lang === 'en'
        ? `Please fill in required field: ${label}`
        : `请先填写必填项：${label}`
      setValidationError(msg)
      return
    }

    // 编译为结构化专业 Prompt
    const compiled = currentSchema.compile(currentValues, lang)
    if (compiled && compiled.trim()) {
      onSubmitDraft(compiled.trim())
      onClose?.()
    }
  }

  const leftContent = (
    <>
      <div className="omnimux-insight-left-top">
        <h2>{t('guide.insight.suggested')}</h2>
        <button key="refresh-btn" type="button" className="omnimux-insight-refresh" aria-label="Refresh items"> {/* // exempt-ui01: refresh items button */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </button>
      </div>

      <div className="omnimux-insight-grid" role="tablist">
        {MARKETING_INSIGHT_ITEMS.map((item) => (
          <button key={item.id} type="button" role="tab" className="omnimux-insight-item" data-insight-id={item.id} aria-selected={selectedItem === item.id} onClick={() => handleSelect(item.id)}> {/* // exempt-ui01: insight item selection button */}
            <div className="omnimux-insight-item-header">
              <StarterIcon icon={item.icon} />
              <span className="omnimux-insight-arrow">↗</span>
            </div>
            <span className="omnimux-insight-item-title">
              {t(`guide.insight.${item.id}.title`)}
            </span>
          </button>
        ))}
      </div>
    </>
  )

  const footer = (
    <button key="submit-btn" type="button" className="omnimux-split-modal-submit omnimux-insight-submit" onClick={handleSubmit}> {/* // exempt-ui01: start insight submit button */}
      <span>{t('guide.insight.start-btn')}</span>
    </button>
  )

  return (
    <SplitModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={t('guide.insight.modal.title')}
      leftTitle={t('guide.insight.modal.title')}
      leftSubtitle={t('guide.insight.modal.subtitle')}
      leftContent={leftContent}
      rightTitle={t('guide.insight.explore.title')}
      footer={footer}
      className="omnimux-insight-overlay"
      containerClassName="omnimux-insight-modal"
    >
      <div className="omnimux-insight-form-container">
        {/* 当前选中洞察项标题与简要指引 */}
        <div className="omnimux-insight-header-banner">
          <h3 className="omnimux-insight-scenario-title">
            {lang === 'en' ? currentSchema.titleEn : currentSchema.titleZh}
          </h3>
          <p className="omnimux-insight-scenario-desc">
            {lang === 'en' ? currentSchema.descEn : currentSchema.descZh}
          </p>
        </div>

        {/* 校验错误提示条 */}
        {validationError && (
          <div className="omnimux-insight-error-banner" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{validationError}</span>
          </div>
        )}

        {/* 结构化表单流 */}
        <div className="omnimux-insight-fields-flow">
          {currentSchema.fields.map((field) => {
            const val = currentValues[field.key] || ''
            const label = lang === 'en' ? field.labelEn : field.labelZh
            const placeholder = lang === 'en' ? field.placeholderEn : field.placeholderZh

            return (
              <div key={field.key} className="omnimux-insight-field-group">
                <label className="omnimux-insight-field-label" htmlFor={`insight-${selectedItem}-${field.key}`}>
                  <span className="omnimux-insight-label-text">{label}</span>
                  {field.required ? (
                    <span className="omnimux-insight-required-tag">* 必填</span>
                  ) : (
                    <span className="omnimux-insight-optional-tag">选填</span>
                  )}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    id={`insight-${selectedItem}-${field.key}`}
                    className="omnimux-insight-input omnimux-insight-textarea-field"
                    rows={field.rows || 3}
                    placeholder={placeholder}
                    value={val}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    data-insight-field={field.key}
                  />
                ) : (
                  <input
                    id={`insight-${selectedItem}-${field.key}`}
                    type="text"
                    className="omnimux-insight-input omnimux-insight-text-field"
                    placeholder={placeholder}
                    value={val}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    data-insight-field={field.key}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </SplitModalDialog>
  )
}
