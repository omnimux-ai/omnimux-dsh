import React, { useEffect, useRef, useState } from 'react'
import { SplitModalDialog } from '../components/SplitModalDialog.jsx'
import { BULK_CREATE_RATIOS, BULK_CREATE_ADS_EXAMPLES } from './catalog.js'

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function RatioIcon({ ratio }) {
  let w = 18
  let h = 18
  if (ratio === '16:9') { w = 22; h = 12 }
  else if (ratio === '4:3') { w = 20; h = 15 }
  else if (ratio === '1:1') { w = 16; h = 16 }
  else if (ratio === '3:4') { w = 15; h = 20 }
  else if (ratio === '9:16') { w = 12; h = 22 }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect
        x={(24 - w) / 2}
        y={(24 - h) / 2}
        width={w}
        height={h}
        rx="2"
      />
    </svg>
  )
}

/**
 * 单张卡片视觉渲染组件
 */
function CardPoster({ item, isCenter }) {
  const [imgBroken, setImgBroken] = useState(false)

  return (
    <div className={`omnimux-bulk-fan-card ${isCenter ? 'is-center' : 'is-side'}`}>
      <span className="omnimux-bulk-sample-tag">{item.tag || 'EXAMPLE'}</span>
      {item.coverUrl && !imgBroken ? (
        <img
          src={item.coverUrl}
          alt={item.title || 'Ad example'}
          onError={() => setImgBroken(true)}
          className="omnimux-bulk-card-img"
        />
      ) : (
        <div className="omnimux-bulk-card-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="4" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
          <span>{item.title || 'AD SAMPLE'}</span>
        </div>
      )}
    </div>
  )
}

/**
 * 批量创建广告（Bulk Create Ads）全功能模态框
 * 100% 左右分栏架构，支持 3D 扇形堆叠卡片轮播、创意简报输入、参考素材多选、画幅比例选择、时长滑动条与数量步进器
 */
