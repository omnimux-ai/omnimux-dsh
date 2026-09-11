import React, { useEffect, useRef, useState } from 'react'
import { SplitModalDialog } from '../components/SplitModalDialog.jsx'
import {
  URL_TO_VIDEO_STYLES,
  URL_TO_VIDEO_RATIOS,
  URL_TO_VIDEO_EXAMPLES,
} from './catalog.js'
import { ExampleMediaCover } from './PopularCardCover.jsx'

function CarouselMedia({ example }) {
  const [imgBroken, setImgBroken] = useState(false)
  if (example.coverUrl && !imgBroken) {
    return (
      <img
        src={example.coverUrl}
        alt={example.title}
        onError={() => setImgBroken(true)}
        className="omnimux-u2v-cover-img"
      />
    )
  }
  return <ExampleMediaCover id={example.id} />
}

/**
 * 视频网址（URL to Video）全功能模态框 (基于 SplitModalDialog 左右两栏布局)
 */
export function UrlToVideoModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [activeSlide, setActiveSlide] = useState(1)
  const [examples, setExamples] = useState(URL_TO_VIDEO_EXAMPLES)
  const [productUrl, setProductUrl] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [keySellingPoint, setKeySellingPoint] = useState('')
  const [selectedStyle, setSelectedStyle] = useState(URL_TO_VIDEO_STYLES[0].id)
  const [isAutoDuration, setIsAutoDuration] = useState(true)
  const [duration, setDuration] = useState(15)
  const [selectedRatio, setSelectedRatio] = useState('9:16')
  const [errorNotice, setErrorNotice] = useState(null)
  const urlInputRef = useRef(null)

  // 每次打开弹窗时，从灵感社区动态匹配 3 条真实视频素材
  useEffect(() => {
    if (!isOpen) return
    let active = true

    async function fetchInspirations() {
      try {
        const res = await fetch('/omnimux/inspiration/local?page_size=20')
        if (!res.ok) return
        const json = await res.json()
        const items = json?.data?.items || json?.items || []
        const videoItems = items.filter((it) => it.cover_url || (it.media_urls && it.media_urls.length > 0))
        if (videoItems.length >= 3) {
          const shuffled = [...videoItems].sort(() => 0.5 - Math.random())
          const selected = shuffled.slice(0, 3).map((item, idx) => ({
            id: item.id || `insp-${idx}`,
            title: item.title ? (item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title) : '灵感视频示例',
            titleEn: item.title ? (item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title) : 'Inspiration Video',
            tag: '示例',
            tagEn: 'EXAMPLE',
            badge: item.source_platform ? item.source_platform.toUpperCase() : 'TikTok',
            desc: item.deconstruction?.hook_highlight || item.content || '爆款节奏与画面视觉参考',
            coverUrl: item.cover_url,
            videoUrl: item.media_urls?.[0] || '',
          }))
          if (active) {
            setExamples(selected)
          }
        }
      } catch {
        // 离线/降级保持默认
      }
    }

    void fetchInspirations()
    return () => {
      active = false
    }
  }, [isOpen])

  function handlePrev() {
    setActiveSlide((prev) => (prev - 1 + examples.length) % examples.length)
  }

  function handleNext() {
    setActiveSlide((prev) => (prev + 1) % examples.length)
  }

  function handleSubmit() {
    if (!productUrl.trim()) {
      setErrorNotice(t('guide.url-to-video.url-required'))
      try { urlInputRef.current?.focus() } catch { /* ignore jsdom */ }
      return
    }
    const styleObj = URL_TO_VIDEO_STYLES.find((s) => s.id === selectedStyle)
    const raw = t(`guide.url-to-video.style.${selectedStyle}`)
    const styleLabel = (!raw || raw.startsWith('guide.')) ? (styleObj?.labelZh || styleObj?.label || selectedStyle) : raw
    const durationText = isAutoDuration ? '自动（模型推荐）' : `${duration} 秒`

    const prompt = `请根据以下产品页面信息，将其转化为可直接投放的带货短视频广告制作方案：
产品网址：${productUrl.trim()}
${targetAudience.trim() ? `目标受众：${targetAudience.trim()}\n` : ''}${keySellingPoint.trim() ? `核心卖点：${keySellingPoint.trim()}\n` : ''}视觉风格：${styleLabel}
目标时长：${durationText}
画幅比例：${selectedRatio}
请深入挖掘该产品核心价值、痛点与使用场景，输出黄金 3 秒 Hook、场景分镜脚本、画面视觉与运镜指引、以及强有力的结尾行动号召（CTA）。`

    onSubmitDraft(prompt)
  }

  const leftContent = (
    <div className="omnimux-u2v-carousel-wrap">
      <div className="omnimux-u2v-carousel">
        {examples.map((ex, index) => {
          let pos = 'center'
          if (index === (activeSlide - 1 + examples.length) % examples.length) {
            pos = 'left'
          } else if (index === (activeSlide + 1) % examples.length) {
            pos = 'right'
          } else if (index !== activeSlide) {
            pos = 'hidden'
          }
          if (pos === 'hidden') return null
          return (
            <div key={ex.id} className="omnimux-u2v-card" data-pos={pos}>
              <span className="omnimux-u2v-card-badge">{ex.tag}</span>
              <div className="omnimux-u2v-card-media">
                <CarouselMedia example={ex} />
              </div>
              <div className="omnimux-u2v-card-info">
                <div className="omnimux-u2v-card-title">{ex.title}</div>
                <div className="omnimux-u2v-card-desc">{ex.desc}</div>
              </div>
            </div>
          )
        })}
        <button key="prev-btn" type="button" className="omnimux-u2v-nav-btn prev" onClick={handlePrev} aria-label="Previous example" /* exempt-ui01: carousel nav button */>
          ‹
        </button>
        <button key="next-btn" type="button" className="omnimux-u2v-nav-btn next" onClick={handleNext} aria-label="Next example" /* exempt-ui01: carousel nav button */>
          ›
        </button>
      </div>
      <div className="omnimux-u2v-dots">
        {examples.map((ex, index) => (
          <span
            key={ex.id}
            className={`omnimux-u2v-dot ${index === activeSlide ? 'active' : ''}`}
            onClick={() => setActiveSlide(index)}
          />
        ))}
      </div>
    </div>
  )

  const footer = (
    <button key="u2v-submit-btn" type="button" className="omnimux-split-modal-submit omnimux-u2v-submit" onClick={handleSubmit} /* exempt-ui01: url-to-video submit button */>
      <span>{t('guide.url-to-video.submit-btn')}</span>
    </button>
  )

  return (
    <SplitModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={t('guide.url-to-video.modal.title')}
      leftTitle={t('guide.url-to-video.modal.title')}
      leftSubtitle={t('guide.url-to-video.modal.subtitle')}
      leftContent={leftContent}
      footer={footer}
      className="omnimux-u2v-overlay"
      containerClassName="omnimux-u2v-modal"
    >
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
            {URL_TO_VIDEO_STYLES.map((style) => {
              const raw = t(`guide.url-to-video.style.${style.id}`)
              const label = (!raw || raw.startsWith('guide.')) ? (style.labelZh || style.label) : raw
              return (
                <button key={style.id} type="button" role="radio" aria-checked={selectedStyle === style.id} className="omnimux-u2v-style-btn" onClick={() => setSelectedStyle(style.id)} /* exempt-ui01: style radio button */>
                  {label}
                </button>
              )
            })}
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
            <button key="auto-btn" type="button" aria-pressed={isAutoDuration} className="omnimux-u2v-auto-btn" onClick={() => setIsAutoDuration(!isAutoDuration)} /* exempt-ui01: auto duration toggle */>
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
          <span className="omnimux-u2v-hint">
            {t('guide.url-to-video.duration.hint')}
          </span>
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
                  style={{
                    '--ratio-w': `${ratio.width}px`,
                    '--ratio-h': `${ratio.height}px`,
                  }}
                />
                <span className="omnimux-u2v-ratio-text">{ratio.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SplitModalDialog>
  )
}
