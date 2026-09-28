import React, { useEffect, useMemo, useRef } from 'react'
import { distributeColumns } from './masonry-layout.js'
import { useFlowColumns } from './useFlowColumns.js'
import { UniversalLibraryCard } from './UniversalLibraryCard.jsx'

export const LIBRARY_FLOW_CSS = `
.omx-library-flow-root {
  width: 100%;
  box-sizing: border-box;
}
.omx-library-flow-grid {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}
.omx-library-flow-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.omx-library-flow-cell {
  min-width: 0;
  width: 100%;
}
.omx-library-flow-status {
  margin: 40px auto 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 120px;
}
.omx-library-flow-retry {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.omx-library-flow-retry:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.omx-library-flow-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}
.omx-library-flow-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0 16px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  box-sizing: border-box;
}
.omx-library-flow-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-label-secondary);
  border-radius: 50%;
  animation: omx-spin 0.8s linear infinite;
  box-sizing: border-box;
}
@keyframes omx-spin {
  to { transform: rotate(360deg); }
}
`

const STYLE_ID = 'omx-library-flow-styles'

export function ensureLibraryFlowStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = LIBRARY_FLOW_CSS
  doc.head?.appendChild(style)
}

/**
 * 通用素材流瀑布流网格组件 (UnifiedLibraryGrid)
 *
 * 核心架构：
 * 1. 双端 100% 复用：全面服务新会话探索流、素材挑选弹窗与右侧侧边栏工作台；
 * 2. 贪心高度分列：基于 distributeColumns 将素材均匀分配进最短列，消灭纵向大空洞；
 * 3. 响应式感知：基于 useFlowColumns 动态感知容器视口变化并自适应更新列数；
 * 4. 统一状态机与状态正交解耦：支持首屏加载、无限滚动 Sentinel、局部追加加载与局部错误重试。
 */
export function UnifiedLibraryGrid({
  items = [],
  loading = false,
  loadingMore = false,
  hasMore = false,
  error = null,
  loadMoreError = null,
  emptyText = '暂无素材',
  emptyAction = null,
  t,
  attachedIds,
  selectedId,
  onPick,
  onAttach,
  onLoadMore,
  onRetry,
  onRetryLoadMore,
  renderItem,
  options,
  className = '',
  gridClassName = '',
}) {
  useEffect(() => {
    ensureLibraryFlowStyles()
  }, [])

  const [containerRef, columns] = useFlowColumns(options)

  const buckets = useMemo(() => {
    return distributeColumns(items, columns)
  }, [items, columns])

  const sentinelRef = useRef(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first && first.isIntersecting) {
          if (!loading && !loadingMore && !error && !loadMoreError) {
            onLoadMoreRef.current?.()
          }
        }
      },
      { rootMargin: '200px 0px' }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [hasMore, loading, loadingMore, error, loadMoreError])

  // 1. 首屏加载中状态（items 为空）
  if (items.length === 0 && loading) {
    return (
      <div className={`omx-library-flow-root ${className}`.trim()}>
        <div className="omx-library-flow-status omnimux-library-stage-status">
          <div className="omx-library-flow-spinner" aria-hidden="true" />
          <span>加载中…</span>
        </div>
      </div>
    )
  }

  // 2. 首屏错误重试状态（items 为空）
  if (items.length === 0 && error) {
    const errorMsg = typeof error === 'string' ? error : error?.message || '加载失败'
    return (
      <div className={`omx-library-flow-root ${className}`.trim()}>
        <div className="omx-library-flow-status omnimux-library-stage-status">
          <p>{errorMsg}</p>
          {onRetry && (
            <button
              type="button"
              className="omx-library-flow-retry omnimux-library-stage-retry"
              onClick={onRetry}
            >
              重试
            </button>
          )}
        </div>
      </div>
    )
  }

  // 3. 空数据状态（items 为空且非 loading / error）
  if (!items || items.length === 0) {
    return (
      <div className={`omx-library-flow-root ${className}`.trim()}>
        <div className="omx-library-flow-status omnimux-library-stage-status">
          <p>{emptyText}</p>
          {emptyAction}
        </div>
      </div>
    )
  }

  // 4. 瀑布流内容渲染（items > 0）
  const activeAppendError = loadMoreError || (items.length > 0 && error ? error : null)

  return (
    <div
      ref={containerRef}
      className={`omx-library-flow-root ${className}`.trim()}
      data-flow-container=""
    >
      <div
        className={`omx-library-flow-grid omnimux-library-stage-flow ${gridClassName}`.trim()}
        data-columns={columns}
        role="region"
        aria-label="素材瀑布流网格"
      >
        {buckets.map((columnItems, colIndex) => (
          <div
            key={colIndex}
            className="omx-library-flow-col"
            data-col={colIndex}
          >
            {columnItems.map((item, itemIndex) => {
              const isSelected = Boolean(
                (attachedIds && (attachedIds.has?.(item.id) || attachedIds.includes?.(item.id))) ||
                (selectedId && selectedId === item.id)
              )

              return (
                <div
                  key={`${item.lane || 'lane'}:${item.id || itemIndex}`}
                  className="omx-library-flow-cell omnimux-library-stage-cell"
                  data-library-lane={item.lane}
                >
                  {renderItem ? (
                    renderItem(item, isSelected)
                  ) : (
                    <UniversalLibraryCard
                      card={item}
                      t={t}
                      isSelected={isSelected}
                      onPick={onPick}
                      onAttach={onAttach}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* 触底探针与底部状态条 */}
      <div ref={sentinelRef} data-sentinel="" className="omx-library-flow-sentinel" />

      {loadingMore && (
        <div className="omx-library-flow-footer" data-flow-loading-more="">
          <div className="omx-library-flow-spinner" aria-hidden="true" />
          <span>加载中…</span>
        </div>
      )}

      {activeAppendError && (
        <div className="omx-library-flow-footer" data-flow-append-error="">
          <span>加载失败</span>
          {(onRetryLoadMore || onRetry) && (
            <button
              type="button"
              className="omx-library-flow-retry"
              onClick={onRetryLoadMore || onRetry}
            >
              重试
            </button>
          )}
        </div>
      )}

      {!hasMore && !loadingMore && !activeAppendError && (
        <div className="omx-library-flow-footer" data-flow-no-more="">
          <span>已无更多</span>
        </div>
      )}
    </div>
  )
}
