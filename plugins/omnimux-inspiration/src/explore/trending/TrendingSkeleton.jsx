import React from 'react'

/**
 * 爆款对标视频加载骨架屏（Apple / Google 现代极简微光卡片矩阵）。
 *
 * 1:1 复刻真实 9:16 卡片网格几何，消除累积布局位移（CLS=0），
 * 并提供平滑微光渐变扫描动画与淡出过渡。
 *
 * @param {{
 *   count?: number,
 *   t?: (key: string, fallback?: string) => string,
 * }} props
 */
export function TrendingSkeletonGrid({ count = 8, t }) {
  const cards = Array.from({ length: count }, (_, i) => i)
  const loadingLabel = t ? t('trending.loading') : '正在加载…'

  return (
    <div
      className="omnimux-trending-grid omnimux-trending-skeleton-grid"
      role="status"
      aria-label={loadingLabel}
      data-omnimux-skeleton=""
    >
      {cards.map((index) => (
        <div key={index} className="omnimux-trending-skeleton-card" aria-hidden="true">
          <div className="omnimux-trending-skeleton-shimmer" />
          <div className="omnimux-trending-skeleton-top">
            <span className="omnimux-trending-skeleton-badge" />
          </div>
          <div className="omnimux-trending-skeleton-body">
            <div className="omnimux-trending-skeleton-metrics">
              <div className="omnimux-trending-skeleton-metric-box">
                <span className="omnimux-trending-skeleton-metric-val" />
                <span className="omnimux-trending-skeleton-metric-lbl" />
              </div>
              <div className="omnimux-trending-skeleton-metric-box is-divider">
                <span className="omnimux-trending-skeleton-metric-val" />
                <span className="omnimux-trending-skeleton-metric-lbl" />
              </div>
            </div>
            <div className="omnimux-trending-skeleton-title-lines">
              <span className="omnimux-trending-skeleton-title-line is-long" />
              <span className="omnimux-trending-skeleton-title-line is-short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
