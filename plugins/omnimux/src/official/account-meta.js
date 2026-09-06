/** Local account-metadata overlay, one JSON document under $DSH_HOME/omnimux. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Keys the overlay is allowed to persist. Anything else is dropped. */
const META_KEYS = Object.freeze(['group', 'agent_usable', 'last_used_at'])

/**
 * @param {string} home
 */
export function accountsMetaFile(home) {
  return join(home, 'omnimux', 'accounts.json')
}

/**
 * Overlay-merge a picked site row with local metadata. Only overlay keys that
 * are actually set override the site fields, so a missing key never fabricates
 * data. Pure: returns a new object.
 * @param {Record<string, unknown>} row picked site row
 * @param {Record<string, unknown> | undefined} meta local overlay row
 * @returns {Record<string, unknown>}
 */
export function mergeMeta(row, meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { ...row }
  const out = { ...row }
  if (typeof meta.group === 'string' && meta.group !== '') out.group = meta.group
  if (typeof meta.agent_usable === 'boolean') out.agent_usable = meta.agent_usable
  if (typeof meta.last_used_at === 'string' && meta.last_used_at !== '') out.last_used_at = meta.last_used_at
  return out
}

/**
 * File-backed map of account id → { group?, agent_usable?, last_used_at?, updated_at }.
 * Same write discipline as the avatar store and the apps catalog cache:
 * 0o700 directory, 0o600 file, whole-document rewrite. A missing or corrupt
 * file is treated as an empty document.
 * @param {{ home: string, now?: () => string }} deps
 */
export function createAccountMetaStore(deps) {
  const path = accountsMetaFile(deps.home)
  const dir = join(deps.home, 'omnimux')
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString()

  /**
   * @returns {Record<string, Record<string, unknown>>}
   */
  function readAll() {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'))
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return /** @type {Record<string, Record<string, unknown>>} */ (raw)
      }
    } catch {
      // absent or corrupt — treat as empty
    }
    return {}
  }

  /**
   * @param {Record<string, Record<string, unknown>>} doc
   */
  function writeAll(doc) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(path, `${JSON.stringify(doc, undefined, 2)}\n`, { mode: 0o600 })
  }

  /**
   * Whole overlay document, keyed by account id.
   * @returns {Record<string, Record<string, unknown>>}
   */
  function read() {
    return readAll()
  }

  /**
   * Merges a whitelisted patch into the account's overlay row and persists.
   * A `group` value of null (or an empty string) removes the key, which is how
   * "clear the group" is expressed on disk. `updated_at` is always refreshed.
   * @param {string} id
   * @param {Record<string, unknown>} patch
   * @returns {Record<string, unknown>}
   */
  function update(id, patch) {
    const doc = readAll()
    const current = doc[id] && typeof doc[id] === 'object' && !Array.isArray(doc[id])
      ? { ...doc[id] }
      : {}
    const source = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    for (const key of META_KEYS) {
      if (!(key in source)) continue
      const value = source[key]
      if (key === 'group') {
        if (value === null) delete current[key]
        else if (typeof value === 'string') {
          const trimmed = value.trim()
          if (trimmed === '') delete current[key]
          else current[key] = trimmed
        }
      } else if (key === 'agent_usable') {
        if (typeof value === 'boolean') current[key] = value
      } else if (key === 'last_used_at') {
        if (typeof value === 'string' && value !== '') current[key] = value
      }
    }
    current.updated_at = now()
    doc[id] = current
    writeAll(doc)
    return current
  }

  /**
   * @param {string} id
   */
  function remove(id) {
    const doc = readAll()
    if (!(id in doc)) return
    delete doc[id]
    writeAll(doc)
  }

  return { read, update, remove, path }
}
