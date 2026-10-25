import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { registerCatalogRoutes } from '../http.js'
import { defaultBundledDir, readBundledSnapshot } from './bundled.js'
import { diffGatewayAgainstHub, driftSummaryCounts } from './diff.js'
import { createLiveCatalog } from './live.js'
import { createCatalogRefresher } from './refresh.js'
import { normalizePricingPayload } from './snapshot.js'
import { buildModelCatalog } from '../list.js'

/** Route harness: register the catalog route and dispatch one request at it. */
async function dispatch(path) {
  let route
  registerCatalogRoutes({ register(registered) { route = registered; return () => {} } }, {
    list: () => ({ source: 'catalog', text: [{ id: 'a' }] }),
    diagnostics: () => ({ schemaVersion: 1, snapshot: { source: 'bundled' }, drift: { groupUnregistered: 3 } }),
  })
  let status = 0
  let body
  const res = {
    setHeader() {},
    end(payload) { body = JSON.parse(payload) },
    writeHead(code) { status = code },
  }
  await route.handler({ method: 'GET', url: path, headers: {} }, res)
  return { status, body }
}

test('the diagnostics view rides the catalog route without changing the catalog body', async () => {
  const plain = await dispatch('/omnimux/model-catalog')
  assert.deepEqual(plain.body, { source: 'catalog', text: [{ id: 'a' }] })

  const diagnostics = await dispatch('/omnimux/model-catalog?view=diagnostics')
  assert.equal(diagnostics.body.snapshot.source, 'bundled')
  assert.equal(diagnostics.body.drift.groupUnregistered, 3)

  // An unknown view must fall back to the catalog, never to diagnostics.
  const unknown = await dispatch('/omnimux/model-catalog?view=whatever')
  assert.deepEqual(unknown.body, { source: 'catalog', text: [{ id: 'a' }] })
})

/**
 * The diagnostics counters must equal the diff document's own summary. This is
 * the assertion whose absence let P1a report "0 unregistered groups" while the
 * diff said 3 (the caller read a category name that does not exist).
 */
test('drift counters come from the diff summary, including unregistered groups', () => {
  // P1b: the served catalog now registers every gateway group, so the regression this
  // test guards is pinned with an explicit gateway/hub pair instead of depending on
  // whatever drift this checkout happens to have.
  const gateway = snapshotOf(['a-1'])
  const hub = {
    models: [{ id: 'a-1', listed: true, listedOperations: ['a-1#chat'], channelGroups: [] }],
    text: [{ id: 'a-1' }],
  }
  const drift = diffGatewayAgainstHub({ gateway, hub })
  const counts = driftSummaryCounts(drift)
  assert.equal(counts.groupUnregistered, drift.summary.groupExtra)
  assert.ok(drift.summary.groupExtra > 0, 'a gateway group the hub does not register must be reported')
  assert.ok(counts.groupUnregistered > 0, 'the reader-facing count must not be zero')
  assert.equal(counts.unreachable, drift.summary.unreachable)
  assert.equal(counts.gatewayOnly, drift.summary.gatewayOnly)
  // A missing summary must read as zeros, not as undefined.
  assert.deepEqual(driftSummaryCounts(undefined), {
    unreachable: 0, groupMissing: 0, gatewayOnly: 0, groupUnregistered: 0, priceChanged: 0,
  })
})

/** A gateway payload with the given model ids and one extra group. */
function payload(ids) {
  return {
    success: true,
    group_ratio: { default: 1, extra: 1 },
    usable_group: { default: '默认', extra: '额外' },
    auto_groups: ['default'],
    data: ids.map((id) => ({
      model_name: id,
      enable_groups: ['default'],
      supported_endpoint_types: ['openai'],
      billing_mode: 'per_second',
      model_price: 0.5,
      model_ratio: 1,
      quota_type: 0,
      contract: {},
    })),
  }
}

function snapshotOf(ids, generatedAt) {
  return normalizePricingPayload(payload(ids), { generatedAt }).snapshot
}

function fixture(t, opts = {}) {
  const home = mkdtempSync(join(tmpdir(), 'p1a-review-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  let clock = opts.now ?? Date.parse('2026-10-24T12:00:00.000Z')
  const live = createLiveCatalog({ home, bundledDir: join(home, 'no-bundled'), now: () => clock })
  if (opts.seed) {
    const accepted = live.store.acceptRefresh(opts.seed, { fetchedAt: opts.seedAt })
    assert.equal(accepted.accepted, true, `seed must be accepted: ${accepted.reason}`)
  }
  const refresher = createCatalogRefresher({
    live,
    url: 'https://api.omnimux.ai/api/pricing',
    ttlSeconds: opts.ttlSeconds ?? 3600,
    timeoutMs: 1000,
    fetchImpl: opts.fetchImpl,
    now: () => clock,
  })
  return { live, refresher, advance: (ms) => { clock += ms } }
}

test('an unchanged refresh moves the TTL clock instead of refetching every tick', async (t) => {
  const { refresher, advance } = fixture(t, {
    seed: snapshotOf(['a-1', 'b-1'], '2026-10-23T00:00:00.000Z'),
    seedAt: '2026-10-24T09:00:00.000Z',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload(['a-1', 'b-1']) }),
  })
  const first = await refresher.refreshOnce(true)
  assert.equal(first.reason, 'unchanged')
  advance(60 * 1000)
  const second = await refresher.refreshOnce(false)
  assert.equal(second.status, 'skipped', 'an unchanged fetch must reset the TTL window')
})

test('a successful unchanged refresh clears a previous stale mark', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: snapshotOf(['a-1', 'b-1'], '2026-10-23T00:00:00.000Z'),
    seedAt: '2026-10-24T09:00:00.000Z',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload(['a-1', 'b-1']) }),
  })
  live.store.markStale('fetch-failed')
  assert.equal(live.resolve().stale, true)
  const result = await refresher.refreshOnce(true)
  assert.equal(result.reason, 'unchanged')
  assert.equal(live.store.read().meta.stale, false)
  assert.equal(live.store.read().meta.staleReason, undefined)
})

test('a failed refresh still marks stale and reports a path-free error code', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: snapshotOf(['a-1', 'b-1'], '2026-10-23T00:00:00.000Z'),
    seedAt: '2026-10-24T09:00:00.000Z',
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND api.omnimux.ai /Users/someone/private/path')
    },
  })
  await refresher.refreshOnce(true)
  const state = refresher.state()
  assert.equal(state.errorCode, 'fetch-failed')
  assert.equal(state.error.includes('/Users/someone'), true, 'the detail keeps the cause for logs')
  assert.equal(state.errorCode.includes('/'), false, 'the surfaced code must not carry a path')
  assert.equal(live.store.read().meta.stale, true)
})

test('bundled snapshot failures carry a stable code next to the detail', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'p1a-review-bundled-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const missing = readBundledSnapshot(dir)
  assert.equal(missing.snapshot, undefined)
  assert.equal(missing.code, 'unreadable')
  assert.ok(missing.issue.length > 0)
})
