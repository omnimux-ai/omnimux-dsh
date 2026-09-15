/**
 * Account metadata store for omnimux-accounts plugin.
 * Self-contained, zero-hub-imports compliant.
 * Persists group, agent_usable, last_used_at under $DSH_HOME/omnimux/accounts.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @param {string} home
 */
export function accountsMetaFile(home) {
  return join(home, 'omnimux', 'accounts.json')
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown> | undefined} meta
 * @returns {Record<string, unknown>}
 */
export function mergeMeta(row, meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { ...row }
  const out = { ...row }
  if (typeof meta.group === 'string' && meta.group !== '') out.group = meta.group
  else if (meta.group === null) out.group = null
  if (typeof meta.agent_usable === 'boolean') out.agent_usable = meta.agent_usable
  if (typeof meta.last_used_at === 'string' && meta.last_used_at !== '') out.last_used_at = meta.last_used_at
  return out
}

/**
 * @param {{ home: string, now?: () => string }} deps
 */
export function createAccountMetaStore(deps) {
  const path = accountsMetaFile(deps.home)
  const dir = join(deps.home, 'omnimux')
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString()

  /**
   * @returns {Record<string, Record<string, unknown>>}
   */
  function readForAuthorization() {
    let raw
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return {}
      throw new Error('account-policy-unavailable: cannot read account permissions', { cause: error })
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.values(raw).some((row) =>
      !row || typeof row !== 'object' || Array.isArray(row) ||
      (Object.hasOwn(row, 'agent_usable') && typeof row.agent_usable !== 'boolean'))) {
      throw new Error('account-policy-unavailable: invalid account permissions')
    }
    return raw
  }

  function readAll() {
    try { return readForAuthorization() } catch { return {} }
  }

  /**
   * @param {Record<string, Record<string, unknown>>} doc
   */
  function writeAll(doc) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(path, `${JSON.stringify(doc, undefined, 2)}\n`, { mode: 0o600 })
  }

  function read() {
    return readAll()
  }

  /**
   * @param {string} id
   * @param {{ group?: string | null, agent_usable?: boolean }} patch
   */
  function patch(id, patchData) {
    if (!id || typeof id !== 'string') throw new Error('Account id is required')
    const doc = readForAuthorization()
    const current = doc[id] || {}
    const next = { ...current }
    if (patchData.group !== undefined) {
      if (patchData.group === null || patchData.group === '') delete next.group
      else next.group = String(patchData.group)
    }
    if (typeof patchData.agent_usable === 'boolean') {
      next.agent_usable = patchData.agent_usable
    }
    next.updated_at = now()
    doc[id] = next
    writeAll(doc)
    return next
  }

  return { read, readForAuthorization, patch, readAll, writeAll }
}
