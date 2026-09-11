import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'dsh-ui-kit'
import { ModalCloseButton } from '../components/ModalCloseButton.jsx'
import { CREATIVE_HOOKS, CREATIVE_VISUAL_STYLES, CREATIVE_VIDEO_FORMATS } from './catalog.js'
import { PresetCard } from './PresetCard.jsx'
import { ensurePresetsStyles } from './styles.js'
import { getCreativePresetsStore } from './presets-store.js'
import { FormatIcon, HookIcon, StyleIcon } from './icons.jsx'

export const DIMENSION_CONFIG = {
  format: {
    key: 'format',
    label: '广告格式',
    modalTitle: '广告格式',
    modalTitleEn: 'Ad formats',
    heroTitle: '热门创意灵感，开箱即用',
    heroTitleEn: 'Trending ideas, ready to use',
    heroSubtitle: '探索当下热门爆款网感广告结构，为产品匹配最佳视听呈现',
    heroSubtitleEn: "Explore what's hot and find the perfect fit for your product and audience.",
    IconComponent: FormatIcon,
    items: CREATIVE_VIDEO_FORMATS,
    placeholder: '搜索广告格式...',
    placeholderEn: 'Search ad format',
  },
  hook: {
    key: 'hook',
    label: '开场亮点',
    modalTitle: '开场亮点',
    modalTitleEn: 'Attention hooks',
    heroTitle: '黄金前3秒钩子，吸睛留存',
    heroTitleEn: 'Hook ideas to stop the scroll',
    heroSubtitle: '运用经过实战验证的视听钩子策略，瞬间抓住用户眼球防止滑走',
    heroSubtitleEn: 'Capture attention in the first 3 seconds with proven visual and auditory hooks.',
    IconComponent: HookIcon,
    items: CREATIVE_HOOKS,
    placeholder: '搜索开场亮点...',
    placeholderEn: 'Search hook',
  },
  style: {
    key: 'style',
    label: '视觉风格',
    modalTitle: '视觉风格',
    modalTitleEn: 'Visual styles',
    heroTitle: '电影级光影美学与视听质感',
    heroTitleEn: 'Cinematic aesthetics & lighting',
    heroSubtitle: '为短视频设定统一的布光色调、机位质感与影视画面风格',
    heroSubtitleEn: 'Choose consistent lighting, color tones, and camera textures for your video.',
    IconComponent: StyleIcon,
    items: CREATIVE_VISUAL_STYLES,
    placeholder: '搜索视觉风格...',
    placeholderEn: 'Search style',
  },
}

