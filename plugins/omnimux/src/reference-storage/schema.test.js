import test from 'node:test'
import assert from 'node:assert/strict'
import { SettingsConfig, parseSettingsSection } from '../settings/schema.js'

test('official namespace preserves reference storage config without credential values', () => {
  const config = { enabled: true, endpoint: 'https://storage.example.test', bucket: 'reference-media', region: 'auto', publicBaseUrl: 'https://media.example.test', credentialId: '0123456789abcdef0123456789abcdef' }
  const result = parseSettingsSection({ referenceStorage: config })
  assert.deepEqual(result.referenceStorage, config)
  assert.equal(SettingsConfig.toJSON().properties.referenceStorage.type, 'object')
  assert.throws(() => parseSettingsSection({ referenceStorage: { secretAccessKey: 'must-not-save' } }))
})
