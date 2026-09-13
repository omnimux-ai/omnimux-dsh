import React from 'react';

/**
 * 单层顶栏 Tab 组件（Tab-as-Header 架构）
 * @param {{
 *   tabs: Array<{ id: string, label: string }>,
 *   activeTab: string,
 *   onTabChange: (id: string) => void,
 *   ariaLabel?: string,
 *   className?: string,
 *   tabClassName?: string,
 *   headerClassName?: string,
 *   extra?: React.ReactNode,
 * }} props
 */
export function PickerHeaderTabs({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  className = 'omx-picker-tabs',
  tabClassName = 'omx-picker-tab',
  headerClassName = 'omx-picker-header',
  extra,
}) {
  return (
    <div className={headerClassName}>
      <div className={className} role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button /* exempt-ui01: 选择器顶栏分类切换 tab */
              key={tab.id}
              type="button"
              role="tab"
              className={tabClassName}
              data-active={isActive ? 'true' : 'false'}
              aria-selected={isActive ? 'true' : 'false'}
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {extra}
    </div>
  );
}
