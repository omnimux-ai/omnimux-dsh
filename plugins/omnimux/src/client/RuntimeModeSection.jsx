import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, InputField, SelectableTile } from 'dsh-ui-kit'

const MODES = ['official', 'agent', 'key']

/**
 * Runtime choice inside Settings → 插件 → 可配置 (same card as the canvas
 * defaults). `scope` writes the mode; BYOK and agent choices go through the
 * hub HTTP faces so the key never lives in the settings document.
 *
 * @param {{
 *   t: (key: string, params?: Record<string, string>) => string,
 *   scope?: {
 *     getSnapshot: () => object,
 *     subscribe: (listener: () => void) => () => void,
 *     set: (field: string, value: unknown) => Promise<void>,
 *   },
 * }} props
 */
export function RuntimeModeSection({ t, scope }) {
  const snapshot = useSyncExternalStore(
    (listener) => {
      if (!scope || typeof scope.subscribe !== 'function') return () => {}
      return scope.subscribe(listener)
    },
    () => (scope && typeof scope.getSnapshot === 'function'
      ? scope.getSnapshot()
      : { status: 'unavailable', value: undefined, writable: false }),
  )
  const value = snapshot && typeof snapshot.value === 'object' && snapshot.value ? snapshot.value : {}
  const mode = typeof value.runtimeMode === 'string' && MODES.includes(value.runtimeMode)
    ? value.runtimeMode
    : 'official'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const setMode = useCallback(async (next) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/omnimux/runtime/mode', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy])

  return (
    <div className="omnimux-models-card__group">
      <p className="omnimux-models-card__group-title">{t('runtime.title')}</p>
      <p className="omnimux-models-card__desc">{t('runtime.hint')}</p>
      <div className="omnimux-models-card__group-card">
        {MODES.map((id) => (
          <SelectableTile
            key={id}
            id={`omnimux-runtime-${id}`}
            selectionType="radio"
            selected={mode === id}
            title={t(`runtime.${id}`)}
            description={t(`runtime.${id}Hint`)}
            disabled={busy}
            onChange={() => { void setMode(id) }}
          />
        ))}
        {mode === 'key' ? (
          <ByokPanel
            t={t}
            scope={scope}
            value={value}
            busy={busy}
            setBusy={setBusy}
            error={error}
            setError={setError}
            notice={notice}
            setNotice={setNotice}
          />
        ) : null}
        {mode === 'agent' ? (
          <AgentPanel
            t={t}
            value={value}
            busy={busy}
            setBusy={setBusy}
            error={error}
            setError={setError}
            notice={notice}
            setNotice={setNotice}
          />
        ) : null}
      </div>
      {error ? <p className="omnimux-models-card__error" role="status">{error}</p> : null}
      {notice ? <p className="omnimux-models-card__desc" role="status">{notice}</p> : null}
    </div>
  )
}

export { ByokPanel, AgentPanel }

async function api(path, init) {
  const response = await fetch(path, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  }
  return body
}

function ByokPanel({ t, value, busy, setBusy, error, setError, notice, setNotice, onVerified }) {
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [caps, setCaps] = useState({ image: false, video: false, audio: false })
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    let cancelled = false
    api('/omnimux/byok/config').then((config) => {
      if (cancelled) return
      setEndpoint(config.endpoint || '')
      setModel(config.model || '')
      setHasKey(config.hasKey === true)
      setCaps({
        image: config.mediaImage === true,
        video: config.mediaVideo === true,
        audio: config.mediaAudio === true,
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api('/omnimux/byok/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          model,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          mediaImage: caps.image,
          mediaVideo: caps.video,
          mediaAudio: caps.audio,
        }),
      })
      setHasKey(body.hasKey === true)
      setApiKey('')
      setNotice(t('runtime.saved'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, endpoint, model, apiKey, caps, t])

  const test = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api('/omnimux/byok/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          model,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      })
      if (result.ok === true) {
        setNotice(t('runtime.testOk'))
        if (typeof onVerified === 'function') onVerified()
      } else {
        setError(t('runtime.testFail', { status: String(result.status ?? '') }))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, endpoint, model, apiKey, t])

  const clear = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/omnimux/byok/config', { method: 'DELETE' })
      setEndpoint('')
      setModel('')
      setApiKey('')
      setHasKey(false)
      setCaps({ image: false, video: false, audio: false })
      setNotice(t('runtime.cleared'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, t])

  const toggleCap = (kind) => {
    setCaps((current) => ({ ...current, [kind]: !current[kind] }))
  }

  return (
    <div className="omnimux-runtime-byok">
      <div className="omnimux-models-card__row">
        <span className="omnimux-models-card__row-label">{t('runtime.endpoint')}</span>
        <div className="omnimux-models-card__row-body">
          <InputField
            value={endpoint}
            placeholder={t('runtime.endpointPlaceholder')}
            disabled={busy}
            onChange={(event) => setEndpoint(event.target.value)}
          />
        </div>
      </div>
      <div className="omnimux-models-card__row">
        <span className="omnimux-models-card__row-label">{t('runtime.keyField')}</span>
        <div className="omnimux-models-card__row-body">
          <InputField
            type="password"
            value={apiKey}
            placeholder={hasKey ? t('runtime.keyStored') : t('runtime.keyPlaceholder')}
            disabled={busy}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>
      </div>
      <div className="omnimux-models-card__row">
        <span className="omnimux-models-card__row-label">{t('runtime.model')}</span>
        <div className="omnimux-models-card__row-body">
          <InputField
            value={model}
            placeholder={t('runtime.modelPlaceholder')}
            disabled={busy}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>
      </div>
      <div className="omnimux-models-card__row">
        <span className="omnimux-models-card__row-label">{t('runtime.mediaTitle')}</span>
        <div className="omnimux-models-card__row-body">
          {['image', 'video', 'audio'].map((kind) => (
            <SelectableTile
              key={kind}
              id={`omnimux-byok-cap-${kind}`}
              selectionType="checkbox"
              selected={caps[kind]}
              title={t(`runtime.media${kind[0].toUpperCase()}${kind.slice(1)}`)}
              disabled={busy}
              onChange={() => toggleCap(kind)}
            />
          ))}
        </div>
      </div>
      <div className="omnimux-models-card__row">
        <span className="omnimux-models-card__row-label" />
        <div className="omnimux-models-card__row-body">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { void save() }}>
            {t('runtime.save')}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { void test() }}>
            {busy ? t('runtime.testing') : t('runtime.test')}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { void clear() }}>
            {t('runtime.clear')}
          </Button>
        </div>
      </div>
      {value.runtimeKeyVerified === true ? (
        <p className="omnimux-models-card__desc">{t('runtime.testOk')}</p>
      ) : null}
    </div>
  )
}

