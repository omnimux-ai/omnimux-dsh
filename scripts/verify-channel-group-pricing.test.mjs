import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  checkTextModelPricing,
  checkMirrorPricing,
  MIRROR_PATH,
} from './verify-channel-group-pricing.mjs'
import { MODEL_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js'

describe('channel group pricing gate', () => {
  it('passes on the live catalog and canvas mirror', () => {
    const mirrorText = readFileSync(MIRROR_PATH, 'utf8')
    assert.deepEqual(checkTextModelPricing(MODEL_CHANNEL_GROUPS), [])
    assert.deepEqual(checkMirrorPricing(MODEL_CHANNEL_GROUPS, mirrorText), [])
  })

  it('rejects an invented text model points estimate that drifts from gateway ratio', () => {
    const fakeCatalog = {
      'claude-sonnet-4-6': [
        { id: 'standard', wireGroup: 'default', pricing: { pointsEstimate: 1500 } }
      ]
    }
    const violations = checkTextModelPricing(fakeCatalog)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].rule, 'TEXT_STANDARD_PRICING_DRIFT')
    assert.match(violations[0].detail, /400 积分/)
  })

  it('rejects a pool estimate that drifts from 2.9 discount rate', () => {
    const fakeCatalog = {
      'claude-sonnet-4-6': [
        { id: 'pool', wireGroup: 'pool', pricing: { pointsEstimate: 428 } }
      ]
    }
    const violations = checkTextModelPricing(fakeCatalog)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].rule, 'TEXT_POOL_PRICING_DRIFT')
    assert.match(violations[0].detail, /114 积分/)
  })

  it('detects mirror points mismatch between hub and canvas', () => {
    const fakeCatalog = {
      'gemini-3.8-flash': [
        { id: 'standard', pricing: { pointsEstimate: 100 } }
      ]
    }
    const fakeMirror = `export const MODEL_CHANNEL_GROUPS = {
      "gemini-3.8-flash": [
        { "id": "standard", "pricing": { "pointsEstimate": 200 } }
      ]
    };`
    const violations = checkMirrorPricing(fakeCatalog, fakeMirror)
    assert.equal(violations.length, 1)
    assert.equal(violations[0].rule, 'MIRROR_POINTS_MISMATCH')
  })
})
