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
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'
import { getLocalInspiration } from './api.js'
import { convertRivalPost } from './rival-api.js'
import { addRivalPostToSession } from './rival-add-to-chat.js'
import { oneClickReplicate } from './replicate-to-chat.js'
import { feedEmptyKind } from './rival-feed-empty.js'
import { toRivalPost } from './rival-filter.js'
import { injectRivalStyles } from './rival-styles.js'
import { injectRivalTokens } from './rival-tokens.js'

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
 * @param {{
 *   t: (key: string) => string,
 *   active?: boolean,
 *   query?: string,
 *   platform?: string,
 *   feed: Record<string, any>,
 *   onImported?: (item?: Record<string, any>) => void,
 *   onAccountImported?: (account?: Record<string, any>) => void,
 *   onBrowseTrend?: () => void,
 * }} props
 */
export function RivalAccountsPanel(props) {
  const {
    t, active = true, feed, onImported, onAccountImported, onBrowseTrend,
  } = props
  const [importOpen, setImportOpen] = useState(false)
  const [detailRow, setDetailRow] = useState(null)
  const [deconstructRow, setDeconstructRow] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [deconstructBusyId, setDeconstructBusyId] = useState(null)

  useEffect(() => {
    injectRivalStyles()
    // The card styles reference the media/velocity token families that only this
    // tab consumes; inject them at mount so the first paint is never untokened.
    injectRivalTokens()
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
    const ticket = String(card?.id ?? '')
    // busyId is a single ticket: without this guard a click on a second card
    // starts a concurrent run and the first run's `finally` clears the ticket
    // mid-flight (R5-⑨, same guard its two sibling handlers already carry).
    if (!ticket || busyId) return
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
  }, [busyId])

  /**
   * 「AI 拆解」：作品先走既有 to-inspiration 链路入库并跑自动解析（E13，
   * auto_analyze 默认开），然后把入库的灵感条目交给灵感库预览弹窗——
   * 它的解构页签就是规格「就地展开」的落点。重复点击对已入库的作品是
   * 幂等的（端点直接返回既有 inspiration_id）。
   */
  const handleDeconstruct = useCallback(async (card) => {
    const ticket = String(card?.id ?? '')
    if (!ticket || deconstructBusyId) return
    setDeconstructBusyId(ticket)
    try {
      const res = await convertRivalPost(String(card?.account_id || ''), String(card?.post_id || ''), {
        auto_analyze: true,
      })
      const data = res?.body?.data || {}
      if (!res?.ok || !data.inspiration_id) {
        setNotice({ key: 'rivalAccounts.post.attachFailed' })
        return
      }
      const item = await getLocalInspiration(String(data.inspiration_id))
      const row = item?.body?.data || null
      if (row) {
        setDeconstructRow(row)
        setNotice({ key: 'rivalFeed.toast.deconstruct' })
      } else {
        setNotice({ key: 'rivalAccounts.post.attachFailed' })
      }
    } catch {
      // A transport-level failure (rejected fetch) is the same user-facing
      // answer as a refused one: without this catch it leaked as an unhandled
      // rejection and the user saw nothing.
      setNotice({ key: 'rivalAccounts.post.attachFailed' })
    } finally {
      setDeconstructBusyId(null)
    }
  }, [deconstructBusyId])

  /**
   * The deconstruct modal's「立即复刻」is NOT the card's replicate: the modal
   * hands back a *library item* (the row `getLocalInspiration` returned — it
   * has no `account_id`/`post_id`), so it must run the library's own
   * one-click-replicate chain, which starts a new session and prefills the
   * replication prompt. Routing it through `handleReplicate` builds a
   * `account_id=undefined` media request — exactly the bug this handler exists
   * instead of.
   */
  const handleInspirationReplicate = useCallback(async (row) => {
    const ticket = String(row?.id ?? '')
    if (!ticket || busyId) return
    setBusyId(ticket)
    try {
      await oneClickReplicate(row, {
        onStatus: (key) => {
          setNotice(key ? { key } : null)
        },
      })
    } catch {
      setNotice({ key: 'rivalAccounts.post.attachFailed' })
    } finally {
      setBusyId(null)
    }
  }, [busyId])

  /**
   * 「标为已处理」的当前回执：#3114 的端点还没有接上，所以本票只给出
   * 「动作已被记录」的通知；卡片的 is-done 视觉翻转由 grid 本地完成。
   */
  const handleMarkDone = useCallback((card) => {
    void card
    setNotice({ key: 'rivalFeed.toast.markDone' })
  }, [])

  const emptyKind = feedEmptyKind(feed)

  /**
   * The only notice this panel still owns is a failed 复刻 — the answer to the
   * action the user just clicked here.
   *
   * Import confirmations moved to the shell's top toast: a confirmation is not
   * this panel's business, and rendering it here pushed the grid down by a row
   * every time something was imported.
   */
  const noticeText = notice ? t(notice.key) : null
  const dismissNotice = () => setNotice(null)

  return (
    <div className="omnimux-rival-root" data-active={active ? 'true' : 'false'}>
      {noticeText ? (
        <div className="omnimux-rival-notice" role="status" onClick={dismissNotice}>
          <p>{noticeText}</p>
        </div>
      ) : null}
      {feed.error ? (
        <div className="omnimux-rival-notice is-error" role="alert">
          <p>{feed.error}</p>
        </div>
      ) : null}

      {/* 空态不占摘要行：「显示 0 个作品」对一片空白没有任何解释力，只会把留白切碎。 */}
      {feed.cards.length > 0 ? (
        <div className="omnimux-rival-summary" data-rival-summary="true">
          <span className="omnimux-rival-summary-text">{t('rivalFeed.summary')}</span>
          <span className="omnimux-rival-summary-count">
            {t('rivalFeed.count').replace('{n}', String(feed.total || 0))}
          </span>
        </div>
      ) : null}

      <RivalFeedGrid
        t={t}
        cards={feed.cards}
        loading={feed.loading}
        loadingMore={feed.loadingMore}
        emptyKind={emptyKind}
        fetchPhase={feed.fetchPhase}
        onResetFilters={feed.resetAccounts}
        onImport={() => setImportOpen(true)}
        onRetryFetch={feed.retryFetch}
        onBrowseTrend={onBrowseTrend}
        onDetail={handleDetail}
        onReplicate={handleReplicate}
        onDeconstruct={handleDeconstruct}
        onMarkDone={handleMarkDone}
        replicateBusy={busyId}
      />

      <RivalImportDialog
        open={importOpen}
        t={t}
        onClose={() => setImportOpen(false)}
        onImported={async (item) => {
          setImportOpen(false)
          onImported?.(item)
        }}
        onAccountImported={async (account) => {
          setImportOpen(false)
          // 账号不是这里的私事：切页、重读筛选器与作品流、提示成功都由外壳收口。
          onAccountImported?.(account)
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

      {deconstructRow ? (
        <InspirationPreviewModal
          row={deconstructRow}
          t={t}
          onClose={() => setDeconstructRow(null)}
          onItemUpdated={(updated) => setDeconstructRow(updated)}
          onReplicate={(row) => {
            setDeconstructRow(null)
            void handleInspirationReplicate(row)
          }}
          replicateBusy={busyId != null}
        />
      ) : null}
    </div>
  )
}
