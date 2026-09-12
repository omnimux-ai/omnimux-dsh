import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getModelChannelGroups,
  parseModelAndGroup,
  resolveChannelCandidates,
  resolveChannelPlan,
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
      assert.ok(ids.includes('preferred'))
      assert.ok(ids.includes('standard'))
      assert.ok(ids.includes('cheap'))
    })

    it('returns empty array for models without defined groups', () => {
      assert.deepEqual(getModelChannelGroups('unregistered-custom-model'), [])
    })
  })

  describe('resolveChannelCandidates', () => {
    it('resolves explicit group requests first', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { group: 'standard' })
      assert.equal(candidates[0], 'seedance-2-0@default')
      // Routing intent stays inside the group plan: no bare-model escape hatch.
      assert.ok(candidates.every((id) => id.includes('@')), candidates.join(','))
    })

    it('resolves explicit group from inline model@group', () => {
      const candidates = resolveChannelCandidates('claude-opus-4-6@default')
      assert.equal(candidates[0], 'claude-opus-4-6@default')
      assert.ok(candidates.every((id) => id.includes('@')), candidates.join(','))
    })

    it('sorts by cost_first (lowest points estimate first)', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { strategy: 'cost_first' })
      assert.ok(candidates.length >= 4)
      // cheap (800) -> standard (1040, wireGroup: default) -> preferred (1560) -> pro (3476)
      assert.equal(candidates[0], 'seedance-2-0@cheap')
      assert.equal(candidates[1], 'seedance-2-0@default')
    })

    it('sorts by stability_first (highest 24h stability first)', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { strategy: 'stability_first' })
      assert.ok(candidates.length >= 4)
      // cheap has 90% stability, should be ranked last among groups
      const cheapIndex = candidates.findIndex((c) => c.includes('@cheap'))
      const proIndex = candidates.findIndex((c) => c.includes('@seedance-2-0-task-pro'))
      assert.ok(proIndex < cheapIndex, 'pro (100%) should rank before cheap (90%)')
    })

    it('filters by allowedGroups when provided', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', {
        strategy: 'cost_first',
        allowedGroups: ['standard', 'cheap'],
      })
      assert.ok(candidates.includes('seedance-2-0@default'))
      assert.ok(candidates.includes('seedance-2-0@cheap'))
      assert.ok(!candidates.includes('seedance-2-0@seedance-standard'))
    })

    it('fails closed when the requested pool matches no configured group', () => {
      const plan = resolveChannelPlan('seedance-2-0', { allowedGroups: ['preferred-v2'] })
      // The pre-fix behaviour widened this into every channel; a cost-capped
      // request must never silently escalate to the priciest group.
      assert.deepEqual(plan.candidates, [])
      assert.deepEqual(plan.unresolvedGroups, ['preferred-v2'])
    })

    it('reports a group this model does not serve instead of dropping it silently', () => {
      // `preferred` exists for seedance-2-0 but not for seedance-2-0-fast.
      const plan = resolveChannelPlan('seedance-2-0-fast', { group: 'preferred' })
      assert.equal(plan.candidates[0], 'seedance-2-0-fast@preferred')
      assert.deepEqual(plan.unresolvedGroups, ['preferred'])
    })

    it('restricts the explicit-group failover tail to the allowed pool', () => {
      const plan = resolveChannelPlan('seedance-2-0', { group: 'cheap', allowedGroups: ['cheap'] })
      assert.deepEqual(plan.candidates, ['seedance-2-0@cheap'])
    })

    it('orders the explicit-group tail by the requested strategy', () => {
      const plan = resolveChannelPlan('seedance-2-0', { group: 'cheap', strategy: 'cost_first' })
      assert.deepEqual(plan.candidates, [
        'seedance-2-0@cheap',
        'seedance-2-0@default',
        'seedance-2-0@seedance-standard',
        'seedance-2-0@seedance-2-0-task-pro',
      ])
    })

    it('keeps a model without a channel pool on its base candidates and reports the intent', () => {
      const plan = resolveChannelPlan('grok-imagine-image-2', { allowedGroups: ['standard'] })
      // The alias keeps the pre-routing candidate list intact.
      assert.deepEqual(plan.candidates, [
        'grok-imagine-image-2',
        'grok-imagine-image',
        'grok-imagine-image-2-0',
        'grok-imagine-image-2.0',
      ])
      assert.deepEqual(plan.unresolvedGroups, ['standard'])
    })

    it('falls back to gatewayCandidates for unregistered models', () => {
      const candidates = resolveChannelCandidates('custom-unregistered-test-model')
      assert.deepEqual(candidates, ['custom-unregistered-test-model'])
    })
  })
})
