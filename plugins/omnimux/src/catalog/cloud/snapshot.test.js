import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CLOUD_SNAPSHOT_SCHEMA_VERSION,
  detectSnapshotSource,
  isSnapshotEmpty,
  normalizeChannelBaseline,
  normalizePricingPayload,
  readOptionMap,
  readOptionValue,
  serializeSnapshot,
  snapshotDigest,
} from './snapshot.js'

const FIXTURES = new URL('./fixtures/', import.meta.url)
const PRICING = JSON.parse(readFileSync(new URL('pricing-anonymous.json', FIXTURES), 'utf8'))
const BASELINE = {
  channels: JSON.parse(readFileSync(new URL('baseline/channels.json', FIXTURES), 'utf8')),
  models: JSON.parse(readFileSync(new URL('baseline/models.json', FIXTURES), 'utf8')),
  options: JSON.parse(readFileSync(new URL('baseline/options.json', FIXTURES), 'utf8')),
}

describe('normalizePricingPayload', () => {
  it('normalizes membership, groups, billing and contract from /api/pricing', () => {
    const { snapshot, issues } = normalizePricingPayload(PRICING, { generatedAt: '2026-10-24T00:00:00.000Z' })
    assert.deepEqual(issues, [])
    assert.equal(snapshot.schemaVersion, CLOUD_SNAPSHOT_SCHEMA_VERSION)
    assert.equal(snapshot.source, 'pricing')
    assert.equal(snapshot.generatedAt, '2026-10-24T00:00:00.000Z')
    assert.equal(snapshot.coverage.models, 2)
    assert.deepEqual(snapshot.models.map((model) => model.id), ['alpha-video-1', 'beta-image-1'])

    const alpha = snapshot.models[0]
    assert.deepEqual(alpha.enableGroups, ['default'])
    assert.deepEqual(alpha.supportedEndpointTypes, ['openai-video'])
    assert.equal(alpha.billing.mode, 'per_second')
    assert.equal(alpha.billing.modelPrice, 0.5)
    assert.equal(alpha.contractPresent, true)
    assert.deepEqual(alpha.contract.operations, ['text_to_video'])

    const beta = snapshot.models[1]
    assert.deepEqual(beta.enableGroups, ['default', 'economy'])
    assert.equal(beta.contractPresent, false)

    assert.equal(snapshot.groups.ratio.default, 1)
    assert.equal(snapshot.groups.usable.economy, '经济')
    assert.deepEqual(snapshot.groups.auto, ['default'])
  })

  it('accepts a bare data array and reports a missing data array', () => {
    const bare = normalizePricingPayload(PRICING.data)
    assert.equal(bare.snapshot.coverage.models, 2)

    const broken = normalizePricingPayload({ success: true })
    assert.deepEqual(broken.issues.map((issue) => issue.code), ['missing-pricing-data'])
    assert.equal(broken.snapshot.coverage.models, 0)
    assert.equal(isSnapshotEmpty(broken.snapshot), true)
  })

  it('flags duplicate rows and skips rows without an id', () => {
    const { snapshot, issues } = normalizePricingPayload({
      data: [
        { id: 'dup', enable_groups: ['default'] },
        { id: 'dup', enable_groups: ['economy'] },
        { enable_groups: ['default'] },
      ],
    })
    assert.deepEqual(issues.map((issue) => issue.code).sort(), ['duplicate-model-row', 'skipped-model-without-id'])
    assert.equal(snapshot.coverage.models, 1)
  })

  it('is insensitive to upstream array order (digest stability)', () => {
    const first = normalizePricingPayload({
      data: [
        { id: 'm1', enable_groups: ['b', 'a'], supported_endpoint_types: ['y', 'x'] },
        { id: 'm2', enable_groups: ['c'] },
      ],
    }).snapshot
    const second = normalizePricingPayload({
      data: [
        { id: 'm2', enable_groups: ['c'] },
        { id: 'm1', supported_endpoint_types: ['x', 'y'], enable_groups: ['a', 'b'] },
      ],
    }).snapshot
    assert.equal(snapshotDigest(first), snapshotDigest(second))
  })
})

