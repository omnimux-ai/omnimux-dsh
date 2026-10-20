/**
 * 账号监控左栏：常驻的监控账号列表（#3432）。
 *
 * The account dimension used to live in a toolbar popover. The monitor page is
 * now a two-column layout: this column owns "which accounts", the timeline on
 * the right owns "which posts". The selection model is unchanged — `all` means
 * every monitored account, a subset means the checked ids, and the exact same
 * `accounts` query parameter is sent to the feed endpoint.
 */

import { Button } from 'dsh-ui-kit'
import { formatCount, rivalLocaleOf } from './rival-format.js'
import { selectedAccountIds, toAccountFilterRow } from './rival-filter.js'
import { AccountFilterRow } from './RivalAccountFilter.jsx'
import { openExternalUrl } from './open-url.js'

/**
 * @param {{
 *   t: (key: string) => string,
 *   accounts: Array<Record<string, any>>,
 *   selection: { mode: 'all' | 'subset', ids: string[] | Set<string> },
 *   allIds?: string[],
 *   onToggle: (id: string) => void,
 *   onInvert: () => void,
 *   onReset: () => void,
 *   onRetry?: (id: string) => void,
 *   quotaLeft?: number,
 *   refreshBusy?: boolean,
 * }} props
 */
export function RivalAccountColumn(props) {
  const {
    t, accounts, selection, allIds, onToggle, onInvert, onReset, onRetry,
    quotaLeft, refreshBusy = false,
  } = props
  const list = Array.isArray(accounts) ? accounts : []
  const ids = Array.isArray(allIds) ? allIds : list.map((account) => String(account?.id ?? ''))
  const rows = list.map((account) => toAccountFilterRow(account, selection))
  const selectedCount = selectedAccountIds(ids, selection).length
  const locale = rivalLocaleOf(t)

  return (
    <aside className="omnimux-rival-accounts" aria-label={t('rivalAccounts.column.title')}>
      <header className="omnimux-rival-accounts-head">
        <span className="omnimux-rival-accounts-titles">
          <span className="omnimux-rival-accounts-title">{t('rivalAccounts.column.title')}</span>
          {selection.mode === 'subset' ? (
            <span className="omnimux-rival-accounts-summary" data-account-selected={String(selectedCount)}>
              {String(t('rivalFilter.some')).replace('{k}', formatCount(selectedCount, locale))}
            </span>
          ) : null}
        </span>
        <span className="omnimux-rival-accounts-actions">
          <Button variant="ghost" size="xs" onClick={onInvert}>{t('rivalFilter.invert')}</Button>
          <Button variant="ghost" size="xs" onClick={onReset}>{t('rivalFilter.reset')}</Button>
        </span>
      </header>
      <div className="omnimux-rival-accounts-list" role="group" aria-label={t('rivalAccounts.column.title')}>
        {rows.map((row) => (
          <AccountFilterRow
            key={row.id}
            row={row}
            t={t}
            onToggle={onToggle}
            onRetry={onRetry}
            quotaLeft={quotaLeft}
            refreshBusy={refreshBusy}
            onOpenProfile={(url) => openExternalUrl(url)}
          />
        ))}
      </div>
    </aside>
  )
}
