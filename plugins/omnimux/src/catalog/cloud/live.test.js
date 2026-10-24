import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { BUNDLED_SNAPSHOT_FILENAME } from './bundled.js'
import { createLiveCatalog } from './live.js'
import { CLOUD_SNAPSHOT_SCHEMA_VERSION } from './snapshot.js'

function snapshotWith(id, generatedAt) {
  return {
    schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
    source: 'pricing',
    generatedAt,
    groups: { ratio: {}, usable: {}, auto: [] },
    coverage: { models: 1, channels: null, limitations: [] },
    models: [
      {
        id,
        displayName: id,
        enableGroups: ['default'],
        supportedEndpointTypes: [],
        billing: { mode: null, modelPrice: null, modelRatio: null, quotaType: null, expr: null },
        contract: {},
        contractPresent: false,
      },
    ],
  }
}

/** Fixture: a home dir, a bundled dir, and a resolver over both. */
function fixture(t, opts = {}) {
  const home = mkdtempSync(join(tmpdir(), 'live-catalog-home-'))
  const bundledDir = mkdtempSync(join(tmpdir(), 'live-catalog-bundled-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
    rmSync(bundledDir, { recursive: true, force: true })
  })
  if (opts.bundled) {
    writeFileSync(join(bundledDir, BUNDLED_SNAPSHOT_FILENAME), JSON.stringify(snapshotWith(opts.bundled, opts.bundledAt)))
  }
  const live = createLiveCatalog({ home, bundledDir, now: () => Date.parse('2026-10-24T12:00:00.000Z') })
  if (opts.disk) {
    const accepted = live.store.acceptRefresh(snapshotWith(opts.disk, opts.diskAt), { fetchedAt: opts.diskAt })
    assert.equal(accepted.accepted, true, `disk fixture must be accepted: ${accepted.reason}`)
  }
  return live
}

test('bundled floor serves when there is no cache and is reported as stale', (t) => {
  const live = fixture(t, { bundled: 'bundled-model', bundledAt: '2026-10-20T00:00:00.000Z' })
  const resolved = live.resolve()
  assert.equal(resolved.source, 'bundled')
  assert.equal(resolved.snapshot.models[0].id, 'bundled-model')
  assert.equal(resolved.stale, true)
  assert.equal(resolved.bundledIssue, null)
  assert.match(resolved.digest, /^[0-9a-f]{64}$/)
})

test('a newer disk cache wins over the bundled floor', (t) => {
  const live = fixture(t, {
    bundled: 'bundled-model',
    bundledAt: '2026-10-20T00:00:00.000Z',
    disk: 'cached-model',
    diskAt: '2026-10-23T00:00:00.000Z',
  })
  const resolved = live.resolve()
  assert.equal(resolved.source, 'cache')
  assert.equal(resolved.snapshot.models[0].id, 'cached-model')
  assert.equal(resolved.fetchedAt, '2026-10-23T00:00:00.000Z')
})

test('the in-process snapshot wins while it is the newest', (t) => {
  const live = fixture(t, { bundled: 'bundled-model', bundledAt: '2026-10-20T00:00:00.000Z' })
  live.setMemory(snapshotWith('memory-model', '2026-10-24T00:00:00.000Z'))
  const resolved = live.resolve()
  assert.equal(resolved.source, 'remote')
  assert.equal(resolved.snapshot.models[0].id, 'memory-model')
  assert.equal(live.clearMemory(), true)
  assert.equal(live.resolve().source, 'bundled')
})

test('a cache older than the bundled floor is dropped, not served', (t) => {
  const live = fixture(t, {
    bundled: 'bundled-model',
    bundledAt: '2026-10-23T00:00:00.000Z',
    disk: 'old-cached-model',
    diskAt: '2026-10-01T00:00:00.000Z',
  })
  const resolved = live.resolve()
  assert.equal(resolved.source, 'bundled')
  assert.deepEqual(resolved.drop, [{ kind: 'disk', reason: 'older_than_bundled' }])
})

test('no usable copy at all reports source none without throwing', (t) => {
  const live = fixture(t, {})
  const resolved = live.resolve()
  assert.equal(resolved.snapshot, undefined)
  assert.equal(resolved.source, 'none')
  assert.equal(resolved.digest, null)
})
