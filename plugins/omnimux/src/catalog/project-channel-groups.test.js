import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getModelChannelGroups } from './serving/channel-groups.js';
import { projectChannelGroups, projectModelDto, projectRow } from './project.js';

describe('catalog channel-group projection', () => {
  it('projects the hub pool for a model that has one', () => {
    const groups = projectChannelGroups('seedance-2-5')
    assert.ok(groups.length >= 2)
    for (const group of groups) {
      assert.equal(typeof group.id, 'string')
      assert.equal(typeof group.label, 'string')
      assert.equal(typeof group.wireGroup, 'string')
      assert.equal(typeof group.enabled, 'boolean')
    }
  });

  it('carries pricing through so a caller never re-declares it', () => {
    const groups = projectChannelGroups('seedance-2-5')
    const priced = groups.find((group) => group.pricing && typeof group.pricing.pointsEstimate === 'number')
    assert.ok(priced, 'seedance-2-5 must expose at least one priced line')
    assert.ok(['per_task', 'per_second', 'per_token'].includes(priced.pricing.billingMode))
  });

  it('matches the routing table it projects from, field for field', () => {
    const source = getModelChannelGroups('seedance-2-5')
    const projected = projectChannelGroups('seedance-2-5')
    assert.equal(projected.length, source.length)
    assert.deepEqual(
      projected.map((group) => [group.id, group.wireGroup, group.pricing?.pointsEstimate ?? null]),
      source.map((group) => [group.id, group.wireGroup || group.id, group.pricing?.pointsEstimate ?? null]),
    )
  });

  it('returns an empty array for a model with no configured pool', () => {
    assert.deepEqual(projectChannelGroups('unregistered-custom-model'), [])
  });

  it('returns a copy, so a caller cannot mutate the routing table', () => {
    const first = projectChannelGroups('seedance-2-5')
    const original = first[0].pricing.pointsEstimate
    first[0].pricing.pointsEstimate = -1
    assert.equal(projectChannelGroups('seedance-2-5')[0].pricing.pointsEstimate, original)
  });

  it('always puts channelGroups on a bucket row, empty when there is no pool', () => {
    const withPool = projectRow({ id: 'seedance-2-5', label: 'Seedance 2.5' }, [])
    assert.ok(Array.isArray(withPool.channelGroups))
    assert.ok(withPool.channelGroups.length >= 2)

    const withoutPool = projectRow({ id: 'unregistered-custom-model', label: 'Custom' }, [])
    // Present-but-empty, so callers need no optional chain and no default.
    assert.ok(Array.isArray(withoutPool.channelGroups))
    assert.equal(withoutPool.channelGroups.length, 0)
  });

  it('always puts channelGroups on the model DTO', () => {
    const dto = projectModelDto({ id: 'seedance-2-5', label: 'Seedance 2.5', operations: [] }, { dispositions: [] })
    assert.ok(Array.isArray(dto.channelGroups))
    assert.ok(dto.channelGroups.length >= 2)

    const bare = projectModelDto({ id: 'unregistered-custom-model', label: 'Custom', operations: [] }, { dispositions: [] })
    assert.deepEqual(bare.channelGroups, [])
  });
});
