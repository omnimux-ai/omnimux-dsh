import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, CopyButton, IconButton } from 'dsh-ui-kit'
import { InspirationPostDetail } from './InspirationPostDetail.jsx'
import { PreviewModalLayer } from './PreviewModalLayer.jsx'
import { createShareLink, getLocalInspiration, shareRequestPayload } from './api.js'
import { getInspirationPreviewData } from './inspiration-preview-data.js'
import { importErrorText, importSettledNotice, importStageLabel, isFailedRow, isImportingRow } from './import-status.js'
import { createImportPoller } from './import-poller.js'
import { decideSharePollOutcome, isShareRunning, shareErrorText, shareMediaNotice, shareSteps, shareUrlOf, shareValidityText } from './share-status.js'
export { cleanScriptDisplay } from '../structure-script.js'
const ICON_SHARE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)

const ICON_CLOSE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export function InspirationPreviewModal({ row, t, onClose, onItemUpdated, onReplicate, replicateBusy }) {
  const [item, setItem] = useState(row)
  const [showSharePopover, setShowSharePopover] = useState(false)
  const shareTriggerRef = useRef(null)
  const sharePopoverRef = useRef(null)

  useEffect(() => {
    if (!showSharePopover) return
    const dismiss = (event) => {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        setShowSharePopover(false)
        shareTriggerRef.current?.focus()
      } else if (!sharePopoverRef.current?.contains(event.target) && !shareTriggerRef.current?.contains(event.target)) {
        setShowSharePopover(false)
      }
    }
    window.addEventListener('keydown', dismiss, true)
    window.addEventListener('pointerdown', dismiss, true)
    return () => {
      window.removeEventListener('keydown', dismiss, true)
      window.removeEventListener('pointerdown', dismiss, true)
    }
  }, [showSharePopover])
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState(null)

  /**
   * The identity of the entry on screen, as text.
   *
   * A catalogue row numbers its entries (`2789`) while the Host's own row for
   * the same entry answers the string form (`"2789"`), so the raw value flips
   * type the moment a publish starts and the row is replaced. Comparing the
   * text form keeps that flip from reading as "a different entry", which would
   * close the popover and wipe the reason the publish failed — leaving the user
   * with a click that appears to do nothing at all.
   */
  const itemKey = item?.id == null ? '' : String(item.id)

  useEffect(() => {
    setShowSharePopover(false)
    setShareError(null)
  }, [itemKey])

  const applyItemRef = useRef(() => {})

  // The row is the single source of the publish's state: the Host starts the job
  // and writes every stage into it, so the page asks about that row until it
  // settles. Same poller the background imports use, told how to read a publish
  // row instead of an import row.
  const sharePoller = useMemo(() => createImportPoller({
    interpret: decideSharePollOutcome,
    deps: {
      fetchItem: (id) => getLocalInspiration(id),
      onItem: (row) => applyItemRef.current(row),
      onSettled: (row) => applyItemRef.current(row),
      onFailed: (row) => applyItemRef.current(row),
    },
  }), [])

  useEffect(() => {
    sharePoller.start()
    return () => sharePoller.dispose()
  }, [sharePoller])

  // Kept fresh on every render so the poll callbacks below never close over a
  // stale `onItemUpdated`.
  useEffect(() => {
    applyItemRef.current = (next) => {
      if (!next || typeof next !== 'object') return
      setItem(next)
      onItemUpdated?.(next)
    }
  })

  // A publish started before this popover was opened (closed and reopened, or a
  // page reload) is still running on the server: pick it back up instead of
  // showing a create button for work that is already happening.
  useEffect(() => {
    if (item?.id && isShareRunning(item)) sharePoller.track(String(item.id))
  }, [item?.id, item?.share_status, sharePoller])

  const handleCreateShare = async () => {
    if (sharing || !data.safeItem.id) return
    setSharing(true)
    setShareError(null)
    try {
      const response = await createShareLink(data.safeItem.id, shareRequestPayload(data.safeItem))
      const row = response.body?.data
      if (!response.ok) {
        // Shown in the popover, not as a full-screen error: the user asked for a
        // link, and the reason they did not get one belongs next to the button.
        setShareError(response.body?.error || t('modal.share.failed') || '创建失败')
        return
      }
      if (row) {
        applyItemRef.current(row)
        if (isShareRunning(row)) sharePoller.track(row.id)
      }
    } catch (error) {
      setShareError(String(error?.message || error))
    } finally {
      setSharing(false)
    }
  }


  useEffect(() => {
    setItem(row)
  }, [row])
  const data = useMemo(() => getInspirationPreviewData(item), [item])
  const shareUrl = shareUrlOf(item)
  const shareRunning = isShareRunning(item)
  const shareStepsList = shareRunning ? shareSteps(item, t) : []
  const shareFailure = shareError || shareErrorText(item)
  const shareValidity = shareValidityText(item, t)
  const shareMediaWarning = shareMediaNotice(item, t)
  const importing = isImportingRow(item)
  const failed = isFailedRow(item)
  const settledNotice = importSettledNotice(item, t)
  const applyItem = (next) => { setItem(next); onItemUpdated?.(next) }
  if (!row) return null
  return <PreviewModalLayer onClose={onClose} title={data.title}>
    <div className="omnimux-inspiration-modal-backdrop" onClick={onClose} onWheel={event => event.stopPropagation()}>
    <div className="omnimux-inspiration-modal-wrapper" onClick={event => event.stopPropagation()}>
      <IconButton className="omnimux-modal-close-btn is-external omnimux-inspiration-modal-close" variant="ghost" aria-label={t('close')} onClick={onClose}>{ICON_CLOSE}</IconButton>
      <div className="omnimux-inspiration-modal-container">
          <header className="omnimux-inspiration-modal-header">
            <div className="omnimux-inspiration-modal-heading">
              <h2 title={data.title}>{data.title}</h2>
              <CopyButton
                text={data.title}
                label=""
                copiedLabel=""
                title={t('modal.header.copy')}
                aria-label={t('modal.header.copy')}
                size="sm"
                variant="ghost"
                className="omnimux-inspiration-modal-copy is-icon-only"
              />
            </div>

            <div className="omnimux-inspiration-modal-header-actions">
              <Button
                size="sm"
                variant="ghost"
                ref={shareTriggerRef}
                leadingIcon={ICON_SHARE}
                className={`omnimux-inspiration-share-trigger-btn ${showSharePopover ? 'is-active' : ''}`}
                onClick={() => setShowSharePopover((prev) => !prev)}
                title={t('modal.share.btn') || '分享'}
                aria-label={t('modal.share.btn') || '分享'}
                aria-expanded={showSharePopover}
              >
                {t('modal.share.btn') || '分享'}
              </Button>

              {showSharePopover && (
                <div ref={sharePopoverRef} className="omnimux-inspiration-share-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="omnimux-inspiration-share-popover-header">
                    <span className="omnimux-inspiration-share-popover-title">
                      {t('modal.share.title') || '分享灵感'}
                    </span>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      className="omnimux-inspiration-share-popover-close"
                      onClick={() => setShowSharePopover(false)}
                      aria-label={t('close') || '关闭'}
                    >
                      {ICON_CLOSE}
                    </IconButton>
                  </div>

                  {shareUrl ? (
                    <div className="omnimux-inspiration-share-result">
                      <div className="omnimux-inspiration-share-link-box">
                        <input
                          type="text"
                          readOnly
                          value={shareUrl}
                          className="omnimux-inspiration-share-input"
                        />
                        <CopyButton
                          text={shareUrl}
                          label={t('modal.share.copy') || '复制'}
                          copiedLabel={t('modal.share.copied') || '已复制'}
                          size="sm"
                          variant="secondary"
                          className="omnimux-inspiration-share-copy-btn"
                        />
                      </div>
                      <div className="omnimux-inspiration-share-meta">
                        <span>{shareValidity}</span>
                        <span className="omnimux-inspiration-share-done">{t('modal.share.doneTag') || '已发布'}</span>
                      </div>
                      {shareMediaWarning ? (
                        <div className="omnimux-inspiration-share-tip" role="status" data-share-notice="media-unavailable">
                          {shareMediaWarning}
                        </div>
                      ) : null}
                    </div>
                  ) : shareRunning ? (
                    <div className="omnimux-inspiration-share-progress" role="status" aria-live="polite" aria-label={t('modal.share.progress') || '发布进度'}>
                      <ol className="omnimux-inspiration-share-steps">
                        {shareStepsList.map((step) => (
                          <li
                            key={step.id}
                            className={`omnimux-inspiration-share-step is-${step.state}`}
                            data-share-step={step.id}
                            data-share-state={step.state}
                            aria-current={step.state === 'active' ? 'step' : undefined}
                          >
                            <span className="omnimux-inspiration-share-step-dot" aria-hidden="true" />
                            <span className="omnimux-inspiration-share-step-label">{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div className="omnimux-inspiration-share-form">
                      <p className="omnimux-inspiration-share-hint">{t('modal.share.validityHint')}</p>

                      {shareFailure && (
                        <div className="omnimux-inspiration-share-tip is-error" role="alert">
                          {shareFailure}
                        </div>
                      )}

                      <Button
                        className="omnimux-inspiration-share-submit-btn"
                        variant="primary"
                        size="sm"
                        onClick={handleCreateShare}
                        loading={sharing}
                        disabled={sharing}
                      >
                        {sharing
                          ? (t('modal.share.creating') || '创建中…')
                          : shareFailure
                            ? (t('modal.share.retry') || '重新创建链接')
                            : (t('modal.share.create') || '创建链接')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>


        <InspirationPostDetail key={String(item?.source_url || item?.id)} item={item} t={t} onClose={onClose} onItemUpdated={applyItem} onReplicate={onReplicate} replicateBusy={replicateBusy} notice={<>
          {importing && <p className="omnimux-inspiration-player-status">{importStageLabel(item, t)}</p>}
          {failed && <p className="omnimux-inspiration-error-text" role="alert">{importErrorText(item, t) || t('add.status.failed')}</p>}
          {!failed && settledNotice && <p className="omnimux-inspiration-player-status" role="status">{settledNotice}</p>}
        </>} />
      </div>
    </div>
  </div>
  </PreviewModalLayer>
}
