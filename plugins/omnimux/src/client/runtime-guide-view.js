import { resolveScenarioBindings } from '../settings/runtime-mode.js'

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

/**
 * Whether any consumption channel has already been chosen or configured.
 * The guide is a one-shot chooser: once the user picks a channel (writes
 * `runtimeMode`), selects a local agent, or saves any provider/endpoint,
 * it must never reappear. `scenarioBindings` ships schema defaults, so it
 * cannot distinguish "chosen" from "fresh" and is not part of `seen`.
 * @param {unknown} settings
 */
function hasAnyChannelChoice(settings) {
  const input = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}
  if (nonEmpty(input.runtimeMode)) return true
  if (nonEmpty(input.runtimeAgentId)) return true
  if (Array.isArray(input.byokProviders) && input.byokProviders.length > 0) return true
  if (nonEmpty(input.runtimeKeyEndpoint)) return true
  return false
}

/** First-run configuration is not an exclusive runtime choice.
 * Official creation keeps its existing sign-in gate; pending scenarios are
 * displayed in settings without blocking other configured scenarios.
 * @param {unknown} settings
 */
export function describeRuntimeGuide(settings) {
  const bindings = resolveScenarioBindings(settings)
  return { visible: !hasAnyChannelChoice(settings), mode: '', pendingScenarios: Object.entries(bindings)
    .filter(([, binding]) => binding.channel === 'pending').map(([scenario]) => scenario) }
}
