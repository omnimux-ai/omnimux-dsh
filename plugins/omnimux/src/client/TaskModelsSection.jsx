import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { DropdownSelect } from 'dsh-ui-kit'

/**
 * Task-model pickers for the omnimux plugin item on the official Plugins page.
 *
 * Two task classes, two fields on the `omnimux` settings namespace:
 * - `defaultTextModel`    — pure-text tool calls (chat, summarization, …)
 * - `defaultAnalysisModel` — multimodal understanding calls that carry image,
 *   video, audio, or document references.
 *
 * Options come from the hub's live `/omnimux/model-catalog`, never a local
 * list: the analysis picker only offers catalog text rows whose `input`
 * advertises a non-text modality, and both pickers fall back to the catalog's
 * resolved default when nothing is chosen. A stored id the hub no longer
 * serves stays visible with a "needs confirmation" suffix so the user can see
 * what their tools are actually running on; clearing a row unsets the field
 * rather than persisting an empty choice.
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
export function TaskModelsSection({ t, scope }) {
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
      .then((body) => { if (!cancelled) setCatalog(body) })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)) })
    return () => { cancelled = true }
  }, [snapshot?.value?.defaultTextModel, snapshot?.value?.defaultAnalysisModel])

  const value = snapshot?.value && typeof snapshot.value === 'object' ? snapshot.value : {}
  const writable = snapshot?.writable === true && snapshot?.status === 'ready'
  const available = snapshot?.status === 'ready'

  /** Catalog text rows usable for one task class. */
  const rowsFor = useCallback((analysisOnly) => {
    const rows = Array.isArray(catalog?.text) ? catalog.text : []
    if (!analysisOnly) return rows
    return rows.filter((row) => (row?.input ?? []).some((modality) => modality !== 'text'))
  }, [catalog])

  const optionsFor = useCallback((field, analysisOnly) => {
    const options = rowsFor(analysisOnly).map((row) => ({ value: row.id, label: row.label || row.id }))
    const stored = typeof value[field] === 'string' ? value[field].trim() : ''
    if (stored && !options.some((option) => option.value === stored)) {
      options.push({ value: stored, label: `${stored} · ${t('runtime.needsConfirmation')}` })
    }
    return options
  }, [catalog, rowsFor, t, value])

  const currentFor = useCallback((field, analysisOnly, options) => {
    const stored = typeof value[field] === 'string' && value[field] ? value[field] : ''
    if (stored) return stored
    const fallback = analysisOnly ? catalog?.defaults?.analysis : catalog?.defaults?.text
    return fallback || options[0]?.value || ''
  }, [catalog, value])

  const onChange = useCallback(async (field, next) => {
    if (!scope || typeof scope.set !== 'function' || !writable || busy) return
    setBusy(true)
    setError('')
    try {
      if (next === 'auto' && typeof scope.unset === 'function') {
        await scope.unset(field)
      } else {
        await scope.set(field, next)
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('omnimux:model-catalog-updated'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [scope, writable, busy])

  if (!available) return null

  const rows = [
    { field: 'defaultTextModel', labelKey: 'taskModels.text', analysisOnly: false },
    { field: 'defaultAnalysisModel', labelKey: 'taskModels.analysis', analysisOnly: true },
  ]

  return (
    <section className="omnimux-models-card" data-section="task-models" aria-label={t('taskModels.title')}>
      <div className="omnimux-models-card__head">
        <h3 className="omnimux-models-card__title">{t('taskModels.title')}</h3>
        <p className="omnimux-models-card__desc">{t('taskModels.description')}</p>
      </div>
      <div className="omnimux-models-card__body">
        {rows.map((row) => {
          const options = optionsFor(row.field, row.analysisOnly)
          const current = currentFor(row.field, row.analysisOnly, options)
          return (
            <div key={row.field} className="omnimux-models-card__row">
              <span className="omnimux-models-card__row-label">{t(row.labelKey)}</span>
              <div className="omnimux-models-card__row-body">
                <DropdownSelect
                  id={`omnimux-${row.field}`}
                  aria-label={t(row.labelKey)}
                  value={current}
                  options={options}
                  disabled={!writable || busy || options.length === 0}
                  placeholder={t('models.loading')}
                  onChange={(next) => { void onChange(row.field, next) }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {error ? <p className="omnimux-models-card__error" role="status">{error}</p> : null}
    </section>
  )
}
