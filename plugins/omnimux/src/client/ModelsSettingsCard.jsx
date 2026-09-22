import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, DropdownSelect, SelectableTile } from 'dsh-ui-kit'
import { RuntimeModeSection } from './RuntimeModeSection.jsx'

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
      { key: 'defaultTextReasoning', labelKey: 'models.rowReasoning', reasoning: true },
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
 * Compact defaults card for Settings → 插件 → 可配置.
 * Writes top-level fields through official settingsScope.set / unset.
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
  const snapshot = useSyncExternalStore(
    (listener) => {
      if (!scope || typeof scope.subscribe !== 'function') return () => {}
      return scope.subscribe(listener)
    },
    () => (scope && typeof scope.getSnapshot === 'function'
      ? scope.getSnapshot()
      : { status: 'unavailable', value: undefined, writable: false, user: undefined }),
  )

  const [catalog, setCatalog] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
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
    return () => { cancelled = true }
  }, [])

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
    if (typeof configured === 'string' && configured && configured !== DEFAULT_OPERATION_AUTO
      && operations.some((op) => op.id === configured)) {
      return configured
    }
    const recommended = catalog?.defaultOperations?.[kind]
    if (recommended && recommended.modelId === modelId
      && operations.some((op) => op.id === recommended.operationId)) {
      return recommended.operationId
    }
    return operations[0]?.id ?? ''
  }, [catalog, currentModelIdFor, listedOperationsFor, value])

  const optionsForRow = useCallback((group, row) => {
    if (row.reasoning) {
      return REASONING_LEVELS.map((level) => ({ value: level, label: t(`models.reasoning.${level}`) }))
    }
    if (row.mode) {
      return listedOperationsFor(group.kind, currentModelIdFor(group.kind))
        .map((op) => ({ value: op.id, label: op.label || op.id }))
    }
    const rows = Array.isArray(catalog?.[group.kind]) ? catalog[group.kind] : []
    return rows.map((item) => ({ value: item.id, label: item.label || item.id }))
  }, [catalog, currentModelIdFor, listedOperationsFor, t])

  const currentValueForRow = useCallback((group, row, options) => {
    const stored = typeof value[row.key] === 'string' && value[row.key] ? value[row.key] : ''
    if (row.reasoning) return stored || DEFAULT_REASONING
    if (row.mode) return effectiveOperationId(group.kind) || stored || ''
    return stored || catalog?.defaults?.[group.kind] || options[0]?.value || ''
  }, [catalog, effectiveOperationId, value])

  const onChange = useCallback(async (field, next) => {
    if (!scope || typeof scope.set !== 'function' || !writable || busy) return
    setBusy(true)
    setError('')
    try {
      await scope.set(field, next)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('omnimux:model-catalog-updated'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [scope, writable, busy])

  const onReset = useCallback(async (field) => {
    if (!scope || typeof scope.unset !== 'function' || !writable || busy) return
    setBusy(true)
    setError('')
    try {
      await scope.unset(field)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('omnimux:model-catalog-updated'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [scope, writable, busy])

  /** Hub-listed text models — the membership authority for the composer list. */
  const composerModels = Array.isArray(catalog?.text) ? catalog.text : []
  /** Ids the user keeps out of the composer list; a hub-unlisted id can never be added back. */
  const hiddenModels = Array.isArray(value.composerHiddenModels) ? value.composerHiddenModels : []

  /**
   * Flip one model's visibility in the composer list.
   *
   * This records ids to subtract and nothing more: the hub's listed set stays the
   * membership authority, so a model the hub stops listing leaves the list on its
   * own and no local setting can put it back.
   */
  const onToggleComposerModel = useCallback(async (id, visible) => {
    if (!scope || typeof scope.set !== 'function' || !writable || busy) return
    const current = Array.isArray(value.composerHiddenModels) ? value.composerHiddenModels : []
    if (!visible && current.length + 1 >= composerModels.length) {
      // Hiding the last visible model would leave the composer with nothing
      // usable, and the sync refuses to write an empty list anyway. Say so
      // rather than storing a choice that cannot take effect.
      setError(t('models.composerKeepOne'))
      return
    }
    const next = visible
      ? current.filter((entry) => entry !== id)
      : [...new Set([...current, id])]
    setBusy(true)
    setError('')
    try {
      await scope.set('composerHiddenModels', next)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('omnimux:model-catalog-updated'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [scope, writable, busy, value, composerModels, t])

  if (!available) return null

  return (
    <div className="omnimux-models-card">
      <div className="omnimux-models-card__head">
        <h3 className="omnimux-models-card__title">{t('models.title')}</h3>
        <p className="omnimux-models-card__desc">{t('models.description')}</p>
      </div>
      <div className="omnimux-models-card__body">
        <RuntimeModeSection t={t} scope={scope} />
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
                          disabled={!writable || busy}
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
                        disabled={!writable || busy || options.length === 0}
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
                  disabled={!writable || busy}
                  onChange={(next) => { void onToggleComposerModel(model.id, next) }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {error ? <p className="omnimux-models-card__error" role="status">{error}</p> : null}
    </div>
  )
}
