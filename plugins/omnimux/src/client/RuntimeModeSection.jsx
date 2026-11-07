import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, DropdownSelect, InputField } from 'dsh-ui-kit'
import { useOmnimuxAuth } from './use-omnimux-auth.js'
import { ScenarioSelection } from './ScenarioSelection.jsx'
import { ProviderConfigPanel } from './ProviderConfigPanel.jsx'

async function api(path, init) {
  const response = await fetch(path, init)
  const body = await response.json()
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  }
  return body
}

/**
 * Re-architected OmniMux Models and Media Providers Section.
 * Dual-tab coexistence (Local CLI for text + Media Generation Providers),
 * topped with OmniMux Cloud status banner and grounded with global readiness indicator.
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

  const [activeTab, setActiveTab] = useState('cli')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Official Cloud Auth integration via standard useOmnimuxAuth hook
  const auth = useOmnimuxAuth({ t })
  const cloudLogged = auth.state.phase === 'ready'
  const cloudUser = auth.state.profile?.display_name || auth.state.profile?.username || ''

  let bannerDesc = t('runtime.cloudHint')
  if (cloudLogged) {
    bannerDesc = cloudUser ? `${cloudUser} · ${t('runtime.cloudLoggedHint')}` : t('runtime.cloudLoggedHint')
  }

  const handleCloudAction = useCallback(() => {
    if (cloudLogged) {
      void auth.signOut()
    } else {
      void auth.beginLogin()
    }
  }, [cloudLogged, auth])

  return (
    <div className="omx-runtime-section">
      <div className={`omx-cloud-banner ${cloudLogged ? 'logged' : ''}`}>
        <div className="omx-banner-content">
          <strong>{cloudLogged ? t('runtime.cloudLoggedTitle') : t('runtime.cloudTitle')}</strong>
          <p>{bannerDesc}</p>
        </div>
        <Button variant="secondary" className="omx-banner-btn" onClick={handleCloudAction}>
          {cloudLogged ? t('runtime.logout') : t('runtime.loginOrRegister')}
        </Button>
      </div>

      <ScenarioSelection t={t} scope={scope} value={value} busy={busy} setBusy={setBusy} setError={setError} />
      <div className="omx-segmented-tabs" role="tablist">
        <Button
          variant="ghost"
          role="tab"
          aria-selected={activeTab === 'cli'}
          disabled={busy}
          className={`omx-tab-btn ${activeTab === 'cli' ? 'active' : ''}`}
          onClick={() => { setActiveTab('cli'); setError(''); setNotice('') }}
        >
          {t('runtime.tabCli')}
        </Button>
        <Button
          variant="ghost"
          role="tab"
          aria-selected={activeTab === 'media'}
          disabled={busy}
          className={`omx-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => { setActiveTab('media'); setError(''); setNotice('') }}
        >
          {t('runtime.tabMedia')}
        </Button>
      </div>

      <div hidden={activeTab !== 'cli'}>
        <AgentPanel
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
      </div>

      <div hidden={activeTab !== 'media'}>
        <ProviderConfigPanel
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
      </div>

      {error ? <p className="omnimux-models-card__error" role="status">{error}</p> : null}
      {notice ? <p className="omnimux-models-card__desc" role="status">{notice}</p> : null}
    </div>
  )
}

/**
 * CLI Agents discovery and detail configuration panel
 */
