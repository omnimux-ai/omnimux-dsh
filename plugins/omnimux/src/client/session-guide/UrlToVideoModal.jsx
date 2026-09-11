import React, { useEffect, useRef, useState } from 'react'
import {
  URL_TO_VIDEO_STYLES,
  URL_TO_VIDEO_RATIOS,
  URL_TO_VIDEO_EXAMPLES,
} from './catalog.js'
import { ExampleMediaCover } from './PopularCardCover.jsx'

/**
 * Full-featured modal for URL to video generation.
 */
export function UrlToVideoModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [activeSlide, setActiveSlide] = useState(1)
  const [productUrl, setProductUrl] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [keySellingPoint, setKeySellingPoint] = useState('')
  const [selectedStyle, setSelectedStyle] = useState(URL_TO_VIDEO_STYLES[0].id)
  const [isAutoDuration, setIsAutoDuration] = useState(true)
  const [duration, setDuration] = useState(15)
  const [selectedRatio, setSelectedRatio] = useState('9:16')
  const [errorNotice, setErrorNotice] = useState(null)
  const urlInputRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handlePrev() {
    setActiveSlide((prev) => (prev - 1 + URL_TO_VIDEO_EXAMPLES.length) % URL_TO_VIDEO_EXAMPLES.length)
  }

  function handleNext() {
    setActiveSlide((prev) => (prev + 1) % URL_TO_VIDEO_EXAMPLES.length)
  }

  function handleSubmit() {
    if (!productUrl.trim()) {
      setErrorNotice(t('guide.url-to-video.url-required'))
      urlInputRef.current?.focus()
      return
    }
    const styleObj = URL_TO_VIDEO_STYLES.find((s) => s.id === selectedStyle)
    const styleLabel = styleObj?.labelZh || styleObj?.label || selectedStyle
    const durationText = isAutoDuration ? '自动（模型推荐）' : `${duration} 秒`

    const prompt = `请根据以下产品页面信息，将其转化为可直接投放的带货短视频广告制作方案：
产品网址：${productUrl.trim()}
${targetAudience.trim() ? `目标受众：${targetAudience.trim()}\n` : ''}${keySellingPoint.trim() ? `核心卖点：${keySellingPoint.trim()}\n` : ''}视觉风格：${styleLabel}
目标时长：${durationText}
画幅比例：${selectedRatio}
请深入挖掘该产品核心价值、痛点与使用场景，输出黄金 3 秒 Hook、场景分镜脚本、画面视觉与运镜指引、以及强有力的结尾行动号召（CTA）。`

    onSubmitDraft(prompt)
  }

  return (
    <div className="omnimux-u2v-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('guide.url-to-video.modal.title')}>
      <div className="omnimux-u2v-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="omnimux-insight-close" onClick={onClose} aria-label="Close" /* exempt-ui01: modal close icon button */>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <header className="omnimux-u2v-header">
          <h1>{t('guide.url-to-video.modal.title')}</h1>
          <p>{t('guide.url-to-video.modal.subtitle')}</p>
        </header>

        <div className="omnimux-u2v-body">
          {/* Left: 3D Carousel */}
          <section className="omnimux-u2v-left" aria-label="示例展示">
            <div className="omnimux-u2v-carousel">
              {URL_TO_VIDEO_EXAMPLES.map((ex, index) => {
                let pos = 'center'
                if (index === (activeSlide - 1 + URL_TO_VIDEO_EXAMPLES.length) % URL_TO_VIDEO_EXAMPLES.length) {
                  pos = 'left'
                } else if (index === (activeSlide + 1) % URL_TO_VIDEO_EXAMPLES.length) {
                  pos = 'right'
                } else if (index !== activeSlide) {
                  pos = 'hidden'
                }
                if (pos === 'hidden') return null
                return (
                  <div key={ex.id} className="omnimux-u2v-card" data-pos={pos}>
                    <span className="omnimux-u2v-card-badge">{ex.tag}</span>
                    <div className="omnimux-u2v-card-media">
                      <ExampleMediaCover id={ex.id} />
                    </div>
                    <div className="omnimux-u2v-card-info">
                      <div className="omnimux-u2v-card-title">{ex.title}</div>
                      <div className="omnimux-u2v-card-desc">{ex.desc}</div>
                    </div>
                  </div>
                )
              })}
              <button type="button" className="omnimux-u2v-nav-btn prev" onClick={handlePrev} aria-label="Previous example" /* exempt-ui01: carousel nav button */>
                ‹
              </button>
              <button type="button" className="omnimux-u2v-nav-btn next" onClick={handleNext} aria-label="Next example" /* exempt-ui01: carousel nav button */>
                ›
              </button>
            </div>
            <div className="omnimux-u2v-dots">
              {URL_TO_VIDEO_EXAMPLES.map((ex, index) => (
                <span
                  key={ex.id}
                  className={`omnimux-u2v-dot ${index === activeSlide ? 'active' : ''}`}
                  onClick={() => setActiveSlide(index)}
                />
              ))}
            </div>
          </section>

          {/* Right: Form Flow */}
          <section className="omnimux-u2v-right" aria-label="视频网址配置表单">
            <div className="omnimux-u2v-form-flow">
              {/* Product URL */}
              <div className="omnimux-u2v-field">
                <label className="omnimux-u2v-field-label">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span>{t('guide.url-to-video.product-url.label')}</span>
                </label>
                <input
                  ref={urlInputRef}
                  type="text"
                  className="omnimux-u2v-input"
                  value={productUrl}
                  onChange={(e) => {
                    setProductUrl(e.target.value)
                    setErrorNotice(null)
                  }}
                  placeholder={t('guide.url-to-video.product-url.placeholder')}
                />
                {errorNotice && <span className="omnimux-u2v-error">{errorNotice}</span>}
              </div>

              {/* Target audience */}
              <div className="omnimux-u2v-field">
                <label className="omnimux-u2v-field-label">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                  <span>{t('guide.url-to-video.target-audience.label')}</span>
                </label>
                <input
                  type="text"
                  className="omnimux-u2v-input"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder={t('guide.url-to-video.target-audience.placeholder')}
                />
              </div>

              {/* Key selling point */}
              <div className="omnimux-u2v-field">
                <label className="omnimux-u2v-field-label">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 11 18-5v12L3 14v-3z" />
                    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                  </svg>
                  <span>{t('guide.url-to-video.key-selling-point.label')}</span>
                </label>
                <input
                  type="text"
                  className="omnimux-u2v-input"
                  value={keySellingPoint}
                  onChange={(e) => setKeySellingPoint(e.target.value)}
                  placeholder={t('guide.url-to-video.key-selling-point.placeholder')}
                />
              </div>

              {/* Visual style */}
              <div className="omnimux-u2v-field">
                <label className="omnimux-u2v-field-label">
                  <span>{t('guide.url-to-video.visual-style.label')}</span>
                </label>
                <div className="omnimux-u2v-styles-grid" role="radiogroup">
                  {URL_TO_VIDEO_STYLES.map((style) => (
                    <button key={style.id} type="button" role="radio" aria-checked={selectedStyle === style.id} className="omnimux-u2v-style-btn" onClick={() => setSelectedStyle(style.id)} /* exempt-ui01: style radio button */>
                      {t(`guide.url-to-video.style.${style.id}`) || style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="omnimux-u2v-field">
                <label className="omnimux-u2v-field-label">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{t('guide.url-to-video.duration.label')}</span>
                </label>
                <div className="omnimux-u2v-duration-row">
                  <button type="button" aria-pressed={isAutoDuration} className="omnimux-u2v-auto-btn" onClick={() => setIsAutoDuration(!isAutoDuration)} /* exempt-ui01: auto duration toggle */>
                    {t('guide.url-to-video.duration.auto')}
                  </button>
                  <div className="omnimux-u2v-slider-track">
                    <input
                      type="range"
                      min="4"
                      max="180"
                      value={isAutoDuration ? 15 : duration}
                      disabled={isAutoDuration}
                      onChange={(e) => {
                        setDuration(Number(e.target.value))
                        setIsAutoDuration(false)
                      }}
                      className="omnimux-u2v-slider"
                    />
                  </div>
                  <span className="omnimux-u2v-duration-label">
                    {isAutoDuration ? t('guide.url-to-video.duration.auto') : `${duration}s`}
                  </span>
                </div>
                <span className="omnimux-u2v-hint">{t('guide.url-to-video.duration.hint')}</span>
              </div>

              {/* Aspect ratio */}
              <div className="omnimux-u2v-field">
                <label className="omnimux-u2v-field-label">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="14" x="2" y="5" rx="2" />
                    <line x1="2" x2="22" y1="10" y2="10" />
                  </svg>
                  <span>{t('guide.url-to-video.aspect-ratio.label')}</span>
                </label>
                <div className="omnimux-u2v-ratios-grid" role="radiogroup">
                  {URL_TO_VIDEO_RATIOS.map((ratio) => (
                    <button key={ratio.id} type="button" role="radio" aria-checked={selectedRatio === ratio.id} className="omnimux-u2v-ratio-btn" onClick={() => setSelectedRatio(ratio.id)} /* exempt-ui01: ratio radio button */>
                      <div
                        className="omnimux-u2v-ratio-box"
                        style={{ '--ratio-w': `${ratio.width}px`, '--ratio-h': `${ratio.height}px` }}
                      />
                      <span className="omnimux-u2v-ratio-text">{ratio.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="omnimux-u2v-actions">
              <button type="button" className="omnimux-u2v-submit" onClick={handleSubmit} /* exempt-ui01: url-to-video submit button */>
                <span>{t('guide.url-to-video.submit-btn')}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
