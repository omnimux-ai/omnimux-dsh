import { useState } from 'react'
import { Button, InputField, ModalDialog } from 'dsh-ui-kit'
import { importLocalInspiration } from './api.js'
import {
  AutoAnalyzeSwitch,
  CollapsibleTagsField,
} from './import-dialog-controls.jsx'
import { readAutoAnalyzePreference } from './import-dialog-prefs.js'

export function InspirationInlineImportDialog({ open, t, onClose, onImported }) {
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [autoAnalyze, setAutoAnalyze] = useState(() => readAutoAnalyzePreference())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  if (!open) return null

  /**
   * Close the dialog from a control that is not submitting — the footer buttons
   * and the backdrop.
   *
   * The degraded notice is the one state that carries an item to hand back: it
   * says what was stored without a video and has no other action. It is handed
   * over here rather than at the moment it was set, so dismissing the dialog is
   * what adds the item, exactly as before.
   */
  const finishClose = () => {
    const pending = notice
    setNotice(null)
    if (pending) onImported(pending.item)
    onClose()
  }

  /**
   * @param {boolean} force re-resolve an already stored link that has no video
   */
  const submitImport = async (force) => {
    setLoading(true)
    setError(null)
    try {
      const tagList = tags.split(/[,，\s]+/).filter(Boolean)
      const res = await importLocalInspiration({
        url: url.trim(),
        tags: tagList,
        auto_analyze: autoAnalyze,
        // Opt in to the background job: the request answers 202 with a
        // placeholder row instead of holding the dialog open for the download and
        // the AI breakdown. The grid then polls that row to completion.
        background: true,
        ...(force ? { force: true } : {}),
      })
      if (res.ok && res.body?.data) {
        if (res.status === 202) {
          // The job runs on the server, so the dialog is finished the moment the
          // placeholder exists: the row it publishes *is* the progress report and
          // the grid already polls it. Handing the row over and closing in the
          // same turn is what makes the import "background" from the user's side —
          // stopping here to make them press a second button would reintroduce
          // exactly the wait the background job exists to remove. The degraded
          // case a background import can still hit is discovered later, by the
          // poll, and is reported on the card (`add.degradedNotice`).
          onImported(res.body.data)
          onClose()
          return
        }
        if (res.body.media_degraded) {
          // Stored as a link/image: the video was not obtained, and the user must
          // be told instead of the dialog closing as if the download succeeded.
          setNotice({ item: res.body.data, tone: 'degraded', messageKey: 'add.degradedNotice' })
          return
        }
        onImported(res.body.data)
        onClose()
      } else if (res.status === 409 && res.body?.data) {
        const existing = res.body.data
        if (res.body.upgradable || !existing.local_paths?.video) {
          // Already stored without a video: offer the only action that can fix it.
          setNotice({ item: existing, tone: 'duplicate', messageKey: 'add.duplicateVideoHint' })
        } else {
          onImported(existing)
          onClose()
        }
      } else {
        setError(res.body?.error || t('add.error'))
      }
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!url.trim()) return
    void submitImport(false)
  }

  // The degraded notice is the only one that closes on a plain "close": it says
  // what was stored and has nothing to ask, while the duplicate notice carries
  // the re-resolve button that is its whole point.
  const acknowledged = notice?.tone === 'degraded'
  const inputsDisabled = loading || Boolean(notice)

  return (
    <ModalDialog
      open={open}
      onClose={finishClose}
      title={t('add.dialogTitle')}
      closeLabel={t('close')}
      footer={(
        acknowledged ? (
          <Button variant="primary" onClick={finishClose}>{t('close')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={finishClose} disabled={loading}>{t('close')}</Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={loading || !url.trim()}
              onClick={handleSubmit}
            >
              {loading ? t('add.importing') : t('add.submit')}
            </Button>
          </>
        )
      )}
    >
      <form className="omnimux-inspiration-import-body" onSubmit={handleSubmit}>
        {error ? <div className="omnimux-inspiration-error-text" role="alert">{error}</div> : null}
        {notice ? (
          <div className="omnimux-inspiration-import-notice" role="status">
            <p>{t(notice.messageKey)}</p>
            {notice.tone === 'duplicate' ? (
              <Button
                variant="primary"
                loading={loading}
                disabled={loading}
                onClick={() => { void submitImport(true) }}
              >
                {t('add.reimportVideo')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <InputField
          type="url"
          required
          label={t('add.urlLabel')}
          placeholder={t('add.urlPlaceholder')}
          value={url}
          disabled={inputsDisabled}
          onChange={(e) => setUrl(e.target.value)}
        />
        <CollapsibleTagsField
          t={t}
          value={tags}
          disabled={inputsDisabled}
          onChange={setTags}
        />
        <AutoAnalyzeSwitch
          t={t}
          checked={autoAnalyze}
          disabled={inputsDisabled}
          onChange={setAutoAnalyze}
        />
      </form>
    </ModalDialog>
  )
}
