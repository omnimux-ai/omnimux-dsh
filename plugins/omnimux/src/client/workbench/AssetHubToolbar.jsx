import React from 'react'
import { ASSET_HUB_I18N_SPEC } from './asset-hub-store.js'
import { SharedSubTabs } from '../shared/asset-hub-tabs/SharedSubTabs.jsx'
import { SearchIcon, UploadIcon, PlusIcon } from '../shared/asset-hub-tabs/SharedTabIcons.jsx'

/**
 * 筛选栏（AssetHubToolbar）
 * 高度 40px，单行不折行：搜索框 + 共享二级筛选胶囊标签 + 上下文操作按钮（白名单控制）
 * 严格遵循 specs/asset-hub-shared-tabs.spec.md 与 design.md 规范
 */
export function AssetHubToolbar({
  activeTab,
  currentFilter,
  searchQuery,
  onFilterChange,
  onSearchChange,
  onActionClick,
  isEn = false,
}) {
  // 上下文操作按钮严格按白名单仅在 assets 与 products 下展示
  const showActionButton = activeTab === 'assets' || activeTab === 'products'
  const actionLabel = activeTab === 'products'
    ? (isEn ? ASSET_HUB_I18N_SPEC.actionsEn.addProduct : ASSET_HUB_I18N_SPEC.actions.addProduct)
    : (isEn ? ASSET_HUB_I18N_SPEC.actionsEn.upload : ASSET_HUB_I18N_SPEC.actions.upload)

  const searchPlaceholder = isEn
    ? ASSET_HUB_I18N_SPEC.searchPlaceholderEn
    : ASSET_HUB_I18N_SPEC.searchPlaceholder

  return (
    <div className="omx-hub-toolbar" role="search" aria-label="素材筛选工具栏">
      {/* 搜索框 */}
      <div className="omx-hub-toolbar__search">
        <SearchIcon />
        <input
          type="text"
          className="omx-hub-toolbar__input"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={searchPlaceholder}
        />
      </div>

      {/* 共享二级筛选胶囊流（首项严格展示为「全部」） */}
      <div className="omx-hub-toolbar__filters">
        <SharedSubTabs
          activeTab={activeTab}
          currentFilter={currentFilter}
          onFilterChange={onFilterChange}
          isEn={isEn}
          variant="pill"
        />
      </div>

      {/* 上下文操作按钮（仅在 assets 与 products 展示） */}
      {showActionButton && (
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
