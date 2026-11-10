/**
 * Pure view rules for the local-CLI panel. They live apart from the React tree
 * so the reads (which URL, how many CLIs are installed, where a model list came
 * from, when a focus may re-scan) are directly testable.
 */

/** A focus may re-scan at most once per window; a scan costs local process calls. */
export const AGENT_AUTO_REFRESH_MS = 30000

/**
 * @param {boolean} [refresh] bypass the Host's model-probe cache
 * @returns {string}
 */
export function agentScanUrl(refresh) {
  return refresh === true ? '/omnimux/agents?refresh=1' : '/omnimux/agents'
}

/**
 * @param {boolean} [refresh] bypass the update-check cache
 * @returns {string}
 */
export function agentUpdatesUrl(refresh) {
  return refresh === true ? '/omnimux/agents/updates?refresh=1' : '/omnimux/agents/updates'
}

/**
 * How many of the known CLIs are actually installed.
 * @param {Array<{ installed?: boolean }>} agents
 * @returns {number}
 */
export function countInstalledAgents(agents) {
  if (!Array.isArray(agents)) return 0
  return agents.filter((agent) => agent && agent.installed === true).length
}

/**
 * The line under a CLI's name: its version, or why it cannot be used yet.
 * @param {(key: string, params?: Record<string, string>) => string} t
 * @param {{ version?: string, auth?: { state?: string, loginSupported?: boolean } } | null} agent
 * @returns {string}
 */
export function agentStatusText(t, agent) {
  if (agent && agent.auth && agent.auth.state === 'signed-out') {
    return agent.auth.loginSupported === true ? t('runtime.cliNeedsLogin') : t('runtime.unconfigured')
  }
  return (agent && typeof agent.version === 'string' && agent.version) || t('runtime.notDetected')
}

/**
 * Which provenance marker a row carries, or an empty string when the Host did
 * not say. Never invent one.
 * @param {{ modelsSource?: string } | null} agent
 * @returns {'live'|'preset'|''}
 */
export function agentModelSource(agent) {
  if (!agent) return ''
  if (agent.modelsSource === 'live') return 'live'
  if (agent.modelsSource === 'preset') return 'preset'
  return ''
}

/**
 * Whether a focus/visibility event may trigger a background re-scan.
 * @param {number} lastAt epoch ms of the previous automatic refresh (0 = never)
 * @param {number} now epoch ms
 * @param {string} [visibilityState]
 * @returns {boolean}
 */
export function shouldAutoRefresh(lastAt, now, visibilityState = 'visible') {
  if (visibilityState === 'hidden') return false
  if (!Number.isFinite(lastAt) || lastAt <= 0) return true
  return now - lastAt >= AGENT_AUTO_REFRESH_MS
}