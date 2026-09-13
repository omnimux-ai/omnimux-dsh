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

import { Button } from 'dsh-ui-kit'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'

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
        <div className="omnimux-rival-empty">
          <p className="omnimux-rival-empty-title">{t('rivalFeed.empty.noAccounts')}</p>
          <p className="omnimux-rival-empty-text">{t('rivalFeed.empty.noAccountsHint')}</p>
          <Button variant="primary" size="sm" className="omnimux-rival-empty-cta" onClick={onImport}>
            {t('rivalAccounts.import.btn')}
          </Button>
        </div>
      )
    }
    if (emptyKind === 'filtered') {
      return (
        <div className="omnimux-rival-empty">
          <p className="omnimux-rival-empty-title">{t('rivalFeed.empty.filtered')}</p>
          <p className="omnimux-rival-empty-text">{t('rivalFeed.empty.filteredHint')}</p>
          <Button variant="outline" size="sm" className="omnimux-rival-empty-cta" onClick={onResetFilters}>
            {t('rivalFilter.reset')}
          </Button>
        </div>
      )
    }
    // Still loading with nothing to show yet is not an empty state — saying
    //「no works」during the first request would be a claim about data nobody has
    // read.
    if (emptyKind === 'loading') return null
    return (
      <div className="omnimux-rival-empty">
        <p className="omnimux-rival-empty-title">{t('rivalFeed.empty.noPosts')}</p>
      </div>
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
