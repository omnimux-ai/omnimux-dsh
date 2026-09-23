import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, DropdownSelect, InputField } from 'dsh-ui-kit'
import { useOmnimuxAuth } from './use-omnimux-auth.js'
import { DEFAULT_MEDIA_MODELS } from '../settings/runtime-mode.js'

/**
 * Supported media provider presets and model options
 */
const MEDIA_PROVIDER_PRESETS = {
  fal: {
    id: 'fal',
    name: 'fal.ai',
    tag: '推荐首选',
    capsDesc: '图片 (Flux / SD3.5) · 视频 (Kling / Minimax / Luma) · 音频 (F5-TTS)',
    defaultEndpoint: 'https://fal.run',
    keyPlaceholder: 'fal_key_...',
    models: {
      image: ['fal-ai/flux/dev', 'fal-ai/flux-pro', 'fal-ai/stable-diffusion-v35-large'],
      video: ['fal-ai/kling-video/v1/standard', 'fal-ai/minimax-video', 'fal-ai/luma-dream-machine'],
      audio: ['fal-ai/f5-tts', 'fal-ai/playht/tts'],
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    tag: '原生媒体',
    capsDesc: '图片 (DALL·E 3) · 音频 (TTS-1 / Whisper) · 视频 (Sora API)',
    defaultEndpoint: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    models: {
      image: ['dall-e-3', 'dall-e-2'],
      video: ['sora-preview-1.0'],
      audio: ['tts-1-hd', 'tts-1', 'whisper-1'],
    },
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    tag: '全聚合',
    capsDesc: '全聚合接口路由 · 多模态与多渠道生图模型',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    models: {
      image: ['black-forest-labs/flux-1.1-pro', 'stabilityai/stable-diffusion-3.5-large'],
      video: ['minimax/video-01'],
      audio: ['openai/tts-1'],
    },
  },
}

async function api(path, init) {
  const response = await fetch(path, init)
  const body = await response.json().catch(() => ({}))
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

      <div className="omx-segmented-tabs" role="tablist">
        <Button
          variant="ghost"
          role="tab"
          aria-selected={activeTab === 'cli'}
          className={`omx-tab-btn ${activeTab === 'cli' ? 'active' : ''}`}
          onClick={() => { setActiveTab('cli'); setError(''); setNotice('') }}
        >
          {t('runtime.tabCli')}
        </Button>
        <Button
          variant="ghost"
          role="tab"
          aria-selected={activeTab === 'media'}
          className={`omx-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => { setActiveTab('media'); setError(''); setNotice('') }}
        >
          {t('runtime.tabMedia')}
        </Button>
      </div>

      {activeTab === 'cli' ? (
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
      ) : null}

      {activeTab === 'media' ? (
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

      <div className="omx-status-bar">
        <div>
          <span>{t('runtime.currentChat')}</span>
          <strong>{value.runtimeAgentId ? value.runtimeAgentId : t('runtime.defaultChat')}</strong>
          <span className="omx-dot-separator">·</span>
          <span>{t('runtime.currentMedia')}</span>
          <strong>{value.runtimeMediaProvider ? value.runtimeMediaProvider : t('runtime.unconfigured')}</strong>
        </div>
        <div>
          {value.runtimeKeyVerified ? <span className="omx-status-pass">{t('runtime.mediaReady')}</span> : null}
        </div>
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
  const [agentModel, setAgentModel] = useState(value.runtimeAgentModel || '')
  const [testedId, setTestedId] = useState('')

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

  useEffect(() => {
    void refreshAgents()
  }, [refreshAgents])

  const selectAndSaveAgent = async (agent) => {
    if (busy || !agent.installed) return
    const prevAgent = selectedAgent
    setSelectedAgent(agent.id)
    if (prevAgent !== agent.id) {
      setAgentModel('')
      if (scope && typeof scope.set === 'function') {
        void scope.set('runtimeAgentModel', '')
      }
    }
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
      // Explicitly switch runtimeMode to 'agent' to ensure official sign-in bypass
      await api('/omnimux/runtime/mode', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'agent' }),
      })
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
        body: JSON.stringify({ id: agent.id }),
      })
      if (res.ok) {
        setTestedId(agent.id)
        setNotice(t('runtime.agentOk', { name: agent.name }))
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

  const handleModelChange = async (nextModel) => {
    setAgentModel(nextModel)
    if (scope && typeof scope.set === 'function') {
      try {
        await scope.set('runtimeAgentModel', nextModel)
      } catch {
        // best effort
      }
    }
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
                    </div>
                    <div className="omx-cli-desc">{agent.version || '未检测到程序安装'}</div>
                  </div>
                </div>
                <div className="omx-cli-tools-row">
                  {testedId === agent.id ? <span className="omx-status-pass">✓ 通过</span> : null}
                  <Button variant="ghost" disabled={busy || !agent.installed} onClick={(e) => { void testAgent(e, agent) }}>
                    {t('runtime.test')}
                  </Button>
                </div>
              </div>

              {isSelected ? (
                <div className="omx-cli-extra">
                  <div className="omx-form-row">
                    <span className="omx-cli-desc">{t('runtime.modelLabel')}</span>
                    {(() => {
                      const agentModels = Array.isArray(agent.models) ? agent.models : []
                      const isSafeModel = typeof agentModel === 'string' && agentModel.trim() !== '' && !agentModel.trim().startsWith('-') && /^[a-zA-Z0-9_.:/-]+$/.test(agentModel.trim())
                      const rawOptions = [
                        { value: '', label: t('runtime.cliDefaultSetting') },
                        ...agentModels.map((m) => ({ value: m, label: m })),
                        ...(agentModel && !agentModels.includes(agentModel) && isSafeModel ? [{ value: agentModel, label: agentModel }] : []),
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

/**
 * Media Generation Providers configuration panel (fal.ai, OpenAI, OpenRouter)
 */
function ByokPanel({ t, scope, value, busy, setBusy, error, setError, notice, setNotice, onVerified }) {
  const [provider, setProvider] = useState(value.runtimeMediaProvider || 'fal')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [endpoint, setEndpoint] = useState('')
  const [imgModel, setImgModel] = useState(value.runtimeMediaImageModel || DEFAULT_MEDIA_MODELS.image)
  const [vidModel, setVidModel] = useState(value.runtimeMediaVideoModel || DEFAULT_MEDIA_MODELS.video)
  const [audModel, setAudModel] = useState(value.runtimeMediaAudioModel || DEFAULT_MEDIA_MODELS.audio)
  const [modelsExpanded, setModelsExpanded] = useState(false)

  const preset = MEDIA_PROVIDER_PRESETS[provider] || MEDIA_PROVIDER_PRESETS.fal

  useEffect(() => {
    let cancelled = false
    api('/omnimux/byok/config').then((cfg) => {
      if (cancelled) return
      if (cfg.provider) setProvider(cfg.provider)
      if (cfg.endpoint) setEndpoint(cfg.endpoint)
      setHasKey(cfg.hasKey === true)
      if (cfg.mediaImageModel) setImgModel(cfg.mediaImageModel)
      if (cfg.mediaVideoModel) setVidModel(cfg.mediaVideoModel)
      if (cfg.mediaAudioModel) setAudModel(cfg.mediaAudioModel)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleProviderSelect = (pId) => {
    setProvider(pId)
    const pCfg = MEDIA_PROVIDER_PRESETS[pId]
    if (pCfg) {
      setEndpoint(pCfg.defaultEndpoint)
      setImgModel(pCfg.models.image[0])
      setVidModel(pCfg.models.video[0])
      setAudModel(pCfg.models.audio[0])
    }
    setHasKey(false)
    setApiKey('')
    api('/omnimux/byok/config').then((cfg) => {
      if (cfg.provider === pId) {
        setHasKey(cfg.hasKey === true)
      }
    }).catch(() => {})
  }

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
          provider,
          endpoint,
          apiKey: apiKey.trim(),
          model: imgModel,
          mediaImageModel: imgModel,
          mediaVideoModel: vidModel,
          mediaAudioModel: audModel,
          mediaImage: true,
          mediaVideo: true,
          mediaAudio: true,
        }),
      })
      // Ensure runtimeMode is key
      await api('/omnimux/runtime/mode', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'key' }),
      })
      setHasKey(body.hasKey === true)
      setApiKey('')
      setNotice(t('runtime.saved'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, provider, endpoint, apiKey, imgModel, vidModel, audModel, t])

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
          provider,
          endpoint,
          apiKey: apiKey.trim(),
          model: imgModel,
        }),
      })
      if (result.ok === true) {
        setNotice(t('runtime.testOk'))
        if (typeof onVerified === 'function') onVerified()
      } else {
        setError(t('runtime.testFail', { status: String(result.status || '') }))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [busy, provider, endpoint, apiKey, imgModel, t, onVerified])

  return (
    <div>
      <div className="omx-section-header">
        <span className="omx-section-title">{t('runtime.mediaProviderHeader')}</span>
      </div>

      <div className="omx-media-grid">
        {Object.values(MEDIA_PROVIDER_PRESETS).map((p) => {
          const isSelected = provider === p.id
          return (
            <div
              key={p.id}
              className={`omx-provider-choice ${isSelected ? 'active' : ''}`}
              onClick={() => handleProviderSelect(p.id)}
            >
              <div className="omx-section-header">
                <span className="omx-provider-name">{p.name}</span>
                <span className="omx-cli-tag">{p.tag}</span>
              </div>
              <p className="omx-provider-caps">{p.capsDesc}</p>
            </div>
          )
        })}
      </div>

      <div className="omx-provider-form">
        <div className="omx-form-row">
          <span className="omx-section-title">{preset.name} API Key</span>
          <InputField
            type="password"
            value={apiKey}
            placeholder={hasKey ? t('runtime.keyStored') : preset.keyPlaceholder}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="omx-form-row">
          <span className="omx-section-title">{t('runtime.endpointLabel')}</span>
          <InputField
            value={endpoint}
            placeholder={preset.defaultEndpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </div>

        <div className="omx-form-row">
          <Button
            type="button"
            variant="ghost"
            className="omx-collapsible-trigger"
            aria-expanded={modelsExpanded}
            onClick={() => setModelsExpanded(!modelsExpanded)}
          >
            <span className="omx-section-title">{t('runtime.mediaModelsToggle')}</span>
            <span className="omx-toggle-badge">
              {modelsExpanded ? t('runtime.collapse') : t('runtime.expand')}
            </span>
          </Button>

          {modelsExpanded ? (
            <div className="omx-caps-column">
              <div className="omx-cap-card">
                <span className="omx-form-item">{t('runtime.imageModel')}</span>
                <DropdownSelect
                  id="omx-img-model"
                  value={imgModel}
                  options={preset.models.image.map((m) => ({ value: m, label: m }))}
                  onChange={(next) => setImgModel(next)}
                />
              </div>

              <div className="omx-cap-card">
                <span className="omx-form-item">{t('runtime.videoModel')}</span>
                <DropdownSelect
                  id="omx-vid-model"
                  value={vidModel}
                  options={preset.models.video.map((m) => ({ value: m, label: m }))}
                  onChange={(next) => setVidModel(next)}
                />
              </div>

              <div className="omx-cap-card">
                <span className="omx-form-item">{t('runtime.audioModel')}</span>
                <DropdownSelect
                  id="omx-aud-model"
                  value={audModel}
                  options={preset.models.audio.map((m) => ({ value: m, label: m }))}
                  onChange={(next) => setAudModel(next)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="omx-provider-form-actions">
          <Button variant="ghost" disabled={busy} onClick={() => { void test() }}>
            {t('runtime.test')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => { void save() }}>
            {t('runtime.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export { ByokPanel, AgentPanel }