function AgentPanel({ t, value, busy, setBusy, error, setError, notice, setNotice, onVerified }) {
  const [agents, setAgents] = useState(null)
  const [scanning, setScanning] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    setError('')
    try {
      const body = await api('/omnimux/agents')
      setAgents(Array.isArray(body.agents) ? body.agents : [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  const select = useCallback(async (id) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api('/omnimux/agents/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (result.ok === true) {
        setNotice(t('runtime.agentOk', { name: id }))
        if (typeof onVerified === 'function') onVerified(id)
      } else {
        setError(t('runtime.agentFail'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, t])

  if (agents === null) {
    return <p className="omnimux-models-card__desc">{t('runtime.scanning')}</p>
  }
  if (agents.length === 0 || agents.every((row) => row.installed !== true)) {
    return (
      <div className="omnimux-runtime-agents">
        <p className="omnimux-models-card__desc">{t('runtime.noAgents')}</p>
        <Button type="button" size="sm" variant="ghost" disabled={scanning} onClick={() => { void scan() }}>
          {scanning ? t('runtime.scanning') : t('runtime.scan')}
        </Button>
      </div>
    )
  }
  const activeId = typeof value.runtimeAgentId === 'string' ? value.runtimeAgentId : ''
  return (
    <div className="omnimux-runtime-agents">
      {agents.map((agent) => {
        const active = activeId === agent.id && value.runtimeAgentVerified === true
        return (
          <SelectableTile
            key={agent.id}
            id={`omnimux-agent-${agent.id}`}
            selectionType="radio"
            selected={active}
            title={agent.name || agent.id}
            description={agent.installed ? `${t('runtime.installed')} ${agent.version || ''}`.trim() : undefined}
            disabled={busy || agent.installed !== true}
            onChange={() => { void select(agent.id) }}
          />
        )
      })}
      <Button type="button" size="sm" variant="ghost" disabled={scanning} onClick={() => { void scan() }}>
        {scanning ? t('runtime.scanning') : t('runtime.scan')}
      </Button>
    </div>
  )
}
