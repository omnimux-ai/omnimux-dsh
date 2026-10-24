/**
 * Bundled gateway snapshot: the floor every install ships with.
 *
 * A brand-new machine has no disk cache and may be offline, so the catalog must
 * still be complete on first launch (product baseline). The file is generated
 * from the gateway's public pricing endpoint at release time by
 * `scripts/catalog-snapshot.mjs` and holds the *normalized* snapshot — model
 * ids, display names, groups, endpoint types, billing and the gateway's own
 * contract, plus the top-level group ratios. Descriptions, vendor ids, owner
 * fields and tags are not part of it. It does carry the gateway's own group
 * display labels and whatever documentation links the gateway puts in its
 * contract notes — both are served to anonymous callers and are not secrets.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLOUD_SNAPSHOT_SCHEMA_VERSION } from './snapshot.js'

export const BUNDLED_SNAPSHOT_FILENAME = 'pricing.json'

/** Directory that ships with the plugin. */
export function defaultBundledDir() {
  return join(dirname(fileURLToPath(import.meta.url)), 'bundled')
}

/**
 * Read and validate the bundled snapshot.
 *
 * Returns `undefined` when the file is missing or unusable — never throws: a
 * damaged floor must not take the hub down, and callers fall back to the disk
 * cache. `issue` explains the miss for diagnostics.
 *
 * @param {string} [dir]
 * @returns {{ snapshot: object, path: string } | { snapshot: undefined, issue: string, code: string }}
 */
export function readBundledSnapshot(dir = defaultBundledDir()) {
  const path = join(dir, BUNDLED_SNAPSHOT_FILENAME)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { snapshot: undefined, issue: `unreadable: ${String(error?.message ?? error)}`, code: 'unreadable' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { snapshot: undefined, issue: 'not-an-object', code: 'not-an-object' }
  }
  if (parsed.schemaVersion !== CLOUD_SNAPSHOT_SCHEMA_VERSION) {
    return { snapshot: undefined, issue: `schema-version-mismatch: ${String(parsed.schemaVersion)}`, code: 'schema-version-mismatch' }
  }
  if (!Array.isArray(parsed.models)) {
    return { snapshot: undefined, issue: 'missing-models', code: 'missing-models' }
  }
  return { snapshot: parsed, path }
}
