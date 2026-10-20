/**
 * 账号监控左栏：常驻的监控账号列表（#3432）。
 *
 * The account dimension used to live in a toolbar popover. The monitor page is
 * now a two-column layout: this column owns "which accounts", the timeline on
 * the right owns "which posts". The selection model is unchanged — `all` means
 * every monitored account, a subset means the checked ids, and the exact same
 * `accounts` query parameter is sent to the feed endpoint.
 */

import { useLayoutEffect, useRef } from 'react'
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
 *   active?: boolean,
 * }} props
 */
export function RivalAccountColumn(props) {
  const {
    t, accounts, selection, allIds, onToggle, onInvert, onReset, onRetry,
    quotaLeft, refreshBusy = false, active = true,
  } = props
  const list = Array.isArray(accounts) ? accounts : []
  const ids = Array.isArray(allIds) ? allIds : list.map((account) => String(account?.id ?? ''))
  const rows = list.map((account) => toAccountFilterRow(account, selection))
  const selectedCount = selectedAccountIds(ids, selection).length
  const locale = rivalLocaleOf(t)
  const asideRef = useRef(null)

  // The workbench pane is shorter than the window (tab strip + header), so the
  // sticky offset and the max-height must follow the real scrollport, not 100vh.
  // Measure the Stage scroll container and its sticky header and expose both as
  // CSS variables consumed by `.omnimux-rival-accounts` (#3448).
  useLayoutEffect(() => {
    const node = asideRef.current
    if (!node) return undefined
    const scroll = node.closest('.omx-stage-scroll')
    if (!scroll) return undefined
    let header = scroll.querySelector('.omx-stage-sticky')
    let observer = null
    const read = () => {
      // Re-read the header each time: the Stage may remount it after a tab
      // switch. Never write 0px while the pane is display:none — keep the last
      // valid measurement and retry when `active` flips back (#3448).
      header = scroll.querySelector('.omx-stage-sticky')
      const headerHeight = header ? header.getBoundingClientRect().height : 0
      const scrollHeight = scroll.clientHeight
      if (headerHeight <= 0 || scrollHeight <= 0) return
      node.style.setProperty('--omnimux-rival-sticky-h', `${headerHeight}px`)
      node.style.setProperty('--omnimux-rival-scroll-h', `${scrollHeight}px`)
    }
    read()
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(read)
      observer.observe(scroll)
      if (header) observer.observe(header)
    }
    // Chrome does not fire ResizeObserver on display:none -> visible, and the
    // sidebar keeps inactive tabs mounted. Re-measure whenever the tab becomes
    // visible, on window resize, and after the observer re-resolves the header.
    window.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      if (observer) observer.disconnect()
    }
  }, [active])

  return (
    <aside ref={asideRef} className="omnimux-rival-accounts" aria-label={t('rivalAccounts.column.title')}>
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
