import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import {
  checkCanvasPricingSource,
  checkProjectionPricing,
  CANVAS_CHANNEL_MODULE,
} from './verify-channel-group-pricing.mjs'
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js'
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js'

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname)

const snapshot = () => resolveReadOnlySnapshot().snapshot
const catalog = (s = snapshot()) => buildModelCatalog({ env: {}, snapshot: s })

describe('channel group pricing gate', () => {
  it('passes on the live catalog and canvas mirror', () => {
    const canvasSource = readFileSync(resolve(REPO_ROOT, CANVAS_CHANNEL_MODULE), 'utf8')
    const report = checkProjectionPricing(snapshot(), catalog())
    assert.deepEqual(report.violations, [])
    assert.ok(report.comparable > 0, 'the snapshot must publish at least one comparable line price')
    assert.ok(report.explained > 0, 'the snapshot must publish at least one expression-billed line')
    assert.deepEqual(checkCanvasPricingSource(canvasSource), [])
  })

  it('rejects an invented text model points estimate that drifts from gateway ratio', () => {
    const built = catalog()
    const row = built.video.find((candidate) => candidate.channelGroups?.length > 0)
    assert.ok(row, 'the catalog must expose a video row with gateway lines')
    const tampered = {
      ...built,
      video: built.video.map((candidate) => (candidate.id === row.id
        ? {
            ...candidate,
            channelGroups: candidate.channelGroups.map((group, index) => (index === 0
              ? { ...group, pricing: { ...group.pricing, pointsEstimate: 9999 } }
              : group)),
          }
        : candidate)),
    }
    const violations = checkProjectionPricing(snapshot(), tampered).violations
    assert.equal(violations.length, 1)
    assert.equal(violations[0].rule, 'PROJECTION_PRICE_DRIFT')
    assert.equal(violations[0].modelId, row.id)
  })

  it('rejects a pool estimate that drifts from 2.9 discount rate', () => {
    const built = catalog()
    const row = built.image.find((candidate) => candidate.channelGroups?.some((group) => group.pricing?.pointsEstimate === null))
    assert.ok(row, 'the catalog must expose a line without a comparable price')
    const tampered = {
      ...built,
      image: built.image.map((candidate) => (candidate.id === row.id
        ? {
            ...candidate,
            channelGroups: candidate.channelGroups.map((group) => (group.pricing?.pointsEstimate === null
              ? { ...group, pricing: { ...group.pricing, pointsNote: undefined } }
              : group)),
          }
        : candidate)),
    }
    const violations = checkProjectionPricing(snapshot(), tampered).violations
    assert.ok(violations.some((violation) => violation.rule === 'PROJECTION_PRICE_UNEXPLAINED'))
  })

  it('detects mirror points mismatch between hub and canvas', () => {
    const built = catalog()
    const tampered = {
      ...built,
      audio: built.audio.map((candidate) => ({ ...candidate, channelGroups: [] })),
    }
    const violations = checkProjectionPricing(snapshot(), tampered).violations
    assert.ok(violations.some((violation) => violation.rule === 'CATALOG_LINE_MISSING'))
  })

  it('rejects a canvas module that re-declares a line table or a price literal', () => {
    const withTable = 'export const MODEL_CHANNEL_GROUPS = { "seedance-2-0": [{ "id": "standard" }] };'
    assert.equal(checkCanvasPricingSource(withTable)[0].rule, 'CANVAS_LOCAL_PRICE_TABLE')
    assert.equal(checkCanvasPricingSource('pricing: { pointsEstimate: 4.9 }')[0].rule, 'CANVAS_LOCAL_PRICE_LITERAL')
    assert.equal(checkCanvasPricingSource('pricing: { groupRatio: 0.17 }')[0].rule, 'CANVAS_LOCAL_RATIO_LITERAL')
  })
})
