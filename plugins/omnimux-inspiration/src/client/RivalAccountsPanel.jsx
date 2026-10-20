/**
 * Right column of the 账号监控 tab: the selected accounts' posts as a timeline.
 *
 * It used to be a two-column workbench — an account column on the left and a
 * post list on the right — and the account dimension now lives in the toolbar's
 * multi-select filter instead. What is left is what the tab is for: the works.
 *
 * The feed state is mounted by the shell (`use-rival-feed`) because the account
 * column and this timeline read the same numbers; the panel renders the
 * content and owns only what is scoped to it — the import dialog, the detail
 * dialog and the「立即复刻」action.
 */

import { useCallback, useEffect, useState } from 'react'
import { RivalFeedGrid } from './RivalFeedGrid.jsx'
import { RivalTimeline } from './RivalTimeline.jsx'
import { RivalImportDialog } from './RivalImportDialog.jsx'
import { RivalPostPreviewModal } from './RivalPostPreviewModal.jsx'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'
import { getLocalInspiration } from './api.js'
import { convertRivalPost, markRivalPostDone } from './rival-api.js'
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
    if (!ticket || busyId) return { ok: false, error: 'busy' }
    setBusyId(ticket)
    try {
      return await oneClickReplicate(row, {
        onStatus: (key) => {
          setNotice(key ? { key } : null)
        },
      })
    } catch (error) {
      setNotice({ key: 'rivalAccounts.post.attachFailed' })
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      setBusyId(null)
    }
  }, [busyId])

  /**
   * 「标为已处理」的当前回执：#3114 的端点还没有接上，所以本票只给出
   * 「动作已被记录」的通知；卡片的 is-done 视觉翻转由 grid 本地完成。
   */
  const handleMarkDone = useCallback(async (card) => {
    const accountId = String(card?.account_id || card?.account?.id || '')
    const postId = String(card?.post_id || card?.id || '')
    setNotice({ key: 'rivalFeed.toast.markDone' })
    if (!accountId || !postId) return
    try {
      await markRivalPostDone(accountId, postId)
    } catch {
      // 本地存储写入异常时静默或保持乐观测状态，不打扰用户
    }
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
          <p>{t(feed.error)}</p>
        </div>
      ) : null}
      {feed.refreshNotice ? (
        <div className={`omnimux-rival-notice${feed.refreshNotice.failures?.length ? ' is-error' : ''}`}
          role={feed.refreshNotice.failures?.length ? 'alert' : 'status'}>
          {feed.refreshNotice.n > 0 || !feed.refreshNotice.failures?.length ? (
            <p>{t(feed.refreshNotice.key).replace('{n}', String(feed.refreshNotice.n ?? 0))}</p>
          ) : null}
          {(feed.refreshNotice.failures || []).map((failure) => (
            <p key={failure.account.id}>
              {failure.account.handle || failure.account.nickname || t('rivalAccounts.refresh.account')}：{t(failure.key)}
            </p>
          ))}
        </div>
      ) : null}

      {feed.cards.length > 0 ? (
        <RivalTimeline
          cards={feed.cards}
          t={t}
          busyId={busyId}
          hasMore={feed.hasMore === true}
          loadingMore={feed.loadingMore === true}
          onLoadMore={feed.loadMore}
          onDetail={handleDetail}
          onReplicate={handleReplicate}
          onDeconstruct={handleDeconstruct}
          onMarkDone={handleMarkDone}
        />
      ) : (
        <RivalFeedGrid
          t={t}
          cards={feed.cards}
          loading={feed.loading}
          loadingMore={feed.loadingMore}
          emptyKind={emptyKind}
          fetchPhase={feed.fetchPhase}
          refreshBusy={feed.refreshBusy}
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
      )}

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
          onReplicate={handleInspirationReplicate}
          replicateBusy={busyId != null}
        />
      ) : null}
    </div>
  )
}
