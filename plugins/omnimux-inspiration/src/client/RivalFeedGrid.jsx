/**
 * The 账号监控 content area: a 9:16 grid of monitored accounts' works.
 *
 * It renders the *same* card the「全部」tab uses, on purpose. "100% consistent
 * with 全部" is a promise about pixels, and the only way to keep it is to have
 * one card component rather than two that start identical and drift — the
 * differences between a library item and a monitored work live in the row data
 * (`toRivalCardRow`) and nowhere else.
 *
 * Three states, and the skeleton is the library's own: the same
 * `.omnimux-inspiration-grid` columns and the same `.omnimux-inspiration-skel`
 * shimmer, so a tab switch does not change how loading looks.
 */

import { Button, EmptyState } from 'dsh-ui-kit'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'

/** Blocks a first paint or a page append shows while it has nothing to show. */
const SKELETON_COUNT = 10

const EMPTY_ICON_WORKS = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </svg>
)

const EMPTY_ICON_USER = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
)

const EMPTY_ICON_SEARCH = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

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
 *   replicateBusy: string | null,
 * }} props
 */
export function RivalFeedGrid(props) {
  const {
    t, cards, loading, loadingMore, emptyKind, onResetFilters, onImport,
    onDetail, onReplicate, replicateBusy,
  } = props

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
        title={t('rivalFeed.empty.noPostsTitle') || t('rivalFeed.empty.noPosts')}
        description={t('rivalFeed.empty.noPostsDesc')}
      />
    )
  }

  return (
    <div className="omnimux-inspiration-grid" data-rival-grid="true">
      {cards.map((row) => (
        <InspirationCoverCard
          key={String(row.id)}
          card={{
            row,
            t,
            // Monitored works are not library rows: they carry no in-library
            // selection checkbox and no import status to reveal.
            selecting: false,
            selected: false,
            replicateBusy: replicateBusy === row.id,
            onSelect: onDetail,
            onReplicate,
          }}
        />
      ))}
      {loadingMore ? Array.from({ length: SKELETON_COUNT }).map((_, index) => (
        <div key={`rival_more_${index}`} className="omnimux-inspiration-skel" aria-hidden="true" />
      )) : null}
    </div>
  )
}
