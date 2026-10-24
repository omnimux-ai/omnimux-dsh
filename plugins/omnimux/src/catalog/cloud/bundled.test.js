import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { BUNDLED_SNAPSHOT_FILENAME, defaultBundledDir, readBundledSnapshot } from './bundled.js'
import { CLOUD_SNAPSHOT_SCHEMA_VERSION, isSnapshotEmpty, snapshotDigest } from './snapshot.js'

/** A directory holding one `pricing.json` with the given raw text. */
function dirWith(body, t) {
  const dir = mkdtempSync(join(tmpdir(), 'bundled-snapshot-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  if (body !== undefined) writeFileSync(join(dir, BUNDLED_SNAPSHOT_FILENAME), body)
  return dir
}

function validSnapshot() {
  return {
    schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
    source: 'pricing',
    generatedAt: '2026-10-24T00:00:00.000Z',
    groups: { ratio: { default: 1 }, usable: { default: '默认' }, auto: ['default'] },
    coverage: { models: 1, channels: null, limitations: [] },
    models: [
      {
        id: 'alpha-video-1',
        displayName: 'Alpha Video 1',
        enableGroups: ['default'],
        supportedEndpointTypes: ['openai-video'],
        billing: { mode: 'per_second', modelPrice: 0.5, modelRatio: 1, quotaType: 0, expr: null },
        contract: {},
        contractPresent: false,
      },
    ],
  }
}

test('the shipped bundled snapshot is complete enough for a new machine', () => {
  const read = readBundledSnapshot(defaultBundledDir())
  assert.equal(read.issue, undefined, `bundled snapshot unreadable: ${read.issue}`)
  assert.ok(read.snapshot, 'bundled snapshot must parse')
  assert.equal(read.snapshot.schemaVersion, CLOUD_SNAPSHOT_SCHEMA_VERSION)
  assert.ok(read.snapshot.models.length > 0, 'bundled snapshot must carry models')
  assert.equal(isSnapshotEmpty(read.snapshot), false, 'bundled snapshot must carry membership')
  assert.match(snapshotDigest(read.snapshot), /^[0-9a-f]{64}$/)
})

test('a valid snapshot reads back with its path', (t) => {
  const dir = dirWith(JSON.stringify(validSnapshot()), t)
  const read = readBundledSnapshot(dir)
  assert.ok(read.snapshot)
  assert.equal(read.path, join(dir, BUNDLED_SNAPSHOT_FILENAME))
  assert.equal(read.snapshot.models[0].id, 'alpha-video-1')
})

test('missing, unreadable and malformed floors report an issue instead of throwing', (t) => {
  const missing = readBundledSnapshot(dirWith(undefined, t))
  assert.equal(missing.snapshot, undefined)
  assert.match(missing.issue, /unreadable/)

  const broken = readBundledSnapshot(dirWith('{not json', t))
  assert.equal(broken.snapshot, undefined)
  assert.match(broken.issue, /unreadable/)

  const array = readBundledSnapshot(dirWith('[]', t))
  assert.equal(array.snapshot, undefined)
  assert.match(array.issue, /not-an-object/)

  const wrongSchema = readBundledSnapshot(dirWith(JSON.stringify({ schemaVersion: 99, models: [] }), t))
  assert.equal(wrongSchema.snapshot, undefined)
  assert.match(wrongSchema.issue, /schema-version-mismatch/)

  const noModels = readBundledSnapshot(dirWith(JSON.stringify({ schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION }), t))
  assert.equal(noModels.snapshot, undefined)
  assert.match(noModels.issue, /missing-models/)
})
