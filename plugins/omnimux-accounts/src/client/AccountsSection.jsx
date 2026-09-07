import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ConfirmModal, Divider } from 'dsh-ui-kit'
import { AccountCard } from './AccountCard.jsx'
import { AccountTable } from './AccountTable.jsx'
import { ConnectModal } from './ConnectModal.jsx'
import { EmptyState } from './EmptyState.jsx'
import { FilterBar } from './FilterBar.jsx'
import { OverviewBar } from './OverviewBar.jsx'
import { PlusIcon } from './icons.jsx'
import { useAccounts } from './use-accounts.js'
import { injectAccountsStyles } from './styles.js'
import { disconnectAccount, patchAccount } from './api.js'
import { filterAccounts, fmt, presentStatuses, sortAccounts, summarize, uniqueValues } from './view.js'

const SKELETON_CARDS = 8
const VIEW_STORAGE_KEY = 'omnimux-accounts-view'
const NOTICE_TIMEOUT_MS = 6000

/**
 * @returns {'grid' | 'table'}
 */
function readStoredView() {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return value === 'table' ? 'table' : 'grid'
  } catch {
    return 'grid'
  }
}

/**
 * Accounts page body: overview strip + filter toolbar + card grid or table,
 * connect dialog, bulk-selection bar, loading skeleton, need-login gate,
 * error bar and empty state.
 *
 * `active` is first-level page visibility. The overlay stays mounted while
 * hidden so the list does not flash a skeleton on the next open; the connect
 * dialog, confirm popover and transient notice are dropped on hide.
 * @param {{ t: (key: string) => string, active?: boolean }} props
 */
