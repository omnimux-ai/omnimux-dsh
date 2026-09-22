/**
 * Pure view-model for the first-run runtime guide.
 * RuntimeGuideGate.jsx renders this snapshot; L1 tests assert without React.
 */

const CHOSEN = new Set(['official', 'agent', 'key'])

/**
 * Whether the first-run guide must show. A stored choice hides it forever;
 * everything else — a fresh install, an upgrade, a cleared value — shows it
 * exactly once, until the user picks and passes.
 * @param {unknown} settings
 */
export function describeRuntimeGuide(settings) {
  const value = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? /** @type {Record<string, unknown>} */ (settings)
    : {}
  const mode = typeof value.runtimeMode === 'string' ? value.runtimeMode : ''
  const chosen = CHOSEN.has(mode)
  return {
    visible: !chosen,
    mode: chosen ? mode : '',
  }
}
