/**
 * In-process "current gateway snapshot" resolver (P1a).
 *
 * Chooses between three copies of the gateway view, mirroring the Apps catalog
 * resolver (`src/apps/resolve.js`):
 *
 *   1. bundled — the floor shipped in the package (always present, may be old)
 *   2. disk    — the last accepted refresh on this machine, per view
 *   3. memory  — the snapshot accepted during this process
 *
 * Newest generation time wins; a copy older than the bundled floor is dropped
 * (a newer package must not be shadowed by a stale cache). Resolution never
 * throws: an unreadable copy is reported as a drop reason and the next best
 * copy serves.
 */

import { createCloudCatalogStore, ANONYMOUS_VIEW } from './store.js'
import { readBundledSnapshot } from './bundled.js'
import { snapshotContentDigest } from './snapshot.js'

/** Public source labels: `cache` means the disk copy, `remote` the in-process one. */
const SOURCE_BY_KIND = Object.freeze({ memory: 'remote', disk: 'cache', bundled: 'bundled' })

/** @param {unknown} value */
function timeOf(value) {
  const raw = typeof value === 'string' && value.trim() ? value : null
  if (!raw) return 0
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * @param {{
 *   home: string,
 *   viewKey?: string,
 *   bundledDir?: string,
 *   now?: () => number,
 * }} deps
 */
export function createLiveCatalog(deps) {
  const viewKey = deps.viewKey ?? ANONYMOUS_VIEW
  const store = createCloudCatalogStore(deps.home, { viewKey })
  const now = deps.now ?? Date.now
  /** @type {{ snapshot: object, generatedAt: string|null, digest: string }|undefined} */
  let memory

  /** @param {object} snapshot @param {{ generatedAt?: string|null, fetchedAt?: string|null }} [meta] */
  function describe(snapshot, meta = {}) {
    return {
      snapshot,
      generatedAt: typeof snapshot?.generatedAt === 'string' ? snapshot.generatedAt : null,
      fetchedAt: typeof meta?.fetchedAt === 'string' ? meta.fetchedAt : null,
      digest: snapshotContentDigest(snapshot),
    }
  }

  function bundled() {
    const read = readBundledSnapshot(deps.bundledDir)
    return read.snapshot ? { ...describe(read.snapshot), path: read.path } : undefined
  }

  /**
   * @returns {{
   *   snapshot: object|undefined,
   *   source: 'remote'|'cache'|'bundled'|'none',
   *   digest: string|null,
   *   generatedAt: string|null,
   *   fetchedAt: string|null,
   *   stale: boolean,
   *   drop: Array<{ kind: string, reason: string }>,
   *   bundledIssue: string|null,
   *   bundledIssueCode: string|null,
   * }}
   */
  function resolve() {
    const bundledRead = readBundledSnapshot(deps.bundledDir)
    const floor = bundledRead.snapshot
      ? { kind: 'bundled', ...describe(bundledRead.snapshot) }
      : undefined
    /** @type {Array<{ kind: string, reason: string }>} */
    const drop = []
    /** @type {Array<{ kind: string, ... }>} */
    const candidates = floor ? [floor] : []

    const diskRead = store.read()
    if (diskRead?.snapshot) {
      const disk = { kind: 'disk', ...describe(diskRead.snapshot, diskRead.meta), meta: diskRead.meta }
      if (floor && timeOf(disk.generatedAt ?? disk.fetchedAt) < timeOf(floor.generatedAt ?? floor.fetchedAt)) {
        drop.push({ kind: 'disk', reason: 'older_than_bundled' })
      } else {
        candidates.push(disk)
      }
    }
    if (memory) {
      const candidate = { kind: 'memory', ...memory }
      if (floor && timeOf(candidate.generatedAt) < timeOf(floor.generatedAt)) {
        drop.push({ kind: 'memory', reason: 'older_than_bundled' })
      } else {
        candidates.push(candidate)
      }
    }

    const rank = { memory: 0, disk: 1, bundled: 2 }
    candidates.sort((left, right) => {
      const delta = timeOf(right.generatedAt ?? right.fetchedAt) - timeOf(left.generatedAt ?? left.fetchedAt)
      if (delta !== 0) return delta
      return rank[left.kind] - rank[right.kind]
    })

    const winner = candidates[0]
    const diskMeta = diskRead?.meta
    const stale = winner?.kind === 'bundled'
      ? Boolean(floor)
      : diskMeta?.stale === true && winner?.kind !== 'memory'
    return {
      snapshot: winner?.snapshot,
      source: winner ? SOURCE_BY_KIND[winner.kind] ?? 'none' : 'none',
      digest: winner?.digest ?? null,
      generatedAt: winner?.generatedAt ?? null,
      fetchedAt: winner?.fetchedAt ?? diskMeta?.fetchedAt ?? null,
      stale,
      drop,
      bundledIssue: bundledRead.snapshot ? null : bundledRead.issue,
      bundledIssueCode: bundledRead.snapshot ? null : bundledRead.code ?? 'unreadable',
    }
  }

  return {
    viewKey,
    store,
    resolve,

    /** Record a freshly accepted snapshot for this process. */
    setMemory(snapshot) {
      memory = describe(snapshot, { fetchedAt: new Date(now()).toISOString() })
      return memory
    },

    /** @returns {boolean} whether a snapshot was held in memory. */
    clearMemory() {
      const had = Boolean(memory)
      memory = undefined
      return had
    },
  }
}
