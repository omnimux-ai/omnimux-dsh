import React, { useEffect, useState } from 'react'
import { MARKETING_INSIGHT_ITEMS } from './catalog.js'
import { StarterIcon } from './StarterIcon.jsx'

/**
 * Full-featured modal for marketing insight task prompts.
 */
export function MarketingInsightModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [selectedItem, setSelectedItem] = useState(MARKETING_INSIGHT_ITEMS[0].id)
  const [promptValue, setPromptValue] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const item = MARKETING_INSIGHT_ITEMS.find((it) => it.id === selectedItem) || MARKETING_INSIGHT_ITEMS[0]
    const localizedPrompt = t(`guide.insight.${item.id}.prompt`) || item.prompt
    setPromptValue(localizedPrompt)
  }, [isOpen, selectedItem, t])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleSelect(id) {
    setSelectedItem(id)
    const item = MARKETING_INSIGHT_ITEMS.find((it) => it.id === id)
    if (item) {
      const localizedPrompt = t(`guide.insight.${item.id}.prompt`) || item.prompt
      setPromptValue(localizedPrompt)
    }
  }

  function handleSubmit() {
    if (promptValue.trim()) {
      onSubmitDraft(promptValue)
    }
  }

  return (
    <div
      className="omnimux-insight-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('guide.insight.modal.title')}
    >
      <div className="omnimux-insight-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button type="button" className="omnimux-insight-close" onClick={onClose} aria-label="Close"> {/* // exempt-ui01: modal close icon button */}
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Modal Header */}
        <header className="omnimux-insight-header">
          <h1>{t('guide.insight.modal.title')}</h1>
          <p>{t('guide.insight.modal.subtitle')}</p>
        </header>

        {/* Modal Body: Left and Right */}
        <div className="omnimux-insight-body">
          {/* Left: Suggested for you */}
          <section className="omnimux-insight-left" aria-label={t('guide.insight.suggested')}>
            <div className="omnimux-insight-left-top">
              <h2>{t('guide.insight.suggested')}</h2>
              <button type="button" className="omnimux-insight-refresh" aria-label="Refresh items"> {/* // exempt-ui01: refresh items button */}
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
          </section>

          {/* Right: What would you like to explore? */}
          <section className="omnimux-insight-right" aria-label={t('guide.insight.explore.title')}>
            <h2>{t('guide.insight.explore.title')}</h2>
            <div className="omnimux-insight-textarea-box">
              <textarea
                className="omnimux-insight-textarea"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder="Prompt context..."
                aria-label={t('guide.insight.explore.title')}
              />
            </div>
            <div className="omnimux-insight-actions">
              <button type="button" className="omnimux-insight-submit" onClick={handleSubmit}> {/* // exempt-ui01: start insight submit button */}
                <span>{t('guide.insight.start-btn')}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