describe('normalizeChannelBaseline', () => {
  it('derives membership and groups from enabled channels only', () => {
    const { snapshot, issues } = normalizeChannelBaseline(BASELINE, { generatedAt: '2026-10-24T00:00:00.000Z' })
    assert.deepEqual(issues, [])
    assert.equal(snapshot.source, 'channel-baseline')
    assert.deepEqual(snapshot.coverage.channels, { total: 3, enabled: 2 })
    assert.deepEqual(snapshot.models.map((model) => model.id), ['alpha-video-1', 'beta-image-1', 'shared-model-1'])

    const shared = snapshot.models[2]
    assert.deepEqual(shared.enableGroups, ['default', 'economy'])
    assert.equal(snapshot.models.some((model) => model.id === 'retired-model-1'), false)
  })

  it('records what the baseline cannot express instead of claiming absence', () => {
    const { snapshot } = normalizeChannelBaseline(BASELINE)
    assert.deepEqual(snapshot.coverage.limitations, [
      'channel-baseline lacks supported_endpoint_types',
      'channel-baseline lacks per-model contract',
    ])
    assert.deepEqual(snapshot.models[0].supportedEndpointTypes, [])
    assert.equal(snapshot.models[0].contractPresent, false)
  })

  it('parses option rows that hold JSON strings', () => {
    const { snapshot } = normalizeChannelBaseline(BASELINE)
    assert.equal(snapshot.groups.ratio['economy'], 0.5)
    assert.equal(snapshot.groups.usable.default, '标准')
    assert.deepEqual(snapshot.groups.auto, ['default'])
  })

  it('reports a missing channel baseline', () => {
    const { snapshot, issues } = normalizeChannelBaseline({ models: [] })
    assert.deepEqual(issues.map((issue) => issue.code), ['missing-channel-baseline'])
    assert.equal(isSnapshotEmpty(snapshot), true)
  })
})

describe('option readers', () => {
  it('accepts row lists, object maps and JSON strings', () => {
    assert.deepEqual(readOptionMap([{ key: 'GroupRatio', value: '{"a":1}' }]).GroupRatio, '{"a":1}')
    assert.deepEqual(readOptionMap({ GroupRatio: { a: 1 } }).GroupRatio, { a: 1 })
    assert.deepEqual(readOptionValue({ GroupRatio: '{"a":1}' }, 'GroupRatio'), { a: 1 })
    assert.deepEqual(readOptionValue({}, 'missing'), {})
  })
})

describe('isSnapshotEmpty', () => {
  it('treats a model set without any enabled group as no information', () => {
    assert.equal(isSnapshotEmpty({ models: [] }), true)
    assert.equal(isSnapshotEmpty({ models: [{ id: 'm1', enableGroups: [] }] }), true)
    assert.equal(isSnapshotEmpty({ models: [{ id: 'm1', enableGroups: ['default'] }] }), false)
  })
})

describe('serializeSnapshot', () => {
  it('is key-order independent', () => {
    assert.equal(serializeSnapshot({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }), serializeSnapshot({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }))
  })
})

describe('detectSnapshotSource', () => {
  it('distinguishes pricing payloads from baseline bundles', () => {
    assert.equal(detectSnapshotSource(PRICING), 'pricing')
    assert.equal(detectSnapshotSource(PRICING.data), 'pricing')
    assert.equal(detectSnapshotSource({ channels: BASELINE.channels }), 'channel-baseline')
    assert.equal(detectSnapshotSource(BASELINE.channels), 'channel-baseline')
    assert.equal(detectSnapshotSource({ nothing: true }), 'unknown')
  })
})

describe('fixture wiring', () => {
  it('loads fixtures relative to this module', () => {
    assert.ok(fileURLToPath(FIXTURES).endsWith('/fixtures/'))
  })
})

describe('comma-separated channel fields', () => {
  it('splits multi-group channels and string model lists', () => {
    const { snapshot } = normalizeChannelBaseline({
      channels: [
        { id: 1, status: 1, group: 'default,economy', models: 'm1, m2' },
        { id: 2, status: 1, group: 'economy', models: ['m2'] },
        { id: 3, status: 0, group: 'default', models: ['retired'] },
      ],
      models: [{ model_name: 'm1' }, { model_name: 'm2' }],
      options: [],
    })
    assert.deepEqual(snapshot.models.map((model) => model.id), ['m1', 'm2'])
    assert.deepEqual(snapshot.models[0].enableGroups, ['default', 'economy'])
    assert.deepEqual(snapshot.models[1].enableGroups, ['default', 'economy'])
  })
})

describe('pricing billing expression', () => {
  it('keeps billing_expr so a price comparison cannot treat model_price as authoritative', () => {
    const { snapshot } = normalizePricingPayload({
      data: [
        { id: 'm1', enable_groups: ['default'], billing_mode: 'per_task', model_price: 0.02, billing_expr: 'fixed(0.05)' },
        { id: 'm2', enable_groups: ['default'], billing_mode: 'per_task', model_price: 0.02 },
      ],
    })
    assert.equal(snapshot.models[0].billing.expr, 'fixed(0.05)')
    assert.equal(snapshot.models[1].billing.expr, null)
  })

  it('flags a pricing response that carries no group information at all', () => {
    const { snapshot } = normalizePricingPayload({ data: [{ id: 'm1' }, { id: 'm2' }] })
    assert.deepEqual(snapshot.coverage.limitations, ['pricing-response-without-enable-groups'])
  })

  it('does not flag the limitation when at least one row carries groups', () => {
    const { snapshot } = normalizePricingPayload({ data: [{ id: 'm1' }, { id: 'm2', enable_groups: ['default'] }] })
    assert.deepEqual(snapshot.coverage.limitations, [])
  })
})
