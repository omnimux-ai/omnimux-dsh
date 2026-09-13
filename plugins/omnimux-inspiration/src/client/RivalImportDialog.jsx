/**
 * Import dialog of the rival workbench.
 *
 * One input, two outcomes: an account URL is echoed back as
 * "将导入账号 @xxx（平台）" and imported as a monitored account; anything else is a
 * content URL and is handed to the plugin's original import flow unchanged. The
 * classification happens on the Host (E3), so the dialog and the Agent use the
 * same judgement about what a URL is.
 *
 * The two outcomes report through two different callbacks because they land in
 * two different places: a content row belongs to the inspiration library
 * (`onImported`), an account belongs to the monitored-account list
 * (`onAccountImported`) and is the shell's to follow up on.
 */

import { useState } from 'react'
import { Button, InputField, ModalDialog } from 'dsh-ui-kit'
import { classifyRivalInput, importRivalAccount } from './rival-api.js'
import {
  AutoAnalyzeSwitch,
  CollapsibleTagsField,
} from './import-dialog-controls.jsx'
import { readAutoAnalyzePreference } from './import-dialog-prefs.js'
import { importLocalInspiration } from './api.js'

export function RivalImportDialog({ open, t, onClose, onImported, onAccountImported }) {
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [autoAnalyze, setAutoAnalyze] = useState(() => readAutoAnalyzePreference())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [classified, setClassified] = useState(null)

  if (!open) return null

  const tagList = () => tags.split(/[,，\s]+/).filter(Boolean)

  /**
   * Resolve what the pasted link is, so the user sees the account echo *before*
   * anything is imported.
   */
  const handleClassify = async () => {
    const value = url.trim()
    if (!value) return
    setLoading(true)
    setError(null)
    try {
      const res = await classifyRivalInput(value)
      if (!res?.ok) {
        setClassified(null)
        setError(res?.body?.error || t('rivalAccounts.import.error'))
        return
      }
      setClassified(res.body?.data || null)
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const value = url.trim()
    if (!value) return
    setLoading(true)
    setError(null)
    try {
      const resolved = classified ?? (await classifyRivalInput(value)).body?.data
      if (!resolved) {
        setError(t('rivalAccounts.import.error'))
        return
      }
      if (resolved.kind === 'account') {
        const res = await importRivalAccount({ url: value, tags: tagList() })
        if (!res?.ok) {
          setError(res?.body?.error || t('rivalAccounts.import.error'))
          return
        }
        await onAccountImported?.(res.body?.data)
        return
      }
      if (resolved.kind === 'content') {
        // Unchanged legacy path: a post URL still goes to the inspiration import.
        const res = await importLocalInspiration({
          url: value,
          tags: tagList(),
          auto_analyze: autoAnalyze,
          background: true,
        })
        if (res?.ok && res.body?.data) {
          await onImported(res.body.data)
          return
        }
        setError(res?.body?.error || t('add.error'))
        return
      }
      setError(t('rivalAccounts.import.unrecognized'))
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  const echo = classified?.kind === 'account' && classified.external_id
    ? t('rivalAccounts.import.echoAccount')
      .replace('{handle}', classified.handle || classified.external_id)
      .replace('{platform}', t(`platform.${classified.platform}`))
    : classified?.kind === 'content'
      ? t('rivalAccounts.import.echoContent')
      : null

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={t('rivalAccounts.import.title')}
      closeLabel={t('close')}
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>{t('close')}</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={loading || !url.trim()}
            onClick={handleSubmit}
          >
            {loading ? t('add.importing') : t('rivalAccounts.import.submit')}
          </Button>
        </>
      )}
    >
      <form className="omnimux-rival-import-body" onSubmit={handleSubmit}>
        {error ? <div className="omnimux-inspiration-error-text" role="alert">{error}</div> : null}
        <InputField
          type="url"
          required
          label={t('rivalAccounts.import.urlLabel')}
          placeholder={t('rivalAccounts.import.urlPlaceholder')}
          value={url}
          disabled={loading}
          onChange={(event) => {
            setUrl(event.target.value)
            setClassified(null)
          }}
          onBlur={handleClassify}
        />
        {echo ? (
          <div className="omnimux-rival-import-echo" role="status" data-kind={classified.kind}>
            {echo}
          </div>
        ) : null}
        <CollapsibleTagsField
          t={t}
          value={tags}
          disabled={loading}
          onChange={setTags}
        />
        <AutoAnalyzeSwitch
          t={t}
          checked={autoAnalyze}
          disabled={loading}
          onChange={setAutoAnalyze}
        />
      </form>
    </ModalDialog>
  )
}
