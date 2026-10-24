import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { diffGatewayAgainstHub, expectedPoints, hubCatalogView } from './diff.js'
import { normalizePricingPayload } from './snapshot.js'

const PRICING = JSON.parse(readFileSync(new URL('fixtures/pricing-anonymous.json', import.meta.url), 'utf8'))

function gatewaySnapshot() {
  return normalizePricingPayload(PRICING).snapshot
}

function hubModel(id, groups, options = {}) {
  return {
    id,
    listed: options.listed !== false,
    listedOperations: options.listedOperations ?? ['text_to_video'],
    channelGroups: groups.map((group) => ({
      id: group.id,
      wireGroup: group.wireGroup,
      enabled: group.enabled !== false,
      pricing: { billingMode: group.billingMode, pointsEstimate: group.pointsEstimate },
    })),
  }
}

function hubCatalog(models, buckets = {}) {
  return {
    schemaVersion: 1,
    models,
    text: buckets.text ?? [],
    image: buckets.image ?? [],
    video: buckets.video ?? [],
    audio: buckets.audio ?? [],
  }
}

describe('expectedPoints', () => {
  it('reproduces per-second estimates on the five-second reference package', () => {
    assert.equal(expectedPoints({ billing: { modelPrice: 0.5 }, billingMode: 'per_second', groupRatio: 1, baselineSeconds: 5 }), 25)
    assert.equal(expectedPoints({ billing: { modelPrice: 0.8 }, billingMode: 'per_second', groupRatio: 0.17, baselineSeconds: 5 }), 6.8)
  })

  it('reproduces per-task estimates', () => {
    assert.equal(expectedPoints({ billing: { modelPrice: 0.02 }, billingMode: 'per_task', groupRatio: 0.5, baselineSeconds: 5 }), 0.1)
  })

  it('refuses to compare billing modes and inputs it does not model', () => {
    assert.equal(expectedPoints({ billing: { modelPrice: 1 }, billingMode: 'per_token', groupRatio: 1, baselineSeconds: 5 }), null)
    assert.equal(expectedPoints({ billing: {}, billingMode: 'per_second', groupRatio: 1, baselineSeconds: 5 }), null)
    assert.equal(expectedPoints({ billing: { modelPrice: 1 }, billingMode: 'per_second', groupRatio: null, baselineSeconds: 5 }), null)
  })
})

describe('hubCatalogView', () => {
  it('counts bucket rows as listed even without a models entry', () => {
    const view = hubCatalogView(hubCatalog([], { video: [{ id: 'bucket-only-model' }] }))
    assert.equal(view.get('bucket-only-model').listed, true)
    assert.deepEqual(view.get('bucket-only-model').groups, [])
  })

  it('treats a model with no listed operation as not listed', () => {
    const view = hubCatalogView(hubCatalog([{ id: 'registered-only', listed: false, listedOperations: [], channelGroups: [] }]))
    assert.equal(view.get('registered-only').listed, false)
  })
})

describe('diffGatewayAgainstHub', () => {
  it('flags models the hub lists while the gateway has no enabled channel', () => {
    const hub = hubCatalog([
      hubModel('alpha-video-1', [{ id: 'standard', wireGroup: 'default', billingMode: 'per_second', pointsEstimate: 25 }]),
      hubModel('ghost-model-1', [{ id: 'standard', wireGroup: 'default', billingMode: 'per_task', pointsEstimate: 1 }]),
    ])
    const diff = diffGatewayAgainstHub({ gateway: gatewaySnapshot(), hub })
    assert.deepEqual(diff.unreachable, [{ id: 'ghost-model-1', listedOperations: ['text_to_video'] }])
    assert.equal(diff.summary.unreachable, 1)
    assert.equal(diff.summary.hubListed, 2)
  })

  it('flags models the gateway serves while the hub does not list them', () => {
    const hub = hubCatalog([
      hubModel('alpha-video-1', [{ id: 'standard', wireGroup: 'default', billingMode: 'per_second', pointsEstimate: 25 }]),
    ])
    const diff = diffGatewayAgainstHub({ gateway: gatewaySnapshot(), hub })
    assert.deepEqual(diff.gatewayOnly, [{ id: 'beta-image-1', enableGroups: ['default', 'economy'] }])
    assert.equal(diff.summary.gatewayModels, 2)
  })

  it('reports group drift in both directions', () => {
    const hub = hubCatalog([
      hubModel('alpha-video-1', [{ id: 'standard', wireGroup: 'legacy-group', billingMode: 'per_second', pointsEstimate: 25 }]),
    ])
    const diff = diffGatewayAgainstHub({ gateway: gatewaySnapshot(), hub })
    assert.deepEqual(diff.groupMissing, [{ id: 'alpha-video-1', wireGroup: 'legacy-group', enableGroups: ['default'] }])
    assert.deepEqual(diff.groupExtra, [{ id: 'alpha-video-1', wireGroup: 'default' }])
  })

  it('flags a points estimate that the gateway numbers cannot reproduce', () => {
    const hub = hubCatalog([
      hubModel('alpha-video-1', [{ id: 'standard', wireGroup: 'default', billingMode: 'per_second', pointsEstimate: 30 }]),
    ])
    const diff = diffGatewayAgainstHub({ gateway: gatewaySnapshot(), hub })
    assert.deepEqual(diff.priceChanged, [{ id: 'alpha-video-1', wireGroup: 'default', hub: 30, expected: 25 }])
    assert.equal(diff.summary.comparablePrices, 1)
  })

  it('reports no price drift when the hub matches the gateway口径', () => {
    const hub = hubCatalog([
      hubModel('alpha-video-1', [{ id: 'standard', wireGroup: 'default', billingMode: 'per_second', pointsEstimate: 25 }]),
    ])
    const diff = diffGatewayAgainstHub({ gateway: gatewaySnapshot(), hub })
    assert.deepEqual(diff.priceChanged, [])
    assert.equal(diff.summary.priceChanged, 0)
    assert.equal(diff.summary.comparablePrices, 1)
  })

  it('skips disabled hub groups and unmodelled billing modes when comparing prices', () => {
    const hub = hubCatalog([
      hubModel('alpha-video-1', [
        { id: 'off', wireGroup: 'default', enabled: false, billingMode: 'per_second', pointsEstimate: 999 },
        { id: 'token', wireGroup: 'default', billingMode: 'per_token', pointsEstimate: 999 },
      ]),
    ])
    const diff = diffGatewayAgainstHub({ gateway: gatewaySnapshot(), hub })
    assert.deepEqual(diff.priceChanged, [])
    assert.equal(diff.summary.comparablePrices, 0)
  })

  it('carries the gateway snapshot coverage limitations into the report', () => {
    const gateway = normalizePricingPayload({ data: [{ id: 'only-model', enable_groups: ['default'] }] }).snapshot
    gateway.coverage.limitations = ['channel-baseline lacks per-model contract']
    const diff = diffGatewayAgainstHub({ gateway, hub: hubCatalog([]) })
    assert.deepEqual(diff.limitations, ['channel-baseline lacks per-model contract'])
  })

  it('treats a gateway model with no enabled group as unreachable rather than available', () => {
    const gateway = normalizePricingPayload({ data: [{ id: 'alpha-video-1', enable_groups: [] }] }).snapshot
    const hub = hubCatalog([hubModel('alpha-video-1', [{ id: 'standard', wireGroup: 'default', billingMode: 'per_second', pointsEstimate: 25 }])])
    const diff = diffGatewayAgainstHub({ gateway, hub })
    assert.equal(diff.summary.unreachable, 1)
    assert.equal(diff.summary.gatewayOnly, 0)
  })
})
