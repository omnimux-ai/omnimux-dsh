import React, { useEffect, useRef, useState } from 'react'
import { SplitModalDialog } from '../components/SplitModalDialog.jsx'
import { RECREATE_VIRAL_ADS_EXAMPLES } from './catalog.js'

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * 示例卡片分屏对比视图组件 (1:1 还原原片与重制效果对比展示)
 */
function CompareCardVisual({ example }) {
  const [leftBroken, setLeftBroken] = useState(false)
  const [rightBroken, setRightBroken] = useState(false)

  return (
    <div className="omnimux-recreate-compare-card" aria-label="Visual comparison">
      <span className="omnimux-recreate-sample-tag">{example.tag || '示例'}</span>
      
      {/* 左右分屏对比画面 */}
      <div className="omnimux-recreate-split-visual">
        {/* 左半屏: 原视频 */}
        <div className="omnimux-recreate-half omnimux-recreate-half-left">
          {example.coverLeft && !leftBroken ? (
            <img
              src={example.coverLeft}
              alt={example.originalTitle || 'Original'}
              onError={() => setLeftBroken(true)}
              className="omnimux-recreate-half-img"
            />
          ) : (
            <div className="omnimux-recreate-half-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="2" y="2" width="20" height="20" rx="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              <span>原片分镜</span>
            </div>
          )}
          <span className="omnimux-recreate-half-badge">原视频</span>
        </div>

        {/* 中间分界线 */}
        <div className="omnimux-recreate-divider-bar">
          <div className="omnimux-recreate-divider-handle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="8 18 2 12 8 6" />
              <polyline points="16 6 22 12 16 18" />
            </svg>
          </div>
        </div>

        {/* 右半屏: 替换生成后视频 */}
        <div className="omnimux-recreate-half omnimux-recreate-half-right">
          {example.coverRight && !rightBroken ? (
            <img
              src={example.coverRight}
              alt={example.recreatedTitle || 'Recreated'}
              onError={() => setRightBroken(true)}
              className="omnimux-recreate-half-img"
            />
          ) : (
            <div className="omnimux-recreate-half-placeholder omnimux-recreate-placeholder-accent">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>复刻重构</span>
            </div>
          )}
          <span className="omnimux-recreate-half-badge omnimux-recreate-badge-accent">新生成</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 复刻爆款视频（重现病毒式广告）全功能模态框
 * 100% 左右分栏架构，支持真实视频文件选择、参考材料多文件选择、模式切换与动态草稿生成
 */
export function RecreateViralAdsModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [examples, setExamples] = useState(RECREATE_VIRAL_ADS_EXAMPLES)
  const [cloneMode, setCloneMode] = useState('replace-elements') // 'recreate-structure' | 'replace-elements'
  const [targetVideo, setTargetVideo] = useState(null) // { file, name, size, previewUrl }
  const [targetVideoError, setTargetVideoError] = useState(null)
  const [newVideoPrompt, setNewVideoPrompt] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([]) // Array<{ id, file, name, size, previewUrl }>
  const [referenceError, setReferenceError] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [errorNotice, setErrorNotice] = useState(null)

  const videoInputRef = useRef(null)
  const refFilesInputRef = useRef(null)

  // 弹窗打开时，动态自灵感社区拉取真实视频样例
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
        if (videoItems.length >= 2) {
          const shuffled = [...videoItems].sort(() => 0.5 - Math.random())
          const generatedExamples = []
          for (let i = 0; i < Math.min(3, Math.floor(shuffled.length / 2)); i++) {
            const left = shuffled[i * 2]
            const right = shuffled[i * 2 + 1]
            generatedExamples.push({
              id: `viral-pair-${i}`,
              title: left.title || '病毒式广告案例',
              titleEn: left.title || 'Viral Ad Case',
              tag: '示例',
              tagEn: 'EXAMPLE',
              originalTitle: left.title || '原视频分镜',
              recreatedTitle: right.title || '新产品替换复刻',
              coverLeft: left.cover_url,
              coverRight: right.cover_url,
              desc: left.deconstruction?.hook_highlight || '重现视频结构，或替换人物和产品，同时保留原始创意。',
              descEn: 'Recreate video structure, or swap people and products while keeping the original idea.',
            })
          }
          if (active && generatedExamples.length > 0) {
            setExamples(generatedExamples)
          }
        }
      } catch {
        // 离线/服务异常保持默认优秀模板
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

  // 目标视频选择
  function processVideoFile(file) {
    if (!file) return
    setTargetVideoError(null)
    setErrorNotice(null)

    // 格式校验
    const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')
    if (!isMp4 && !file.type.startsWith('video/')) {
      setTargetVideoError(t('guide.recreate-viral-ads.video-format-error'))
      return
    }

    // 大小校验: 50MB
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      setTargetVideoError(t('guide.recreate-viral-ads.video-size-error'))
      return
    }

    let previewUrl = null
    try {
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        previewUrl = URL.createObjectURL(file)
      }
    } catch {
      // ignore
    }

    setTargetVideo({
      file,
      name: file.name,
      size: formatFileSize(file.size),
      previewUrl,
    })
  }

  function handleVideoChange(e) {
    const file = e.target.files?.[0]
    if (file) processVideoFile(file)
    e.target.value = ''
  }

  function handleRemoveTargetVideo(e) {
    e?.stopPropagation()
    if (targetVideo?.previewUrl && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(targetVideo.previewUrl) } catch { /* ignore */ }
    }
    setTargetVideo(null)
    setTargetVideoError(null)
  }

  // 其他参考素材多文件选择 (最多 6 个)
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

  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      processVideoFile(file)
    }
  }

  function handleSubmit() {
    if (!targetVideo) {
      setErrorNotice(t('guide.recreate-viral-ads.video-required'))
      return
    }

    const modeLabel = cloneMode === 'replace-elements'
      ? '替换元素（Swap people or products. Leave the rest unchanged.）'
      : '重现结构（Keep the shots, pacing, and structure. Create new content.）'

    let prompt = `请帮我复刻这条爆款视频广告：\n\n`
    prompt += `【复刻模式】：${modeLabel}\n`
    prompt += `【目标视频】：${targetVideo.name} (${targetVideo.size})\n`

    if (newVideoPrompt.trim()) {
      prompt += `【新视频展示内容要求】：\n${newVideoPrompt.trim()}\n`
    }

    if (referenceFiles.length > 0) {
      prompt += `【已附带参考素材】（共 ${referenceFiles.length} 个）：\n`
      referenceFiles.forEach((f, idx) => {
        prompt += `${idx + 1}. ${f.name} (${f.size})\n`
      })
    }

    prompt += `\n请针对该目标视频进行拆解并输出落地制作方案：\n`
    prompt += `1. 核心爆款要素与镜头节奏分析（黄金开头 Hook、产品出场时机与情绪转折）\n`
    prompt += `2. 全新分镜重构脚本（包含景别、运镜方式、画面描述、旁白文案）\n`
    prompt += `3. 可直接用于 AI 视频生成的镜头 Prompt 提示词与一致性参数推荐`

    onSubmitDraft?.(prompt)
    onClose?.()
  }

  const currentExample = examples[activeSlide] || examples[0]

  // 左栏展示内容
  const leftContent = (
    <div className="omnimux-recreate-left-container">
      {/* 3D 轮播及上下切换控制 */}
      <div className="omnimux-recreate-carousel-box">
        {/* 左侧纵向小指示点 */}
        <div className="omnimux-recreate-dots" aria-hidden="true">
          {examples.map((ex, idx) => (
            <span
              key={ex.id || idx}
              className={`omnimux-recreate-dot ${idx === activeSlide ? 'active' : ''}`}
            />
          ))}
        </div>

        {/* 顶部向上切换箭头 */}
        <button type="button" className="omnimux-recreate-nav-btn omnimux-recreate-nav-up" onClick={handlePrev} aria-label="Previous example" /* // exempt-ui01: carousel nav button */>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* 主卡片分屏展示 */}
        <div className="omnimux-recreate-stage">
          <CompareCardVisual example={currentExample} />
        </div>

        {/* 底部向下切换箭头 */}
        <button type="button" className="omnimux-recreate-nav-btn omnimux-recreate-nav-down" onClick={handleNext} aria-label="Next example" /* // exempt-ui01: carousel nav button */>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>
  )

  // 右栏底部固定操作栏
  const footerNode = (
    <div className="omnimux-recreate-footer-actions">
      {errorNotice && (
        <span className="omnimux-recreate-error-msg" role="alert">
          {errorNotice}
        </span>
      )}
      <button type="button" className="omnimux-recreate-submit-btn omnimux-split-modal-submit" onClick={handleSubmit} /* // exempt-ui01: modal submit button */>
        {t('guide.recreate-viral-ads.submit-btn')}
      </button>
    </div>
  )

  return (
    <SplitModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={t('guide.recreate-viral-ads.modal.title')}
      leftTitle={t('guide.recreate-viral-ads.modal.title')}
      leftSubtitle={t('guide.recreate-viral-ads.modal.subtitle')}
      leftContent={leftContent}
      className="omnimux-recreate-modal"
      footer={footerNode}
    >
      <div className="omnimux-recreate-form-flow">
        {/* 隐藏的真实文件 Input */}
        <input
          type="file"
          ref={videoInputRef}
          accept="video/mp4,video/*"
          style={{ display: 'none' }}
          onChange={handleVideoChange}
        />
        <input
          type="file"
          ref={refFilesInputRef}
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleRefFilesChange}
        />

        {/* 1. Clone mode (克隆模式) */}
        <div className="omnimux-recreate-field-group">
          <label className="omnimux-recreate-group-title">
            {t('guide.recreate-viral-ads.clone-mode.label')}
          </label>
          <div className="omnimux-clone-modes-grid" role="radiogroup" aria-label="Clone mode">
            {/* 模式 A: 重现结构 */}
            <button type="button" className={`omnimux-clone-mode-card ${cloneMode === 'recreate-structure' ? 'active' : ''}`} onClick={() => setCloneMode('recreate-structure')} role="radio" aria-checked={cloneMode === 'recreate-structure'} /* // exempt-ui01: mode option card button */>
              <div className="omnimux-clone-mode-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </div>
              <div className="omnimux-clone-mode-text">
                <span className="omnimux-clone-mode-name">
                  {t('guide.recreate-viral-ads.mode.recreate-structure.title')}
                </span>
                <span className="omnimux-clone-mode-desc">
                  {t('guide.recreate-viral-ads.mode.recreate-structure.desc')}
                </span>
              </div>
            </button>

            {/* 模式 B: 替换元素 (默认选中) */}
            <button type="button" className={`omnimux-clone-mode-card ${cloneMode === 'replace-elements' ? 'active' : ''}`} onClick={() => setCloneMode('replace-elements')} role="radio" aria-checked={cloneMode === 'replace-elements'} /* // exempt-ui01: mode option card button */>
              <div className="omnimux-clone-mode-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                  <path d="M12 12v9" />
                  <path d="m8 17 4 4 4-4" />
                </svg>
              </div>
              <div className="omnimux-clone-mode-text">
                <span className="omnimux-clone-mode-name">
                  {t('guide.recreate-viral-ads.mode.replace-elements.title')}
                </span>
                <span className="omnimux-clone-mode-desc">
                  {t('guide.recreate-viral-ads.mode.replace-elements.desc')}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Target video (目标视频，必填) */}
        <div className="omnimux-recreate-field-group">
          <div className="omnimux-recreate-label-row">
            <span className="omnimux-recreate-icon-prefix">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
            <label className="omnimux-recreate-group-title">
              {t('guide.recreate-viral-ads.target-video.label')}
            </label>
            <span className="omnimux-recreate-required-tag">
              {t('guide.recreate-viral-ads.target-video.required')}
            </span>
          </div>

          {/* 文件未选择状态 */}
          {!targetVideo ? (
            <div
              className={`omnimux-recreate-upload-dropzone ${isDragOver ? 'is-drag-over' : ''} ${targetVideoError ? 'has-error' : ''}`}
              onClick={() => videoInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Upload target video"
            >
              <div className="omnimux-recreate-upload-add-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="omnimux-recreate-upload-info">
                <span className="omnimux-recreate-upload-main">
                  {t('guide.recreate-viral-ads.target-video.add')}
                </span>
                <span className="omnimux-recreate-upload-sub">
                  {t('guide.recreate-viral-ads.target-video.hint')}
                </span>
              </div>
            </div>
          ) : (
            /* 文件已选中展示 */
            <div className="omnimux-recreate-selected-file-card">
              <div className="omnimux-recreate-file-icon-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div className="omnimux-recreate-file-meta">
                <span className="omnimux-recreate-file-name" title={targetVideo.name}>
                  {targetVideo.name}
                </span>
                <span className="omnimux-recreate-file-size">
                  {targetVideo.size} · MP4 已就绪
                </span>
              </div>
              <div className="omnimux-recreate-file-actions">
                <button type="button" className="omnimux-recreate-file-action-btn" onClick={() => videoInputRef.current?.click()} title="更换视频" /* // exempt-ui01: file replace button */>
                  更换
                </button>
                <button type="button" className="omnimux-recreate-file-remove-btn" onClick={handleRemoveTargetVideo} aria-label="Remove video" title="移除" /* // exempt-ui01: file remove button */>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {targetVideoError && (
            <span className="omnimux-recreate-field-error">{targetVideoError}</span>
          )}
        </div>

        {/* 3. What should the new video show? (新视频展示什么内容) */}
        <div className="omnimux-recreate-field-group">
          <div className="omnimux-recreate-label-row">
            <span className="omnimux-recreate-icon-sparkle">✨</span>
            <label className="omnimux-recreate-group-title">
              {t('guide.recreate-viral-ads.prompt-input.label')}
            </label>
          </div>
          <textarea
            className="omnimux-recreate-textarea"
            rows={3}
            value={newVideoPrompt}
            onChange={(e) => setNewVideoPrompt(e.target.value)}
            placeholder={t('guide.recreate-viral-ads.prompt-input.placeholder')}
          />
        </div>

        {/* 4. Other reference materials (其他参考素材，可选) */}
        <div className="omnimux-recreate-field-group">
          <div className="omnimux-recreate-label-row">
            <span className="omnimux-recreate-icon-prefix">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
            <label className="omnimux-recreate-group-title">
              {t('guide.recreate-viral-ads.reference-materials.label')}
            </label>
            <span className="omnimux-recreate-optional-tag">
              {t('guide.recreate-viral-ads.reference-materials.optional')}
            </span>
          </div>

          {/* 添加按钮区 (当少于 6 个时可点击唤起) */}
          {referenceFiles.length < 6 && (
            <div
              className="omnimux-recreate-upload-dropzone omnimux-recreate-ref-zone"
              onClick={() => refFilesInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Add reference materials"
            >
              <div className="omnimux-recreate-upload-add-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="omnimux-recreate-upload-info">
                <span className="omnimux-recreate-upload-main">
                  {t('guide.recreate-viral-ads.reference-materials.add')}
                </span>
                <span className="omnimux-recreate-upload-sub">
                  {t('guide.recreate-viral-ads.reference-materials.hint')}
                </span>
              </div>
            </div>
          )}

          {/* 说明限额提示 */}
          <div className="omnimux-recreate-ref-limit-hint">
            <span>{t('guide.recreate-viral-ads.reference-materials.limit')} ({referenceFiles.length}/6)</span>
            {referenceError && <span className="omnimux-recreate-field-error">{referenceError}</span>}
          </div>

          {/* 已选素材列表 */}
          {referenceFiles.length > 0 && (
            <div className="omnimux-recreate-ref-list">
              {referenceFiles.map((item) => (
                <div key={item.id} className="omnimux-recreate-ref-pill">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.name} className="omnimux-recreate-ref-thumb" />
                  ) : (
                    <div className="omnimux-recreate-ref-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                  )}
                  <div className="omnimux-recreate-ref-text">
                    <span className="omnimux-recreate-ref-name" title={item.name}>{item.name}</span>
                    <span className="omnimux-recreate-ref-size">{item.size}</span>
                  </div>
                  <button type="button" className="omnimux-recreate-ref-del-btn" onClick={(e) => handleRemoveRefFile(item.id, e)} aria-label={`Remove ${item.name}`} /* // exempt-ui01: ref item delete button */>
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
      </div>
    </SplitModalDialog>
  )
}
