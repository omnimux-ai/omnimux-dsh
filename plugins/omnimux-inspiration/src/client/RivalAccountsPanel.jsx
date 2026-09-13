/**
 * Rival-accounts workbench: the content area of the 对标账号 tab.
 *
 * Owns the client store, the import dialog and the post actions. The two filter
 * controls it used to render itself are plain props now — they belong to the one
 * filter row the shell shares across all four tabs, and the panel only has to
 * read them to decide what to load. Everything it renders is presentational; the
 * state lives in `rival-client-store.js` so the rules stay testable without a
 * renderer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { RivalAccountList } from './RivalAccountList.jsx'
import { RivalPostPanel } from './RivalPostPanel.jsx'
import { RivalImportDialog } from './RivalImportDialog.jsx'
import { addRivalPostToSession } from './rival-add-to-chat.js'
import { createRivalClientStore } from './rival-client-store.js'
import { convertRivalPost, refreshAllRivalAccounts, removeRivalAccount, refreshRivalAccount } from './rival-api.js'
import { injectRivalStyles } from './rival-styles.js'

/**
 * Platform filter options, built from the module's own platform names.
 *
 * Exported because the shell renders this dropdown: the account list and the
 * filter that narrows it have to offer the same platforms in the same order.
 */
export function buildRivalPlatformOptions(t) {
  return [
    { value: '', label: t('platform.all') },
    { value: 'tiktok', label: t('platform.tiktok') },
    { value: 'instagram', label: t('platform.instagram') },
    { value: 'youtube', label: t('platform.youtube') },
    { value: 'x', label: t('platform.x') },
  ]
}

export function RivalAccountsPanel({ t, active = true, query = '', platform = '' }) {
  const storeRef = useRef(null)
  if (!storeRef.current) storeRef.current = createRivalClientStore()
  const store = storeRef.current

  const [snapshot, setSnapshot] = useState(() => store.getState())
  const [importOpen, setImportOpen] = useState(false)
  const [busyPostId, setBusyPostId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busyAccount, setBusyAccount] = useState(false)

  useEffect(() => store.subscribe(setSnapshot), [store])

  useEffect(() => {
    injectRivalStyles()
  }, [])

  /**
   * Reload the account list under whatever the shell's filter row holds.
   *
   * Every reload path goes through here: a refresh or a removal that reloaded
   * unfiltered would leave the row showing one thing and the list another.
   */
  const reloadAccounts = useCallback(() => store.loadAccounts({
    q: query || undefined,
    platform: platform || undefined,
  }), [store, query, platform])

  /**
   * Load when the tab becomes active and whenever the filter row changes. The
   * `active` guard keeps a hidden tab from polling: a workbench panel that
   * fetches while the user is elsewhere is a background cost with no visible
   * benefit.
   */
  useEffect(() => {
    if (!active) return
    void reloadAccounts()
  }, [active, reloadAccounts])

  useEffect(() => {
    void store.loadStatus()
  }, [store, snapshot.phase])

  useEffect(() => () => store.stopPolling(), [store])

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
      await reloadAccounts()
    } finally {
      setBusyAccount(false)
    }
  }, [store, reloadAccounts])

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
    await reloadAccounts()
  }, [reloadAccounts])

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
          await reloadAccounts()
        }}
      />
    </div>
  )
}
