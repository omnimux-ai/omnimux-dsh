/**
 * @file plugins/omnimux-video-preview/src/breakdown/artifactStorage.js
 * Workspace path resolution and .vbreakdown artifact persistence.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Resolve workspace directory from explicit options.
 * @param {object} options
 * @returns {string|null}
 */
function fromExplicitOptions(options) {
  const { workdir, workspace } = options
  if (typeof workdir === 'string' && workdir.trim()) return resolve(workdir.trim())
  if (typeof workspace === 'string' && workspace.trim()) return resolve(workspace.trim())
  return null
}

/**
 * Resolve workspace directory from execution context properties.
 * @param {object|undefined} execCtx
 * @returns {string|null}
 */
function fromExecutionContext(execCtx) {
  if (!execCtx) return null
  if (typeof execCtx.workdir === 'string' && execCtx.workdir.trim()) return resolve(execCtx.workdir.trim())
  if (typeof execCtx.workspace === 'string' && execCtx.workspace.trim()) return resolve(execCtx.workspace.trim())
  if (typeof execCtx.cwd === 'string' && execCtx.cwd.trim()) return resolve(execCtx.cwd.trim())
  return null
}

/**
 * Extract active session id from execution context.
 * @param {object|undefined} execCtx
 * @returns {string|null}
 */
function extractSessionId(execCtx) {
  if (!execCtx) return null
  const agentSession = execCtx.agent ? execCtx.agent.session : null
  if (agentSession && agentSession.id) return agentSession.id
  if (execCtx.sessionId) return execCtx.sessionId
  return null
}

/**
 * Safely extract resolved cwd from header container.
 * @param {object|null|undefined} target
 * @returns {string|null}
 */
function extractHeaderCwd(target) {
  const header = target ? target.header : null
  const cwd = header ? header.cwd : null
  if (typeof cwd === 'string' && cwd.trim()) {
    return resolve(cwd.trim())
  }
  return null
}

/**
 * Resolve workspace directory directly from session header objects.
 * @param {object|undefined} execCtx
 * @returns {string|null}
 */
function fromDirectHeader(execCtx) {
  if (!execCtx) return null
  const agentSession = execCtx.agent ? execCtx.agent.session : null
  const res1 = extractHeaderCwd(agentSession)
  if (res1) return res1

  return extractHeaderCwd(execCtx.session)
}

/**
 * Safely query sessions service for session header cwd.
 * @param {object} ctx
 * @param {string} sessionId
 * @returns {string|null}
 */
function querySessionsServiceCwd(ctx, sessionId) {
  try {
    const sessions = ctx.get('sessions')
    if (sessions && typeof sessions.get === 'function') {
      return extractHeaderCwd(sessions.get(sessionId))
    }
  } catch {}
  return null
}

/**
 * Resolve workspace directory via DSH sessions service.
 * @param {object} options
 * @returns {string|null}
 */
function fromSessionsService(options) {
  const { execCtx, ctx } = options
  const sessionId = extractSessionId(execCtx)
  if (!sessionId || !ctx || typeof ctx.get !== 'function') {
    return null
  }
  return querySessionsServiceCwd(ctx, sessionId)
}

/**
 * Resolve workspace directory from session header.
 * @param {object} options
 * @returns {string|null}
 */
function fromSessionHeader(options) {
  const direct = fromDirectHeader(options.execCtx)
  if (direct) return direct
  return fromSessionsService(options)
}

/**
 * Check whether a directory is valid non-root and non-home.
 * @param {string} cwd
 * @param {string} home
 * @returns {boolean}
 */
function isValidWorkspaceCwd(cwd, home) {
  if (!cwd || cwd === '/') return false
  if (!home) return true
  const resolvedHome = resolve(home)
  return cwd !== home && cwd !== resolvedHome
}

/**
 * Resolve workspace directory from environment variables.
 * @returns {string|null}
 */
function fromEnvironment() {
  const envWs = process.env.DSH_WORKSPACE
  if (typeof envWs === 'string' && envWs.trim()) {
    return resolve(envWs.trim())
  }

  const cwd = process.cwd()
  const home = process.env.HOME || ''
  if (isValidWorkspaceCwd(cwd, home)) {
    return cwd
  }

  return null
}

/**
 * Resolves current workspace directory from execution context or environment.
 * @param {object} [options={}]
 * @returns {string|null}
 */
export function resolveWorkspaceDirectory(options = {}) {
  const explicit = fromExplicitOptions(options)
  if (explicit) return explicit

  const fromExec = fromExecutionContext(options.execCtx)
  if (fromExec) return fromExec

  const fromHeader = fromSessionHeader(options)
  if (fromHeader) return fromHeader

  return fromEnvironment()
}

/**
 * Resolve target base path without extension for saving artifact.
 * @param {string|undefined} customDest
 * @param {object} options
 * @returns {string}
 */
function resolveArtifactBasePath(customDest, options) {
  if (!customDest) {
    const wsDir = resolveWorkspaceDirectory(options)
    const homeDir = process.env.HOME || process.cwd()
    const outDir = wsDir
      ? join(wsDir, '.omnimux', 'breakdowns')
      : join(homeDir, '.omnimux', 'breakdowns')
    mkdirSync(outDir, { recursive: true })
    return join(outDir, `video-analysis-${Date.now()}`)
  }

  let basePath = resolve(customDest)
  if (basePath.endsWith('.vbreakdown') || basePath.endsWith('.json') || basePath.endsWith('.html')) {
    basePath = basePath.replace(/\.(vbreakdown|json|html)$/, '')
  }
  const parentDir = dirname(basePath)
  mkdirSync(parentDir, { recursive: true })
  return basePath
}

/**
 * Save breakdown result to native .vbreakdown JSON data file.
 * (Completely removes HTML generation and iframe sandbox).
 * @param {object} breakdownData
 * @param {string} [customDest]
 * @param {object} [options={}]
 * @returns {{ dataPath: string }}
 */
export function saveVideoBreakdownArtifacts(breakdownData, customDest, options = {}) {
  const basePath = resolveArtifactBasePath(customDest, options)
  const dataPath = `${basePath}.vbreakdown`
  writeFileSync(dataPath, JSON.stringify(breakdownData, null, 2), 'utf8')
  return { dataPath }
}
