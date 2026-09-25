import React from 'react'
import { AssetHubCard } from './AssetHubCard.jsx'
import { ASSET_HUB_I18N_SPEC } from './asset-hub-store.js'

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

/**
 * 高密度素材网格与状态机渲染（AssetHubGrid）
 */
export function AssetHubGrid({
  activeTab,
  items = [],
  attachedIds = new Set(),
  loading = false,
  error = null,
  isSearching = false,
  onAttach,
  onRetry,
  onClearSearch,
  onPrimaryAction,
}) {
  // 1. 全局加载中：骨架卡片波纹占位
  if (loading) {
    return (
      <div className="omx-hub-grid omx-hub-grid--skeleton" aria-busy="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="omx-hub-skeleton-card">
            <div className="omx-hub-skeleton-cover" />
            <div className="omx-hub-skeleton-line" />
            <div className="omx-hub-skeleton-sub" />
          </div>
        ))}
      </div>
    )
  }

  // 2. 网络错误状态
  if (error) {
    return (
      <div className="omx-hub-state" role="alert">
        <p className="omx-hub-state__msg">{ASSET_HUB_I18N_SPEC.empty.error}</p>
        <button /* exempt-ui01: asset hub retry button */
          type="button"
          className="omx-hub-state__btn"
          onClick={onRetry}
        >
          <RefreshIcon />
          <span>{ASSET_HUB_I18N_SPEC.actions.retry}</span>
        </button>
      </div>
    )
  }

  // 3. 搜索无结果
  if (isSearching && items.length === 0) {
    return (
      <div className="omx-hub-state">
        <p className="omx-hub-state__msg">{ASSET_HUB_I18N_SPEC.empty.search}</p>
        <button /* exempt-ui01: asset hub clear search button */
          type="button"
          className="omx-hub-state__btn"
          onClick={onClearSearch}
        >
          <span>{ASSET_HUB_I18N_SPEC.actions.clearSearch}</span>
        </button>
      </div>
    )
  }

  // 4. 空态
  if (items.length === 0) {
    let emptyText = ASSET_HUB_I18N_SPEC.empty[activeTab] || '暂无素材'
    let actionBtnLabel = ''

    if (activeTab === 'assets') {
      emptyText = ASSET_HUB_I18N_SPEC.empty.assets
      actionBtnLabel = ASSET_HUB_I18N_SPEC.actions.upload
    } else if (activeTab === 'inspiration') {
      emptyText = ASSET_HUB_I18N_SPEC.empty.inspiration
    } else if (activeTab === 'products') {
      emptyText = ASSET_HUB_I18N_SPEC.empty.products
      actionBtnLabel = ASSET_HUB_I18N_SPEC.actions.addProduct
    }

    return (
      <div className="omx-hub-state">
        <p className="omx-hub-state__msg">{emptyText}</p>
        {actionBtnLabel && (
          <button /* exempt-ui01: asset hub empty action button */
            type="button"
            className="omx-hub-state__btn"
            onClick={onPrimaryAction}
          >
            <span>{actionBtnLabel}</span>
          </button>
        )}
      </div>
    )
  }

  // 5. 卡片网格瀑布流
  return (
    <div className="omx-hub-grid" role="region" aria-label="素材卡片网格">
      {items.map((item) => (
        <AssetHubCard
          key={`${item.lane}:${item.id}`}
          item={item}
          isSelected={attachedIds.has(item.id)}
          onAttach={onAttach}
        />
      ))}
    </div>
  )
}
