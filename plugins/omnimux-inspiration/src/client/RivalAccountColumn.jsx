/**
 * 账号监控左栏：单选分组导航（#3451）。
 *
 * The old multi-select filter is gone. The column now behaves like a grouped
 * navigation: 「全部」is the default target, accounts are grouped by platform,
 * and clicking a row switches the timeline to that single account. Each row
 * reveals a「更多」menu on hover with account actions (delete).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { formatCount, rivalLocaleOf } from './rival-format.js'
import { selectedAccountIds, toAccountFilterRow } from './rival-filter.js'
import { AccountFilterRow } from './RivalAccountFilter.jsx'
import { openExternalUrl } from './open-url.js'

const PLATFORM_ORDER = ['x', 'tiktok', 'youtube', 'instagram']

/**
 * @param {{
 *   t: (key: string) => string,
 *   accounts: Array<Record<string, any>>,
 *   selection: { mode: 'all' | 'subset', ids: string[] | Set<string> },
 *   allIds?: string[],
 *   onSelect: (id: string) => void,
 *   onReset: () => void,
 *   onRemove?: (id: string) => Promise<{ ok: boolean, message?: string }>,
 *   onRetry?: (id: string) => void,
 *   quotaLeft?: number,
 *   refreshBusy?: boolean,
 *   active?: boolean,
 * }} props
 */
export function RivalAccountColumn(props) {
  const {
    t, accounts, selection, allIds, onSelect, onReset, onRemove, onRetry,
    quotaLeft, refreshBusy = false, active = true,
  } = props
  const list = Array.isArray(accounts) ? accounts : []
  const ids = Array.isArray(allIds) ? allIds : list.map((account) => String(account?.id ?? ''))
  const rows = list.map((account) => toAccountFilterRow(account, { mode: 'subset', ids: [] }))
  const selected = selectedAccountIds(ids, selection)
  const selectedId = selection.mode === 'subset' && selected.length === 1 ? selected[0] : null
  const locale = rivalLocaleOf(t)
  const [menu, setMenu] = useState(null)
  const asideRef = useRef(null)

  // Sticky offset/max-height follow the real Stage scrollport (#3448).
  useLayoutEffect(() => {
    const node = asideRef.current
    if (!node) return undefined
    const scroll = node.closest('.omx-stage-scroll')
    if (!scroll) return undefined
    let header = scroll.querySelector('.omx-stage-sticky')
    let observer = null
    const read = () => {
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
    window.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      if (observer) observer.disconnect()
    }
  }, [active])

  useEffect(() => {
    if (!menu) return undefined
    const close = (event) => {
      if (event?.target?.closest?.('.omnimux-rival-menu')) return
      setMenu(null)
    }
    const onKey = (event) => { if (event.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const openMore = (event, id) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMenu({
      id,
      left: Math.max(8, Math.min(rect.right - 176, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 184)),
      top: Math.min(rect.bottom + 4, (typeof window !== 'undefined' ? window.innerHeight : 768) - 96),
      confirming: false,
      busy: false,
      error: '',
    })
  }

  const remove = async () => {
    if (!menu || menu.busy) return
    if (!menu.confirming) {
      setMenu({ ...menu, confirming: true, error: '' })
      return
    }
    const id = menu.id
    setMenu({ ...menu, busy: true, error: '' })
    let result
    try {
      result = await onRemove?.(id)
    } catch {
      result = { ok: false }
    }
    if (result && result.ok === false) {
      setMenu((previous) => (previous && previous.id === id ? { ...previous, busy: false, error: result.message || t('rivalAccounts.column.removeFailed') } : previous))
      return
    }
    setMenu((previous) => (previous && previous.id === id ? null : previous))
  }

  const groups = []
  for (const account of list) {
    const platform = String(account?.platform || '')
    const group = groups.find((entry) => entry.platform === platform)
    if (group) group.accounts.push(account)
    else groups.push({ platform, accounts: [account] })
  }
  groups.sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.platform)
    const bi = PLATFORM_ORDER.indexOf(b.platform)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <aside ref={asideRef} className="omnimux-rival-accounts" aria-label={t('rivalAccounts.column.title')}>
      <header className="omnimux-rival-accounts-head">
        <span className="omnimux-rival-accounts-title">{t('rivalAccounts.column.title')}</span>
      </header>
      <div className="omnimux-rival-accounts-list" role="navigation" aria-label={t('rivalAccounts.column.title')}>
        <div
          className={`omnimux-rival-accounts-all${selection.mode === 'all' ? ' is-selected' : ''}`}
          role="button"
          tabIndex={0}
          aria-current={selection.mode === 'all' ? 'page' : undefined}
          onClick={onReset}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onReset()
            }
          }}
        >
          <span className="omnimux-rival-accounts-all-label">{t('rivalAccounts.column.all')}</span>
          <span className="omnimux-rival-accounts-all-count">{formatCount(list.length, locale)}</span>
        </div>
        {groups.map((group) => (
          <section className="omnimux-rival-account-group" key={group.platform || 'unknown'} aria-label={t(`platform.${group.platform}`)}>
            <h3 className="omnimux-rival-account-group-title">{t(`platform.${group.platform}`)}</h3>
            {group.accounts.map((account) => {
              const row = rows.find((entry) => entry.id === String(account.id))
              if (!row) return null
              return (
                <AccountFilterRow
                  key={row.id}
                  row={row}
                  t={t}
                  selected={selectedId === row.id}
                  onSelect={onSelect}
                  onMore={openMore}
                  menuOpen={menu?.id === row.id}
                  onRetry={onRetry}
                  quotaLeft={quotaLeft}
                  refreshBusy={refreshBusy}
                  onOpenProfile={(url) => openExternalUrl(url)}
                />
              )
            })}
          </section>
        ))}
      </div>
      {menu ? (
        <div
          className="omnimux-rival-menu"
          role="menu"
          aria-label={t('rivalAccounts.column.more')}
          style={{ left: `${menu.left}px`, top: `${menu.top}px` }}
        >
          <Button
            variant="ghost"
            size="sm"
            className={`omnimux-rival-menu-item is-danger${menu.confirming ? ' is-confirming' : ''}`}
            role="menuitem"
            autoFocus
            disabled={menu.busy}
            onClick={remove}
          >
            {menu.confirming ? t('rivalAccounts.column.confirmRemove') : t('rivalAccounts.column.remove')}
          </Button>
          {menu.error ? <p className="omnimux-rival-menu-error">{menu.error}</p> : null}
        </div>
      ) : null}
    </aside>
  )
}
