/**
 * Disk cache for the last accepted gateway catalog snapshot.
 *
 * Mirrors the Apps catalog pattern (`src/apps/cache.js`, `store.js`): atomic
 * write, `0600` file inside a `0700` directory, a content digest for change
 * detection, and keep-last-good semantics — a failed or empty refresh never
 * replaces a usable snapshot.
 *
 * Snapshots are keyed by *view*: the gateway filters `/api/pricing` by the
 * caller's usable groups, so the anonymous view and each signed-in account view
 * must not share a file.
 */

import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CLOUD_SNAPSHOT_SCHEMA_VERSION, isSnapshotEmpty, snapshotContentDigest } from './snapshot.js'

export const CLOUD_CATALOG_DIR = 'catalog'
export const ANONYMOUS_VIEW = 'anonymous'

/** @param {string} home */
export function cloudCatalogRoot(home) {
  return join(home, 'omnimux', CLOUD_CATALOG_DIR)
}

/**
 * One filesystem-safe directory name per view. Account views are hashed so no
 * account identifier is written to the path.
 *
 * @param {string} viewKey
 */
export function viewDirectoryName(viewKey) {
  const raw = typeof viewKey === 'string' ? viewKey.trim() : ''
  if (!raw || raw === ANONYMOUS_VIEW) return ANONYMOUS_VIEW
  const safe = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  return safe ? `${safe}-${digest}` : `view-${digest}`
}

/**
 * `mkdirSync`'s mode only applies when the directory is created, so an
 * already-existing directory keeps whatever permissions it had. Correct it and
 * return the failure message instead of swallowing it.
 *
 * @param {string} dir
 * @param {number} mode
 * @returns {string|null}
 */
function correctDirectoryMode(dir, mode) {
  try {
    chmodSync(dir, mode)
    return null
  } catch (error) {
    return String(error?.message ?? error)
  }
}

/**
 * @param {string} home
 * @param {{ viewKey?: string }} [opts]
 */
export function createCloudCatalogStore(home, opts = {}) {
  const root = typeof home === 'string' && home.trim() ? cloudCatalogRoot(home) : ''
  const viewKey = opts.viewKey ?? ANONYMOUS_VIEW
  const dir = root ? join(root, viewDirectoryName(viewKey)) : ''
  const snapshotPath = dir ? join(dir, 'snapshot.json') : ''
  const metaPath = dir ? join(dir, 'meta.json') : ''

  /** @param {string} path */
  function readJson(path) {
    if (!path) return undefined
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
      return undefined
    }
  }

  /** @param {string} path @param {unknown} value */
  function writeJson(path, value) {
    const temporary = `${path}.tmp-${process.pid}`
    writeFileSync(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, path)
  }

  return {
    viewKey,
    dir,
    snapshotPath,
    metaPath,

    /** Last accepted snapshot plus its metadata, or undefined. */
    read() {
      const snapshot = readJson(snapshotPath)
      if (!snapshot || !Array.isArray(snapshot.models)) return undefined
      const meta = readJson(metaPath) ?? {}
      return { snapshot, meta }
    },

    /**
     * Persist a refresh result.
     *
     * Refuses to replace the stored snapshot when the new one carries no
     * membership information, or when the content digest is unchanged.
     *
     * @param {object} snapshot
     * @param {{ fetchedAt?: string, origin?: string, source?: string, stale?: boolean }} [meta]
     * @returns {{ accepted: boolean, reason: string, digest?: string }}
     */
    acceptRefresh(snapshot, meta = {}) {
      if (!snapshot || snapshot.schemaVersion !== CLOUD_SNAPSHOT_SCHEMA_VERSION) {
        return { accepted: false, reason: 'schema-mismatch' }
      }
      if (isSnapshotEmpty(snapshot)) return { accepted: false, reason: 'empty' }
      const digest = snapshotContentDigest(snapshot)
      const previous = readJson(metaPath)
      if (previous && previous.digest === digest) return { accepted: false, reason: 'unchanged', digest }
      if (!dir) return { accepted: false, reason: 'no-home' }

      mkdirSync(dir, { recursive: true, mode: 0o700 })
      const modeIssue = correctDirectoryMode(dir, 0o700)
      writeJson(snapshotPath, snapshot)
      writeJson(metaPath, {
        schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
        viewKey,
        digest,
        source: snapshot.source,
        generatedAt: snapshot.generatedAt ?? null,
        fetchedAt: meta.fetchedAt ?? new Date().toISOString(),
        origin: meta.origin ?? null,
        stale: meta.stale === true,
        modeWarning: modeIssue,
      })
      return { accepted: true, reason: 'written', digest, modeWarning: modeIssue }
    },

    /**
     * Mark the stored snapshot stale without touching its content (used when a
     * refresh attempt failed and the previous snapshot is still serving).
     *
     * @param {string} reason
     */
    markStale(reason) {
      const meta = readJson(metaPath)
      if (!meta || !dir) return { updated: false }
      writeJson(metaPath, { ...meta, stale: true, staleReason: reason, staleAt: new Date().toISOString() })
      return { updated: true }
    },

    /** Task-owned cleanup helper for tests and explicit cache resets. */
    clear() {
      if (!dir) return
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
