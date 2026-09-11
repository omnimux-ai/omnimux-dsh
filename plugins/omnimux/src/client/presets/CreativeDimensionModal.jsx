import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'dsh-ui-kit'
import { CREATIVE_HOOKS, CREATIVE_VISUAL_STYLES, CREATIVE_VIDEO_FORMATS } from './catalog.js'
import { PresetCard } from './PresetCard.jsx'
import { ensurePresetsStyles } from './styles.js'
import { getCreativePresetsStore } from './presets-store.js'

export const DIMENSION_CONFIG = {
  format: {
    key: 'format',
    label: '广告格式',
    title: '选择视频广告格式',
    icon: '⭐',
    items: CREATIVE_VIDEO_FORMATS,
    placeholder: '搜索广告格式或应用场景 (如 前后对比、开箱、痛点)...',
  },
  hook: {
    key: 'hook',
    label: '开场亮点',
    title: '选择开场亮点 (Hook)',
    icon: '🎯',
    items: CREATIVE_HOOKS,
    placeholder: '搜索黄金 3 秒吸睛抓手 (如 碰撞、反差、音效)...',
  },
  style: {
    key: 'style',
    label: '视觉风格',
    title: '选择画面视觉风格',
    icon: '🎨',
    items: CREATIVE_VISUAL_STYLES,
    placeholder: '搜索光影质感与美学体系 (如 静奢、极简、国潮)...',
  },
}

/**
 * 营销视频三大创意维度独立弹窗组件
 * 专属于各自维度的分类 Tab、搜索、卡片选品与确认闭环
 */