export function AccountsSection({ t, active = true }) {
  useEffect(() => {
    injectAccountsStyles()
  }, [])

  const { phase, accounts, error, busy, refresh, watchConnect, patch, disconnect } = useAccounts()

  const [filters, setFilters] = useState({ query: '', platform: '', group: '', status: '', statusGroup: '', overview: '' })
  const [sortKey, setSortKey] = useState('display_name')
  const [sortDir, setSortDir] = useState('asc')
  const [view, setView] = useState(readStoredView)
  const [modalOpen, setModalOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [bulkProgress, setBulkProgress] = useState(null) // null | { done, total }
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [sectionError, setSectionError] = useState('') // bulk failures; hook errors ride `error`
  const wasActive = useRef(active)

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      // storage unavailable — the toggle still works for this session
    }
  }, [view])

  useEffect(() => {
    if (notice === '') return undefined
    const timer = window.setTimeout(() => { setNotice('') }, NOTICE_TIMEOUT_MS)
    return () => { window.clearTimeout(timer) }
  }, [notice])

  // Hidden overlay: drop floating UI so it does not come back on the next
  // open. Re-opening after a hide quietly refreshes without a skeleton
  // (`useAccounts` already fetched on first mount).
  useEffect(() => {
    const returning = active && !wasActive.current
    wasActive.current = active
    if (!active) {
      setModalOpen(false)
      setConfirmBulk(false)
      setNotice('')
      return undefined
    }
    if (returning) void refresh()
    return undefined
  }, [active, refresh])

  // Drop selection entries whose accounts disappeared (disconnect / refresh).
  useEffect(() => {
    setSelected((current) => {
      const alive = new Set(accounts.map((row) => String(row.id)))
      const next = new Set([...current].filter((id) => alive.has(id)))
      return next.size === current.size ? current : next
    })
  }, [accounts])

  // Close the bulk-confirm popover on any outside pointer press (same
  // pattern as the card / row menus).
  useEffect(() => {
    if (!confirmBulk) return undefined
    const onPointerDown = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-omnimux-accounts-popover]') !== null) return
      setConfirmBulk(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [confirmBulk])

  const summary = useMemo(() => summarize(accounts), [accounts])
  const platforms = useMemo(() => uniqueValues(accounts, 'platform'), [accounts])
  const groups = useMemo(() => uniqueValues(accounts, 'group'), [accounts])
  const statuses = useMemo(() => presentStatuses(accounts), [accounts])
  const visible = useMemo(
    () => sortAccounts(filterAccounts(accounts, filters), sortKey, sortDir),
    [accounts, filters, sortKey, sortDir],
  )

  const bulkRunning = bulkProgress !== null
  const combinedBusy = bulkRunning || busy !== '' ? (bulkRunning ? 'bulk' : busy) : ''

  /**
   * Overview stat click → filter patch. `null` clears every filter.
   * @param {{ status?: string, statusGroup?: string, platform?: string, overview?: string } | null} filter
   */
  const onFilterClick = (filter) => {
    if (filter === null) {
      setFilters({ query: '', platform: '', group: '', status: '', statusGroup: '', overview: '' })
      return
    }
    setFilters((current) => {
      if (filter.statusGroup !== undefined) {
        const nextGroup = current.statusGroup === filter.statusGroup ? '' : filter.statusGroup
        return { ...current, status: '', statusGroup: nextGroup, overview: '' }
      }
      if (filter.overview !== undefined) {
        const nextOverview = current.overview === filter.overview ? '' : filter.overview
        return { ...current, platform: '', overview: nextOverview }
      }
      return { ...current, ...filter }
    })
  }

  /** Table header click: same key flips direction, new key resets to asc. */
  const onSortHeader = (key) => {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const openConnect = () => { setModalOpen(true) }

  const closeConnect = () => {
    setModalOpen(false)
    void refresh()
  }

  /**
   * @param {Record<string, unknown> | null} _row new account row (unused copy)
   */
  const handleConnected = (_row) => {
    setModalOpen(false)
    setSectionError('')
    setNotice(t('connect.connected'))
    void refresh()
  }

  const toggleSelect = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((current) => {
      const ids = visible.map((row) => String(row.id))
      const all = ids.length > 0 && ids.every((id) => current.has(id))
      const next = new Set(current)
      if (all) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  /**
   * Serial bulk runner (D5: no concurrency — avoid OAuth-side rate limits).
   * A 401 aborts the loop early; the trailing refresh flips the page to
   * need-login. Individual failures accumulate into one error line; every
   * other account still runs.
   * @param {(id: string) => Promise<{ ok: boolean, status: number }>} work
   */
  const runBulk = async (work) => {
    const ids = [...selected]
    if (ids.length === 0 || bulkProgress !== null) return
    /** @type {string[]} */
    const failures = []
    let signedOut = false
    let done = 0
    setSectionError('')
    setBulkProgress({ done: 0, total: ids.length })
    for (const id of ids) {
      if (signedOut) break
      try {
        const result = await work(id)
        if (result.status === 401) {
          signedOut = true
        } else if (!result.ok) {
          failures.push(id)
        }
      } catch {
        failures.push(id)
      }
      done += 1
      setBulkProgress({ done, total: ids.length })
    }
    setBulkProgress(null)
    setSelected(new Set())
    setConfirmBulk(false)
    await refresh()
    if (!signedOut && failures.length > 0) {
      setSectionError(fmt(t('bulk.partialError'), { count: failures.length }))
    } else if (!signedOut) {
      setNotice(t('bulk.done'))
    }
  }

  const bulkDisconnect = () => {
    return runBulk((id) => disconnectAccount(id))
  }

  /**
   * @param {boolean} value
   */
  const bulkAgent = (value) => {
    return runBulk((id) => patchAccount(id, { agent_usable: value }))
  }

  if (phase === 'loading') {
    return (
      <div className="omnimux-accounts-root" role="status" aria-label={t('loading')}>
        <div className="omnimux-accounts-skeleton" aria-hidden="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <div key={index} className="omnimux-accounts-skeleton-card" />
          ))}
        </div>
      </div>
    )
  }

  if (phase === 'need-login') {
    const signIn = () => {
      const gate = typeof window !== 'undefined' ? /** @type {any} */ (window).__omnimuxAuth : undefined
      if (gate && typeof gate.ensureLogin === 'function') {
        gate.ensureLogin({
          kind: 'explicit',
          reason: t('needLogin'),
          onSuccess: () => { void refresh() },
        })
      } else {
        void refresh()
      }
    }
    return (
      <div className="omnimux-accounts-root">
        <p className="omnimux-accounts-muted">{t('needLogin')}</p>
        <p className="omnimux-accounts-muted">{t('needLoginHint')}</p>
        <Button variant="primary" onClick={signIn}>
          {t('login')}
        </Button>
      </div>
    )
  }

  const errorText = sectionError !== '' ? sectionError : error

  return (
    <div className="omnimux-accounts-root">
      <div className="omnimux-accounts-action-row">
        <Button
          variant="primary"
          leadingIcon={<PlusIcon />}
          disabled={combinedBusy !== ''}
          onClick={openConnect}
        >
          {t('connect')}
        </Button>
      </div>
      <OverviewBar t={t} summary={summary} filters={filters} onFilterClick={onFilterClick} busy={combinedBusy} />
      <Divider />
      {accounts.length > 0 ? (
        <div className="omnimux-accounts-toolbar">
          <FilterBar
            t={t}
            query={filters.query}
            platform={filters.platform}
            group={filters.group}
            status={filters.status}
            sortKey={sortKey}
            sortDir={sortDir}
            view={view}
            platforms={platforms}
            groups={groups}
            statuses={statuses}
            onFilterChange={(patchFilters) => {
              setFilters((current) => ({
                ...current,
                ...patchFilters,
                ...(patchFilters.status !== undefined ? { statusGroup: '', overview: '' } : {}),
                ...(patchFilters.platform !== undefined ? { overview: '' } : {}),
              }))
            }}
            onSortChange={(patchSort) => {
              if (patchSort.key !== undefined) setSortKey(patchSort.key)
              if (patchSort.dir !== undefined) setSortDir(patchSort.dir)
            }}
            onViewChange={setView}
            busy={combinedBusy}
          />
        </div>
      ) : null}
      {selected.size > 0 ? (
        <div className="omnimux-accounts-bulkbar">
          <span className="omnimux-accounts-bulk-text">
            {fmt(t('bulk.selected'), { count: selected.size })}
          </span>
          {bulkProgress !== null ? (
            <span className="omnimux-accounts-bulk-progress">
              {String(bulkProgress.done)}/{String(bulkProgress.total)}
            </span>
          ) : null}
          <Button
            variant="danger"
            size="sm"
            disabled={combinedBusy !== ''}
            onClick={() => { setConfirmBulk(true) }}
          >
            {t('bulk.disconnect')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={combinedBusy !== ''}
            onClick={() => { void bulkAgent(true) }}
          >
            {t('bulk.agentOn')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={combinedBusy !== ''}
            onClick={() => { void bulkAgent(false) }}
          >
            {t('bulk.agentOff')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={combinedBusy !== ''}
            onClick={() => { setSelected(new Set()) }}
          >
            {t('bulk.clear')}
          </Button>
          <ConfirmModal
            open={confirmBulk}
            onClose={() => { setConfirmBulk(false) }}
            title={t('bulk.disconnect')}
            message={fmt(t('bulk.confirmDisconnect'), { count: selected.size })}
            confirmLabel={t('disconnect')}
            cancelLabel={t('action.cancel')}
            confirmVariant="danger"
            confirmLoading={combinedBusy !== ''}
            onConfirm={() => { void bulkDisconnect() }}
          />
        </div>
      ) : null}
      {errorText !== '' ? <p className="omnimux-accounts-error" role="alert">{errorText}</p> : null}
      {notice !== '' ? <p className="omnimux-accounts-notice" role="status">{notice}</p> : null}
      {accounts.length === 0 ? (
        <EmptyState t={t} onConnect={openConnect} busy={combinedBusy} />
      ) : visible.length === 0 ? (
        <p className="omnimux-accounts-muted">{t('filter.noResults')}</p>
      ) : view === 'table' ? (
        <AccountTable
          t={t}
          accounts={visible}
          selected={selected}
          sortKey={sortKey}
          sortDir={sortDir}
          busy={combinedBusy}
          onSortHeader={onSortHeader}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onAgentToggle={(id, next) => { void patch(id, { agent_usable: next }) }}
          onDisconnect={(id) => { void disconnect(id) }}
        />
      ) : (
        <div className="omnimux-accounts-grid">
          {visible.map((account) => (
            <AccountCard
              key={String(account.id)}
              t={t}
              account={account}
              busy={combinedBusy}
              onAgentToggle={(id, next) => { void patch(id, { agent_usable: next }) }}
              onDisconnect={(id) => { void disconnect(id) }}
            />
          ))}
        </div>
      )}
      {modalOpen ? (
        <ConnectModal
          t={t}
          watchConnect={watchConnect}
          onClose={closeConnect}
          onConnected={handleConnected}
        />
      ) : null}
    </div>
  )
}
