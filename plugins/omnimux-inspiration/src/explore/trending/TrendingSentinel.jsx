import React from 'react'

/**
 * 无限滚动的底部观察哨兵（Sentinel）。
 *
 * 只负责「报告自己已经进入视口」，取数与状态机在 `use-trending-feed.js` 里。
 * 元素始终留在 DOM 里——被卸载的话观察器就再也看不到它，加载也就停了。
 *
 * 三种非空闲呈现：加载中给骨架、取完给温和的末尾提示、取数失败给失败说明与重试入口。
 * 失败时重试走 `onRetry`（状态机的重试通道，绕开 `hasMore` 守卫），
 * 不走「继续下滑」那条自动通道——失败留下的 `hasMore` 不是「还能追加」的依据。
 *
 * @param {{
 *   sentinelRef: React.RefObject<HTMLElement>,
 *   loading: boolean,
 *   exhausted: boolean,
 *   failed?: boolean,
 *   onRetry?: () => void,
 *   t: (key: string, fallback?: string) => string,
 * }} props
 */
export function TrendingSentinel({ sentinelRef, loading, exhausted, failed = false, onRetry, t }) {
  const state = exhausted ? 'exhausted' : (failed ? 'error' : (loading ? 'loading' : 'idle'))
  const label = exhausted
    ? t('trending.feed.end', '已加载全部对标视频')
    : (failed
      ? t('trending.feed.failed', '更多对标视频没加载出来')
      : (loading ? t('trending.feed.loading', '正在加载更多对标视频…') : t('trending.feed.hint', '继续下滑加载更多')))

  return (
    <div
      ref={sentinelRef}
      className="omnimux-trending-sentinel"
      data-omnimux-trending-sentinel=""
      data-omnimux-trending-feed={state}
      role="status"
      aria-live="polite"
      aria-busy={loading ? 'true' : 'false'}
      aria-label={label}
    >
      {exhausted ? (
        <p className="omnimux-trending-feed-end">{t('trending.feed.end', '已加载全部对标视频')}</p>
      ) : null}

      {!exhausted && failed ? (
        <>
          <p className="omnimux-trending-feed-failed">{t('trending.feed.failed', '更多对标视频没加载出来')}</p>
          {/* 已经上屏的卡片一张都不动，只把「这一批没拿到」和重试入口放在列表末尾 */}
          <button /* exempt-ui01: 重试属于轻量文本动作，非标准控件位 */
            type="button"
            className="omnimux-trending-reset"
            data-omnimux-trending-retry=""
            onClick={onRetry}
          >
            {t('trending.retry', '重试')}
          </button>
        </>
      ) : null}

      {!exhausted && !failed ? (
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
      ) : null}
    </div>
  )
}
