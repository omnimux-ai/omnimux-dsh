import { useCallback, useEffect, useState } from 'react'
import { Button, DropdownSelect, SelectableTile } from 'dsh-ui-kit'
import { RuntimeModeSection } from './RuntimeModeSection.jsx'
import { useStagedConfigScope } from './staged-config-scope.js'

/** Sentinel the hub stores for "no explicit choice"; the picker shows the resolved mode instead. */
const DEFAULT_OPERATION_AUTO = 'auto'
/** Route default declared in cordis.patch.yml; the picker offers the levels the model publishes. */
const DEFAULT_REASONING = 'max'
const REASONING_LEVELS = ['low', 'medium', 'high', 'max']

/** Four type groups, each rendered as one card with one row per setting. */
const GROUPS = [
  {
    kind: 'text',
    titleKey: 'models.groupText',
    rows: [
      { key: 'defaultTextModel', labelKey: 'models.rowModel' },
      { key: 'defaultAnalysisModel', labelKey: 'taskModels.analysis', analysisOnly: true },
      { key: 'defaultTextReasoning', labelKey: 'models.rowReasoning', reasoning: true },
      { key: 'toolModel', labelKey: 'models.rowToolModel', tool: true },
    ],
  },
  {
    kind: 'image',
    titleKey: 'models.groupImage',
    rows: [
      { key: 'defaultImageModel', labelKey: 'models.rowModel' },
      { key: 'defaultImageOperation', labelKey: 'models.rowMode', mode: true },
    ],
  },
  {
    kind: 'video',
    titleKey: 'models.groupVideo',
    rows: [
      { key: 'defaultVideoModel', labelKey: 'models.rowModel' },
      { key: 'defaultVideoOperation', labelKey: 'models.rowMode', mode: true },
    ],
  },
  {
    kind: 'audio',
    titleKey: 'models.groupAudio',
    rows: [
      { key: 'defaultAudioModel', labelKey: 'models.rowModel' },
    ],
  },
]

const cap = (kind) => `${kind[0].toUpperCase()}${kind.slice(1)}`

/**
 * Read-only gateway-sync status with one explicit refresh action.
 * A successful refresh emits the same event every catalog consumer listens to.
 */
