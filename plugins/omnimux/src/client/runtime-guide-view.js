import { resolveScenarioBindings } from '../settings/runtime-mode.js'

/** First-run configuration is not an exclusive runtime choice.
 * Official creation keeps its existing sign-in gate; pending scenarios are
 * displayed in settings without blocking other configured scenarios.
 * @param {unknown} settings
 */
export function describeRuntimeGuide(settings) {
  const bindings = resolveScenarioBindings(settings)
  return { visible: false, mode: '', pendingScenarios: Object.entries(bindings)
    .filter(([, binding]) => binding.channel === 'pending').map(([scenario]) => scenario) }
}
