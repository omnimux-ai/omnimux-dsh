/**
 * Read-only "current gateway snapshot" resolution for catalog consumers (P1b).
 *
 * P1a's `live.js` resolves bundled + disk + in-process copies and lets the
 * newest generation time win; that is the right rule for the runtime, where a
 * signed-in account view must outrank the anonymous floor. Catalog consumers,
 * however, need a deterministic answer that never touches the network and never
 * depends on whatever happened to be cached on this machine:
 *
 *   1. the bundled floor shipped in the package (always present, offline-safe)
 *   2. the last accepted refresh on disk, only when the floor is unusable
 *
 * `host/apply.js` replaces this default with the live resolution, so the served
 * catalog still follows the account view once the hub is running. Tests and
 * offline tools get the bundled snapshot unless they pass one explicitly.
 */

import { readBundledSnapshot } from './bundled.js'
import { createCloudCatalogStore } from './store.js'
import { snapshotContentDigest } from './snapshot.js'
import { hubHomeDir } from '../../host/paths.js'

/** @type {(() => object) | null} */
let injectedResolver = null

/**
 * Share the runtime's refreshed snapshot with every catalog consumer.
 * Pass `null` to fall back to the read-only bundled → disk resolution.
 * @param {(() => object) | null} resolver
 */
export function setCurrentSnapshotResolver(resolver) {
  injectedResolver = typeof resolver === 'function' ? resolver : null
}

/** @returns {void} */
export function resetCurrentSnapshotResolver() {
  injectedResolver = null
}

/** @param {object|undefined} snapshot */
function describe(snapshot, source, extra = {}) {
  return {
    snapshot,
    source,
    digest: snapshot ? snapshotContentDigest(snapshot) : null,
    generatedAt: typeof snapshot?.generatedAt === 'string' ? snapshot.generatedAt : null,
    fetchedAt: null,
    ...extra,
  }
}

/**
 * Read-only resolution: bundled floor first, disk cache only as its fallback.
 * Never throws and never fetches.
 *
 * @param {{ home?: string, bundledDir?: string }} [deps]
 */
export function resolveReadOnlySnapshot(deps = {}) {
  const bundledRead = readBundledSnapshot(deps.bundledDir)
  if (bundledRead.snapshot) {
    return describe(bundledRead.snapshot, 'bundled', {
      bundledIssue: null,
      bundledIssueCode: null,
      drop: [],
    })
  }

  /** @type {Array<{ kind: string, reason: string }>} */
  const drop = [{ kind: 'bundled', reason: bundledRead.code ?? 'unreadable' }]
  const store = createCloudCatalogStore(deps.home ?? hubHomeDir())
  const diskRead = store.read()
  if (diskRead?.snapshot) {
    return describe(diskRead.snapshot, 'cache', {
      bundledIssue: bundledRead.issue,
      bundledIssueCode: bundledRead.code ?? 'unreadable',
      fetchedAt: typeof diskRead.meta?.fetchedAt === 'string' ? diskRead.meta.fetchedAt : null,
      drop,
    })
  }

  return {
    snapshot: undefined,
    source: 'none',
    digest: null,
    generatedAt: null,
    fetchedAt: null,
    bundledIssue: bundledRead.issue,
    bundledIssueCode: bundledRead.code ?? 'unreadable',
    drop,
  }
}

/**
 * The snapshot catalog consumers should read right now.
 *
 * An injected resolver (runtime) wins; otherwise the deterministic read-only
 * chain above serves. Returns a resolution object, never a bare snapshot, so
 * callers can report where the answer came from.
 *
 * @param {{ home?: string, bundledDir?: string, resolve?: () => object }} [deps]
 */
export function resolveCurrentSnapshot(deps = {}) {
  if (typeof deps.resolve === 'function') return deps.resolve()
  if (injectedResolver) return injectedResolver()
  return resolveReadOnlySnapshot(deps)
}

/** Convenience: just the snapshot, or `undefined` when nothing is readable. */
export function currentSnapshotOrUndefined(deps = {}) {
  return resolveCurrentSnapshot(deps).snapshot
}
