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
   * Close the dialog, handing its item back to the list first.
   *
   * Both notices below keep the dialog open so the user actually reads them: a
   * degraded import and a re-resolvable duplicate look like successes otherwise.
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
        ...(force ? { force: true } : {}),
      })
      if (res.ok && res.body?.data) {
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

  const degraded = notice?.tone === 'degraded'
  const inputsDisabled = loading || Boolean(notice)

  return (
    <ModalDialog
      open={open}
      onClose={finishClose}
      title={t('add.dialogTitle')}
      closeLabel={t('close')}
      footer={(
        degraded ? (
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
