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

  const selectAndSaveAgent = async (agent) => {
    if (busy || !agent.installed) return
    setBusy(true)
    setError('')
    try {
      const res = await api('/omnimux/agents/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agent.id }),
      })
      if (!res.ok) {
        throw new Error(res.error || t('runtime.agentFail'))
      }
      setSelectedAgent(agent.id)
      setNotice(t('runtime.agentOk', { name: agent.name }))
      if (typeof onVerified === 'function') onVerified(agent.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const testAgent = async (event, agent) => {
    event.stopPropagation()
    if (busy || !agent.installed) return
    setBusy(true)
    setError('')
    try {
      const res = await api('/omnimux/agents/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: agent.id, checkOnly: true }),
      })
      if (res.ok) {
        setTestedId(agent.id)
        setNotice(t('runtime.agentChecked', { name: agent.name }))
      } else {
        setTestedId('')
        setError(res.error || t('runtime.agentFail'))
      }
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
        setNotice(t('runtime.cliLoginOpened'))
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

  const handleModelChange = async (nextModel) => {
    if (!scope || typeof scope.set !== 'function' || busy) return
    setBusy(true)
    setError('')
    try {
      await scope.set('runtimeAgentModel', nextModel)
      setAgentModel(nextModel)
      setTestedId('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('runtime.error'))
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="omx-section-header">
        <span className="omx-section-title">{t('runtime.cliHeader')}</span>
        <div className="omx-cli-tools-row">
          <span className="omx-cli-desc">
            {t('runtime.cliCount', { count: String(agents.length) })}
          </span>
          <Button variant="ghost" disabled={busy} onClick={() => { void refreshAgents() }}>
            {t('runtime.scan')}
          </Button>
        </div>
      </div>

      <div className="omx-cli-list">
        {agents.map((agent) => {
          const isSelected = selectedAgent === agent.id
          const agentAuth = agent.auth && typeof agent.auth === 'object' ? agent.auth : null
          const isSignedOut = agentAuth !== null && agentAuth.state === 'signed-out'
          const loginSupported = agentAuth !== null && agentAuth.loginSupported === true
          const updateInfo = updates[agent.id] && typeof updates[agent.id] === 'object' ? updates[agent.id] : null
          const showUpdateTag = updateInfo !== null && updateInfo.state === 'available'
          const showUpdateButton = showUpdateTag && updateInfo.supported === true
          const updateVersion = updateInfo && typeof updateInfo.latest === 'string' ? updateInfo.latest : ''
          return (
            <div
              key={agent.id}
              className={`omx-cli-card ${isSelected ? 'selected' : ''}`}
              onClick={() => { void selectAndSaveAgent(agent) }}
            >
              <div className="omx-cli-card-top">
                <div className="omx-cli-info">
                  <div className="omx-cli-icon">
                    {agent.name ? agent.name[0] : 'C'}
                  </div>
                  <div className="omx-cli-sub">
                    <div className="omx-cli-title-row">
                      <span>{agent.name}</span>
                      {agent.installed ? <span className="omx-cli-tag">{t('runtime.installed')}</span> : null}
                      {isSignedOut ? <span className="omx-cli-tag">{t('runtime.cliNotLoggedIn')}</span> : null}
                      {showUpdateTag ? <span className="omx-cli-tag">{t('runtime.cliUpdateAvailable')}</span> : null}
                    </div>
                    <div className="omx-cli-desc">{agent.version || '未检测到程序安装'}</div>
                    {isSignedOut && !loginSupported ? (
                      <div className="omx-cli-desc">{t('runtime.cliNoLoginHint')}</div>
                    ) : null}
                  </div>
                </div>
                <div className="omx-cli-tools-row">
                  {testedId === agent.id ? <span className="omx-status-pass">{t('runtime.programChecked')}</span> : null}
                  <Button variant="ghost" disabled={busy || !agent.installed} onClick={(e) => { void testAgent(e, agent) }}>
                    {t('runtime.test')}
                  </Button>
                  {isSignedOut && loginSupported ? (
                    <Button variant="ghost" disabled={busy || loggingInId === agent.id} onClick={(e) => { void loginAgent(e, agent) }}>
                      {t('runtime.cliLogin')}
                    </Button>
                  ) : null}
                  {showUpdateButton ? (
                    <Button variant="ghost" disabled={busy || updatingId === agent.id} onClick={(e) => { void updateAgent(e, agent) }}>
                      {updatingId === agent.id
                        ? t('runtime.cliUpdating')
                        : (updateVersion ? t('runtime.cliUpdateTo', { version: updateVersion }) : t('runtime.cliUpdate'))}
                    </Button>
                  ) : null}
                </div>
              </div>

              {isSelected ? (
                <div className="omx-cli-extra">
                  <div className="omx-form-row">
                    <span className="omx-cli-desc">{t('runtime.modelLabel')}</span>
                    {(() => {
                       const agentModels = Array.isArray(agent.models) ? agent.models.filter((model) => typeof model === 'string' && model.trim()) : []
                      const rawOptions = [
                        { value: '', label: t('runtime.cliDefaultSetting') },
                        ...agentModels.map((m) => ({ value: m, label: m })),
                        ...(agentModel && !agentModels.includes(agentModel) ? [{ value: agentModel, label: agentModel }] : []),
                      ]
                      const seen = new Set()
                      const uniqueOptions = rawOptions.filter((opt) => {
                        if (seen.has(opt.value)) return false
                        seen.add(opt.value)
                        return true
                      })
                      return (
                        <DropdownSelect
                          id={`omx-agent-model-${agent.id}`}
                          value={agentModel || ''}
                          options={uniqueOptions}
                          disabled={busy}
                          onChange={(next) => { void handleModelChange(next) }}
                        />
                      )
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Existing settings export uses the single provider draft surface. */
function ByokPanel(props) {
  return <ProviderConfigPanel {...props} />
}

export { ByokPanel, AgentPanel }