export function BulkCreateAdsModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [examples, setExamples] = useState(BULK_CREATE_ADS_EXAMPLES)
  const [creativeBrief, setCreativeBrief] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([]) // Array<{ id, file, name, size, previewUrl }>
  const [referenceError, setReferenceError] = useState(null)
  const [selectedRatio, setSelectedRatio] = useState('9:16')
  const [duration, setDuration] = useState(15)
  const [videoCount, setVideoCount] = useState(4)
  const [errorNotice, setErrorNotice] = useState(null)

  const briefInputRef = useRef(null)
  const refFilesInputRef = useRef(null)

  // 动态从灵感社区获取真实爆款素材
  useEffect(() => {
    if (!isOpen) return
    let active = true

    async function fetchInspirations() {
      try {
        const res = await fetch('/omnimux/inspiration/local?page_size=20')
        if (!res.ok) return
        const json = await res.json()
        const items = json?.data?.items || json?.items || []
        const videoItems = items.filter((it) => it.cover_url)
        if (videoItems.length >= 3) {
          const shuffled = [...videoItems].sort(() => 0.5 - Math.random())
          const selected = shuffled.slice(0, 3).map((item, idx) => ({
            id: item.id || `bulk-sample-${idx}`,
            title: item.title || `广告变体案例 ${idx + 1}`,
            titleEn: item.title || `Ad Variant Sample ${idx + 1}`,
            tag: 'EXAMPLE',
            tagZh: '示例',
            coverUrl: item.cover_url,
          }))
          if (active) {
            setExamples(selected)
          }
        }
      } catch {
        // 离线/降级保持默认优秀样例
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

  // 参考素材多选
  function processReferenceFiles(filesList) {
    if (!filesList || filesList.length === 0) return
    setReferenceError(null)

    const incoming = Array.from(filesList)
    const availableSlots = 6 - referenceFiles.length
    if (availableSlots <= 0) {
      setReferenceError('最多支持上传 6 个参考素材')
      return
    }

    const allowed = incoming.slice(0, availableSlots)
    if (incoming.length > availableSlots) {
      setReferenceError(`本次仅添加前 ${availableSlots} 个素材（达到 6 个上限）`)
    }

    const mapped = allowed.map((file, idx) => {
      let previewUrl = null
      if (file.type.startsWith('image/') && typeof URL !== 'undefined' && URL.createObjectURL) {
        try { previewUrl = URL.createObjectURL(file) } catch { /* ignore */ }
      }
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${idx}`,
        file,
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type,
        previewUrl,
      }
    })

    setReferenceFiles((prev) => [...prev, ...mapped])
  }

  function handleRefFilesChange(e) {
    processReferenceFiles(e.target.files)
    e.target.value = ''
  }

  function handleRemoveRefFile(id, e) {
    e?.stopPropagation()
    setReferenceFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.previewUrl && typeof URL !== 'undefined') {
        try { URL.revokeObjectURL(target.previewUrl) } catch { /* ignore */ }
      }
      return prev.filter((f) => f.id !== id)
    })
    setReferenceError(null)
  }

  function handleSubmit() {
    if (!creativeBrief.trim()) {
      setErrorNotice(t('guide.bulk-create-ads.brief-required'))
      try { briefInputRef.current?.focus() } catch { /* ignore jsdom */ }
      return
    }

    let prompt = `请帮我批量创建多条不同角度的短视频广告创意脚本方案：\n\n`
    prompt += `【创意简报要求】：\n${creativeBrief.trim()}\n\n`
    prompt += `【视频规格参数】：\n`
    prompt += `- 画幅比例：${selectedRatio}\n`
    prompt += `- 单条目标时长：${duration} 秒\n`
    prompt += `- 批量生成数量：${videoCount} 条独立创意变体\n`

    if (referenceFiles.length > 0) {
      prompt += `\n【参考素材清单】（共 ${referenceFiles.length} 个）：\n`
      referenceFiles.forEach((f, idx) => {
        prompt += `${idx + 1}. ${f.name} (${f.size})\n`
      })
    }

    prompt += `\n请针对以上创意简报，输出 ${videoCount} 个截然不同切入角度（如痛点唤醒、反常识好奇、真人种草测评、戏剧性场景反转等）的高转化视频脚本。每条脚本需包含：\n`
    prompt += `1. 创意角度定位与受众抓手（Hook）\n`
    prompt += `2. 逐镜头分镜脚本（景别、运镜镜头、画面描述提示词、口播旁白）\n`
    prompt += `3. 强力转化行动号召（Call to Action）`

    onSubmitDraft?.(prompt)
    onClose?.()
  }

  // 计算扇形左、中、右索引
  const total = examples.length
  const leftIndex = (activeSlide - 1 + total) % total
  const centerIndex = activeSlide
  const rightIndex = (activeSlide + 1) % total

  const leftItem = examples[leftIndex] || examples[0]
  const centerItem = examples[centerIndex] || examples[0]
  const rightItem = examples[rightIndex] || examples[0]

  // 左栏视觉内容 (扇形卡片与轮播)
  const leftContent = (
    <div className="omnimux-bulk-left-container">
      <div className="omnimux-bulk-fan-stage">
        {/* 左侧切换按钮 */}
        <button type="button" className="omnimux-bulk-nav-btn omnimux-bulk-nav-prev" onClick={handlePrev} aria-label="Previous example" /* // exempt-ui01: carousel nav button */>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 扇形堆叠 3 张卡片 */}
        <div className="omnimux-bulk-cards-fan">
          <div className="omnimux-bulk-fan-slot omnimux-bulk-fan-left">
            <CardPoster item={leftItem} isCenter={false} />
          </div>
          <div className="omnimux-bulk-fan-slot omnimux-bulk-fan-center">
            <CardPoster item={centerItem} isCenter={true} />
          </div>
          <div className="omnimux-bulk-fan-slot omnimux-bulk-fan-right">
            <CardPoster item={rightItem} isCenter={false} />
          </div>
        </div>

        {/* 右侧切换按钮 */}
        <button type="button" className="omnimux-bulk-nav-btn omnimux-bulk-nav-next" onClick={handleNext} aria-label="Next example" /* // exempt-ui01: carousel nav button */>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* 底部小圆点指示器 */}
      <div className="omnimux-bulk-dots" aria-hidden="true">
        {examples.map((ex, idx) => (
          <span
            key={ex.id || idx}
            className={`omnimux-bulk-dot ${idx === activeSlide ? 'active' : ''}`}
          />
        ))}
      </div>
    </div>
  )

  // 右栏底部操作栏
  const footerNode = (
    <div className="omnimux-bulk-footer-container">
      {errorNotice && (
        <span className="omnimux-bulk-error-msg" role="alert">
          {errorNotice}
        </span>
      )}
      <button type="button" className="omnimux-bulk-submit-btn omnimux-split-modal-submit" onClick={handleSubmit} /* // exempt-ui01: modal submit button */>
        {t('guide.bulk-create-ads.submit-btn')}
      </button>
    </div>
  )

  return (
    <SplitModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={t('guide.bulk-create-ads.modal.title')}
      leftTitle={t('guide.bulk-create-ads.modal.title')}
      leftSubtitle={t('guide.bulk-create-ads.modal.subtitle')}
      leftContent={leftContent}
      className="omnimux-bulk-modal"
      footer={footerNode}
    >
      <div className="omnimux-bulk-form-flow">
        {/* 隐藏的真实文件多选 Input */}
        <input
          type="file"
          ref={refFilesInputRef}
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleRefFilesChange}
        />

        {/* 1. Creative brief (创意简报) */}
        <div className="omnimux-bulk-field-group">
          <label className="omnimux-bulk-group-title">
            {t('guide.bulk-create-ads.creative-brief.label')}
          </label>
          <textarea
            ref={briefInputRef}
            className="omnimux-bulk-textarea"
            rows={4}
            value={creativeBrief}
            onChange={(e) => {
              setCreativeBrief(e.target.value)
              if (errorNotice) setErrorNotice(null)
            }}
            placeholder={t('guide.bulk-create-ads.creative-brief.placeholder')}
          />
        </div>

        {/* 2. References (参考素材，可选) */}
        <div className="omnimux-bulk-field-group">
          <div className="omnimux-bulk-label-row">
            <span className="omnimux-bulk-icon-prefix">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
            <label className="omnimux-bulk-group-title">
              {t('guide.bulk-create-ads.references.label')}
            </label>
            <span className="omnimux-bulk-optional-tag">
              {t('guide.bulk-create-ads.references.optional')}
            </span>
          </div>

          {/* 上传拖拽区域 */}
          {referenceFiles.length < 6 && (
            <div
              className="omnimux-bulk-upload-dropzone"
              onClick={() => refFilesInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Add references"
            >
              <div className="omnimux-bulk-upload-add-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="omnimux-bulk-upload-info">
                <span className="omnimux-bulk-upload-main">
                  {t('guide.bulk-create-ads.references.add')}
                </span>
                <span className="omnimux-bulk-upload-sub">
                  {t('guide.bulk-create-ads.references.hint')}
                </span>
              </div>
            </div>
          )}

          {/* 限制提示 */}
          <div className="omnimux-bulk-ref-limit-hint">
            <span>{t('guide.bulk-create-ads.references.limit')} ({referenceFiles.length}/6)</span>
            {referenceError && <span className="omnimux-bulk-field-error">{referenceError}</span>}
          </div>

          {/* 已选素材胶囊列表 */}
          {referenceFiles.length > 0 && (
            <div className="omnimux-bulk-ref-list">
              {referenceFiles.map((item) => (
                <div key={item.id} className="omnimux-bulk-ref-pill">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.name} className="omnimux-bulk-ref-thumb" />
                  ) : (
                    <div className="omnimux-bulk-ref-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                  )}
                  <div className="omnimux-bulk-ref-text">
                    <span className="omnimux-bulk-ref-name" title={item.name}>{item.name}</span>
                    <span className="omnimux-bulk-ref-size">{item.size}</span>
                  </div>
                  <button type="button" className="omnimux-bulk-ref-del-btn" onClick={(e) => handleRemoveRefFile(item.id, e)} aria-label={`Remove ${item.name}`} /* // exempt-ui01: ref item delete button */>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Aspect ratio (画幅比例) */}
        <div className="omnimux-bulk-field-group">
          <label className="omnimux-bulk-group-title">
            {t('guide.bulk-create-ads.aspect-ratio.label')}
          </label>
          <div className="omnimux-bulk-ratios-grid" role="radiogroup" aria-label="Aspect ratio">
            {BULK_CREATE_RATIOS.map((r) => {
              const isSelected = selectedRatio === r.id
              return (
                <button key={r.id} type="button" className={`omnimux-bulk-ratio-btn ${isSelected ? 'active' : ''}`} onClick={() => setSelectedRatio(r.id)} role="radio" aria-checked={isSelected} /* // exempt-ui01: ratio option button */>
                  <div className="omnimux-bulk-ratio-icon">
                    <RatioIcon ratio={r.id} />
                  </div>
                  <span className="omnimux-bulk-ratio-text">{r.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 4. Duration (视频时长滑块) */}
        <div className="omnimux-bulk-field-group">
          <div className="omnimux-bulk-duration-header">
            <label className="omnimux-bulk-group-title">
              {t('guide.bulk-create-ads.duration.label')}
            </label>
            <span className="omnimux-bulk-duration-badge">{duration}s</span>
          </div>
          <div className="omnimux-bulk-slider-box">
            <input
              type="range"
              min="4"
              max="30"
              step="1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="omnimux-bulk-slider"
              aria-label="Duration in seconds"
            />
            <div className="omnimux-bulk-slider-labels">
              <span>4s</span>
              <span>30s</span>
            </div>
          </div>
        </div>

        {/* 5. Number of videos (生成视频数量步进器) */}
        <div className="omnimux-bulk-field-group">
          <div className="omnimux-bulk-stepper-row">
            <div className="omnimux-bulk-stepper-info">
              <label className="omnimux-bulk-group-title">
                {t('guide.bulk-create-ads.video-count.label')}
              </label>
              <p className="omnimux-bulk-stepper-desc">
                {t('guide.bulk-create-ads.video-count.desc')}
              </p>
            </div>
            <div className="omnimux-bulk-stepper" role="group" aria-label="Video count stepper">
              <button type="button" className="omnimux-bulk-stepper-btn" onClick={() => setVideoCount((prev) => Math.max(1, prev - 1))} disabled={videoCount <= 1} aria-label="Decrease video count" /* // exempt-ui01: stepper minus button */>
                −
              </button>
              <span className="omnimux-bulk-stepper-value">{videoCount}</span>
              <button type="button" className="omnimux-bulk-stepper-btn" onClick={() => setVideoCount((prev) => Math.min(10, prev + 1))} disabled={videoCount >= 10} aria-label="Increase video count" /* // exempt-ui01: stepper plus button */>
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </SplitModalDialog>
  )
}
