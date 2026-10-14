import { useEffect, useRef, useState } from 'react'
import { Button, InputField } from 'dsh-ui-kit'
import { readStorageSettings, saveStorageSettings } from './reference-storage-api.js'

const EMPTY = { enabled: false, endpoint: '', bucket: '', region: 'auto', publicBaseUrl: '' }
const FIELDS = [
  ['endpoint', 'referenceStorage.endpoint', 'https://…'],
  ['bucket', 'referenceStorage.bucket', 'reference-media'],
  ['region', 'referenceStorage.region', 'auto'],
  ['publicBaseUrl', 'referenceStorage.publicBaseUrl', 'https://media.example.com'],
]
/** The existing settings seat owns placement; this section never reads credential values back. */
export function ReferenceStorageSection({ t }) {
  const [config, setConfig] = useState(EMPTY)
  const [revision, setRevision] = useState(null)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [credentialsWritable, setCredentialsWritable] = useState(false)
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const saving = useRef(false)
  function apply(value) {
    setConfig(value.config)
    setRevision(value.revision)
    setHasCredentials(value.hasCredentials === true)
    setCredentialsWritable(value.credentialsWritable === true)
  }
  useEffect(() => {
    let active = true
    readStorageSettings().then(value => { if (active) apply(value) }).catch(() => { if (active) setError(t('referenceStorage.readError')) })
    return () => { active = false }
  }, [])
  async function save() {
    if (saving.current || revision === null) return
    saving.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await saveStorageSettings(Object.assign({}, config, { accessKeyId, secretAccessKey, expectedRevision: revision }))
      apply(value)
      setAccessKeyId(''); setSecretAccessKey('')
      setNotice(t('referenceStorage.saved'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '存储设置未能保存，请重试')
    } finally { saving.current = false; setBusy(false) }
  }
  return <section className="omnimux-models-card" data-section="reference-storage" aria-label={t('referenceStorage.title')}>
    <div className="omnimux-models-card__head">
      <h3 className="omnimux-models-card__title">{t('referenceStorage.title')}</h3>
      <p className="omnimux-models-card__desc">{t('referenceStorage.description')}</p>
    </div>
    <div className="omnimux-models-card__body">
      <div className="omnimux-models-card__row">
        <span className="omnimux-models-card__row-label">{t('referenceStorage.enabled')}</span>
        <Button type="button" variant="outline" role="switch" aria-checked={config.enabled} disabled={busy || revision === null} onClick={() => { setConfig(Object.assign({}, config, { enabled: !config.enabled })); setNotice('') }}>{t(config.enabled ? 'referenceStorage.on' : 'referenceStorage.off')}</Button>
      </div>
      <div className="omnimux-reference-storage-fields">
        {FIELDS.map(([key, label, placeholder]) => <InputField key={key} label={t(label)} aria-label={t(label)} value={config[key] || ''} placeholder={placeholder} disabled={busy || revision === null} onChange={event => { setConfig(Object.assign({}, config, { [key]: event.target.value })); setNotice('') }} />)}
        <InputField label={t('referenceStorage.access')} aria-label={t('referenceStorage.access')} value={accessKeyId} placeholder={t(hasCredentials ? 'referenceStorage.configured' : 'referenceStorage.access')} autoComplete="off" disabled={busy || !credentialsWritable} onChange={event => setAccessKeyId(event.target.value)} />
        <InputField label={t('referenceStorage.secret')} aria-label={t('referenceStorage.secret')} type="password" value={secretAccessKey} placeholder={t(hasCredentials ? 'referenceStorage.configured' : 'referenceStorage.secret')} autoComplete="new-password" disabled={busy || !credentialsWritable} onChange={event => setSecretAccessKey(event.target.value)} />
      </div>
      <p className="omnimux-models-card__desc">{t('referenceStorage.help')}</p>
      <p className="omnimux-models-card__desc">{t('referenceStorage.boundary')}</p>
      {revision === null && !error ? <p role="status">{t('referenceStorage.loading')}</p> : null}
      {error ? <p className="omnimux-reference-storage-error" role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <Button type="button" variant="primary" disabled={busy || revision === null} onClick={() => { void save() }}>{t(busy ? 'referenceStorage.saving' : 'referenceStorage.save')}</Button>
    </div>
  </section>
}
