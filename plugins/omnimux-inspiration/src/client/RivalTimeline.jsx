/**
 * 账号监控右栏：所选账号的帖子时间线（#3432）。
 *
 * One column, newest first, one row per post. The list owns only ordering and
 * the append sentinel; the row component owns the platform-like card content.
 */

import { useEffect, useRef } from 'react'
import { sortTimelineRows } from './rival-timeline.js'
import { RivalTimelineRow } from './RivalTimelineRow.jsx'

/**
 * @param {{
 *   cards: Array<Record<string, any>>,
 *   t: (key: string) => string,
 *   busyId?: string | null,
 *   hasMore?: boolean,
 *   loadingMore?: boolean,
 *   canLoadMore?: boolean,
 *   onLoadMore?: () => void,
 *   onDetail?: (card: Record<string, any>) => void,
 *   onReplicate?: (card: Record<string, any>) => void,
 *   onDeconstruct?: (card: Record<string, any>) => void,
 *   onMarkDone?: (card: Record<string, any>) => void,
 * }} props
 */
export function RivalTimeline(props) {
  const {
    cards, t, busyId, hasMore = false, loadingMore = false, canLoadMore, onLoadMore,
    onDetail, onReplicate, onDeconstruct, onMarkDone,
  } = props
  const sentinelRef = useRef(null)
  const rows = sortTimelineRows(cards)

  // The sentinel must only fetch while the previous page is idle. Without the
  // idle gate a failed append page (hasMore stays true, page unchanged) would
  // re-arm the observer on every loadingMore flip and retry until the hook's
  // request budget runs out (#3432 review P1). Loading once per idle window is
  // also what keeps an intersection from firing twice for one page.
  const idle = canLoadMore === undefined
    ? hasMore && !loadingMore && typeof onLoadMore === 'function'
    : canLoadMore
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !idle || typeof onLoadMore !== 'function') return undefined
    if (typeof IntersectionObserver !== 'function') return undefined
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      onLoadMore()
    }, { rootMargin: '240px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [idle, onLoadMore, rows.length])

  return (
    <div
      className="omnimux-rival-timeline"
      data-rival-timeline="true"
      role="feed"
      aria-label={t('tab.rivals')}
      aria-busy={loadingMore ? 'true' : 'false'}
    >
      {rows.map((card) => (
        <RivalTimelineRow
          key={String(card?.id ?? '')}
          card={card}
          t={t}
          busy={busyId === String(card?.id ?? '')}
          onDetail={onDetail}
          onReplicate={onReplicate}
          onDeconstruct={onDeconstruct}
          onMarkDone={onMarkDone}
        />
      ))}
      {loadingMore ? (
        <div className="omnimux-rival-timeline-loadmore" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div className="omnimux-rival-timeline-skel" key={index} />
          ))}
        </div>
      ) : null}
      {idle ? (
        <div className="omnimux-rival-timeline-sentinel" ref={sentinelRef} aria-hidden="true" />
      ) : null}
    </div>
  )
}
