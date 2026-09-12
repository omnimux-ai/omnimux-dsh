import { useState } from 'react'
import { Button, InputField, ModalDialog } from 'dsh-ui-kit'
import { importLocalInspiration } from './api.js'
import {
  AutoAnalyzeSwitch,
  CollapsibleTagsField,
} from './import-dialog-controls.jsx'
import { readAutoAnalyzePreference } from './import-dialog-prefs.js'
import { classifyRivalInput, importRivalAccount } from './rival-api.js'

/**
 * Top-level「导入灵感」dialog.
 *
 * One input, two outcomes, decided by the Host before anything is imported: an
 * account profile URL is echoed back as「将导入账号 @xxx（平台）」and imported as a
 * monitored 对标账号, a post URL keeps the original content import, and a link
 * the Host cannot place is refused with an explanation instead of being stored
 * as a broken row.
 *
 * The classification is the same call (E3) the rival workbench makes, so both
 * entry points agree about a URL. Without it an account URL fell through to the
 * content importer, where the download failed and the row degraded to a bare
 * link — the stored artifact of a link nobody could parse.
 *
 * `onImported` still receives a content row; `onAccountImported` receives the
 * monitored account. Two callbacks rather than one tagged payload: the two
 * landings share nothing (a row enters the grid, an account enters the
 * workbench), and the caller's contract stays explicit about which is which.
 */
export function InspirationInlineImportDialog({ open, t, onClose, onImported, onAccountImported }) {
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [autoAnalyze, setAutoAnalyze] = useState(() => readAutoAnalyzePreference())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [classified, setClassified] = useState(null)

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

  const tagList = () => tags.split(/[,，\s]+/).filter(Boolean)

  /**
   * Ask the Host what the pasted link is.
   *
   * @param {string} value
   * @returns {Promise<{ ok: boolean, kind?: string, data?: object, message?: string }>}
   *   `message` is already localized when the Host refuses the URL
   */
  const classify = async (value) => {
    try {
      const res = await classifyRivalInput(value)
      if (!res?.ok) {
        return {
          ok: false,
          // An unplaceable host is refused by the Host as `unrecognized-url`
          // with a message the dialog must not print verbatim: it is not
          // localized, so the locale key is used instead.
          message: res?.body?.code === 'unrecognized-url'
            ? t('rivalAccounts.import.unrecognized')
            : (res?.body?.error || t('add.error')),
        }
      }
      return { ok: true, kind: res.body?.data?.kind || 'unknown', data: res.body?.data || null }
    } catch (err) {
      return { ok: false, message: String(err?.message || err) }
    }
  }

  /**
   * Echo the verdict while the user is still deciding, so what the import is
   * about to become is on screen before the button is pressed.
   */
  const handleClassify = async () => {
    const value = url.trim()
    if (!value || loading) return
    setError(null)
    const result = await classify(value)
    if (!result.ok) {
      setClassified(null)
      setError(result.message)
      return
    }
    if (result.kind === 'unknown') {
      setClassified(null)
      setError(t('rivalAccounts.import.unrecognized'))
      return
    }
    setClassified(result.data)
  }

  /**
   * @param {boolean} force re-resolve an already stored link that has no video
   */
  const submitImport = async (force) => {
    const value = url.trim()
    if (!value) return
    setLoading(true)
    setError(null)
    try {
      // Classify before importing: an account URL must never reach the content
      // importer, and a link the Host cannot place must not become a row.
      const resolved = classified
        ? { ok: true, kind: classified.kind, data: classified }
        : await classify(value)
      if (!resolved.ok) {
        setError(resolved.message)
        return
      }
      if (resolved.kind === 'account') {
        const res = await importRivalAccount({ url: value, tags: tagList() })
        if (res?.ok && res.body?.data) {
          await onAccountImported?.(res.body.data)
          onClose()
          return
        }
        setError(res?.body?.error || t('add.error'))
        return
      }
      if (resolved.kind !== 'content') {
        // facebook / threads / an unknown host: there is nothing to monitor and
        // nothing to download, so the only honest answer is no import at all.
        setClassified(null)
        setError(t('rivalAccounts.import.unrecognized'))
        return
      }

      const res = await importLocalInspiration({
        url: value,
        tags: tagList(),
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

  // The echo reuses the rivalry workbench's account wording verbatim — one
  // sentence, one translation — and only the content verdict gets its own key,
  // because it names what this dialog is about to do.
  const kind = classified?.kind
  const echo = kind === 'account'
    ? t('rivalAccounts.import.echoAccount')
      .replace('{handle}', classified.handle || classified.external_id || '')
      .replace('{platform}', t(`platform.${classified.platform}`))
    : kind === 'content'
      ? t('add.echoContent')
      : null

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
          onChange={(e) => {
            setUrl(e.target.value)
            // The verdict belongs to the URL it was made for.
            setClassified(null)
          }}
          onBlur={handleClassify}
        />
        {echo ? (
          <div className="omnimux-inspiration-import-echo" role="status" data-kind={kind}>{echo}</div>
        ) : null}
        <CollapsibleTagsField
          t={t}
          value={tags}
          disabled={inputsDisabled}
          onChange={setTags}
        />
        {/* The AI breakdown only exists for content: an account is monitored, not
            deconstructed, so the switch would be a promise the import cannot keep. */}
        {kind === 'account' ? null : (
          <AutoAnalyzeSwitch
            t={t}
            checked={autoAnalyze}
            disabled={inputsDisabled}
            onChange={setAutoAnalyze}
          />
        )}
      </form>
    </ModalDialog>
  )
}
