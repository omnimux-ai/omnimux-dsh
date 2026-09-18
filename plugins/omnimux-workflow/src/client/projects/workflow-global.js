/**
 * Cross-plugin seam: inspiration (and future callers) create a replication
 * project without importing this package.
 *
 * Installs `window.__omnimuxWorkflow.startReplicationProject`.
 * Disposer deletes the global when this plugin unloads.
 */
import { runNewProject } from './newProject.js'

export const WORKFLOW_GLOBAL_KEY = '__omnimuxWorkflow'
export const WORKFLOW_GLOBAL_VERSION = 1

/** Process-local inflight lock. A second call returns `{ error: 'busy' }`. */
let inflight = null

/**
 * Test-only: drop the inflight handle so cases start from idle.
 */
export function resetReplicationInflight() {
  inflight = null
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function readTitle(input) {
  if (!input || typeof input !== 'object') return ''
  const title = /** @type {{ title?: unknown }} */ (input).title
  return typeof title === 'string' ? title : ''
}

/**
 * Create a Host-default-library project + session + 15:85 canvas.
 * Never prompts for a name. Never uses `cwd` / `connectWorkspace`.
 *
 * @param {{ sessions: object, workspaces: object, layout?: object, stage?: object, t?: Function }} deps
 * @param {{ title?: unknown, source?: unknown }} input
 * @param {{ runNewProject?: typeof runNewProject }} [io]
 * @returns {Promise<{ ok: boolean, error?: string, project?: object, sessionId?: string, cwd?: string }>}
 */
export function startReplicationProject(deps, input, io = {}) {
  if (inflight) return Promise.resolve({ ok: false, error: 'busy' })
  if (!deps || typeof deps !== 'object') {
    return Promise.resolve({ ok: false, error: 'unavailable' })
  }
  const run = typeof io.runNewProject === 'function' ? io.runNewProject : runNewProject
  const title = readTitle(input)
  const work = Promise.resolve()
    .then(() => run(deps, { title }))
    .then((result) => {
      if (!result || typeof result !== 'object') {
        return { ok: false, error: 'create-failed' }
      }
      if (result.ok) {
        const project = result.project && typeof result.project === 'object' ? result.project : {}
        return {
          ok: true,
          project,
          sessionId: result.sessionId || project.sessionId,
          cwd: result.cwd || project.path,
        }
      }
      return { ok: false, error: result.error || 'create-failed' }
    })
    .catch(() => ({ ok: false, error: 'unavailable' }))
    .finally(() => {
      if (inflight === work) inflight = null
    })
  inflight = work
  return work
}

/**
 * @param {object | undefined} target  typically `window`
 * @param {object} deps
 * @returns {() => void} disposer
 */
export function installWorkflowGlobal(target, deps) {
  if (!target || typeof target !== 'object') return () => {}
  const existing = target[WORKFLOW_GLOBAL_KEY]
  if (existing && existing.version === WORKFLOW_GLOBAL_VERSION && typeof existing.startReplicationProject === 'function') {
    return () => {}
  }
  const api = {
    version: WORKFLOW_GLOBAL_VERSION,
    sessions: deps?.sessions,
    workspaces: deps?.workspaces,
    layout: deps?.layout,
    startReplicationProject(input) {
      return startReplicationProject(deps, input)
    },
  }
  target[WORKFLOW_GLOBAL_KEY] = api
  return () => {
    if (target[WORKFLOW_GLOBAL_KEY] === api) {
      delete target[WORKFLOW_GLOBAL_KEY]
    }
  }
}
