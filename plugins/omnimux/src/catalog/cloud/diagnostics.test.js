import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { defaultBundledDir, readBundledSnapshot } from './bundled.js'
import { createCatalogDiagnostics } from './diagnostics.js'
import { diffGatewayAgainstHub } from './diff.js'
import { createLiveCatalog } from './live.js'
import { createCatalogRefresher } from './refresh.js'
import { normalizePricingPayload } from './snapshot.js'
import { buildModelCatalog } from '../list.js'

/**
 * The diagnostics body is what a reviewer or the settings card reads, so it is
 * asserted here directly instead of only through a stub.
 */
test('the real diagnostics body reports the diff summary and leaks nothing local', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'diag-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const now = Date.parse('2026-10-24T12:00:00.000Z')
  const live = createLiveCatalog({ home, bundledDir: defaultBundledDir(), now: () => now })
  const refresher = createCatalogRefresher({
    live,
    url: 'https://api.omnimux.ai/api/pricing',
    ttlSeconds: 3600,
    timeoutMs: 1000,
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND /Users/someone/private/path/config.json')
    },
    now: () => now,
  })
  const diagnostics = createCatalogDiagnostics({ live, refresher, listCatalog: () => buildModelCatalog({}) })

  return refresher.refreshOnce(true).then(() => {
    const body = diagnostics()
    const serialized = JSON.stringify(body)

    // Counts equal the diff document's own summary, item by item.
    const resolved = live.resolve()
    const expected = diffGatewayAgainstHub({ gateway: resolved.snapshot, hub: buildModelCatalog({}) })
    assert.deepEqual(body.drift, {
      unreachable: expected.summary.unreachable,
      groupMissing: expected.summary.groupMissing,
      gatewayOnly: expected.summary.gatewayOnly,
      groupUnregistered: expected.summary.groupExtra,
      priceChanged: expected.summary.priceChanged,
    })
    assert.ok(body.drift.groupUnregistered > 0, 'the live gateway has groups the hub has not registered')

    // Shape: stable codes only, never raw paths or upstream error text.
    assert.equal(body.schemaVersion, 1)
    assert.equal(body.snapshot.source, 'bundled')
    assert.equal(body.snapshot.models, resolved.snapshot.models.length)
    assert.equal(body.refresh.errorCode, 'fetch-failed')
    assert.equal(serialized.includes('/Users'), false)
    assert.equal(serialized.includes('ENOTFOUND'), false)
    assert.equal(serialized.includes('config.json'), false)
    assert.equal(serialized.includes('staleReason'), false)
  })
})

test('diagnostics without a usable snapshot report source none and no drift', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'diag-empty-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const live = createLiveCatalog({ home, bundledDir: join(home, 'no-bundled') })
  const refresher = createCatalogRefresher({
    live,
    url: 'https://api.omnimux.ai/api/pricing',
    ttlSeconds: 3600,
    timeoutMs: 1000,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }),
  })
  const body = createCatalogDiagnostics({ live, refresher, listCatalog: () => buildModelCatalog({}) })()
  assert.equal(body.snapshot.source, 'none')
  assert.equal(body.snapshot.models, 0)
  assert.equal(body.snapshot.bundledIssueCode, 'unreadable')
  assert.equal(body.drift, null)
})

test('a failed refresh is retried on the next tick rather than after a full TTL', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'diag-retry-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  let clock = Date.parse('2026-10-24T12:00:00.000Z')
  const live = createLiveCatalog({ home, bundledDir: join(home, 'no-bundled'), now: () => clock })
  const seeded = normalizePricingPayload({
    success: true,
    group_ratio: { default: 1 },
    usable_group: { default: '默认' },
    auto_groups: ['default'],
    data: [{
      model_name: 'a-1',
      enable_groups: ['default'],
      supported_endpoint_types: ['openai'],
      billing_mode: 'per_second',
      model_price: 0.5,
      model_ratio: 1,
      quota_type: 0,
      contract: {},
    }],
  }, { generatedAt: '2026-10-23T00:00:00.000Z' }).snapshot
  live.store.acceptRefresh(seeded, { fetchedAt: '2026-10-24T11:00:00.000Z' })

  let attempts = 0
  const refresher = createCatalogRefresher({
    live,
    url: 'https://api.omnimux.ai/api/pricing',
    ttlSeconds: 3600,
    timeoutMs: 1000,
    fetchImpl: async () => {
      attempts += 1
      throw new Error('offline')
    },
    now: () => clock,
  })

  await refresher.refreshOnce(true)
  assert.equal(attempts, 1)
  assert.equal(refresher.due(), true, 'a failed attempt must not push the clock forward')

  clock += 60 * 60 * 1000
  const retry = await refresher.refreshOnce(false)
  assert.equal(retry.reason, 'fetch-failed')
  assert.equal(attempts, 2, 'the next tick retries')
  assert.equal(live.store.read().meta.staleAt, '2026-10-24T13:00:00.000Z', 'the stale mark uses the injected clock')
})
