import React from 'react'

/**
 * 无限滚动的底部观察哨兵（Sentinel）。
 *
 * 只负责「报告自己已经进入视口」，取数与状态机在 `use-trending-feed.js` 里。
 * 元素始终留在 DOM 里——被卸载的话观察器就再也看不到它，加载也就停了。
 *
 * @param {{
 *   sentinelRef: React.RefObject<HTMLElement>,
 *   loading: boolean,
 *   exhausted: boolean,
 *   t: (key: string, fallback?: string) => string,
 * }} props
 */
export function TrendingSentinel({ sentinelRef, loading, exhausted, t }) {
  const label = exhausted
    ? t('trending.feed.end', '已加载全部对标视频')
    : (loading ? t('trending.feed.loading', '正在加载更多对标视频…') : t('trending.feed.hint', '继续下滑加载更多'))

  return (
    <div
      ref={sentinelRef}
      className="omnimux-trending-sentinel"
      data-omnimux-trending-sentinel=""
      data-omnimux-trending-feed={exhausted ? 'exhausted' : (loading ? 'loading' : 'idle')}
      role="status"
      aria-live="polite"
      aria-busy={loading ? 'true' : 'false'}
      aria-label={label}
    >
      {exhausted ? (
        <p className="omnimux-trending-feed-end">{t('trending.feed.end', '已加载全部对标视频')}</p>
      ) : (
        <>
          {loading ? (
            <div className="omnimux-trending-feed-skeleton" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="omnimux-trending-feed-skeleton-card">
                  <div className="omnimux-trending-feed-shimmer" />
                </div>
              ))}
            </div>
          ) : null}
          <p className="omnimux-trending-feed-hint">
            {loading
              ? t('trending.feed.loading', '正在加载更多对标视频…')
              : t('trending.feed.hint', '继续下滑加载更多')}
          </p>
        </>
      )}
    </div>
  )
}
