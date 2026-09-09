/**
 * plugins/omnimux-assets/src/protocol.js
 * Virtual Asset URI Protocol (`asset://<scope>/<logical-path>`)
 *
 * Provides cross-environment, portable virtual URIs for creative assets,
 * decoupling them from absolute disk paths on a specific machine.
 */

import { isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { resolveAssetsPaths, resolveDshHome } from './paths.js'

export const ASSET_PROTOCOL_PREFIX = 'asset://'

export const VALID_SCOPES = Object.freeze([
  'character',
  'scene',
  'style',
  'prop',
  'knowledge',
  'custom',
  'artifact',
  'workspace',
  'tmp',
])

const SCOPE_SET = new Set(VALID_SCOPES)

/**
 * Check whether a string is a virtual asset URI.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAssetUri(value) {
  if (typeof value !== 'string') return false
  return value.startsWith(ASSET_PROTOCOL_PREFIX)
}

/**
 * Parse an asset URI into scope and logical subpath.
 * @param {string} uri
 * @returns {{ scope: string, path: string } | null}
 */
export function parseAssetUri(uri) {
  if (!isAssetUri(uri)) return null
  const body = uri.slice(ASSET_PROTOCOL_PREFIX.length)
  const slashIdx = body.indexOf('/')
  if (slashIdx === -1) {
    const scope = body.trim()
    if (!scope) return null
    return { scope, path: '' }
  }
  const scope = body.slice(0, slashIdx).trim()
  const path = body.slice(slashIdx + 1).replace(/^[\/\\]+/, '')
  if (!scope) return null
  return { scope, path }
}

/**
 * Build an asset URI from a scope and subpath.
 * @param {string} scope
 * @param {string} [subpath='']
 * @returns {string}
 */
export function formatAssetUri(scope, subpath = '') {
  const cleanScope = (scope || 'custom').trim().toLowerCase()
  const cleanPath = (subpath || '').replace(/^[\\\/]+/, '').replace(/\\/g, '/')
  return cleanPath ? `${ASSET_PROTOCOL_PREFIX}${cleanScope}/${cleanPath}` : `${ASSET_PROTOCOL_PREFIX}${cleanScope}`
}

/**
 * Convert an absolute or relative path into an asset URI if possible.
 * @param {string} diskPath
 * @param {{ scope?: string, homeDir?: string, env?: NodeJS.ProcessEnv, workspaceDir?: string }} [opts]
 * @returns {string}
 */
export function toAssetUri(diskPath, opts = {}) {
  if (isAssetUri(diskPath)) return diskPath
  const paths = resolveAssetsPaths({ homeDir: opts.homeDir, env: opts.env })
  const norm = normalize(diskPath)

  // 1. Artifact path
  if (norm.startsWith(paths.artifactsDir)) {
    const rel = relative(paths.artifactsDir, norm).replace(/\\/g, '/')
    return formatAssetUri('artifact', rel)
  }

  // 2. Assets base dir
  if (norm.startsWith(paths.dir)) {
    const rel = relative(paths.dir, norm).replace(/\\/g, '/')
    return formatAssetUri(opts.scope || 'custom', rel)
  }

  // 3. Workspace dir
  const ws = opts.workspaceDir ? normalize(opts.workspaceDir) : process.cwd()
  if (norm.startsWith(ws)) {
    const rel = relative(ws, norm).replace(/\\/g, '/')
    return formatAssetUri('workspace', rel)
  }

  // 4. Default fallback
  const base = norm.split(/[\/\\]/).pop() || ''
  return formatAssetUri(opts.scope || 'custom', base)
}

/**
 * Resolve an asset URI or direct path to a local absolute disk path.
 * @param {string} uriOrPath
 * @param {{ homeDir?: string, env?: NodeJS.ProcessEnv, workspaceDir?: string }} [opts]
 * @returns {string}
 */
export function resolveAssetUri(uriOrPath, opts = {}) {
  if (typeof uriOrPath !== 'string' || !uriOrPath) return ''
  if (!isAssetUri(uriOrPath)) {
    return isAbsolute(uriOrPath) ? uriOrPath : resolve(opts.workspaceDir || process.cwd(), uriOrPath)
  }

  const parsed = parseAssetUri(uriOrPath)
  if (!parsed) return ''

  const paths = resolveAssetsPaths({ homeDir: opts.homeDir, env: opts.env })

  if (parsed.scope === 'artifact') {
    return join(paths.artifactsDir, parsed.path)
  }

  if (parsed.scope === 'workspace') {
    return resolve(opts.workspaceDir || process.cwd(), parsed.path)
  }

  if (parsed.scope === 'tmp') {
    return join(paths.dir, 'tmp', parsed.path)
  }

  // General typed asset scope (character/scene/style/prop/knowledge/custom)
  return join(paths.dir, parsed.scope, parsed.path)
}