function AgentPanel({ t, scope, value, busy, setBusy, error, setError, notice, setNotice, onVerified }) {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(value.runtimeAgentId || '')
  const initialAgentModel = typeof value.runtimeAgentModel === 'string'
    ? value.runtimeAgentModel
    : ''
  const [agentModel, setAgentModel] = useState(initialAgentModel)
  const [testedId, setTestedId] = useState('')
  const [updates, setUpdates] = useState({})
  const [loggingInId, setLoggingInId] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const loginPollRef = useRef(null)

  // 登录轮询：终端完成登录后由服务端登录态收敛，最长 2 分钟
  const stopLoginPoll = useCallback(() => {
    if (loginPollRef.current !== null) {
      clearInterval(loginPollRef.current)
      loginPollRef.current = null
    }
  }, [])

  useEffect(() => () => stopLoginPoll(), [stopLoginPoll])

  const refreshAgents = useCallback(async () => {
    try {
      const data = await api('/omnimux/agents')
      if (Array.isArray(data.agents)) {
        setAgents(data.agents)
      }
    } catch {
      // best-effort
    }
  }, [])

  const refreshUpdates = useCallback(async () => {
    try {
      const data = await api('/omnimux/agents/updates')
      if (data && data.updates && typeof data.updates === 'object') {
        setUpdates(data.updates)
      }
    } catch {
      // best-effort：版本检查不可用时不得渲染任何版本状态
    }
  }, [])

  useEffect(() => {
    void refreshAgents().then(() => refreshUpdates())
  }, [refreshAgents, refreshUpdates])

  const startLoginPoll = useCallback((id) => {
    stopLoginPoll()
    const deadline = Date.now() + 120000
    let inFlight = false
    loginPollRef.current = setInterval(() => {
      if (Date.now() >= deadline) {
        stopLoginPoll()
        return
      }
      if (inFlight) return
      inFlight = true
      api('/omnimux/agents').then((data) => {
        inFlight = false
        const list = Array.isArray(data.agents) ? data.agents : []
        setAgents(list)
        const row = list.find((item) => item && item.id === id)
        if (row && row.auth && row.auth.state === 'signed-in') {
          stopLoginPoll()
        }
      }).catch(() => {
        inFlight = false
      })
    }, 3000)
  }, [stopLoginPoll])

  const continueWithAgent = async () => {
    const agent = agents.find((item) => item && item.id === selectedAgent)
    if (busy || !agent || !agent.installed) return
    setBusy(true)
    setError('')
    setNotice(t('runtime.testingConnection'))
    try {
      const checked = await api('/omnimux/agents/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agent.id, checkOnly: true }),
      })
      if (!checked || checked.ok !== true) {
        throw new Error((checked && checked.error) || t('runtime.agentFail'))
      }
      const saved = await api('/omnimux/agents/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agent.id }),
      })
      if (!saved || saved.ok !== true) {
        throw new Error((saved && saved.error) || t('runtime.agentFail'))
      }
      if (scope && typeof scope.set === 'function' && agentModel !== (value.runtimeAgentModel || '')) {
        const savedModel = await scope.set('runtimeAgentModel', agentModel)
        if (savedModel === false) throw new Error(t('runtime.error'))
      }
      setTestedId(agent.id)
      setNotice(t('runtime.agentChecked', { name: agent.name }))
      if (typeof onVerified === 'function') onVerified(agent.id)
    } catch (err) {
      setTestedId('')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const loginAgent = async (event, agent) => {
    event.stopPropagation()
    if (busy || loggingInId) return
    setLoggingInId(agent.id)
    setError('')
    setNotice('')
    try {
      const res = await api('/omnimux/agents/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agent.id }),
      })
      if (res && res.ok && res.launched) {
        setNotice(t(res.mode === 'background' ? 'runtime.cliLoginStarted' : 'runtime.cliLoginOpened'))
        startLoginPoll(agent.id)
      } else {
        setError(t('runtime.cliLoginFail'))
      }
    } catch {
      setError(t('runtime.cliLoginFail'))
    } finally {
      setLoggingInId('')
    }
  }

  const updateAgent = async (event, agent) => {
    event.stopPropagation()
    if (busy || updatingId) return
    setUpdatingId(agent.id)
    setError('')
    setNotice('')
    try {
      const res = await api('/omnimux/agents/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agent.id }),
      })
      if (res && res.ok) {
        await refreshAgents()
        await refreshUpdates()
        setNotice(t('runtime.cliUpdateDone'))
      } else {
        setError(t('runtime.cliUpdateFail'))
      }
    } catch {
      setError(t('runtime.cliUpdateFail'))
    } finally {
      setUpdatingId('')
    }
  }

  const handleModelChange = (nextModel) => {
    if (busy) return
    setAgentModel(nextModel)
    setTestedId('')
  }

  const selected = agents.find((item) => item && item.id === selectedAgent) || null
  const agent = selected
  const selectedAuth = selected && selected.auth && typeof selected.auth === 'object' ? selected.auth : null
  const selectedSignedOut = selectedAuth !== null && selectedAuth.state === 'signed-out'
  const selectedLoginSupported = selectedAuth !== null && selectedAuth.loginSupported === true
  const selectedUpdate = selected && updates[selected.id] && typeof updates[selected.id] === 'object' ? updates[selected.id] : null
  const showSelectedUpdate = selectedUpdate !== null && selectedUpdate.state === 'available' && selectedUpdate.supported === true
  const updateVersion = selectedUpdate && typeof selectedUpdate.latest === 'string' ? selectedUpdate.latest : ''
  const modelOptions = (() => {
    const agentModels = agent && Array.isArray(agent.models)
      ? selected.models.filter((model) => typeof model === 'string' && model.trim())
      : []
    const raw = [
      { value: '', label: t('runtime.cliDefaultSetting') },
      ...agentModels.map((model) => ({ value: model, label: model })),
      ...(agentModel && !agentModels.includes(agentModel) ? [{ value: agentModel, label: agentModel }] : []),
    ]
    const seen = new Set()
    return raw.filter((option) => {
      if (seen.has(option.value)) return false
      seen.add(option.value)
      return true
    })
  })()

  return (
    <div className="omx-agent-shell">
      <div className="omx-agent-head">
        <div>
          <h3 className="omx-agent-title">{t('runtime.cliPanelTitle')}</h3>
          <p className="omx-agent-subtitle">{t('runtime.cliHeader')}</p>
        </div>
        <div className="omx-agent-head-actions">
          <Button variant="secondary" disabled={busy} onClick={() => { void refreshAgents() }}>
            {t('runtime.scan')}
          </Button>
          <span className={`omx-agent-status ${busy ? 'busy' : ''}`}>
            {busy ? t('runtime.testingConnection') : t('runtime.cliCount', { count: String(agents.length) })}
          </span>
        </div>
      </div>

      <div className="omx-agent-grid">
        {agents.map((agent) => {
          const isSelected = selectedAgent === agent.id
          return (
            <button
              key={agent.id}
              type="button"
              className={`omx-agent-card ${isSelected ? 'selected' : ''} ${agent.installed ? '' : 'disabled'}`}
              disabled={!agent.installed}
              onClick={() => {
                if (!agent.installed) return
                setSelectedAgent(agent.id)
                setTestedId('')
                setError('')
                setNotice('')
              }}
            >
              <span className="omx-agent-icon" aria-hidden="true">{agent.name ? agent.name[0] : 'C'}</span>
              <span className="omx-agent-card-copy">
                <span className="omx-agent-name">{agent.name}</span>
                <span className="omx-agent-version">{agent.version || t('runtime.notDetected')}</span>
              </span>
            </button>
          )
        })}
      </div>

      {selected ? (
        <div className="omx-agent-model-section">
          <div className="omx-agent-model-label">{t('runtime.modelLabel')} · {selected.name}</div>
          <DropdownSelect
            id={`omx-agent-model-${selected.id}`}
            value={agentModel || ''}
            options={modelOptions}
            disabled={busy}
            onChange={handleModelChange}
          />
          <div className="omx-agent-selected-actions">
            {selectedSignedOut && selectedLoginSupported ? (
              <Button variant="ghost" disabled={busy || loggingInId === selected.id} onClick={(event) => { void loginAgent(event, selected) }}>
                {t('runtime.cliLogin')}
              </Button>
            ) : null}
            {showSelectedUpdate ? (
              <Button variant="ghost" disabled={busy || updatingId === selected.id} onClick={(event) => { void updateAgent(event, selected) }}>
                {updatingId === selected.id ? t('runtime.cliUpdating') : (updateVersion ? t('runtime.cliUpdateTo', { version: updateVersion }) : t('runtime.cliUpdate'))}
              </Button>
            ) : null}
            {testedId === selected.id ? <span className="omx-status-pass">{t('runtime.programChecked')}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="omx-agent-footer">
        <Button
          variant="primary"
          disabled={busy || !selected || !selected.installed || (selectedSignedOut && selectedLoginSupported)}
          onClick={() => { void continueWithAgent() }}
        >
          {t('runtime.continue')}
        </Button>
      </div>
    </div>
  )
}


/** Existing settings export uses the single provider draft surface. */
function ByokPanel(props) {
  return <ProviderConfigPanel {...props} />
}

export { ByokPanel, AgentPanel }