function CatalogSyncPanel({ t }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [syncError, setSyncError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/omnimux/model-catalog?view=diagnostics')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState(await response.json())
      setSyncError('')
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [])

  useEffect(() => {
    void load()
    const onUpdated = () => { void load() }
    window.addEventListener?.('omnimux:model-catalog-updated', onUpdated)
    return () => window.removeEventListener?.('omnimux:model-catalog-updated', onUpdated)
  }, [load])

  const refresh = async () => {
    if (busy) return
    setBusy(true)
    setSyncError('')
    try {
      const response = await fetch('/omnimux/model-catalog/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.status === 'failed') {
        throw new Error(body?.reason || body?.error || `HTTP ${response.status}`)
      }
      window.dispatchEvent?.(new CustomEvent('omnimux:model-catalog-updated'))
      await load()
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const snapshot = state?.snapshot
  const refreshState = state?.refresh
  return (
    <div className="omnimux-models-card" data-section="catalog-sync">
      <div className="omnimux-models-card__head">
        <h3 className="omnimux-models-card__title">{t('models.syncTitle')}</h3>
        <p className="omnimux-models-card__desc">{t('models.syncDescription')}</p>
      </div>
      <div className="omnimux-models-card__body">
        <div className="omnimux-models-card__row">
          <span className="omnimux-models-card__row-label">{t('models.syncStatus')}</span>
          <div className="omnimux-models-card__row-body">
            <span className="omnimux-models-card__status" role="status">
              {snapshot
                ? `${snapshot.source || 'none'} · ${snapshot.generatedAt || t('models.syncUnknown')}${snapshot.stale ? ` · ${t('models.syncStale')}` : ''}`
                : t('models.syncLoading')}
            </span>
            <Button type="button" size="sm" variant="secondary" disabled={busy} loading={busy ? true : undefined} onClick={() => { void refresh() }}>
              {t('models.syncNow')}
            </Button>
          </div>
        </div>
        {refreshState?.errorCode ? <p className="omnimux-models-card__error" role="status">{refreshState.errorCode}</p> : null}
        {syncError ? <p className="omnimux-models-card__error" role="status">{syncError}</p> : null}
      </div>
    </div>
  )
}

/**
 * Consolidated model settings card on the official Plugins page.
 * Stages top-level field edits locally and writes them only on explicit save.
 * Writes go through the official config form scope.
 *
 * @param {{
 *   t: (key: string, params?: Record<string, string>) => string,
 *   scope?: {
 *     getSnapshot: () => object,
 *     subscribe: (listener: () => void) => () => void,
 *     set: (field: string, value: string) => Promise<void>,
 *     unset: (field: string) => Promise<void>,
 *   },
 * }} props
 */
export function ModelsSettingsCard({ t, scope }) {
  const draft = useStagedConfigScope(scope)
  const snapshot = draft.snapshot
  const formScope = draft.scope

  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/omnimux/model-catalog')
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((body) => {
          if (!cancelled) setCatalog(body)
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
        })
    }
    load()
    const onUpdated = () => load()
    window.addEventListener?.('omnimux:model-catalog-updated', onUpdated)
    return () => {
      cancelled = true
      window.removeEventListener?.('omnimux:model-catalog-updated', onUpdated)
    }
  }, [snapshot?.value?.defaultTextModel, snapshot?.value?.defaultImageModel, snapshot?.value?.defaultVideoModel, snapshot?.value?.defaultAudioModel, snapshot?.value?.defaultImageOperation, snapshot?.value?.defaultVideoOperation])

  const value = snapshot?.value && typeof snapshot.value === 'object' ? snapshot.value : {}
  const user = snapshot?.user && typeof snapshot.user === 'object' ? snapshot.user : {}
  const writable = snapshot?.writable === true && snapshot?.status === 'ready'
  const available = snapshot?.status === 'ready'

  /** Modes the given model publishes for the given output type, in contract order. */
  const listedOperationsFor = useCallback((kind, modelId) => {
    const model = (catalog?.models ?? []).find((row) => row && row.id === modelId)
    return (model?.operations ?? [])
      .filter((op) => op && op.listed === true && op.output?.type === kind)
  }, [catalog])

  /** The model a kind's mode row follows: the configured one, else the catalog default. */
  const currentModelIdFor = useCallback((kind) => {
    const chosen = value[`default${cap(kind)}Model`]
    return (typeof chosen === 'string' && chosen) || catalog?.defaults?.[kind] || ''
  }, [value, catalog])

  /**
   * The mode actually in force: an explicit choice while the model still publishes it,
   * else the catalog recommendation, else the model's first listed mode. The picker
   * shows this value, so no "auto" concept reaches the user.
   */
  const effectiveOperationId = useCallback((kind) => {
    const modelId = currentModelIdFor(kind)
    const operations = listedOperationsFor(kind, modelId)
    const configured = value[`default${cap(kind)}Operation`]
    if (typeof configured === 'string' && configured && configured !== DEFAULT_OPERATION_AUTO) {
      return configured
    }
    const recommended = catalog?.defaultOperations?.[kind]
    if (recommended && recommended.modelId === modelId
      && operations.some((op) => op.id === recommended.operationId)) {
      return recommended.operationId
    }
    return operations[0]?.id ?? ''
  }, [catalog, currentModelIdFor, listedOperationsFor, value])

  const reasoningOptionsFor = useCallback(() => {
    const model = (catalog?.models ?? []).find((row) => row.id === currentModelIdFor('text'))
    const efforts = model?.executionProfile?.reasoningEfforts
    const levels = efforts && typeof efforts === 'object' && !Array.isArray(efforts)
      ? Object.keys(efforts)
      : REASONING_LEVELS
    return levels.map((level) => ({ value: level, label: t(`models.reasoning.${level}`) }))
  }, [catalog, currentModelIdFor, t])

  const defaultReasoningFor = useCallback(() => {
    const model = (catalog?.models ?? []).find((row) => row.id === currentModelIdFor('text'))
    const effort = model?.executionProfile?.defaultReasoningEffort
    return typeof effort === 'string' ? effort : ''
  }, [catalog, currentModelIdFor])

  const optionsForRow = useCallback((group, row) => {
    if (row.reasoning) {
      return reasoningOptionsFor()
    }
    if (row.mode) {
      const options = listedOperationsFor(group.kind, currentModelIdFor(group.kind))
        .map((op) => ({ value: op.id, label: op.label || op.id }))
      const stored = value[row.key]
      if (typeof stored === 'string' && stored && stored !== DEFAULT_OPERATION_AUTO
        && !options.some((option) => option.value === stored)) options.push({ value: stored, label: `${stored} · ${t('runtime.needsConfirmation')}` })
      return options
    }
    if (row.tool) {
      // Session-reachable provider:model pairs; 'auto' means "not configured".
      const stored = typeof value.toolModel === 'string' ? value.toolModel.trim() : ''
      const tools = Array.isArray(catalog?.tools) ? catalog.tools : []
      const options = [{ value: 'auto', label: t('models.toolAuto') }]
      for (const item of tools) {
        if (item && item.id) options.push({ value: item.id, label: item.label || item.id })
      }
      // A stored pair no longer listed must stay visible — hide it and the
      // user cannot see what their tools are running on.
      if (stored && !tools.some((item) => item.id === stored)) {
        options.push({ value: stored, label: stored })
      }
      return options
    }
    const rows = Array.isArray(catalog?.[group.kind]) ? catalog[group.kind] : []
    const filtered = row.analysisOnly
      ? rows.filter((item) => (item?.inputCapability?.modalities ?? item?.input ?? []).some((modality) => modality !== 'text'))
      : rows
    const options = [{ value: 'auto', label: t('models.operationAutoBare') }]
    for (const item of filtered) options.push({ value: item.id, label: item.label || item.id })
    const stored = value[row.key]
    if (typeof stored === 'string' && stored && !options.some((option) => option.value === stored)) {
      options.push({ value: stored, label: `${stored} · ${t('runtime.needsConfirmation')}` })
    }
    return options
  }, [catalog, currentModelIdFor, listedOperationsFor, reasoningOptionsFor, t, value])

  const currentValueForRow = useCallback((group, row, options) => {
    const stored = typeof value[row.key] === 'string' && value[row.key] ? value[row.key] : ''
    if (row.tool) return stored || 'auto'
    if (row.reasoning) {
      const explicit = typeof user[row.key] === 'string' ? user[row.key].trim() : ''
      if (explicit && options.some((option) => option.value === explicit)) return explicit
      const preferred = defaultReasoningFor()
      if (preferred && options.some((option) => option.value === preferred)) return preferred
      return options.find((option) => option.value === DEFAULT_REASONING)?.value || options[0]?.value || DEFAULT_REASONING
    }
    if (row.mode) return effectiveOperationId(group.kind) || stored || ''
    return stored || 'auto'
  }, [defaultReasoningFor, effectiveOperationId, user, value])

  const onChange = useCallback(async (field, next) => {
    if (!writable || draft.state.saving) return
    // 'auto' restores the unconfigured state: stage a clear rather than
    // persisting the sentinel. Nothing reaches the Host before save.
    if (next === 'auto' && typeof formScope.unset === 'function') {
      await formScope.unset(field)
    } else {
      await formScope.set(field, next)
    }
  }, [draft.state.saving, formScope, writable])

  const onReset = useCallback(async (field) => {
    if (!writable || draft.state.saving || typeof formScope.unset !== 'function') return
    await formScope.unset(field)
  }, [draft.state.saving, formScope, writable])

  /** Hub-listed text models — the membership authority for the composer list. */
  const composerModels = Array.isArray(catalog?.text) ? catalog.text : []
  /** Ids the user keeps out of the composer list; a hub-unlisted id can never be added back. */
  const hiddenModels = Array.isArray(value.composerHiddenModels) ? value.composerHiddenModels : []

  /** Per-kind hub-listed model rows — the membership authority for the canvas pickers. */
  const canvasModels = {
    text: Array.isArray(catalog?.text) ? catalog.text : [],
    image: Array.isArray(catalog?.image) ? catalog.image : [],
    video: Array.isArray(catalog?.video) ? catalog.video : [],
    audio: Array.isArray(catalog?.audio) ? catalog.audio : [],
  }
  /** Per-kind ids the user keeps off the canvas; a hub-unlisted id can never be added back. */
  const canvasHiddenModels = (() => {
    const stored = value.canvasHiddenModels
    const out = { text: [], image: [], video: [], audio: [] }
    if (!stored || typeof stored !== 'object') return out
    for (const kind of Object.keys(out)) {
      const list = stored[kind]
      out[kind] = Array.isArray(list) ? list.filter((entry) => typeof entry === 'string' && entry) : []
    }
    return out
  })()

  /**
   * Flip one model's visibility in the composer list.
   *
   * This records ids to subtract and nothing more: the hub's listed set stays the
   * membership authority, so a model the hub stops listing leaves the list on its
   * own and no local setting can put it back.
   */
  const onToggleComposerModel = useCallback(async (id, visible) => {
    if (!writable || draft.state.saving) return
    const current = Array.isArray(value.composerHiddenModels) ? value.composerHiddenModels : []
    if (!visible && current.length + 1 >= composerModels.length) {
      // Hiding the last visible model would leave the composer with nothing
      // usable, and the sync refuses to write an empty list anyway. Say so
      // rather than staging a choice that cannot take effect.
      setError(t('models.composerKeepOne'))
      return
    }
    const next = visible
      ? current.filter((entry) => entry !== id)
      : [...new Set([...current, id])]
    setError('')
    await formScope.set('composerHiddenModels', next)
  }, [draft.state.saving, formScope, writable, value, composerModels, t])

  /**
   * Flip one model's visibility in the canvas pickers.
   *
   * The hub's listed set stays the membership authority, exactly like the
   * composer list — the canvas adds per-kind granularity, and a kind may be
   * fully hidden (canvas nodes then fall back through the not_listed path).
   */
  const onToggleCanvasModel = useCallback(async (kind, id, visible, label) => {
    if (!writable || draft.state.saving) return
    const stored = value.canvasHiddenModels
    const current = (stored && typeof stored === 'object' && Array.isArray(stored[kind]))
      ? stored[kind].filter((entry) => typeof entry === 'string' && entry)
      : []
    const next = visible
      ? current.filter((entry) => entry !== id)
      : [...new Set([...current, id])]
    const nextHidden = {
      ...(stored && typeof stored === 'object' ? stored : {}),
      [kind]: next,
    }
    setError('')
    await formScope.set('canvasHiddenModels', nextHidden)
    if (!visible && catalog?.defaults?.[kind] === id) {
      setError(t('error.hiddenDefault', {
        label: label || id,
        group: t(`models.group${cap(kind)}`),
      }))
    }
  }, [draft.state.saving, formScope, writable, value, catalog, t])

  const saveDraft = useCallback(async () => {
    const saved = await draft.save()
    if (saved && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimux:model-catalog-updated'))
    }
  }, [draft])

  if (!available) return null

  return (
    <div className="omnimux-settings-sections">
      {draft.state.dirty || draft.state.saving || draft.state.failed ? (
        <div className="omnimux-settings-savebar" data-dirty="true" role="region" aria-label={t('models.unsaved')}>
          <span className="omnimux-settings-savebar__label" role="status">
            {draft.state.failed ? t('models.saveFailed') : t('models.unsaved')}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={draft.state.saving}
            onClick={draft.discard}
          >
            {t('models.discard')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            loading={draft.state.saving ? true : undefined}
            disabled={!draft.state.dirty || draft.state.saving}
            onClick={() => { void saveDraft() }}
          >
            {draft.state.saving ? t('models.saving') : t('models.save')}
          </Button>
        </div>
      ) : null}
      <CatalogSyncPanel t={t} />
      {/* 栏目一：对话与媒体生成模型 */}
      <div className="omnimux-models-card" data-section="runtime">
        <div className="omnimux-models-card__head">
          <h3 className="omnimux-models-card__title">{t('runtime.cardTitle')}</h3>
          <p className="omnimux-models-card__desc">{t('runtime.cardDesc')}</p>
        </div>
        <div className="omnimux-models-card__body">
          <RuntimeModeSection t={t} scope={formScope} />
        </div>
      </div>

      {/* 栏目二：创作画布模型 */}
      <div className="omnimux-models-card" data-section="canvas-models">
        <div className="omnimux-models-card__head">
          <h3 className="omnimux-models-card__title">{t('models.title')}</h3>
          <p className="omnimux-models-card__desc">{t('models.description')}</p>
        </div>
        <div className="omnimux-models-card__body">
          {GROUPS.map((group) => (
            <div key={group.kind} className="omnimux-models-card__group">
              <p className="omnimux-models-card__group-title">{t(group.titleKey)}</p>
              <div className="omnimux-models-card__group-card">
                {group.rows.map((row) => {
                  const options = optionsForRow(group, row)
                  const current = currentValueForRow(group, row, options)
                  const overridden = Object.prototype.hasOwnProperty.call(user, row.key)
                  return (
                    <div key={row.key} className="omnimux-models-card__row">
                      <span className="omnimux-models-card__row-label">{t(row.labelKey)}</span>
                      <div className="omnimux-models-card__row-body">
                        {overridden ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="omnimux-models-card__reset"
                            disabled={!writable || draft.state.saving}
                            onClick={() => { void onReset(row.key) }}
                          >
                            {t('models.reset')}
                          </Button>
                        ) : null}
                        <DropdownSelect
                          id={`omnimux-${row.key}`}
                          aria-label={`${t(group.titleKey)} ${t(row.labelKey)}`}
                          value={current}
                          options={options}
                          disabled={!writable || draft.state.saving || options.length === 0}
                          placeholder={t('models.loading')}
                          onChange={(next) => { void onChange(row.key, next) }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {composerModels.length > 0 ? (
            <div className="omnimux-models-card__group">
              <p className="omnimux-models-card__group-title">{t('models.composerTitle')}</p>
              <p className="omnimux-models-card__desc">{t('models.composerHint')}</p>
              <div className="omnimux-models-card__group-card">
                {composerModels.map((model) => (
                  <SelectableTile
                    key={model.id}
                    id={`omnimux-composer-${model.id}`}
                    selectionType="checkbox"
                    selected={!hiddenModels.includes(model.id)}
                    title={model.label || model.id}
                    disabled={!writable || draft.state.saving}
                    onChange={(next) => { void onToggleComposerModel(model.id, next) }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {(['text', 'image', 'video', 'audio']).map((kind) => {
            const models = canvasModels[kind]
            if (!models || models.length === 0) return null
            const defaultId = catalog?.defaults?.[kind]
            return (
              <div key={`canvas-${kind}`} className="omnimux-models-card__group">
                <p className="omnimux-models-card__group-title">
                  {t('models.canvasGroupTitle', { group: t(`models.group${cap(kind)}`) })}
                </p>
                <p className="omnimux-models-card__desc">{t('models.canvasHint')}</p>
                <div className="omnimux-models-card__group-card">
                  <div className="omnimux-models-card__tile-stack">
                    {models.map((model) => (
                      <SelectableTile
                        key={model.id}
                        id={`omnimux-canvas-${kind}-${model.id}`}
                        selectionType="checkbox"
                        selected={!canvasHiddenModels[kind].includes(model.id)}
                        title={model.label || model.id}
                        badge={model.id === defaultId ? (
                          <span className="omnimux-models-card__default-badge">{t('models.defaultBadge')}</span>
                        ) : undefined}
                        disabled={!writable || draft.state.saving}
                        onChange={(next) => { void onToggleCanvasModel(kind, model.id, next, model.label || model.id) }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {error ? <p className="omnimux-models-card__error" role="status">{error}</p> : null}
      </div>
    </div>
  )
}
