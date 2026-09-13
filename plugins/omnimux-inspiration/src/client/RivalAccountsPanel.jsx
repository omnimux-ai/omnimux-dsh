/**
 * Content area of the 账号监控 tab: one grid of the monitored accounts' works.
 *
 * It used to be a two-column workbench — an account column on the left and a
 * post list on the right — and the account dimension now lives in the toolbar's
 * multi-select filter instead. What is left is what the tab is for: the works.
 *
 * The feed state is mounted by the shell (`use-rival-feed`) because the filter
 * in the toolbar and this grid read the same numbers; the panel renders it and
 * owns only what is scoped to the content area — the import dialog, the detail
 * dialog and the「立即复刻」action.
 */

import { useCallback, useEffect, useState } from 'react'
import { RivalFeedGrid } from './RivalFeedGrid.jsx'
import { RivalImportDialog } from './RivalImportDialog.jsx'
import { RivalPostPreviewModal } from './RivalPostPreviewModal.jsx'
import { addRivalPostToSession } from './rival-add-to-chat.js'
import { toRivalPost } from './rival-filter.js'
import { injectRivalStyles } from './rival-styles.js'

/**
 * Platform filter options, built from the module's own platform names.
 *
 * Exported because the shell renders this dropdown: the account filter and the
 * platform filter that narrows the same grid have to offer the platforms in the
 * same order.
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

/**
 * Why the grid has nothing in it.
 *
 * Four distinct answers, because「no works」is not one situation: there may be no
 * monitored account at all, the accounts may have nothing collected yet, the
 * filters may have excluded everything, or the first request may still be in
 * flight. Only the last one may show a skeleton.
 * @param {Record<string, any>} feed
 * @returns {'loading' | 'no-accounts' | 'filtered' | 'no-posts'}
 */
export function feedEmptyKind(feed) {
  if (feed.loading) return 'loading'
  if (feed.accounts.length === 0) return 'no-accounts'
  if (feed.emptySelection || feed.error || feed.query || feed.platform) return 'filtered'
  return 'no-posts'
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   active?: boolean,
 *   query?: string,
 *   platform?: string,
 *   feed: Record<string, any>,
 *   onImported: () => void,
 * }} props
 */
export function RivalAccountsPanel(props) {
  const { t, active = true, feed, onImported } = props
  const [importOpen, setImportOpen] = useState(false)
  const [detailRow, setDetailRow] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    injectRivalStyles()
  }, [])

  const handleDetail = useCallback((row) => setDetailRow(row), [])

  /**
   * 「立即复刻」reuses the module's existing "add to session" orchestrator.
   *
   * That chain already holds this feature's red lines — the library tab stays
   * open, the canvas is untouched, nothing is sent — and it is the only
   * compliant path from a monitored work to a replication, so this component
   * reports the outcome instead of reimplementing the mount.
   */
  const handleReplicate = useCallback(async (card) => {
    const ticket = String(card.id)
    setBusyId(ticket)
    try {
      const result = await addRivalPostToSession(toRivalPost(card), { id: card.account_id })
      if (!result?.ok && result?.error !== 'busy') {
        setNotice({ key: result?.key || 'rivalAccounts.post.attachFailed' })
        return
      }
      setNotice(null)
    } finally {
      setBusyId(null)
    }
  }, [])

  const emptyKind = feedEmptyKind(feed)

  return (
    <div className="omnimux-rival-root" data-active={active ? 'true' : 'false'}>
      {notice ? (
        <div className="omnimux-rival-notice" role="status" onClick={() => setNotice(null)}>
          <p>{t(notice.key)}</p>
        </div>
      ) : null}
      {feed.error ? (
        <div className="omnimux-rival-notice is-error" role="alert">
          <p>{feed.error}</p>
        </div>
      ) : null}

      <div className="omnimux-rival-summary" data-rival-summary="true">
        <span className="omnimux-rival-summary-text">{t('rivalFeed.summary')}</span>
        <span className="omnimux-rival-summary-count">
          {t('rivalFeed.count').replace('{n}', String(feed.total || 0))}
        </span>
      </div>

      <RivalFeedGrid
        t={t}
        cards={feed.cards}
        loading={feed.loading}
        loadingMore={feed.loadingMore}
        emptyKind={emptyKind}
        onResetFilters={feed.resetAccounts}
        onImport={() => setImportOpen(true)}
        onDetail={handleDetail}
        onReplicate={handleReplicate}
        replicateBusy={busyId}
      />

      <RivalImportDialog
        open={importOpen}
        t={t}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          setImportOpen(false)
          onImported?.()
        }}
      />

      {detailRow ? (
        <RivalPostPreviewModal
          row={detailRow}
          t={t}
          busy={busyId === String(detailRow.id)}
          onClose={() => setDetailRow(null)}
          onReplicate={(row) => {
            setDetailRow(null)
            void handleReplicate(row)
          }}
        />
      ) : null}
    </div>
  )
}
