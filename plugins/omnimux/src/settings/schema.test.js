import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SettingsConfig, parseSettingsSection, SETTINGS_DEFAULTS } from './schema.js'

describe('SettingsConfig', () => {
  it('fills defaults from empty input and is callable', () => {
    const parsed = SettingsConfig({})
    assert.deepEqual(parsed, { ...SETTINGS_DEFAULTS })
    assert.equal(SettingsConfig.type, 'object')
    assert.ok(SettingsConfig.dict.defaultTextModel)
    const json = SettingsConfig.toJSON()
    assert.equal(json.type, 'object')
    assert.ok(json.properties.defaultVideoModel)
  })

  it('keeps trimmed user overlays', () => {
    const parsed = parseSettingsSection({
      defaultTextModel: '  gpt-5.5  ',
      defaultImageModel: 'nanobanana-2',
    })
    assert.equal(parsed.defaultTextModel, 'gpt-5.5')
    assert.equal(parsed.defaultImageModel, 'nanobanana-2')
    assert.equal(parsed.defaultVideoModel, SETTINGS_DEFAULTS.defaultVideoModel)
  })

  it('declares and sanitizes byokProviders properly', () => {
    assert.ok(Array.isArray(SETTINGS_DEFAULTS.byokProviders))
    assert.equal(SETTINGS_DEFAULTS.byokProviders.length, 0)
    assert.ok(SettingsConfig.dict.byokProviders)
    assert.equal(SettingsConfig.dict.byokProviders.type, 'array')

    const parsed = parseSettingsSection({
      byokProviders: [
        null,
        123,
        'invalid-string',
        { provider: '' },
        { provider: 'invalid provider with space' },
        { provider: 'fal', verified: true, endpoint: '  https://fal.run  ', models: { image: '  flux-dev  ' }, key: '  sk-fal-secret-key-12345  ' },
        { provider: 'custom', verified: false, endpoint: 'http://localhost:8000', videoModel: 'my-model', key: 'sk-custom-secret' },
      ],
    })

    assert.equal(parsed.byokProviders.length, 2)
    assert.deepEqual(parsed.byokProviders[0], {
      provider: 'fal',
      verified: true,
      endpoint: 'https://fal.run',
      models: { image: 'flux-dev' },
    })
    assert.equal('key' in parsed.byokProviders[0], false)
    assert.deepEqual(parsed.byokProviders[1], {
      provider: 'custom',
      verified: false,
      endpoint: 'http://localhost:8000',
      videoModel: 'my-model',
    })
    assert.equal('key' in parsed.byokProviders[1], false)
  })
})
