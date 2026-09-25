import React from 'react'
import { ASSET_HUB_I18N_SPEC } from './asset-hub-store.js'
import { SharedPrimaryTabs } from '../shared/asset-hub-tabs/SharedPrimaryTabs.jsx'
import {
  FullscreenEnterIcon,
  FullscreenExitIcon,
  CollapseIcon,
} from '../shared/asset-hub-tabs/SharedTabIcons.jsx'

/**
 * 右栏顶栏（AssetHubHeader）
 * 高度 48px，消费 SharedPrimaryTabs 呈现 6 大主库，右侧包含全屏与收起操作组
 * 严格遵循 specs/asset-hub-shared-tabs.spec.md 与 design.md 规范
 */
export function AssetHubHeader({
  activeTab,
  isFullscreen,
  onTabChange,
  onToggleFullscreen,
  onCollapse,
  isEn = false,
}) {
  const fullscreenTitle = isFullscreen
    ? (isEn ? ASSET_HUB_I18N_SPEC.actionsEn.exitFullscreen : ASSET_HUB_I18N_SPEC.actions.exitFullscreen)
    : (isEn ? ASSET_HUB_I18N_SPEC.actionsEn.fullscreen : ASSET_HUB_I18N_SPEC.actions.fullscreen)
  const collapseTitle = isEn ? ASSET_HUB_I18N_SPEC.actionsEn.collapse : ASSET_HUB_I18N_SPEC.actions.collapse

  return (
    <header className="omx-hub-header" role="toolbar" aria-label="素材工作台顶栏">
      {/* 共享一级选项卡（6 大主库） */}
      <div className="omx-hub-header__tabs">
        <SharedPrimaryTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          isEn={isEn}
          variant="compact"
        />
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
