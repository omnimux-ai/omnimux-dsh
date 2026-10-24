import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createLiveCatalog } from './live.js'
import { normalizePricingPayload } from './snapshot.js'
import { DISAPPEARANCE_LIMIT, createCatalogRefresher, disappearance } from './refresh.js'

const NOW = Date.parse('2026-10-24T12:00:00.000Z')

/** A gateway `/api/pricing` payload with the given model ids. */
function payload(ids) {
  return {
    success: true,
    group_ratio: { default: 1 },
    usable_group: { default: '默认' },
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

/** Build a normalized snapshot from a synthetic payload. */
function seedSnapshot(ids) {
  return normalizePricingPayload(payload(ids), { generatedAt: '2026-10-23T00:00:00.000Z' }).snapshot
}

function fixture(t, opts = {}) {
  const home = mkdtempSync(join(tmpdir(), 'refresh-catalog-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const live = createLiveCatalog({ home, bundledDir: join(home, 'no-bundled'), now: () => NOW })
  if (opts.seed) {
    const accepted = live.store.acceptRefresh(opts.seed, { fetchedAt: new Date(NOW - 1000).toISOString() })
    assert.equal(accepted.accepted, true, `seed must be accepted: ${accepted.reason}`)
  }
  const changed = []
  const refresher = createCatalogRefresher({
    live,
    url: 'https://api.omnimux.ai/api/pricing',
    ttlSeconds: opts.ttlSeconds ?? 21600,
    timeoutMs: 1000,
    fetchImpl: opts.fetchImpl,
    now: () => NOW,
    onChanged: (snapshot) => changed.push(snapshot),
    origin: 'test',
  })
  return { live, refresher, changed }
}

test('a successful refresh is accepted, held in memory and announced', async (t) => {
  const fetched = []
  const { live, refresher, changed } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1']),
    fetchImpl: async (url) => {
      fetched.push(url)
      return { ok: true, status: 200, json: async () => payload(['a-1', 'b-1', 'c-1']) }
    },
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'ok')
  assert.equal(result.changed, true)
  assert.deepEqual(fetched, ['https://api.omnimux.ai/api/pricing'])
  assert.equal(changed.length, 1)
  assert.equal(live.resolve().snapshot.models.length, 3)
  assert.equal(live.resolve().source, 'remote')
})

test('an unchanged response is healthy but announces nothing', async (t) => {
  const { refresher, changed } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1']),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload(['a-1', 'b-1']) }),
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'ok')
  assert.equal(result.changed, false)
  assert.equal(result.reason, 'unchanged')
  assert.equal(changed.length, 0)
})

test('an empty response never replaces a usable snapshot', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1']),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload([]) }),
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'empty-response')
  assert.equal(live.resolve().snapshot.models.length, 2, 'previous snapshot must still serve')
  assert.equal(live.store.read().meta.stale, true)
})

test('a mass disappearance is refused and the previous snapshot stays', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1', 'c-1', 'd-1', 'e-1', 'f-1']),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload(['a-1']) }),
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'disappearance-guard')
  assert.deepEqual(result.summary, { known: 6, missing: 5, ratio: 5 / 6 })
  assert.equal(live.resolve().snapshot.models.length, 6)
  assert.equal(live.store.read().meta.stale, true)
})

test('a shrinking-but-acceptable response is applied', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1', 'c-1', 'd-1']),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload(['a-1', 'b-1', 'c-1']) }),
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'ok')
  assert.equal(result.changed, true)
  assert.equal(live.resolve().snapshot.models.length, 3)
})

test('a network failure only marks the stored snapshot stale', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1']),
    fetchImpl: async () => {
      throw new Error('offline')
    },
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'fetch-failed')
  assert.equal(live.resolve().snapshot.models.length, 2)
  assert.equal(live.store.read().meta.stale, true)
  assert.match(refresher.state().error, /offline/)
})

test('a non-2xx response is a failure, not an empty catalog', async (t) => {
  const { live, refresher } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1']),
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  })
  const result = await refresher.refreshOnce(true)
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'fetch-failed')
  assert.equal(live.resolve().snapshot.models.length, 2)
})

test('TTL gates non-forced refreshes', async (t) => {
  let calls = 0
  const { refresher } = fixture(t, {
    seed: seedSnapshot(['a-1', 'b-1']),
    fetchImpl: async () => {
      calls += 1
      return { ok: true, status: 200, json: async () => payload(['a-1', 'b-1']) }
    },
  })
  // The seed was fetched one second ago, so the six-hour TTL is not due.
  const skipped = await refresher.refreshOnce(false)
  assert.equal(skipped.status, 'skipped')
  assert.equal(calls, 0)
  const forced = await refresher.refreshOnce(true)
  assert.equal(forced.status, 'ok')
  assert.equal(calls, 1)
})

test('disappearance math is exposed for callers that need to explain a refusal', () => {
  const before = { models: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }
  const after = { models: [{ id: 'a' }, { id: 'd' }] }
  assert.deepEqual(disappearance(before, after), { known: 4, missing: 2, ratio: 0.5 })
  assert.equal(disappearance(undefined, after).known, 0)
  assert.equal(DISAPPEARANCE_LIMIT, 0.5)
})
