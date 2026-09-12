/**
 * Rival-accounts workbench: the two-column panel mounted as the fourth tab.
 *
 * Owns the client store, the import dialog and the post actions. Everything it
 * renders is presentational; the state lives in `rival-client-store.js` so the
 * rules stay testable without a renderer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { RivalAccountList } from './RivalAccountList.jsx'
import { RivalPostPanel } from './RivalPostPanel.jsx'
import { RivalImportDialog } from './RivalImportDialog.jsx'
import { addRivalPostToSession } from './rival-add-to-chat.js'
import { createRivalClientStore } from './rival-client-store.js'
import { convertRivalPost, refreshAllRivalAccounts, removeRivalAccount, refreshRivalAccount } from './rival-api.js'
import { injectRivalStyles } from './rival-styles.js'

/** Platform filter options, built from the module's own platform names. */
function buildPlatformOptions(t) {
  return [
    { value: '', label: t('platform.all') },
    { value: 'tiktok', label: t('platform.tiktok') },
    { value: 'instagram', label: t('platform.instagram') },
    { value: 'youtube', label: t('platform.youtube') },
    { value: 'x', label: t('platform.x') },
  ]
}

export function RivalAccountsPanel({ t, active = true }) {
  const storeRef = useRef(null)
  if (!storeRef.current) storeRef.current = createRivalClientStore()
  const store = storeRef.current

  const [snapshot, setSnapshot] = useState(() => store.getState())
  const [importOpen, setImportOpen] = useState(false)
  const [busyPostId, setBusyPostId] = useState(null)
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [notice, setNotice] = useState(null)
  const [busyAccount, setBusyAccount] = useState(false)

  useEffect(() => store.subscribe(setSnapshot), [store])

  useEffect(() => {
    injectRivalStyles()
  }, [])

  /**
   * Load when the tab becomes active. The `active` guard keeps a hidden tab from
   * polling: a workbench panel that fetches while the user is elsewhere is a
   * background cost with no visible benefit.
   */
  useEffect(() => {
    if (!active) return
    void store.loadAccounts()
  }, [active, store])

  useEffect(() => {
    void store.loadStatus()
  }, [store, snapshot.phase])

  useEffect(() => () => store.stopPolling(), [store])

  const platforms = useMemo(() => buildPlatformOptions(t), [t])

  /** Re-query whenever the search or the platform filter changes. */
  const applyFilter = useCallback(async (nextQuery, nextPlatform) => {
    await store.loadAccounts({ q: nextQuery || undefined, platform: nextPlatform || undefined })
  }, [store])

  const handleSelect = useCallback((id) => {
    void store.selectAccount(id)
  }, [store])

  const handleRefreshAll = useCallback(async () => {
    setBusyAccount(true)
    setNotice(null)
    try {
      const res = await refreshAllRivalAccounts()
      if (!res?.ok) {
        setNotice({ key: res?.body?.code === 'refresh-budget-exhausted'
          ? 'rivalAccounts.refresh.budgetPaused'
          : 'rivalAccounts.error.cloud', detail: res?.body?.error })
        return
      }
      const queued = res.body?.data?.queued || []
      for (const id of queued) store.startPolling(id)
      await store.loadAccounts()
    } finally {
      setBusyAccount(false)
    }
  }, [store])

  const handleRefreshOne = useCallback(async (id) => {
    const res = await refreshRivalAccount(id)
    if (!res?.ok) {
      setNotice({
        key: res?.body?.code === 'manual-cooldown'
          ? 'rivalAccounts.refresh.cooldown'
          : res?.body?.code === 'refresh-budget-exhausted'
            ? 'rivalAccounts.refresh.budgetPaused'
            : 'rivalAccounts.error.cloud',
        detail: res?.body?.error,
      })
      return
    }
    setNotice(null)
    store.startPolling(id)
  }, [store])

  const handleRemove = useCallback(async (id) => {
    await removeRivalAccount(id)
    await store.loadAccounts()
  }, [store])

  const handleTogglePotential = useCallback((next) => {
    void store.togglePotential(next)
  }, [store])

  /**
   * "Add to session": the whole red-line contract lives in the orchestrator; the
   * panel only reports the outcome.
   */
  const handleAddToChat = useCallback(async (post, opts = {}) => {
    setBusyPostId(post.id)
    try {
      const account = store.getState().accounts.find((row) => row.id === post.account_id)
        || store.getState().accounts.find((row) => row.id === store.getState().selectedId)
      const result = await addRivalPostToSession(post, account || {}, { preferVideo: opts.preferVideo === true })
      if (!result.ok && result.error !== 'busy') setNotice({ key: result.key || 'rivalAccounts.post.attachFailed' })
      else setNotice(null)
    } finally {
      setBusyPostId(null)
    }
  }, [store])

  const handleToInspiration = useCallback(async (post) => {
    const accountId = store.getState().selectedId
    setBusyPostId(post.id)
    try {
      const res = await convertRivalPost(accountId, post.id, { auto_analyze: true })
      if (!res?.ok) {
        setNotice({ key: 'rivalAccounts.error.cloud', detail: res?.body?.error })
        return
      }
      store.markPostInLibrary(post.id, { inspiration_id: res.body?.data?.inspiration_id })
      setNotice(null)
    } finally {
      setBusyPostId(null)
    }
  }, [store])

  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : []
  const paused = snapshot.status?.paused || { global: false, reason: null }

  return (
    <div className="omnimux-rival-root" data-active={active ? 'true' : 'false'}>
      {notice ? (
        <div className="omnimux-rival-notice" role="status" onClick={() => setNotice(null)}>
          <p>{t(notice.key)}{notice.detail ? `：${notice.detail}` : ''}</p>
        </div>
      ) : null}
      {snapshot.error ? (
        <div className="omnimux-rival-notice is-error" role="alert">
          <p>{snapshot.error}</p>
        </div>
      ) : null}
      <div className="omnimux-rival-columns">
        <RivalAccountList
          accounts={accounts}
          selectedId={snapshot.selectedId}
          t={t}
          onSelect={handleSelect}
          onImport={() => setImportOpen(true)}
          onRefreshAll={handleRefreshAll}
          onRefreshOne={handleRefreshOne}
          onRemove={handleRemove}
          refreshing={busyAccount}
          query={query}
          onQueryChange={(value) => {
            setQuery(value)
            void applyFilter(value, platform)
          }}
          platform={platform}
          onPlatformChange={(value) => {
            setPlatform(value)
            void applyFilter(query, value)
          }}
          platforms={platforms}
          paused={paused}
        />
        <RivalPostPanel
          t={t}
          posts={snapshot.posts}
          loading={snapshot.postsLoading}
          carryOver={snapshot.carryOver}
          onlyPotential={snapshot.onlyPotential}
          onTogglePotential={handleTogglePotential}
          onAddToChat={handleAddToChat}
          onToInspiration={handleToInspiration}
          busyPostId={busyPostId}
        />
      </div>
      {accounts.length > 0 && !snapshot.selectedId ? (
        <div className="omnimux-rival-empty">
          <Button variant="outline" size="sm" onClick={() => handleSelect(accounts[0].id)}>
            {t('rivalAccounts.posts.selectHint')}
          </Button>
        </div>
      ) : null}
      <RivalImportDialog
        open={importOpen}
        t={t}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          setImportOpen(false)
          await store.loadAccounts()
        }}
      />
    </div>
  )
}
