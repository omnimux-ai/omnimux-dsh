import React from 'react'
import {
  SECONDARY_FILTER_WHITELIST,
  ASSET_HUB_I18N_SPEC,
} from './asset-hub-store.js'

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/**
 * 筛选栏（AssetHubToolbar）
 * 高度 40px，单行不折行：搜索框 + 二级筛选胶囊标签 + 上下文操作按钮
 */
export function AssetHubToolbar({
  activeTab,
  currentFilter,
  searchQuery,
  onFilterChange,
  onSearchChange,
  onActionClick,
}) {
  const filterPills = SECONDARY_FILTER_WHITELIST[activeTab] || []

  // 上下文操作按钮文案
  const actionLabel = activeTab === 'products'
    ? ASSET_HUB_I18N_SPEC.actions.addProduct
    : ASSET_HUB_I18N_SPEC.actions.upload

  return (
    <div className="omx-hub-toolbar" role="search" aria-label="素材筛选工具栏">
      {/* 搜索框 */}
      <div className="omx-hub-toolbar__search">
        <SearchIcon />
        <input
          type="text"
          className="omx-hub-toolbar__input"
          placeholder={ASSET_HUB_I18N_SPEC.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={ASSET_HUB_I18N_SPEC.searchPlaceholder}
        />
      </div>

      {/* 二级筛选胶囊流 */}
      {filterPills.length > 0 && (
        <div className="omx-hub-toolbar__filters" role="group" aria-label="二级筛选">
          {filterPills.map((pill) => {
            const isSelected = currentFilter === pill
            return (
              <button /* exempt-ui01: asset hub secondary filter pill */
                key={pill}
                type="button"
                className={`omx-hub-toolbar__pill${isSelected ? ' is-active' : ''}`}
                onClick={() => onFilterChange(pill)}
                aria-pressed={isSelected}
              >
                {pill}
              </button>
            )
          })}
        </div>
      )}

      {/* 上下文操作按钮 */}
      {activeTab !== 'canvas' && (
        <button /* exempt-ui01: asset hub context primary action */
          type="button"
          className="omx-hub-toolbar__action"
          onClick={onActionClick}
        >
          {activeTab === 'products' ? <PlusIcon /> : <UploadIcon />}
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  )
}
