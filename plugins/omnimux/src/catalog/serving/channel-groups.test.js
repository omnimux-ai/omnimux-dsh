import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getModelChannelGroups,
  parseModelAndGroup,
  resolveChannelCandidates,
  ROUTING_STRATEGIES,
} from './channel-groups.js'

describe('OmniMux Model Channel Groups & Routing Strategies', () => {
  it('defines valid routing strategies', () => {
    assert.deepEqual(ROUTING_STRATEGIES, ['auto', 'stability_first', 'cost_first'])
  })

  describe('parseModelAndGroup', () => {
    it('parses models without group', () => {
      assert.deepEqual(parseModelAndGroup('seedance-2-0'), {
        modelId: 'seedance-2-0',
        group: null,
      })
      assert.deepEqual(parseModelAndGroup('  seedance-2.0  '), {
        modelId: 'seedance-2-0',
        group: null,
      })
    })

    it('parses model@group format', () => {
      assert.deepEqual(parseModelAndGroup('seedance-2-0@standard'), {
        modelId: 'seedance-2-0',
        group: 'standard',
      })
      assert.deepEqual(parseModelAndGroup('claude-opus-4-6@claude-plus'), {
        modelId: 'claude-opus-4-6',
        group: 'claude-plus',
      })
    })

    it('handles empty or malformed inputs', () => {
      assert.deepEqual(parseModelAndGroup(''), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup(null), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup('@group-only'), { modelId: '', group: null })
    })
  })

  describe('getModelChannelGroups', () => {
    it('returns defined channel groups for seedance-2-0', () => {
      const groups = getModelChannelGroups('seedance-2-0')
      assert.ok(Array.isArray(groups))
      assert.ok(groups.length >= 3)
      const ids = groups.map((g) => g.id)
      assert.ok(ids.includes('pro'))
      assert.ok(ids.includes('official'))
      assert.ok(ids.includes('standard'))
    })

    it('returns empty array for models without defined groups', () => {
      assert.deepEqual(getModelChannelGroups('unregistered-custom-model'), [])
    })
  })

  describe('resolveChannelCandidates', () => {
    it('resolves explicit group requests first', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { group: 'standard' })
      assert.equal(candidates[0], 'seedance-2-0@standard')
      assert.ok(candidates.includes('seedance-2-0'))
    })

    it('resolves explicit group from inline model@group', () => {
      const candidates = resolveChannelCandidates('claude-opus-4-6@claude-plus')
      assert.equal(candidates[0], 'claude-opus-4-6@claude-plus')
      assert.ok(candidates.includes('claude-opus-4-6'))
    })

    it('sorts by cost_first (lowest points estimate first)', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { strategy: 'cost_first' })
      assert.ok(candidates.length >= 4)
      // cheap (800) -> standard (1040) -> preferred (1560) -> pro (3476) -> official (3568)
      assert.equal(candidates[0], 'seedance-2-0@seedance-cheap')
      assert.equal(candidates[1], 'seedance-2-0@standard')
    })

    it('sorts by stability_first (highest 24h stability first)', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { strategy: 'stability_first' })
      assert.ok(candidates.length >= 4)
      // official has 67% stability, should be ranked last among groups
      const officialIndex = candidates.findIndex((c) => c.includes('@official'))
      const proIndex = candidates.findIndex((c) => c.includes('@seedance-pro'))
      assert.ok(proIndex < officialIndex, 'pro (100%) should rank before official (67%)')
    })

    it('filters by allowedGroups when provided', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', {
        strategy: 'cost_first',
        allowedGroups: ['standard', 'official'],
      })
      assert.ok(candidates.includes('seedance-2-0@standard'))
      assert.ok(candidates.includes('seedance-2-0@official'))
      assert.ok(!candidates.includes('seedance-2-0@seedance-cheap'))
    })

    it('falls back to gatewayCandidates for unregistered models', () => {
      const candidates = resolveChannelCandidates('grok-imagine-video-1-5')
      assert.deepEqual(candidates, ['grok-imagine-video-1-5', 'grok-imagine-video-1.5'])
    })
  })
})
