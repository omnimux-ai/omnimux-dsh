import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveModelChannelGroups, resolveChannelPlan } from './channel-groups.js'

function settings(extra) {
  return { byokProviders: [Object.assign({ provider: 'custom', endpoint: 'https://fixture.invalid/v1',
    models: { image: 'fixture-image' }, capabilities: ['image'], verified: true }, extra)] }
}

test('a completed compatible provider remains available in the public catalog and plan', () => {
  const current = settings({})
  const group = resolveModelChannelGroups('gpt-image-2.5', current).find((item) => item.id === 'byok-custom')
  assert.equal(group.enabled, true)
  assert.equal(group.isAvailable, true)
  assert.deepEqual(resolveChannelPlan('gpt-image-2.5@byok-custom', { runtimeSettings: current }).candidates, ['gpt-image-2.5@byok-custom'])
})

test('pending saves cannot claim availability or supply a public plan candidate', () => {
  const current = settings({ saveState: 'pending' })
  assert.equal(resolveModelChannelGroups('gpt-image-2.5', current).some((item) => item.id === 'byok-custom'), false)
  assert.deepEqual(resolveChannelPlan('gpt-image-2.5@byok-custom', { runtimeSettings: current }).candidates, [])
})

test('an explicit short capability veto defeats capabilities and model declarations', () => {
  const current = settings({ image: false })
  assert.equal(resolveModelChannelGroups('gpt-image-2.5', current).some((item) => item.id === 'byok-custom'), false)
  assert.deepEqual(resolveChannelPlan('gpt-image-2.5@byok-custom', { runtimeSettings: current }).candidates, [])
})

test('an explicit compatibility capability veto also defeats declarations', () => {
  const current = settings({ runtimeMediaImage: false })
  assert.equal(resolveModelChannelGroups('gpt-image-2.5', current).some((item) => item.id === 'byok-custom'), false)
  assert.deepEqual(resolveChannelPlan('gpt-image-2.5@byok-custom', { runtimeSettings: current }).candidates, [])
})
