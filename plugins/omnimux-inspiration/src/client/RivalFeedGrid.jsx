/**
 * 账号监控右栏的「没有帖子可渲染」状态（#3432）。
 *
 * The timeline owns every non-empty state; this component is the skeleton /
 * empty / first-fetch surface behind it. Keeping the states here means the tab
 * switch keeps the library's honest "collecting" shimmer, and the timeline never
 * has to grow a second copy of the empty-state copy.
 */

import { Button, EmptyState } from 'dsh-ui-kit'
import { EMPTY_ICON_SEARCH, EMPTY_ICON_USER, EMPTY_ICON_WORKS } from './icons.jsx'
import { rivalErrorKey } from './rival-health.js'

/** Blocks a first paint or a page append shows while it has nothing to show. */
const SKELETON_COUNT = 10

/**
 * @param {{
 *   t: (key: string) => string,
 *   cards: Array<Record<string, any>>,
 *   loading: boolean,
 *   emptyKind: 'no-accounts' | 'no-posts' | 'filtered' | 'loading' | 'fetching' | 'fetch-failed',
 *   fetchPhase?: null | { kind: 'reimport'|'stopped'|'cooling'|'failed'|'timeout', account?: any, minutes?: number },
 *   refreshBusy?: boolean,
 *   onResetFilters: () => void,
 *   onImport: () => void,
 *   onRetryFetch?: () => void,
 *   onBrowseTrend?: () => void,
 * }} props
 */
export function RivalFeedGrid(props) {
  const {
    t, cards, loading, emptyKind, fetchPhase, onResetFilters, onImport,
    onRetryFetch, onBrowseTrend, refreshBusy = false,
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
          action={(
            <div className="omnimux-rival-empty-actions">
              <Button variant="primary" size="sm" onClick={onImport}>
                {t('rivalAccounts.import.btn')}
              </Button>
              {onBrowseTrend ? (
                <Button variant="ghost" size="sm" onClick={onBrowseTrend}>
                  {t('rivalFeed.empty.browseTrend')}
                </Button>
              ) : null}
            </div>
          )}
        />
      )
    }
    if (emptyKind === 'fetching') {
      return (
        <EmptyState
          icon={EMPTY_ICON_WORKS}
          title={t('rivalFeed.empty.fetchingTitle')}
          description={t('rivalFeed.empty.fetchingDesc').replace('{n}', '1')}
          action={(
            <div className="omnimux-rival-empty-actions">
              <div
                className="omnimux-rival-fetch-progress"
                role="progressbar"
                aria-label={t('rivalFeed.empty.fetchingTitle')}
              >
                <i />
              </div>
              {onBrowseTrend ? (
                <Button variant="ghost" size="sm" onClick={onBrowseTrend}>
                  {t('rivalFeed.empty.browseTrend')}
                </Button>
              ) : null}
            </div>
          )}
        />
      )
    }
    if (emptyKind === 'fetch-failed') {
      const phase = fetchPhase || { kind: 'failed' }
      const stoppedFailures = phase.kind === 'stopped'
        ? Number(phase.account?.consecutive_failures)
        : null
      const title = phase.kind === 'reimport'
        ? t('rivalAccounts.health.reimport')
        : phase.kind === 'stopped'
        ? t('rivalFeed.empty.failedStopped')
        : (phase.kind === 'cooling'
          ? t('rivalFeed.empty.failedCooling').replace('{n}', String(phase.minutes ?? 1))
          : t(phase.kind === 'timeout' ? 'rivalFeed.empty.failedTimeout' : 'rivalFeed.empty.failedTitle'))
      const failures = Number.isFinite(stoppedFailures) && stoppedFailures > 0
        ? t('rivalFeed.empty.failedStoppedReason').replace('{n}', String(stoppedFailures))
        : null
      const accountName = phase.account?.handle || phase.account?.nickname || t('rivalAccounts.refresh.account')
      const reason = phase.kind === 'timeout'
        ? t('rivalFeed.empty.failedTimeoutReason')
        : t(rivalErrorKey(phase.account?.error_code))
      const description = `${accountName}：${[failures, reason].filter(Boolean).join('。')}`
      return (
        <EmptyState
          icon={EMPTY_ICON_WORKS}
          title={title}
          description={description}
          action={(
            <div className="omnimux-rival-empty-actions">
              {phase.kind === 'reimport' ? (
                <Button variant="primary" size="sm" onClick={onImport}>
                  {t('rivalAccounts.health.reimportAction')}
                </Button>
              ) : onRetryFetch ? (
                <Button variant="primary" size="sm" disabled={refreshBusy} onClick={onRetryFetch}>
                  {t(refreshBusy ? 'rivalAccounts.refresh.submitting' : phase.kind === 'timeout'
                    ? 'rivalFeed.empty.checkProgress' : 'rivalFeed.empty.failedRetry')}
                </Button>
              ) : null}
              {onBrowseTrend ? (
                <Button variant="ghost" size="sm" onClick={onBrowseTrend}>
                  {t('rivalFeed.empty.browseTrend')}
                </Button>
              ) : null}
            </div>
          )}
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

  // The timeline owns every non-empty state now (#3432); this component is
  // only the empty/skeleton/collection-progress surface behind it.
  return null
}
