import React from 'react'
import { PRIMARY_TABS, ASSET_HUB_I18N_SPEC } from './asset-hub-store.js'

function FullscreenEnterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  )
}

function FullscreenExitIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M14 4v6m0 0h6m-6 0L21 3M10 10V4m0 6H4m0 0L3 3" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/**
 * 右栏顶栏（AssetHubHeader）
 * 高度 48px，包含一级 Tab 文本按钮与全屏/收起操作组
 */
export function AssetHubHeader({
  activeTab,
  isFullscreen,
  onTabChange,
  onToggleFullscreen,
  onCollapse,
}) {
  const fullscreenTitle = isFullscreen
    ? ASSET_HUB_I18N_SPEC.actions.exitFullscreen
    : ASSET_HUB_I18N_SPEC.actions.fullscreen
  const collapseTitle = ASSET_HUB_I18N_SPEC.actions.collapse

  return (
    <header className="omx-hub-header" role="toolbar" aria-label="素材工作台顶栏">
      {/* 一级选项卡 */}
      <div className="omx-hub-header__tabs" role="tablist" aria-label="一级分类">
        {PRIMARY_TABS.map((tabId) => {
          const label = ASSET_HUB_I18N_SPEC.primaryTabs[tabId]
          const isSelected = activeTab === tabId
          return (
            <button /* exempt-ui01: asset hub primary tab button */
              key={tabId}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`omx-hub-header__tab${isSelected ? ' is-active' : ''}`}
              onClick={() => onTabChange(tabId)}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* 右侧操作按钮组 */}
      <div className="omx-hub-header__actions">
        <button /* exempt-ui01: asset hub fullscreen button */
          type="button"
          className="omx-hub-header__btn"
          title={fullscreenTitle}
          aria-label={fullscreenTitle}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
        </button>
        <button /* exempt-ui01: asset hub collapse button */
          type="button"
          className="omx-hub-header__btn"
          title={collapseTitle}
          aria-label={collapseTitle}
          onClick={onCollapse}
        >
          <CollapseIcon />
        </button>
      </div>
    </header>
  )
}
