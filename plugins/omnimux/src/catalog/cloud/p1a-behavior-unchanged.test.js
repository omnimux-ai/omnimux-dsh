import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildModelCatalog } from '../list.js'
import { defaultBundledDir, readBundledSnapshot } from './bundled.js'
import { diffGatewayAgainstHub } from './diff.js'
import { createLiveCatalog } from './live.js'

/**
 * P1a's core promise: wiring the gateway snapshot into the running process must
 * not change one byte of what the hub serves. Membership switches over in P1b.
 */
test('the served catalog is identical whether or not a gateway snapshot is available', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'p1a-unchanged-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))

  const before = buildModelCatalog({})

  const live = createLiveCatalog({ home, bundledDir: defaultBundledDir() })
  const resolved = live.resolve()
  assert.ok(resolved.snapshot, 'bundled snapshot must be resolvable')
  live.setMemory(resolved.snapshot)

  const after = buildModelCatalog({})
  assert.deepEqual(after, before, 'a resolved snapshot must not alter the served catalog')
  assert.deepEqual(after.text.map((row) => row.id), before.text.map((row) => row.id))
  assert.deepEqual(after.video.map((row) => row.id), before.video.map((row) => row.id))
})

test('the drift diagnostic runs against the bundled snapshot without mutating the catalog', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'p1a-drift-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const read = readBundledSnapshot(defaultBundledDir())
  assert.ok(read.snapshot, 'bundled snapshot must parse')

  const catalog = buildModelCatalog({})
  const before = JSON.stringify(catalog)
  const drift = diffGatewayAgainstHub({ gateway: read.snapshot, hub: catalog })
  assert.equal(JSON.stringify(catalog), before, 'diagnostics must be read-only')
  assert.ok(Array.isArray(drift.unreachable), 'drift must report unreachable models')
  assert.ok(Array.isArray(drift.gatewayOnly), 'drift must report gateway-only models')
  // The bundled snapshot is a real gateway response, so it must produce a
  // report rather than an error for either side being unreadable.
  assert.ok(read.snapshot.models.length > 0)
})