/**
 * 营销视频三大创意维度独立弹窗组件 (1:1 像素级复刻图 2 原版布局)
 * 包含：极简大标题 + ModalCloseButton、沉浸式微光渐变 Hero 横幅、
 * 下划线 Tab 联动 + 胶囊搜索框同排、3:4 竖屏短视频纯净图文排版
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

  const isZh = useMemo(() => {
    if (typeof document !== 'undefined') {
      const lang = document.documentElement.lang || navigator.language || 'zh'
      return !lang.toLowerCase().startsWith('en')
    }
    return true
  }, [])

  const modalTitle = isZh ? (config.modalTitle || config.label) : (config.modalTitleEn || config.modalTitle)
  const heroTitle = isZh ? (config.heroTitle || config.heroTitleEn) : config.heroTitleEn
  const heroSubtitle = isZh ? (config.heroSubtitle || config.heroSubtitleEn) : config.heroSubtitleEn
  const searchPlaceholder = isZh ? (config.placeholder || config.placeholderEn) : config.placeholderEn

  const [selectedSubCategory, setSelectedSubCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [tempSelected, setTempSelected] = useState(null)
  const searchInputRef = useRef(null)
  const navTabsRef = useRef(null)

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
          label: item.categoryName || slug,
          labelZh: item.categoryNameZh || item.categoryName || slug,
          count: counts.get(slug) || 0,
        })
      }
    })

    return [
      { slug: 'all', label: 'All', labelZh: '全部', count: config.items.length },
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

  // 核心交互升级：单击一键选用，无需二次勾选在确认，即选即用即关闭
  const handleCardSelect = (item) => {
    setTempSelected(item)
    store.setPreset(sessionId, dimension, item)
    onConfirm?.(item)
    onClose?.()
  }

  const handleApply = () => {
    store.setPreset(sessionId, dimension, tempSelected)
    onConfirm?.(tempSelected)
    onClose?.()
  }

  const handleClear = () => {
    setTempSelected(null)
    store.removePreset(sessionId, dimension)
    onConfirm?.(null)
    onClose?.()
  }

  const handleScrollTabsRight = () => {
    if (navTabsRef.current) {
      navTabsRef.current.scrollBy({ left: 160, behavior: 'smooth' })
    }
  }

  const modalContent = (
    <div
      className="omnimux-dimension-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
    >
      <div className="omnimux-dimension-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 1. 顶部 Header：极简大标题 + 统一复用 ModalCloseButton */}
        <header className="omnimux-dimension-modal-header">
          <h2 className="omnimux-dimension-header-title">{modalTitle}</h2>
          <ModalCloseButton
            placement="inline"
            onClose={onClose}
            ariaLabel={isZh ? `关闭${modalTitle}` : `Close ${modalTitle}`}
          />
        </header>

        {/* 2. 沉浸式微光渐变 Hero 横幅 */}
        <div className="omnimux-dimension-hero-banner">
          <div className="omnimux-dimension-hero-text-wrap">
            <h3 className="omnimux-dimension-hero-heading">{heroTitle}</h3>
            <p className="omnimux-dimension-hero-subheading">{heroSubtitle}</p>
          </div>
          <div className="omnimux-dimension-hero-art" aria-hidden="true">
            <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="omnimux-dimension-hero-star">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
        </div>

        {/* 3. 分类 Tab 栏与胶囊搜索框同排并列 (1:1 对标图 2) */}
        <div className="omnimux-dimension-nav-bar">
          <div className="omnimux-dimension-tabs-row">
            <nav className="omnimux-dimension-underline-tabs" ref={navTabsRef} role="tablist" aria-label="维度分类">
              {subCategories.map((sub) => {
                const isActive = selectedSubCategory === sub.slug
                const tabLabel = isZh ? (sub.labelZh || sub.label) : sub.label
                return (
                  <button /* exempt-ui01: 极简下划线Tab按钮 */
                    key={sub.slug}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`omnimux-dimension-tab-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedSubCategory(sub.slug)}
                  >
                    <span>{tabLabel}</span>
                  </button>
                )
              })}
            </nav>

            <button /* exempt-ui01: Tab翻页右箭头圆钮 */
              type="button"
              className="omnimux-dimension-tab-scroll-btn"
              onClick={handleScrollTabsRight}
              aria-label={isZh ? '向右滚动分类' : 'Scroll categories'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* 胶囊搜索框 */}
          <div className="omnimux-dimension-capsule-search">
            <span className="omnimux-dimension-search-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="omnimux-dimension-capsule-input"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button /* exempt-ui01: 胶囊搜索框清除按钮 */
                type="button"
                className="omnimux-dimension-capsule-clear"
                onClick={() => setSearchQuery('')}
                aria-label={isZh ? '清除搜索' : 'Clear search'}
              >
                ✕ {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
              </button>
            )}
          </div>
        </div>

        {/* 4. 3:4 竖屏短视频手机比例卡片网格 (1:1 对标图 2) */}
        <div className="omnimux-dimension-grid-wrap">
          {filteredItems.length === 0 ? (
            <div className="omnimux-dimension-empty-state">
              <span className="omnimux-dimension-empty-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </span>
              <p className="omnimux-dimension-empty-text">
                {isZh
                  ? `未找到与 "${searchQuery}" 相关的${modalTitle}`
                  : `No ${modalTitle.toLowerCase()} found matching "${searchQuery}"`}
              </p>
              <button /* exempt-ui01: 空态重置纯文本按钮 */
                type="button"
                className="omnimux-dimension-empty-reset"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedSubCategory('all')
                }}
              >
                {isZh ? '重置筛选' : 'Reset filters'}
              </button>
            </div>
          ) : (
            <div className="omnimux-dimension-grid" role="list">
              {filteredItems.map((item) => {
                const isSelected = tempSelected?.id === item.id
                return (
                  <div
                    key={item.id}
                    onClick={() => handleCardSelect(item)}
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

        {/* 5. 底部操作栏：一键选择交互升级 */}
        <footer className="omnimux-dimension-modal-footer">
          <div className="omnimux-dimension-footer-info">
            {tempSelected ? (
              <div className="omnimux-dimension-footer-selected">
                <span className="omnimux-dimension-footer-dot" />
                <span className="omnimux-dimension-footer-label">{isZh ? '已选:' : 'Selected:'}</span>
                <strong className="omnimux-dimension-footer-name">
                  {itemTitle(tempSelected, isZh)}
                </strong>
                <button /* exempt-ui01: 当前选中清除按钮 */
                  type="button"
                  className="omnimux-dimension-footer-clear-btn"
                  onClick={handleClear}
                  title={isZh ? '清除选择并生效' : 'Clear selection'}
                >
                  {isZh ? '(清除)' : '(Clear)'}
                </button>
              </div>
            ) : (
              <span className="omnimux-dimension-footer-hint">
                {isZh ? '单击任意卡片一键选用' : 'Click any card to apply immediately'}
              </span>
            )}
          </div>

          <div className="omnimux-dimension-footer-btns">
            <Button
              variant="outline"
              size="md"
              onClick={onClose}
            >
              {isZh ? '关闭' : 'Close'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleApply}
            >
              {isZh ? '确认应用' : 'Apply'}
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

function itemTitle(item, isZh) {
  if (!item) return ''
  return isZh ? (item.titleZh || item.title) : item.title
}
