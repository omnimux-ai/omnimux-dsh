/**
 * The 账号监控 content area: a masonry of monitored accounts' works.
 *
 * v2.1 (Issue #3110) replaces the shared library grid with the monitor's own
 * masonry + card pair — a deliberate fork（方案 A）:
 *   - `RivalMasonry` places cards into the shortest column while keeping the
 *     DOM flat (sort order = tab order = rank, spec §9.3/V4);
 *   - `RivalPostCard` renders the five content-type shapes, the minimal default
 *     state and the processed retreat (§9.1/§9.2), none of which the shared
 *     library card can express.
 * `InspirationCoverCard` is untouched; the library keeps its own card.
 *
 * Empty states and the first-paint skeleton stay exactly as they were: the
 * library's shimmer is the honest "collecting" affordance, and a tab switch
 * does not change how loading looks.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, EmptyState } from 'dsh-ui-kit'
import { RivalMasonry } from './RivalMasonry.jsx'
import { EMPTY_ICON_SEARCH, EMPTY_ICON_USER, EMPTY_ICON_WORKS } from './icons.jsx'

/** Blocks a first paint or a page append shows while it has nothing to show. */
const SKELETON_COUNT = 10

/**
 * @param {{
 *   t: (key: string) => string,
 *   cards: Array<Record<string, any>>,
 *   loading: boolean,
 *   loadingMore: boolean,
 *   emptyKind: 'no-accounts' | 'no-posts' | 'filtered' | 'loading',
 *   onResetFilters: () => void,
 *   onImport: () => void,
 *   onDetail: (row: Record<string, any>) => void,
 *   onReplicate: (row: Record<string, any>) => void,
 *   onMarkDone?: (row: Record<string, any>) => void,
 *   onDeconstruct?: (row: Record<string, any>) => void,
 *   replicateBusy: string | null,
 * }} props
 */
export function RivalFeedGrid(props) {
  const {
    t, cards, loading, loadingMore, emptyKind, onResetFilters, onImport,
    onDetail, onReplicate, onMarkDone, onDeconstruct, replicateBusy,
  } = props

  // 本地已处理集合：点「标为已处理」先就地退位（不请求、不重排），持久化由
  // #3114 的端点接线后接管同一个 onMarkDone 回调。
  const [doneIds, setDoneIds] = useState(() => new Set())
  const handleMarkDone = useCallback((card) => {
    const id = String(card?.id ?? '')
    if (!id) return
    setDoneIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
    if (typeof onMarkDone === 'function') onMarkDone(card)
  }, [onMarkDone])

  const renderCards = useMemo(() => {
    if (doneIds.size === 0) return cards
    return cards.map((card) => (
      doneIds.has(String(card?.id ?? ''))
        ? { ...card, done: true, state: 'done' }
        : card
    ))
  }, [cards, doneIds])

  if (loading && (cards.length === 0) && emptyKind !== 'no-accounts') {
    return (
      <div className="omnimux-inspiration-skeleton" data-rival-skeleton="true">
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <div key={index} className="omnimux-inspiration-skel" />
        ))}
      </div>
    )
  }

  if (cards.length === 0) {
    if (emptyKind === 'no-accounts') {
      return (
        <EmptyState
          icon={EMPTY_ICON_USER}
          title={t('rivalFeed.empty.noAccounts')}
          description={t('rivalFeed.empty.noAccountsHint')}
          action={
            <Button variant="primary" size="sm" onClick={onImport}>
              {t('rivalAccounts.import.btn')}
            </Button>
          }
        />
      )
    }
    if (emptyKind === 'filtered') {
      return (
        <EmptyState
          icon={EMPTY_ICON_SEARCH}
          title={t('rivalFeed.empty.filtered')}
          description={t('rivalFeed.empty.filteredHint')}
          action={
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              {t('rivalFilter.reset')}
            </Button>
          }
        />
      )
    }
    // Still loading with nothing to show yet is not an empty state — saying
    //「no works」during the first request would be a claim about data nobody has
    // read.
    if (emptyKind === 'loading') return null
    return (
      <EmptyState
        icon={EMPTY_ICON_WORKS}
        title={t('rivalFeed.empty.noPostsTitle')}
        description={t('rivalFeed.empty.noPostsDesc')}
        action={
          <Button variant="primary" size="sm" onClick={onImport}>
            {t('rivalAccounts.import.btn')}
          </Button>
        }
      />
    )
  }

  return (
    <>
      <RivalMasonry
        cards={renderCards}
        t={t}
        onDetail={onDetail}
        onReplicate={onReplicate}
        onMarkDone={handleMarkDone}
        onDeconstruct={onDeconstruct}
        busyId={replicateBusy}
      />
      {loadingMore ? (
        <div className="omnimux-inspiration-skeleton omnimux-rival-loadmore" data-rival-loadmore-skeleton="true" aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div key={index} className="omnimux-inspiration-skel" />
          ))}
        </div>
      ) : null}
    </>
  )
}
