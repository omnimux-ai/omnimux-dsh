import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, DropdownSelect, InputField } from 'dsh-ui-kit'
import { CONSUMPTION_SCENARIOS } from '../settings/runtime-mode.js'

async function request(path, init) {
  const response = await fetch(path, init)
  const value = await response.json()
  if (!response.ok) throw new Error(value?.error || '配置未确认')
  if (!value || typeof value !== 'object') throw new Error('配置响应未确认')
  return value
}

/** A check describes one draft; it never saves or chooses an execution service. */
export function ProviderConfigPanel({ t, value, busy, setBusy, setError, setNotice }) {
  const [provider, setProvider] = useState('custom')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState({})
  const [confirmed, setConfirmed] = useState(null)
  const confirmedRef = useRef(null)
  const providerRef = useRef(provider)
  providerRef.current = provider
  const initialized = useRef(false)
  const reads = useRef(0)
  const credentialEvents = useRef(new Map())
  const [checked, setChecked] = useState(null)
  const generation = useRef(0)
  const [draftVersion, setDraftVersion] = useState(0)
  const alive = useRef(true)
  const savedVersion = JSON.stringify([value?.byokProviders || [], value?.scenarioBindings || {}])
  useEffect(() => {
    generation.current += 1
    setDraftVersion(generation.current)
    setChecked(null)
  }, [savedVersion])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; generation.current += 1 }
  }, [])
  const editDraft = (apply) => {
    initialized.current = true
    generation.current += 1
    setDraftVersion(generation.current)
    setChecked(null)
    setNotice('')
    apply()
  }
  const reload = useCallback(async () => {
    const readId = ++reads.current
    let next
    try {
      next = await request('/omnimux/byok/config')
      if (!Number.isSafeInteger(next.revision)) throw new Error(t('runtime.responseUnconfirmed'))
    } catch (error) {
      if (!alive.current || readId !== reads.current) return confirmedRef.current
      throw error
    }
    if (!alive.current || readId !== reads.current) return confirmedRef.current || next
    if (alive.current) {
      const previous = confirmedRef.current
      const currentProvider = next.providers?.find((item) => item.provider === providerRef.current)
      const previousProvider = previous?.providers?.find((item) => item.provider === providerRef.current)
      if (previous && (next.revision < previous.revision
        || (next.revision === previous.revision && (currentProvider?.credentialVersion || 0) < (previousProvider?.credentialVersion || 0))
        || (currentProvider?.credentialVersion || 0) < (credentialEvents.current.get(providerRef.current) || 0))) return previous
      const identity = (snapshot) => JSON.stringify([snapshot?.revision, snapshot?.providers?.map((item) => [item.provider, item.revision, item.credentialVersion])])
      if (previous && identity(previous) !== identity(next)) {
        generation.current += 1
        setDraftVersion(generation.current)
        setChecked(null)
        setNotice('')
      }
      confirmedRef.current = next
      setConfirmed(next)
      if (!initialized.current) {
        const saved = next.providers?.find((item) => item.provider === providerRef.current)
        if (saved) { setEndpoint(saved.endpoint || ''); setModels(saved.models || {}) }
        initialized.current = true
      }
    }
    return next
  }, [t, setNotice])
  useEffect(() => {
    let active = true
    void reload().catch((caught) => { if (active) setError(caught.message) })
    return () => { active = false }
  }, [reload, setError])
  useEffect(() => {
    if (!initialized.current) return
    void reload().catch((caught) => { if (alive.current) setError(caught.message) })
  }, [savedVersion, reload, setError])
  useEffect(() => {
    const invalidate = (event) => {
      if (event?.payload?.provider && event.payload.provider !== providerRef.current) return
      const saved = confirmedRef.current?.providers?.find((item) => item.provider === providerRef.current)
      if (event?.payload?.provider && (saved?.credentialVersion || 0) >= event.payload.credentialVersion) return
      if (event?.payload?.provider) credentialEvents.current.set(event.payload.provider, event.payload.credentialVersion)
      generation.current += 1
      setDraftVersion(generation.current)
      setChecked(null)
      setNotice('')
      void reload().catch((caught) => { if (alive.current) setError(caught.message) })
    }
    const stop = window.__omnimuxHubEvents?.subscribe?.('omnimux:provider-config:credential-changed', invalidate)
    const refresh = () => invalidate()
    window.addEventListener('focus', refresh)
    return () => { stop?.(); window.removeEventListener('focus', refresh) }
  }, [reload, setError, setNotice])
  const selectProvider = (next) => editDraft(() => {
    const saved = confirmed?.providers?.find((item) => item.provider === next)
    setProvider(next)
    setEndpoint(saved?.endpoint || '')
    setModels(saved?.models || {})
    setApiKey('')
  })
  const payload = () => {
    const selected = Object.fromEntries(Object.entries(models)
      .filter(([, model]) => typeof model === 'string' && model.trim())
      .map(([scenario, model]) => [scenario, model.trim()]))
    return { provider, endpoint, apiKey: apiKey.trim(), models: selected,
      capabilities: Object.keys(selected), expectedRevision: confirmed?.revision }
  }
  const save = async () => {
    if (busy || !confirmed) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const value = await request('/omnimux/byok/config', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()),
      })
      if (value.saved !== true || !Number.isSafeInteger(value.revision)) throw new Error(t('runtime.responseUnconfirmed'))
      if (!alive.current) return
      const selectedProvider = provider
      reads.current += 1
      const latest = await request('/omnimux/byok/config')
      const savedCredential = value.providers?.find((item) => item.provider === provider)
      const currentCredential = latest.providers?.find((item) => item.provider === provider)
      const observed = confirmedRef.current
      const observedProvider = observed?.providers?.find((item) => item.provider === selectedProvider)
      if (!alive.current || providerRef.current !== selectedProvider || latest.revision !== value.revision
        || currentCredential?.revision !== savedCredential?.revision
        || currentCredential?.credentialVersion !== savedCredential?.credentialVersion
        || (credentialEvents.current.get(selectedProvider) || 0) > currentCredential?.credentialVersion
        || (observed?.revision > latest.revision)
        || (observed?.revision === latest.revision && observedProvider?.credentialVersion !== currentCredential?.credentialVersion)) {
        if (alive.current) await reload()
        return
      }
      reads.current += 1
      confirmedRef.current = latest
      setConfirmed(latest)
      setApiKey('')
      setChecked(null)
      setError('')
      setNotice(t('runtime.savedNotTested'))
    } catch (caught) {
      if (!alive.current) return
      setError(caught instanceof Error ? caught.message : t('runtime.error'))
      try { await reload() } catch (readError) { setError(readError.message) }
    } finally { setBusy(false) }
  }
  const check = async () => {
    if (busy || !confirmed) return
    const version = generation.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const value = await request('/omnimux/byok/test', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()),
      })
      if (!alive.current) return
      if (version !== generation.current) { setNotice(t('runtime.needsConfirmation')); return }
      if (value.ok !== true || value.checkType !== 'offline-config' || value.persisted !== false) throw new Error(t('runtime.responseUnconfirmed'))
      const snapshot = await reload()
      const currentCredential = snapshot.providers?.find((item) => item.provider === provider)?.credentialVersion || 0
      if (!alive.current) return
      if (version !== generation.current || snapshot.revision !== value.revision || currentCredential !== value.credentialVersion) {
        setNotice(t('runtime.needsConfirmation'))
        return
      }
      setChecked({ version, time: value.checkedAt, credentialVersion: value.credentialVersion })
      setNotice('')
    } catch (caught) {
      if (alive.current && version === generation.current) {
        setError(caught instanceof Error ? caught.message : t('runtime.error'))
        try { await reload() } catch (readError) { if (alive.current) setError(readError.message) }
      }
    } finally { setBusy(false) }
  }
  const saved = confirmed?.providers?.find((item) => item.provider === provider)
  return (
    <div className="omx-provider-form" data-omnimux-provider-draft="">
      <p className="omnimux-models-card__desc">{t('runtime.serviceHint')}</p>
      <div className="omx-form-row">
        <span className="omx-section-title">{t('runtime.provider')}</span>
        <DropdownSelect id="omnimux-service-provider" aria-label={t('runtime.provider')} value={provider}
          options={['custom', 'openai', 'openrouter', 'fal', 'siliconflow'].map((id) => ({ value: id, label: id }))}
          disabled={busy} onChange={selectProvider} />
      </div>
      <div className="omx-form-row">
        <span className="omx-section-title">{t('runtime.endpoint')}</span>
        <InputField aria-label={t('runtime.endpoint')} value={endpoint} placeholder="https://" disabled={busy}
          onChange={(event) => editDraft(() => setEndpoint(event.target.value))} />
      </div>
      <div className="omx-form-row">
        <span className="omx-section-title">{t('runtime.keyField')}</span>
        <InputField aria-label={t('runtime.keyField')} type="password" value={apiKey} disabled={busy}
          placeholder={saved?.configured ? t('runtime.keyStored') : t('runtime.keyPlaceholder')}
          onChange={(event) => editDraft(() => setApiKey(event.target.value))} />
      </div>
      {CONSUMPTION_SCENARIOS.map((scenario) => (
        <div key={scenario} className="omx-form-row">
          <span className="omx-section-title">{t(`runtime.scenario.${scenario}`)}</span>
          <InputField aria-label={`${t(`runtime.scenario.${scenario}`)} ${t('runtime.model')}`} value={models[scenario] || ''}
            placeholder={t('runtime.modelPlaceholder')} disabled={busy}
            onChange={(event) => editDraft(() => setModels((current) => ({ ...current, [scenario]: event.target.value })))} />
        </div>
      ))}
      <p className="omnimux-models-card__desc" role="status">
        {checked?.version === draftVersion ? t('runtime.configChecked') : t('runtime.notChecked')}
      </p>
      <div className="omx-provider-form-actions">
        <Button variant="ghost" disabled={busy || !confirmed} onClick={() => { void check() }}>{t('runtime.checkConfig')}</Button>
        <Button variant="primary" disabled={busy || !confirmed} onClick={() => { void save() }}>{t('runtime.save')}</Button>
      </div>
    </div>
  )
}
