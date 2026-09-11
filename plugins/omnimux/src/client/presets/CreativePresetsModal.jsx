import React, { useMemo, useState } from 'react'
import { SplitModalDialog } from '../components/SplitModalDialog.jsx'
import { CREATIVE_HOOKS, CREATIVE_VISUAL_STYLES, CREATIVE_VIDEO_FORMATS } from './catalog.js'
import { PresetCard } from './PresetCard.jsx'
import { compileCreativePrompt } from './compiler.js'
import { ensurePresetsStyles } from './styles.js'

/**
 * 营销视频创意预设与 Prompt 编译器大模态框
 * 100% 左右分栏架构，支持格式、亮点Hook与视觉风格的积木式装配与编译
 */
export function CreativePresetsModal({
  isOpen,
  onClose,
  t,
  onSubmitDraft,
}) {
  React.useEffect(() => {
    ensurePresetsStyles()
  }, [])

  const [activeTab, setActiveTab] = useState('hooks') // 'hooks' | 'styles' | 'formats'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubCategory, setSelectedSubCategory] = useState('all')

  const [selectedHook, setSelectedHook] = useState(null)
  const [selectedStyle, setSelectedStyle] = useState(null)
  const [selectedFormat, setSelectedFormat] = useState(null)
  const [userQuery, setUserQuery] = useState('')
  const [copied, setCopied] = useState(false)

  // 提取当前 Tab 下的所有二级分类
  const currentList = useMemo(() => {
    if (activeTab === 'hooks') return CREATIVE_HOOKS
    if (activeTab === 'styles') return CREATIVE_VISUAL_STYLES
    return CREATIVE_VIDEO_FORMATS
  }, [activeTab])

  const subCategories = useMemo(() => {
    const map = new Map()
    currentList.forEach((item) => {
      const slug = item.categorySlug || 'default'
      const label = item.categoryNameZh || item.categoryName || slug
      if (!map.has(slug)) {
        map.set(slug, label)
      }
    })
    return Array.from(map.entries()).map(([slug, label]) => ({ slug, label }))
  }, [currentList])

  // 过滤后的卡片列表
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return currentList.filter((item) => {
      // 分类过滤
      if (selectedSubCategory !== 'all' && item.categorySlug !== selectedSubCategory) {
        return false
      }
      // 搜索过滤
      if (q) {
        const matchTitle = (item.title || '').toLowerCase().includes(q)
        const matchTitleZh = (item.titleZh || '').toLowerCase().includes(q)
        const matchDesc = (item.description || '').toLowerCase().includes(q)
        const matchCategory = (item.categoryName || '').toLowerCase().includes(q)
        const matchCategoryZh = (item.categoryNameZh || '').toLowerCase().includes(q)
        return matchTitle || matchTitleZh || matchDesc || matchCategory || matchCategoryZh
      }
      return true
    })
  }, [currentList, selectedSubCategory, searchQuery])

  // 实时编译 Prompt 预览
  const compiledPrompt = useMemo(() => {
    return compileCreativePrompt({
      format: selectedFormat,
      hook: selectedHook,
      style: selectedStyle,
      userQuery: userQuery || '（请输入您的目标商品卖点或拍摄诉求...）',
      language: 'zh-CN',
    })
  }, [selectedFormat, selectedHook, selectedStyle, userQuery])

  function handleSelectHook(item) {
    setSelectedHook((prev) => (prev?.id === item.id ? null : item))
  }

  function handleSelectStyle(item) {
    setSelectedStyle((prev) => (prev?.id === item.id ? null : item))
  }

  function handleSelectFormat(item) {
    setSelectedFormat((prev) => (prev?.id === item.id ? null : item))
  }

  function handleResetAll() {
    setSelectedHook(null)
    setSelectedStyle(null)
    setSelectedFormat(null)
    setUserQuery('')
  }

  function handleCopyPrompt() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(compiledPrompt).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  function handleSubmit() {
    const finalPrompt = compileCreativePrompt({
      format: selectedFormat,
      hook: selectedHook,
      style: selectedStyle,
      userQuery: userQuery.trim(),
      language: 'zh-CN',
    })
    onSubmitDraft?.(finalPrompt)
    onClose?.()
  }

  const selectedCount = (selectedHook ? 1 : 0) + (selectedStyle ? 1 : 0) + (selectedFormat ? 1 : 0)

  // 左栏装配概览与 Prompt 预览
  const leftContent = (
    <div className="omnimux-presets-left-panel">
      {/* 已选创意积木清单 */}
      <div className="omnimux-presets-blueprint-card">
        <h3 className="omnimux-presets-blueprint-title">创意装配蓝图</h3>
        <div className="omnimux-presets-blueprint-slots">
          {/* 亮点 Hook 槽位 */}
          <div className="omnimux-presets-slot-item">
            <span className="omnimux-presets-slot-label">🎯 黄金亮点 (Hook):</span>
            {selectedHook ? (
              <span className="omnimux-presets-slot-value is-active">
                {selectedHook.titleZh || selectedHook.title}
                <button
                  type="button"
                  className="omnimux-presets-slot-del"
                  onClick={() => setSelectedHook(null)}
                  title="移除此项"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="omnimux-presets-slot-empty">未选（自由发挥）</span>
            )}
          </div>

          {/* 视觉风格槽位 */}
          <div className="omnimux-presets-slot-item">
            <span className="omnimux-presets-slot-label">🎨 视觉风格 (Style):</span>
            {selectedStyle ? (
              <span className="omnimux-presets-slot-value is-active">
                {selectedStyle.titleZh || selectedStyle.title}
                <button
                  type="button"
                  className="omnimux-presets-slot-del"
                  onClick={() => setSelectedStyle(null)}
                  title="移除此项"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="omnimux-presets-slot-empty">未选（自然光影）</span>
            )}
          </div>

          {/* 广告格式槽位 */}
          <div className="omnimux-presets-slot-item">
            <span className="omnimux-presets-slot-label">🎬 广告格式 (Format):</span>
            {selectedFormat ? (
              <span className="omnimux-presets-slot-value is-active">
                {selectedFormat.titleZh || selectedFormat.title}
                <button
                  type="button"
                  className="omnimux-presets-slot-del"
                  onClick={() => setSelectedFormat(null)}
                  title="移除此项"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="omnimux-presets-slot-empty">未选（标准爆款结构）</span>
            )}
          </div>
        </div>
      </div>

      {/* 核心商品/卖点输入 */}
      <div className="omnimux-presets-user-input-box">
        <label className="omnimux-presets-input-label" htmlFor="creative-presets-user-query">
          目标商品与核心卖点描述
        </label>
        <textarea
          id="creative-presets-user-query"
          className="omnimux-presets-textarea"
          placeholder="例如：一款轻量化骨传导运动耳机，主打户外夜跑安全与狂甩不掉，配色活力橙..."
          rows={3}
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
      </div>

      {/* 实时编译 Prompt 预览区 */}
      <div className="omnimux-presets-preview-box">
        <div className="omnimux-presets-preview-header">
          <span>Prompt 编译器实时草稿</span>
          <button
            type="button"
            className="omnimux-presets-copy-btn"
            onClick={handleCopyPrompt}
            title="复制到剪贴板"
          >
            {copied ? '已复制 ✓' : '复制 Prompt'}
          </button>
        </div>
        <pre className="omnimux-presets-preview-code">
          {compiledPrompt}
        </pre>
      </div>
    </div>
  )

  // 右栏底部操作区
  const footerNode = (
    <div className="omnimux-presets-footer-bar">
      <div className="omnimux-presets-footer-summary">
        已装配 <strong>{selectedCount}</strong> 项预设约束
        {selectedCount > 0 && (
          <button
            type="button"
            className="omnimux-presets-reset-btn"
            onClick={handleResetAll}
          >
            清空已选
          </button>
        )}
      </div>

      <div className="omnimux-presets-footer-actions">
        <button
          type="button"
          className="omnimux-presets-cancel-btn"
          onClick={onClose}
        >
          取消
        </button>
        <button
          type="button"
          className="omnimux-presets-submit-btn omnimux-split-modal-submit"
          onClick={handleSubmit}
        >
          应用并生成制作方案
        </button>
      </div>
    </div>
  )

  return (
    <SplitModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="营销视频创意预设与Prompt编译器"
      leftTitle="营销视频创意预设"
      leftSubtitle="积木式装配爆款格式、黄金亮点与视觉风格，自动编译为工业级分镜 Prompt"
      leftContent={leftContent}
      className="omnimux-creative-presets-modal"
      footer={footerNode}
    >
      <div className="omnimux-presets-right-content">
        {/* 一级选项卡 */}
        <div className="omnimux-presets-tabs-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'hooks'}
            className={`omnimux-presets-tab ${activeTab === 'hooks' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('hooks')
              setSelectedSubCategory('all')
            }}
          >
            🎯 黄金亮点 / Hook
            <span className="omnimux-presets-tab-badge">{CREATIVE_HOOKS.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'styles'}
            className={`omnimux-presets-tab ${activeTab === 'styles' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('styles')
              setSelectedSubCategory('all')
            }}
          >
            🎨 视觉风格 / Style
            <span className="omnimux-presets-tab-badge">{CREATIVE_VISUAL_STYLES.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'formats'}
            className={`omnimux-presets-tab ${activeTab === 'formats' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('formats')
              setSelectedSubCategory('all')
            }}
          >
            🎬 广告格式 / Format
            <span className="omnimux-presets-tab-badge">{CREATIVE_VIDEO_FORMATS.length}</span>
          </button>
        </div>

        {/* 搜索与二级分类栏 */}
        <div className="omnimux-presets-filter-row">
          {/* 实时搜索 */}
          <div className="omnimux-presets-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="omnimux-presets-search-input"
              placeholder="搜索预设名称、效果或关键词..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="omnimux-presets-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="清空搜索"
              >
                ×
              </button>
            )}
          </div>

          {/* 二级胶囊筛选 */}
          <div className="omnimux-presets-subcats" role="toolbar" aria-label="二级分类">
            <button
              type="button"
              className={`omnimux-presets-subcat-btn ${selectedSubCategory === 'all' ? 'is-active' : ''}`}
              onClick={() => setSelectedSubCategory('all')}
            >
              全部 ({currentList.length})
            </button>
            {subCategories.map(({ slug, label }) => (
              <button
                key={slug}
                type="button"
                className={`omnimux-presets-subcat-btn ${selectedSubCategory === slug ? 'is-active' : ''}`}
                onClick={() => setSelectedSubCategory(slug)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 卡片网格流 */}
        <div className="omnimux-presets-grid" role="region" aria-label="预设卡片列表">
          {filteredList.length > 0 ? (
            filteredList.map((item) => {
              let isSelected = false
              let onSelectHandler = null
              let type = 'hook'

              if (activeTab === 'hooks') {
                isSelected = selectedHook?.id === item.id
                onSelectHandler = handleSelectHook
                type = 'hook'
              } else if (activeTab === 'styles') {
                isSelected = selectedStyle?.id === item.id
                onSelectHandler = handleSelectStyle
                type = 'style'
              } else {
                isSelected = selectedFormat?.id === item.id
                onSelectHandler = handleSelectFormat
                type = 'format'
              }

              return (
                <PresetCard
                  key={item.id}
                  item={item}
                  type={type}
                  isSelected={isSelected}
                  onSelect={onSelectHandler}
                />
              )
            })
          ) : (
            <div className="omnimux-presets-empty-state">
              <p>未找到匹配的创意预设</p>
              <span>可尝试更换关键词或在上方重置分类</span>
            </div>
          )}
        </div>
      </div>
    </SplitModalDialog>
  )
}