export function CreativeDimensionModal({
  isOpen = false,
  onClose,
  dimension = 'format', // 'format' | 'hook' | 'style'
  sessionId = 'default',
  onConfirm,
}) {
  const store = useMemo(() => getCreativePresetsStore(), [])
  const config = DIMENSION_CONFIG[dimension] || DIMENSION_CONFIG.format

  const [selectedSubCategory, setSelectedSubCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [tempSelected, setTempSelected] = useState(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    ensurePresetsStyles()
  }, [])

  // 当弹窗打开时，同步当前 session 中的选中项
  useEffect(() => {
    if (isOpen) {
      const current = store.getSnapshot(sessionId)[dimension]
      setTempSelected(current || null)
      setSelectedSubCategory('all')
      setSearchQuery('')
    }
  }, [isOpen, dimension, sessionId, store])

  // 键盘快捷键 (Escape 退出)
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 提取当前维度的二级分类
  const subCategories = useMemo(() => {
    const counts = new Map()
    config.items.forEach((item) => {
      const slug = item.categorySlug || 'default'
      counts.set(slug, (counts.get(slug) || 0) + 1)
    })

    const seen = new Set()
    const list = []
    config.items.forEach((item) => {
      const slug = item.categorySlug || 'default'
      if (!seen.has(slug)) {
        seen.add(slug)
        list.push({
          slug,
          label: item.categoryNameZh || item.categoryName || slug,
          count: counts.get(slug) || 0,
        })
      }
    })

    return [
      { slug: 'all', label: '全部', count: config.items.length },
      ...list,
    ]
  }, [config])

  // 搜索与分类过滤后的列表
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return config.items.filter((item) => {
      if (selectedSubCategory !== 'all' && item.categorySlug !== selectedSubCategory) {
        return false
      }
      if (q) {
        const matchTitle = (item.title || '').toLowerCase().includes(q)
        const matchTitleZh = (item.titleZh || '').toLowerCase().includes(q)
        const matchDesc = (item.description || '').toLowerCase().includes(q)
        const matchCat = (item.categoryName || '').toLowerCase().includes(q)
        const matchCatZh = (item.categoryNameZh || '').toLowerCase().includes(q)
        return matchTitle || matchTitleZh || matchDesc || matchCat || matchCatZh
      }
      return true
    })
  }, [config, selectedSubCategory, searchQuery])

  if (!isOpen) return null

  const handleCardSelect = (item) => {
    if (tempSelected?.id === item.id) {
      // 再次点击反选
      setTempSelected(null)
    } else {
      setTempSelected(item)
    }
  }

  const handleApply = () => {
    store.setPreset(sessionId, dimension, tempSelected)
    onConfirm?.(tempSelected)
    onClose?.()
  }

  const handleClear = () => {
    setTempSelected(null)
  }

  const modalContent = (
    <div
      className="omnimux-dimension-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
    >
      <div className="omnimux-dimension-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 头部 Header */}
        <header className="omnimux-dimension-modal-header">
          <div className="omnimux-dimension-header-left">
            <span className="omnimux-dimension-header-icon" aria-hidden="true">
              {config.icon}
            </span>
            <div className="omnimux-dimension-header-titles">
              <h2 className="omnimux-dimension-header-title">{config.title}</h2>
              <span className="omnimux-dimension-header-badge">
                共 {config.items.length} 款
              </span>
            </div>
          </div>

          <div className="omnimux-dimension-header-right">
            {/* 搜索框 */}
            <div className="omnimux-dimension-search-wrap">
              <span className="omnimux-dimension-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="omnimux-dimension-search-input"
                placeholder={config.placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button /* exempt-ui01: 搜索输入框内部清除按钮 */
                  type="button"
                  className="omnimux-dimension-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="清空搜索"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 关闭按钮 */}
            <button /* exempt-ui01: 弹窗右上角独立关闭按钮 */
              type="button"
              className="omnimux-dimension-modal-close"
              onClick={onClose}
              aria-label="关闭弹窗"
            >
              ✕
            </button>
          </div>
        </header>

        {/* 分类 Tabs 导航 */}
        <nav className="omnimux-dimension-subcats-bar" role="tablist" aria-label="维度二级分类">
          {subCategories.map((sub) => (
            <button /* exempt-ui01: 弹窗二级分类胶囊Tab按钮 */
              key={sub.slug}
              type="button"
              role="tab"
              aria-selected={selectedSubCategory === sub.slug}
              className={`omnimux-dimension-subcat-chip ${
                selectedSubCategory === sub.slug ? 'is-active' : ''
              }`}
              onClick={() => setSelectedSubCategory(sub.slug)}
            >
              <span>{sub.label}</span>
              <span className="omnimux-dimension-subcat-count">{sub.count}</span>
            </button>
          ))}
        </nav>

        {/* 卡片选品网格 */}
        <div className="omnimux-dimension-grid-wrap">
          {filteredItems.length === 0 ? (
            <div className="omnimux-dimension-empty-state">
              <span className="omnimux-dimension-empty-icon">📂</span>
              <p className="omnimux-dimension-empty-text">未找到与“{searchQuery}”匹配的创意预设</p>
              <button /* exempt-ui01: 空态重置筛选纯文本按钮 */
                type="button"
                className="omnimux-dimension-empty-reset"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedSubCategory('all')
                }}
              >
                重置分类与搜索
              </button>
            </div>
          ) : (
            <div className="omnimux-dimension-grid" role="list">
              {filteredItems.map((item) => {
                const isSelected = tempSelected?.id === item.id
                return (
                  <div
                    key={item.id}
                    onDoubleClick={() => {
                      setTempSelected(item)
                      store.setPreset(sessionId, dimension, item)
                      onConfirm?.(item)
                      onClose?.()
                    }}
                  >
                    <PresetCard
                      item={item}
                      type={dimension}
                      isSelected={isSelected}
                      onSelect={handleCardSelect}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部操作与确认栏 */}
        <footer className="omnimux-dimension-modal-footer">
          <div className="omnimux-dimension-footer-info">
            {tempSelected ? (
              <div className="omnimux-dimension-footer-selected">
                <span className="omnimux-dimension-footer-dot" />
                <span className="omnimux-dimension-footer-label">已选择:</span>
                <strong className="omnimux-dimension-footer-name">
                  {tempSelected.titleZh || tempSelected.title}
                </strong>
                <button /* exempt-ui01: 当前选中微型清除按钮 */
                  type="button"
                  className="omnimux-dimension-footer-clear-btn"
                  onClick={handleClear}
                  title="清除当前选择"
                >
                  (清除)
                </button>
              </div>
            ) : (
              <span className="omnimux-dimension-footer-hint">
                💡 点击上方卡片进行选择，双击可直接应用
              </span>
            )}
          </div>

          <div className="omnimux-dimension-footer-btns">
            <Button
              variant="outline"
              size="md"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleApply}
            >
              确认选择
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}
