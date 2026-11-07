import { useEffect, useRef, useState } from 'react'
import { Button, DropdownSelect, InputField } from 'dsh-ui-kit'
import { TEXT_KEY_PROVIDERS, providerById } from './text-key-providers.js'

async function request(path, init) {
  const response = await fetch(path, init)
  const value = await response.json()
  if (!response.ok) throw new Error(value?.error || '配置未确认')
  if (!value || typeof value !== 'object') throw new Error('配置响应未确认')
  return value
}

/**
 * First-run "use your own key" step: text conversation model only.
 *
 * The provider list and model catalogue are built in (no "fetch models" call);
 * saving writes `models.text` + `capabilities:['text']` and binds the text
 * scenario to this provider before the guide closes.
 */
export function TextKeyPanel({ t, busy, setBusy, setError, setNotice, bindScenarios, onVerified }) {
  const initial = providerById('anthropic')
  const [provider, setProvider] = useState(initial.id)
  const [endpoint, setEndpoint] = useState(initial.endpoint)
  const [model, setModel] = useState(initial.models[0] || '')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [revision, setRevision] = useState(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let active = true
    void request('/omnimux/byok/config').then((value) => {
      if (!active || !alive.current) return
      if (Number.isSafeInteger(value.revision)) setRevision(value.revision)
      else setError(t('runtime.responseUnconfirmed'))
    }).catch((caught) => {
      if (active && alive.current) setError(caught instanceof Error ? caught.message : t('runtime.error'))
    })
    return () => { active = false }
  }, [setError, t])

  const choose = (id) => {
    const next = providerById(id)
    setProvider(next.id)
    setEndpoint(next.endpoint)
    setModel(next.models[0] || '')
    setError('')
    setNotice('')
  }

  const save = async () => {
    if (busy || !Number.isSafeInteger(revision)) return
    if (!endpoint.trim() || !model.trim()) {
      setError(t('runtime.keyRequired'))
      return
    }
    if (!apiKey.trim()) {
      setError(t('runtime.apiKeyRequired'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = {
        provider,
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim(),
        models: { text: model.trim() },
        capabilities: ['text'],
        expectedRevision: revision,
      }
      if (Array.isArray(bindScenarios) && bindScenarios.includes('text')) {
        body.scenarioBindings = { text: { channel: 'byok', provider } }
      }
      const value = await request('/omnimux/byok/config', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      if (value.saved !== true || !Number.isSafeInteger(value.revision)) throw new Error(t('runtime.responseUnconfirmed'))
      // Fire before any readback: the saved binding hides the guide and
      // unmounts this panel, which would drop a later callback.
      if (typeof onVerified === 'function') onVerified(provider)
      if (alive.current) setApiKey('')
    } catch (caught) {
      if (alive.current) setError(caught instanceof Error ? caught.message : t('runtime.error'))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const preset = providerById(provider)

  return (
    <div className="omx-key-panel" data-omnimux-key-draft="">
      <section className="omx-key-card">
        <div className="omx-key-card-head">
          <span className="omx-key-card-title">{t('runtime.apiProvider')}</span>
        </div>
        <div className="omx-key-chip-row" role="group" aria-label={t('runtime.apiProvider')}>
          {TEXT_KEY_PROVIDERS.map((item) => (
            <Button
              key={item.id}
              variant={item.id === provider ? 'primary' : 'ghost'}
              className="omx-key-chip"
              data-provider={item.id}
              aria-pressed={item.id === provider}
              disabled={busy}
              onClick={() => choose(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="omx-key-field">
          <span className="omx-key-label">{t('runtime.quickFill')}</span>
          <DropdownSelect
            id="omnimux-key-quick-fill"
            aria-label={t('runtime.quickFill')}
            value={provider}
            options={TEXT_KEY_PROVIDERS.map((item) => ({ value: item.id, label: item.quickLabel }))}
            disabled={busy}
            onChange={choose}
          />
        </div>
        <div className="omx-key-field">
          <span className="omx-key-label">{t('runtime.apiKey')}</span>
          <InputField
            id="omnimux-key-api-key"
            aria-label={t('runtime.apiKey')}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder={t('runtime.apiKeyPlaceholder')}
            disabled={busy}
            onChange={(event) => setApiKey(event.target.value)}
            suffix={(
              <Button variant="ghost" className="omx-key-reveal" disabled={busy} onClick={() => setShowKey((value) => !value)}>
                {showKey ? t('runtime.hideKey') : t('runtime.showKey')}
              </Button>
            )}
          />
        </div>
        <div className="omx-key-field">
          <span className="omx-key-label">{t('runtime.baseUrl')}</span>
          <InputField
            id="omnimux-key-base-url"
            aria-label={t('runtime.baseUrl')}
            value={endpoint}
            placeholder="https://"
            disabled={busy}
            onChange={(event) => setEndpoint(event.target.value)}
          />
        </div>
        <div className="omx-key-field">
          <span className="omx-key-label">{t('runtime.model')}</span>
          <DropdownSelect
            id="omnimux-key-model"
            aria-label={t('runtime.model')}
            value={model}
            options={(preset?.models || []).map((item) => ({ value: item, label: item }))}
            disabled={busy}
            onChange={setModel}
          />
        </div>
      </section>
      <div className="omx-key-actions">
        <Button variant="primary" disabled={busy || !Number.isSafeInteger(revision)} onClick={() => { void save() }}>
          {t('runtime.continue')}
        </Button>
      </div>
    </div>
  )
}
