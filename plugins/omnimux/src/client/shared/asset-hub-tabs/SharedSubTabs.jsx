import React from 'react'
import { getSubCategoriesForTab } from './shared-tabs-catalog.js'

/**
 * 共享二级分类选项卡组件（SharedSubTabs）
 * 支持 variant="underline"（新会话全屏下划线）与 variant="pill"（右栏工具栏紧凑胶囊）
 * 严格遵循 Spec 5.2 节：首项绝对固定展示为「全部」（英文为「All」），杜绝任何叠词
 */
export function SharedSubTabs({
  activeTab,
  currentFilter,
  onFilterChange,
  isEn = false,
  variant = 'pill',
  className = '',
}) {
  const categories = getSubCategoriesForTab(activeTab)

  if (!categories || categories.length === 0) {
    return null
  }

  const containerClass = [
    'omx-shared-sub-tabs',
    `omx-shared-sub-tabs--${variant}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={containerClass} role="group" aria-label="二级细分分类">
      {categories.map((cat) => {
        const label = isEn ? cat.nameEn : cat.nameZh
        // 双向兼容：currentFilter 可能是 ID（'all'）也可能是中文（'全部'）
        const isSelected =
          currentFilter === cat.id ||
          currentFilter === cat.nameZh ||
          currentFilter === cat.nameEn ||
          ((currentFilter === 'all' || currentFilter === '全部') && (cat.id === 'all' || cat.nameZh === '全部'))

        const btnClass = [
          'omx-shared-sub-tab',
          `omx-shared-sub-tab--${variant}`,
          isSelected ? 'is-active' : '',
        ].filter(Boolean).join(' ')

        return (
          <button /* exempt-ui01: shared sub tab button */
            key={cat.id}
            type="button"
            className={btnClass}
            aria-pressed={isSelected}
            onClick={() => {
              // 兼容回调：如果原始 currentFilter 传的是中文，优先触发中文以保障现有代码平滑兼容
              const isChineseCaller = typeof currentFilter === 'string' && /[\u4e00-\u9fa5]/.test(currentFilter)
              onFilterChange?.(isChineseCaller ? cat.nameZh : cat.id)
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
