import React, { useState } from 'react'
import {
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  selectShelfItems,
} from './templates-data.js'
import { TemplatesShelfRow } from './TemplatesShelfRow.jsx'
import { TemplatesGridView } from './TemplatesGridView.jsx'
import { TemplateDetailDrawer } from './TemplateDetailDrawer.jsx'

/**
 * 探索模板 (Explore templates) 核心板块总成
 * @param {object} props
 * @param {(payload: object) => void} props.onApplyTemplate
 */
export function ExploreTemplatesSection({ onApplyTemplate }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [activeDrawerTemplate, setActiveDrawerTemplate] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const handleOpenDetail = (template) => {
    setActiveDrawerTemplate(template)
    setIsDrawerOpen(true)
  }

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false)
    setActiveDrawerTemplate(null)
  }

  const handleSelectTemplate = (template) => {
    if (onApplyTemplate) {
      onApplyTemplate({
        template,
        prompt: template.prompt,
        title: template.title,
        titleEn: template.titleEn,
        slotType: template.slotType || (template.categorySlug === 'apps-software' ? 'software' : 'product'),
        slotGuide: template.slotGuide,
      })
    }
  }

  const handleViewAllFromShelf = (targetCat) => {
    setSelectedCategory(targetCat)
  }

  const handleBackToAll = () => {
    setSelectedCategory('all')
  }

  const currentCategoryObj = TEMPLATE_CATEGORIES.find((c) => c.slug === selectedCategory) || TEMPLATE_CATEGORIES[0]
  const gridTemplates = selectTemplatesByCategory(selectedCategory)

  return (
    <div className="omnimux-explore-templates-root">
      {/* 7 大分类筛选胶囊栏 */}
      <div className="omnimux-explore-filter-bar">
        <div className="omnimux-explore-pills-row" role="tablist" aria-label="创意模板分类列表">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.slug
            return (
              <button /* exempt-ui01: category filter tab button */
                key={cat.slug}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`omnimux-explore-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.slug)}
                data-category-slug={cat.slug}
              >
                <span>{cat.nameZh}</span>
                {cat.badge && <span className="omnimux-explore-badge-new">{cat.badge}</span>}
                <span className="omnimux-explore-pill-en">({cat.nameEn})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 双模态视图切换 */}
      {selectedCategory === 'all' ? (
        <div className="omnimux-explore-shelves-view">
          {SHELVES_CONFIG.map((shelf) => {
            const shelfItems = selectShelfItems(shelf.slug, 8)
            return (
              <TemplatesShelfRow
                key={shelf.slug}
                shelf={shelf}
                items={shelfItems}
                onSelectTemplate={handleSelectTemplate}
                onOpenDetail={handleOpenDetail}
                onViewAll={handleViewAllFromShelf}
              />
            )
          })}
        </div>
      ) : (
        <div className="omnimux-explore-grid-view-wrap">
          <TemplatesGridView
            category={currentCategoryObj}
            items={gridTemplates}
            onBackToAll={handleBackToAll}
            onSelectTemplate={handleSelectTemplate}
            onOpenDetail={handleOpenDetail}
          />
        </div>
      )}

      {/* 模版分镜与结构拆解抽屉 */}
      <TemplateDetailDrawer
        isOpen={isDrawerOpen}
        template={activeDrawerTemplate}
        onClose={handleCloseDrawer}
        onApply={handleSelectTemplate}
      />
    </div>
  )
}
