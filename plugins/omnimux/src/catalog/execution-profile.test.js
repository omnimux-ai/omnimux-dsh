import assert from 'node:assert/strict'
import { test } from 'node:test'
import { executionProfileFromContract } from './execution-profile.js'

test('carries gateway reasoning efforts and default reasoning effort', () => {
  const profile = executionProfileFromContract({
    input_modalities: ['text', 'image'],
    reasoning_efforts: { low: 'low', medium: 'medium', high: 'high' },
    default_reasoning_effort: 'medium',
    unknowns: ['prompt_max_chars'],
  })
  assert.deepEqual(profile.reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.equal(profile.defaultReasoningEffort, 'medium')
  assert.deepEqual(profile.inputModalities, ['text', 'image'])
})

test('omits a default reasoning effort that is not declared in reasoning_efforts', () => {
  const profile = executionProfileFromContract({
    reasoning_efforts: { low: 'low', high: 'high' },
    default_reasoning_effort: 'max',
  })
  assert.equal(profile.defaultReasoningEffort, undefined)
})

test('omits all reasoning metadata when the gateway declares none', () => {
  const profile = executionProfileFromContract({ input_modalities: ['text'] })
  assert.equal(profile.reasoningEfforts, undefined)
  assert.equal(profile.defaultReasoningEffort, undefined)
})
