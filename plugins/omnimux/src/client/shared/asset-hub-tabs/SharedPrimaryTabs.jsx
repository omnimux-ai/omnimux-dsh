import React from 'react'
import { SHARED_PRIMARY_TABS, getPrimaryTabTitle } from './shared-tabs-catalog.js'
import { SharedTabIcon } from './SharedTabIcons.jsx'

/**
 * 共享一级 Tab 切换栏组件（SharedPrimaryTabs）
 * 支持 compact（右栏工作台，32px 控件高度基准）与 standard（新会话全屏）变体
 * 遵循 design.md 32px 控件高度、8px 圆角与 WCAG AA 规范
 */
export function SharedPrimaryTabs({
  activeTab,
  onTabChange,
  isEn = false,
  className = '',
  tabClassName = '',
  showIcon = true,
  variant = 'compact',
}) {
  const containerClass = [
    'omx-shared-primary-tabs',
    `omx-shared-primary-tabs--${variant}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={containerClass} role="tablist" aria-label="创作素材库主导航">
      {SHARED_PRIMARY_TABS.map((tab) => {
        const isSelected = activeTab === tab.id
        const label = getPrimaryTabTitle(tab.id, isEn)
        const btnClass = [
          'omx-shared-primary-tab',
          `omx-shared-primary-tab--${variant}`,
          isSelected ? 'is-active' : '',
          tabClassName,
        ].filter(Boolean).join(' ')

        return (
          <button /* exempt-ui01: shared primary tab button */
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={btnClass}
            onClick={() => onTabChange?.(tab.id)}
          >
            {showIcon && tab.iconName && (
              <span className="omx-shared-primary-tab__icon" aria-hidden="true">
                <SharedTabIcon name={tab.iconName} size={15} />
              </span>
            )}
            <span className="omx-shared-primary-tab__label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
