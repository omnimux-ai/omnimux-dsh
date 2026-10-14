import test from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../config.js'

test('official live provider settings reject embedded credential values', () => {
  const invalid = Config['~standard'].validate({ byokProviders: [{ provider: 'custom', apiKey: 'synthetic-secret' }] })
  assert.equal(invalid.issues.length, 1)
})

test('official live provider settings reject unsupported metadata instead of exposing it', () => {
  const invalid = Config['~standard'].validate({ byokProviders: [{ provider: 'custom', metadata: { authorization: 'synthetic-sensitive' } }] })
  assert.equal(invalid.issues.length, 1)
})

test('live official config preserves scenario selection and provider metadata alongside storage', () => {
  const raw = { scenarioBindings: { image: { channel: 'byok', provider: 'custom', model: 'custom-image' } }, byokProviders: [{ provider: 'custom', endpoint: 'https://provider.example.test', capabilities: ['image'], models: { image: 'custom-image' } }], referenceStorage: { enabled: false } }
  const result = Config['~standard'].validate(raw)
  assert.equal(result.issues, undefined)
  assert.equal(result.value.scenarioBindings.get().image.channel, 'byok')
  assert.equal(result.value.byokProviders.get().at(0).provider, 'custom')
  assert.equal(result.value.referenceStorage.get().enabled, false)
  assert.equal(Config.dict.scenarioBindings.meta.volatile, true)
  assert.deepEqual(Object.keys(Config.dict.scenarioBindings.dict), ['text', 'analysis', 'image', 'video', 'audio'])
  assert.deepEqual(Object.keys(Config.dict.scenarioBindings.dict.image.dict), ['channel', 'provider'])
})
