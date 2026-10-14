import { DropdownSelect } from 'dsh-ui-kit'
import { CONSUMPTION_SCENARIOS, resolveScenarioBindings } from '../settings/runtime-mode.js'

/** Each saved choice affects one consumption scenario only. */
export function ScenarioSelection({ t, scope, value, busy, setBusy, setError }) {
  const bindings = resolveScenarioBindings(value)
  const providers = Array.isArray(value.byokProviders) ? value.byokProviders : []
  const change = async (scenario, selected) => {
    if (!scope || typeof scope.set !== 'function' || busy) return
    setBusy(true)
    setError('')
    try {
      const current = scope.getSnapshot()?.value ?? value
      const binding = selected.startsWith('byok:')
        ? { channel: 'byok', provider: selected.slice(5) } : { channel: selected }
      await scope.set('scenarioBindings', { ...resolveScenarioBindings(current), [scenario]: binding })
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('runtime.error')) }
    finally { setBusy(false) }
  }
  return (
    <div className="omnimux-models-card__group-card" data-omnimux-scenario-bindings="">
      {CONSUMPTION_SCENARIOS.map((scenario) => {
        const binding = bindings[scenario]
        const selected = binding.channel === 'byok' ? `byok:${binding.provider}` : binding.channel
        const options = [{ value: 'official', label: t('runtime.official') }]
        if (scenario === 'text' && value.runtimeAgentId && value.runtimeAgentVerified) {
          options.push({ value: 'agent', label: t('runtime.agent') })
        }
        for (const provider of providers) {
          if (provider.saveState !== 'pending' && provider.models?.[scenario] && provider.capabilities?.includes(scenario)) {
            options.push({ value: `byok:${provider.provider}`, label: `${provider.provider} · ${provider.models[scenario]}` })
          }
        }
        if (!options.some((option) => option.value === selected)) {
          options.push({ value: selected, label: t('runtime.needsConfirmation') })
        }
        return (
          <div key={scenario} className="omnimux-models-card__row">
            <span className="omnimux-models-card__row-label">{t(`runtime.scenario.${scenario}`)}</span>
            <DropdownSelect id={`omnimux-scenario-${scenario}`} aria-label={t(`runtime.scenario.${scenario}`)}
              value={selected} options={options} disabled={busy}
              onChange={(next) => { void change(scenario, next) }} />
          </div>
        )
      })}
    </div>
  )
}
